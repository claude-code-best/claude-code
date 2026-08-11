export type AnthropicUsage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
}

/**
 * Convert OpenAI's total-input usage into Anthropic's disjoint usage fields.
 * Cache reads take priority when malformed provider data makes segments overlap.
 */
export function normalizeOpenAIUsage(params: {
  totalInputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}): AnthropicUsage {
  const totalInput = Math.max(0, params.totalInputTokens)
  const cacheRead = Math.min(
    Math.max(0, params.cacheReadTokens ?? 0),
    totalInput,
  )
  const remainingAfterRead = Math.max(0, totalInput - cacheRead)
  const cacheCreation = Math.min(
    Math.max(0, params.cacheWriteTokens ?? 0),
    remainingAfterRead,
  )

  return {
    input_tokens: Math.max(0, remainingAfterRead - cacheCreation),
    output_tokens: Math.max(0, params.outputTokens),
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
  }
}
