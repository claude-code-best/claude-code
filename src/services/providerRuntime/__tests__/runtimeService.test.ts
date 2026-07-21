import { describe, expect, test } from 'bun:test'
import {
  getActiveProviderRuntimeSnapshot,
  ProviderRuntimeService,
} from '../runtimeService.js'
import type { ProviderRuntimeDependencies } from '../runtimeService.js'
import type { ProviderRuntimeSelection } from '../types.js'
import type { ProviderConfigurationV2 } from '../../providerRegistry/types.js'
import type { APIProvider } from '../../../utils/model/providers.js'

function configuration(): ProviderConfigurationV2 {
  return {
    version: 2,
    revision: 2,
    defaultModel: null,
    providers: [
      {
        id: 'provider-a',
        displayName: 'Provider A',
        kind: 'openai-compatible',
        baseUrl: 'https://a.example/v1',
        auth: {
          scheme: 'api-key',
          source: 'environment',
          envName: 'PROVIDER_A_KEY',
        },
        compatRule: 'groq',
        enabled: true,
        archived: false,
        models: [
          {
            id: 'model-a',
            displayName: 'Model A',
            remoteModelId: 'remote-a',
            enabled: true,
            archived: false,
            validation: { status: 'valid' },
          },
        ],
      },
      {
        id: 'provider-b',
        displayName: 'Provider B',
        kind: 'gemini',
        baseUrl: 'https://b.example',
        auth: {
          scheme: 'api-key',
          source: 'environment',
          envName: 'PROVIDER_B_KEY',
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

const selection = (suffix: 'a' | 'b'): ProviderRuntimeSelection => ({
  providerId: `provider-${suffix}`,
  modelProfileId: `model-${suffix}`,
  resolvedModelId: `remote-${suffix}`,
  providerConfigRevision: 2,
  updatedAt: 1,
})

function createHarness() {
  let environment: Record<string, string | undefined> = {
    PROVIDER_A_KEY: 'secret-a',
    PROVIDER_B_KEY: 'secret-b',
    UNRELATED: 'keep',
  }
  let providerOverride: APIProvider | null = null
  let clearCount = 0
  let validationError: Error | null = null
  let environmentRestoreError: Error | null = null
  let validateCount = 0
  const dependencies: ProviderRuntimeDependencies = {
    loadConfiguration: configuration,
    getEnvironment: () => ({ ...environment }),
    applyEnvironment: next => {
      if (
        environmentRestoreError !== null &&
        next['OPENAI_MODEL'] === 'remote-a'
      ) {
        throw environmentRestoreError
      }
      environment = { ...next }
    },
    getProviderOverride: () => providerOverride,
    setProviderOverride: provider => {
      providerOverride = provider
    },
    clearDerivedCaches: () => {
      clearCount += 1
    },
    validateClient: async () => {
      validateCount += 1
      if (validationError !== null) throw validationError
    },
    isModelAllowed: () => true,
  }
  return {
    service: new ProviderRuntimeService(dependencies),
    environment: () => ({ ...environment }),
    providerOverride: () => providerOverride,
    clearCount: () => clearCount,
    validateCount: () => validateCount,
    failValidationWith: (error: Error | null) => {
      validationError = error
    },
    failEnvironmentRestoreWith: (error: Error | null) => {
      environmentRestoreError = error
    },
  }
}

describe('ProviderRuntimeService', () => {
  test('publishes all runtime state only after successful validation', async () => {
    const harness = createHarness()

    const result = await harness.service.activate(selection('a'), {
      operationId: 'activate-a',
      turnState: 'idle',
    })

    expect(result).toMatchObject({
      ok: true,
      snapshot: { providerId: 'provider-a', resolvedModelId: 'remote-a' },
    })
    expect(harness.service.current()?.providerId).toBe('provider-a')
    expect(harness.environment()).toMatchObject({
      OPENAI_MODEL: 'remote-a',
      OPENAI_API_KEY: 'secret-a',
      UNRELATED: 'keep',
    })
    expect(harness.providerOverride()).toBe('openai')
    expect(harness.clearCount()).toBe(1)
  })

  test('rolls back every runtime surface when client validation fails', async () => {
    const harness = createHarness()
    await harness.service.activate(selection('a'), {
      operationId: 'activate-a',
      turnState: 'idle',
    })
    const environmentA = harness.environment()
    const clearsAfterA = harness.clearCount()
    harness.failValidationWith(new Error('bad endpoint'))

    const result = await harness.service.activate(selection('b'), {
      operationId: 'activate-b',
      turnState: 'idle',
    })

    expect(result).toEqual({ ok: false, code: 'endpoint_unreachable' })
    expect(harness.service.current()?.providerId).toBe('provider-a')
    expect(harness.environment()).toEqual(environmentA)
    expect(harness.providerOverride()).toBe('openai')
    expect(harness.clearCount()).toBe(clearsAfterA + 2)
  })

  test('rejects activation while a turn is running', async () => {
    const harness = createHarness()

    expect(
      await harness.service.activate(selection('a'), {
        operationId: 'busy',
        turnState: 'running',
      }),
    ).toEqual({ ok: false, code: 'runtime_busy' })
    expect(harness.clearCount()).toBe(0)
    expect(harness.validateCount()).toBe(0)
  })

  test('replays an operation without activating twice', async () => {
    const harness = createHarness()
    const request = {
      operationId: 'activate-once',
      turnState: 'idle' as const,
    }

    const first = await harness.service.activate(selection('a'), request)
    const replay = await harness.service.activate(selection('a'), request)

    expect(replay).toEqual(first)
    expect(harness.validateCount()).toBe(1)
    expect(harness.clearCount()).toBe(1)
  })

  test('continues best-effort rollback when one restoration surface fails', async () => {
    const harness = createHarness()
    await harness.service.activate(selection('a'), {
      operationId: 'activate-a',
      turnState: 'idle',
    })
    const clearsAfterA = harness.clearCount()
    harness.failValidationWith(new Error('bad endpoint'))
    harness.failEnvironmentRestoreWith(new Error('restore failed'))

    const result = await harness.service.activate(selection('b'), {
      operationId: 'activate-b',
      turnState: 'idle',
    })

    expect(result).toEqual({ ok: false, code: 'endpoint_unreachable' })
    expect(harness.providerOverride()).toBe('openai')
    expect(harness.clearCount()).toBe(clearsAfterA + 2)
    expect(harness.service.current()?.providerId).toBe('provider-a')
  })

  test('failed activation from another service preserves the published snapshot', async () => {
    const activeHarness = createHarness()
    await activeHarness.service.activate(selection('a'), {
      operationId: 'publish-a',
      turnState: 'idle',
    })
    const failingHarness = createHarness()
    failingHarness.failValidationWith(new Error('bad endpoint'))

    await failingHarness.service.activate(selection('b'), {
      operationId: 'reject-b',
      turnState: 'idle',
    })

    expect(getActiveProviderRuntimeSnapshot()?.providerId).toBe('provider-a')
  })
})
