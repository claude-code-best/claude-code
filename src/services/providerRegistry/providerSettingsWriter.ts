import { clearGrokClientCache } from '../api/grok/client.js'
import { removeChatGPTAuth } from '../api/openai/chatgptAuth.js'
import { clearOpenAIClientCache } from '../api/openai/client.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'

export type CompatibleProviderSettingsInput = {
  kind:
    | 'anthropic'
    | 'anthropic-compatible'
    | 'openai-compatible'
    | 'chatgpt'
    | 'gemini'
    | 'grok'
  baseUrl?: string
  credential?: string
  models: string[]
}

export type ProviderSettingsPatch = {
  modelType: 'anthropic' | 'openai' | 'gemini' | 'grok'
  env: Record<string, string | undefined>
}

export type ProviderSettingsWriterDependencies = {
  env: Record<string, string | undefined>
  update: (
    source: 'userSettings',
    patch: ProviderSettingsPatch,
  ) => { error: Error | null }
  clearOpenAI: () => void
  clearGrok: () => void
  removeChatGPT: () => Promise<void>
}

const PROVIDER_FLAGS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_GROK',
] as const

const defaultDependencies: ProviderSettingsWriterDependencies = {
  env: process.env,
  update: (source, patch) =>
    updateSettingsForSource(
      source,
      patch as unknown as Parameters<typeof updateSettingsForSource>[1],
    ),
  clearOpenAI: clearOpenAIClientCache,
  clearGrok: clearGrokClientCache,
  removeChatGPT: removeChatGPTAuth,
}

function setIfPresent(
  env: Record<string, string | undefined>,
  key: string,
  value: string | undefined,
): void {
  if (value?.trim()) env[key] = value.trim()
}

function setModelAliases(
  env: Record<string, string | undefined>,
  prefix: 'ANTHROPIC' | 'OPENAI' | 'GEMINI',
  models: string[],
): void {
  const haiku = models[0]
  const sonnet = models[1] ?? haiku
  const opus = models[2] ?? sonnet
  setIfPresent(env, `${prefix}_DEFAULT_HAIKU_MODEL`, haiku)
  setIfPresent(env, `${prefix}_DEFAULT_SONNET_MODEL`, sonnet)
  setIfPresent(env, `${prefix}_DEFAULT_OPUS_MODEL`, opus)
}

function validateBaseUrl(baseUrl: string | undefined): void {
  if (!baseUrl?.trim()) return
  try {
    new URL(baseUrl)
  } catch {
    throw new Error('invalid provider base URL')
  }
}

function buildPatch(
  input: CompatibleProviderSettingsInput,
): ProviderSettingsPatch {
  validateBaseUrl(input.baseUrl)
  const env: Record<string, string | undefined> = {}
  for (const flag of PROVIDER_FLAGS) env[flag] = undefined

  switch (input.kind) {
    case 'anthropic':
      return { modelType: 'anthropic', env }
    case 'anthropic-compatible':
      setIfPresent(env, 'ANTHROPIC_BASE_URL', input.baseUrl)
      setIfPresent(env, 'ANTHROPIC_AUTH_TOKEN', input.credential)
      setModelAliases(env, 'ANTHROPIC', input.models)
      return { modelType: 'anthropic', env }
    case 'openai-compatible':
      env.OPENAI_AUTH_MODE = undefined
      setIfPresent(env, 'OPENAI_BASE_URL', input.baseUrl)
      setIfPresent(env, 'OPENAI_API_KEY', input.credential)
      setModelAliases(env, 'OPENAI', input.models)
      return { modelType: 'openai', env }
    case 'chatgpt':
      env.OPENAI_AUTH_MODE = 'chatgpt'
      setModelAliases(env, 'OPENAI', input.models)
      return { modelType: 'openai', env }
    case 'gemini':
      setIfPresent(env, 'GEMINI_BASE_URL', input.baseUrl)
      setIfPresent(env, 'GEMINI_API_KEY', input.credential)
      setModelAliases(env, 'GEMINI', input.models)
      return { modelType: 'gemini', env }
    case 'grok':
      setIfPresent(env, 'GROK_BASE_URL', input.baseUrl)
      setIfPresent(env, 'GROK_API_KEY', input.credential)
      setIfPresent(env, 'GROK_MODEL', input.models[0])
      return { modelType: 'grok', env }
  }
}

function applyEnvironmentPatch(
  target: Record<string, string | undefined>,
  patch: Record<string, string | undefined>,
): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete target[key]
    else target[key] = value
  }
}

/** Persist provider settings before changing process state or client caches. */
export async function saveCompatibleProviderSettings(
  input: CompatibleProviderSettingsInput,
  dependencies: ProviderSettingsWriterDependencies = defaultDependencies,
): Promise<ProviderSettingsPatch> {
  const patch = buildPatch(input)
  const { error } = dependencies.update('userSettings', patch)
  if (error !== null) throw error

  applyEnvironmentPatch(dependencies.env, patch.env)
  if (input.kind === 'openai-compatible' || input.kind === 'chatgpt') {
    dependencies.clearOpenAI()
  }
  if (input.kind === 'grok') dependencies.clearGrok()
  if (input.kind === 'openai-compatible') {
    await dependencies.removeChatGPT().catch(() => undefined)
  }
  return patch
}
