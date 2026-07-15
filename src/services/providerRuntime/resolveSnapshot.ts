import type { APIProvider } from '../../utils/model/providers.js'
import type {
  ProviderConfigurationV2,
  ProviderKind,
  ProviderProfile,
} from '../providerRegistry/types.js'
import {
  ProviderRuntimeResolutionError,
  type ProviderRuntimeSelection,
  type ProviderRuntimeSnapshot,
} from './types.js'

export const API_PROVIDER_BY_KIND: Record<ProviderKind, APIProvider> = {
  anthropic: 'firstParty',
  'anthropic-compatible': 'firstParty',
  'openai-compatible': 'openai',
  chatgpt: 'openai',
  gemini: 'gemini',
  grok: 'grok',
  bedrock: 'bedrock',
  vertex: 'vertex',
  foundry: 'foundry',
}

const PROVIDER_ENVIRONMENT_KEYS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_GROK',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'OPENAI_AUTH_MODE',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_DEFAULT_HAIKU_MODEL',
  'OPENAI_DEFAULT_SONNET_MODEL',
  'OPENAI_DEFAULT_OPUS_MODEL',
  'GEMINI_BASE_URL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_DEFAULT_HAIKU_MODEL',
  'GEMINI_DEFAULT_SONNET_MODEL',
  'GEMINI_DEFAULT_OPUS_MODEL',
  'GROK_BASE_URL',
  'GROK_API_KEY',
  'XAI_API_KEY',
  'GROK_MODEL',
] as const

export type ResolveSnapshotOptions = {
  isModelAllowed?: (model: string) => boolean
}

function credentialTarget(provider: ProviderProfile): string | undefined {
  switch (provider.kind) {
    case 'anthropic':
    case 'anthropic-compatible':
      if (provider.auth.scheme === 'bearer') return 'ANTHROPIC_AUTH_TOKEN'
      if (provider.auth.scheme === 'api-key') return 'ANTHROPIC_API_KEY'
      return undefined
    case 'openai-compatible':
      return provider.auth.scheme === 'api-key' ||
        provider.auth.scheme === 'bearer'
        ? 'OPENAI_API_KEY'
        : undefined
    case 'gemini':
      return provider.auth.scheme === 'api-key' ? 'GEMINI_API_KEY' : undefined
    case 'grok':
      return provider.auth.scheme === 'api-key' ? 'GROK_API_KEY' : undefined
    case 'chatgpt':
    case 'bedrock':
    case 'vertex':
    case 'foundry':
      return undefined
  }
}

function buildEnvironmentTemplate(
  provider: ProviderProfile,
  resolvedModelId: string,
): Record<string, string | undefined> {
  switch (provider.kind) {
    case 'anthropic':
    case 'anthropic-compatible':
      return {
        ...(provider.baseUrl === undefined
          ? {}
          : { ANTHROPIC_BASE_URL: provider.baseUrl }),
        ANTHROPIC_MODEL: resolvedModelId,
      }
    case 'openai-compatible':
      return {
        CLAUDE_CODE_USE_OPENAI: '1',
        ...(provider.baseUrl === undefined
          ? {}
          : { OPENAI_BASE_URL: provider.baseUrl }),
        OPENAI_MODEL: resolvedModelId,
      }
    case 'chatgpt':
      return {
        CLAUDE_CODE_USE_OPENAI: '1',
        OPENAI_AUTH_MODE: 'chatgpt',
        OPENAI_MODEL: resolvedModelId,
      }
    case 'gemini':
      return {
        CLAUDE_CODE_USE_GEMINI: '1',
        ...(provider.baseUrl === undefined
          ? {}
          : { GEMINI_BASE_URL: provider.baseUrl }),
        GEMINI_MODEL: resolvedModelId,
      }
    case 'grok':
      return {
        CLAUDE_CODE_USE_GROK: '1',
        ...(provider.baseUrl === undefined
          ? {}
          : { GROK_BASE_URL: provider.baseUrl }),
        GROK_MODEL: resolvedModelId,
      }
    case 'bedrock':
      return {
        CLAUDE_CODE_USE_BEDROCK: '1',
        ANTHROPIC_MODEL: resolvedModelId,
      }
    case 'vertex':
      return {
        CLAUDE_CODE_USE_VERTEX: '1',
        ANTHROPIC_MODEL: resolvedModelId,
      }
    case 'foundry':
      return {
        CLAUDE_CODE_USE_FOUNDRY: '1',
        ANTHROPIC_MODEL: resolvedModelId,
      }
  }
}

