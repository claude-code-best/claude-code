import type { BetaRawMessageStreamEvent, BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { AssistantMessage, UserMessage } from '../../../types/message.js'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import type { Stream } from 'openai/streaming.mjs'
import type {
  FunctionTool,
  ResponseCreateParamsStreaming,
  ResponseInputImage,
  ResponseInputItem,
  ResponseInputText,
  ResponseStreamEvent,
  ToolChoiceFunction,
  ToolChoiceOptions,
} from 'openai/resources/responses/responses.mjs'
import { randomUUID } from 'crypto'

export type OpenAIWireAPI = 'chat_completions' | 'responses'

export function resolveOpenAIWireAPI(): OpenAIWireAPI {
  const raw = process.env.OPENAI_WIRE_API?.trim().toLowerCase()
  if (
    raw === 'responses' ||
    raw === 'response'
  ) {
    return 'responses'
  }
  return 'chat_completions'
}

export function anthropicMessagesToResponses(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: SystemPrompt,
): {
  instructions: string | undefined
  input: ResponseInputItem[]
} {
  const input: ResponseInputItem[] = []

  for (const message of messages) {
    if (message.type === 'user') {
      input.push(...convertUserMessageToResponses(message))
      continue
    }
    if (message.type === 'assistant') {
      input.push(...convertAssistantMessageToResponses(message))
    }
  }

  const instructions = systemPromptToText(systemPrompt) || undefined
  return { instructions, input }
}

export function anthropicToolsToResponses(
  tools: BetaToolUnion[],
): FunctionTool[] {
  return tools
    .filter(tool => {
      const toolType = (tool as { type?: string }).type
      return (
        tool.type === 'custom' || !('type' in tool) || toolType !== 'server'
      )
    })
    .map(tool => {
      const anyTool = tool as unknown as Record<string, unknown>
      return {
        type: 'function',
        name: (anyTool.name as string) || '',
        description: (anyTool.description as string) || null,
        parameters: sanitizeJsonSchema(
          (anyTool.input_schema as Record<string, unknown> | undefined) || {
            type: 'object',
            properties: {},
          },
        ),
        strict:
          typeof anyTool.strict === 'boolean' ? anyTool.strict : null,
        ...(typeof anyTool.defer_loading === 'boolean'
          ? { defer_loading: anyTool.defer_loading }
          : {}),
      } satisfies FunctionTool
    })
}

export function anthropicToolChoiceToResponses(
  toolChoice: unknown,
): ToolChoiceOptions | ToolChoiceFunction | undefined {
  if (!toolChoice || typeof toolChoice !== 'object') return undefined

  const tc = toolChoice as Record<string, unknown>
  const type = tc.type as string

  switch (type) {
    case 'auto':
      return 'auto'
    case 'any':
      return 'required'
    case 'tool':
      return {
        type: 'function',
        name: tc.name as string,
      }
    default:
      return undefined
  }
}

export function buildOpenAIResponsesRequestBody(params: {
  model: string
  messages: (UserMessage | AssistantMessage)[]
  systemPrompt: SystemPrompt
  tools: BetaToolUnion[]
  toolChoice: unknown
  enableThinking: boolean
  maxTokens: number
  temperatureOverride?: number
}): ResponseCreateParamsStreaming {
  const {
    model,
    messages,
    systemPrompt,
    tools,
    toolChoice,
    enableThinking,
    maxTokens,
    temperatureOverride,
  } = params
  const responseInput = anthropicMessagesToResponses(messages, systemPrompt)
  const responseTools = anthropicToolsToResponses(tools)
  const responsesToolChoice = anthropicToolChoiceToResponses(toolChoice)

  return {
    model,
    stream: true,
    store: false,
    input: responseInput.input,
    ...(responseInput.instructions
      ? { instructions: responseInput.instructions }
      : {}),
    max_output_tokens: maxTokens,
    ...(responseTools.length > 0 ? { tools: responseTools } : {}),
    ...(responsesToolChoice ? { tool_choice: responsesToolChoice } : {}),
    ...(!enableThinking &&
      temperatureOverride !== undefined && { temperature: temperatureOverride }),
  }
}

export async function* adaptResponsesStreamToAnthropic(
  stream: Stream<ResponseStreamEvent>,
  model: string,
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  let started = false
  let currentContentIndex = -1
  let terminalSeen = false

  let inputTokens = 0
  let outputTokens = 0
  let cachedReadTokens = 0

  const openTextBlocks = new Map<string, number>()
  const toolBlocks = new Map<
    number,
    { contentIndex: number; id: string; name: string; arguments: string }
  >()
  const openBlockIndices = new Set<number>()

  const ensureMessageStart = async function* () {
    if (started) return
    started = true
    yield {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    } as unknown as BetaRawMessageStreamEvent
  }

  const closeAllTextBlocks = async function* () {
    for (const [, contentIndex] of openTextBlocks) {
      if (!openBlockIndices.has(contentIndex)) continue
      yield {
        type: 'content_block_stop',
        index: contentIndex,
      } as BetaRawMessageStreamEvent
      openBlockIndices.delete(contentIndex)
    }
    openTextBlocks.clear()
  }

  const closeAllToolBlocks = async function* () {
    for (const [, block] of toolBlocks) {
      if (!openBlockIndices.has(block.contentIndex)) continue
      yield {
        type: 'content_block_stop',
        index: block.contentIndex,
      } as BetaRawMessageStreamEvent
      openBlockIndices.delete(block.contentIndex)
    }
  }

  const ensureToolBlock = async function* (
    outputIndex: number,
    options?: { callId?: string; name?: string },
  ) {
    const existing = toolBlocks.get(outputIndex)
    if (existing) {
      if (options?.name && !existing.name) existing.name = options.name
      return existing
    }

    yield* closeAllTextBlocks()
    currentContentIndex++
    const block = {
      contentIndex: currentContentIndex,
      id:
        options?.callId ||
        `toolu_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      name: options?.name || '',
      arguments: '',
    }
    toolBlocks.set(outputIndex, block)
    openBlockIndices.add(block.contentIndex)
    yield {
      type: 'content_block_start',
      index: block.contentIndex,
      content_block: {
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: {},
      },
    } as BetaRawMessageStreamEvent
    return block
  }

  const ensureTextBlock = async function* (
    outputIndex: number,
    contentIndex: number,
  ) {
    const key = `${outputIndex}:${contentIndex}`
    const existing = openTextBlocks.get(key)
    if (existing !== undefined) return existing

    yield* closeAllToolBlocks()
    currentContentIndex++
    openTextBlocks.set(key, currentContentIndex)
    openBlockIndices.add(currentContentIndex)
    yield {
      type: 'content_block_start',
      index: currentContentIndex,
      content_block: {
        type: 'text',
        text: '',
      },
    } as BetaRawMessageStreamEvent
    return currentContentIndex
  }

  const updateUsage = (usage: {
    input_tokens?: number
    output_tokens?: number
    input_tokens_details?: { cached_tokens?: number }
  } | null | undefined) => {
    if (!usage) return
    if (typeof usage.input_tokens === 'number') {
      inputTokens = usage.input_tokens
    }
    if (typeof usage.output_tokens === 'number') {
      outputTokens = usage.output_tokens
    }
    if (typeof usage.input_tokens_details?.cached_tokens === 'number') {
      cachedReadTokens = usage.input_tokens_details.cached_tokens
    }
  }

  const emitTerminal = async function* (
    stopReason: string,
    usageSource?: {
      usage?: {
        input_tokens?: number
        output_tokens?: number
        input_tokens_details?: { cached_tokens?: number }
      } | null
    },
  ) {
    if (terminalSeen) return
    terminalSeen = true
    updateUsage(usageSource?.usage)
    yield* closeAllTextBlocks()
    yield* closeAllToolBlocks()

    yield {
      type: 'message_delta',
      delta: {
        stop_reason: stopReason,
        stop_sequence: null,
      },
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: cachedReadTokens,
      },
    } as BetaRawMessageStreamEvent

    yield {
      type: 'message_stop',
    } as BetaRawMessageStreamEvent
  }

  for await (const event of stream) {
    yield* ensureMessageStart()

    switch (event.type) {
      case 'response.created':
        updateUsage(event.response.usage)
        break
      case 'response.output_item.added': {
        const item = event.item
        if (item.type === 'function_call') {
          const block = yield* ensureToolBlock(event.output_index, {
            callId: item.call_id,
            name: item.name,
          })
          if (item.arguments) {
            block.arguments += item.arguments
            yield {
              type: 'content_block_delta',
              index: block.contentIndex,
              delta: {
                type: 'input_json_delta',
                partial_json: item.arguments,
              },
            } as BetaRawMessageStreamEvent
          }
        }
        break
      }
      case 'response.output_text.delta': {
        const contentIndex = yield* ensureTextBlock(
          event.output_index,
          event.content_index,
        )
        yield {
          type: 'content_block_delta',
          index: contentIndex,
          delta: {
            type: 'text_delta',
            text: event.delta,
          },
        } as BetaRawMessageStreamEvent
        break
      }
      case 'response.output_item.done': {
        const item = event.item
        if (item.type === 'function_call') {
          const block = yield* ensureToolBlock(event.output_index, {
            callId: item.call_id,
            name: item.name,
          })
          const remainingArgs = item.arguments.slice(block.arguments.length)
          if (remainingArgs) {
            block.arguments += remainingArgs
            yield {
              type: 'content_block_delta',
              index: block.contentIndex,
              delta: {
                type: 'input_json_delta',
                partial_json: remainingArgs,
              },
            } as BetaRawMessageStreamEvent
          }
        } else if (item.type === 'message') {
          for (let idx = 0; idx < item.content.length; idx++) {
            const part = item.content[idx]
            const partText =
              part.type === 'output_text'
                ? part.text
                : part.type === 'refusal'
                  ? part.refusal
                  : ''
            if (
              (part.type === 'output_text' || part.type === 'refusal') &&
              partText &&
              !openTextBlocks.has(`${event.output_index}:${idx}`)
            ) {
              const contentIndex = yield* ensureTextBlock(event.output_index, idx)
              yield {
                type: 'content_block_delta',
                index: contentIndex,
                delta: {
                  type: 'text_delta',
                  text: partText,
                },
              } as BetaRawMessageStreamEvent
            }
          }
        }
        break
      }
      case 'response.function_call_arguments.delta': {
        const block = yield* ensureToolBlock(event.output_index)
        block.arguments += event.delta
        yield {
          type: 'content_block_delta',
          index: block.contentIndex,
          delta: {
            type: 'input_json_delta',
            partial_json: event.delta,
          },
        } as BetaRawMessageStreamEvent
        break
      }
      case 'response.function_call_arguments.done': {
        const block = yield* ensureToolBlock(event.output_index, {
          name: event.name,
        })
        const remainingArgs = event.arguments.slice(block.arguments.length)
        if (remainingArgs) {
          block.arguments += remainingArgs
          yield {
            type: 'content_block_delta',
            index: block.contentIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: remainingArgs,
            },
          } as BetaRawMessageStreamEvent
        }
        break
      }
      case 'response.completed':
        yield* emitTerminal(
          toolBlocks.size > 0 ? 'tool_use' : 'end_turn',
          event.response,
        )
        break
      case 'response.incomplete':
        yield* emitTerminal(
          mapResponsesStopReason(event.response.incomplete_details?.reason),
          event.response,
        )
        break
      case 'response.failed':
        throw new Error(
          event.response.error?.message || 'Responses API request failed',
        )
      case 'error':
        throw new Error(event.message)
      default:
        break
    }
  }

  if (!started) {
    yield* ensureMessageStart()
  }
  if (!terminalSeen) {
    yield* emitTerminal(toolBlocks.size > 0 ? 'tool_use' : 'end_turn')
  }
}

function systemPromptToText(systemPrompt: SystemPrompt): string {
  if (!systemPrompt || systemPrompt.length === 0) return ''
  return systemPrompt.filter(Boolean).join('\n\n')
}

function convertUserMessageToResponses(msg: UserMessage): ResponseInputItem[] {
  const result: ResponseInputItem[] = []
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

  if (!Array.isArray(content)) return result

  const toolOutputs: ResponseInputItem[] = []
  const messageContent: Array<ResponseInputText | ResponseInputImage> = []

  for (const rawBlock of content as unknown[]) {
    const block = rawBlock as any
    if (typeof block === 'string') {
      if (block.length > 0) {
        messageContent.push({ type: 'input_text', text: block })
      }
      continue
    }

    if (block.type === 'text') {
      if (block.text.length > 0) {
        messageContent.push({ type: 'input_text', text: block.text })
      }
      continue
    }

    if (block.type === 'tool_result') {
      toolOutputs.push({
        type: 'function_call_output',
        call_id: block.tool_use_id,
        output: toolResultContentToString(block.content),
      })
      continue
    }

    if (block.type === 'image') {
      const imagePart = convertImageBlockToResponses(
        block as unknown as Record<string, unknown>,
      )
      if (imagePart) messageContent.push(imagePart)
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

function convertAssistantMessageToResponses(
  msg: AssistantMessage,
): ResponseInputItem[] {
  const result: ResponseInputItem[] = []
  const content = msg.message.content

  if (typeof content === 'string') {
    if (content.length > 0) {
      result.push({
        type: 'message',
        role: 'assistant',
        content,
      })
    }
    return result
  }

  if (!Array.isArray(content)) return result

  const pendingText: string[] = []
  const flushText = () => {
    if (pendingText.length === 0) return
    result.push({
      type: 'message',
      role: 'assistant',
      content: pendingText.join('\n'),
    })
    pendingText.length = 0
  }

  for (const rawBlock of content as unknown[]) {
    const block = rawBlock as any
    if (typeof block === 'string') {
      if (block.length > 0) pendingText.push(block)
      continue
    }

    if (block.type === 'text') {
      if (block.text.length > 0) pendingText.push(block.text)
      continue
    }

    if (block.type === 'tool_use') {
      flushText()
      result.push({
        type: 'function_call',
        call_id: block.id,
        name: block.name,
        arguments:
          typeof block.input === 'string'
            ? block.input
            : JSON.stringify(block.input),
      })
    }
  }

  flushText()
  return result
}

function toolResultContentToString(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map(item => {
      if (typeof item === 'string') return item
      if (
        item &&
        typeof item === 'object' &&
        'text' in item &&
        typeof item.text === 'string'
      ) {
        return item.text
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function convertImageBlockToResponses(
  block: Record<string, unknown>,
): ResponseInputImage | null {
  const source = block.source as Record<string, unknown> | undefined
  if (!source) return null

  if (source.type === 'base64' && typeof source.data === 'string') {
    const mediaType = (source.media_type as string) || 'image/png'
    return {
      type: 'input_image',
      detail: 'auto',
      image_url: `data:${mediaType};base64,${source.data}`,
    }
  }

  if (source.type === 'url' && typeof source.url === 'string') {
    return {
      type: 'input_image',
      detail: 'auto',
      image_url: source.url,
    }
  }

  return null
}

function sanitizeJsonSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return schema

  const result = { ...schema }

  if ('const' in result) {
    result.enum = [result.const]
    delete result.const
  }

  const objectKeys = [
    'properties',
    'definitions',
    '$defs',
    'patternProperties',
  ] as const
  for (const key of objectKeys) {
    const nested = result[key]
    if (nested && typeof nested === 'object') {
      const sanitized: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(
        nested as Record<string, unknown>,
      )) {
        sanitized[k] =
          v && typeof v === 'object'
            ? sanitizeJsonSchema(v as Record<string, unknown>)
            : v
      }
      result[key] = sanitized
    }
  }

  const singleKeys = [
    'items',
    'additionalProperties',
    'not',
    'if',
    'then',
    'else',
    'contains',
    'propertyNames',
  ] as const
  for (const key of singleKeys) {
    const nested = result[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      result[key] = sanitizeJsonSchema(nested as Record<string, unknown>)
    }
  }

  const arrayKeys = ['anyOf', 'oneOf', 'allOf'] as const
  for (const key of arrayKeys) {
    const nested = result[key]
    if (Array.isArray(nested)) {
      result[key] = nested.map(item =>
        item && typeof item === 'object'
          ? sanitizeJsonSchema(item as Record<string, unknown>)
          : item,
      )
    }
  }

  return result
}

function mapResponsesStopReason(reason: string | null | undefined): string {
  switch (reason) {
    case 'max_output_tokens':
      return 'max_tokens'
    default:
      return 'end_turn'
  }
}
