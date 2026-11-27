/**
 * Tests for /scroll-speed — executeScrollSpeed argument handling, settings
 * persistence via updateSettingsForSource, and the
 * CLAUDE_CODE_SCROLL_SPEED env-override conflict notes.
 *
 * settings / analytics are mocked with closure-driven impls (same pattern
 * as poorMode.test.ts) so no disk or network I/O happens.
 */
import { afterAll, beforeEach, describe, expect, test, mock } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// Mock side-effect modules first
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

let mockSettings: Record<string, unknown> = {}
let lastUpdate: { source: string; patch: Record<string, unknown> } | null = null
const loggedEvents: Array<{ name: string; metadata: Record<string, unknown> }> =
  []

mock.module('src/utils/settings/settings.js', () => ({
  loadManagedFileSettings: () => ({ settings: null, errors: [] }),
  getManagedFileSettingsPresence: () => ({ hasBase: false, hasDropIns: false }),
  parseSettingsFile: () => ({ settings: null, errors: [] }),
  getSettingsRootPathForSource: () => '',
  getSettingsFilePathForSource: () => undefined,
  getRelativeSettingsFilePathForSource: () => '',
  getInitialSettings: () => mockSettings,
  getSettingsForSource: () => mockSettings,
  getPolicySettingsOrigin: () => null,
  getSettingsWithErrors: () => ({ settings: mockSettings, errors: [] }),
  getSettingsWithSources: () => ({ effective: mockSettings, sources: [] }),
  getSettings_DEPRECATED: () => mockSettings,
  settingsMergeCustomizer: () => undefined,
  getManagedSettingsKeysForLogging: () => [],
  hasAutoModeOptIn: () => true,
  hasSkipDangerousModePermissionPrompt: () => false,
  getAutoModeConfig: () => undefined,
  getUseAutoModeDuringPlan: () => true,
  rawSettingsContainsKey: (key: string) => key in mockSettings,
  updateSettingsForSource: (
    source: string,
    patch: Record<string, unknown>,
  ): { error: Error | null } => {
    lastUpdate = { source, patch }
    mockSettings = { ...mockSettings, ...patch }
    return { error: null }
  },
}))
mock.module('src/services/analytics/index.js', () => ({
  logEvent: (name: string, metadata: Record<string, unknown>) => {
    loggedEvents.push({ name, metadata })
  },
}))

afterAll(() => {
  mock.restore()
  delete process.env.CLAUDE_CODE_SCROLL_SPEED
  mockSettings = {}
  lastUpdate = null
  loggedEvents.length = 0
})

// Import the module under test AFTER the mocks are installed
import { executeScrollSpeed, showCurrentScrollSpeed } from '../scrollSpeed.js'

describe('executeScrollSpeed', () => {
  beforeEach(() => {
    mockSettings = {}
    lastUpdate = null
    loggedEvents.length = 0
    delete process.env.CLAUDE_CODE_SCROLL_SPEED
  })

  test('a numeric value persists to userSettings.scrollSpeed', () => {
    const result = executeScrollSpeed('3')
    expect(lastUpdate).toEqual({
      source: 'userSettings',
      patch: { scrollSpeed: 3 },
    })
    expect(mockSettings.scrollSpeed).toBe(3)
    expect(result.message).toContain('Scroll speed set to 3')
    expect(loggedEvents[0]?.metadata).toMatchObject({ speed: 3 })
  })

  test('values are clamped to the 1-20 range', () => {
    expect(executeScrollSpeed('25').message).toContain('Scroll speed set to 20')
    expect(executeScrollSpeed('0').message).toContain('Invalid argument')
  })

  test('default clears the persisted setting', () => {
    mockSettings = { scrollSpeed: 5 }
    const result = executeScrollSpeed('default')
    expect(lastUpdate?.patch).toEqual({ scrollSpeed: undefined })
    expect(result.message).toContain('reset to default (1 row per wheel event)')
  })

  test('status shows the effective speed from settings', () => {
    mockSettings = { scrollSpeed: 4 }
    expect(showCurrentScrollSpeed().message).toContain(
      'Current scroll speed: 4',
    )
  })

  test('env var override is flagged when it conflicts with the new value', () => {
    process.env.CLAUDE_CODE_SCROLL_SPEED = '2'
    const result = executeScrollSpeed('5')
    // Settings still persist…
    expect(mockSettings.scrollSpeed).toBe(5)
    // …but the message reports the env override.
    expect(result.message).toContain('CLAUDE_CODE_SCROLL_SPEED=2')
    expect(result.message).toContain('overrides it')
  })

  test('env var matching the requested value does not warn', () => {
    process.env.CLAUDE_CODE_SCROLL_SPEED = '5'
    const result = executeScrollSpeed('5')
    expect(result.message).not.toContain('overrides it')
    expect(result.message).toContain('Scroll speed set to 5')
  })

  test('status reports the env override', () => {
    process.env.CLAUDE_CODE_SCROLL_SPEED = '2'
    mockSettings = { scrollSpeed: 5 }
    expect(showCurrentScrollSpeed().message).toContain(
      'Current scroll speed: 2',
    )
    expect(showCurrentScrollSpeed().message).toContain(
      'CLAUDE_CODE_SCROLL_SPEED=2',
    )
  })

  test('invalid arguments produce a usage hint', () => {
    const result = executeScrollSpeed('bogus')
    expect(result.message).toContain('Invalid argument: bogus')
    expect(result.message).toContain('1-20, default, status')
  })

  test('help lists the value range and the env override', () => {
    const result = executeScrollSpeed('--help')
    expect(result.message).toContain(
      'Usage: /scroll-speed [1-20|default|status]',
    )
    expect(result.message).toContain('CLAUDE_CODE_SCROLL_SPEED')
  })
})
