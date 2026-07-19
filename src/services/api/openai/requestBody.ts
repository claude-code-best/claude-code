/**
 * Pure utility functions for building OpenAI request bodies and detecting
 * thinking mode. Extracted from index.ts so tests can import them without
 * triggering heavy module side-effects (OpenAI client, stream adapter, etc.).
 */
import type { ChatCompletionCreateParamsStreaming } from 'openai/resources/chat/completions/completions.mjs'
import type { EffortLevel } from '../../../entrypoints/sdk/runtimeTypes.js'
import { isEnvDefinedFalsy } from '../../../utils/envUtils.js'
import { getOpenAIPromptCacheKey } from './openaiShared.js'

/**
 * Detect whether thinking mode should be enabled for this model.
 *
 * Enabled for DeepSeek and MiMo models unless OPENAI_ENABLE_THINKING is
 * explicitly disabled. Other models use standard reasoning_effort without
 * receiving provider-specific thinking fields.
 *
 * @param model - The resolved OpenAI model name
 */
export function isOpenAIThinkingEnabled(model: string): boolean {
  // Explicit disable takes priority (overrides model auto-detect)
  if (isEnvDefinedFalsy(process.env.OPENAI_ENABLE_THINKING)) return false
  // DeepSeek and MiMo use the provider-specific thinking body below. For other
  // models OPENAI_ENABLE_THINKING only gates standard reasoning_effort.
  // Auto-detect from model name (DeepSeek and MiMo models support thinking mode).
  // Grok is intentionally excluded — Grok reasoning models reason automatically
  // and do NOT require thinking/enable_thinking request body parameters.
  const modelLower = model.toLowerCase()
  return modelLower.includes('deepseek') || modelLower.includes('mimo')
}

/**
 * Resolve max output tokens for the OpenAI-compatible path.
 *
 * Override priority:
 * 1. maxOutputTokensOverride (programmatic, from query pipeline)
 * 2. OPENAI_MAX_TOKENS env var (OpenAI-specific, useful for local models
 *    with small context windows, e.g. RTX 3060 12GB running 65536-token models)
 * 3. CLAUDE_CODE_MAX_OUTPUT_TOKENS env var (generic override)
 * 4. upperLimit default (64000)
 */
export function resolveOpenAIMaxTokens(
  upperLimit: number,
  maxOutputTokensOverride?: number,
): number {
  return (
    maxOutputTokensOverride ??
    (process.env.OPENAI_MAX_TOKENS
      ? parseInt(process.env.OPENAI_MAX_TOKENS, 10) || undefined
      : undefined) ??
    (process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS
      ? parseInt(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, 10) || undefined
      : undefined) ??
    upperLimit
  )
}

/**
 * Build the request body for OpenAI chat.completions.create().
 * Reasoning effort uses the standard top-level `reasoning_effort` field.
 * DeepSeek and MiMo additionally receive `thinking: { type: 'enabled' }`.
 */
type OpenAIChatRequestBody = Omit<
  ChatCompletionCreateParamsStreaming,
  'reasoning_effort'
> & {
  reasoning_effort?: EffortLevel
  thinking?: { type: 'enabled' }
  prompt_cache_key?: string
}

export function buildOpenAIRequestBody(params: {
  model: string
  messages: any[]
  tools: any[]
  toolChoice: any
  enableThinking: boolean
  maxTokens: number
  temperatureOverride?: number
  reasoningEffort?: EffortLevel
  /** Override for tests; production uses the current CCB session id. */
  promptCacheKey?: string
}): OpenAIChatRequestBody {
  const {
    model,
    messages,
    tools,
    toolChoice,
    enableThinking,
    maxTokens,
    temperatureOverride,
    reasoningEffort,
    promptCacheKey,
  } = params
  return {
    model,
    messages,
    max_tokens: maxTokens,
    ...(reasoningEffort && { reasoning_effort: reasoningEffort }),
    ...(tools.length > 0 && {
      tools,
      ...(toolChoice && { tool_choice: toolChoice }),
    }),
    stream: true,
    stream_options: { include_usage: true },
    // Sticky cache routing for multi-turn OpenAI/compatible endpoints that
    // honor prompt_cache_key. Process-stable by default (not message-derived).
    prompt_cache_key: promptCacheKey ?? getOpenAIPromptCacheKey(),
    // Enable chain-of-thought output for DeepSeek and MiMo models.
    // When active, temperature/top_p/presence_penalty/frequency_penalty are ignored.
    ...(enableThinking && {
      // Official DeepSeek API format
      thinking: { type: 'enabled' },
      // Self-hosted DeepSeek-V3.2 format
      enable_thinking: true,
      // Both DeepSeek self-hosted and MiMo formats in chat_template_kwargs
      chat_template_kwargs: { thinking: true, enable_thinking: true },
    }),
    // Only send temperature when thinking mode is off (DeepSeek ignores it anyway,
    // but other providers may respect it)
    ...(!enableThinking &&
      temperatureOverride !== undefined && {
        temperature: temperatureOverride,
      }),
  }
}
