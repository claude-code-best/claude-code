import { describe, expect, test } from 'bun:test'
import {
  ProviderCatalogError,
  ProviderCatalogService,
  applyCatalogMutation,
} from '../catalogService.js'
import { ProviderRevisionConflictError } from '../loader.js'
import { ProviderConfigurationV2Schema } from '../types.js'
import type {
  CatalogMutationRequest,
  ProviderCatalogPersistence,
} from '../catalogService.js'
import type { ProviderConfigurationV2 } from '../types.js'

const configuration = (): ProviderConfigurationV2 => ({
  version: 2,
  revision: 0,
  defaultModel: {
    providerId: 'primary-provider',
    modelProfileId: 'default-model',
  },
  providers: [
    {
      id: 'primary-provider',
      displayName: 'Primary Provider',
      kind: 'openai-compatible',
      baseUrl: 'https://primary.example/v1',
      auth: {
        scheme: 'api-key',
        source: 'environment',
        envName: 'PRIMARY_API_KEY',
      },
      compatRule: 'strict-openai',
      enabled: true,
      archived: false,
      models: [
        {
          id: 'default-model',
          displayName: 'Default Model',
          remoteModelId: 'vendor-default-v2',
          enabled: true,
          archived: false,
          validation: { status: 'valid' },
        },
        {
          id: 'draft-model',
          displayName: 'Draft Model',
          remoteModelId: 'vendor-draft-v1',
          enabled: true,
          archived: false,
          validation: { status: 'unverified' },
        },
        {
          id: 'invalid-model',
          displayName: 'Invalid Model',
          remoteModelId: 'vendor-invalid-v1',
          enabled: true,
          archived: false,
          validation: { status: 'invalid' },
        },
      ],
    },
    {
      id: 'secondary-provider',
      displayName: 'Secondary Provider',
      kind: 'anthropic',
      auth: { scheme: 'oauth', source: 'secure-storage' },
      enabled: true,
      archived: false,
      models: [
        {
          id: 'secondary-model',
          displayName: 'Secondary Model',
          remoteModelId: 'secondary-model-v1',
          enabled: true,
          archived: false,
          validation: { status: 'valid' },
        },
      ],
    },
  ],
})

function createService() {
  let current = ProviderConfigurationV2Schema.parse(configuration())
  let saveCount = 0
  const persistence: ProviderCatalogPersistence = {
    load: () => ({
      configuration: ProviderConfigurationV2Schema.parse(current),
      sourceFormat: 'v2',
    }),
    save: (next, expectedRevision) => {
      if (current.revision !== expectedRevision) {
        throw new ProviderRevisionConflictError(current)
      }
      current = ProviderConfigurationV2Schema.parse({
        ...next,
        revision: expectedRevision + 1,
      })
      saveCount += 1
      return ProviderConfigurationV2Schema.parse(current)
    },
  }
  return {
    service: new ProviderCatalogService(persistence),
    getSaveCount: () => saveCount,
  }
}

