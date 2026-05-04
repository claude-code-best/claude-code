import type { BetaUsage as Usage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { roughTokenCountEstimationForMessages } from '../services/tokenEstimation.js'
import type {
  AssistantMessage,
  ContentItem,
  Message,
} from '../types/message.js'
import { SYNTHETIC_MESSAGES, SYNTHETIC_MODEL } from './messages.js'
import { jsonStringify } from './slowOperations.js'

export function getTokenUsage(message: Message): Usage | undefined {
  if (
    message?.type === 'assistant' &&
    message.message &&
    'usage' in message.message &&
    !(
      Array.isArray(message.message.content) &&
      (message.message.content as ContentItem[])[0]?.type === 'text' &&
      SYNTHETIC_MESSAGES.has(
        (message.message.content as Array<ContentItem & { text: string }>)[0]!
          .text,
      )
    ) &&
    message.message.model !== SYNTHETIC_MODEL
  ) {
    return message.message.usage as Usage
  }
  return undefined
}

/**
 * Get the API response id for an assistant message with real (non-synthetic) usage.
 * Used to identify split assistant records that came from the same API response —
 * when parallel tool calls are streamed, each content block becomes a separate
 * AssistantMessage record, but they all share the same message.id.
 */
function getAssistantMessageId(message: Message): string | undefined {
  if (
    message?.type === 'assistant' &&
    'id' in message.message! &&
    message.message!.model !== SYNTHETIC_MODEL
  ) {
    return message.message!.id
  }
  return undefined
}

/**
 * Calculate total context window tokens from an API response's usage data.
 * Includes input_tokens + cache tokens + output_tokens.
 *
 * This represents the full context size at the time of that API call.
 * Use tokenCountWithEstimation() when you need context size from messages.
 */
export function getTokenCountFromUsage(usage: Usage): number {
  if (!usage) {
    return 0
  }
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.output_tokens ?? 0)
  )
}

export function tokenCountFromLastAPIResponse(messages: Message[]): number {
  let i = messages.length - 1
  while (i >= 0) {
    const message = messages[i]
    const usage = message ? getTokenUsage(message) : undefined
    if (usage) {
      return getTokenCountFromUsage(usage)
    }
    i--
  }
  return 0
}

/**
 * Final context window size from the last API response's usage.iterations[-1].
 * Used for task_budget.remaining computation across compaction boundaries —
 * the server's budget countdown is context-based, so remaining decrements by
 * the pre-compact final window, not billing spend. See monorepo
 * api/api/sampling/prompt/renderer.py:292 for the server-side computation.
 *
 * Falls back to top-level input_tokens + output_tokens when iterations is
 * absent (no server-side tool loops, so top-level usage IS the final window).
 * Both paths exclude cache tokens to match #304930's formula.
 */
export function finalContextTokensFromLastResponse(
  messages: Message[],
): number {
  let i = messages.length - 1
  while (i >= 0) {
    const message = messages[i]
    const usage = message ? getTokenUsage(message) : undefined
    if (usage) {
      // Stainless types don't include iterations yet — cast like advisor.ts:43
      const iterations = (
        usage as {
          iterations?: Array<{
            input_tokens: number
            output_tokens: number
          }> | null
        }
      ).iterations
      if (iterations && iterations.length > 0) {
        const last = iterations.at(-1)!
        return last.input_tokens + last.output_tokens
      }
      // No iterations → no server tool loop → top-level usage IS the final
      // window. Match the iterations path's formula (input + output, no cache)
      // rather than getTokenCountFromUsage — #304930 defines final window as
      // non-cache input + output. Whether the server's budget countdown
      // (renderer.py:292 calculate_context_tokens) counts cache the same way
      // is an open question; aligning with the iterations path keeps the two
      // branches consistent until that's resolved.
      return usage.input_tokens + usage.output_tokens
    }
    i--
  }
  return 0
}

/**
 * Get only the output_tokens from the last API response.
 * This excludes input context (system prompt, tools, prior messages).
 *
 * WARNING: Do NOT use this for threshold comparisons (autocompact, session memory).
 * Use tokenCountWithEstimation() instead, which measures full context size.
 * This function is only useful for measuring how many tokens Claude generated
 * in a single response, not how full the context window is.
 */
export function messageTokenCountFromLastAPIResponse(
  messages: Message[],
): number {
  let i = messages.length - 1
  while (i >= 0) {
    const message = messages[i]
    const usage = message ? getTokenUsage(message) : undefined
    if (usage) {
      return usage.output_tokens
    }
    i--
  }
  return 0
}

