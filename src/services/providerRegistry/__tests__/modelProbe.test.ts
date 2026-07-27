import { describe, expect, test } from 'bun:test'
import { probeProviderModel } from '../modelProbe.js'
import type { ModelProbeDependencies } from '../modelProbe.js'
import type { ProviderConfigurationV2, ProviderKind } from '../types.js'

function config(
  kind: ProviderKind,
  auth: ProviderConfigurationV2['providers'][number]['auth'],
): ProviderConfigurationV2 {
  return {
    version: 2,
    revision: 4,
    defaultModel: null,
    providers: [
      {
        id: 'p1',
        displayName: 'Provider One',
        kind,
        baseUrl: 'https://api.example/v1',
        auth,
        enabled: true,
        archived: false,
        models: [
          {
            id: 'm1',
            displayName: 'Model One',
            remoteModelId: 'remote-model-1',
            enabled: true,
            archived: false,
            validation: { status: 'unverified' },
          },
        ],
      },
    ],
  }
}

const openAiConfig = () =>
  config('openai-compatible', {
    scheme: 'api-key',
    source: 'environment',
    envName: 'OPENAI_API_KEY',
  })

/** A fetch stub that records the URL/headers and returns a fixed status. */
function fetchReturning(status: number): {
  fetch: typeof globalThis.fetch
  calls: Array<{ url: string; headers: Record<string, string> }>
} {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      headers: (init.headers as Record<string, string>) ?? {},
    })
    return { status } as Response
  }) as unknown as typeof globalThis.fetch
  return { fetch: fetchImpl, calls }
}

function overrides(
  fetchImpl: typeof fetch,
  env: Record<string, string | undefined> = { OPENAI_API_KEY: 'sk-test' },
): Partial<ModelProbeDependencies> {
  return {
    fetch: fetchImpl,
    baseEnv: env,
    hydrateSecrets: () => {},
    isModelAllowed: () => true,
    timeoutMs: 1000,
  }
}

describe('probeProviderModel', () => {
  test('marks a model valid on a 2xx models response', async () => {
    const { fetch, calls } = fetchReturning(200)
    const outcome = await probeProviderModel(
      openAiConfig(),
      'p1',
      'm1',
      overrides(fetch),
    )
    expect(outcome).toEqual({ status: 'valid' })
    // Uses the provider base URL + bearer credential a live session would.
    expect(calls[0]?.url).toBe('https://api.example/v1/models')
    expect(calls[0]?.headers.Authorization).toBe('Bearer sk-test')
  })

  test('marks a model invalid when credentials are rejected (401)', async () => {
    const { fetch } = fetchReturning(401)
    const outcome = await probeProviderModel(
      openAiConfig(),
      'p1',
      'm1',
      overrides(fetch),
    )
    expect(outcome).toEqual({
      status: 'invalid',
      code: 'authentication_failed',
    })
  })

  test('marks a wrong base URL invalid (404)', async () => {
    const { fetch } = fetchReturning(404)
    const outcome = await probeProviderModel(
      openAiConfig(),
      'p1',
      'm1',
      overrides(fetch),
    )
    expect(outcome).toEqual({ status: 'invalid', code: 'endpoint_not_found' })
  })

  test('reports a transient error (does not fake a status) on timeout', async () => {
    const aborting = (async () => {
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    }) as unknown as typeof fetch
    const outcome = await probeProviderModel(
      openAiConfig(),
      'p1',
      'm1',
      overrides(aborting),
    )
    expect(outcome).toEqual({ status: 'error', code: 'probe_timeout' })
  })

  test('reports a transient error on network failure', async () => {
    const failing = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const outcome = await probeProviderModel(
      openAiConfig(),
      'p1',
      'm1',
      overrides(failing),
    )
    expect(outcome).toEqual({ status: 'error', code: 'provider_unreachable' })
  })

  test('reports invalid when no credential is configured', async () => {
    const { fetch, calls } = fetchReturning(200)
    const outcome = await probeProviderModel(
      openAiConfig(),
      'p1',
      'm1',
      overrides(fetch, {}), // env without OPENAI_API_KEY
    )
    expect(outcome).toEqual({
      status: 'invalid',
      code: 'authentication_required',
    })
    // Never contacts the network without a credential.
    expect(calls).toHaveLength(0)
  })

  test('reports unsupported for cloud-chain kinds with no cheap probe', async () => {
    const { fetch, calls } = fetchReturning(200)
    const outcome = await probeProviderModel(
      config('bedrock', { scheme: 'aws-iam', source: 'cloud-chain' }),
      'p1',
      'm1',
      overrides(fetch, {}),
    )
    expect(outcome).toEqual({
      status: 'unsupported',
      code: 'probe_unsupported_provider',
    })
    expect(calls).toHaveLength(0)
  })
})
