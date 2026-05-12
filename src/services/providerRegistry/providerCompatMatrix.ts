import type { CompatRule } from './types.js'

/**
 * Per-provider OpenAI-compat field whitelist.
 *
 * Each profile describes what an endpoint actually accepts so we can strip
 * fields that would cause a strict endpoint to reject the request.
 */
export interface CompatProfile {
  /**
   * Whether the server accepts stream_options.include_usage in chat completions.
   * Strict endpoints (Cerebras, Qwen) reject unknown top-level keys.
   */
  supportsStreamUsageOption: boolean

  /**
   * Whether the server accepts a custom 'thinking' field in messages.
   * Only permissive or DeepSeek-thinking endpoints accept this.
   */
  supportsThinkingField: boolean

  /**
   * How to handle reasoning_content in roundtrips.
   *
   * DeepSeek has three modes:
   *   - thinking-only:    model returns reasoning_content, no tools
   *   - thinking+tools:   model returns both reasoning_content and tool calls
   *   - normal:           model returns neither
   *
   * 'always-preserve':      echo back (DeepSeek thinking+tools roundtrip)
   * 'drop-on-non-thinking': remove unless current model is thinking variant
   * 'strip':                remove always (safe default for strict endpoints)
   */
  reasoningContentEcho: 'always-preserve' | 'drop-on-non-thinking' | 'strip'

  /**
   * Tool call schema flavor supported by the endpoint.
   * 'openai-v2' = standard OpenAI function-calling schema
   */
  toolCallFormat: 'openai-v2'
}

export const COMPAT_PROFILES: Record<CompatRule, CompatProfile> = {
  cerebras: {
    supportsStreamUsageOption: false,
    supportsThinkingField: false,
    reasoningContentEcho: 'strip',
    toolCallFormat: 'openai-v2',
  },
  groq: {
    supportsStreamUsageOption: false,
    supportsThinkingField: false,
    reasoningContentEcho: 'strip',
    toolCallFormat: 'openai-v2',
  },
  deepseek: {
    // DeepSeek-reasoner supports reasoning_content and the thinking field.
    // For normal deepseek-chat, thinking field is ignored rather than rejected.
    supportsStreamUsageOption: true,
    supportsThinkingField: true,
    reasoningContentEcho: 'always-preserve',
    toolCallFormat: 'openai-v2',
  },
  'strict-openai': {
    supportsStreamUsageOption: false,
    supportsThinkingField: false,
    reasoningContentEcho: 'strip',
    toolCallFormat: 'openai-v2',
  },
  permissive: {
    supportsStreamUsageOption: true,
    supportsThinkingField: true,
    reasoningContentEcho: 'drop-on-non-thinking',
    toolCallFormat: 'openai-v2',
  },
}

/**
 * Determine the DeepSeek reasoning mode based on presence of reasoning_content
 * and tool_calls in the assistant message.
 *
 * DeepSeek thinking-only:    has reasoning_content, no tool_calls
 * DeepSeek thinking+tools:   has reasoning_content AND tool_calls
 * DeepSeek normal:           no reasoning_content
 */
export function getDeepSeekReasoningMode(
  assistantMessage: Record<string, unknown>,
): 'thinking-only' | 'thinking+tools' | 'normal' {
  const hasReasoning = Boolean(assistantMessage['reasoning_content'])
  const toolCalls = assistantMessage['tool_calls']
  const hasTools = Array.isArray(toolCalls) && toolCalls.length > 0

  if (hasReasoning && hasTools) return 'thinking+tools'
  if (hasReasoning) return 'thinking-only'
  return 'normal'
}

/**
 * Apply a compat rule to an outgoing request body, dropping fields the
 * target endpoint won't accept. Returns a new object (immutable).
 *
 * This is a pure function: it does not mutate the input body.
 */
export function applyCompatRule(
  body: Record<string, unknown>,
  rule: CompatRule,
): Record<string, unknown> {
  const profile = COMPAT_PROFILES[rule]
  const result: Record<string, unknown> = { ...body }

  // Strip stream_options.include_usage if endpoint doesn't support it
  if (!profile.supportsStreamUsageOption) {
    const streamOptions = result['stream_options']
    if (
      streamOptions !== null &&
      typeof streamOptions === 'object' &&
      !Array.isArray(streamOptions)
    ) {
      const { include_usage: _dropped, ...rest } = streamOptions as Record<
        string,
        unknown
      >
      if (Object.keys(rest).length === 0) {
        delete result['stream_options']
      } else {
        result['stream_options'] = rest
      }
    }
  }

  // Strip 'thinking' field from messages if endpoint doesn't support it
  if (!profile.supportsThinkingField && Array.isArray(result['messages'])) {
    result['messages'] = (result['messages'] as Record<string, unknown>[]).map(
      msg => {
        if ('thinking' in msg) {
          const { thinking: _dropped, ...rest } = msg
          return rest
        }
        return msg
      },
    )
  }

  // Handle reasoning_content echo policy
  if (
    profile.reasoningContentEcho === 'strip' &&
    Array.isArray(result['messages'])
  ) {
    result['messages'] = (result['messages'] as Record<string, unknown>[]).map(
      msg => {
        if ('reasoning_content' in msg) {
          const { reasoning_content: _dropped, ...rest } = msg
          return rest
        }
        return msg
      },
    )
  }

  // For 'drop-on-non-thinking': strip reasoning_content unless model name
  // indicates a thinking variant (contains 'reason' or 'think' in model string)
  if (profile.reasoningContentEcho === 'drop-on-non-thinking') {
    const model = typeof result['model'] === 'string' ? result['model'] : ''
    const isThinkingModel = /reason|think/i.test(model)
    if (!isThinkingModel && Array.isArray(result['messages'])) {
      result['messages'] = (
        result['messages'] as Record<string, unknown>[]
      ).map(msg => {
        if ('reasoning_content' in msg) {
          const { reasoning_content: _dropped, ...rest } = msg
          return rest
        }
        return msg
      })
    }
  }

  return result
}