describe('ProviderCatalogService', () => {
  test('replays an operation without applying it twice', () => {
    const { service, getSaveCount } = createService()
    const request: CatalogMutationRequest = {
      operationId: 'set-secondary-default',
      expectedRevision: 0,
      mutation: {
        type: 'set_default',
        model: {
          providerId: 'secondary-provider',
          modelProfileId: 'secondary-model',
        },
      },
    }

    const first = service.mutate(request)
    const replay = service.mutate(request)

    expect(replay).toEqual(first)
    expect(service.read().revision).toBe(1)
    expect(getSaveCount()).toBe(1)
  })

  test('rejects a different payload that reuses an operation id', () => {
    const { service } = createService()
    service.mutate({
      operationId: 'shared-operation',
      expectedRevision: 0,
      mutation: { type: 'set_default', model: null },
    })

    expect(() =>
      service.mutate({
        operationId: 'shared-operation',
        expectedRevision: 0,
        mutation: {
          type: 'set_default',
          model: {
            providerId: 'secondary-provider',
            modelProfileId: 'secondary-model',
          },
        },
      }),
    ).toThrow('provider_operation_conflict')
  })

  test('returns the current catalog with a stale revision conflict', () => {
    const { service } = createService()

    try {
      service.mutate({
        operationId: 'future-client',
        expectedRevision: 2,
        mutation: { type: 'set_default', model: null },
      })
      throw new Error('expected a revision conflict')
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderRevisionConflictError)
      expect(
        error instanceof ProviderRevisionConflictError
          ? error.current.revision
          : undefined,
      ).toBe(0)
    }
  })

  test('archives a provider without deleting its models', () => {
    const { service } = createService()

    const result = service.mutate({
      operationId: 'archive-secondary',
      expectedRevision: 0,
      mutation: {
        type: 'archive_provider',
        providerId: 'secondary-provider',
      },
    })

    expect(
      result.providers.find(provider => provider.id === 'secondary-provider'),
    ).toMatchObject({
      archived: true,
      enabled: false,
      models: [
        {
          id: 'secondary-model',
          remoteModelId: 'secondary-model-v1',
        },
      ],
    })
  })

  test('archives a model without deleting identity or validation data', () => {
    const next = applyCatalogMutation(configuration(), {
      type: 'archive_model',
      providerId: 'primary-provider',
      modelProfileId: 'draft-model',
    })

    expect(
      next.providers[0]?.models.find(model => model.id === 'draft-model'),
    ).toEqual({
      id: 'draft-model',
      displayName: 'Draft Model',
      remoteModelId: 'vendor-draft-v1',
      enabled: false,
      archived: true,
      validation: { status: 'unverified' },
    })
    expect(configuration().providers[0]?.models[1]?.archived).toBe(false)
  })

  test('preserves omitted models when saving an existing provider', () => {
    const current = configuration()
    const existing = current.providers[1]

    const next = applyCatalogMutation(current, {
      type: 'save_provider',
      provider: { ...existing, displayName: 'Renamed', models: [] },
    })

    expect(next.providers[1]?.displayName).toBe('Renamed')
    expect(next.providers[1]?.models).toEqual(existing.models)
  })

  test('requires a replacement before archiving the default model', () => {
    const { service } = createService()

    expect(() =>
      service.mutate({
        operationId: 'archive-default',
        expectedRevision: 0,
        mutation: {
          type: 'archive_model',
          providerId: 'primary-provider',
          modelProfileId: 'default-model',
        },
      }),
    ).toThrow('default_model_conflict')
  })

  test('requires confirmation before setting an unverified default', () => {
    const { service } = createService()
    const model = {
      providerId: 'primary-provider',
      modelProfileId: 'draft-model',
    }

    expect(() =>
      service.mutate({
        operationId: 'unverified-without-confirmation',
        expectedRevision: 0,
        mutation: { type: 'set_default', model },
      }),
    ).toThrow('unverified_model_confirmation_required')

    const result = service.mutate({
      operationId: 'confirmed-unverified',
      expectedRevision: 0,
      mutation: { type: 'set_default', model, allowUnverified: true },
    })
    expect(result.defaultModel).toEqual(model)
  })

  test('never permits an invalid model as the default', () => {
    const { service } = createService()

    expect(() =>
      service.mutate({
        operationId: 'invalid-default',
        expectedRevision: 0,
        mutation: {
          type: 'set_default',
          model: {
            providerId: 'primary-provider',
            modelProfileId: 'invalid-model',
          },
          allowUnverified: true,
        },
      }),
    ).toThrow('invalid_model')
  })

  test('uses structured error codes for missing providers and models', () => {
    const missingProvider = () =>
      applyCatalogMutation(configuration(), {
        type: 'archive_provider',
        providerId: 'missing-provider',
      })

    try {
      missingProvider()
      throw new Error('expected provider_not_found')
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderCatalogError)
      expect(
        error instanceof ProviderCatalogError ? error.code : undefined,
      ).toBe('provider_not_found')
    }
  })

  test('delete_provider removes the entry entirely, unlike archive', () => {
    const { service } = createService()

    const result = service.mutate({
      operationId: 'delete-secondary',
      expectedRevision: 0,
      mutation: {
        type: 'delete_provider',
        providerId: 'secondary-provider',
      },
    })

    expect(
      result.providers.some(provider => provider.id === 'secondary-provider'),
    ).toBe(false)
    expect(result.providers).toHaveLength(1)
  })

  test('delete_model removes a non-default model entirely', () => {
    const next = applyCatalogMutation(configuration(), {
      type: 'delete_model',
      providerId: 'primary-provider',
      modelProfileId: 'draft-model',
    })

    expect(
      next.providers[0]?.models.some(model => model.id === 'draft-model'),
    ).toBe(false)
    // Sibling models survive.
    expect(
      next.providers[0]?.models.some(model => model.id === 'default-model'),
    ).toBe(true)
  })

  test('refuses to delete the provider that holds the default model', () => {
    const { service } = createService()

    expect(() =>
      service.mutate({
        operationId: 'delete-default-provider',
        expectedRevision: 0,
        mutation: {
          type: 'delete_provider',
          providerId: 'primary-provider',
        },
      }),
    ).toThrow('default_model_conflict')
  })

  test('refuses to delete the default model itself', () => {
    const { service } = createService()

    expect(() =>
      service.mutate({
        operationId: 'delete-default-model',
        expectedRevision: 0,
        mutation: {
          type: 'delete_model',
          providerId: 'primary-provider',
          modelProfileId: 'default-model',
        },
      }),
    ).toThrow('default_model_conflict')
  })

  test('delete surfaces structured not-found errors', () => {
    expect(() =>
      applyCatalogMutation(configuration(), {
        type: 'delete_model',
        providerId: 'primary-provider',
        modelProfileId: 'missing-model',
      }),
    ).toThrow('model_not_found')
  })
})
