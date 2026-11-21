/**
 * Tests for tipHistory.ts — cooldown bookkeeping (tipsHistory) and the
 * lifetime show counter (tipsShowCounts) backing Tip.maxLifetimeShows.
 *
 * config.ts is mocked with closure-driven impls (same pattern as
 * saveWorkspaceKey.test.ts) so no disk I/O happens.
 */
import { afterAll, beforeEach, describe, expect, test, mock } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// Mock side-effect modules first
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

let mockConfig: Record<string, unknown> = {
  numStartups: 5,
  tipsHistory: {},
  tipsShowCounts: {},
}

mock.module('src/utils/config.ts', () => ({
  getGlobalConfig: () => mockConfig,
  saveGlobalConfig: (
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    mockConfig = updater(mockConfig)
  },
}))

afterAll(() => {
  mock.restore()
  mockConfig = { numStartups: 5, tipsHistory: {}, tipsShowCounts: {} }
})

// Import the module under test AFTER the mocks are installed
import {
  getSessionsSinceLastShown,
  getTipShowCount,
  recordTipShown,
} from '../tipHistory.js'

describe('recordTipShown', () => {
  beforeEach(() => {
    mockConfig = { numStartups: 5, tipsHistory: {}, tipsShowCounts: {} }
  })

  test('records the current session and increments the lifetime count', () => {
    recordTipShown('voice-mode')
    expect(mockConfig.tipsHistory).toEqual({ 'voice-mode': 5 })
    expect(mockConfig.tipsShowCounts).toEqual({ 'voice-mode': 1 })
  })

  test('second show in a later session bumps both', () => {
    recordTipShown('voice-mode')
    mockConfig = { ...mockConfig, numStartups: 12 }
    recordTipShown('voice-mode')
    expect(mockConfig.tipsHistory).toEqual({ 'voice-mode': 12 })
    expect(mockConfig.tipsShowCounts).toEqual({ 'voice-mode': 2 })
  })

  test('recording twice in the same session is deduped (one lifetime show)', () => {
    recordTipShown('no-flicker')
    recordTipShown('no-flicker')
    expect(mockConfig.tipsHistory).toEqual({ 'no-flicker': 5 })
    expect(mockConfig.tipsShowCounts).toEqual({ 'no-flicker': 1 })
  })

  test('works against persisted configs that predate tipsShowCounts', () => {
    // Old config files have tipsHistory but no tipsShowCounts key at all.
    mockConfig = { numStartups: 3, tipsHistory: { 'old-tip': 1 } }
    recordTipShown('old-tip')
    expect(mockConfig.tipsHistory).toEqual({ 'old-tip': 3 })
    expect(mockConfig.tipsShowCounts).toEqual({ 'old-tip': 1 })
  })
})

describe('getSessionsSinceLastShown', () => {
  test('returns Infinity for never-shown tips', () => {
    expect(getSessionsSinceLastShown('never-shown')).toBe(Infinity)
  })

  test('returns the gap to the last shown session', () => {
    mockConfig = { numStartups: 10, tipsHistory: { tip: 4 } }
    expect(getSessionsSinceLastShown('tip')).toBe(6)
  })
})

describe('getTipShowCount', () => {
  test('returns 0 when never shown', () => {
    mockConfig = { numStartups: 1, tipsHistory: {}, tipsShowCounts: {} }
    expect(getTipShowCount('fresh-tip')).toBe(0)
  })

  test('returns the persisted lifetime count', () => {
    mockConfig = { numStartups: 1, tipsHistory: {}, tipsShowCounts: { tip: 3 } }
    expect(getTipShowCount('tip')).toBe(3)
  })

  test('returns 0 when tipsShowCounts is absent (legacy config)', () => {
    mockConfig = { numStartups: 1, tipsHistory: {} }
    expect(getTipShowCount('tip')).toBe(0)
  })
})
