import { describe, expect, mock, test } from 'bun:test'

const _abortMock = () => ({
  AbortError: class AbortError extends Error {
    constructor(message?: string) { super(message); this.name = 'AbortError' }
  },
  isAbortError: (e: unknown) => e instanceof Error && (e as Error).name === 'AbortError',
})
mock.module('src/utils/errors.js', _abortMock)
mock.module('src/utils/errors', _abortMock)

import { extractBingResults, decodeHtmlEntities } from '../adapters/bingAdapter'

// ---------------------------------------------------------------------------
// decodeHtmlEntities
// ---------------------------------------------------------------------------

describe('decodeHtmlEntities', () => {
  test('decodes common named entities', () => {
    expect(decodeHtmlEntities('&amp; &lt; &gt;')).toBe('& < >')
  })

  test('decodes quote entities', () => {
    expect(decodeHtmlEntities('&quot;hello&quot;')).toBe('"hello"')
  })

  test('decodes numeric and hex apostrophe entities', () => {
    expect(decodeHtmlEntities('&#39;it&#x27;s')).toBe("'it's")
  })

  test('decodes &nbsp; to non-breaking space (\\u00A0)', () => {
    expect(decodeHtmlEntities('a&nbsp;b')).toBe('a\u00A0b')
  })

  test('returns plain text unchanged', () => {
    expect(decodeHtmlEntities('hello world')).toBe('hello world')
  })

  test('handles empty string', () => {
    expect(decodeHtmlEntities('')).toBe('')
  })

  test('decodes multiple occurrences of the same entity', () => {
    expect(decodeHtmlEntities('a&amp;b&amp;c')).toBe('a&b&c')
  })

  test('handles mixed entities in one string', () => {
    expect(decodeHtmlEntities('&lt;a&nbsp;href=&quot;x&quot;&gt;')).toBe('<a\u00A0href="x">')
  })
})

// ---------------------------------------------------------------------------
// extractBingResults
// ---------------------------------------------------------------------------

