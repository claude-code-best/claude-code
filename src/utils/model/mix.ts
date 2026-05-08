import { isEnvTruthy } from '../envUtils.js'
import { getSettings_DEPRECATED } from '../settings/settings.js'
import type { SettingsJson } from '../settings/types.js'
import { getAPIProvider, type APIProvider } from './providers.js'

export const MIX_MODE_ENV = 'CCB_MIX'

export const MODEL_FAMILIES = ['opus', 'sonnet', 'haiku'] as const

export type ModelFamily = (typeof MODEL_FAMILIES)[number]

export type MixedModelProvider = 'anthropic' | 'openai' | 'gemini' | 'grok'

type MixedModelConfig = NonNullable<
  NonNullable<SettingsJson['mixedModelConfigs']>[ModelFamily]
>

const MODEL_FAMILY_LABELS: Record<ModelFamily, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
}

const mixedEnvOriginalValues = new Map<string, string | undefined>()
let lastAppliedMixedEnvKeys = new Set<string>()

const MIXED_PROVIDER_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_BASE_URL',
  'GEMINI_DEFAULT_HAIKU_MODEL',
  'GEMINI_DEFAULT_OPUS_MODEL',
  'GEMINI_DEFAULT_SONNET_MODEL',
  'GEMINI_MODEL',
  'GEMINI_SMALL_FAST_MODEL',
  'GROK_API_KEY',
  'GROK_BASE_URL',
  'GROK_DEFAULT_HAIKU_MODEL',
  'GROK_DEFAULT_OPUS_MODEL',
  'GROK_DEFAULT_SONNET_MODEL',
  'GROK_MODEL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_DEFAULT_HAIKU_MODEL',
  'OPENAI_DEFAULT_OPUS_MODEL',
  'OPENAI_DEFAULT_SONNET_MODEL',
  'OPENAI_MODEL',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT_ID',
  'OPENAI_SMALL_FAST_MODEL',
  'XAI_API_KEY',
] as const

export function getModelFamilyLabel(family: ModelFamily): string {
  return MODEL_FAMILY_LABELS[family]
}

export function isModelFamily(value: string): value is ModelFamily {
  return (MODEL_FAMILIES as readonly string[]).includes(value)
}

export function normalizeModelFamily(value: string): ModelFamily | null {
  const normalized = value.trim().toLowerCase()
  return isModelFamily(normalized) ? normalized : null
}

export function providerToAPIProvider(
  provider: MixedModelProvider | undefined,
): APIProvider | undefined {
  if (!provider) return undefined
  if (provider === 'anthropic') return 'firstParty'
  return provider
}

export function isMixModeEnabled(
  settings: Pick<SettingsJson, 'mix'> = getSettings_DEPRECATED() || {},
): boolean {
  return settings.mix === true || isEnvTruthy(process.env[MIX_MODE_ENV])
}

export function getMixedModelConfig(
  family: ModelFamily,
  settings: Pick<
    SettingsJson,
    'mixedModelConfigs'
  > = getSettings_DEPRECATED() || {},
): MixedModelConfig | undefined {
  return settings.mixedModelConfigs?.[family]
}

export function getMixedModelEnv(
  family: ModelFamily,
  key: string,
  settings: Pick<
    SettingsJson,
    'mix' | 'mixedModelConfigs'
  > = getSettings_DEPRECATED() || {},
): string | undefined {
  if (!isMixModeEnabled(settings)) return undefined
  return getMixedModelConfig(family, settings)?.env?.[key]
}

export function getAPIProviderForModelFamily(
  family: ModelFamily,
  settings: Pick<
    SettingsJson,
    'mix' | 'mixedModelConfigs' | 'modelType'
  > = getSettings_DEPRECATED() || {},
): APIProvider {
  if (isMixModeEnabled(settings)) {
    const provider = providerToAPIProvider(
      getMixedModelConfig(family, settings)?.provider,
    )
    if (provider) return provider
  }
  return getAPIProvider(settings)
}

function stripModelTags(model: string): string {
  return model
    .toLowerCase()
    .replace(/\[1m\]$/i, '')
    .trim()
}

