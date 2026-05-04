import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../../../../tests/mocks/log'

type MockAxiosResponse = {
  data: ArrayBuffer
  headers: Record<string, unknown>
  status: number
  statusText: string
}

type MockAxiosError = Error & {
  isAxiosError: true
  response?: {
    headers: Record<string, unknown>
    status: number
  }
}

let getMock: (url: string) => Promise<MockAxiosResponse>

mock.module('axios', () => {
  const axiosMock = {
    get: (url: string) => getMock(url),
    isAxiosError: (error: unknown): error is MockAxiosError =>
      typeof error === 'object' &&
      error !== null &&
      (error as { isAxiosError?: unknown }).isAxiosError === true,
  }

  return { default: axiosMock }
})

mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
}))

mock.module('src/services/api/claude.js', () => ({
  queryHaiku: async () => ({ message: { content: [] } }),
}))

mock.module('src/services/api/ollama/client.js', () => ({
  getOllamaClient: () => ({
    webFetch: async () =>
      new Response(
        JSON.stringify({
          title: 'Ollama Page',
          content: 'Cloud content',
          links: ['https://ollama.com/models'],
        }),
        { status: 200, statusText: 'OK' },
      ),
  }),
}))

mock.module('src/utils/http.js', () => ({
  getWebFetchUserAgent: () => 'TestAgent/1.0',
}))

mock.module('src/utils/model/providers.js', () => ({
  getAPIProvider: () => 'ollama',
}))

mock.module('src/utils/log.ts', logMock)

mock.module('src/utils/mcpOutputStorage.js', () => ({
  isBinaryContentType: (contentType: string) =>
    !contentType.toLowerCase().startsWith('text/'),
  persistBinaryContent: async () => ({
    filepath: '/tmp/webfetch-test.bin',
    size: 0,
  }),
}))

mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => ({}),
  getSettings_DEPRECATED: () => ({ skipWebFetchPreflight: true }),
}))

beforeEach(() => {
  delete process.env.OLLAMA_USE_NATIVE_WEB_FETCH
  getMock = async () => ({
    data: new TextEncoder().encode('hello').buffer,
    headers: { 'content-type': 'text/plain' },
    status: 200,
    statusText: 'OK',
  })
})

describe('WebFetch response headers', () => {
  test('reads redirect Location from AxiosHeaders-style get()', async () => {
    getMock = async () => {
      const error = new Error('redirect') as MockAxiosError
      error.isAxiosError = true
      error.response = {
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'location' ? '/next' : undefined,
        },
        status: 302,
      }
      throw error
    }

    const { getWithPermittedRedirects } = await import('../utils')
    const result = await getWithPermittedRedirects(
      'https://example.com/old',
      new AbortController().signal,
      () => false,
    )

    expect(result).toEqual({
      type: 'redirect',
      originalUrl: 'https://example.com/old',
      redirectUrl: 'https://example.com/next',
      statusCode: 302,
    })
  })

  test('reads proxy block markers from normalized headers', async () => {
    getMock = async () => {
      const error = new Error('blocked') as MockAxiosError
      error.isAxiosError = true
      error.response = {
        headers: { 'x-proxy-error': 'blocked-by-allowlist' },
        status: 403,
      }
      throw error
    }

    const { getWithPermittedRedirects } = await import('../utils')

    await expect(
      getWithPermittedRedirects(
        'https://blocked.example/path',
        new AbortController().signal,
        () => false,
      ),
    ).rejects.toThrow('EGRESS_BLOCKED')
  })

  test('normalizes array content-type before cache and parsing', async () => {
    process.env.OLLAMA_USE_NATIVE_WEB_FETCH = 'false'
    getMock = async () => ({
      data: new TextEncoder().encode('plain body').buffer,
      headers: { 'content-type': ['text/plain', 'charset=utf-8'] },
      status: 200,
      statusText: 'OK',
    })

    const { clearWebFetchCache, getURLMarkdownContent } = await import(
      '../utils'
    )
    clearWebFetchCache()

    const result = await getURLMarkdownContent(
      'https://example.com/plain.txt',
      new AbortController(),
    )

    expect('type' in result).toBe(false)
    if ('type' in result) {
      throw new Error('unexpected redirect result')
    }
    expect(result.content).toBe('plain body')
    expect(result.contentType).toBe('text/plain, charset=utf-8')
  })

  test('uses Ollama native web_fetch when enabled', async () => {
    process.env.OLLAMA_USE_NATIVE_WEB_FETCH = 'true'

    const { getURLMarkdownContent } = await import('../utils')
    const result = await getURLMarkdownContent(
      'https://ollama.com',
      new AbortController(),
    )

    expect('type' in result).toBe(false)
    if ('type' in result) {
      throw new Error('unexpected redirect result')
    }
    expect(result.content).toContain('# Ollama Page')
    expect(result.content).toContain('Cloud content')
    expect(result.content).toContain('https://ollama.com/models')
    expect(result.contentType).toBe('text/markdown')
  })
})
