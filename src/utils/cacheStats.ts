import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getClaudeConfigHomeDir } from './envUtils.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheUsage {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

export interface CacheStatsState {
  version: 1
  signature: string | null
  lastResetAt: number | null // ms epoch; reset when signature changes
  lastHitRate: number | null // persisted fallback
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Compute integer hit rate (0–100) or null if denominator is zero / input null.
 */
export function computeHitRate(u: CacheUsage | null): number | null {
  if (!u) return null
  const denom =
    u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens
  if (denom === 0) return null
  return Math.round((u.cache_read_input_tokens / denom) * 100)
}

/**
 * Stable string that uniquely identifies a usage snapshot.
 * A change in signature means a new API response arrived — reset the TTL clock.
 */
export function tokenSignature(u: CacheUsage): string {
  return `${u.input_tokens}|${u.cache_creation_input_tokens}|${u.cache_read_input_tokens}`
}

// ---------------------------------------------------------------------------
// State file I/O
// ---------------------------------------------------------------------------

/**
 * Deterministic, short file name derived from sessionId so that:
 *   - Different sessions never collide.
 *   - The raw session id is never written to disk.
 */
export function getStateFilePath(sessionId: string): string {
  const hash = createHash('sha256').update(sessionId).digest('hex').slice(0, 16)
  return join(getClaudeConfigHomeDir(), 'cache-stats', `${hash}.json`)
}

const INIT_STATE: CacheStatsState = {
  version: 1,
  signature: null,
  lastResetAt: null,
  lastHitRate: null,
}

function isValidState(obj: unknown): obj is CacheStatsState {
  if (typeof obj !== 'object' || obj === null) return false
  const s = obj as Record<string, unknown>
  return (
    s['version'] === 1 &&
    (s['signature'] === null || typeof s['signature'] === 'string') &&
    (s['lastResetAt'] === null || typeof s['lastResetAt'] === 'number') &&
    (s['lastHitRate'] === null || typeof s['lastHitRate'] === 'number')
  )
}

/**
 * Read state file. Returns init defaults on any error (corrupt, missing, etc.).
 */
export async function readState(filePath: string): Promise<CacheStatsState> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (isValidState(parsed)) return parsed
    return { ...INIT_STATE }
  } catch {
    return { ...INIT_STATE }
  }
}

/**
 * Write state atomically: write to a tmp file then rename — safe against
 * partial-write corruption and concurrent reads.
 */
export async function writeStateAtomic(
  filePath: string,
  state: CacheStatsState,
): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmp = `${filePath}.${process.pid}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(state), 'utf8')
    await rename(tmp, filePath)
  } catch {
    // Best-effort; silently ignore errors so the UI never crashes
  }
}
