/**
 * Shared mocks for the `src/utils/model/` leaf modules that heavy import
 * chains (e.g. thinking.ts → model/model.ts → auth.ts → config.ts → …) pull
 * in. Use them via:
 *
 *   import { antModelsMock, modelMock, modelSupportOverridesMock, providersMock } from '../../tests/mocks/model'
 *   mock.module('src/utils/model/model.js', modelMock)
 *   mock.module('src/utils/model/antModels.js', antModelsMock)
 *   mock.module('src/utils/model/providers.js', providersMock)
 *   mock.module('src/utils/model/modelSupportOverrides.js', modelSupportOverridesMock)
 *
 * Always extend here rather than inlining a different shape per test, so the
 * surfaces stay consistent when the modules' exports change. NOTE: keep these
 * COMPLETE-enough for any test file in the same `bun test` invocation — bun
 * registers mock.module process-globally and loads every test file before
 * running any test, so an incomplete mock breaks OTHER files whose import
 * chains statically import a missing name.
 */

/**
 * Mock for src/utils/model/model.ts. Identity-flavored: canonical names pass
 * through unchanged so display/parse round-trips behave like the real thing.
 */
export const modelMock = () => ({
  getSmallFastModel: () => 'claude-haiku-4-5',
  isNonCustomOpusModel: () => false,
  getUserSpecifiedModelSetting: () => undefined,
  getMainLoopModel: () => 'claude-sonnet-4-6',
  getBestModel: () => 'claude-opus-4-7',
  getDefaultOpusModel: () => 'claude-opus-4-7',
  getDefaultSonnetModel: () => 'claude-sonnet-4-6',
  getDefaultHaikuModel: () => 'claude-haiku-4-5',
  getRuntimeMainLoopModel: () => 'claude-sonnet-4-6',
  getDefaultMainLoopModelSetting: () => 'claude-sonnet-4-6',
  getDefaultMainLoopModel: () => 'claude-sonnet-4-6',
  firstPartyNameToCanonical: (name: string) => name,
  getCanonicalName: (name: string) => name,
  getClaudeAiUserDefaultModelDescription: () => 'Claude Sonnet 4.6',
  renderDefaultModelSetting: (setting: string) => setting,
  getOpusPricingSuffix: () => '',
  isOpus1mMergeEnabled: () => false,
  renderModelSetting: (setting: string) => setting,
  getPublicModelDisplayName: () => null,
  renderModelName: (name: string) => name,
  getPublicModelName: (name: string) => name,
  parseUserSpecifiedModel: (model: string) => model,
  resolveSkillModelOverride: () => undefined,
  isLegacyModelRemapEnabled: () => false,
  modelDisplayString: (model: string) => model,
  getMarketingNameForModel: (modelId: string) => modelId,
  normalizeModelStringForAPI: (model: string) => model,
})

/** Mock for src/utils/model/antModels.ts (no ant overrides by default). */
export const antModelsMock = () => ({
  getAntModelOverrideConfig: () => undefined,
  getAntModels: () => [],
  resolveAntModel: () => undefined,
})

/** Mock for src/utils/model/providers.ts (firstParty by default). */
export const providersMock = () => ({
  getAPIProvider: () => 'firstParty',
  getAPIProviderForStatsig: () => 'firstParty',
  isFirstPartyAnthropicBaseUrl: () => true,
  isThirdPartyAPIProvider: () => false,
})

/** Mock for src/utils/model/modelSupportOverrides.ts (no overrides). */
export const modelSupportOverridesMock = () => ({
  get3PModelCapabilityOverride: () => undefined,
})
