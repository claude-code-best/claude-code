/**
 * In-memory singleton that tracks cache hit-rate state for the current session.
 *
 * Call `onResponse(usage)` every time a new API response arrives.
 * The singleton compares the token signature of the new response against the
 * previously seen signature.  When it changes (= a new API call completed),
 * it resets `lastResetAt` to Date.now() and asynchronously persists state so
 * that a future session can show the TTL countdown immediately on startup.
 */

import type { CacheUsage, CacheStatsState } from './cacheStats.js'
import {
  computeHitRate,
  tokenSignature,
  getStateFilePath,
  readState,
  writeStateAtomic,
} from './cacheStats.js'

interface MemState {
  signature: string | null
  lastResetAt: number | null
  lastHitRate: number | null
}

let memState: MemState = {
  signature: null,
  lastResetAt: null,
  lastHitRate: null,
}

let sessionId: string | null = null

/**
 * Must be called once at session start so the singleton knows which state file
 * to persist to and can pre-load the last known state.
 */
export async function initCacheStatsState(sid: string): Promise<void> {
  sessionId = sid
  const filePath = getStateFilePath(sid)
  const persisted = await readState(filePath)
  // Pre-load persisted values so the UI can show fallback immediately
  memState = {
    signature: persisted.signature,
    lastResetAt: persisted.lastResetAt,
    lastHitRate: persisted.lastHitRate,
  }
}

/**
 * Called whenever a new assistant response is received with usage data.
 * Returns the updated in-memory state.
 */
export function onResponse(usage: CacheUsage): MemState {
  const sig = tokenSignature(usage)
  const hitRate = computeHitRate(usage)

  if (sig !== memState.signature) {
    // New API response — reset the TTL clock
    memState = {
      signature: sig,
      lastResetAt: Date.now(),
      lastHitRate: hitRate,
    }
    // Persist asynchronously; intentionally fire-and-forget
    if (sessionId !== null) {
      const filePath = getStateFilePath(sessionId)
      const toWrite: CacheStatsState = {
        version: 1,
        signature: sig,
        lastResetAt: memState.lastResetAt,
        lastHitRate: hitRate,
      }
      void writeStateAtomic(filePath, toWrite)
    }
  }

  return { ...memState }
}

/** Read current in-memory state without triggering a response update. */
export function getCacheStatsState(): MemState {
  return { ...memState }
}

/**
 * Reset singleton — used in tests to isolate test runs.
 */
export function _resetCacheStatsStateForTest(): void {
  memState = { signature: null, lastResetAt: null, lastHitRate: null }
  sessionId = null
}
