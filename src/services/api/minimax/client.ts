import Anthropic from '@anthropic-ai/sdk'
import { getProxyFetchOptions } from 'src/utils/proxy.js'

/**
 * Environment variables:
 *
 * MINIMAX_API_KEY: Required. API key for the MiniMax Anthropic-compatible endpoint.
 * MINIMAX_BASE_URL: Optional. Defaults to https://api.minimax.io/anthropic.
 */

const DEFAULT_BASE_URL = 'https://api.minimax.io/anthropic'

let cachedClient: Anthropic | null = null

export function getMiniMaxClient(options?: {
  maxRetries?: number
  fetchOverride?: typeof fetch
}): Anthropic {
  if (cachedClient) return cachedClient

  const apiKey = process.env.MINIMAX_API_KEY || ''
  const baseURL = process.env.MINIMAX_BASE_URL || DEFAULT_BASE_URL

  const client = new Anthropic({
    apiKey,
    baseURL,
    maxRetries: options?.maxRetries ?? 0,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({ forAnthropicAPI: false }),
    ...(options?.fetchOverride && { fetch: options.fetchOverride }),
  })

  if (!options?.fetchOverride) {
    cachedClient = client
  }

  return client
}

export function clearMiniMaxClientCache(): void {
  cachedClient = null
}
