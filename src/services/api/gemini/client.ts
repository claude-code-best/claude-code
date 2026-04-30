import { parseSSEFrames } from 'src/cli/transports/SSETransport.js'
import { errorMessage } from 'src/utils/errors.js'
import { getProxyFetchOptions } from 'src/utils/proxy.js'
import type {
  GeminiGenerateContentRequest,
  GeminiStreamChunk,
} from '@ant/model-provider'

const DEFAULT_GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta'

const STREAM_DECODE_OPTS: TextDecodeOptions = { stream: true }

function getGeminiBaseUrl(): string {
  return (process.env.GEMINI_BASE_URL || DEFAULT_GEMINI_BASE_URL).replace(
    /\/+$/,
    '',
  )
}

function getGeminiModelPath(model: string): string {
  const normalized = model.replace(/^\/+/, '')
  return normalized.startsWith('models/') ? normalized : `models/${normalized}`
}

export async function* streamGeminiGenerateContent(params: {
  model: string
  body: GeminiGenerateContentRequest
  signal: AbortSignal
  fetchOverride?: typeof fetch
}): AsyncGenerator<GeminiStreamChunk, void> {
  const fetchImpl = params.fetchOverride ?? fetch
  const url = `${getGeminiBaseUrl()}/${getGeminiModelPath(params.model)}:streamGenerateContent?alt=sse`

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY || '',
    },
    body: JSON.stringify(params.body),
    signal: params.signal,
    ...getProxyFetchOptions({ forAnthropicAPI: false }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Gemini API request failed (${response.status} ${response.statusText}): ${body || 'empty response body'}`,
    )
  }

  if (!response.body) {
    throw new Error('Gemini API returned no response body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, STREAM_DECODE_OPTS)
      const { frames, remaining } = parseSSEFrames(buffer)
      buffer = remaining

      for (const frame of frames) {
        if (!frame.data || frame.data === '[DONE]') continue
        try {
          yield JSON.parse(frame.data) as GeminiStreamChunk
        } catch (error) {
          throw new Error(
            `Failed to parse Gemini SSE payload: ${errorMessage(error)}`,
          )
        }
      }
    }

    buffer += decoder.decode()
    const { frames } = parseSSEFrames(buffer)
    for (const frame of frames) {
      if (!frame.data || frame.data === '[DONE]') continue
      try {
        yield JSON.parse(frame.data) as GeminiStreamChunk
      } catch (error) {
        throw new Error(
          `Failed to parse trailing Gemini SSE payload: ${errorMessage(error)}`,
        )
      }
    }
  } finally {
    reader.releaseLock()
  }
}
