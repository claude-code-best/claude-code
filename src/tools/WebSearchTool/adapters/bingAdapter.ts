/**
 * Bing-based search adapter — fetches Bing search pages and extracts
 * search results using regex pattern matching on raw HTML.
 */

import axios from 'axios'
import he from 'he'
import { AbortError } from '../../../utils/errors.js'
import type { SearchResult, SearchOptions, WebSearchAdapter } from './types.js'

const FETCH_TIMEOUT_MS = 30_000

/**
 * Browser-like headers to avoid Bing's anti-bot JS-rendered response.
 * These mimic Microsoft Edge on macOS to get full HTML search results.
 */
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Sec-Ch-Ua':
    '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"macOS"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
} as const

export class BingSearchAdapter implements WebSearchAdapter {
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const { signal, onProgress, allowedDomains, blockedDomains } = options

    if (signal?.aborted) {
      throw new AbortError()
    }

    onProgress?.({ type: 'query_update', query })

    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setmkt=en-US`

    const abortController = new AbortController()
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort(), {
        once: true,
      })
    }

    let html: string
    try {
      const response = await axios.get(url, {
        signal: abortController.signal,
        timeout: FETCH_TIMEOUT_MS,
        responseType: 'text',
        headers: BROWSER_HEADERS,
      })
      html = response.data
    } catch (e) {
      if (axios.isCancel(e) || abortController.signal.aborted) {
        throw new AbortError()
      }
      throw e
    }

    if (abortController.signal.aborted) {
      throw new AbortError()
    }

    const rawResults = extractBingResults(html)

    // Client-side domain filtering
    const results = rawResults.filter(r => {
      if (!r.url) return false
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

/**
 * Extract organic search results from Bing HTML.
 * Bing results live in <li class="b_algo"> blocks within <ol id="b_results">.
 */
export function extractBingResults(html: string): SearchResult[] {
  const results: SearchResult[] = []

  const algoBlockRegex = /<li\s+class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = algoBlockRegex.exec(html)) !== null) {
    const block = blockMatch[1]

    // Extract the primary link from <h2><a href="...">...</a></h2>
    const h2LinkRegex =
      /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i
    const linkMatch = h2LinkRegex.exec(block)
    if (!linkMatch) continue

    const rawUrl = decodeHtmlEntities(linkMatch[1])
    const titleHtml = linkMatch[2]

    // Resolve Bing redirect URLs (bing.com/ck/a?...&u=a1aHR0cHM6Ly9...)
    // or skip Bing-internal / relative links
    const url = resolveBingUrl(rawUrl)
    if (!url) continue

    const title = decodeHtmlEntities(titleHtml.replace(/<[^>]+>/g, '').trim())

    // Extract snippet: try b_lineclamp → b_caption <p> → b_caption fallback
    const snippet = extractSnippet(block)

    results.push({ title, url, snippet })
  }

  return results
}

function extractSnippet(block: string): string | undefined {
  // 1. Try <p class="b_lineclamp...">
  const lineclampRegex = /<p[^>]*class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i
  let match = lineclampRegex.exec(block)
  if (match) {
    return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').trim())
  }

  // 2. Try <p> inside b_caption
  const captionPRegex =
    /<div[^>]*class="b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i
  match = captionPRegex.exec(block)
  if (match) {
    return decodeHtmlEntities(match[1].replace(/<[^>]+>/g, '').trim())
  }

  // 3. Fallback: any text inside b_caption <div>
  const fallbackRegex =
    /<div[^>]*class="b_caption[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  const fallbackMatch = fallbackRegex.exec(block)
  if (fallbackMatch) {
    const text = fallbackMatch[1].replace(/<[^>]+>/g, '').trim()
    if (text) return decodeHtmlEntities(text)
  }

  return undefined
}

export const decodeHtmlEntities = he.decode

/**
 * Resolve a Bing redirect URL to the actual target URL.
 * Bing uses URLs like: https://www.bing.com/ck/a?...&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbQ...
 * The `u` query parameter is a base64-encoded URL prefixed with a1 (https) or a0 (http).
 * Returns `undefined` for Bing-internal or relative links that should be skipped.
 */
export function resolveBingUrl(rawUrl: string): string | undefined {
  // Skip relative / anchor links
  if (rawUrl.startsWith('/') || rawUrl.startsWith('#')) return undefined

  // Try to extract the `u` parameter from Bing redirect URLs
  const uMatch = rawUrl.match(/[?&]u=([a-zA-Z0-9+/_=-]+)/)
  if (uMatch) {
    const encoded = uMatch[1]
    if (encoded.length >= 3) {
      const prefix = encoded.slice(0, 2)
      const b64 = encoded.slice(2)
      try {
        // Base64url decode (pad as needed)
        const padded = b64.replace(/-/g, '+').replace(/_/g, '/')
        const decoded = Buffer.from(padded, 'base64').toString('utf-8')
        if (decoded.startsWith('http')) return decoded
      } catch {
        // Fall through — not a valid base64 redirect
      }
    }
  }

  // Direct external URL (not a Bing-internal page)
  if (!rawUrl.includes('bing.com')) return rawUrl

  return undefined
}
