import { describe, expect, test } from 'bun:test'
import type { SDKPartialAssistantMessage } from 'src/entrypoints/sdk/controlTypes.js'
import {
  accumulateStreamEvents,
  clearStreamAccumulatorForMessage,
  createStreamAccumulator,
} from '../streamEventAccumulator.js'

function streamEvent(
  uuid: string,
  event: Record<string, unknown>,
  parentToolUseId: string | null = null,
): SDKPartialAssistantMessage {
  return {
    type: 'stream_event',
    uuid,
    session_id: 'session-1',
    parent_tool_use_id: parentToolUseId,
    event,
  } as unknown as SDKPartialAssistantMessage
}

function messageStart(id: string): SDKPartialAssistantMessage {
  return streamEvent('start-1', {
    type: 'message_start',
    message: { id },
  })
}

function textDelta(
  uuid: string,
  text: string,
  index = 0,
): SDKPartialAssistantMessage {
  return streamEvent(uuid, {
    type: 'content_block_delta',
    index,
    delta: { type: 'text_delta', text },
  })
}

describe('streamEventAccumulator', () => {
  test('coalesces text deltas into one full snapshot per touched block', () => {
    const state = createStreamAccumulator()

    const output = accumulateStreamEvents(
      [
        messageStart('msg-1'),
        textDelta('delta-1', 'hel'),
        textDelta('delta-2', 'lo'),
      ],
      state,
    )

    expect(output).toHaveLength(2)
    expect(output[1]).toMatchObject({
      type: 'stream_event',
      message_id: 'msg-1',
      snapshot: true,
      event: {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'hello' },
      },
    })
  })

  test('keeps full text across flushes and independent content blocks', () => {
    const state = createStreamAccumulator()
    accumulateStreamEvents(
      [messageStart('msg-1'), textDelta('delta-1', 'hello')],
      state,
    )

    const output = accumulateStreamEvents(
      [textDelta('delta-2', ' world'), textDelta('delta-3', 'second', 1)],
      state,
    )

    expect(output).toHaveLength(2)
    expect(output[0]).toMatchObject({
      message_id: 'msg-1',
      event: { index: 0, delta: { text: 'hello world' } },
    })
    expect(output[1]).toMatchObject({
      message_id: 'msg-1',
      event: { index: 1, delta: { text: 'second' } },
    })
  })

  test('passes non-text deltas through unchanged', () => {
    const state = createStreamAccumulator()
    const start = messageStart('msg-1')
    const thinking = streamEvent('thinking-1', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'hidden' },
    })

    const output = accumulateStreamEvents([start, thinking], state)
    expect(output).toHaveLength(2)
    expect(Object.is(output[0], start)).toBe(true)
    expect(Object.is(output[1], thinking)).toBe(true)
  })

  test('isolates scopes and clears completed assistant state', () => {
    const state = createStreamAccumulator()
    const nestedStart = {
      ...messageStart('msg-tool'),
      parent_tool_use_id: 'tool-1',
    } as SDKPartialAssistantMessage
    const nestedDelta = {
      ...textDelta('delta-tool', 'nested'),
      parent_tool_use_id: 'tool-1',
    } as SDKPartialAssistantMessage
    accumulateStreamEvents(
      [
        messageStart('msg-root'),
        nestedStart,
        textDelta('delta-root', 'root'),
        nestedDelta,
      ],
      state,
    )

    clearStreamAccumulatorForMessage(state, {
      session_id: 'session-1',
      parent_tool_use_id: null,
      message: { id: 'msg-root' },
    })

    expect(state.byMessage.has('msg-root')).toBe(false)
    expect(state.byMessage.has('msg-tool')).toBe(true)
    expect(state.scopeToMessage.get('session-1:tool-1')).toBe('msg-tool')
  })
})
