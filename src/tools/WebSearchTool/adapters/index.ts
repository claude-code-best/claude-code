/**
 * Search adapter factory — selects the appropriate backend by checking
 * whether the API base URL points to Anthropic's official endpoint.
 */

import { isFirstPartyAnthropicBaseUrl } from '../../../utils/model/providers.js'
import { ApiSearchAdapter } from './apiAdapter.js'
import { BingSearchAdapter } from './bingAdapter.js'
import { BraveSearchAdapter } from './braveAdapter.js'
import type { WebSearchAdapter } from './types.js'

export type {
  SearchResult,
  SearchOptions,
  SearchProgress,
  WebSearchAdapter,
} from './types.js'

let cachedAdapter: WebSearchAdapter | null = null
let cachedAdapterKey: 'api' | 'bing' | 'brave' | null = null

export function createAdapter(): WebSearchAdapter {
  const envAdapter = process.env.WEB_SEARCH_ADAPTER
  const adapterKey =
    envAdapter === 'api' || envAdapter === 'bing' || envAdapter === 'brave'
      ? envAdapter
      : isFirstPartyAnthropicBaseUrl()
        ? 'api'
        : 'bing'

  if (cachedAdapter && cachedAdapterKey === adapterKey) return cachedAdapter

  if (adapterKey === 'api') {
    cachedAdapter = new ApiSearchAdapter()
    cachedAdapterKey = 'api'
    return cachedAdapter
  }
  if (adapterKey === 'bing') {
    cachedAdapter = new BingSearchAdapter()
    cachedAdapterKey = 'bing'
    return cachedAdapter
  }

  cachedAdapter = new BraveSearchAdapter()
  cachedAdapterKey = 'brave'
  return cachedAdapter
}
