import { describe, expect, mock, test } from 'bun:test'
import { activateSessionModelRequest } from '../sessionControl.js'
import type { ProviderConfigurationV2 } from '../../providerRegistry/types.js'
import type { RuntimeActivationResult } from '../runtimeService.js'

function configuration(): ProviderConfigurationV2 {
  return {
    version: 2,
    revision: 7,
    defaultModel: null,
    providers: [
      {
        id: 'custom-openai',
        displayName: 'Custom OpenAI',
        kind: 'openai-compatible',
        baseUrl: 'https://example.test/v1',
        auth: {
          scheme: 'api-key',
          source: 'environment',
          envName: 'CUSTOM_OPENAI_API_KEY',
        },
        enabled: true,
        archived: false,
        models: [
          {
            id: 'model-b',
            displayName: 'Model B',
            remoteModelId: 'remote-b',
            enabled: true,
            archived: false,
            validation: { status: 'valid' },
          },
        ],
      },
    ],
  }
}

const request = {
  subtype: 'set_session_model' as const,
  provider_id: 'custom-openai',
  model_profile_id: 'model-b',
  expected_provider_config_revision: 7,
  operation_id: 'operation-1',
}

describe('activateSessionModelRequest', () => {
  test('resolves the remote model locally before atomic activation', async () => {
    const activate = mock(
      async selection =>
        ({
          ok: true,
          snapshot: Object.freeze(selection),
        }) as RuntimeActivationResult,
    )

    const result = await activateSessionModelRequest(request, 'idle', {
      loadConfiguration: configuration,
      activate,
      now: () => 123,
    })

    expect(result.ok).toBe(true)
    expect(activate).toHaveBeenCalledWith(
      {
        providerId: 'custom-openai',
        modelProfileId: 'model-b',
        resolvedModelId: 'remote-b',
        providerConfigRevision: 7,
        updatedAt: 123,
      },
      { operationId: 'operation-1', turnState: 'idle' },
    )
  })

  test('rejects stale revisions before selecting a remote model', async () => {
    const activate = mock(async () => ({
      ok: false as const,
      code: 'activation_failed' as const,
    }))

    expect(
      await activateSessionModelRequest(
        { ...request, expected_provider_config_revision: 6 },
        'idle',
        { loadConfiguration: configuration, activate, now: () => 123 },
      ),
    ).toEqual({ ok: false, code: 'provider_revision_conflict' })
    expect(activate).not.toHaveBeenCalled()
  })
})
