import { afterAll, describe, expect, mock, test } from 'bun:test'
import type { AppState } from '../../state/AppStateStore.js'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'
import * as settingsModule from '../settings/settings.js'

mock.module('bun:bundle', () => ({
  feature: (_name: string) => true,
}))

// Mock log.ts / debug.ts to cut the bootstrap/state dependency chain
// (settings/settings.js pulls debug.ts → log.ts).
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// ── Settings mock (same pattern as tui.test.ts) ─────────────────────────────
// computeFocusAtStartup is pure (takes settings explicitly), but the lazy
// module mirror seeds from getInitialSettings() — mock it so the mirror
// tests are hermetic (no real settings.json reads).

let mockSettings: Record<string, unknown> = {}

mock.module('src/utils/settings/settings.js', () => ({
  loadManagedFileSettings: () => ({ settings: null, errors: [] }),
  getManagedFileSettingsPresence: () => ({
    hasBase: false,
    hasDropIns: false,
  }),
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
  updateSettingsForSource: () => ({ error: null }),
}))

afterAll(() => {
  mock.restore()
  mock.module('src/utils/settings/settings.js', () => settingsModule)
})

const {
  computeFocusAtStartup,
  getFocusViewActive,
  setFocusViewActive,
  isFocusViewActive,
  getEffectiveViewMode,
  _resetFocusViewForTesting,
} = await import('../focusView.js')

function fakeAppState(briefTranscript: boolean): AppState {
  return { briefTranscript } as unknown as AppState
}

describe('computeFocusAtStartup (official qat, L912387)', () => {
  test('viewMode "focus" wins over briefTranscript', () => {
    expect(
      computeFocusAtStartup({ viewMode: 'focus', briefTranscript: false }),
    ).toBe(true)
  })

  test('viewMode "default" wins over briefTranscript', () => {
    expect(
      computeFocusAtStartup({ viewMode: 'default', briefTranscript: true }),
    ).toBe(false)
  })

  test('viewMode "verbose" is not focus', () => {
    expect(computeFocusAtStartup({ viewMode: 'verbose' })).toBe(false)
  })

  test('falls back to briefTranscript when viewMode unset', () => {
    expect(computeFocusAtStartup({ briefTranscript: true })).toBe(true)
    expect(computeFocusAtStartup({ briefTranscript: false })).toBe(false)
  })

  test('defaults to false when both unset', () => {
    expect(computeFocusAtStartup({})).toBe(false)
  })
})

describe('isFocusViewActive / getEffectiveViewMode (official JBn/Yat)', () => {
  test('reads appState.briefTranscript as source of truth', () => {
    expect(isFocusViewActive(fakeAppState(true))).toBe(true)
    expect(isFocusViewActive(fakeAppState(false))).toBe(false)
  })

  test('getEffectiveViewMode maps to focus/default', () => {
    expect(getEffectiveViewMode(fakeAppState(true))).toBe('focus')
    expect(getEffectiveViewMode(fakeAppState(false))).toBe('default')
  })
})

describe('module mirror (system-prompt-facing)', () => {
  test('seeds lazily from settings', () => {
    _resetFocusViewForTesting()
    mockSettings = { viewMode: 'focus' }
    expect(getFocusViewActive()).toBe(true)

    _resetFocusViewForTesting()
    mockSettings = { briefTranscript: true }
    expect(getFocusViewActive()).toBe(true)

    _resetFocusViewForTesting()
    mockSettings = {}
    expect(getFocusViewActive()).toBe(false)
  })

  test('setFocusViewActive overrides the seed (used by /focus)', () => {
    _resetFocusViewForTesting()
    mockSettings = {}
    setFocusViewActive(true)
    expect(getFocusViewActive()).toBe(true)
    setFocusViewActive(false)
    expect(getFocusViewActive()).toBe(false)
    _resetFocusViewForTesting()
  })
})
