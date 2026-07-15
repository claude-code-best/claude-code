import { describe, expect, test } from 'bun:test'
import {
  buildLegacyProviderCapability,
  buildProviderCatalogCapability,
} from '../catalogCapability.js'
import type { DetectedProviderProfile } from '../existingProviderDetector.js'
import type { ProviderConfigurationV2 } from '../types.js'

const configuration = (): ProviderConfigurationV2 => ({
  version: 2,
  revision: 9,
  defaultModel: {
    providerId: 'custom-openai',
    modelProfileId: 'reasoner',
  },
  providers: [
    {
      id: 'archived-provider',
      displayName: 'Archived Provider',
      kind: 'anthropic',
      auth: { scheme: 'oauth', source: 'secure-storage' },
      enabled: false,
      archived: true,
      models: [
        {
          id: 'historical-model',
          displayName: 'Historical Model',
          remoteModelId: 'historical-v1',
          enabled: false,
          archived: true,
          validation: { status: 'valid' },
        },
      ],
    },
    {
      id: 'custom-openai',
      displayName: 'My OpenAI Endpoint',
      kind: 'openai-compatible',
      baseUrl: 'https://user:password@api.example/v1?api_key=query-secret',
      auth: {
        scheme: 'api-key',
        source: 'environment',
        envName: 'OPENAI_API_KEY',
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
          validation: { status: 'valid' },
        },
      ],
    },
  ],
})

const detectedProfiles = (): DetectedProviderProfile[] => [
  {
    id: 'detected-openai-compatible',
    displayName: 'Detected OpenAI',
    kind: 'openai-compatible',
    baseUrl: 'https://different.example/v1',
    auth: {
      scheme: 'api-key',
      source: 'environment',
      envName: 'OPENAI_API_KEY',
      configured: true,
    },
    enabled: true,
    archived: false,
    models: [],
  },
  {
    id: 'detected-bedrock',
    displayName: 'Amazon Bedrock',
    kind: 'bedrock',
    auth: {
      scheme: 'aws-iam',
      source: 'cloud-chain',
      configured: true,
    },
    enabled: true,
    archived: false,
    models: [],
  },
]

describe('buildProviderCatalogCapability', () => {
  test('merges detected authentication status into file display settings', () => {
    const capability = buildProviderCatalogCapability(
      configuration(),
      detectedProfiles(),
    )
    const custom = capability.providers.find(
      provider => provider.id === 'custom-openai',
    )

    expect(custom).toMatchObject({
      displayName: 'My OpenAI Endpoint',
      baseUrl: 'https://api.example/v1',
      auth: {
        scheme: 'api-key',
        source: 'environment',
        envName: 'OPENAI_API_KEY',
        configured: true,
      },
      models: [{ id: 'reasoner', remoteModelId: 'reasoner-v7' }],
    })
    expect(
      capability.providers.some(
        provider => provider.id === 'detected-openai-compatible',
      ),
    ).toBe(false)
    expect(
      capability.providers.some(provider => provider.id === 'detected-bedrock'),
    ).toBe(true)
  })

  test('never exposes credential values or unknown auth fields', () => {
    const detected = detectedProfiles()
    Object.assign(detected[0].auth, {
      apiKey: 'sk-live-secret',
      accessToken: 'oauth-access-secret',
      refreshToken: 'oauth-refresh-secret',
    })

    const capability = buildProviderCatalogCapability(configuration(), detected)
    const json = JSON.stringify(capability)

    for (const secret of [
      'sk-live-secret',
      'oauth-access-secret',
      'oauth-refresh-secret',
      'password',
      'query-secret',
    ]) {
      expect(json).not.toContain(secret)
    }
    expect(capability.providers[0]?.auth.configured).toBe(true)
  })

  test('is stable and keeps archived profiles after active profiles', () => {
    const first = buildProviderCatalogCapability(
      configuration(),
      detectedProfiles(),
    )
    const second = buildProviderCatalogCapability(
      configuration(),
      detectedProfiles(),
    )

    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
    expect(first.providers.at(-1)?.id).toBe('archived-provider')
    expect(first.providers.at(-1)?.models[0]?.id).toBe('historical-model')
    expect(first.features).toEqual({
      catalogWrite: false,
      sessionPersistence: false,
      runtimeSwitch: false,
      secretControl: false,
    })
  })

  test('derives the legacy compatibility view from the redacted catalog', () => {
    const catalog = buildProviderCatalogCapability(
      configuration(),
      detectedProfiles(),
    )

    expect(buildLegacyProviderCapability(catalog, 'openai')).toEqual({
      current: 'openai',
      configs: [
        {
          id: 'custom-openai',
          kind: 'openai-compat',
          base_url: 'https://api.example/v1',
          default_model: 'reasoner-v7',
          compat_rule: 'strict-openai',
          key_env: 'OPENAI_API_KEY',
          key_configured: true,
        },
      ],
    })
  })

  test('does not project an invalid model into the legacy view', () => {
    const value = configuration()
    value.defaultModel = null
    const provider = value.providers.find(
      candidate => candidate.id === 'custom-openai',
    )
    provider?.models.unshift({
      id: 'invalid-first',
      displayName: 'Invalid First',
      remoteModelId: 'invalid-first-v1',
      enabled: true,
      archived: false,
      validation: { status: 'invalid' },
    })
    const catalog = buildProviderCatalogCapability(value, detectedProfiles())

    expect(
      buildLegacyProviderCapability(catalog, 'openai').configs[0],
    ).toMatchObject({ default_model: 'reasoner-v7' })
  })
})
