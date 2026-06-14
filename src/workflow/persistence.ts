import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
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
 */
export async function listPersistedRuns(
  runsDir: string,
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
  return runs.sort((a, b) => b.updatedAt - a.updatedAt)
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
    void writeRunState(runsDirProvider(), run)
  })
}
