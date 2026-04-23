import { afterEach, describe, expect, mock, test } from 'bun:test'

const _abortMock = () => ({
  AbortError: class AbortError extends Error {
    constructor(message?: string) { super(message); this.name = 'AbortError' }
  },
  isAbortError: (e: unknown) => e instanceof Error && (e as Error).name === 'AbortError',
})
mock.module('src/utils/errors.js', _abortMock)
mock.module('src/utils/errors', _abortMock)

describe('ExaSearchAdapter.search', () => {
  const createAdapter = async () => {
    const { ExaSearchAdapter } = await import('../adapters/exaAdapter')
    return new ExaSearchAdapter()
  }

  // Exa MCP returns SSE lines like: data: {"result":{"content":[{"type":"text","text":"..."}]}}
  const buildSseResponse = (text: string) => `data: ${JSON.stringify({ result: { content: [{ type: 'text', text }] } })}\n`

  const STRUCTURED_TEXT = [
    'Title: Example Result 1',
    'URL: https://example.com/page1',
    'Content: This is the content snippet for page 1.',
    '',
    '---',
    '',
    'Title: Example Result 2',
    'URL: https://example.com/page2',
    'Content: This is the content snippet for page 2.',
  ].join('\n')

  afterEach(() => {
    mock.restore()
  })

  test('parses structured Title/URL/Content blocks from SSE response', async () => {
    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: buildSseResponse(STRUCTURED_TEXT) })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test query', {})

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'Example Result 1',
      url: 'https://example.com/page1',
      snippet: 'This is the content snippet for page 1.',
    })
    expect(results[1]).toEqual({
      title: 'Example Result 2',
      url: 'https://example.com/page2',
      snippet: 'This is the content snippet for page 2.',
    })
  })

  test('parses markdown link fallback when no structured blocks', async () => {
    const markdownText = '- [React Docs](https://react.dev/docs)\n- [React Hooks](https://react.dev/hooks)'
    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: buildSseResponse(markdownText) })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('react', {})

    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'React Docs',
      url: 'https://react.dev/docs',
      snippet: undefined,
    })
    expect(results[1].url).toBe('https://react.dev/hooks')
  })

  test('parses plain URL fallback', async () => {
    const plainUrlText = 'https://example.com/page1\nhttps://example.com/page2'
    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: buildSseResponse(plainUrlText) })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', {})

    expect(results).toHaveLength(2)
    expect(results[0].url).toBe('https://example.com/page1')
  })

  test('returns empty array for empty response', async () => {
    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: '' })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', {})

    expect(results).toHaveLength(0)
  })

  test('parses direct JSON response (non-SSE fallback)', async () => {
    const jsonResponse = JSON.stringify({
      result: { content: [{ type: 'text', text: STRUCTURED_TEXT }] },
    })
    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: jsonResponse })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', {})

    expect(results).toHaveLength(2)
    expect(results[0].url).toBe('https://example.com/page1')
  })

  test('calls onProgress with query_update and search_results_received', async () => {
    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: buildSseResponse(STRUCTURED_TEXT) })),
        isCancel: () => false,
      },
    }))

    const progressCalls: any[] = []
    const onProgress = (p: any) => progressCalls.push(p)

    const adapter = await createAdapter()
    await adapter.search('test', { onProgress })

    expect(progressCalls).toHaveLength(2)
    expect(progressCalls[0]).toEqual({ type: 'query_update', query: 'test' })
    expect(progressCalls[1]).toEqual({
      type: 'search_results_received',
      resultCount: 2,
      query: 'test',
    })
  })

  test('filters results by allowedDomains', async () => {
    const mixedText = [
      'Title: Allowed',
      'URL: https://allowed.com/a',
      '---',
      'Title: Blocked',
      'URL: https://blocked.com/b',
    ].join('\n')

    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: buildSseResponse(mixedText) })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', { allowedDomains: ['allowed.com'] })

    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://allowed.com/a')
  })

  test('filters results by blockedDomains', async () => {
    const mixedText = [
      'Title: Good',
      'URL: https://good.com/a',
      '---',
      'Title: Spam',
      'URL: https://spam.com/b',
    ].join('\n')

    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: buildSseResponse(mixedText) })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', { blockedDomains: ['spam.com'] })

    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://good.com/a')
  })

  test('filters subdomains with allowedDomains', async () => {
    const text = [
      'Title: Subdomain',
      'URL: https://docs.example.com/page',
      '---',
      'Title: Other',
      'URL: https://other.com/page',
    ].join('\n')

    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: buildSseResponse(text) })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', { allowedDomains: ['example.com'] })

    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://docs.example.com/page')
  })

  test('throws AbortError when signal is already aborted', async () => {
    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.resolve({ data: buildSseResponse(STRUCTURED_TEXT) })),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    const controller = new AbortController()
    controller.abort()

    const { AbortError } = await import('src/utils/errors')
    await expect(
      adapter.search('test', { signal: controller.signal }),
    ).rejects.toThrow(AbortError)
  })

  test('re-throws non-abort axios errors', async () => {
    const networkError = new Error('Network error')
    mock.module('axios', () => ({
      default: {
        post: mock(() => Promise.reject(networkError)),
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    await expect(adapter.search('test', {})).rejects.toThrow('Network error')
  })

  test('sends correct MCP request payload to Exa endpoint', async () => {
    const axiosPost = mock(() => Promise.resolve({ data: buildSseResponse(STRUCTURED_TEXT) }))
    mock.module('axios', () => ({
      default: {
        post: axiosPost,
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    await adapter.search('hello world', {})

    expect(axiosPost.mock.calls).toHaveLength(1)
    const [url, body, config] = (axiosPost.mock.calls as any[][])[0]
    expect(url).toBe('https://mcp.exa.ai/mcp')
    expect(body.jsonrpc).toBe('2.0')
    expect(body.method).toBe('tools/call')
    expect(body.params.name).toBe('web_search_exa')
    expect(body.params.arguments.query).toBe('hello world')
    expect(body.params.arguments.type).toBe('auto')
    expect(body.params.arguments.numResults).toBe(8)
    expect(body.params.arguments.livecrawl).toBe('fallback')
    expect(body.params.arguments.contextMaxCharacters).toBe(10000)
    expect(config.headers.Accept).toBe('application/json, text/event-stream')
  })

  test('passes custom search options to MCP request', async () => {
    const axiosPost = mock(() => Promise.resolve({ data: buildSseResponse(STRUCTURED_TEXT) }))
    mock.module('axios', () => ({
      default: {
        post: axiosPost,
        isCancel: () => false,
      },
    }))

    const adapter = await createAdapter()
    await adapter.search('test', {
      numResults: 15,
      livecrawl: 'preferred',
      searchType: 'deep',
      contextMaxCharacters: 20000,
    })

    const [, body] = (axiosPost.mock.calls as any[][])[0]
    expect(body.params.arguments.numResults).toBe(15)
    expect(body.params.arguments.livecrawl).toBe('preferred')
    expect(body.params.arguments.type).toBe('deep')
    expect(body.params.arguments.contextMaxCharacters).toBe(20000)
  })
})
