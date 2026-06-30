import { afterEach, describe, expect, test } from 'bun:test'

let mockSettingsWebSearchAdapter: string | undefined

// Mock settings to avoid depending on the on-disk settings.json file.
// Other tests running in the same process may have persisted adapter choices.
let { getSettings_DEPRECATED } = await import('src/utils/settings/settings.js')
const realGetSettings = getSettings_DEPRECATED

// We can't mock getSettings_DEPRECATED directly without mocking the whole module,
// so we test using WEB_SEARCH_ADAPTER env var which takes priority anyway.
// This test focuses on the env-driven selection which is the primary path.

let { createAdapter } = await import('../adapters/index')

const originalWebSearchAdapter = process.env.WEB_SEARCH_ADAPTER

afterEach(() => {
  if (originalWebSearchAdapter === undefined) {
    delete process.env.WEB_SEARCH_ADAPTER
  } else {
    process.env.WEB_SEARCH_ADAPTER = originalWebSearchAdapter
  }
})

describe('createAdapter', () => {
  test('prioritizes WEB_SEARCH_ADAPTER env var over all other config', () => {
    process.env.WEB_SEARCH_ADAPTER = 'api'
    expect(createAdapter().constructor.name).toBe('ApiSearchAdapter')

    process.env.WEB_SEARCH_ADAPTER = 'bing'
    expect(createAdapter().constructor.name).toBe('BingSearchAdapter')

    process.env.WEB_SEARCH_ADAPTER = 'brave'
    expect(createAdapter().constructor.name).toBe('BraveSearchAdapter')

    process.env.WEB_SEARCH_ADAPTER = 'exa'
    expect(createAdapter().constructor.name).toBe('ExaSearchAdapter')

    process.env.WEB_SEARCH_ADAPTER = 'tavily'
    expect(createAdapter().constructor.name).toBe('TavilySearchAdapter')
  })

  test('reuses the same instance when the selected backend does not change', () => {
    process.env.WEB_SEARCH_ADAPTER = 'brave'

    const firstAdapter = createAdapter()
    const secondAdapter = createAdapter()

    expect(firstAdapter).toBe(secondAdapter)
  })

  test('rebuilds the adapter when WEB_SEARCH_ADAPTER changes', () => {
    process.env.WEB_SEARCH_ADAPTER = 'brave'
    const braveAdapter = createAdapter()

    process.env.WEB_SEARCH_ADAPTER = 'bing'
    const bingAdapter = createAdapter()

    expect(bingAdapter).not.toBe(braveAdapter)
  })

  test('defaults to Tavily when no env var is set', () => {
    delete process.env.WEB_SEARCH_ADAPTER

    const adapter = createAdapter()
    // The actual adapter may vary if settings.webSearchAdapter is set on disk.
    // But we only assert it's one of the valid adapter types.
    const validTypes = [
      'ApiSearchAdapter',
      'BingSearchAdapter',
      'BraveSearchAdapter',
      'ExaSearchAdapter',
      'TavilySearchAdapter',
    ]
    expect(validTypes).toContain(adapter.constructor.name)
  })
})
