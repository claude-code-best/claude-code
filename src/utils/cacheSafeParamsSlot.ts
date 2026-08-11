/**
 * Process-wide snapshot of the main loop's cache-safe params, written by
 * handleStopHooks after each main-session turn so post-turn forks
 * (/recap, SDK side_question, SDK promptSuggestion, /btw) can share the
 * parent's prompt cache without threading params through every caller.
 *
 * The snapshot is only valid for the conversation that wrote it. The session
 * id is captured at save time and checked at read time: /clear
 * (regenerateSessionId) and in-process /resume (switchSession) both change
 * the current session id, which invalidates the snapshot. Without the check,
 * a post-turn fork started after /clear or /resume would prepend the
 * previous conversation's full history (forkContextMessages) to its API
 * request and answer based on a conversation the user no longer sees.
 *
 * Kept in its own module (rather than forkedAgent.ts) so the slot can be
 * unit-tested without forkedAgent's heavy query-loop dependency chain.
 */
import { getSessionId } from '../bootstrap/state.js'
import type { SessionId } from '../types/ids.js'
import type { CacheSafeParams } from './forkedAgent.js'

let lastCacheSafeParams: CacheSafeParams | null = null
let savedSessionId: SessionId | null = null

export function saveCacheSafeParams(params: CacheSafeParams | null): void {
  lastCacheSafeParams = params
  savedSessionId = params === null ? null : getSessionId()
}

export function getLastCacheSafeParams(): CacheSafeParams | null {
  if (lastCacheSafeParams !== null && savedSessionId !== getSessionId()) {
    // Stale snapshot from a previous conversation — drop it eagerly so the
    // old message array can be GC'd instead of lingering until the next turn.
    lastCacheSafeParams = null
    savedSessionId = null
  }
  return lastCacheSafeParams
}
