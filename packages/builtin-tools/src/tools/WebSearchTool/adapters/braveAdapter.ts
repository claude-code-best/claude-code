/**
 * Brave-based search adapter — fetches Brave's LLM context API and maps the
 * grounding payload into SearchResult objects.
 */

import axios from 'axios'
import { AbortError } from 'src/utils/errors.js'
import type { SearchResult, SearchOptions, WebSearchAdapter } from './types.js'

const FETCH_TIMEOUT_MS = 30_000
const BRAVE_LLM_CONTEXT_URL = 'https://api.search.brave.com/res/v1/llm/context'
const BRAVE_API_KEY_ENV_VARS = ['BRAVE_SEARCH_API_KEY', 'BRAVE_API_KEY'] as const

interface BraveGroundingResult {
  title?: string
  url?: string
  snippets?: string[]
}

interface BraveSearchResponse {
  grounding?: {
    generic?: BraveGroundingResult[]
    map?: BraveGroundingResult[]
    poi?: BraveGroundingResult | null
  }
}

export class BraveSearchAdapter implements WebSearchAdapter {
  async search(
    query: string,
    options: SearchOptions,
  ): Promise<SearchResult[]> {
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

    let payload: BraveSearchResponse
    try {
      const response = await axios.get<BraveSearchResponse>(
        BRAVE_LLM_CONTEXT_URL,
        {
          signal: abortController.signal,
          timeout: FETCH_TIMEOUT_MS,
          responseType: 'json',
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': getBraveApiKey(),
          },
          params: { q: query },
        },
      )
      payload = response.data
    } catch (e) {
      if (axios.isCancel(e) || abortController.signal.aborted) {
        throw new AbortError()
      }
      throw e
    }

    if (abortController.signal.aborted) {
      throw new AbortError()
    }

    const rawResults = extractBraveResults(payload)
    const results = rawResults.filter(r => {
      try {
        const hostname = new URL(r.url).hostname
        if (
          allowedDomains?.length &&
          !allowedDomains.some(
            d => hostname === d || hostname.endsWith('.' + d),
          )
        ) {
          return false
        }
        if (
          blockedDomains?.length &&
          blockedDomains.some(d => hostname === d || hostname.endsWith('.' + d))
        ) {
          return false
        }
      } catch {
        return false
      }
      return true
    })

    onProgress?.({
      type: 'search_results_received',
      resultCount: results.length,
      query,
    })

    return results
  }
}

export function extractBraveResults(
  payload: BraveSearchResponse,
): SearchResult[] {
  const grounding = payload.grounding
  if (!grounding) {
    return []
  }

  const entries = [
    ...(Array.isArray(grounding.generic) ? grounding.generic : []),
    ...(grounding.poi ? [grounding.poi] : []),
    ...(Array.isArray(grounding.map) ? grounding.map : []),
  ]

  const seenUrls = new Set<string>()
  const results: SearchResult[] = []

  for (const entry of entries) {
    if (!entry?.url || !entry.title || seenUrls.has(entry.url)) {
      continue
    }

    seenUrls.add(entry.url)
    results.push({
      title: entry.title,
      url: entry.url,
      snippet: normalizeSnippet(entry.snippets),
    })
  }

  return results
}

function normalizeSnippet(snippets: string[] | undefined): string | undefined {
  if (!Array.isArray(snippets)) {
    return undefined
  }

  const normalized = snippets
    .map(snippet => snippet.trim())
    .filter(snippet => snippet.length > 0)

  if (normalized.length === 0) {
    return undefined
  }

  return normalized.join(' ')
}

function getBraveApiKey(): string {
  for (const envVar of BRAVE_API_KEY_ENV_VARS) {
    const value = process.env[envVar]?.trim()
    if (value) {
      return value
    }
  }

  throw new Error(
    'BraveSearchAdapter requires BRAVE_SEARCH_API_KEY or BRAVE_API_KEY',
  )
}
