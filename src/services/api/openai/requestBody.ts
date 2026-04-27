/**
 * Pure utility functions for building OpenAI request bodies and detecting
 * thinking mode. Extracted from index.ts so tests can import them without
 * triggering heavy module side-effects (OpenAI client, stream adapter, etc.).
 */
import type {
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions/completions.mjs'
import { isEnvTruthy, isEnvDefinedFalsy } from '../../../utils/envUtils.js'

/**
 * Detect whether DeepSeek-style thinking mode should be enabled.
 *
 * Enabled when:
 * 1. OPENAI_ENABLE_THINKING=1 is set (explicit enable), OR
 * 2. Model name contains "deepseek-reasoner" OR "DeepSeek-V3.2" (auto-detect, case-insensitive)
 *
 * Disabled when:
 * - OPENAI_ENABLE_THINKING=0/false/no/off is explicitly set (overrides model detection)
 *
 * @param model - The resolved OpenAI model name
 */
export function isOpenAIThinkingEnabled(model: string): boolean {
  // Explicit disable takes priority (overrides model auto-detect)
  if (isEnvDefinedFalsy(process.env.OPENAI_ENABLE_THINKING)) return false
  // Explicit enable
  if (isEnvTruthy(process.env.OPENAI_ENABLE_THINKING)) return true
  // Auto-detect from model name (all DeepSeek models support thinking mode)
  const modelLower = model.toLowerCase()
  return modelLower.includes('deepseek')
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
  return maxOutputTokensOverride
    ?? (process.env.OPENAI_MAX_TOKENS ? parseInt(process.env.OPENAI_MAX_TOKENS, 10) || undefined : undefined)
    ?? (process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS ? parseInt(process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS, 10) || undefined : undefined)
    ?? upperLimit
}

/**
 * Build the request body for OpenAI chat.completions.create().
 * Extracted for testability — the thinking mode params are injected here.
 *
 * DeepSeek thinking mode: inject thinking params via request body.
 * Two formats are added simultaneously to support different deployments:
 * - Official DeepSeek API: `thinking: { type: 'enabled' }`
 * - Self-hosted DeepSeek-V3.2: `enable_thinking: true` + `chat_template_kwargs: { thinking: true }`
 * OpenAI SDK passes unknown keys through to the HTTP body.
 * Each endpoint will use the format it recognizes and ignore the others.
 */
export function buildOpenAIRequestBody(params: {
  model: string
  messages: any[]
  tools: any[]
  toolChoice: any
  enableThinking: boolean
  maxTokens: number
  temperatureOverride?: number
}): ChatCompletionCreateParamsStreaming & {
  thinking?: { type: string }
  enable_thinking?: boolean
  chat_template_kwargs?: { thinking: boolean }
} {
  const { model, messages, tools, toolChoice, enableThinking, maxTokens, temperatureOverride } = params
  return {
    model,
    messages,
    max_tokens: maxTokens,
    ...(tools.length > 0 && {
      tools,
      ...(toolChoice && { tool_choice: toolChoice }),
    }),
    stream: true,
    stream_options: { include_usage: true },
    // DeepSeek thinking mode: enable chain-of-thought output.
    // When active, temperature/top_p/presence_penalty/frequency_penalty are ignored by DeepSeek.
    ...(enableThinking && {
      // Official DeepSeek API format
      thinking: { type: 'enabled' },
      // Self-hosted DeepSeek-V3.2 format
      enable_thinking: true,
      chat_template_kwargs: { thinking: true },
    }),
    // Only send temperature when thinking mode is off (DeepSeek ignores it anyway,
    // but other providers may respect it)
    ...(!enableThinking && temperatureOverride !== undefined && {
      temperature: temperatureOverride,
    }),
  }
}
