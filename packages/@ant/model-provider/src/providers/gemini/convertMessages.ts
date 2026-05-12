import type {
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { AssistantMessage, UserMessage } from '../../types/message.js'
import type { SystemPrompt } from '../../types/systemPrompt.js'
import {
  GEMINI_THOUGHT_SIGNATURE_FIELD,
  type GeminiContent,
  type GeminiGenerateContentRequest,
  type GeminiPart,
} from './types.js'

// Simple JSON parse utility (replaces safeParseJSON from main project)
function safeParseJSON(json: string | null | undefined): unknown {
  if (!json) return null
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function anthropicMessagesToGemini(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: SystemPrompt,
): Pick<GeminiGenerateContentRequest, 'contents' | 'systemInstruction'> {
  const contents: GeminiContent[] = []
  const toolNamesById = new Map<string, string>()

  for (const msg of messages) {
    if (msg.type === 'assistant') {
      const content = convertInternalAssistantMessage(msg)
      if (content.parts.length > 0) {
        contents.push(content)
      }

      const assistantContent = msg.message.content
      if (Array.isArray(assistantContent)) {
        for (const block of assistantContent) {
          if (typeof block !== 'string' && block.type === 'tool_use') {
            toolNamesById.set(block.id, block.name)
          }
        }
      }
      continue
    }

    if (msg.type === 'user') {
      const content = convertInternalUserMessage(msg, toolNamesById)
      if (content.parts.length > 0) {
        contents.push(content)
      }
    }
  }

  const systemText = systemPromptToText(systemPrompt)

  return {
    contents,
    ...(systemText
      ? {
          systemInstruction: {
            parts: [{ text: systemText }],
          },
        }
      : {}),
  }
}

function systemPromptToText(systemPrompt: SystemPrompt): string {
  if (!systemPrompt || systemPrompt.length === 0) return ''
  return systemPrompt.filter(Boolean).join('\n\n')
}

function convertInternalUserMessage(
  msg: UserMessage,
  toolNamesById: ReadonlyMap<string, string>,
): GeminiContent {
  const content = msg.message.content

  if (typeof content === 'string') {
    return {
      role: 'user',
      parts: createTextGeminiParts(content),
    }
  }

  if (!Array.isArray(content)) {
    return { role: 'user', parts: [] }
  }

  return {
    role: 'user',
    parts: content.flatMap(block =>
      convertUserContentBlockToGeminiParts(
        block as unknown as string | Record<string, unknown>,
        toolNamesById,
      ),
    ),
  }
}

function convertUserContentBlockToGeminiParts(
  block: string | Record<string, unknown>,
  toolNamesById: ReadonlyMap<string, string>,
): GeminiPart[] {
  if (typeof block === 'string') {
    return createTextGeminiParts(block)
  }

  if (block.type === 'text') {
    return createTextGeminiParts(block.text)
  }

  if (block.type === 'tool_result') {
    const toolResult = block as unknown as BetaToolResultBlockParam
    return [
      {
        functionResponse: {
          name:
            toolNamesById.get(toolResult.tool_use_id) ?? toolResult.tool_use_id,
          response: toolResultToResponseObject(toolResult),
        },
      },
    ]
  }

  // Convert Anthropic image blocks to Gemini inlineData
  if (block.type === 'image') {
    const source = block.source as Record<string, unknown> | undefined
    if (source?.type === 'base64' && typeof source.data === 'string') {
      const mediaType = (source.media_type as string) || 'image/png'
      return [
        {
          inlineData: {
            mimeType: mediaType,
            data: source.data,
          },
        },
      ]
    }
    // URL images not directly supported by Gemini, convert to text description
    if (source?.type === 'url' && typeof source.url === 'string') {
      return createTextGeminiParts(`[image: ${source.url}]`)
    }
  }

  return []
}

function convertInternalAssistantMessage(msg: AssistantMessage): GeminiContent {
  const content = msg.message.content

  if (typeof content === 'string') {
    return {
      role: 'model',
      parts: createTextGeminiParts(content),
    }
  }

  if (!Array.isArray(content)) {
    return { role: 'model', parts: [] }
  }

  const parts: GeminiPart[] = []
  for (const block of content) {
    if (typeof block === 'string') {
      parts.push(...createTextGeminiParts(block))
      continue
    }

    if (block.type === 'text') {
      parts.push(
        ...createTextGeminiParts(
          block.text,
          getGeminiThoughtSignature(
            block as unknown as Record<string, unknown>,
          ),
        ),
      )
      continue
    }

    if (block.type === 'thinking') {
      const thinkingPart = createThinkingGeminiPart(
        block.thinking,
        block.signature,
      )
      if (thinkingPart) {
        parts.push(thinkingPart)
      }
      continue
    }

    if (block.type === 'tool_use') {
      const toolUse = block as unknown as BetaToolUseBlock
      parts.push({
        functionCall: {
          name: toolUse.name,
          args: normalizeToolUseInput(toolUse.input),
        },
        ...(getGeminiThoughtSignature(
          block as unknown as Record<string, unknown>,
        ) && {
          thoughtSignature: getGeminiThoughtSignature(
            block as unknown as Record<string, unknown>,
          ),
        }),
      })
    }
  }

  return { role: 'model', parts }
}

function createTextGeminiParts(
  value: unknown,
  thoughtSignature?: string,
): GeminiPart[] {
  if (typeof value !== 'string' || value.length === 0) {
    return []
  }

  return [
    {
      text: value,
      ...(thoughtSignature && { thoughtSignature }),
    },
  ]
}

function createThinkingGeminiPart(
  value: unknown,
  thoughtSignature?: string,
): GeminiPart | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined
  }

  return {
    text: value,
    thought: true,
    ...(thoughtSignature && { thoughtSignature }),
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

function toolResultToResponseObject(
  block: BetaToolResultBlockParam,
): Record<string, unknown> {
  const result = normalizeToolResultContent(block.content)
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    return block.is_error
      ? { ...(result as Record<string, unknown>), is_error: true }
      : (result as Record<string, unknown>)
  }

  return {
    result,
    ...(block.is_error ? { is_error: true } : {}),
  }
}

function normalizeToolResultContent(content: unknown): unknown {
  if (typeof content === 'string') {
    const parsed = safeParseJSON(content)
    return parsed ?? content
  }

  if (Array.isArray(content)) {
    const text = content
      .map(part => {
        if (typeof part === 'string') return part
        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')

    const parsed = safeParseJSON(text)
    return parsed ?? text
  }

  return content ?? ''
}

function getGeminiThoughtSignature(
  block: Record<string, unknown>,
): string | undefined {
  const signature = block[GEMINI_THOUGHT_SIGNATURE_FIELD]
  return typeof signature === 'string' && signature.length > 0
    ? signature
    : undefined
}
