/**
 * Search adapter factory — selects the appropriate backend.
 *
 * Priority (highest first):
 *   1. WEB_SEARCH_ADAPTER environment variable (explicit override)
 *   2. settings.webSearchAdapter (user-configurable via /web-tools)
 *   3. Default: tavily
 */

import { getSettings_DEPRECATED } from 'src/utils/settings/settings.js'
import { ApiSearchAdapter } from './apiAdapter.js'
import { BingSearchAdapter } from './bingAdapter.js'
import { BraveSearchAdapter } from './braveAdapter.js'
import { ExaSearchAdapter } from './exaAdapter.js'
import { TavilySearchAdapter } from './tavilyAdapter.js'
import type { WebSearchAdapter } from './types.js'

export type {
  SearchResult,
  SearchOptions,
  SearchProgress,
  WebSearchAdapter,
} from './types.js'

export type SearchAdapterKey = 'api' | 'bing' | 'brave' | 'exa' | 'tavily'

let cachedAdapter: WebSearchAdapter | null = null
let cachedAdapterKey: SearchAdapterKey | null = null

export function createAdapter(): WebSearchAdapter {
  // 1. Explicit env override
  const envAdapter = process.env.WEB_SEARCH_ADAPTER
  // 2. Settings preference (set via /web-tools panel)
  const settingsAdapter = getSettings_DEPRECATED().webSearchAdapter

  const adapterKey: SearchAdapterKey =
    envAdapter === 'api' ||
    envAdapter === 'bing' ||
    envAdapter === 'brave' ||
    envAdapter === 'exa' ||
    envAdapter === 'tavily'
      ? envAdapter
      : settingsAdapter === 'api' ||
          settingsAdapter === 'bing' ||
          settingsAdapter === 'brave' ||
          settingsAdapter === 'exa' ||
          settingsAdapter === 'tavily'
        ? settingsAdapter
        : 'tavily' // 3. Default

  if (cachedAdapter && cachedAdapterKey === adapterKey) return cachedAdapter

  switch (adapterKey) {
    case 'api':
      cachedAdapter = new ApiSearchAdapter()
      break
    case 'bing':
      cachedAdapter = new BingSearchAdapter()
      break
    case 'brave':
      cachedAdapter = new BraveSearchAdapter()
      break
    case 'exa':
      cachedAdapter = new ExaSearchAdapter()
      break
    case 'tavily':
    default:
      cachedAdapter = new TavilySearchAdapter()
      break
  }

  cachedAdapterKey = adapterKey
  return cachedAdapter
}
