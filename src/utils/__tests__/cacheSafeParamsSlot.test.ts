/**
 * The slot holds the last main-session turn's CacheSafeParams (including the
 * full conversation history in forkContextMessages). It must never survive a
 * conversation boundary: /clear regenerates the session id and in-process
 * /resume switches it — in both cases a post-turn fork (/recap, SDK
 * side_question, SDK promptSuggestion) reading a stale snapshot would send
 * the previous conversation's history to the API.
 *
 * Uses the real bootstrap/state module (no mocks): regenerateSessionId and
 * switchSession are exactly what /clear and /resume call in production.
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  getSessionId,
  regenerateSessionId,
  switchSession,
} from 'src/bootstrap/state.js'
import { asSessionId } from 'src/types/ids.js'
import {
  getLastCacheSafeParams,
  saveCacheSafeParams,
} from 'src/utils/cacheSafeParamsSlot.js'
import type { CacheSafeParams } from 'src/utils/forkedAgent.js'

function makeParams(tag: string): CacheSafeParams {
  // Only identity matters for the slot; the shape is opaque to it.
  return { forkContextMessages: [tag] } as unknown as CacheSafeParams
}

beforeEach(() => {
  saveCacheSafeParams(null)
})

describe('saveCacheSafeParams / getLastCacheSafeParams', () => {
  test('returns the saved params within the same session', () => {
    const params = makeParams('same-session')
    saveCacheSafeParams(params)
    expect(getLastCacheSafeParams()).toBe(params)
    // Repeated reads keep returning it
    expect(getLastCacheSafeParams()).toBe(params)
  })

  test('returns null when nothing was saved', () => {
    expect(getLastCacheSafeParams()).toBeNull()
  })

  test('saving null clears the slot', () => {
    saveCacheSafeParams(makeParams('to-clear'))
    saveCacheSafeParams(null)
    expect(getLastCacheSafeParams()).toBeNull()
  })

  test('a later save overwrites an earlier one', () => {
    saveCacheSafeParams(makeParams('first'))
    const second = makeParams('second')
    saveCacheSafeParams(second)
    expect(getLastCacheSafeParams()).toBe(second)
  })

  test('snapshot is invalidated by /clear (regenerateSessionId)', () => {
    saveCacheSafeParams(makeParams('pre-clear'))
    regenerateSessionId()
    // Without the session-id check this returned the pre-clear conversation's
    // history, which /recap and SDK side_question then sent to the API.
    expect(getLastCacheSafeParams()).toBeNull()
  })

  test('snapshot is invalidated by in-process /resume (switchSession)', () => {
    saveCacheSafeParams(makeParams('session-a'))
    switchSession(asSessionId('00000000-0000-4000-8000-00000000resu'))
    expect(getLastCacheSafeParams()).toBeNull()
  })

  test('stale snapshot stays dropped even if the original session id returns', () => {
    const original = getSessionId()
    saveCacheSafeParams(makeParams('original-session'))
    switchSession(asSessionId('00000000-0000-4000-8000-0000000other'))
    expect(getLastCacheSafeParams()).toBeNull()
    // Switching back does not resurrect it — the read already released it.
    switchSession(original)
    expect(getLastCacheSafeParams()).toBeNull()
  })

  test('a save after the session switch is valid for the new session', () => {
    saveCacheSafeParams(makeParams('old'))
    regenerateSessionId()
    const fresh = makeParams('new-session')
    saveCacheSafeParams(fresh)
    expect(getLastCacheSafeParams()).toBe(fresh)
  })
})
