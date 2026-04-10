/**
 * Search adapter factory — selects the appropriate backend by checking
 * whether the API base URL points to Anthropic's official endpoint.
 */

import { isFirstPartyAnthropicBaseUrl } from '../../../utils/model/providers.js'
import { ApiSearchAdapter } from './apiAdapter.js'
import { BingSearchAdapter } from './bingAdapter.js'
import type { WebSearchAdapter } from './types.js'

export type {
  SearchResult,
  SearchOptions,
  SearchProgress,
  WebSearchAdapter,
} from './types.js'

let cachedAdapter: WebSearchAdapter | null = null

export function createAdapter(): WebSearchAdapter {
  // 直接用 bing 适配器，跳过 API 适配器的选择逻辑
  return new BingSearchAdapter()
  //   // Adapter is stateless — safe to reuse across calls within a session
  //   if (cachedAdapter) return cachedAdapter

  //   // Env override: WEB_SEARCH_ADAPTER=api|bing forces specific backend
  //   const envAdapter = process.env.WEB_SEARCH_ADAPTER
  //   if (envAdapter === 'api') {
  //     cachedAdapter = new ApiSearchAdapter()
  //     return cachedAdapter
  //   }
  //   if (envAdapter === 'bing') {
  //     cachedAdapter = new BingSearchAdapter()
  //     return cachedAdapter
  //   }

  //   // Anthropic official URL → API server-side search
  //   if (isFirstPartyAnthropicBaseUrl()) {
  //     cachedAdapter = new ApiSearchAdapter()
  //     return cachedAdapter
  //   }

  //   // Third-party proxies / non-Anthropic endpoints → Bing fallback
  //   cachedAdapter = new BingSearchAdapter()
  //   return cachedAdapter
}