export function getCurrentUsage(messages: Message[]): {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
} | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    const usage = message ? getTokenUsage(message) : undefined
    if (usage) {
      const inputTokens =
        (usage.input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0)
      // Skip placeholder usage (all zeros) — third-party APIs may emit
      // message_start without real usage data, causing the context counter
      // to flash to 0. Fall through to the previous message instead.
      if (inputTokens === 0 && (usage.output_tokens ?? 0) === 0) continue
      return {
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      }
    }
  }
  return null
}

export function doesMostRecentAssistantMessageExceed200k(
  messages: Message[],
): boolean {
  const THRESHOLD = 200_000

  const lastAsst = messages.findLast(m => m.type === 'assistant')
  if (!lastAsst) return false
  const usage = getTokenUsage(lastAsst)
  return usage ? getTokenCountFromUsage(usage) > THRESHOLD : false
}

/**
 * Calculate the character content length of an assistant message.
 * Used for spinner token estimation (characters / 4 ≈ tokens).
 * This is used when subagent streaming events are filtered out and we
 * need to count content from completed messages instead.
 *
 * Counts the same content that handleMessageFromStream would count via deltas:
 * - text (text_delta)
 * - thinking (thinking_delta)
 * - redacted_thinking data
 * - tool_use input (input_json_delta)
 * Note: signature_delta is excluded from streaming counts (not model output).
 */
export function getAssistantMessageContentLength(
  message: AssistantMessage,
): number {
  let contentLength = 0
  const content = message.message?.content
  if (!Array.isArray(content)) return contentLength
  for (const block of content as ContentItem[]) {
    if (block.type === 'text') {
      contentLength += (block as ContentItem & { text: string }).text.length
    } else if (block.type === 'thinking') {
      contentLength += (block as ContentItem & { thinking: string }).thinking
        .length
    } else if (block.type === 'redacted_thinking') {
      contentLength += (block as ContentItem & { data: string }).data.length
    } else if (block.type === 'tool_use') {
      contentLength += jsonStringify(
        (block as ContentItem & { input: unknown }).input,
      ).length
    }
  }
  return contentLength
}
/**
 * 获取当前上下文窗口大小（以 token 为单位）。
 *
 * 这是检查阈值（自动压缩、会话内存初始化等）时测量上下文大小的标准函数。它使用上次 API 响应的 token 计数（输入 + 输出 + 缓存），加上此后添加的任何消息的估计值。
 *
 * 始终使用此函数，而不是：
 * - 累积 token 计数（上下文增长时会重复计数）
 * - messageTokenCountFromLastAPIResponse（仅统计 output_tokens）
 * - tokenCountFromLastAPIResponse（不估计新消息）
 *
 * 关于并行工具调用的实现说明：当模型在一个响应中进行多次工具调用时，
 * 流式代码会为每个内容块发出一个单独的助手记录（所有记录共享相同的 message.id 和使用情况），并且
 * 查询循环会在每个 tool_use 之后立即交错执行 tool_result。
 * 因此，消息数组如下所示：
 * [..., assistant(id=A), user(result), assistant(id=A), user(result), ...]
 * 如果我们只处理到最后一个 assistant 记录，我们只能估算出它之后的一条 tool_result 记录
 * 而会错过之前所有交错的 tool_result 记录——这些记录都将在
 * 下一次 API 请求中出现。为了避免计数不足，在找到一条使用记录后，
 * 我们回溯到第一个具有相同 message.id 的同级记录
 * 这样，每个交错的 tool_result 记录都会被包含在粗略估算中。
 */
export function tokenCountWithEstimation(messages: readonly Message[]): number {
  let i = messages.length - 1
  while (i >= 0) {
    const message = messages[i]
    const usage = message ? getTokenUsage(message) : undefined
    if (message && usage) {
      // Walk back past any earlier sibling records split from the same API
      // response (same message.id) so interleaved tool_results between them
      // are included in the estimation slice.
      const responseId = getAssistantMessageId(message)
      if (responseId) {
        let j = i - 1
        while (j >= 0) {
          const prior = messages[j]
          const priorId = prior ? getAssistantMessageId(prior) : undefined
          if (priorId === responseId) {
            // Earlier split of the same API response — anchor here instead.
            i = j
          } else if (priorId !== undefined) {
            // Hit a different API response — stop walking.
            break
          }
          // priorId === undefined: a user/tool_result/attachment message,
          // possibly interleaved between splits — keep walking.
          j--
        }
      }
      return (
        getTokenCountFromUsage(usage) +
        roughTokenCountEstimationForMessages(
          messages.slice(i + 1) as Parameters<
            typeof roughTokenCountEstimationForMessages
          >[0],
        )
      )
    }
    i--
  }
  return roughTokenCountEstimationForMessages(
    messages as Parameters<typeof roughTokenCountEstimationForMessages>[0],
  )
}
