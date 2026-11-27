/**
 * Shared mock for src/utils/settings/settings.ts
 *
 * Provides the COMPLETE export surface of the real settings module (a bare
 * `mock.module('src/utils/settings/settings.js', ...)` with only a few
 * exports breaks any other test file in the same `bun test` invocation whose
 * import chain statically imports a missing name — bun registers mock.module
 * process-globally and loads every test file before running any test).
 *
 * Usage:
 *   import { settingsMock, setMockSettings } from '../../../tests/mocks/settings'
 *   mock.module('src/utils/settings/settings.js', settingsMock)
 *
 * - All settings readers return the mutable `mockSettings` object (seed it
 *   with setMockSettings; defaults to {}).
 * - getWorkflowKeywordTriggerEnabled mirrors the real default-true semantics
 *   so keyword-trigger gating can be controlled via
 *   setMockSettings({ workflowKeywordTriggerEnabled: false }).
 *
 * Must be called via mock.module BEFORE any import that transitively depends
 * on settings.ts. Exported as a factory so each call produces a fresh object
 * (mock.module requirement, same as tests/mocks/log.ts).
 */

let mockSettings: Record<string, unknown> = {}

/** Seed what the mocked settings readers return (readers share one object). */
export function setMockSettings(settings: Record<string, unknown>): void {
  mockSettings = settings
}

/** The object all mocked settings readers currently return. */
export function getMockSettings(): Record<string, unknown> {
  return mockSettings
}

export function settingsMock() {
  return {
    loadManagedFileSettings: () => ({ settings: null, errors: [] }),
    getManagedFileSettingsPresence: () => ({
      hasBase: false,
      hasDropIns: false,
    }),
    parseSettingsFile: () => ({ settings: null, errors: [] }),
    getSettingsRootPathForSource: () => '',
    getSettingsFilePathForSource: () => undefined,
    getRelativeSettingsFilePathForSource: () => '',
    getSettingsForSource: () => mockSettings,
    getPolicySettingsOrigin: () => null,
    updateSettingsForSource: () => ({ error: null }),
    settingsMergeCustomizer: () => undefined,
    getManagedSettingsKeysForLogging: () => [],
    getInitialSettings: () => mockSettings,
    getSettings_DEPRECATED: () => mockSettings,
    getSettingsWithSources: () => ({
      effective: mockSettings,
      sources: [],
    }),
    getSettingsWithErrors: () => ({ settings: mockSettings, errors: [] }),
    hasSkipDangerousModePermissionPrompt: () => false,
    hasAutoModeOptIn: () => true,
    // Mirrors the real getter's default-true, any-source-false semantics so
    // the workflow keyword trigger gate stays controllable via mockSettings.
    getWorkflowKeywordTriggerEnabled: () =>
      mockSettings.workflowKeywordTriggerEnabled !== false,
    getUseAutoModeDuringPlan: () => true,
    getAutoModeConfig: () => undefined,
    rawSettingsContainsKey: (key: string) => key in mockSettings,
  }
}