describe('extractBingResults', () => {
  test('extracts results from standard Bing HTML', () => {
    const html = `
      <ol id="b_results">
        <li class="b_algo">
          <h2><a href="https://example.com/page1" h="ID=SERP,1">Example Title 1</a></h2>
          <div class="b_caption">
            <p class="b_lineclamp">First result description</p>
          </div>
        </li>
        <li class="b_algo">
          <h2><a href="https://example.com/page2" h="ID=SERP,2">Example Title 2</a></h2>
          <div class="b_caption">
            <p class="b_lineclamp">Second result description</p>
          </div>
        </li>
      </ol>
    `
    const results = extractBingResults(html)
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      title: 'Example Title 1',
      url: 'https://example.com/page1',
      snippet: 'First result description',
    })
    expect(results[1]).toEqual({
      title: 'Example Title 2',
      url: 'https://example.com/page2',
      snippet: 'Second result description',
    })
  })

  test('returns empty array when no b_algo blocks exist', () => {
    const html = `
      <ol id="b_results">
        <li class="b_ad">Ad result</li>
        <li class="b_ans">Answer card</li>
      </ol>
    `
    expect(extractBingResults(html)).toEqual([])
  })

  test('returns empty array for empty HTML', () => {
    expect(extractBingResults('')).toEqual([])
  })

  test('returns empty array for unrelated HTML', () => {
    expect(extractBingResults('<html><body>Hello</body></html>')).toEqual([])
  })

  test('skips Bing-internal links', () => {
    const html = `
      <li class="b_algo">
        <h2><a href="/search?q=more">More results</a></h2>
      </li>
      <li class="b_algo">
        <h2><a href="https://www.bing.com/videos">Bing Videos</a></h2>
      </li>
      <li class="b_algo">
        <h2><a href="#anchor">Jump link</a></h2>
      </li>
    `
    expect(extractBingResults(html)).toEqual([])
  })

  test('strips HTML tags from titles', () => {
    const html = `
      <li class="b_algo">
        <h2><a href="https://example.com">Result with <strong>bold</strong> and <em>italic</em></a></h2>
      </li>
    `
    const results = extractBingResults(html)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Result with bold and italic')
  })

  test('decodes HTML entities in titles', () => {
    const html = `
      <li class="b_algo">
        <h2><a href="https://example.com">Tom &amp; Jerry &lt;cartoon&gt;</a></h2>
      </li>
    `
    const results = extractBingResults(html)
    expect(results[0].title).toBe('Tom & Jerry <cartoon>')
  })

  test('extracts snippet from b_lineclamp class', () => {
    const html = `
      <li class="b_algo">
        <h2><a href="https://example.com">Title</a></h2>
        <p class="b_lineclamp3 b_algo_slug">Lineclamp snippet text here</p>
      </li>
    `
    const results = extractBingResults(html)
    expect(results[0].snippet).toBe('Lineclamp snippet text here')
  })

  test('extracts snippet from b_caption paragraph fallback', () => {
    const html = `
      <li class="b_algo">
        <h2><a href="https://example.com">Title</a></h2>
        <div class="b_caption">
          <p>Caption paragraph text</p>
        </div>
      </li>
    `
    const results = extractBingResults(html)
    expect(results[0].snippet).toBe('Caption paragraph text')
  })

  test('extracts snippet from b_caption div fallback', () => {
    const html = `
      <li class="b_algo">
        <h2><a href="https://example.com">Title</a></h2>
        <div class="b_caption">Direct caption text without p tag</div>
      </li>
    `
    const results = extractBingResults(html)
    expect(results[0].snippet).toBe('Direct caption text without p tag')
  })

  test('returns undefined snippet when no caption exists', () => {
    const html = `
      <li class="b_algo">
        <h2><a href="https://example.com">Title Only</a></h2>
      </li>
    `
    const results = extractBingResults(html)
    expect(results[0].snippet).toBeUndefined()
  })

  test('handles mixed result types and only extracts b_algo', () => {
    const html = `
      <ol id="b_results">
        <li class="b_ad"><h2><a href="https://ad.com">Ad Title</a></h2></li>
        <li class="b_algo">
          <h2><a href="https://real-result.com">Real Result</a></h2>
          <p class="b_lineclamp">A real snippet</p>
        </li>
        <li class="b_ans"><div>People also ask</div></li>
        <li class="b_algo">
          <h2><a href="https://another.com">Another Result</a></h2>
        </li>
      </ol>
    `
    const results = extractBingResults(html)
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Real Result')
    expect(results[1].title).toBe('Another Result')
  })

  test('skips b_algo blocks without h2 > a structure', () => {
    const html = `
      <li class="b_algo">
        <div>No link here</div>
      </li>
      <li class="b_algo">
        <h2><a href="https://example.com">Valid Result</a></h2>
      </li>
    `
    const results = extractBingResults(html)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Valid Result')
  })

  test('handles extra whitespace in h2 > a structure', () => {
    const html = `
      <li class="b_algo">
        <h2>
          <a href="https://example.com"  h="ID=SERP,1"  >
            Whitespace  Title
          </a>
        </h2>
      </li>
    `
    const results = extractBingResults(html)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Whitespace  Title')
  })

  test('handles snippet with HTML entities', () => {
    const html = `
      <li class="b_algo">
        <h2><a href="https://example.com">Title</a></h2>
        <p class="b_lineclamp">5 &lt; 10 &amp; 10 &gt; 5</p>
      </li>
    `
    const results = extractBingResults(html)
    expect(results[0].snippet).toBe('5 < 10 & 10 > 5')
  })

  test('handles real-world Bing HTML structure', () => {
    const html = `
      <ol id="b_results" role="main">
        <li class="b_algo" data-id="">
          <div class="b_title">
            <h2>
              <a href="https://docs.python.org/3/tutorial/index.html" target="_blank" h="ID=SERP,5125.1">
                Python Tutorial
              </a>
            </h2>
          </div>
          <div class="b_caption">
            <div class="b_attribution" u="0|5125|4976674477245">
              <cite>https://docs.python.org</cite>
            </div>
            <p class="b_lineclamp3">
              Welcome to the Python Tutorial. This tutorial introduces you to the basic concepts and features...
            </p>
          </div>
        </li>
        <li class="b_algo">
          <h2>
            <a href="https://realpython.com/python-guide/" h="ID=SERP,5125.2">
              Real Python Guide
            </a>
          </h2>
          <div class="b_caption">
            <div class="b_attribution">
              <cite>https://realpython.com</cite>
            </div>
            <p>
              The ultimate Python guide for beginners and experts alike.
            </p>
          </div>
        </li>
      </ol>
    `
    const results = extractBingResults(html)
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Python Tutorial')
    expect(results[0].url).toBe('https://docs.python.org/3/tutorial/index.html')
    expect(results[0].snippet).toContain('Welcome to the Python Tutorial')
    expect(results[1].title).toBe('Real Python Guide')
    expect(results[1].snippet).toContain('ultimate Python guide')
  })
})

// ---------------------------------------------------------------------------
// BingSearchAdapter.search (integration with mocked axios)
// ---------------------------------------------------------------------------

