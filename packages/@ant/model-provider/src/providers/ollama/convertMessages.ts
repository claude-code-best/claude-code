import type {
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { AssistantMessage, UserMessage } from '../../types/message.js'
import type { SystemPrompt } from '../../types/systemPrompt.js'
import type { OllamaMessage } from './types.js'

function safeParseJSON(json: string | null | undefined): unknown {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function anthropicMessagesToOllama(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: SystemPrompt,
): OllamaMessage[] {
  const result: OllamaMessage[] = []
  const toolNamesById = new Map<string, string>()
  const systemText = systemPromptToText(systemPrompt)

  if (systemText) {
    result.push({ role: 'system', content: systemText })
  }

  for (const msg of messages) {
    if (msg.type === 'assistant') {
      result.push(convertInternalAssistantMessage(msg))
      const content = msg.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (typeof block !== 'string' && block.type === 'tool_use') {
            toolNamesById.set(block.id, block.name)
          }
        }
      }
      continue
    }

    if (msg.type === 'user') {
      result.push(...convertInternalUserMessage(msg, toolNamesById))
    }
  }

  return result
}

function systemPromptToText(systemPrompt: SystemPrompt): string {
  if (!systemPrompt || systemPrompt.length === 0) return ''
  return systemPrompt.filter(Boolean).join('\n\n')
}

function convertInternalUserMessage(
  msg: UserMessage,
  toolNamesById: ReadonlyMap<string, string>,
): OllamaMessage[] {
  const content = msg.message.content
  if (typeof content === 'string') {
    return [{ role: 'user', content }]
  }

  if (!Array.isArray(content)) {
    return []
  }

  const textParts: string[] = []
  const images: string[] = []
  const toolResults: OllamaMessage[] = []

  for (const block of content) {
    if (typeof block === 'string') {
      textParts.push(block)
      continue
    }

    if (block.type === 'text') {
      textParts.push(block.text)
      continue
    }

    if (block.type === 'tool_result') {
      const toolResult = block as BetaToolResultBlockParam
      toolResults.push({
        role: 'tool',
        tool_name:
          toolNamesById.get(toolResult.tool_use_id) ?? toolResult.tool_use_id,
        content: normalizeToolResultContent(toolResult),
      })
      continue
    }

    if (block.type === 'image') {
      const imageData = convertImageBlockToOllama(
        block as unknown as Record<string, unknown>,
      )
      if (imageData) images.push(imageData)
    }
  }

  const messages = [...toolResults]
  if (textParts.length > 0 || images.length > 0) {
    messages.push({
      role: 'user',
      content: textParts.join('\n'),
      ...(images.length > 0 && { images }),
    })
  }
  return messages
}

function convertInternalAssistantMessage(msg: AssistantMessage): OllamaMessage {
  const content = msg.message.content
  if (typeof content === 'string') {
    return { role: 'assistant', content }
  }

  if (!Array.isArray(content)) {
    return { role: 'assistant', content: '' }
  }

  const textParts: string[] = []
  const thinkingParts: string[] = []
  const toolCalls: OllamaMessage['tool_calls'] = []

  for (const block of content) {
    if (typeof block === 'string') {
      textParts.push(block)
      continue
    }

    if (block.type === 'text') {
      textParts.push(block.text)
      continue
    }

    if (block.type === 'thinking') {
      thinkingParts.push(block.thinking)
      continue
    }

    if (block.type === 'tool_use') {
      const toolUse = block as BetaToolUseBlock
      toolCalls.push({
        type: 'function',
        function: {
          index: toolCalls.length,
          name: toolUse.name,
          arguments: normalizeToolUseInput(toolUse.input),
        },
      })
    }
  }

  return {
    role: 'assistant',
    content: textParts.join('\n'),
    ...(thinkingParts.length > 0 && { thinking: thinkingParts.join('\n') }),
    ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
  }
}

function normalizeToolUseInput(input: unknown): Record<string, unknown> {
  if (typeof input === 'string') {
    const parsed = safeParseJSON(input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return parsed === null ? {} : { value: parsed }
  }

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }

  return input === undefined ? {} : { value: input }
}

function normalizeToolResultContent(block: BetaToolResultBlockParam): string {
  const content = block.content
  let value: string

  if (typeof content === 'string') {
    value = content
  } else if (Array.isArray(content)) {
    value = content
      .map(item => {
        if (typeof item === 'string') return item
        if ('text' in item) return item.text
        return ''
      })
      .filter(Boolean)
      .join('\n')
  } else {
    value = ''
  }

  return block.is_error ? `Error: ${value}` : value
}

function convertImageBlockToOllama(
  block: Record<string, unknown>,
): string | undefined {
  const source = block.source as Record<string, unknown> | undefined
  if (source?.type === 'base64' && typeof source.data === 'string') {
    return source.data
  }
  return undefined
}
