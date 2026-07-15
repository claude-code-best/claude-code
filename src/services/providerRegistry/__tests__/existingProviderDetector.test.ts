import { describe, expect, test } from 'bun:test'
import { detectExistingProviderProfiles } from '../existingProviderDetector.js'

describe('detectExistingProviderProfiles', () => {
  test('redacts every detected credential source', () => {
    const profiles = detectExistingProviderProfiles(
      {},
      {
        OPENAI_API_KEY: 'sk-secret',
        OPENAI_BASE_URL: 'https://api.example/v1',
        OPENAI_MODEL: 'reasoner-v2',
        CLAUDE_CODE_USE_BEDROCK: '1',
        AWS_PROFILE: 'dev',
      },
    )

    expect(JSON.stringify(profiles)).not.toContain('sk-secret')
    expect(
      profiles.find(provider => provider.kind === 'openai-compatible')?.auth,
    ).toEqual({
      scheme: 'api-key',
      source: 'environment',
      envName: 'OPENAI_API_KEY',
      configured: true,
    })
    expect(
      profiles.find(provider => provider.kind === 'openai-compatible')
        ?.models[0],
    ).toMatchObject({ remoteModelId: 'reasoner-v2' })
    expect(
      profiles.find(provider => provider.kind === 'bedrock')?.auth,
    ).toEqual({
      scheme: 'aws-iam',
      source: 'cloud-chain',
      envName: 'AWS_PROFILE',
      configured: true,
    })
  })

  test('detects all native, compatible, oauth, and cloud provider kinds', () => {
    const compatible = detectExistingProviderProfiles(
      { modelType: 'gemini' },
      {
        ANTHROPIC_BASE_URL: 'https://anthropic.example',
        ANTHROPIC_AUTH_TOKEN: 'anthropic-secret',
        OPENAI_BASE_URL: 'https://openai.example/v1',
        OPENAI_API_KEY: 'openai-secret',
        GEMINI_API_KEY: 'gemini-secret',
        GROK_API_KEY: 'grok-secret',
        CLAUDE_CODE_USE_BEDROCK: '1',
        CLAUDE_CODE_USE_VERTEX: '1',
        CLAUDE_CODE_USE_FOUNDRY: '1',
      },
    )
    const chatgpt = detectExistingProviderProfiles(
      { modelType: 'openai' },
      { OPENAI_AUTH_MODE: 'chatgpt' },
    )
    const kinds = new Set(
      [...compatible, ...chatgpt].map(provider => provider.kind),
    )

    expect(kinds).toEqual(
      new Set([
        'anthropic-compatible',
        'openai-compatible',
        'chatgpt',
        'gemini',
        'grok',
        'bedrock',
        'vertex',
        'foundry',
      ]),
    )
    const serialized = JSON.stringify([...compatible, ...chatgpt])
    for (const secret of [
      'anthropic-secret',
      'openai-secret',
      'gemini-secret',
      'grok-secret',
    ]) {
      expect(serialized).not.toContain(secret)
    }
  })

  test('prefers process environment references over settings references', () => {
    const profiles = detectExistingProviderProfiles(
      {
        modelType: 'openai',
        env: {
          OPENAI_API_KEY: 'settings-secret',
          OPENAI_BASE_URL: 'https://settings.example/v1',
        },
      },
      {
        OPENAI_API_KEY: 'process-secret',
        OPENAI_BASE_URL: 'https://process.example/v1',
      },
    )
    const openai = profiles.find(
      provider => provider.kind === 'openai-compatible',
    )

    expect(openai?.baseUrl).toBe('https://process.example/v1')
    expect(openai?.auth.source).toBe('environment')
    expect(JSON.stringify(profiles)).not.toContain('settings-secret')
    expect(JSON.stringify(profiles)).not.toContain('process-secret')
  })

  test('reports helper and proxy references without executing them', () => {
    const helper = detectExistingProviderProfiles(
      { apiKeyHelper: '/usr/local/bin/get-key' },
      {},
    )
    const proxy = detectExistingProviderProfiles(
      {},
      { ANTHROPIC_UNIX_SOCKET: '/tmp/claude-auth.sock' },
    )

    expect(helper[0]?.auth).toEqual({
      scheme: 'api-key',
      source: 'helper',
      configured: true,
    })
    expect(proxy[0]?.auth).toEqual({
      scheme: 'proxy',
      source: 'helper',
      envName: 'ANTHROPIC_UNIX_SOCKET',
      configured: true,
    })
    expect(JSON.stringify(proxy)).not.toContain('/tmp/claude-auth.sock')
  })

  test('removes user info and query parameters from detected base URLs', () => {
    const profiles = detectExistingProviderProfiles(
      {},
      {
        OPENAI_API_KEY: 'secret',
        OPENAI_BASE_URL:
          'https://user:password@api.example/v1?api_key=query-secret',
      },
    )
    const serialized = JSON.stringify(profiles)

    expect(serialized).not.toContain('password')
    expect(serialized).not.toContain('query-secret')
    expect(
      profiles.find(provider => provider.kind === 'openai-compatible')?.baseUrl,
    ).toBe('https://api.example/v1')
  })
})
