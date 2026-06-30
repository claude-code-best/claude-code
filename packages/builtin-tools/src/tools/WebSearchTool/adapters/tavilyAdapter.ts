/**
 * Tavily-based search adapter — calls the Tavily Search API
 * (https://tavily.claude-code-best.win) and maps results to
 * the unified SearchResult format.
 */

import axios from 'axios'
import { AbortError } from 'src/utils/errors.js'
import { getSettings_DEPRECATED } from 'src/utils/settings/settings.js'
import type { SearchResult, SearchOptions, WebSearchAdapter } from './types.js'

const DEFAULT_TAVILY_SEARCH_URL = 'https://tavily.claude-code-best.win/search'
const FETCH_TIMEOUT_MS = 30_000

interface TavilySearchHit {
  title: string
  url: string
  content: string
  score: number
}

interface TavilySearchResponse {
  results: TavilySearchHit[]
}

export class TavilySearchAdapter implements WebSearchAdapter {
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const { signal, onProgress, allowedDomains, blockedDomains } = options

    if (signal?.aborted) {
      throw new AbortError()
    }

    onProgress?.({ type: 'query_update', query })

    const abortController = new AbortController()
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort(), {
        once: true,
      })
    }

    const settings = getSettings_DEPRECATED() as Record<string, unknown> & {
      tavilyEndpointUrl?: string
    }
    const baseUrl = settings.tavilyEndpointUrl || DEFAULT_TAVILY_SEARCH_URL
    // Ensure the URL ends with /search (same pattern as fetchContentWithTavily for /extract)
    const searchUrl = baseUrl.endsWith('/search')
      ? baseUrl
      : `${baseUrl.replace(/\/$/, '')}/search`

    try {
      const response = await axios.post<{
        query: string
        results: TavilySearchHit[]
      }>(
        searchUrl,
        {
          query,
          search_depth: 'basic',
          max_results: options.numResults ?? 8,
          include_domains: allowedDomains ?? [],
          exclude_domains: blockedDomains ?? [],
        },
        {
          signal: abortController.signal,
          timeout: FETCH_TIMEOUT_MS,
          headers: { 'Content-Type': 'application/json' },
        },
      )

      if (abortController.signal.aborted) {
        throw new AbortError()
      }

      const results: SearchResult[] = (response.data.results ?? []).map(
        (hit: TavilySearchHit) => ({
          title: hit.title,
          url: hit.url,
          snippet: hit.content,
        }),
      )

      onProgress?.({
        type: 'search_results_received',
        resultCount: results.length,
        query,
      })

      return results
    } catch (e) {
      if (axios.isCancel(e) || abortController.signal.aborted) {
        throw new AbortError()
      }
      throw e
    }
  }
}
