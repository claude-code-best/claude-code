import type {
  ProviderCatalogModelProfile,
  ProviderCatalogProfile,
  ProviderKind,
  ProviderModelMutationPayload,
  ProviderMutationPayload,
} from '../../types'

export type ProviderPreset = {
  id: string
  label: string
  kind: ProviderKind
  baseUrl?: string
  compatRule?: ProviderMutationPayload['compat_rule']
  authScheme: ProviderMutationPayload['auth']['scheme']
  authSource: ProviderMutationPayload['auth']['source']
  envName?: string
  suggestedModels: string[]
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'anthropic',
    label: 'Claude / Anthropic',
    kind: 'anthropic',
    authScheme: 'oauth',
    authSource: 'secure-storage',
    suggestedModels: ['claude-sonnet-4-5', 'claude-opus-4-1'],
  },
  {
    id: 'anthropic-compatible',
    label: 'Anthropic Compatible',
    kind: 'anthropic-compatible',
    authScheme: 'bearer',
    authSource: 'settings',
    envName: 'ANTHROPIC_AUTH_TOKEN',
    suggestedModels: [],
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI Compatible',
    kind: 'openai-compatible',
    authScheme: 'api-key',
    authSource: 'settings',
    envName: 'OPENAI_API_KEY',
    compatRule: 'permissive',
    suggestedModels: [],
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT 订阅',
    kind: 'chatgpt',
    authScheme: 'oauth',
    authSource: 'secure-storage',
    suggestedModels: ['gpt-5', 'gpt-5-codex'],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    authScheme: 'api-key',
    authSource: 'settings',
    envName: 'GEMINI_API_KEY',
    suggestedModels: ['gemini-2.5-pro'],
  },
  {
    id: 'grok',
    label: 'xAI Grok',
    kind: 'grok',
    baseUrl: 'https://api.x.ai/v1',
    authScheme: 'api-key',
    authSource: 'settings',
    envName: 'GROK_API_KEY',
    suggestedModels: ['grok-4'],
  },
  {
    id: 'bedrock',
    label: 'Amazon Bedrock',
    kind: 'bedrock',
    authScheme: 'aws-iam',
    authSource: 'cloud-chain',
    suggestedModels: [],
  },
  {
    id: 'vertex',
    label: 'Google Vertex AI',
    kind: 'vertex',
    authScheme: 'gcp-adc',
    authSource: 'cloud-chain',
    suggestedModels: [],
  },
  {
    id: 'foundry',
    label: 'Azure AI Foundry',
    kind: 'foundry',
    authScheme: 'azure-ad',
    authSource: 'cloud-chain',
    suggestedModels: [],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek（国内）',
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    compatRule: 'deepseek',
    authScheme: 'api-key',
    authSource: 'settings',
    envName: 'DEEPSEEK_API_KEY',
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'moonshot',
    label: 'Moonshot / Kimi（国内）',
    kind: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    compatRule: 'permissive',
    authScheme: 'api-key',
    authSource: 'settings',
    envName: 'MOONSHOT_API_KEY',
    suggestedModels: ['kimi-k2'],
  },
  {
    id: 'siliconflow',
    label: '硅基流动（国内）',
    kind: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    compatRule: 'permissive',
    authScheme: 'api-key',
    authSource: 'settings',
    envName: 'SILICONFLOW_API_KEY',
    suggestedModels: [],
  },
  {
    id: 'custom',
    label: '完全自定义',
    kind: 'openai-compatible',
    authScheme: 'api-key',
    authSource: 'settings',
    envName: 'CUSTOM_PROVIDER_API_KEY',
    compatRule: 'permissive',
    suggestedModels: [],
  },
]

export type ProviderFormState = {
  presetId: string
  id: string
  displayName: string
  kind: ProviderKind
  baseUrl: string
  authScheme: ProviderMutationPayload['auth']['scheme']
  authSource: ProviderMutationPayload['auth']['source']
  envName: string
  compatRule: string
  initialModelId: string
}