/** Resolve a catalog selection into a frozen, non-secret runtime snapshot. */
export function resolveProviderRuntimeSnapshot(
  configuration: ProviderConfigurationV2,
  selection: ProviderRuntimeSelection,
  baseEnv: Readonly<Record<string, string | undefined>>,
  options: ResolveSnapshotOptions = {},
): ProviderRuntimeSnapshot {
  if (selection.providerConfigRevision !== configuration.revision) {
    throw new ProviderRuntimeResolutionError('provider_revision_conflict')
  }
  const provider = configuration.providers.find(
    candidate => candidate.id === selection.providerId,
  )
  if (provider === undefined) {
    throw new ProviderRuntimeResolutionError('provider_not_found')
  }
  if (!provider.enabled || provider.archived) {
    throw new ProviderRuntimeResolutionError('provider_unavailable')
  }
  const model = provider.models.find(
    candidate => candidate.id === selection.modelProfileId,
  )
  if (model === undefined) {
    throw new ProviderRuntimeResolutionError('model_not_found')
  }
  if (!model.enabled || model.archived) {
    throw new ProviderRuntimeResolutionError('model_unavailable')
  }
  if (model.validation.status === 'invalid') {
    throw new ProviderRuntimeResolutionError('invalid_model')
  }
  if (model.remoteModelId !== selection.resolvedModelId) {
    throw new ProviderRuntimeResolutionError('resolved_model_mismatch')
  }
  if (options.isModelAllowed?.(model.remoteModelId) === false) {
    throw new ProviderRuntimeResolutionError('model_not_allowed')
  }

  const credentialSourceEnvName = provider.auth.envName
  if (
    (provider.auth.source === 'environment' ||
      provider.auth.source === 'settings') &&
    credentialSourceEnvName !== undefined &&
    !baseEnv[credentialSourceEnvName]
  ) {
    throw new ProviderRuntimeResolutionError('authentication_required')
  }
  const credentialTargetEnvName = credentialTarget(provider)
  const environmentTemplate = Object.freeze(
    buildEnvironmentTemplate(provider, model.remoteModelId),
  )
  return Object.freeze({
    providerId: provider.id,
    modelProfileId: model.id,
    resolvedModelId: model.remoteModelId,
    providerConfigRevision: configuration.revision,
    apiProvider: API_PROVIDER_BY_KIND[provider.kind],
    ...(provider.compatRule === undefined
      ? {}
      : { compatRule: provider.compatRule }),
    environmentTemplate,
    ...(credentialSourceEnvName === undefined
      ? {}
      : { credentialSourceEnvName }),
    ...(credentialTargetEnvName === undefined
      ? {}
      : { credentialTargetEnvName }),
  })
}

/** Project a snapshot over a copy of baseEnv without mutating the caller. */
export function projectRuntimeEnvironment(
  snapshot: ProviderRuntimeSnapshot,
  baseEnv: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const projected = { ...baseEnv }
  const credentialValue = snapshot.credentialSourceEnvName
    ? baseEnv[snapshot.credentialSourceEnvName]
    : undefined
  for (const key of PROVIDER_ENVIRONMENT_KEYS) delete projected[key]
  for (const [key, value] of Object.entries(snapshot.environmentTemplate)) {
    if (value === undefined) delete projected[key]
    else projected[key] = value
  }
  if (
    snapshot.credentialTargetEnvName !== undefined &&
    credentialValue !== undefined
  ) {
    projected[snapshot.credentialTargetEnvName] = credentialValue
  }
  return projected
}
