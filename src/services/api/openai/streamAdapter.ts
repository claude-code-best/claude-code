import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { ChatCompletionChunk } from 'openai/resources/chat/completions/completions.mjs'
import { randomUUID } from 'crypto'

/**
 * Adapt an OpenAI streaming response into Anthropic BetaRawMessageStreamEvent.
 *
 * Mapping:
 *   First chunk              → message_start
 *   delta.reasoning_content  → content_block_start(thinking) + thinking_delta + content_block_stop
 *   delta.content            → content_block_start(text) + text_delta + content_block_stop
 *   delta.tool_calls         → content_block_start(tool_use) + input_json_delta + content_block_stop
 *   finish_reason            → message_delta(stop_reason) + message_stop
 *   usage.cached_tokens      → cache_read_input_tokens in message_start usage
 *
 * Thinking support:
 *   DeepSeek and compatible providers send `delta.reasoning_content` for chain-of-thought.
 *   This is mapped to Anthropic's `thinking` content blocks:
 *     content_block_start: { type: 'thinking', thinking: '', signature: '' }
 *     content_block_delta: { type: 'thinking_delta', thinking: '...' }
 *
 * Prompt caching:
 *   OpenAI reports cached tokens in usage.prompt_tokens_details.cached_tokens.
 *   This is mapped to Anthropic's cache_read_input_tokens.
 */
