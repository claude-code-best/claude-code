import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import {
  extractOpenAIResponsesReasoningItemsFromResponse,
  type OpenAIResponsesReasoningItem,
} from './openaiResponsesConvertMessages.js'

export type OpenAIResponsesMetadataEvent = {
  type: 'openai_responses_metadata'
  response: unknown
  reasoningItems: OpenAIResponsesReasoningItem[]
}

type AdaptedEvent = BetaRawMessageStreamEvent | OpenAIResponsesMetadataEvent

type ContentBlockState = {
  blockIndex: number
  itemId: string
  kind: 'text' | 'thinking' | 'tool_use'
  sawDelta: boolean
}

export async function* adaptOpenAIResponsesStreamToAnthropic(
  stream: AsyncIterable<any>,
  model: string,
): AsyncGenerator<AdaptedEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  let started = false
  let nextContentIndex = 0
  let inputTokens = 0
  let outputTokens = 0
  let cachedReadTokens = 0
  let pendingStopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn'
  const blocksByItemId = new Map<string, ContentBlockState>()
  const reasoningItemsById = new Map<string, OpenAIResponsesReasoningItem>()

  const ensureStarted = (): BetaRawMessageStreamEvent | null => {
    if (started) return null
    started = true
    return {
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
          input_tokens: inputTokens,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: cachedReadTokens,
        },
      },
    } as unknown as BetaRawMessageStreamEvent
  }

  const startBlock = (
    itemId: string,
    kind: ContentBlockState['kind'],
    contentBlock: Record<string, unknown>,
  ): BetaRawMessageStreamEvent => {
    const state: ContentBlockState = {
      itemId,
      blockIndex: nextContentIndex++,
      kind,
      sawDelta: false,
    }
    blocksByItemId.set(itemId, state)
    return {
      type: 'content_block_start',
      index: state.blockIndex,
      content_block: contentBlock,
    } as unknown as BetaRawMessageStreamEvent
  }

  const stopBlock = (itemId: string): BetaRawMessageStreamEvent | null => {
    const state = blocksByItemId.get(itemId)
    if (!state) return null
    blocksByItemId.delete(itemId)
    return {
      type: 'content_block_stop',
      index: state.blockIndex,
    } as BetaRawMessageStreamEvent
  }

  for await (const event of stream) {
    const startEvent = ensureStarted()
    if (startEvent) {
      yield startEvent
    }

    if (!event || typeof event !== 'object') continue

    const eventType = String((event as { type?: unknown }).type ?? '')
    if (!eventType) continue

    if (eventType === 'response.output_item.added') {
      const item = (event as { item?: Record<string, unknown> }).item
      if (!item) continue
      const itemType = String(item.type ?? '')
      if (itemType === 'function_call') {
        const itemId = getResponseItemId(item, event)
        pendingStopReason = 'tool_use'
        yield startBlock(itemId, 'tool_use', {
          type: 'tool_use',
          id: String(item.call_id ?? itemId),
          name: String(item.name ?? ''),
          input: {},
        })
        continue
      }
      if (itemType === 'reasoning') {
        const itemId = getResponseItemId(item, event)
        maybeStoreReasoningItem(reasoningItemsById, itemId, item)
        yield startBlock(itemId, 'thinking', {
          type: 'thinking',
          thinking: '',
          signature: '',
        })
        continue
      }
      if (itemType === 'message' && item.role === 'assistant') {
        const itemId = getResponseItemId(item, event)
        yield startBlock(itemId, 'text', {
          type: 'text',
          text: '',
        })
      }
      continue
    }

    if (eventType === 'response.output_text.delta') {
      const itemId = getResponseItemId(undefined, event)
      const state = blocksByItemId.get(itemId)
      if (!state) {
        yield startBlock(itemId, 'text', { type: 'text', text: '' })
      }
      const block = blocksByItemId.get(itemId)
      if (!block) continue
      block.sawDelta = true
      yield {
        type: 'content_block_delta',
        index: block.blockIndex,
        delta: {
          type: 'text_delta',
          text: String((event as { delta?: unknown }).delta ?? ''),
        },
      } as BetaRawMessageStreamEvent
      continue
    }

    if (
      eventType === 'response.function_call_arguments.delta' ||
      eventType === 'response.output_item.delta'
    ) {
      const item = (event as { item?: Record<string, unknown> }).item
      const itemType = item ? String(item.type ?? '') : ''
      const itemId = getResponseItemId(item, event)
      const state = blocksByItemId.get(itemId)
      const argumentsDelta = getArgumentsDelta(event)
      if (
        argumentsDelta &&
        (itemType === 'function_call' || state?.kind === 'tool_use')
      ) {
        if (!state) {
          yield startBlock(itemId, 'tool_use', {
            type: 'tool_use',
            id: String(item?.call_id ?? itemId),
            name: String(item?.name ?? ''),
            input: {},
          })
        }
        const toolState = blocksByItemId.get(itemId)
        if (!toolState) continue
        toolState.sawDelta = true
        yield {
          type: 'content_block_delta',
          index: toolState.blockIndex,
          delta: {
            type: 'input_json_delta',
            partial_json: argumentsDelta,
          },
        } as BetaRawMessageStreamEvent
        continue
      }
    }

    if (
      eventType.includes('reasoning') &&
      (eventType.endsWith('.delta') || eventType.endsWith('.added'))
    ) {
      const itemId = getResponseItemId(undefined, event)
      const state = blocksByItemId.get(itemId)
      const text = getReasoningDelta(event)
      if (!text) continue
      if (!state) {
        yield startBlock(itemId, 'thinking', {
          type: 'thinking',
          thinking: '',
          signature: '',
        })
      }
      const thinkingState = blocksByItemId.get(itemId)
      if (!thinkingState) continue
      thinkingState.sawDelta = true
      yield {
        type: 'content_block_delta',
        index: thinkingState.blockIndex,
        delta: {
          type: 'thinking_delta',
          thinking: text,
        },
      } as BetaRawMessageStreamEvent
      continue
    }

    if (eventType === 'response.output_item.done') {
      const item = (event as { item?: Record<string, unknown> }).item
      const itemId = getResponseItemId(item, event)
      const state = blocksByItemId.get(itemId)
      if (item?.type === 'reasoning') {
        maybeStoreReasoningItem(reasoningItemsById, itemId, item)
      }
      if (item?.type === 'message' && item.role === 'assistant') {
        const text = getMessageItemText(item)
        if (text && (!state || !state.sawDelta)) {
          if (!state) {
            yield startBlock(itemId, 'text', { type: 'text', text: '' })
          }
          const createdState = blocksByItemId.get(itemId)
          if (createdState) {
            createdState.sawDelta = true
            yield {
              type: 'content_block_delta',
              index: createdState.blockIndex,
              delta: {
                type: 'text_delta',
                text,
              },
            } as BetaRawMessageStreamEvent
          }
        }
      }
      if (item?.type === 'function_call' && typeof item.arguments === 'string') {
        if (state && !state.sawDelta && item.arguments.length > 0) {
          state.sawDelta = true
          yield {
            type: 'content_block_delta',
            index: state.blockIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: item.arguments,
            },
          } as BetaRawMessageStreamEvent
        }
      }
      const stop = stopBlock(itemId)
      if (stop) {
        yield stop
      }
      continue
    }

    if (eventType === 'response.completed' || eventType === 'response.incomplete') {
      for (const itemId of [...blocksByItemId.keys()]) {
        const stop = stopBlock(itemId)
        if (stop) {
          yield stop
        }
      }

      const response = (event as { response?: Record<string, unknown> }).response
      const usage = response?.usage as Record<string, unknown> | undefined
      inputTokens = asNumber(usage?.input_tokens, inputTokens)
      outputTokens = asNumber(usage?.output_tokens, outputTokens)
      cachedReadTokens = getCachedTokens(usage, cachedReadTokens)

      if (eventType === 'response.incomplete') {
        const incompleteDetails = response?.incomplete_details as
          | { reason?: unknown }
          | undefined
        const reason = String(incompleteDetails?.reason ?? '')
        if (reason.includes('max_output_tokens')) {
          pendingStopReason = 'max_tokens'
        } else if (pendingStopReason !== 'tool_use') {
          pendingStopReason = 'end_turn'
        }
      }

      if (response) {
        yield {
          type: 'openai_responses_metadata',
          response,
          reasoningItems: reasoningItemsById.size > 0
            ? [...reasoningItemsById.values()]
            : extractOpenAIResponsesReasoningItemsFromResponse(response),
        }
      }

      yield {
        type: 'message_delta',
        delta: {
          stop_reason: pendingStopReason,
          stop_sequence: null,
        },
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_read_input_tokens: cachedReadTokens,
          cache_creation_input_tokens: 0,
        },
      } as BetaRawMessageStreamEvent

      yield {
        type: 'message_stop',
      } as BetaRawMessageStreamEvent
    }
  }
}

