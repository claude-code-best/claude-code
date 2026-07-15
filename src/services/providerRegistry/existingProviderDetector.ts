import { createHash } from 'node:crypto'
import {
  CHATGPT_CODEX_DEFAULT_MODEL,
  CHATGPT_CODEX_FAST_MODEL,
} from '../../utils/model/chatgptModels.js'
import { RedactedProviderProfileSchema } from './types.js'
import type {
  AuthScheme,
  AuthSource,
  ModelProfile,
  ProviderKind,
  RedactedAuthReference,
  RedactedProviderProfile,
} from './types.js'

export type ProviderDetectionSettings = {
  modelType?: 'anthropic' | 'openai' | 'gemini' | 'grok'
  env?: Record<string, string | undefined>
  apiKeyHelper?: string
}

export type ProviderDetectionEnvironment = Record<string, string | undefined>

export type ProviderDetectionOptions = {
  chatGPTAuthConfigured?: boolean
}

export type DetectedProviderProfile = RedactedProviderProfile

type ResolvedValue = {
  value: string | undefined
  source: 'environment' | 'settings'
  envName: string
}

function hasOwn(record: object, key: string): boolean {
  return Object.hasOwn(record, key)
}

function resolveFirst(
  settings: ProviderDetectionSettings,
  env: ProviderDetectionEnvironment,
  envNames: string[],
): ResolvedValue | undefined {
  for (const envName of envNames) {
    if (hasOwn(env, envName)) {
      return { value: env[envName], source: 'environment', envName }
    }
  }
  for (const envName of envNames) {
    if (settings.env !== undefined && hasOwn(settings.env, envName)) {
      return {
        value: settings.env[envName],
        source: 'settings',
        envName,
      }
    }
  }
  return undefined
}

