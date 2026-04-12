import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

const originalBraveSearchApiKey = process.env.BRAVE_SEARCH_API_KEY
const originalBraveApiKey = process.env.BRAVE_API_KEY

describe('BraveSearchAdapter.search', () => {
  const createAdapter = async () => {
    const { BraveSearchAdapter } = await import('../adapters/braveAdapter')
    return new BraveSearchAdapter()
  }

  const SAMPLE_RESPONSE = {
    grounding: {
      generic: [
        {
          title: 'Result One',
          url: 'https://example.com/result1',
          snippets: ['Snippet one'],
        },
        {
          title: 'Result Two',
          url: 'https://example.com/result2',
          snippets: ['Snippet two'],
        },
      ],
    },
  }

  beforeEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-brave-key'
    delete process.env.BRAVE_API_KEY
  })

  afterEach(() => {
    mock.restore()

    if (originalBraveSearchApiKey === undefined) {
      delete process.env.BRAVE_SEARCH_API_KEY
    } else {
      process.env.BRAVE_SEARCH_API_KEY = originalBraveSearchApiKey
    }

    if (originalBraveApiKey === undefined) {
      delete process.env.BRAVE_API_KEY
    } else {
      process.env.BRAVE_API_KEY = originalBraveApiKey
    }
  })

  test('returns parsed results from Brave LLM context payload', async () => {
    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: SAMPLE_RESPONSE })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test query', {})

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'Result One',
      url: 'https://example.com/result1',
      snippet: 'Snippet one',
    })
    expect(results[1].title).toBe('Result Two')
  })

  test('calls onProgress with query_update and search_results_received', async () => {
    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: SAMPLE_RESPONSE })),
        isCancel: () => false,
      },
    }))

    const progressCalls: any[] = []
    const onProgress = (p: any) => progressCalls.push(p)

    const adapter = await createAdapter()
    await adapter.search('test', { onProgress })

    expect(progressCalls).toHaveLength(2)
    expect(progressCalls[0]).toEqual({
      type: 'query_update',
      query: 'test',
    })
    expect(progressCalls[1]).toEqual({
      type: 'search_results_received',
      resultCount: 2,
      query: 'test',
    })
  })

  test('filters results by allowedDomains', async () => {
    const mixedResponse = {
      grounding: {
        generic: [
          { title: 'Allowed', url: 'https://allowed.com/a' },
          { title: 'Blocked', url: 'https://blocked.com/b' },
        ],
      },
    }

    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: mixedResponse })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', {
      allowedDomains: ['allowed.com'],
    })

    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://allowed.com/a')
  })

  test('filters results by blockedDomains', async () => {
    const mixedResponse = {
      grounding: {
        generic: [
          { title: 'Good', url: 'https://good.com/a' },
          { title: 'Spam', url: 'https://spam.com/b' },
        ],
      },
    }

    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: mixedResponse })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', {
      blockedDomains: ['spam.com'],
    })

    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://good.com/a')
  })

  test('filters subdomains with allowedDomains', async () => {
    const response = {
      grounding: {
        generic: [
          { title: 'Subdomain', url: 'https://docs.example.com/page' },
          { title: 'Other', url: 'https://other.com/page' },
        ],
      },
    }

    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: response })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', {
      allowedDomains: ['example.com'],
    })

    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://docs.example.com/page')
  })

  test('throws AbortError when signal is already aborted', async () => {
    mock.module('axios', () => ({
      default: {
        get: mock((_url: string, config: any) => {
          if (config?.signal?.aborted) {
            const err = new Error('canceled')
            ;(err as any).__CANCEL__ = true
            return Promise.reject(err)
          }
          return Promise.resolve({ data: SAMPLE_RESPONSE })
        }),
        isCancel: (e: any) => e?.__CANCEL__ === true,
      },
    }))

    const adapter = await createAdapter()
    const controller = new AbortController()
    controller.abort()

    const { AbortError } = await import('../../../utils/errors')
    await expect(
      adapter.search('test', { signal: controller.signal }),
    ).rejects.toThrow(AbortError)
  })

  test('re-throws non-abort axios errors', async () => {
    const networkError = new Error('Network error')
    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.reject(networkError)),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    await expect(adapter.search('test', {})).rejects.toThrow('Network error')
  })

  test('sends the documented HTTPS endpoint with query params and auth header', async () => {
    const axiosGet = mock(() => Promise.resolve({ data: SAMPLE_RESPONSE }))
    mock.module('axios', () => ({
      default: {
        get: axiosGet,
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    await adapter.search('hello world & special=chars', {})

    expect(axiosGet.mock.calls).toHaveLength(1)
    expect((axiosGet.mock.calls as any[][])[0][0]).toBe(
      'https://api.search.brave.com/res/v1/llm/context',
    )
    expect((axiosGet.mock.calls as any[][])[0][1]).toMatchObject({
      params: { q: 'hello world & special=chars' },
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': 'test-brave-key',
      },
    })
  })

  test('accepts BRAVE_API_KEY as a fallback env var', async () => {
    delete process.env.BRAVE_SEARCH_API_KEY
    process.env.BRAVE_API_KEY = 'fallback-key'

    const axiosGet = mock(() => Promise.resolve({ data: SAMPLE_RESPONSE }))
    mock.module('axios', () => ({
      default: {
        get: axiosGet,
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    await adapter.search('test', {})

    expect((axiosGet.mock.calls as any[][])[0][1].headers).toMatchObject({
      'X-Subscription-Token': 'fallback-key',
    })
  })

  test('throws when no Brave API key is configured', async () => {
    delete process.env.BRAVE_SEARCH_API_KEY
    delete process.env.BRAVE_API_KEY

    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: SAMPLE_RESPONSE })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    await expect(adapter.search('test', {})).rejects.toThrow(
      'BraveSearchAdapter requires BRAVE_SEARCH_API_KEY or BRAVE_API_KEY',
    )
  })
})
