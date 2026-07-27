import { describe, expect, test } from 'bun:test'
import {
  AuthSchemeSchema,
  AuthSourceSchema,
  LegacyProviderConfigSchema,
  ProviderConfigurationV2Schema,
  ProviderKindSchema,
} from '../types.js'
import type { ProviderConfigurationV2 } from '../types.js'

const validConfiguration = (): ProviderConfigurationV2 => ({
  version: 2,
  revision: 3,
  defaultModel: {
    providerId: 'custom-openai',
    modelProfileId: 'reasoner',
  },
  providers: [
    {
      id: 'custom-openai',
      displayName: '自定义 OpenAI',
      kind: 'openai-compatible',
      baseUrl: 'https://llm.example/v1',
      auth: {
        scheme: 'api-key',
        source: 'settings',
        envName: 'CUSTOM_OPENAI_API_KEY',
      },
      compatRule: 'strict-openai',
      enabled: true,
      archived: false,
      models: [
        {
          id: 'reasoner',
          displayName: 'Reasoner',
          remoteModelId: 'reasoner-v7',
          enabled: true,
          archived: false,
          validation: { status: 'unverified' },
        },
      ],
    },
  ],
})

describe('ProviderConfigurationV2Schema', () => {
  test('accepts a multi-model provider without secret material', () => {
    const value = validConfiguration()
    value.providers[0].models.push({
      id: 'fast',
      displayName: 'Fast',
      remoteModelId: 'fast-v2',
      enabled: true,
      archived: false,
      validation: { status: 'valid' },
    })

    const parsed = ProviderConfigurationV2Schema.parse(value)

    expect(parsed.revision).toBe(3)
    expect(parsed.providers[0]?.models).toHaveLength(2)
    expect(parsed.providers[0]?.models[0]?.remoteModelId).toBe('reasoner-v7')
  })

  test('exposes every supported provider and authentication enum value', () => {
    expect(ProviderKindSchema.options).toEqual([
      'anthropic',
      'anthropic-compatible',
      'openai-compatible',
      'chatgpt',
      'gemini',
      'grok',
      'bedrock',
      'vertex',
      'foundry',
    ])
    expect(AuthSchemeSchema.options).toEqual([
      'oauth',
      'api-key',
      'bearer',
      'aws-iam',
      'gcp-adc',
      'azure-ad',
      'proxy',
    ])
    expect(AuthSourceSchema.options).toEqual([
      'secure-storage',
      'settings',
      'environment',
      'helper',
      'cloud-chain',
    ])
  })

  test.each([
    'apiKey',
    'token',
    'secret',
  ])('rejects persisted %s values', secretField => {
    const value = validConfiguration()
    Object.assign(value.providers[0].auth, {
      [secretField]: 'must-not-be-stored',
    })

    expect(ProviderConfigurationV2Schema.safeParse(value).success).toBe(false)
  })

  test('rejects a dangling default model reference', () => {
    const value = validConfiguration()
    value.defaultModel = {
      providerId: 'missing',
      modelProfileId: 'missing',
    }

    expect(ProviderConfigurationV2Schema.safeParse(value).success).toBe(false)
  })

  type DefaultTargetChanges = {
    providerEnabled?: boolean
    providerArchived?: boolean
    modelEnabled?: boolean
    modelArchived?: boolean
    validationStatus?: 'unverified' | 'valid' | 'invalid'
  }

  const unavailableTargets: Array<[string, DefaultTargetChanges]> = [
    ['disabled provider', { providerEnabled: false }],
    ['archived provider', { providerArchived: true }],
    ['disabled model', { modelEnabled: false }],
    ['archived model', { modelArchived: true }],
    ['invalid model', { validationStatus: 'invalid' }],
  ]

  test.each(
    unavailableTargets,
  )('rejects a default that targets a %s', (_name, changes) => {
    const value = validConfiguration()
    const provider = value.providers[0]
    const model = provider.models[0]

    if (changes.providerEnabled !== undefined) {
      provider.enabled = changes.providerEnabled
    }
    if (changes.providerArchived !== undefined) {
      provider.archived = changes.providerArchived
    }
    if (changes.modelEnabled !== undefined) {
      model.enabled = changes.modelEnabled
    }
    if (changes.modelArchived !== undefined) {
      model.archived = changes.modelArchived
    }
    if (changes.validationStatus !== undefined) {
      model.validation.status = changes.validationStatus
    }

    expect(ProviderConfigurationV2Schema.safeParse(value).success).toBe(false)
  })

  test('keeps the legacy provider kind out of v2', () => {
    const legacy = {
      id: 'custom-openai',
      kind: 'openai-compat',
      baseUrl: 'https://llm.example/v1',
      apiKeyEnv: 'CUSTOM_OPENAI_API_KEY',
      defaultModel: 'reasoner-v7',
      compatRule: 'strict-openai',
    }

    expect(LegacyProviderConfigSchema.safeParse(legacy).success).toBe(true)
    expect(ProviderKindSchema.safeParse(legacy.kind).success).toBe(false)
  })
})
