import OpenAI from 'openai'
import { getProxyFetchOptions } from 'src/utils/proxy.js'
import { getOpenAIWireAPI } from './wireApi.js'

/**
 * Environment variables:
 *
 * OPENAI_API_KEY: Required. API key for the OpenAI-compatible endpoint.
 * OPENAI_BASE_URL: Recommended. Base URL for the endpoint (e.g. http://localhost:11434/v1).
 * OPENAI_ORG_ID: Optional. Organization ID.
 * OPENAI_PROJECT_ID: Optional. Project ID.
 */

let cachedClient: OpenAI | null = null

const YLSAGI_CODEX_HEADERS = {
  originator: 'Codex Desktop',
  session_id: 'openclaw',
  'User-Agent':
    'Codex Desktop/0.120.0 (Windows 10.0.26200; x86_64) unknown (codex-exec; 0.120.0)',
  Accept: 'text/event-stream',
} as const

export function getOpenAIClient(options?: {
  maxRetries?: number
  fetchOverride?: typeof fetch
  source?: string
}): OpenAI {
  if (cachedClient) return cachedClient

  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseURL = process.env.OPENAI_BASE_URL
  const defaultHeaders = getOpenAIDefaultHeaders(baseURL)

  const client = new OpenAI({
    apiKey,
    ...(baseURL && { baseURL }),
    maxRetries: options?.maxRetries ?? 0,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    ...(process.env.OPENAI_ORG_ID && { organization: process.env.OPENAI_ORG_ID }),
    ...(process.env.OPENAI_PROJECT_ID && { project: process.env.OPENAI_PROJECT_ID }),
    ...(defaultHeaders && { defaultHeaders }),
    fetchOptions: getProxyFetchOptions({ forAnthropicAPI: false }),
    ...(options?.fetchOverride && { fetch: options.fetchOverride }),
  })

  if (!options?.fetchOverride) {
    cachedClient = client
  }

  return client
}

/** Clear the cached client (useful when env vars change). */
export function clearOpenAIClientCache(): void {
  cachedClient = null
}

export function getOpenAIDefaultHeaders(
  baseURL = process.env.OPENAI_BASE_URL,
): Record<string, string> | undefined {
  if (!baseURL) return undefined
  if (getOpenAIWireAPI(baseURL, undefined) !== 'responses') return undefined

  try {
    const url = new URL(baseURL)
    if (
      url.host === 'code.ylsagi.com' &&
      url.pathname.replace(/\/+$/, '') === '/codex'
    ) {
      return { ...YLSAGI_CODEX_HEADERS }
    }
  } catch {
    // Ignore malformed URLs and fall through to no extra headers.
  }

  return undefined
}
