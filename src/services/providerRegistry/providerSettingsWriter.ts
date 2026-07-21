import { clearGrokClientCache } from '../api/grok/client.js'
import { removeChatGPTAuth } from '../api/openai/chatgptAuth.js'
import { clearOpenAIClientCache } from '../api/openai/client.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'
import {
  CHATGPT_CODEX_DEFAULT_MODEL,
  CHATGPT_CODEX_FAST_MODEL,
} from '../../utils/model/chatgptModels.js'
import { providerCredentialEnvName } from '../providerRuntime/resolveSnapshot.js'
import { writeProviderSecret } from './providerSecrets.js'
import type { ProviderProfile } from './types.js'

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
  credentialEnvName?: string
  credentialScheme?: 'api-key' | 'bearer'
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
    case 'anthropic': {
      const target =
        input.credentialScheme === 'bearer'
          ? 'ANTHROPIC_AUTH_TOKEN'
          : 'ANTHROPIC_API_KEY'
      setIfPresent(env, target, input.credential)
      setModelAliases(env, 'ANTHROPIC', input.models)
      applyCredentialOverride(env, input, target)
      return { modelType: 'anthropic', env }
    }
    case 'anthropic-compatible': {
      setIfPresent(env, 'ANTHROPIC_BASE_URL', input.baseUrl)
      const target =
        input.credentialScheme === 'api-key'
          ? 'ANTHROPIC_API_KEY'
          : 'ANTHROPIC_AUTH_TOKEN'
      setIfPresent(env, target, input.credential)
      setModelAliases(env, 'ANTHROPIC', input.models)
      applyCredentialOverride(env, input, target)
      return { modelType: 'anthropic', env }
    }
    case 'openai-compatible':
      env.OPENAI_AUTH_MODE = undefined
      setIfPresent(env, 'OPENAI_BASE_URL', input.baseUrl)
      setIfPresent(env, 'OPENAI_API_KEY', input.credential)
      setModelAliases(env, 'OPENAI', input.models)
      applyCredentialOverride(env, input, 'OPENAI_API_KEY')
      return { modelType: 'openai', env }
    case 'chatgpt':
      env.OPENAI_AUTH_MODE = 'chatgpt'
      env.OPENAI_BASE_URL = undefined
      env.OPENAI_API_KEY = undefined
      env.OPENAI_MODEL = undefined
      setModelAliases(
        env,
        'OPENAI',
        input.models.length > 0
          ? input.models
          : [CHATGPT_CODEX_FAST_MODEL, CHATGPT_CODEX_DEFAULT_MODEL],
      )
      return { modelType: 'openai', env }
    case 'gemini':
      setIfPresent(env, 'GEMINI_BASE_URL', input.baseUrl)
      setIfPresent(env, 'GEMINI_API_KEY', input.credential)
      setModelAliases(env, 'GEMINI', input.models)
      applyCredentialOverride(env, input, 'GEMINI_API_KEY')
      return { modelType: 'gemini', env }
    case 'grok':
      setIfPresent(env, 'GROK_BASE_URL', input.baseUrl)
      setIfPresent(env, 'GROK_API_KEY', input.credential)
      setIfPresent(env, 'GROK_MODEL', input.models[0])
      applyCredentialOverride(env, input, 'GROK_API_KEY')
      return { modelType: 'grok', env }
  }
}

function applyCredentialOverride(
  env: Record<string, string | undefined>,
  input: CompatibleProviderSettingsInput,
  canonicalName: string,
): void {
  const target = input.credentialEnvName
  if (!target || target === canonicalName || !input.credential?.trim()) return
  env[canonicalName] = undefined
  env[target] = input.credential.trim()
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

/** Save a decrypted provider credential only on the local Worker. */
export async function saveProviderCredentialSettings(
  input: { provider: ProviderProfile; credential: string },
  dependencies: ProviderSettingsWriterDependencies = defaultDependencies,
): Promise<ProviderSettingsPatch> {
  if (
    input.provider.auth.scheme !== 'api-key' &&
    input.provider.auth.scheme !== 'bearer'
  ) {
    throw new Error('provider_secret_method_unsupported')
  }
  if (
    input.provider.kind === 'chatgpt' ||
    input.provider.kind === 'bedrock' ||
    input.provider.kind === 'vertex' ||
    input.provider.kind === 'foundry'
  ) {
    throw new Error('provider_secret_method_unsupported')
  }
  // Persist the credential durably, keyed by provider id, BEFORE touching the
  // shared settings.json slots. This is the source of truth that survives a
  // restart and can't be clobbered by a sibling provider's save — the root
  // cause of "keys lost on restart". Best-effort: a store write failure must
  // not block the legacy settings write that makes the provider usable now.
  const envName = providerCredentialEnvName(input.provider)
  if (envName) {
    try {
      writeProviderSecret(input.provider.id, envName, input.credential)
    } catch {
      // Non-fatal — fall through to the settings write below.
    }
  }
  return saveCompatibleProviderSettings(
    {
      kind: input.provider.kind,
      ...(input.provider.baseUrl === undefined
        ? {}
        : { baseUrl: input.provider.baseUrl }),
      credential: input.credential,
      ...(input.provider.auth.envName === undefined
        ? {}
        : { credentialEnvName: input.provider.auth.envName }),
      credentialScheme: input.provider.auth.scheme,
      models: input.provider.models
        .filter(model => model.enabled && !model.archived)
        .map(model => model.remoteModelId),
    },
    dependencies,
  )
}