export async function* adaptOpenAIStreamToAnthropic(
  stream: AsyncIterable<ChatCompletionChunk>,
  model: string,
): AsyncGenerator<BetaRawMessageStreamEvent, void> {
  const messageId = `msg_${randomUUID().replace(/-/g, '').slice(0, 24)}`

  let started = false
  let currentContentIndex = -1

  // Track tool_use blocks: tool_calls index → { contentIndex, id, name, arguments }
  const toolBlocks = new Map<number, { contentIndex: number; id: string; name: string; arguments: string }>()

  // Track thinking block state
  let thinkingBlockOpen = false

  // Track text block state
  let textBlockOpen = false

  // Track usage
  let inputTokens = 0
  let outputTokens = 0
  let cachedTokens = 0

  // Track all open content block indices (for cleanup)
  const openBlockIndices = new Set<number>()

  for await (const chunk of stream) {
    const choice = chunk.choices?.[0]
    const delta = choice?.delta

    // Extract usage from any chunk that carries it
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens ?? inputTokens
      outputTokens = chunk.usage.completion_tokens ?? outputTokens
      // OpenAI prompt caching: prompt_tokens_details.cached_tokens
      const details = (chunk.usage as any).prompt_tokens_details
      if (details?.cached_tokens) {
        cachedTokens = details.cached_tokens
      }
    }

    // Emit message_start on first chunk
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
            cache_read_input_tokens: cachedTokens,
          },
        },
      } as BetaRawMessageStreamEvent
    }

    if (!delta) continue

    // Handle reasoning_content → Anthropic thinking block
    // DeepSeek and compatible providers send delta.reasoning_content
    const reasoningContent = (delta as any).reasoning_content
    if (reasoningContent != null && reasoningContent !== '') {
      if (!thinkingBlockOpen) {
        currentContentIndex++
        thinkingBlockOpen = true
        openBlockIndices.add(currentContentIndex)

        yield {
          type: 'content_block_start',
          index: currentContentIndex,
          content_block: {
            type: 'thinking',
            thinking: '',
            signature: '',
          },
        } as BetaRawMessageStreamEvent
      }

      yield {
        type: 'content_block_delta',
        index: currentContentIndex,
        delta: {
          type: 'thinking_delta',
          thinking: reasoningContent,
        },
      } as BetaRawMessageStreamEvent
    }

    // Handle text content
    if (delta.content != null && delta.content !== '') {
      if (!textBlockOpen) {
        // Close thinking block if still open (reasoning done, now generating answer)
        if (thinkingBlockOpen) {
          yield {
            type: 'content_block_stop',
            index: currentContentIndex,
          } as BetaRawMessageStreamEvent
          openBlockIndices.delete(currentContentIndex)
          thinkingBlockOpen = false
        }

        currentContentIndex++
        textBlockOpen = true
        openBlockIndices.add(currentContentIndex)

        yield {
          type: 'content_block_start',
          index: currentContentIndex,
          content_block: {
            type: 'text',
            text: '',
          },
        } as BetaRawMessageStreamEvent
      }

      yield {
        type: 'content_block_delta',
        index: currentContentIndex,
        delta: {
          type: 'text_delta',
          text: delta.content,
        },
      } as BetaRawMessageStreamEvent
    }

    // Handle tool calls
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const tcIndex = tc.index

        if (!toolBlocks.has(tcIndex)) {
          // Close thinking block if open
          if (thinkingBlockOpen) {
            yield {
              type: 'content_block_stop',
              index: currentContentIndex,
            } as BetaRawMessageStreamEvent
            openBlockIndices.delete(currentContentIndex)
            thinkingBlockOpen = false
          }

          // Close text block if open
          if (textBlockOpen) {
            yield {
              type: 'content_block_stop',
              index: currentContentIndex,
            } as BetaRawMessageStreamEvent
            openBlockIndices.delete(currentContentIndex)
            textBlockOpen = false
          }

          // Start new tool_use block
          currentContentIndex++
          const toolId = tc.id || `toolu_${randomUUID().replace(/-/g, '').slice(0, 24)}`
          const toolName = tc.function?.name || ''

          toolBlocks.set(tcIndex, {
            contentIndex: currentContentIndex,
            id: toolId,
            name: toolName,
            arguments: '',
          })
          openBlockIndices.add(currentContentIndex)

          yield {
            type: 'content_block_start',
            index: currentContentIndex,
            content_block: {
              type: 'tool_use',
              id: toolId,
              name: toolName,
              input: {},
            },
          } as BetaRawMessageStreamEvent
        }

        // Stream argument fragments
        const argFragment = tc.function?.arguments
        if (argFragment) {
          toolBlocks.get(tcIndex)!.arguments += argFragment
          yield {
            type: 'content_block_delta',
            index: toolBlocks.get(tcIndex)!.contentIndex,
            delta: {
              type: 'input_json_delta',
              partial_json: argFragment,
            },
          } as BetaRawMessageStreamEvent
        }
      }
    }

    // Handle finish
    if (choice?.finish_reason) {
      // Close thinking block if still open
      if (thinkingBlockOpen) {
        yield {
          type: 'content_block_stop',
          index: currentContentIndex,
        } as BetaRawMessageStreamEvent
        openBlockIndices.delete(currentContentIndex)
        thinkingBlockOpen = false
      }

      // Close text block if still open
      if (textBlockOpen) {
        yield {
          type: 'content_block_stop',
          index: currentContentIndex,
        } as BetaRawMessageStreamEvent
        openBlockIndices.delete(currentContentIndex)
        textBlockOpen = false
      }

      // Close all tool blocks that haven't been closed yet
      for (const [, block] of toolBlocks) {
        if (openBlockIndices.has(block.contentIndex)) {
          yield {
            type: 'content_block_stop',
            index: block.contentIndex,
          } as BetaRawMessageStreamEvent
          openBlockIndices.delete(block.contentIndex)
        }
      }

      // Map finish_reason to Anthropic stop_reason.
      // Some backends return "stop" even when tool_calls are present —
      // force "tool_use" when we saw any tool blocks to ensure the query
      // loop actually executes the tools.
      const hasToolCalls = toolBlocks.size > 0
      const stopReason = hasToolCalls ? 'tool_use' : mapFinishReason(choice.finish_reason)

      yield {
        type: 'message_delta',
        delta: {
          stop_reason: stopReason,
          stop_sequence: null,
        },
        usage: {
          output_tokens: outputTokens,
        },
      } as BetaRawMessageStreamEvent

      yield {
        type: 'message_stop',
      } as BetaRawMessageStreamEvent
    }
  }

  // Safety: close any remaining open blocks if stream ended without finish_reason
  for (const idx of openBlockIndices) {
    yield {
      type: 'content_block_stop',
      index: idx,
    } as BetaRawMessageStreamEvent
  }
}

/**
 * Map OpenAI finish_reason to Anthropic stop_reason.
 *
 * stop           → end_turn
 * tool_calls     → tool_use
 * length         → max_tokens
 * content_filter → end_turn
 */
function mapFinishReason(reason: string): string {
  switch (reason) {
    case 'stop':
      return 'end_turn'
    case 'tool_calls':
      return 'tool_use'
    case 'length':
      return 'max_tokens'
    case 'content_filter':
      return 'end_turn'
    default:
      return 'end_turn'
  }
}