function isTruthy(value: string | undefined): boolean {
  if (value === undefined) return false
  return !['', '0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())
}

function safeBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

function stableModelId(remoteModelId: string, usedIds: Set<string>): string {
  const hash = createHash('sha256')
    .update(remoteModelId)
    .digest('hex')
    .slice(0, 8)
  const slug =
    remoteModelId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || `model-${hash}`
  let candidate = slug
  let sequence = 2
  while (usedIds.has(candidate)) {
    candidate = `${slug}-${hash}-${sequence}`
    sequence += 1
  }
  usedIds.add(candidate)
  return candidate
}

function detectModels(
  settings: ProviderDetectionSettings,
  env: ProviderDetectionEnvironment,
  envNames: string[],
  fallbackModels: string[] = [],
): ModelProfile[] {
  const values: string[] = []
  for (const envName of envNames) {
    const resolved = resolveFirst(settings, env, [envName])
    const value = resolved?.value?.trim()
    if (value && !values.includes(value)) values.push(value)
  }
  for (const model of fallbackModels) {
    if (model && !values.includes(model)) values.push(model)
  }
  const usedIds = new Set<string>()
  return values.map(remoteModelId => ({
    id: stableModelId(remoteModelId, usedIds),
    displayName: remoteModelId,
    remoteModelId,
    enabled: true,
    archived: false,
    validation: { status: 'unverified' },
  }))
}

function authReference(
  scheme: AuthScheme,
  source: AuthSource,
  configured: boolean,
  envName?: string,
): RedactedAuthReference {
  return {
    scheme,
    source,
    ...(envName === undefined ? {} : { envName }),
    configured,
  }
}

function buildProfile(input: {
  id: string
  displayName: string
  kind: ProviderKind
  auth: RedactedAuthReference
  models: ModelProfile[]
  baseUrl?: string
}): DetectedProviderProfile {
  return RedactedProviderProfileSchema.parse({
    ...input,
    enabled: true,
    archived: false,
  })
}

function detectAnthropic(
  settings: ProviderDetectionSettings,
  env: ProviderDetectionEnvironment,
): DetectedProviderProfile | undefined {
  const base = resolveFirst(settings, env, ['ANTHROPIC_BASE_URL'])
  const proxy = resolveFirst(settings, env, ['ANTHROPIC_UNIX_SOCKET'])
  const credential = resolveFirst(settings, env, [
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'CLAUDE_CODE_OAUTH_TOKEN',
  ])
  const hasHelper = Boolean(settings.apiKeyHelper?.trim())
  const selected =
    settings.modelType === undefined || settings.modelType === 'anthropic'
  if (
    !selected &&
    base === undefined &&
    proxy === undefined &&
    credential === undefined &&
    !hasHelper
  ) {
    return undefined
  }

  let auth: RedactedAuthReference
  if (proxy !== undefined && isTruthy(proxy.value)) {
    auth = authReference('proxy', 'helper', true, proxy.envName)
  } else if (credential !== undefined) {
    const scheme =
      credential.envName === 'ANTHROPIC_AUTH_TOKEN'
        ? 'bearer'
        : credential.envName === 'CLAUDE_CODE_OAUTH_TOKEN'
          ? 'oauth'
          : 'api-key'
    auth = authReference(
      scheme,
      credential.source,
      Boolean(credential.value),
      credential.envName,
    )
  } else if (hasHelper) {
    auth = authReference('api-key', 'helper', true)
  } else {
    auth = authReference('oauth', 'secure-storage', false)
  }

  const compatible = Boolean(base?.value)
  return buildProfile({
    id: compatible ? 'detected-anthropic-compatible' : 'detected-anthropic',
    displayName: compatible ? 'Anthropic Compatible' : 'Anthropic',
    kind: compatible ? 'anthropic-compatible' : 'anthropic',
    ...(base === undefined ? {} : { baseUrl: safeBaseUrl(base.value) }),
    auth,
    models: detectModels(settings, env, [
      'ANTHROPIC_MODEL',
      'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      'ANTHROPIC_DEFAULT_SONNET_MODEL',
      'ANTHROPIC_DEFAULT_OPUS_MODEL',
    ]),
  })
}

function detectOpenAI(
  settings: ProviderDetectionSettings,
  env: ProviderDetectionEnvironment,
  options: ProviderDetectionOptions,
): DetectedProviderProfile[] {
  const authMode = resolveFirst(settings, env, ['OPENAI_AUTH_MODE'])
  const storedAuth = options.chatGPTAuthConfigured === true
  const profiles: DetectedProviderProfile[] = []
  if (authMode?.value === 'chatgpt' || storedAuth) {
    const models =
      storedAuth && authMode?.value !== 'chatgpt'
        ? detectModels(
            {},
            {},
            [],
            [CHATGPT_CODEX_DEFAULT_MODEL, CHATGPT_CODEX_FAST_MODEL],
          )
        : detectModels(
            settings,
            env,
            [
              'OPENAI_MODEL',
              'OPENAI_DEFAULT_HAIKU_MODEL',
              'OPENAI_DEFAULT_SONNET_MODEL',
              'OPENAI_DEFAULT_OPUS_MODEL',
            ],
            [CHATGPT_CODEX_DEFAULT_MODEL, CHATGPT_CODEX_FAST_MODEL],
          )
    profiles.push(
      buildProfile({
        id: 'detected-chatgpt',
        displayName: 'ChatGPT Subscription',
        kind: 'chatgpt',
        auth: authReference('oauth', 'secure-storage', true),
        models,
      }),
    )
  }

  const credential = resolveFirst(settings, env, ['OPENAI_API_KEY'])
  const base = resolveFirst(settings, env, ['OPENAI_BASE_URL'])
  if (
    authMode?.value === 'chatgpt' ||
    (settings.modelType !== 'openai' &&
      credential === undefined &&
      base === undefined)
  ) {
    return profiles
  }
  profiles.push(
    buildProfile({
      id: 'detected-openai-compatible',
      displayName: 'OpenAI Compatible',
      kind: 'openai-compatible',
      ...(base === undefined ? {} : { baseUrl: safeBaseUrl(base.value) }),
      auth: authReference(
        'api-key',
        credential?.source ?? 'settings',
        Boolean(credential?.value),
        credential?.envName ?? 'OPENAI_API_KEY',
      ),
      models: detectModels(settings, env, [
        'OPENAI_MODEL',
        'OPENAI_DEFAULT_HAIKU_MODEL',
        'OPENAI_DEFAULT_SONNET_MODEL',
        'OPENAI_DEFAULT_OPUS_MODEL',
      ]),
    }),
  )
  return profiles
}

function detectApiKeyProvider(
  settings: ProviderDetectionSettings,
  env: ProviderDetectionEnvironment,
  input: {
    selectedModelType: 'gemini' | 'grok'
    id: string
    displayName: string
    kind: 'gemini' | 'grok'
    keyNames: string[]
    baseName: string
    modelNames: string[]
  },
): DetectedProviderProfile | undefined {
  const credential = resolveFirst(settings, env, input.keyNames)
  const base = resolveFirst(settings, env, [input.baseName])
  if (
    settings.modelType !== input.selectedModelType &&
    credential === undefined &&
    base === undefined
  ) {
    return undefined
  }
  return buildProfile({
    id: input.id,
    displayName: input.displayName,
    kind: input.kind,
    ...(base === undefined ? {} : { baseUrl: safeBaseUrl(base.value) }),
    auth: authReference(
      'api-key',
      credential?.source ?? 'settings',
      Boolean(credential?.value),
      credential?.envName ?? input.keyNames[0],
    ),
    models: detectModels(settings, env, input.modelNames),
  })
}

function detectCloudProvider(
  settings: ProviderDetectionSettings,
  env: ProviderDetectionEnvironment,
  input: {
    id: string
    displayName: string
    kind: 'bedrock' | 'vertex' | 'foundry'
    flagName: string
    scheme: 'aws-iam' | 'gcp-adc' | 'azure-ad'
    referenceNames: string[]
  },
): DetectedProviderProfile | undefined {
  const flag = resolveFirst(settings, env, [input.flagName])
  if (!isTruthy(flag?.value)) return undefined
  const reference = resolveFirst(settings, env, input.referenceNames)
  return buildProfile({
    id: input.id,
    displayName: input.displayName,
    kind: input.kind,
    auth: authReference(input.scheme, 'cloud-chain', true, reference?.envName),
    models: [],
  })
}

/** Detect configured provider references without returning credential values. */
export function detectExistingProviderProfiles(
  settings: ProviderDetectionSettings,
  env: ProviderDetectionEnvironment,
  options: ProviderDetectionOptions = {},
): DetectedProviderProfile[] {
  return [
    detectAnthropic(settings, env),
    ...detectOpenAI(settings, env, options),
    detectApiKeyProvider(settings, env, {
      selectedModelType: 'gemini',
      id: 'detected-gemini',
      displayName: 'Gemini',
      kind: 'gemini',
      keyNames: ['GEMINI_API_KEY'],
      baseName: 'GEMINI_BASE_URL',
      modelNames: [
        'GEMINI_MODEL',
        'GEMINI_DEFAULT_HAIKU_MODEL',
        'GEMINI_DEFAULT_SONNET_MODEL',
        'GEMINI_DEFAULT_OPUS_MODEL',
      ],
    }),
    detectApiKeyProvider(settings, env, {
      selectedModelType: 'grok',
      id: 'detected-grok',
      displayName: 'Grok',
      kind: 'grok',
      keyNames: ['GROK_API_KEY', 'XAI_API_KEY'],
      baseName: 'GROK_BASE_URL',
      modelNames: ['GROK_MODEL'],
    }),
    detectCloudProvider(settings, env, {
      id: 'detected-bedrock',
      displayName: 'Amazon Bedrock',
      kind: 'bedrock',
      flagName: 'CLAUDE_CODE_USE_BEDROCK',
      scheme: 'aws-iam',
      referenceNames: [
        'AWS_PROFILE',
        'AWS_ACCESS_KEY_ID',
        'AWS_WEB_IDENTITY_TOKEN_FILE',
      ],
    }),
    detectCloudProvider(settings, env, {
      id: 'detected-vertex',
      displayName: 'Google Vertex AI',
      kind: 'vertex',
      flagName: 'CLAUDE_CODE_USE_VERTEX',
      scheme: 'gcp-adc',
      referenceNames: ['GOOGLE_APPLICATION_CREDENTIALS'],
    }),
    detectCloudProvider(settings, env, {
      id: 'detected-foundry',
      displayName: 'Microsoft Foundry',
      kind: 'foundry',
      flagName: 'CLAUDE_CODE_USE_FOUNDRY',
      scheme: 'azure-ad',
      referenceNames: ['AZURE_CLIENT_ID', 'AZURE_TENANT_ID'],
    }),
  ].filter(
    (provider): provider is DetectedProviderProfile => provider !== undefined,
  )
}
