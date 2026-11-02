import { describe, expect, test } from 'bun:test'
import {
  hasCompletedToolUse,
  isPrematureStreamTruncation,
  type CompletionMessageLike,
  type StreamTruncationInput,
} from '../streamCompletion'

function msg(content: unknown): CompletionMessageLike {
  return { message: { content } }
}

describe('hasCompletedToolUse', () => {
  test('returns false for an empty message list', () => {
    expect(hasCompletedToolUse([])).toBe(false)
  })

  test('returns false when messages contain only text blocks', () => {
    expect(hasCompletedToolUse([msg([{ type: 'text', text: 'hello' }])])).toBe(
      false,
    )
  })

  test('returns false when a thinking block completed but no tool_use', () => {
    expect(
      hasCompletedToolUse([
        msg([{ type: 'thinking', thinking: '...' }]),
        msg([{ type: 'text', text: 'done' }]),
      ]),
    ).toBe(false)
  })

  test('returns true when a tool_use block completed', () => {
    expect(
      hasCompletedToolUse([
        msg([{ type: 'text', text: 'ok' }]),
        msg([{ type: 'tool_use', name: 'Write', input: {} }]),
      ]),
    ).toBe(true)
  })

  test('returns true for a server_tool_use block', () => {
    expect(
      hasCompletedToolUse([
        msg([{ type: 'server_tool_use', name: 'advisor' }]),
      ]),
    ).toBe(true)
  })

  test('tolerates missing/non-array content without throwing', () => {
    expect(hasCompletedToolUse([{ message: {} }])).toBe(false)
    expect(hasCompletedToolUse([{}])).toBe(false)
    expect(hasCompletedToolUse([msg('not-an-array')])).toBe(false)
  })
})

describe('isPrematureStreamTruncation', () => {
  const base: StreamTruncationInput = {
    hasPartialMessage: true,
    stopReason: null,
    startedBlockCount: 2,
    completedMessageCount: 1,
    hasCompletedToolUse: false,
  }

  test('detects the gateway idle-timeout signature (open block, no stop_reason)', () => {
    // text block closed (completedMessageCount=1), tool_use opened but never
    // closed (startedBlockCount=2), no message_delta (stopReason=null).
    expect(isPrematureStreamTruncation(base)).toBe(true)
  })

  test('does not fire when a terminal stop_reason arrived', () => {
    expect(
      isPrematureStreamTruncation({ ...base, stopReason: 'end_turn' }),
    ).toBe(false)
    expect(
      isPrematureStreamTruncation({ ...base, stopReason: 'tool_use' }),
    ).toBe(false)
  })

  test('does not fire when every opened block was closed', () => {
    // startedBlockCount === completedMessageCount → no dangling block.
    expect(
      isPrematureStreamTruncation({
        ...base,
        startedBlockCount: 1,
        completedMessageCount: 1,
      }),
    ).toBe(false)
  })

  test('does not fire when no message_start was received', () => {
    expect(
      isPrematureStreamTruncation({ ...base, hasPartialMessage: false }),
    ).toBe(false)
  })

  test('does not fire when a tool_use already completed (inc-4258 guard)', () => {
    // Even with an open trailing block and null stop_reason, a completed
    // tool_use means the non-streaming fallback could double-execute it.
    expect(
      isPrematureStreamTruncation({ ...base, hasCompletedToolUse: true }),
    ).toBe(false)
  })

  test('does not fire on a legitimate empty response (no blocks at all)', () => {
    // Structured-output turn 2: end_turn with zero content blocks. Here
    // stopReason would be set, but even with stopReason=null a zero-block
    // response has startedBlockCount === completedMessageCount === 0.
    expect(
      isPrematureStreamTruncation({
        ...base,
        startedBlockCount: 0,
        completedMessageCount: 0,
      }),
    ).toBe(false)
  })

  test('fires when multiple blocks completed but a later block was cut', () => {
    expect(
      isPrematureStreamTruncation({
        hasPartialMessage: true,
        stopReason: null,
        startedBlockCount: 3,
        completedMessageCount: 2,
        hasCompletedToolUse: false,
      }),
    ).toBe(true)
  })
})
