import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { getProjectRoot } from '../bootstrap/state.js'
import { logForDebugging } from '../utils/debug.js'
import type { ProgressBus } from './progress/bus.js'
import type { ProgressStore, RunProgress } from './progress/store.js'

/** Current schema version of state.json; introduces a migration chain on upgrade. */
const SCHEMA_VERSION = 1
const STATE_FILE = 'state.json'
const STATE_TMP = 'state.json.tmp'

/**
 * Hard ceiling on persisted run directories on disk. Beyond this, the oldest runs (by updatedAt)
 * are pruned by cleanupOldRuns. Set generously above LOAD_PERSISTED_LIMIT so runs hidden from the
 * panel can still be resumed manually before aging out.
 */
const KEEP_MAX_RUNS = 50

/**
 * Single source for runsDir: shares the same root as ports.ts journalStore (${projectRoot}/.claude/workflow-runs).
 * Extracted as a function: eliminates duplicated path concatenation between ports.ts and persistence logic, staying in the same root when entering worktree/subdirectory.
 * Tests monkey-patch this function to point at a tmpdir.
 */
export function getRunsDir(): string {
  return join(getProjectRoot(), '.claude', 'workflow-runs')
}

type StateFile = {
  schemaVersion: number
  run: RunProgress
}

/**
 * Atomically overwrite the terminal RunProgress to <runsDir>/<runId>/state.json.
 * Atomicity: writeFile(tmp) → rename(tmp, target), rename is atomic; worst case leaves tmp, next write overwrites it.
 * Failure is best-effort: IO exceptions only log a warn, do not throw (workflow already succeeded; persistence failure only means it cannot be retrieved after restart).
 */
export async function writeRunState(
  runsDir: string,
  run: RunProgress,
): Promise<void> {
  const dir = join(runsDir, run.runId)
  const target = join(dir, STATE_FILE)
  const tmp = join(dir, STATE_TMP)
  const payload: StateFile = { schemaVersion: SCHEMA_VERSION, run }
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(tmp, JSON.stringify(payload), 'utf-8')
    await rename(tmp, target)
  } catch (e) {
    logForDebugging(
      `[workflow warn] writeRunState failed for ${run.runId}: ${(e as Error).message}`,
    )
  }
}

/**
 * Read <runsDir>/<runId>/state.json with fault tolerance:
 * - File does not exist → null (caller treats it as a miss)
 * - JSON parse failure / schema structure mismatch / schemaVersion mismatch → null (log warn, do not crash)
 */
export async function readRunState(
  runsDir: string,
  runId: string,
): Promise<RunProgress | null> {
  const target = join(runsDir, runId, STATE_FILE)
  let raw: string
  try {
    raw = await readFile(target, 'utf-8')
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StateFile>
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null
    const run = parsed.run
    if (!run || typeof run !== 'object') return null
    if (typeof run.runId !== 'string') return null
    if (typeof run.status !== 'string') return null
    return run as RunProgress
  } catch (e) {
    logForDebugging(
      `[workflow warn] readRunState parse failed for ${runId}: ${(e as Error).message}`,
    )
    return null
  }
}

/**
 * Scan all subdirectories under runsDir, read each state.json, return a list of non-null RunProgress.
 * - runsDir does not exist → empty array
 * - A subdirectory without state.json (half-written run) → skip
 * - A subdirectory whose state.json is corrupted → skip that single one, keep scanning the rest
 * - Sort by updatedAt descending (consistent with store.list() ordering)
 * - Optional limit: keep only the first N newest (used by loadPersistedRuns so the panel
 *   doesn't drown under months of history; full scan stays available by omitting the arg).
 */
export async function listPersistedRuns(
  runsDir: string,
  limit?: number,
): Promise<RunProgress[]> {
  let entries: string[]
  try {
    entries = await readdir(runsDir)
  } catch {
    return []
  }
  const runs: RunProgress[] = []
  for (const name of entries) {
    const run = await readRunState(runsDir, name)
    if (run) runs.push(run)
  }
  runs.sort((a, b) => b.updatedAt - a.updatedAt)
  return limit !== undefined && limit >= 0 ? runs.slice(0, limit) : runs
}

