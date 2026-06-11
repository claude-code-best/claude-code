import { getProxyFetchOptions } from 'src/utils/proxy.js'
import type { ResponsesRequest } from '../openai/responsesAdapter.js'
import {
  createChatGPTResponsesStream,
  parseSSE,
} from '../openai/responsesAdapter.js'

/**
 * Codex client — sends native Responses API requests.
 *
 * Environment variables:
 *
 * CODEX_API_KEY: Required. API key for the Codex endpoint.
 * CODEX_BASE_URL: Optional. Base URL (e.g. http://localhost:11434/v1).
 *   Defaults to https://api.openai.com/v1.
 * CODEX_RESPONSES_URL: Optional. Full Responses API URL. Takes precedence
 *   over CODEX_BASE_URL.
 */

const DEFAULT_BASE_URL = 'https://api.openai.com/v1'

function getCodexResponsesUrl(): string {
  if (process.env.CODEX_RESPONSES_URL) {
    return process.env.CODEX_RESPONSES_URL
  }

  const url = new URL(process.env.CODEX_BASE_URL || DEFAULT_BASE_URL)
  const pathname = url.pathname.replace(/\/+$/, '')
  if (
    pathname.endsWith('/responses') ||
    pathname.endsWith('/responses/compact')
  ) {
    return url.toString()
  }
  url.pathname = `${pathname}/responses`
  return url.toString()
}

export async function createCodexResponsesStream(params: {
  request: ResponsesRequest
  signal: AbortSignal
  fetchOverride?: typeof fetch
}): Promise<AsyncIterable<Record<string, unknown>>> {
  if (process.env.CODEX_AUTH_MODE === 'chatgpt') {
    return createChatGPTResponsesStream(params)
  }

  const apiKey = process.env.CODEX_API_KEY || ''
  const fetchFn = params.fetchOverride ?? (globalThis.fetch as typeof fetch)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'OpenAI-Beta': 'responses=experimental',
    originator: 'claude-code-best',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetchFn(getCodexResponsesUrl(), {
    ...(getProxyFetchOptions({ forAnthropicAPI: false }) as RequestInit),
    method: 'POST',
    headers,
    body: JSON.stringify(params.request),
    signal: params.signal,
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Codex Responses API request failed (${response.status})${text ? `: ${text.slice(0, 500)}` : ''}`,
    )
  }
  return parseSSE(response)
}
