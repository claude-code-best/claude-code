import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import type { GeminiPart, GeminiStreamChunk } from './types.js'

export async function* adaptGeminiStreamToAnthropic(
  stream: AsyncIterable<GeminiStreamChunk>,
  model: string,
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`
  let started = false
  let stopped = false
  let nextContentIndex = 0
  let openTextLikeBlock: { index: number; type: 'text' | 'thinking' } | null =
    null
  let sawToolUse = false
  let finishReason: string | undefined
  let inputTokens = 0
  let outputTokens = 0
  let cachedReadTokens = 0

  for await (const chunk of stream) {
    const usage = chunk.usageMetadata
    if (usage) {
      inputTokens = usage.promptTokenCount ?? inputTokens
      outputTokens =
        (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)
      cachedReadTokens = usage.cachedContentTokenCount ?? cachedReadTokens
    }

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
            cache_read_input_tokens: cachedReadTokens,
          },
        },
      } as unknown as BetaRawMessageStreamEvent
    }
    const candidate = chunk.candidates?.[0]
    const parts = candidate?.content?.parts ?? []

    for (const part of parts) {
      if (part.functionCall) {
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
            name: part.functionCall.name || '',
            input: {},
          },
        } as BetaRawMessageStreamEvent

        if (part.thoughtSignature) {
          yield {
            type: 'content_block_delta',
            index: toolIndex,
            delta: {
              type: 'signature_delta',
              signature: part.thoughtSignature,
            },
          } as BetaRawMessageStreamEvent
        }

        if (
          part.functionCall.args &&
          Object.keys(part.functionCall.args).length > 0
        ) {
          yield {
            type: 'content_block_delta',
            index: toolIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: JSON.stringify(part.functionCall.args),
            },
          } as BetaRawMessageStreamEvent
        }

        yield {
          type: 'content_block_stop',
          index: toolIndex,
        } as BetaRawMessageStreamEvent
        continue
      }

      const textLikeType = getTextLikeBlockType(part)
      if (textLikeType) {
        if (!openTextLikeBlock || openTextLikeBlock.type !== textLikeType) {
          if (openTextLikeBlock) {
            yield {
              type: 'content_block_stop',
              index: openTextLikeBlock.index,
            } as BetaRawMessageStreamEvent
          }

          openTextLikeBlock = {
            index: nextContentIndex++,
            type: textLikeType,
          }

          yield {
            type: 'content_block_start',
            index: openTextLikeBlock.index,
            content_block:
              textLikeType === 'thinking'
                ? {
                    type: 'thinking',
                    thinking: '',
                    signature: '',
                  }
                : {
                    type: 'text',
                    text: '',
                  },
          } as BetaRawMessageStreamEvent
        }

        if (part.text) {
          yield {
            type: 'content_block_delta',
            index: openTextLikeBlock.index,
            delta:
              textLikeType === 'thinking'
                ? {
                    type: 'thinking_delta',
                    thinking: part.text,
                  }
                : {
                    type: 'text_delta',
                    text: part.text,
                  },
          } as BetaRawMessageStreamEvent
        }

        if (part.thoughtSignature) {
          yield {
            type: 'content_block_delta',
            index: openTextLikeBlock.index,
            delta: {
              type: 'signature_delta',
              signature: part.thoughtSignature,
            },
          } as BetaRawMessageStreamEvent
        }

        continue
      }

      if (part.thoughtSignature && openTextLikeBlock) {
        yield {
          type: 'content_block_delta',
          index: openTextLikeBlock.index,
          delta: {
            type: 'signature_delta',
            signature: part.thoughtSignature,
          },
        } as BetaRawMessageStreamEvent
      }
    }

    if (candidate?.finishReason) {
      finishReason = candidate.finishReason
    }
  }

  if (!started) {
    return
  }

  if (openTextLikeBlock) {
    yield {
      type: 'content_block_stop',
      index: openTextLikeBlock.index,
    } as BetaRawMessageStreamEvent
  }

  if (!stopped) {
    yield {
      type: 'message_delta',
      delta: {
        stop_reason: mapGeminiFinishReason(finishReason, sawToolUse),
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
    stopped = true
  }
}

function getTextLikeBlockType(part: GeminiPart): 'text' | 'thinking' | null {
  if (typeof part.text !== 'string') {
    return null
  }
  return part.thought ? 'thinking' : 'text'
}

function mapGeminiFinishReason(
  reason: string | undefined,
  sawToolUse: boolean,
): string {
  switch (reason) {
    case 'MAX_TOKENS':
      return 'max_tokens'
    case 'STOP':
    case 'FINISH_REASON_UNSPECIFIED':
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
    case 'MALFORMED_FUNCTION_CALL':
    default:
      return sawToolUse ? 'tool_use' : 'end_turn'
  }
}
