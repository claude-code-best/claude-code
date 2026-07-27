import { describe, expect, test } from 'bun:test'
import {
  buildSessionModelOptions,
  environmentDefaultModelLabel,
  findSelectedSessionModel,
} from '../lib/session-model-options'
import type { ProviderModelCatalog } from '../types'

function catalog(): ProviderModelCatalog {
  return {
    version: 1,
    revision: 7,
    defaultModel: { providerId: 'provider-a', modelProfileId: 'model-a' },
    providers: [
      {
        id: 'provider-a',
        displayName: '供应商 A',
        kind: 'openai-compatible',
        auth: {
          scheme: 'api-key',
          source: 'settings',
          configured: true,
        },
        enabled: true,
        archived: false,
        models: [
          {
            id: 'model-a',
            displayName: '模型 A',
            remoteModelId: 'remote-a',
            enabled: true,
            archived: false,
            validation: { status: 'valid' },
          },
          {
            id: 'model-b',
            displayName: '模型 B',
            remoteModelId: 'remote-b',
            enabled: true,
            archived: false,
            validation: { status: 'unverified' },
          },
        ],
      },
      {
        id: 'archived-provider',
        displayName: '已归档',
        kind: 'anthropic',
        auth: { scheme: 'oauth', source: 'secure-storage', configured: true },
        enabled: true,
        archived: true,
        models: [],
      },
    ],
    features: {
      catalogWrite: true,
      sessionPersistence: true,
      runtimeSwitch: true,
      secretControl: true,
    },
  }
}

describe('session model options', () => {
  test('offers available catalog models and identifies the persisted selection', () => {
    const options = buildSessionModelOptions(catalog())

    expect(options.map(option => option.label)).toEqual([
      '供应商 A / 模型 A',
      '供应商 A / 模型 B',
    ])
    expect(options[1]?.unverified).toBe(true)
    expect(
      findSelectedSessionModel(options, {
        provider_id: 'provider-a',
        model_profile_id: 'model-b',
        resolved_model_id: 'remote-b',
        provider_config_revision: 7,
        updated_at: 123,
      })?.modelProfileId,
    ).toBe('model-b')
  })

  test('does not silently replace a missing old selection with the environment default', () => {
    const options = buildSessionModelOptions(catalog())
    expect(
      findSelectedSessionModel(options, {
        provider_id: 'old-provider',
        model_profile_id: 'old-model',
        resolved_model_id: 'old-remote',
        provider_config_revision: 2,
        updated_at: 100,
      }),
    ).toBeNull()
  })

  test('describes the default copied into a new conversation', () => {
    expect(
      environmentDefaultModelLabel({
        id: 'environment-1',
        status: 'active',
        capabilities: { provider_model_catalog_v1: catalog() },
      }),
    ).toBe('供应商 A / 模型 A')
  })
})
