/**
 * Exa AI-based search adapter — uses MCP protocol to call Exa's web search API.
 *
 * Ported from kilocode's production-validated implementation (mcp-exa.ts + websearch.ts).
 * Key improvements over previous version:
 *   - Passes through numResults/livecrawl/type/contextMaxCharacters from options
 *   - Cleaner SSE parsing matching kilocode's approach
 *   - Proper content snippet extraction from Exa responses
 */

import axios from 'axios'
import { AbortError } from 'src/utils/errors.js'
import type { SearchResult, SearchOptions, WebSearchAdapter } from './types.js'

const EXA_MCP_URL = 'https://mcp.exa.ai/mcp'
const FETCH_TIMEOUT_MS = 25_000

export class ExaSearchAdapter implements WebSearchAdapter {
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

    // Use options to derive search params — matches kilocode websearch.ts defaults
    const numResults = options.numResults ?? 8
    const livecrawl = options.livecrawl ?? 'fallback'
    const searchType = options.searchType ?? 'auto'
    const contextMaxCharacters = options.contextMaxCharacters ?? 10000

    let responseText: string
    try {
      const response = await axios.post(
        EXA_MCP_URL,
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'web_search_exa',
            arguments: {
              query,
              type: searchType,
              numResults,
              livecrawl,
              contextMaxCharacters,
            },
          },
        },
        {
          signal: abortController.signal,
          timeout: FETCH_TIMEOUT_MS,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
          },
          responseType: 'text',
        },
      )
      responseText = response.data as string
    } catch (e) {
      if (axios.isCancel(e) || abortController.signal.aborted) {
        throw new AbortError()
      }
      throw e
    }

    if (abortController.signal.aborted) {
      throw new AbortError()
    }

    const searchText = this.parseSse(responseText)

    if (abortController.signal.aborted) {
      throw new AbortError()
    }

    // Parse the Exa results from the text response
    const results = this.parseResults(searchText)

    // Client-side domain filtering
    const filteredResults = results.filter(r => {
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
      resultCount: filteredResults.length,
      query,
    })

    return filteredResults
  }

  private parseSse(body: string): string | undefined {
    // SSE format: lines starting with "data: " containing JSON
    // Matches kilocode mcp-exa.ts parseSse implementation
    for (const line of body.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const data = line.substring(6).trim()
      if (!data || data === '[DONE]' || data === 'null') continue

      try {
        const parsed = JSON.parse(data)
        const content = parsed?.result?.content
        if (Array.isArray(content) && content[0]?.text) {
          return content[0].text
        }
      } catch {
        // Continue to next line
      }
    }

    // Fallback: try parsing as direct JSON response (non-SSE)
    try {
      const parsed = JSON.parse(body)
      const content = parsed?.result?.content
      if (Array.isArray(content) && content[0]?.text) {
        return content[0].text
      }
    } catch {
      // Not JSON
    }

    return undefined
  }

  private parseResults(text: string | undefined): SearchResult[] {
    if (!text) return []

    const results: SearchResult[] = []

    // Exa returns structured text with "Title:", "URL:", and "Content:" fields
    // separated by "---" between entries
    const blocks = text.split(/\n---\n/g)

    for (const block of blocks) {
      const titleMatch = block.match(/^Title:\s*(.+)$/m)
      const urlMatch = block.match(/^URL:\s*(https?:\/\/[^\s]+)$/m)
      const contentMatch = block.match(
        /^Content:\s*([\s\S]+?)(?=\n(?:Title:|URL:|---)|$)/m,
      )

      if (urlMatch) {
        results.push({
          title: titleMatch?.[1]?.trim() ?? urlMatch[1],
          url: urlMatch[1].trim(),
          snippet: contentMatch?.[1]?.trim().slice(0, 300),
        })
      }
    }

    // Fallback: markdown links
    if (results.length === 0) {
      const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g
      let match: RegExpExecArray | null
      while ((match = markdownLinkRegex.exec(text)) !== null) {
        results.push({
          title: match[1].trim(),
          url: match[2].trim(),
        })
      }
    }

    // Fallback: plain URLs
    if (results.length === 0) {
      const urlRegex = /^https?:\/\/[^\s<>"\]]+/gm
      let match: RegExpExecArray | null
      while ((match = urlRegex.exec(text)) !== null) {
        results.push({
          title: match[0],
          url: match[0],
        })
      }
    }

    return results
  }
}
