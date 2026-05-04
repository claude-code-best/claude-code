import { getProxyFetchOptions } from 'src/utils/proxy.js'
import {
  clearOllamaContextLengthCache,
  extractOllamaModelInfoContextLength,
  extractOllamaNumCtxParameter,
  getCachedOllamaContextLength as getCachedContextLength,
  setCachedOllamaContextLength,
} from './context.js'

/**
 * Environment variables:
 *
 * OLLAMA_API_KEY: Required for Ollama Cloud (ollama.com). Not needed for local Ollama.
 * OLLAMA_BASE_URL: Optional. Defaults to https://ollama.com/api (Ollama Cloud native API).
 *   For local Ollama, set to http://localhost:11434/api.
 */

const DEFAULT_BASE_URL = 'https://ollama.com/api'

export interface OllamaClient {
  baseURL: string
  chat(body: object, options?: { signal?: AbortSignal }): Promise<Response>
  tags(options?: { signal?: AbortSignal }): Promise<Response>
  show(body: object, options?: { signal?: AbortSignal }): Promise<Response>
  webSearch(body: object, options?: { signal?: AbortSignal }): Promise<Response>
  webFetch(body: object, options?: { signal?: AbortSignal }): Promise<Response>
}

let cachedClient: OllamaClient | null = null

export function getOllamaClient(options?: {
  maxRetries?: number
  fetchOverride?: typeof fetch
  source?: string
}): OllamaClient {
  if (cachedClient) return cachedClient

  const apiKey = process.env.OLLAMA_API_KEY || ''
  let baseURL = process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL

  // Auto-append /api for the native Ollama API if the user supplied only the origin.
  // Examples: http://localhost:11434 -> http://localhost:11434/api,
  // https://ollama.com -> https://ollama.com/api.
  if (!baseURL.endsWith('/api') && !baseURL.endsWith('/api/')) {
    baseURL = baseURL.replace(/\/$/, '') + '/api'
  }

  const fetchImpl = options?.fetchOverride ?? (globalThis.fetch as typeof fetch)
  const client: OllamaClient = {
    baseURL,
    async chat(body, requestOptions) {
      return postOllamaJSON(
        fetchImpl,
        baseURL,
        '/chat',
        apiKey,
        body,
        requestOptions,
      )
    },
    async tags(requestOptions) {
      return fetchOllama(fetchImpl, baseURL, '/tags', apiKey, {
        method: 'GET',
        signal: requestOptions?.signal,
      })
    },
    async show(body, requestOptions) {
      return postOllamaJSON(
        fetchImpl,
        baseURL,
        '/show',
        apiKey,
        body,
        requestOptions,
      )
    },
    async webSearch(body, requestOptions) {
      return postOllamaJSON(
        fetchImpl,
        baseURL,
        '/web_search',
        apiKey,
        body,
        requestOptions,
      )
    },
    async webFetch(body, requestOptions) {
      return postOllamaJSON(
        fetchImpl,
        baseURL,
        '/web_fetch',
        apiKey,
        body,
        requestOptions,
      )
    },
  }

  if (!options?.fetchOverride) {
    cachedClient = client
  }

  return client
}

async function postOllamaJSON(
  fetchImpl: typeof fetch,
  baseURL: string,
  path: string,
  apiKey: string,
  body: object,
  requestOptions?: { signal?: AbortSignal },
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  return fetchOllama(fetchImpl, baseURL, path, apiKey, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: requestOptions?.signal,
  })
}

function fetchOllama(
  fetchImpl: typeof fetch,
  baseURL: string,
  path: string,
  apiKey: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (apiKey && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${apiKey}`)
  }

  return fetchImpl(`${baseURL.replace(/\/$/, '')}${path}`, {
    ...getProxyFetchOptions({ forAnthropicAPI: false }),
    ...init,
    headers,
  })
}

export interface OllamaListedModel {
  name: string
  model?: string
  modified_at?: string
  size?: number
}

export interface OllamaTagsResponse {
  models?: OllamaListedModel[]
}

export interface OllamaShowResponse {
  model_info?: Record<string, unknown>
  parameters?: string
}

export async function listOllamaModels(options?: {
  signal?: AbortSignal
  fetchOverride?: typeof fetch
}): Promise<OllamaListedModel[]> {
  const client = getOllamaClient({
    maxRetries: 0,
    fetchOverride: options?.fetchOverride,
  })
  const response = await client.tags({ signal: options?.signal })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Ollama tags failed: HTTP ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`,
    )
  }

  const payload = (await response.json()) as OllamaTagsResponse
  return Array.isArray(payload.models) ? payload.models : []
}

export async function showOllamaModel(
  model: string,
  options?: {
    signal?: AbortSignal
    fetchOverride?: typeof fetch
  },
): Promise<OllamaShowResponse> {
  const client = getOllamaClient({
    maxRetries: 0,
    fetchOverride: options?.fetchOverride,
  })
  const response = await client.show(
    {
      model,
      verbose: true,
    },
    { signal: options?.signal },
  )
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(
      `Ollama show failed: HTTP ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`,
    )
  }

  return (await response.json()) as OllamaShowResponse
}

export async function getOllamaContextLength(options: {
  model: string
  signal?: AbortSignal
  fetchOverride?: typeof fetch
}): Promise<number | undefined> {
  const cached = getCachedContextLength(options.model)
  if (cached !== undefined) return cached

  const details = await showOllamaModel(options.model, {
    signal: options.signal,
    fetchOverride: options.fetchOverride,
  })
  const contextLength =
    extractOllamaModelInfoContextLength(details.model_info) ??
    extractOllamaNumCtxParameter(details.parameters)
  if (contextLength !== undefined) {
    setCachedOllamaContextLength(options.model, contextLength)
  }
  return contextLength
}

export function clearOllamaClientCache(): void {
  cachedClient = null
  clearOllamaContextLengthCache()
}
