import OpenAI from 'openai'
import { openaiAdapter } from 'src/services/providerUsage/adapters/openai.js'
import { updateProviderBuckets } from 'src/services/providerUsage/store.js'
import { getProxyFetchOptions } from 'src/utils/proxy.js'

export const DEFAULT_CODEX_BASE_URL = 'https://api.openai.com/v1'

let cachedClient: OpenAI | null = null

function wrapFetchForUsage(base: typeof fetch): typeof fetch {
  const wrapped = async (
    ...args: Parameters<typeof fetch>
  ): Promise<Response> => {
    const res = await base(...args)
    try {
      updateProviderBuckets('codex', openaiAdapter.parseHeaders(res.headers))
    } catch {
      // Usage tracking must not affect the request path.
    }
    return res
  }
  return wrapped as unknown as typeof fetch
}

export function getCodexClient(options?: {
  maxRetries?: number
  fetchOverride?: typeof fetch
}): OpenAI {
  if (cachedClient && !options?.fetchOverride) {
    return cachedClient
  }

  const apiKey = process.env.CODEX_API_KEY || ''
  const baseURL = process.env.CODEX_BASE_URL || DEFAULT_CODEX_BASE_URL
  const baseFetch = options?.fetchOverride ?? (globalThis.fetch as typeof fetch)
  const wrappedFetch = wrapFetchForUsage(baseFetch)

  const client = new OpenAI({
    apiKey,
    baseURL,
    maxRetries: options?.maxRetries ?? 0,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({ forAnthropicAPI: false }),
    fetch: wrappedFetch,
  })

  if (!options?.fetchOverride) {
    cachedClient = client
  }

  return client
}

export function clearCodexClientCache(): void {
  cachedClient = null
}
