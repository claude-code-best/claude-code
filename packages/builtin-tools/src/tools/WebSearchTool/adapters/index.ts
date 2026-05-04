/**
 * Search adapter factory — selects the appropriate backend by checking
 * whether the API base URL points to Anthropic's official endpoint.
 */

import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from 'src/utils/model/providers.js'
import { ApiSearchAdapter } from './apiAdapter.js'
import { BingSearchAdapter } from './bingAdapter.js'
import { BraveSearchAdapter } from './braveAdapter.js'
import { ExaSearchAdapter } from './exaAdapter.js'
import { OllamaSearchAdapter } from './ollamaAdapter.js'
import type { WebSearchAdapter } from './types.js'

export type {
  SearchResult,
  SearchOptions,
  SearchProgress,
  WebSearchAdapter,
} from './types.js'

/**
 * Check if the current session uses a third-party (non-Anthropic) API provider.
 * These providers don't support Anthropic's server_tools (server-side web search),
 * so they must fall back to the Bing scraper adapter.
 */
function isThirdPartyProvider(): boolean {
  const provider = getAPIProvider()
  return provider === 'openai' || provider === 'gemini' || provider === 'grok'
}

let cachedAdapter: WebSearchAdapter | null = null
let cachedAdapterKey: 'api' | 'bing' | 'brave' | 'exa' | 'ollama' | null = null

export function createAdapter(): WebSearchAdapter {
  const envAdapter = process.env.WEB_SEARCH_ADAPTER
  // Priority:
  //   1. Explicit env override (WEB_SEARCH_ADAPTER=api|bing|brave)
  //   2. Ollama provider → ollama (native /api/web_search)
  //   3. Third-party provider (OpenAI/Gemini/Grok) → bing (no server_tools support)
  //   4. First-party Anthropic API → api (server-side web search + connector_text)
  //   5. Fallback → exa
  const adapterKey =
    envAdapter === 'api' ||
    envAdapter === 'bing' ||
    envAdapter === 'brave' ||
    envAdapter === 'exa'
      ? envAdapter
      : getAPIProvider() === 'ollama'
        ? 'ollama'
        : isThirdPartyProvider()
          ? 'bing'
          : isFirstPartyAnthropicBaseUrl()
            ? 'api'
            : 'exa'

  if (cachedAdapter && cachedAdapterKey === adapterKey) return cachedAdapter

  if (adapterKey === 'api') {
    cachedAdapter = new ApiSearchAdapter()
    cachedAdapterKey = 'api'
    return cachedAdapter
  }
  if (adapterKey === 'brave') {
    cachedAdapter = new BraveSearchAdapter()
    cachedAdapterKey = 'brave'
    return cachedAdapter
  }
  if (adapterKey === 'exa') {
    cachedAdapter = new ExaSearchAdapter()
    cachedAdapterKey = 'exa'
    return cachedAdapter
  }
  if (adapterKey === 'ollama') {
    cachedAdapter = new OllamaSearchAdapter()
    cachedAdapterKey = 'ollama'
    return cachedAdapter
  }

  cachedAdapter = new BingSearchAdapter()
  cachedAdapterKey = 'bing'
  return cachedAdapter
}