export function stateFromPreset(presetId: string): ProviderFormState {
  const preset =
    PROVIDER_PRESETS.find(candidate => candidate.id === presetId) ??
    PROVIDER_PRESETS.at(-1)!
  return {
    presetId: preset.id,
    id: preset.id === 'custom' ? '' : preset.id,
    displayName: preset.label,
    kind: preset.kind,
    baseUrl: preset.baseUrl ?? '',
    authScheme: preset.authScheme,
    authSource: preset.authSource,
    envName: preset.envName ?? '',
    compatRule: preset.compatRule ?? '',
    initialModelId: preset.suggestedModels[0] ?? '',
  }
}

export function stateFromProvider(
  provider: ProviderCatalogProfile,
): ProviderFormState {
  return {
    presetId: provider.kind,
    id: provider.id,
    displayName: provider.displayName,
    kind: provider.kind,
    baseUrl: provider.baseUrl ?? '',
    authScheme: provider.auth.scheme,
    authSource: provider.auth.source,
    envName: provider.auth.envName ?? '',
    compatRule: provider.compatRule ?? '',
    initialModelId: '',
  }
}

function defaultCredentialEnvName(
  state: ProviderFormState,
  scheme: 'api-key' | 'bearer',
): string {
  if (state.envName.trim()) return state.envName.trim()
  if (state.kind === 'anthropic' || state.kind === 'anthropic-compatible') {
    return scheme === 'bearer' ? 'ANTHROPIC_AUTH_TOKEN' : 'ANTHROPIC_API_KEY'
  }
  if (state.kind === 'gemini') return 'GEMINI_API_KEY'
  if (state.kind === 'grok') return 'GROK_API_KEY'
  return 'OPENAI_API_KEY'
}

export function withAuthScheme(
  state: ProviderFormState,
  scheme: ProviderFormState['authScheme'],
): ProviderFormState {
  if (scheme === 'api-key' || scheme === 'bearer') {
    return {
      ...state,
      authScheme: scheme,
      authSource: 'settings',
      envName: defaultCredentialEnvName(state, scheme),
    }
  }
  if (scheme === 'oauth') {
    return {
      ...state,
      authScheme: scheme,
      authSource: 'secure-storage',
      envName: '',
    }
  }
  if (scheme === 'aws-iam' || scheme === 'gcp-adc' || scheme === 'azure-ad') {
    return {
      ...state,
      authScheme: scheme,
      authSource: 'cloud-chain',
      envName: '',
    }
  }
  return {
    ...state,
    authScheme: scheme,
    authSource: 'helper',
  }
}

function stableId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function modelMutation(
  model: ProviderCatalogModelProfile,
): ProviderModelMutationPayload {
  return {
    id: model.id,
    display_name: model.displayName,
    remote_model_id: model.remoteModelId,
    enabled: model.enabled,
    archived: model.archived,
    validation: { status: model.validation.status },
  }
}

export function buildProviderMutation(
  state: ProviderFormState,
  existingModels: ProviderCatalogModelProfile[] = [],
): ProviderMutationPayload {
  if (!/^[a-z0-9-]+$/.test(state.id))
    throw new Error('供应商 ID 必须使用小写字母、数字和连字符')
  if (!state.displayName.trim()) throw new Error('请输入供应商名称')
  if (state.baseUrl) new URL(state.baseUrl)
  const initialRemoteId = state.initialModelId.trim()
  const initialModels: ProviderModelMutationPayload[] = initialRemoteId
    ? [
        {
          id: stableId(initialRemoteId),
          display_name: initialRemoteId,
          remote_model_id: initialRemoteId,
          enabled: true,
          archived: false,
          validation: { status: 'unverified' },
        },
      ]
    : []
  return {
    id: state.id,
    display_name: state.displayName.trim(),
    kind: state.kind,
    ...(state.baseUrl ? { base_url: state.baseUrl } : {}),
    auth: {
      scheme: state.authScheme,
      source: state.authSource,
      ...(state.envName ? { env_name: state.envName } : {}),
    },
    ...(state.compatRule
      ? {
          compat_rule:
            state.compatRule as ProviderMutationPayload['compat_rule'],
        }
      : {}),
    enabled: true,
    archived: false,
    models: [...existingModels.map(modelMutation), ...initialModels],
  }
}
