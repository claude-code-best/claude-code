/**
 * Tests for tipScheduler.ts — selection ordering (sessions-since-shown with
 * priority tie-break) and the recordShownTip analytics payload.
 *
 * Heavy dependency modules (config / settings / analytics) are mocked with
 * closure-driven impls so no disk or network I/O happens.
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
let mockSettings: Record<string, unknown> = {}
const loggedEvents: Array<{ name: string; metadata: Record<string, unknown> }> =
  []

mock.module('src/utils/config.ts', () => ({
  getGlobalConfig: () => mockConfig,
  saveGlobalConfig: (
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    mockConfig = updater(mockConfig)
  },
}))
mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => mockSettings,
  getSettings_DEPRECATED: () => mockSettings,
}))
mock.module('src/services/analytics/index.js', () => ({
  logEvent: (name: string, metadata: Record<string, unknown>) => {
    loggedEvents.push({ name, metadata })
  },
}))

afterAll(() => {
  mock.restore()
  mockConfig = { numStartups: 5, tipsHistory: {}, tipsShowCounts: {} }
  mockSettings = {}
  loggedEvents.length = 0
})

// Import the module under test AFTER the mocks are installed
import {
  recordShownTip,
  selectTipWithLongestTimeSinceShown,
} from '../tipScheduler.js'
import type { Tip } from '../types.js'

function makeTip(overrides: Partial<Tip> & { id: string }): Tip {
  return {
    content: async () => 'tip content',
    cooldownSessions: 1,
    ...overrides,
  }
}

describe('selectTipWithLongestTimeSinceShown', () => {
  beforeEach(() => {
    mockConfig = { numStartups: 10, tipsHistory: {}, tipsShowCounts: {} }
  })

  test('returns undefined for an empty candidate set', () => {
    expect(selectTipWithLongestTimeSinceShown([])).toBeUndefined()
  })

  test('returns the single candidate directly', () => {
    const only = makeTip({ id: 'only' })
    expect(selectTipWithLongestTimeSinceShown([only])?.id).toBe('only')
  })

  test('picks the tip with the longest time since last shown', () => {
    mockConfig = {
      numStartups: 10,
      tipsHistory: { recent: 8, stale: 2 },
      tipsShowCounts: {},
    }
    const recent = makeTip({ id: 'recent' })
    const stale = makeTip({ id: 'stale' })
    expect(selectTipWithLongestTimeSinceShown([recent, stale])?.id).toBe(
      'stale',
    )
  })

  test('breaks ties by ascending priority (lower number first)', () => {
    // Both never shown → both Infinity sessions since shown → tie.
    const low = makeTip({ id: 'low', priority: 1 })
    const high = makeTip({ id: 'high', priority: 5 })
    expect(selectTipWithLongestTimeSinceShown([high, low])?.id).toBe('low')
  })

  test('undefined priority ranks after any defined priority', () => {
    const defined = makeTip({ id: 'defined', priority: 3 })
    const undefined1 = makeTip({ id: 'undefined1' })
    const undefined2 = makeTip({ id: 'undefined2' })
    // All never shown (tie) — defined priority wins over undefined ones.
    expect(
      selectTipWithLongestTimeSinceShown([undefined1, defined, undefined2])?.id,
    ).toBe('defined')
  })

  test('a clearly staler tip still beats a higher-priority fresher tip', () => {
    mockConfig = {
      numStartups: 10,
      tipsHistory: { fresh: 9 },
      tipsShowCounts: {},
    }
    const fresh = makeTip({ id: 'fresh', priority: 1 })
    const stale = makeTip({ id: 'stale' })
    expect(selectTipWithLongestTimeSinceShown([fresh, stale])?.id).toBe('stale')
  })
})

describe('recordShownTip', () => {
  beforeEach(() => {
    mockConfig = { numStartups: 7, tipsHistory: {}, tipsShowCounts: {} }
    loggedEvents.length = 0
  })

  test('records history + lifetime count and logs the new metadata fields', () => {
    const tip = makeTip({
      id: 'voice-mode',
      cooldownSessions: 10,
      maxLifetimeShows: 3,
      advertisedCommand: 'voice',
      priority: 1,
    })
    recordShownTip(tip)

    expect(mockConfig.tipsHistory).toEqual({ 'voice-mode': 7 })
    expect(mockConfig.tipsShowCounts).toEqual({ 'voice-mode': 1 })

    expect(loggedEvents).toHaveLength(1)
    const event = loggedEvents[0]
    expect(event?.name).toBe('tengu_tip_shown')
    // Command names are strings — logged as a boolean flag only.
    expect(event?.metadata).toMatchObject({
      cooldownSessions: 10,
      maxLifetimeShows: 3,
      priority: 1,
      hasAdvertisedCommand: true,
    })
  })

  test('tips without the new fields log undefined/absent values', () => {
    recordShownTip(makeTip({ id: 'plain', cooldownSessions: 2 }))
    const metadata = loggedEvents[0]?.metadata
    expect(metadata).toMatchObject({
      cooldownSessions: 2,
      hasAdvertisedCommand: false,
    })
    expect(metadata?.maxLifetimeShows).toBeUndefined()
    expect(metadata?.priority).toBeUndefined()
  })
})