describe('BingSearchAdapter.search', () => {
  // Dynamic import so mock.module() takes effect
  const createAdapter = async () => {
    const { BingSearchAdapter } = await import('../adapters/bingAdapter')
    return new BingSearchAdapter()
  }

  const SAMPLE_HTML = `
    <ol id="b_results">
      <li class="b_algo">
        <h2><a href="https://example.com/result1">Result One</a></h2>
        <p class="b_lineclamp">Snippet one</p>
      </li>
      <li class="b_algo">
        <h2><a href="https://example.com/result2">Result Two</a></h2>
        <p class="b_lineclamp">Snippet two</p>
      </li>
    </ol>
  `

  test('returns parsed results from fetched HTML', async () => {
    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: SAMPLE_HTML })),
        isCancel: () => false,
      },
    }))
    mock.module('src/utils/http', () => ({
      getWebFetchUserAgent: () => 'TestAgent/1.0',
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test query', {})
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Result One')
    expect(results[1].title).toBe('Result Two')
  })

  test('calls onProgress with query_update and search_results_received', async () => {
    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: SAMPLE_HTML })),
        isCancel: () => false,
      },
    }))
    mock.module('src/utils/http', () => ({
      getWebFetchUserAgent: () => 'TestAgent/1.0',
    }))

    const progressCalls: any[] = []
    const onProgress = (p: any) => progressCalls.push(p)

    const adapter = await createAdapter()
    await adapter.search('test', { onProgress })

    expect(progressCalls).toHaveLength(2)
    expect(progressCalls[0].type).toBe('query_update')
    expect(progressCalls[0].query).toBe('test')
    expect(progressCalls[1].type).toBe('search_results_received')
    expect(progressCalls[1].resultCount).toBe(2)
  })

  test('filters results by allowedDomains', async () => {
    const mixedHtml = `
      <ol id="b_results">
        <li class="b_algo">
          <h2><a href="https://allowed.com/a">Allowed Result</a></h2>
        </li>
        <li class="b_algo">
          <h2><a href="https://blocked.com/b">Blocked Result</a></h2>
        </li>
      </ol>
    `
    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: mixedHtml })),
        isCancel: () => false,
      },
    }))
    mock.module('src/utils/http', () => ({
      getWebFetchUserAgent: () => 'TestAgent/1.0',
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', {
      allowedDomains: ['allowed.com'],
    })
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://allowed.com/a')
  })

  test('filters results by blockedDomains', async () => {
    const mixedHtml = `
      <ol id="b_results">
        <li class="b_algo">
          <h2><a href="https://good.com/a">Good Result</a></h2>
        </li>
        <li class="b_algo">
          <h2><a href="https://spam.com/b">Spam Result</a></h2>
        </li>
      </ol>
    `
    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: mixedHtml })),
        isCancel: () => false,
      },
    }))
    mock.module('src/utils/http', () => ({
      getWebFetchUserAgent: () => 'TestAgent/1.0',
    }))

    const adapter = await createAdapter()
    const results = await adapter.search('test', {
      blockedDomains: ['spam.com'],
    })
    expect(results).toHaveLength(1)
    expect(results[0].url).toBe('https://good.com/a')
  })

  test('filters subdomains with allowedDomains', async () => {
    const html = `
      <ol id="b_results">
        <li class="b_algo">
          <h2><a href="https://docs.example.com/page">Subdomain Result</a></h2>
        </li>
        <li class="b_algo">
          <h2><a href="https://other.com/page">Other Result</a></h2>
        </li>
      </ol>
    `
    mock.module('axios', () => ({
      default: {
        get: mock(() => Promise.resolve({ data: html })),
        isCancel: () => false,
      },
    }))
    mock.module('src/utils/http', () => ({
      getWebFetchUserAgent: () => 'TestAgent/1.0',
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
          return Promise.resolve({ data: SAMPLE_HTML })
        }),
        isCancel: (e: any) => e?.__CANCEL__ === true,
      },
    }))
    mock.module('src/utils/http', () => ({
      getWebFetchUserAgent: () => 'TestAgent/1.0',
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
        get: mock(() => Promise.reject(networkError)),
        isCancel: () => false,
      },
    }))
    mock.module('src/utils/http', () => ({
      getWebFetchUserAgent: () => 'TestAgent/1.0',
    }))

    const adapter = await createAdapter()
    await expect(adapter.search('test', {})).rejects.toThrow('Network error')
  })

  test('encodes query parameter in URL', async () => {
    const axiosGet = mock(() => Promise.resolve({ data: SAMPLE_HTML }))
    mock.module('axios', () => ({
      default: {
        get: axiosGet,
        isCancel: () => false,
      },
    }))
    mock.module('src/utils/http', () => ({
      getWebFetchUserAgent: () => 'TestAgent/1.0',
    }))

    const adapter = await createAdapter()
    await adapter.search('hello world & special=chars', {})

    const calledUrl = (axiosGet.mock.calls as string[][])[0][0]
    expect(calledUrl).toContain('q=hello%20world%20%26%20special%3Dchars')
  })
})
