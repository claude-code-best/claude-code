import { describe, expect, test } from 'bun:test'
import {
  discoverProviderModels,
  type ModelDiscoveryDependencies,
} from '../modelDiscovery.js'
import type { ProviderConfigurationV2, ProviderKind } from '../types.js'

function config(
  kind: ProviderKind,
  options: {
    baseUrl?: string
    scheme?: ProviderConfigurationV2['providers'][number]['auth']['scheme']
  } = {},
): ProviderConfigurationV2 {
  return {
    version: 2,
    revision: 3,
    defaultModel: null,
    providers: [
      {
        id: 'provider-one',
        displayName: 'Provider One',
        kind,
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        auth: {
          scheme: options.scheme ?? 'api-key',
          source: 'environment',
          ...(kind === 'bedrock' ||
          kind === 'vertex' ||
          kind === 'foundry' ||
          kind === 'chatgpt'
            ? {}
            : {
                envName:
                  kind === 'gemini'
                    ? 'GEMINI_API_KEY'
                    : kind === 'grok'
                      ? 'GROK_API_KEY'
                      : kind === 'anthropic' || kind === 'anthropic-compatible'
                        ? 'ANTHROPIC_API_KEY'
                        : 'OPENAI_API_KEY',
              }),
        },
        enabled: true,
        archived: false,
        models: [],
      },
    ],
  }
}

function dependencies(
  fetchImpl: typeof fetch,
  baseEnv: Record<string, string | undefined>,
): Partial<ModelDiscoveryDependencies> {
  return {
    fetch: fetchImpl,
    baseEnv,
    hydrateSecrets: () => {},
    timeoutMs: 1_000,
  }
}

describe('discoverProviderModels', () => {
  test('fetches and normalizes OpenAI-compatible model metadata without requiring configured models', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = []
    const fetchImpl = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const headers = new Headers(init?.headers)
      calls.push({
        url: String(input),
        authorization: headers.get('Authorization'),
      })
      return Response.json({
        data: [
          { id: 'zeta-2', owned_by: 'vendor' },
          { id: 'alpha-1', owned_by: 'vendor' },
        ],
      })
    }) as typeof fetch

    const outcome = await discoverProviderModels(
      config('openai-compatible', {
        baseUrl: 'https://api.example/v1/chat/completions',
      }),
      'provider-one',
      dependencies(fetchImpl, { OPENAI_API_KEY: 'secret-value' }),
    )

    expect(outcome).toEqual({
      status: 'success',
      models: [
        {
          remoteModelId: 'alpha-1',
          displayName: 'alpha-1',
          ownedBy: 'vendor',
        },
        {
          remoteModelId: 'zeta-2',
          displayName: 'zeta-2',
          ownedBy: 'vendor',
        },
      ],
    })
    expect(calls).toEqual([
      {
        url: 'https://api.example/v1/models',
        authorization: 'Bearer secret-value',
      },
    ])
  })

  test('follows Gemini pagination, strips the models prefix, and excludes embedding-only models', async () => {
    const urls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input)
      urls.push(url)
      const page = new URL(url).searchParams.get('pageToken')
      return Response.json(
        page
          ? {
              models: [
                {
                  name: 'models/gemini-pro',
                  displayName: 'Gemini Pro',
                  supportedGenerationMethods: ['generateContent'],
                },
              ],
            }
          : {
              models: [
                {
                  name: 'models/text-embedding-004',
                  displayName: 'Embedding',
                  supportedGenerationMethods: ['embedContent'],
                },
              ],
              nextPageToken: 'next-page',
            },
      )
    }) as typeof fetch

    const outcome = await discoverProviderModels(
      config('gemini'),
      'provider-one',
      dependencies(fetchImpl, { GEMINI_API_KEY: 'gemini-secret' }),
    )

    expect(outcome).toEqual({
      status: 'success',
      models: [{ remoteModelId: 'gemini-pro', displayName: 'Gemini Pro' }],
    })
    expect(urls).toHaveLength(2)
    expect(new URL(urls[0]!).searchParams.get('key')).toBe('gemini-secret')
    expect(new URL(urls[1]!).searchParams.get('pageToken')).toBe('next-page')
  })

  test('uses Anthropic pagination and bearer authentication', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = []
    const fetchImpl = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input)
      calls.push({
        url,
        authorization: new Headers(init?.headers).get('Authorization'),
      })
      const after = new URL(url).searchParams.get('after_id')
      return Response.json(
        after
          ? {
              data: [{ id: 'claude-b', display_name: 'Claude B' }],
              has_more: false,
            }
          : {
              data: [{ id: 'claude-a', display_name: 'Claude A' }],
              has_more: true,
              last_id: 'claude-a',
            },
      )
    }) as typeof fetch

    const anthropicConfig = config('anthropic', { scheme: 'bearer' })
    anthropicConfig.providers[0]!.auth.envName = 'ANTHROPIC_AUTH_TOKEN'
    const outcome = await discoverProviderModels(
      anthropicConfig,
      'provider-one',
      dependencies(fetchImpl, {
        ANTHROPIC_AUTH_TOKEN: 'anthropic-secret',
      }),
    )

    expect(outcome).toEqual({
      status: 'success',
      models: [
        { remoteModelId: 'claude-a', displayName: 'Claude A' },
        { remoteModelId: 'claude-b', displayName: 'Claude B' },
      ],
    })
    expect(calls[0]?.url).toContain('/v1/models?limit=1000')
    expect(calls[1]?.url).toContain('after_id=claude-a')
    expect(calls[0]?.authorization).toBe('Bearer anthropic-secret')
  })

  test('does not contact the network when credentials are missing or the provider kind is unsupported', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return Response.json({ data: [] })
    }) as unknown as typeof fetch

    expect(
      await discoverProviderModels(
        config('openai-compatible'),
        'provider-one',
        dependencies(fetchImpl, {}),
      ),
    ).toEqual({ status: 'error', code: 'authentication_required' })
    expect(
      await discoverProviderModels(
        config('bedrock', { scheme: 'aws-iam' }),
        'provider-one',
        dependencies(fetchImpl, {}),
      ),
    ).toEqual({
      status: 'unsupported',
      code: 'model_discovery_unsupported_provider',
    })
    expect(calls).toBe(0)
  })

  test('maps rejected credentials without exposing the response body', async () => {
    const fetchImpl = (async () =>
      Response.json(
        { api_key: 'must-not-escape', message: 'bad credential' },
        { status: 401 },
      )) as unknown as typeof fetch

    expect(
      await discoverProviderModels(
        config('openai-compatible'),
        'provider-one',
        dependencies(fetchImpl, { OPENAI_API_KEY: 'bad-secret' }),
      ),
    ).toEqual({ status: 'error', code: 'authentication_failed' })
  })
})
