import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import type { OllamaChatChunk } from './types.js'

export async function* adaptOllamaStreamToAnthropic(
  stream: AsyncIterable<OllamaChatChunk>,
  model: string,
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  let started = false
  let nextContentIndex = 0
  let openTextLikeBlock: { index: number; type: 'text' | 'thinking' } | null =
    null
  let sawToolUse = false
  let doneReason: string | undefined
  let inputTokens = 0
  let outputTokens = 0

  for await (const chunk of stream) {
    if (chunk.error) {
      throw new Error(`Ollama stream error: ${chunk.error}`)
    }

    inputTokens = chunk.prompt_eval_count ?? inputTokens
    outputTokens = chunk.eval_count ?? outputTokens

    if (!started) {
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
            input_tokens: inputTokens,
            output_tokens: 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      } as unknown as BetaRawMessageStreamEvent
    }

    const message = chunk.message
    if (message?.thinking) {
      if (!openTextLikeBlock || openTextLikeBlock.type !== 'thinking') {
        if (openTextLikeBlock) {
          yield {
            type: 'content_block_stop',
            index: openTextLikeBlock.index,
          } as BetaRawMessageStreamEvent
        }

        openTextLikeBlock = {
          index: nextContentIndex++,
          type: 'thinking',
        }
        yield {
          type: 'content_block_start',
          index: openTextLikeBlock.index,
          content_block: {
            type: 'thinking',
            thinking: '',
            signature: '',
          },
        } as BetaRawMessageStreamEvent
      }

      yield {
        type: 'content_block_delta',
        index: openTextLikeBlock.index,
        delta: {
          type: 'thinking_delta',
          thinking: message.thinking,
        },
      } as BetaRawMessageStreamEvent
    }

    if (message?.content) {
      if (!openTextLikeBlock || openTextLikeBlock.type !== 'text') {
        if (openTextLikeBlock) {
          yield {
            type: 'content_block_stop',
            index: openTextLikeBlock.index,
          } as BetaRawMessageStreamEvent
        }

        openTextLikeBlock = {
          index: nextContentIndex++,
          type: 'text',
        }
        yield {
          type: 'content_block_start',
          index: openTextLikeBlock.index,
          content_block: {
            type: 'text',
            text: '',
          },
        } as BetaRawMessageStreamEvent
      }

      yield {
        type: 'content_block_delta',
        index: openTextLikeBlock.index,
        delta: {
          type: 'text_delta',
          text: message.content,
        },
      } as BetaRawMessageStreamEvent
    }

    for (const toolCall of message?.tool_calls ?? []) {
      if (openTextLikeBlock) {
        yield {
          type: 'content_block_stop',
          index: openTextLikeBlock.index,
        } as BetaRawMessageStreamEvent
        openTextLikeBlock = null
      }

      sawToolUse = true
      const toolIndex = nextContentIndex++
      const toolId = `toolu_${randomUUID().replace(/-/g, '').slice(0, 24)}`
      yield {
        type: 'content_block_start',
        index: toolIndex,
        content_block: {
          type: 'tool_use',
          id: toolId,
          name: toolCall.function.name || '',
          input: {},
        },
      } as BetaRawMessageStreamEvent

      yield {
        type: 'content_block_delta',
        index: toolIndex,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(toolCall.function.arguments ?? {}),
        },
      } as BetaRawMessageStreamEvent

      yield {
        type: 'content_block_stop',
        index: toolIndex,
      } as BetaRawMessageStreamEvent
    }

    if (chunk.done) {
      doneReason = chunk.done_reason
    }
  }

  if (!started) return

  if (openTextLikeBlock) {
    yield {
      type: 'content_block_stop',
      index: openTextLikeBlock.index,
    } as BetaRawMessageStreamEvent
  }

  yield {
    type: 'message_delta',
    delta: {
      stop_reason: mapOllamaDoneReason(doneReason, sawToolUse),
      stop_sequence: null,
    },
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  } as BetaRawMessageStreamEvent

  yield {
    type: 'message_stop',
  } as BetaRawMessageStreamEvent
}

function mapOllamaDoneReason(
  reason: string | undefined,
  sawToolUse: boolean,
): string {
  if (sawToolUse) return 'tool_use'
  switch (reason) {
    case 'length':
      return 'max_tokens'
    case 'stop':
    case 'unload':
    default:
      return 'end_turn'
  }
}
