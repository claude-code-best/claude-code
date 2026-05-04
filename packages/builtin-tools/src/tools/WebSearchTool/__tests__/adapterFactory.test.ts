import { afterEach, describe, expect, mock, test } from 'bun:test'

let isFirstPartyBaseUrl = true
let apiProvider = 'firstParty'

// Only mock the external dependency that controls adapter selection
mock.module('src/utils/model/providers.js', () => ({
  isFirstPartyAnthropicBaseUrl: () => isFirstPartyBaseUrl,
  getAPIProvider: () => apiProvider,
  getAPIProviderForStatsig: () => apiProvider,
}))

mock.module('src/services/api/ollama/client.js', () => ({
  getOllamaClient: () => ({
    webSearch: async () => new Response(JSON.stringify({ results: [] })),
  }),
}))

const { createAdapter } = await import('../adapters/index')

const originalWebSearchAdapter = process.env.WEB_SEARCH_ADAPTER

afterEach(() => {
  isFirstPartyBaseUrl = true
  apiProvider = 'firstParty'

  if (originalWebSearchAdapter === undefined) {
    delete process.env.WEB_SEARCH_ADAPTER
  } else {
    process.env.WEB_SEARCH_ADAPTER = originalWebSearchAdapter
  }
})

describe('createAdapter', () => {
  test('reuses the same instance when the selected backend does not change', () => {
    process.env.WEB_SEARCH_ADAPTER = 'brave'

    const firstAdapter = createAdapter()
    const secondAdapter = createAdapter()

    expect(firstAdapter).toBe(secondAdapter)
    expect(firstAdapter.constructor.name).toBe('BraveSearchAdapter')
  })

  test('rebuilds the adapter when WEB_SEARCH_ADAPTER changes', () => {
    process.env.WEB_SEARCH_ADAPTER = 'brave'
    const braveAdapter = createAdapter()

    process.env.WEB_SEARCH_ADAPTER = 'bing'
    const bingAdapter = createAdapter()

    expect(bingAdapter).not.toBe(braveAdapter)
    expect(bingAdapter.constructor.name).toBe('BingSearchAdapter')
  })

  test('selects the API adapter for first-party Anthropic URLs', () => {
    delete process.env.WEB_SEARCH_ADAPTER
    isFirstPartyBaseUrl = true

    expect(createAdapter().constructor.name).toBe('ApiSearchAdapter')
  })

  test('selects the Exa adapter for third-party Anthropic base URLs', () => {
    delete process.env.WEB_SEARCH_ADAPTER
    isFirstPartyBaseUrl = false

    expect(createAdapter().constructor.name).toBe('ExaSearchAdapter')
  })

  test('selects the Bing adapter for third-party providers', () => {
    delete process.env.WEB_SEARCH_ADAPTER
    apiProvider = 'openai'

    expect(createAdapter().constructor.name).toBe('BingSearchAdapter')
  })

  test('selects the Ollama adapter for Ollama provider', () => {
    delete process.env.WEB_SEARCH_ADAPTER
    apiProvider = 'ollama'

    expect(createAdapter().constructor.name).toBe('OllamaSearchAdapter')
  })
})
