import { beforeEach, describe, expect, test } from 'bun:test'
import {
  storeCreateEnvironment,
  storeCreateSession,
  storeGetSession,
  storeReset,
} from '../store'
import { readEnvironmentProviderCatalog } from '../services/provider-catalog'
import { recoverLegacySessionModel } from '../services/session-model'
import { publishSessionEvent } from '../services/transport'

function providerCapabilities(duplicateRemoteId = false) {
  return {
    provider_model_catalog_v1: {
      version: 1,
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
            configured: true,
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
        ...(duplicateRemoteId
          ? [
              {
                id: 'second-openai',
                displayName: 'Second OpenAI',
                kind: 'openai-compatible',
                baseUrl: 'https://second.example.test/v1',
                auth: {
                  scheme: 'api-key',
                  source: 'environment',
                  envName: 'SECOND_OPENAI_API_KEY',
                  configured: true,
                },
                enabled: true,
                archived: false,
                models: [
                  {
                    id: 'model-b-copy',
                    displayName: 'Model B copy',
                    remoteModelId: 'remote-b',
                    enabled: true,
                    archived: false,
                    validation: { status: 'valid' },
                  },
                ],
              },
            ]
          : []),
      ],
      features: {
        catalogWrite: false,
        sessionPersistence: true,
        runtimeSwitch: true,
        secretControl: false,
      },
    },
  }
}

describe('session model confirmation', () => {
  let sessionId: string

  beforeEach(() => {
    storeReset()
    const environment = storeCreateEnvironment({
      secret: 'secret',
      capabilities: providerCapabilities(),
    })
    sessionId = storeCreateSession({
      environmentId: environment.id,
    }).id
  })

  test('browser control traffic cannot update the session model', () => {
    publishSessionEvent(
      sessionId,
      'control_request',
      {
        request: {
          subtype: 'set_session_model',
          provider_id: 'custom-openai',
          model_profile_id: 'model-b',
          expected_provider_config_revision: 7,
          operation_id: 'operation-1',
        },
      },
      'outbound',
      { producer: 'web', sourceEventId: 'request-1' },
    )

    expect(storeGetSession(sessionId)?.modelSelection).toBeNull()
  })

  test('updates only from a valid, deduplicated worker confirmation', () => {
    const payload = {
      type: 'system',
      subtype: 'session_model_changed',
      session_id: sessionId,
      uuid: 'operation-1',
      operation_id: 'operation-1',
      provider_id: 'custom-openai',
      model_profile_id: 'model-b',
      resolved_model_id: 'remote-b',
      provider_config_revision: 7,
      updated_at: 123,
    }
    const first = publishSessionEvent(sessionId, 'system', payload, 'inbound', {
      producer: 'v2-worker',
      sourceEventId: 'operation-1',
    })
    const replay = publishSessionEvent(
      sessionId,
      'system',
      payload,
      'inbound',
      { producer: 'v2-worker', sourceEventId: 'operation-1' },
    )

    expect(first.duplicate).toBe(false)
    expect(replay.duplicate).toBe(true)
    expect(storeGetSession(sessionId)?.modelSelection).toEqual({
      providerId: 'custom-openai',
      modelProfileId: 'model-b',
      resolvedModelId: 'remote-b',
      providerConfigRevision: 7,
      updatedAt: 123,
    })
  })

  test('ignores failed or catalog-mismatched confirmations', () => {
    for (const payload of [
      {
        subtype: 'session_model_change_failed',
        operation_id: 'operation-failed',
      },
      {
        subtype: 'session_model_changed',
        uuid: 'operation-mismatch',
        operation_id: 'operation-mismatch',
        provider_id: 'custom-openai',
        model_profile_id: 'model-b',
        resolved_model_id: 'forged-remote',
        provider_config_revision: 7,
        updated_at: 456,
      },
    ]) {
      publishSessionEvent(sessionId, 'system', payload, 'inbound', {
        producer: 'v2-worker',
        sourceEventId: String(payload.operation_id),
      })
    }

    expect(storeGetSession(sessionId)?.modelSelection).toBeNull()
  })

  test('recovers only a unique legacy model and preserves an existing snapshot', () => {
    const parsed = readEnvironmentProviderCatalog(providerCapabilities())
    if (!parsed.supported) throw new Error('expected supported catalog')
    const session = storeGetSession(sessionId)!
    const init = {
      id: 'init-1',
      sessionId,
      seqNum: 1,
      type: 'system',
      direction: 'inbound' as const,
      payload: { subtype: 'init', model: 'remote-b' },
      sourceEventId: null,
      dedupeScope: null,
      createdAt: 321,
    }

    expect(recoverLegacySessionModel(session, parsed.catalog, init)).toEqual({
      persistedSelection: {
        providerId: 'custom-openai',
        modelProfileId: 'model-b',
        resolvedModelId: 'remote-b',
        providerConfigRevision: 7,
        updatedAt: 321,
      },
      legacyResolvedModelId: 'remote-b',
    })

    session.modelSelection = {
      providerId: 'custom-openai',
      modelProfileId: 'model-b',
      resolvedModelId: 'remote-b',
      providerConfigRevision: 6,
      updatedAt: 123,
    }
    expect(
      recoverLegacySessionModel(session, parsed.catalog, null)
        .persistedSelection,
    ).toEqual(session.modelSelection)
  })

  test('never assigns the current default to an ambiguous legacy session', () => {
    const parsed = readEnvironmentProviderCatalog(providerCapabilities(true))
    if (!parsed.supported) throw new Error('expected supported catalog')
    const result = recoverLegacySessionModel(
      storeGetSession(sessionId)!,
      parsed.catalog,
      {
        id: 'init-ambiguous',
        sessionId,
        seqNum: 1,
        type: 'system',
        direction: 'inbound',
        payload: { subtype: 'init', model: 'remote-b' },
        sourceEventId: null,
        dedupeScope: null,
        createdAt: 456,
      },
    )

    expect(result.persistedSelection).toBeNull()
    expect(result.legacyResolvedModelId).toBe('remote-b')
    expect(
      recoverLegacySessionModel(
        storeGetSession(sessionId)!,
        parsed.catalog,
        null,
      ),
    ).toEqual({ persistedSelection: null, legacyResolvedModelId: null })
  })

  test('calibrates a stale session snapshot from a verified structured init', () => {
    publishSessionEvent(
      sessionId,
      'system',
      {
        type: 'system',
        subtype: 'init',
        model: 'remote-b',
        provider_id: 'custom-openai',
        model_profile_id: 'model-b',
        resolved_model_id: 'remote-b',
        provider_config_revision: 7,
      },
      'inbound',
      { producer: 'v2-worker', sourceEventId: 'init-structured' },
    )

    expect(storeGetSession(sessionId)?.modelSelection).toMatchObject({
      providerId: 'custom-openai',
      modelProfileId: 'model-b',
      resolvedModelId: 'remote-b',
      providerConfigRevision: 7,
    })
  })
})