/**
 * Garbage-collect stale run directories: sort subdirs of runsDir by their state.json.updatedAt
 * (newest first), then recursively remove everything past keepMax. Subdirs without state.json are
 * treated as oldest (they're orphans — half-written, killed-mid-write, or pre-schema leftovers) so
 * they get pruned first.
 *
 * Best-effort: per-dir failures only log, do not abort the sweep. Safe to call repeatedly
 * (idempotent — once under the cap, it's a no-op).
 *
 * @returns number of directories actually removed.
 */
export async function cleanupOldRuns(
  runsDir: string,
  keepMax: number = KEEP_MAX_RUNS,
): Promise<number> {
  let entries: string[]
  try {
    entries = await readdir(runsDir)
  } catch {
    return 0
  }
  type Candidate = { name: string; updatedAt: number }
  const candidates: Candidate[] = []
  for (const name of entries) {
    const run = await readRunState(runsDir, name)
    // updatedAt=0 → orphan dir without parseable state.json; sorts first → pruned first.
    candidates.push({ name, updatedAt: run?.updatedAt ?? 0 })
  }
  // Newest first; orphans (updatedAt=0) sink to the tail and get pruned first.
  candidates.sort((a, b) => b.updatedAt - a.updatedAt)
  // Guard against negative keepMax: slice(-N) would invert semantics and keep N newest instead of
  // pruning them, which contradicts the contract. Clamp to 0 so a bad caller at worst wipes everything.
  const cap = Math.max(0, Math.trunc(keepMax))
  const victims = candidates.slice(cap)
  let removed = 0
  for (const v of victims) {
    try {
      await rm(join(runsDir, v.name), { recursive: true, force: true })
      removed++
    } catch (e) {
      logForDebugging(
        `[workflow warn] cleanupOldRuns failed to remove ${v.name}: ${(e as Error).message}`,
      )
    }
  }
  return removed
}

/**
 * Subscribe to the bus's run_done event and write the terminal RunProgress to state.json on disk.
 * Covers all three terminal states (completed/failed/killed; shutdown-kill also routes to run_done killed).
 * The store registers to the bus before this subscription, so when the listener runs store.get(runId) is already terminal.
 * Returns an unsubscribe function (for test cleanup).
 *
 * Disk write is best-effort: writeRunState swallows IO exceptions and only logs, does not propagate —
 * so other bus subscribers (store, etc.) are not affected by persistence failures.
 *
 * Also fires-and-forgets cleanupOldRuns so the runs directory stays bounded across long-lived
 * sessions (KEEP_MAX_RUNS). The cleanup runs *after* the new state is written, guaranteeing the
 * just-finished run is already on disk and counted as newest — never swept out from under itself.
 *
 * @param runsDirProvider Optional runsDir resolver (defaults to getRunsDir).
 *   Production path uses the default; tests inject a tmpdir to avoid writing to the real project directory (Bun ESM module namespace is read-only,
 *   cannot monkey-patch getRunsDir itself).
 */
export function attachRunStatePersistence(
  bus: ProgressBus,
  store: ProgressStore,
  runsDirProvider: () => string = getRunsDir,
): () => void {
  return bus.subscribe(event => {
    if (event.type !== 'run_done') return
    const run = store.get(event.runId)
    if (!run) return
    const dir = runsDirProvider()
    void writeRunState(dir, run).then(() => {
      // Sweep only after the new state lands on disk — avoids a race where the just-finished run
      // itself gets pruned because its state.json wasn't counted yet.
      void cleanupOldRuns(dir).catch(e => {
        logForDebugging(
          `[workflow warn] cleanupOldRuns after run_done threw: ${(e as Error).message}`,
        )
      })
    })
  })
}
