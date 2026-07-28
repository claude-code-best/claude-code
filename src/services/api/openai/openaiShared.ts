/**
 * Shared utilities for OpenAI-compatible API paths.
 *
 * Both the OpenAI path (queryModelOpenAI) and Grok path (queryModelGrok) use
 * the same adapters (openaiStreamAdapter, openaiConvertMessages), so the event
 * processing logic should be shared rather than duplicated.
 *
 * Keep this module free of bootstrap/state imports so pure request-body unit
 * tests and isolated mocks do not need a full session runtime.
 */

/**
 * Whether a configured base URL resolves directly to OpenAI's official API.
 *
 * An absent URL means the OpenAI SDK default (`api.openai.com`). Regional
 * endpoints are subdomains of `api.openai.com`. Keep this strict so generic
 * OpenAI-compatible providers never receive OpenAI-specific cache parameters.
 */
export function isOfficialOpenAIBaseURL(baseURL: string | undefined): boolean {
  if (!baseURL?.trim()) return true

  try {
    const url = new URL(baseURL)
    const isOfficialHost =
      url.hostname === 'api.openai.com' ||
      url.hostname.endsWith('.api.openai.com')
    return (
      url.protocol === 'https:' &&
      isOfficialHost &&
      (url.port === '' || url.port === '443')
    )
  } catch {
    return false
  }
}

/**
 * Build a stable OpenAI `prompt_cache_key` for a session.
 *
 * OpenAI automatic prefix caching benefits from routing sticky keys so multi-turn
 * requests land on the same cache-bearing compute node. The key must be stable
 * for the whole conversation — never derived from full message bodies (that
 * changes every turn and defeats routing).
 *
 * Format: `ccb:<sessionId>`
 */
export function formatOpenAIPromptCacheKey(sessionId: string): string {
  return `ccb:${sessionId}`
}

/**
 * Return a session-sticky cache key only for OpenAI's official API endpoint.
 * Compatible providers must not receive OpenAI-specific request parameters.
 */
export function getOfficialOpenAIPromptCacheKey(
  baseURL: string | undefined,
  sessionId: string,
): string | undefined {
  return isOfficialOpenAIBaseURL(baseURL)
    ? formatOpenAIPromptCacheKey(sessionId)
    : undefined
}

/**
 * Merge a delta usage into the accumulated usage, preserving cache-related
 * fields from previous values when the delta carries explicit zeroes or
 * undefined values.
 *
 * Mirrors updateUsage() in claude.ts: a future adapter change that omits
 * cache fields from certain streaming events should not silently zero the
 * accumulated counters.
 */
export function updateOpenAIUsage(
  current: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  },
  delta: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  },
): typeof current {
  return {
    input_tokens: delta.input_tokens ?? current.input_tokens,
    output_tokens: delta.output_tokens ?? current.output_tokens,
    cache_creation_input_tokens:
      delta.cache_creation_input_tokens !== undefined &&
      delta.cache_creation_input_tokens > 0
        ? delta.cache_creation_input_tokens
        : current.cache_creation_input_tokens,
    cache_read_input_tokens:
      delta.cache_read_input_tokens !== undefined &&
      delta.cache_read_input_tokens > 0
        ? delta.cache_read_input_tokens
        : current.cache_read_input_tokens,
  }
}