function getResponseItemId(
  item: Record<string, unknown> | undefined,
  event: Record<string, unknown>,
): string {
  const candidates = [
    item?.id,
    item?.item_id,
    item?.call_id,
    event.item_id,
    event.output_item_id,
    event.call_id,
    event.output_index,
  ]
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null) {
      return String(candidate)
    }
  }
  return `item_${randomUUID().replace(/-/g, '').slice(0, 12)}`
}

function getArgumentsDelta(event: Record<string, unknown>): string {
  const candidates = [
    event.delta,
    event.arguments_delta,
    event.partial_json,
    event.arguments,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }
  return ''
}

function getReasoningDelta(event: Record<string, unknown>): string {
  const candidates = [
    event.delta,
    event.text,
    event.summary_text,
    event.reasoning_text,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }
  return ''
}

function getMessageItemText(item: Record<string, unknown>): string {
  const content = item.content
  if (!Array.isArray(content)) return ''
  return content
    .map(part => {
      if (!part || typeof part !== 'object') return ''
      const record = part as Record<string, unknown>
      if (typeof record.text === 'string') return record.text
      return ''
    })
    .filter(Boolean)
    .join('')
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function getCachedTokens(usage: Record<string, unknown> | undefined, fallback: number): number {
  const inputDetails = usage?.input_tokens_details
  if (
    inputDetails &&
    typeof inputDetails === 'object' &&
    typeof (inputDetails as { cached_tokens?: unknown }).cached_tokens === 'number'
  ) {
    return (inputDetails as { cached_tokens: number }).cached_tokens
  }

  const promptDetails = usage?.prompt_tokens_details
  if (
    promptDetails &&
    typeof promptDetails === 'object' &&
    typeof (promptDetails as { cached_tokens?: unknown }).cached_tokens === 'number'
  ) {
    return (promptDetails as { cached_tokens: number }).cached_tokens
  }

  return fallback
}

function maybeStoreReasoningItem(
  reasoningItemsById: Map<string, OpenAIResponsesReasoningItem>,
  itemId: string,
  item: Record<string, unknown>,
): void {
  if (typeof item.encrypted_content !== 'string') return
  reasoningItemsById.set(itemId, {
    ...item,
    type: 'reasoning',
    encrypted_content: item.encrypted_content,
  })
}
