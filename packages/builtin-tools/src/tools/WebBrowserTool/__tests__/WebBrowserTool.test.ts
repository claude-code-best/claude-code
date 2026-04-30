import { describe, test, expect, beforeAll, afterAll } from 'bun:test'

// Mock fetch directly — avoids flaky dependency on external hosts AND
// pollution by other tests that call setGlobalDispatcher (proxy agents make
// localhost fetches return 500 in the full-suite run).
const realFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = (async (
    input: string | URL | Request,
    _init?: RequestInit,
  ) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url === 'not-a-url' || !url.startsWith('http')) {
      throw new TypeError('Failed to fetch')
    }
    const body =
      '<!doctype html><html><head><title>Example Domain</title></head>' +
      '<body><h1>Example Domain</h1><p>Sample content.</p></body></html>'
    const res = new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })
    // Make response.url match the request URL so tests can assert on it.
    Object.defineProperty(res, 'url', { value: url, configurable: true })
    return res
  }) as typeof fetch
})

afterAll(() => {
  globalThis.fetch = realFetch
})

describe('WebBrowserTool', () => {
  test('tool exports and metadata', async () => {
    const { WebBrowserTool } = await import('../WebBrowserTool.js')
    expect(WebBrowserTool).toBeDefined()
    expect(WebBrowserTool.name).toBe('WebBrowser')
    expect(typeof WebBrowserTool.call).toBe('function')
    expect(WebBrowserTool.userFacingName()).toBe('Browser')
    expect(WebBrowserTool.isReadOnly()).toBe(true)
  })

  test('description reflects browser-lite', async () => {
    const { WebBrowserTool } = await import('../WebBrowserTool.js')
    const desc = await WebBrowserTool.description()
    expect(desc).toContain('HTTP')
    expect(desc).not.toContain('embedded browser')
  })

  test('prompt mentions limitations', async () => {
    const { WebBrowserTool } = await import('../WebBrowserTool.js')
    const prompt = await WebBrowserTool.prompt()
    expect(prompt).toContain('Limitations')
    expect(prompt).toContain('No JavaScript')
    expect(prompt).toContain('Claude-in-Chrome')
  })

  test('navigate fetches URL', async () => {
    const { WebBrowserTool } = await import('../WebBrowserTool.js')
    const result = await WebBrowserTool.call({
      url: 'https://example.com',
    } as any)
    expect(result.data.title).toBe('Example Domain')
    expect(result.data.url).toContain('example.com')
    expect(result.data.content).toContain('Example Domain')
  }, 15000)

  test('screenshot returns text snapshot', async () => {
    const { WebBrowserTool } = await import('../WebBrowserTool.js')
    const result = await WebBrowserTool.call({
      url: 'https://example.com',
      action: 'screenshot',
    } as any)
    expect(result.data.content).toContain('Text snapshot')
    expect(result.data.content).toContain('Example Domain')
  }, 15000)

  test('schema only allows navigate and screenshot', async () => {
    const { WebBrowserTool } = await import('../WebBrowserTool.js')
    const schema = WebBrowserTool.inputSchema
    const parseResult = schema.safeParse({
      url: 'https://example.com',
      action: 'click',
    })
    expect(parseResult.success).toBe(false)
  })

  test('invalid URL returns error', async () => {
    const { WebBrowserTool } = await import('../WebBrowserTool.js')
    const result = await WebBrowserTool.call({ url: 'not-a-url' } as any)
    expect(result.data.content).toContain('Failed to fetch')
  })
})
