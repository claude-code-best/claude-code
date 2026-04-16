import type {
  BetaContentBlockParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionUserMessageParam,
} from 'openai/resources/chat/completions/completions.mjs'
import type { AssistantMessage, UserMessage } from '../types/message.js'
import type { SystemPrompt } from '../types/systemPrompt.js'

export interface ConvertMessagesOptions {
  /** When true, preserve thinking blocks as reasoning_content on assistant messages
   *  (required for DeepSeek thinking mode with tool calls). */
  enableThinking?: boolean
}

/**
 * Convert internal (UserMessage | AssistantMessage)[] to OpenAI-format messages.
 *
 * Key conversions:
 * - system prompt → role: "system" message prepended
 * - tool_use blocks → tool_calls[] on assistant message
 * - tool_result blocks → role: "tool" messages
 * - thinking blocks → silently dropped (or preserved as reasoning_content when enableThinking=true)
 * - cache_control → stripped
 */
export function anthropicMessagesToOpenAI(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: SystemPrompt,
  options?: ConvertMessagesOptions,
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = []
  const enableThinking = options?.enableThinking ?? false

  // Prepend system prompt as system message
  const systemText = systemPromptToText(systemPrompt)
  if (systemText) {
    result.push({
      role: 'system',
      content: systemText,
    } satisfies ChatCompletionSystemMessageParam)
  }

  // When thinking mode is on, detect turn boundaries so that reasoning_content
  // from *previous* user turns is stripped (saves bandwidth; DeepSeek ignores it).
  // A "new turn" starts when a user text message appears after at least one assistant response.
  const turnBoundaries = new Set<number>()
  if (enableThinking) {
    let hasSeenAssistant = false
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (msg.type === 'assistant') {
        hasSeenAssistant = true
      }
      if (msg.type === 'user' && hasSeenAssistant) {
        const content = msg.message.content
        // A user message starts a new turn if it contains any non-tool_result content
        // (text, image, or other media). Tool results alone do NOT start a new turn
        // because they are continuations of the previous assistant tool call.
        const startsNewUserTurn = typeof content === 'string'
          ? content.length > 0
          : Array.isArray(content) && content.some(
              (b: any) =>
                typeof b === 'string' ||
                (b &&
                  typeof b === 'object' &&
                  'type' in b &&
                  b.type !== 'tool_result'),
            )
        if (startsNewUserTurn) {
          turnBoundaries.add(i)
        }
      }
    }
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    switch (msg.type) {
      case 'user':
        result.push(...convertInternalUserMessage(msg))
        break
      case 'assistant':
        // Preserve reasoning_content unless we're before a turn boundary
        // (i.e., from a previous user Q&A round)
        const preserveReasoning = enableThinking && !isBeforeAnyTurnBoundary(i, turnBoundaries)
        result.push(...convertInternalAssistantMessage(msg, preserveReasoning))
        break
      default:
        break
    }
  }

  return result
}

function systemPromptToText(systemPrompt: SystemPrompt): string {
  if (!systemPrompt || systemPrompt.length === 0) return ''
  return systemPrompt
    .filter(Boolean)
    .join('\n\n')
}

/**
 * Check if index `i` falls before any turn boundary (i.e. it belongs to a previous turn).
 * A message at index i is "before" a boundary if there exists a boundary j where i < j.
 */
function isBeforeAnyTurnBoundary(i: number, boundaries: Set<number>): boolean {
  for (const b of boundaries) {
    if (i < b) return true
  }
  return false
}

