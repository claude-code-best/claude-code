import type {
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { AssistantMessage, UserMessage } from '../types/message.js'

export type OpenAIResponsesMessageContent =
  | { type: 'input_text'; text: string }
  | { type: 'output_text'; text: string }
  | { type: 'input_image'; image_url: string }

export type OpenAIResponsesReasoningItem = {
  type: 'reasoning'
  encrypted_content: string
  [key: string]: unknown
}

export type OpenAIResponsesInputItem =
  | {
      type: 'message'
      role: 'user' | 'assistant'
      content: OpenAIResponsesMessageContent[]
    }
  | {
      type: 'function_call'
      call_id: string
      name: string
      arguments: string
    }
  | {
      type: 'function_call_output'
      call_id: string
      output: string
    }
  | OpenAIResponsesReasoningItem

export function anthropicMessagesToOpenAIResponses(
  messages: (UserMessage | AssistantMessage)[],
): OpenAIResponsesInputItem[] {
  const result: OpenAIResponsesInputItem[] = []

  for (const msg of messages) {
    switch (msg.type) {
      case 'user':
        result.push(...convertUserMessage(msg))
        break
      case 'assistant':
        result.push(...convertAssistantMessage(msg))
        break
      default:
        break
    }
  }

  return result
}

export function extractOpenAIResponsesReasoningItemsFromResponse(
  response: unknown,
): OpenAIResponsesReasoningItem[] {
  if (!response || typeof response !== 'object') return []

  const output = (response as { output?: unknown }).output
  if (!Array.isArray(output)) return []

  return output.filter(isEncryptedReasoningItem) as OpenAIResponsesReasoningItem[]
}

function convertUserMessage(msg: UserMessage): OpenAIResponsesInputItem[] {
  const result: OpenAIResponsesInputItem[] = []
  const content = msg.message.content

  if (typeof content === 'string') {
    if (content.length > 0) {
      result.push({
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: content }],
      })
    }
    return result
  }

  if (!Array.isArray(content)) {
    return result
  }

  const toolOutputs: OpenAIResponsesInputItem[] = []
  const messageContent: OpenAIResponsesMessageContent[] = []

  for (const block of content) {
    if (block.type === 'text') {
      if (block.text.length > 0) {
        messageContent.push({ type: 'input_text', text: block.text })
      }
      continue
    }

    if (block.type === 'tool_result') {
      toolOutputs.push(convertToolResult(block as BetaToolResultBlockParam))
      continue
    }

    if (block.type === 'image') {
      const image = convertImageBlockToResponses(block as unknown as Record<string, unknown>)
      if (image) {
        messageContent.push(image)
      }
    }
  }

  result.push(...toolOutputs)
  if (messageContent.length > 0) {
    result.push({
      type: 'message',
      role: 'user',
      content: messageContent,
    })
  }

  return result
}

function convertAssistantMessage(msg: AssistantMessage): OpenAIResponsesInputItem[] {
  const result: OpenAIResponsesInputItem[] = []
  const content = msg.message.content

  const reasoningItems = Array.isArray(msg.openaiReasoningItems)
    ? msg.openaiReasoningItems.filter(isEncryptedReasoningItem)
    : []
  result.push(...reasoningItems)

  if (typeof content === 'string') {
    if (content.length > 0) {
      result.push({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: content }],
      })
    }
    return result
  }

  if (!Array.isArray(content)) {
    return result
  }

  const flushAssistantText = (parts: string[]) => {
    if (parts.length === 0) return
    result.push({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: parts.join('\n') }],
    })
    parts.length = 0
  }

  const textParts: string[] = []
  for (const block of content) {
    if (block.type === 'text') {
      if (block.text.length > 0) textParts.push(block.text)
      continue
    }

    if (block.type === 'tool_use') {
      flushAssistantText(textParts)
      result.push(convertToolUse(block as BetaToolUseBlock))
    }
  }

  flushAssistantText(textParts)
  return result
}

function convertToolUse(block: BetaToolUseBlock): OpenAIResponsesInputItem {
  return {
    type: 'function_call',
    call_id: block.id,
    name: block.name,
    arguments:
      typeof block.input === 'string' ? block.input : JSON.stringify(block.input ?? {}),
  }
}

function convertToolResult(block: BetaToolResultBlockParam): OpenAIResponsesInputItem {
  return {
    type: 'function_call_output',
    call_id: block.tool_use_id,
    output: stringifyToolResult(block.content),
  }
}

function stringifyToolResult(content: BetaToolResultBlockParam['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map(item => {
      if (typeof item === 'string') return item
      if ('text' in item && typeof item.text === 'string') return item.text
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function convertImageBlockToResponses(
  block: Record<string, unknown>,
): OpenAIResponsesMessageContent | null {
  const source = block.source as Record<string, unknown> | undefined
  if (!source) return null

  if (source.type === 'base64' && typeof source.data === 'string') {
    const mediaType = (source.media_type as string) || 'image/png'
    return {
      type: 'input_image',
      image_url: `data:${mediaType};base64,${source.data}`,
    }
  }

  if (source.type === 'url' && typeof source.url === 'string') {
    return {
      type: 'input_image',
      image_url: source.url,
    }
  }

  return null
}

function isEncryptedReasoningItem(item: unknown): item is OpenAIResponsesReasoningItem {
  return !!item &&
    typeof item === 'object' &&
    (item as { type?: unknown }).type === 'reasoning' &&
    typeof (item as { encrypted_content?: unknown }).encrypted_content === 'string'
}
