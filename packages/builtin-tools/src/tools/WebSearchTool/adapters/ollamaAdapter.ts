import { getOllamaClient } from 'src/services/api/ollama/client.js'
import { AbortError } from 'src/utils/errors.js'
import type { SearchResult, SearchOptions, WebSearchAdapter } from './types.js'

interface OllamaWebSearchResult {
  title?: string
  url?: string
  content?: string
}

interface OllamaWebSearchResponse {
  results?: OllamaWebSearchResult[]
}

export class OllamaSearchAdapter implements WebSearchAdapter {
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const { signal, onProgress, allowedDomains, blockedDomains } = options
    if (signal?.aborted) {
      throw new AbortError()
    }

    onProgress?.({ type: 'query_update', query })

    const client = getOllamaClient()
    const maxResults = Math.min(Math.max(options.numResults ?? 5, 1), 10)
    const response = await client.webSearch(
      {
        query,
        max_results: maxResults,
      },
      { signal },
    )

    if (signal?.aborted) {
      throw new AbortError()
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `Ollama web_search failed: HTTP ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`,
      )
    }

    const payload = (await response.json()) as OllamaWebSearchResponse
    const results: SearchResult[] = []
    for (const result of payload.results ?? []) {
      if (typeof result.url !== 'string') continue
      if (!matchesDomainFilters(result.url, allowedDomains, blockedDomains)) {
        continue
      }

      const title = result.title?.trim() || result.url
      const snippet = result.content?.trim()
      results.push({
        title,
        url: result.url,
        ...(snippet && { snippet }),
      })
    }

    onProgress?.({
      type: 'search_results_received',
      resultCount: results.length,
      query,
    })

    return results
  }
}

function matchesDomainFilters(
  url: string,
  allowedDomains?: string[],
  blockedDomains?: string[],
): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    const allowed = normalizeDomains(allowedDomains)
    const blocked = normalizeDomains(blockedDomains)
    if (
      allowed.length &&
      !allowed.some(
        domain => hostname === domain || hostname.endsWith('.' + domain),
      )
    ) {
      return false
    }
    if (
      blocked.length &&
      blocked.some(
        domain => hostname === domain || hostname.endsWith('.' + domain),
      )
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

function normalizeDomains(domains?: string[]): string[] {
  return (domains ?? [])
    .map(domain =>
      domain
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, ''),
    )
    .filter(Boolean)
}