function convertInternalUserMessage(
  msg: UserMessage,
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = []
  const content = msg.message.content

  if (typeof content === 'string') {
    result.push({
      role: 'user',
      content,
    } satisfies ChatCompletionUserMessageParam)
  } else if (Array.isArray(content)) {
    const textParts: string[] = []
    const toolResults: BetaToolResultBlockParam[] = []
    const imageParts: Array<{ type: 'image_url'; image_url: { url: string } }> = []

    for (const block of content) {
      if (typeof block === 'string') {
        textParts.push(block)
      } else if (block.type === 'text') {
        textParts.push(block.text)
      } else if (block.type === 'tool_result') {
        toolResults.push(block as BetaToolResultBlockParam)
      } else if (block.type === 'image') {
        const imagePart = convertImageBlockToOpenAI(block as unknown as Record<string, unknown>)
        if (imagePart) {
          imageParts.push(imagePart)
        }
      }
    }

    // CRITICAL: tool messages must come BEFORE any user message in the result.
    // OpenAI API requires that a tool message immediately follows the assistant
    // message with tool_calls. If we emit a user message first, the API will
    // reject the request with "insufficient tool messages following tool_calls".
    for (const tr of toolResults) {
      result.push(convertToolResult(tr))
    }

    // 如果有图片，构建多模态 content 数组
    if (imageParts.length > 0) {
      const multiContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = []
      if (textParts.length > 0) {
        multiContent.push({ type: 'text', text: textParts.join('\n') })
      }
      multiContent.push(...imageParts)
      result.push({
        role: 'user',
        content: multiContent,
      } satisfies ChatCompletionUserMessageParam)
    } else if (textParts.length > 0) {
      result.push({
        role: 'user',
        content: textParts.join('\n'),
      } satisfies ChatCompletionUserMessageParam)
    }
  }

  return result
}

function convertToolResult(
  block: BetaToolResultBlockParam,
): ChatCompletionToolMessageParam {
  let content: string
  if (typeof block.content === 'string') {
    content = block.content
  } else if (Array.isArray(block.content)) {
    content = block.content
      .map(c => {
        if (typeof c === 'string') return c
        if ('text' in c) return c.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  } else {
    content = ''
  }

  return {
    role: 'tool',
    tool_call_id: block.tool_use_id,
    content,
  } satisfies ChatCompletionToolMessageParam
}

function convertInternalAssistantMessage(
  msg: AssistantMessage,
  preserveReasoning = false,
): ChatCompletionMessageParam[] {
  const content = msg.message.content

  if (typeof content === 'string') {
    return [
      {
        role: 'assistant',
        content,
      } satisfies ChatCompletionAssistantMessageParam,
    ]
  }

  if (!Array.isArray(content)) {
    return [
      {
        role: 'assistant',
        content: '',
      } satisfies ChatCompletionAssistantMessageParam,
    ]
  }

  const textParts: string[] = []
  const toolCalls: NonNullable<ChatCompletionAssistantMessageParam['tool_calls']> = []
  const reasoningParts: string[] = []

  for (const block of content) {
    if (typeof block === 'string') {
      textParts.push(block)
    } else if (block.type === 'text') {
      textParts.push(block.text)
    } else if (block.type === 'tool_use') {
      const tu = block as BetaToolUseBlock
      toolCalls.push({
        id: tu.id,
        type: 'function',
        function: {
          name: tu.name,
          arguments:
            typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input),
        },
      })
    } else if (block.type === 'thinking' && preserveReasoning) {
      // DeepSeek thinking mode: preserve reasoning_content for tool call iterations
      const thinkingText = (block as unknown as Record<string, unknown>).thinking
      if (typeof thinkingText === 'string' && thinkingText) {
        reasoningParts.push(thinkingText)
      }
    }
    // Skip redacted_thinking, server_tool_use, etc.
  }

  const result: ChatCompletionAssistantMessageParam = {
    role: 'assistant',
    content: textParts.length > 0 ? textParts.join('\n') : null,
    ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
    ...(reasoningParts.length > 0 && { reasoning_content: reasoningParts.join('\n') }),
  }

  return [result]
}

/**
 * 将 Anthropic image 块转换为 OpenAI image_url 格式。
 *
 * Anthropic 格式: { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }
 * OpenAI 格式: { type: "image_url", image_url: { url: "data:image/png;base64,..." } }
 */
function convertImageBlockToOpenAI(
  block: Record<string, unknown>,
): { type: 'image_url'; image_url: { url: string } } | null {
  const source = block.source as Record<string, unknown> | undefined
  if (!source) return null

  if (source.type === 'base64' && typeof source.data === 'string') {
    const mediaType = (source.media_type as string) || 'image/png'
    return {
      type: 'image_url',
      image_url: {
        url: `data:${mediaType};base64,${source.data}`,
      },
    }
  }

  // url 类型的图片直接传递
  if (source.type === 'url' && typeof source.url === 'string') {
    return {
      type: 'image_url',
      image_url: {
        url: source.url,
      },
    }
  }

  return null
}
