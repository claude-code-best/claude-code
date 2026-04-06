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
import type { AssistantMessage, UserMessage } from '../../../types/message.js'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'

/**
 * Convert internal (UserMessage | AssistantMessage)[] to OpenAI-format messages.
 *
 * Key conversions:
 * - system prompt → role: "system" message prepended
 * - tool_use blocks → tool_calls[] on assistant message
 * - tool_result blocks → role: "tool" messages
 * - thinking blocks → silently dropped
 * - cache_control → stripped
 */
export function anthropicMessagesToOpenAI(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: SystemPrompt,
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = []

  // Prepend system prompt as system message
  const systemText = systemPromptToText(systemPrompt)
  if (systemText) {
    result.push({
      role: 'system',
      content: systemText,
    } satisfies ChatCompletionSystemMessageParam)
  }

  for (const msg of messages) {
    switch (msg.type) {
      case 'user':
        result.push(...convertInternalUserMessage(msg))
        break
      case 'assistant':
        result.push(...convertInternalAssistantMessage(msg))
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
        const imagePart = convertImageBlockToOpenAI(block as Record<string, unknown>)
        if (imagePart) {
          imageParts.push(imagePart)
        }
      }
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

    for (const tr of toolResults) {
      result.push(convertToolResult(tr))
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
    }
    // Skip thinking, redacted_thinking, server_tool_use, etc.
  }

  const result: ChatCompletionAssistantMessageParam = {
    role: 'assistant',
    content: textParts.length > 0 ? textParts.join('\n') : null,
    ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
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