function getConfiguredModelEnvKeys(family: ModelFamily): string[] {
  const upper = family.toUpperCase()
  return [
    `ANTHROPIC_DEFAULT_${upper}_MODEL`,
    `OPENAI_DEFAULT_${upper}_MODEL`,
    `GEMINI_DEFAULT_${upper}_MODEL`,
    `GROK_DEFAULT_${upper}_MODEL`,
  ]
}

function modelMatchesConfiguredFamily(
  model: string,
  family: ModelFamily,
  settings: Pick<SettingsJson, 'mixedModelConfigs'>,
): boolean {
  const config = getMixedModelConfig(family, settings)
  if (!config?.env) return false
  const normalizedModel = stripModelTags(model)
  for (const key of getConfiguredModelEnvKeys(family)) {
    const configured = config.env[key]
    if (configured && stripModelTags(configured) === normalizedModel) {
      return true
    }
  }
  return false
}

export function getModelFamilyForModel(
  model: string,
  settings: Pick<
    SettingsJson,
    'mixedModelConfigs'
  > = getSettings_DEPRECATED() || {},
): ModelFamily | null {
  const normalizedModel = stripModelTags(model)
  if (normalizedModel.includes('opus')) return 'opus'
  if (normalizedModel.includes('sonnet')) return 'sonnet'
  if (normalizedModel.includes('haiku')) return 'haiku'

  for (const family of MODEL_FAMILIES) {
    if (modelMatchesConfiguredFamily(normalizedModel, family, settings)) {
      return family
    }
  }

  return null
}

export function getAPIProviderForModel(
  model: string,
  settings: Pick<
    SettingsJson,
    'mix' | 'mixedModelConfigs' | 'modelType'
  > = getSettings_DEPRECATED() || {},
): APIProvider {
  const family = getModelFamilyForModel(model, settings)
  if (family) return getAPIProviderForModelFamily(family, settings)
  return getAPIProvider(settings)
}

function rememberOriginalEnvValue(key: string): void {
  if (!mixedEnvOriginalValues.has(key)) {
    mixedEnvOriginalValues.set(key, process.env[key])
  }
}

function getKeysToManage(nextEnv: Record<string, string>): Set<string> {
  return new Set([
    ...MIXED_PROVIDER_ENV_KEYS,
    ...lastAppliedMixedEnvKeys,
    ...Object.keys(nextEnv),
  ])
}

function restorePreviousMixedEnv(): void {
  for (const key of lastAppliedMixedEnvKeys) {
    const originalValue = mixedEnvOriginalValues.get(key)
    if (originalValue === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = originalValue
    }
  }
  lastAppliedMixedEnvKeys = new Set()
}

export function applyMixedModelConfigForFamily(
  family: ModelFamily,
  settings: Pick<
    SettingsJson,
    'mix' | 'mixedModelConfigs'
  > = getSettings_DEPRECATED() || {},
): APIProvider | undefined {
  if (!isMixModeEnabled(settings)) return undefined
  const config = getMixedModelConfig(family, settings)
  if (!config) return undefined

  const env = config.env || {}
  const keysToManage = getKeysToManage(env)
  for (const key of keysToManage) {
    rememberOriginalEnvValue(key)
    const value = env[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  lastAppliedMixedEnvKeys = keysToManage

  return providerToAPIProvider(config.provider)
}

export function applyMixedModelConfigForModel(
  model: string,
  settings: Pick<
    SettingsJson,
    'mix' | 'mixedModelConfigs'
  > = getSettings_DEPRECATED() || {},
): APIProvider | undefined {
  if (!isMixModeEnabled(settings)) {
    restorePreviousMixedEnv()
    return undefined
  }
  const family = getModelFamilyForModel(model, settings)
  if (!family) {
    restorePreviousMixedEnv()
    return undefined
  }
  return applyMixedModelConfigForFamily(family, settings)
}

export function createMixedModelSettingsPatch(
  family: ModelFamily,
  provider: MixedModelProvider,
  env: Record<string, string>,
): Pick<SettingsJson, 'mix' | 'mixedModelConfigs'> {
  return {
    mix: true,
    mixedModelConfigs: {
      [family]: {
        provider,
        env,
      },
    },
  }
}
