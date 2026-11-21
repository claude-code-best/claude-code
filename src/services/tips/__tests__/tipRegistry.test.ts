/**
 * Tests for the getRelevantTips scheduling filters added in the official
 * 2.1.330 tips alignment:
 *   - maxLifetimeShows: a tip at its lifetime cap never comes back
 *   - providerAgnostic: third-party compat providers (OpenAI/Gemini/Grok)
 *     only see provider-agnostic built-in tips; custom tips are exempt
 *
 * Heavy dependency modules (config / settings / analytics) are mocked with
 * closure-driven impls (same pattern as poorMode.test.ts) so no disk or
 * network I/O happens.
 */
import { afterAll, beforeEach, describe, expect, test, mock } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

// Mock side-effect modules first
mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
mock.module('bun:bundle', () => ({ feature: () => false }))

let mockConfig: Record<string, unknown> = {
  numStartups: 7,
  tipsHistory: {},
  tipsShowCounts: {},
}
let mockSettings: Record<string, unknown> = {}

// Pre-import the real config module so the mock keeps every export the
// tipRegistry dependency chain needs (checkHasTrustDialogAccepted, …);
// only the two I/O-touching accessors are overridden. The query suffix
// bypasses any config mock a previous test file in this process installed
// (mock.module is global — see saveWorkspaceKey.test.ts).
const realConfigModulePath = 'src/utils/config.js?realConfigForTipRegistry'
const _realConfig = (await import(
  realConfigModulePath
)) as typeof import('src/utils/config.js')
mock.module('src/utils/config.ts', () => ({
  ..._realConfig,
  getGlobalConfig: () => mockConfig,
  saveGlobalConfig: (
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    mockConfig = updater(mockConfig)
  },
}))
// Mock auth.ts (AGENTS testing convention): is1PApiCustomer() throws without
// an API key env var. Override it (and the subscriber check it delegates to)
// with deterministic values; keep the rest of the real surface.
// NOTE: overrides must cover every auth entry point the tips chain calls
// (referral.ts / overageCreditGrant.ts call getOauthAccountInfo directly,
// and a spread mock does not rewire internal calls inside the real module).
const realAuthModulePath = 'src/utils/auth.js?realAuthForTipRegistry'
const _realAuth = (await import(
  realAuthModulePath
)) as typeof import('src/utils/auth.js')
mock.module('src/utils/auth.ts', () => ({
  ..._realAuth,
  getOauthAccountInfo: () => undefined,
  isAnthropicAuthEnabled: () => false,
  isClaudeAISubscriber: () => false,
  is1PApiCustomer: () => false,
}))
// Deterministic growthbook: value/dynamic-config getters return the default
// (the real one does this when no config is loaded; other test files mock it
// to return undefined, which leaks globally and breaks tips isRelevant —
// e.g. getDesktopUpsellConfig() would yield undefined).
const realGrowthbookModulePath =
  'src/services/analytics/growthbook.js?realGrowthbookForTipRegistry'
const _realGrowthbook = (await import(
  realGrowthbookModulePath
)) as typeof import('src/services/analytics/growthbook.js')
mock.module('src/services/analytics/growthbook.js', () => ({
  ..._realGrowthbook,
  getFeatureValue_CACHED_MAY_BE_STALE: (_key: string, defaultValue: unknown) =>
    defaultValue,
  getDynamicConfig_CACHED_MAY_BE_STALE: (_key: string, defaultValue: unknown) =>
    defaultValue,
}))
// Full-surface settings mock (see poorMode.test.ts) — tipRegistry's isRelevant
// callbacks call several settings accessors.
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
  updateSettingsForSource: () => ({ error: null }),
}))

afterAll(() => {
  mock.restore()
  delete process.env.CLAUDE_CODE_USE_OPENAI
  mockConfig = { numStartups: 7, tipsHistory: {}, tipsShowCounts: {} }
  mockSettings = {}
})

// Import the module under test AFTER the mocks are installed. The query
// suffix gives this file its own module instance (see poorMode.test.ts).
// (dynamic import via a variable — see poorMode.test.ts)
const tipRegistryModulePath = '../tipRegistry.js?tipRegistryTest'
const { getRelevantTips } = (await import(
  tipRegistryModulePath
)) as typeof import('../tipRegistry.js')

const relevantIds = async (): Promise<string[]> =>
  (await getRelevantTips(undefined)).map(tip => tip.id)

describe('getRelevantTips — maxLifetimeShows', () => {
  beforeEach(() => {
    // new-user-warmup (maxLifetimeShows: 3) is relevant while
    // numStartups < 10 and never shown.
    mockConfig = { numStartups: 7, tipsHistory: {}, tipsShowCounts: {} }
    mockSettings = {}
  })

  test('a fresh tip with a lifetime cap is included', async () => {
    const ids = await relevantIds()
    expect(ids).toContain('new-user-warmup')
  })

  test('a tip at its lifetime cap is filtered out permanently', async () => {
    mockConfig = {
      numStartups: 7,
      tipsHistory: {},
      tipsShowCounts: { 'new-user-warmup': 3 },
    }
    const ids = await relevantIds()
    expect(ids).not.toContain('new-user-warmup')
  })

  test('a tip below its lifetime cap still shows', async () => {
    mockConfig = {
      numStartups: 7,
      tipsHistory: {},
      tipsShowCounts: { 'new-user-warmup': 2 },
    }
    const ids = await relevantIds()
    expect(ids).toContain('new-user-warmup')
  })
})

describe('getRelevantTips — providerAgnostic gate', () => {
  beforeEach(() => {
    mockConfig = { numStartups: 7, tipsHistory: {}, tipsShowCounts: {} }
    mockSettings = {}
    delete process.env.CLAUDE_CODE_USE_OPENAI
  })

  test('non-provider-agnostic built-in tips show on the default provider', async () => {
    // install-github-app is relevant (no githubActionSetupCount) and does
    // not declare providerAgnostic.
    const ids = await relevantIds()
    expect(ids).toContain('install-github-app')
  })

  test('third-party compat providers only see provider-agnostic built-in tips', async () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    const tips = await getRelevantTips(undefined)
    const ids = tips.map(tip => tip.id)
    expect(ids).not.toContain('install-github-app')
    // Everything built-in that survived declares providerAgnostic.
    for (const tip of tips) {
      if (tip.id.startsWith('custom-tip-')) continue
      expect(tip.providerAgnostic).toBe(true)
    }
  })

  test('custom tips are exempt from the provider gate', async () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    mockSettings = { spinnerTipsOverride: { tips: ['my custom tip'] } }
    const tips = await getRelevantTips(undefined)
    expect(tips.map(tip => tip.id)).toContain('custom-tip-0')
  })
})
