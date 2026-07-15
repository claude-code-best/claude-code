import { describe, expect, test } from 'bun:test'
import { ProviderRevisionConflictError } from '../loader.js'
import { ProviderCatalogService } from '../catalogService.js'
import { ProviderConfigurationV2Schema } from '../types.js'
import { executeProviderEnvironmentCommand } from '../environmentCommands.js'
import type { ProviderCatalogPersistence } from '../catalogService.js'

function createService() {
  let current = ProviderConfigurationV2Schema.parse({
    version: 2,
    revision: 4,
    defaultModel: null,
    providers: [
      {
        id: 'provider-one',
        displayName: 'Provider One',
        kind: 'openai-compatible',
        baseUrl: 'https://provider.example/v1',
        auth: {
          scheme: 'api-key',
          source: 'environment',
          envName: 'PROVIDER_ONE_API_KEY',
        },
        enabled: true,
        archived: false,
        models: [
          {
            id: 'model-one',
            displayName: 'Model One',
            remoteModelId: 'remote-one',
            enabled: true,
            archived: false,
            validation: { status: 'valid' },
          },
        ],
      },
    ],
  })
  const persistence: ProviderCatalogPersistence = {
    load: () => ({ configuration: current, sourceFormat: 'v2' }),
    save: (next, revision) => {
      if (revision !== current.revision) {
        throw new ProviderRevisionConflictError(current)
      }
      current = ProviderConfigurationV2Schema.parse({
        ...next,
        revision: revision + 1,
      })
      return current
    },
  }
  return new ProviderCatalogService(persistence)
}

describe('provider environment commands', () => {
  test('mutates the catalog and returns only a redacted capability', async () => {
    const result = await executeProviderEnvironmentCommand(
      {
        type: 'set_default_model',
        operation_id: 'operation-1',
        expected_revision: 4,
        model: {
          provider_id: 'provider-one',
          model_profile_id: 'model-one',
        },
        allow_unverified: false,
      },
      {
        catalogService: createService(),
        detectedProfiles: () => [],
      },
    )

    expect(result).toMatchObject({
      ok: true,
      kind: 'set_default_model',
      catalog: {
        revision: 5,
        defaultModel: {
          providerId: 'provider-one',
          modelProfileId: 'model-one',
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-test-secret')
  })

  test('returns the current redacted catalog on a revision conflict', async () => {
    const result = await executeProviderEnvironmentCommand(
      {
        type: 'archive_provider_profile',
        operation_id: 'operation-stale',
        expected_revision: 3,
        provider_id: 'provider-one',
      },
      {
        catalogService: createService(),
        detectedProfiles: () => [],
      },
    )

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'provider_revision_conflict',
      catalog: { revision: 4 },
    })
  })
})
