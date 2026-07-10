import { describe, expect, test } from 'bun:test'
import {
  createSessionEventState,
  reduceSessionEvent,
} from '../lib/session-event-reducer'
import type { SessionEvent } from '../types'

function event(
  seqNum: number,
  type: string,
  direction: SessionEvent['direction'],
  content: string,
  uuid?: string,
  id = `event-${seqNum}`,
): SessionEvent {
  return {
    id,
    sessionId: 'session-1',
    type,
    payload: {
      content,
      ...(uuid ? { uuid } : {}),
    },
    direction,
    seqNum,
    createdAt: 1_700_000_000_000 + seqNum,
  }
}

function eventWithPayload(
  seqNum: number,
  type: string,
  direction: SessionEvent['direction'],
  payload: SessionEvent['payload'],
  id = `event-${seqNum}`,
): SessionEvent {
  return {
    id,
    sessionId: 'session-1',
    type,
    payload,
    direction,
    seqNum,
    createdAt: 1_700_000_000_000 + seqNum,
  }
}

function userContents(events: SessionEvent[]): string[] {
  const state = events.reduce(reduceSessionEvent, createSessionEventState())
  return state.entries
    .filter(entry => entry.type === 'user_message')
    .map(entry => entry.content)
}

describe('session event reducer', () => {
  test('creates an empty deterministic state', () => {
    const first = createSessionEventState()
    const second = createSessionEventState()

    expect(first.entries).toEqual([])
    expect([...first.seenEventIds]).toEqual([])
    expect([...first.seenMessageKeys]).toEqual([])
    expect(first.highWaterSeq).toBe(0)
    expect(first.entries).not.toBe(second.entries)
    expect(first.seenEventIds).not.toBe(second.seenEventIds)
    expect(first.seenMessageKeys).not.toBe(second.seenMessageKeys)
  })

  test('folds outbound and inbound user echo per UUID without dropping unmatched users', () => {
    const events = [
      event(1, 'user', 'outbound', 'A', 'user-a'),
      event(2, 'user', 'inbound', 'A', 'user-a'),
      event(3, 'user', 'inbound', 'A', 'user-a'),
      event(4, 'user', 'outbound', 'B', 'user-b'),
    ]

    expect(userContents(events)).toEqual(['A', 'B'])
  })

  test('folds a user echo when inbound arrives before outbound', () => {
    const events = [
      event(1, 'user', 'inbound', 'A', 'user-a'),
      event(2, 'user', 'outbound', 'A', 'user-a'),
      event(3, 'user', 'inbound', 'A', 'user-a'),
    ]

    expect(userContents(events)).toEqual(['A'])
  })

  test('keeps identical text with distinct UUIDs', () => {
    const events = [
      event(1, 'user', 'outbound', 'same', 'user-a'),
      event(2, 'user', 'outbound', 'same', 'user-b'),
    ]

    expect(userContents(events)).toEqual(['same', 'same'])
  })

  test('keeps identical text without UUIDs and never creates text retry keys', () => {
    const events = [
      event(1, 'user', 'outbound', 'same'),
      event(2, 'user', 'outbound', 'same'),
    ]
    const state = events.reduce(reduceSessionEvent, createSessionEventState())

    expect(
      state.entries.filter(entry => entry.type === 'user_message'),
    ).toHaveLength(2)
    expect([...state.seenMessageKeys]).toEqual([])
  })

  test('records fresh server IDs for assistant retries without appending text twice', () => {
    const reply = event(1, 'assistant', 'inbound', 'answer', 'assistant-a')
    const state = [
      reply,
      reply,
      { ...reply, id: 'retry-event', seqNum: 2 },
    ].reduce(reduceSessionEvent, createSessionEventState())
    const assistant = state.entries.filter(
      entry => entry.type === 'assistant_message',
    )

    expect(assistant).toHaveLength(1)
    expect(assistant[0]?.chunks).toEqual([{ type: 'message', text: 'answer' }])
    expect([...state.seenEventIds]).toEqual(['event-1', 'retry-event'])
    expect([...state.seenMessageKeys]).toContain(
      'inbound:assistant:assistant-a',
    )
    expect(state.highWaterSeq).toBe(2)
  })

  test('merges legitimate assistant chunks with distinct identities', () => {
    const state = [
      event(1, 'assistant', 'inbound', 'hello ', 'assistant-chunk-1'),
      event(2, 'assistant', 'inbound', 'world', 'assistant-chunk-2'),
    ].reduce(reduceSessionEvent, createSessionEventState())
    const assistant = state.entries[state.entries.length - 1]

    expect(assistant?.type).toBe('assistant_message')
    expect(
      assistant?.type === 'assistant_message' ? assistant.id : undefined,
    ).toBe('assistant-chunk-1')
    expect(
      assistant?.type === 'assistant_message' ? assistant.chunks : [],
    ).toEqual([{ type: 'message', text: 'hello world' }])
  })

  test('accepts an unseen lower-sequence identity without lowering high water', () => {
    const state = [
      event(10, 'user', 'outbound', 'ten', 'user-ten'),
      event(4, 'user', 'outbound', 'four', 'user-four'),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(
      state.entries
        .filter(entry => entry.type === 'user_message')
        .map(entry => entry.content),
    ).toEqual(['ten', 'four'])
    expect(state.highWaterSeq).toBe(10)
    expect([...state.seenEventIds]).toEqual(['event-10', 'event-4'])
  })

  test('does not mutate retained assistant snapshots while merging chunks', () => {
    const first = reduceSessionEvent(
      createSessionEventState(),
      event(1, 'assistant', 'inbound', 'hello ', 'assistant-1'),
    )
    const firstEntries = first.entries
    const firstEntry = first.entries[0]
    const firstEventIds = [...first.seenEventIds]
    const firstMessageKeys = [...first.seenMessageKeys]

    const second = reduceSessionEvent(
      first,
      event(2, 'assistant', 'inbound', 'world', 'assistant-2'),
    )

    expect(first.entries).toBe(firstEntries)
    expect(firstEntry?.type).toBe('assistant_message')
    expect(
      firstEntry?.type === 'assistant_message' ? firstEntry.chunks : [],
    ).toEqual([{ type: 'message', text: 'hello ' }])
    expect([...first.seenEventIds]).toEqual(firstEventIds)
    expect([...first.seenMessageKeys]).toEqual(firstMessageKeys)
    expect(second.entries).not.toBe(first.entries)
    expect(second.seenEventIds).not.toBe(first.seenEventIds)
    expect(second.seenMessageKeys).not.toBe(first.seenMessageKeys)
  })

  test('does not merge assistant text across user or tool boundaries', () => {
    const state = [
      event(1, 'assistant', 'inbound', 'first', 'assistant-1'),
      event(2, 'user', 'inbound', 'question', 'user-1'),
      event(3, 'assistant', 'inbound', 'second', 'assistant-2'),
      eventWithPayload(4, 'tool_use', 'inbound', {
        tool_call_id: 'call-1',
        tool_name: 'Read',
        tool_input: { path: '/tmp/example' },
      }),
      event(5, 'assistant', 'inbound', 'third', 'assistant-3'),
    ].reduce(reduceSessionEvent, createSessionEventState())

    expect(
      state.entries
        .filter(entry => entry.type === 'assistant_message')
        .map(entry => entry.chunks),
    ).toEqual([
      [{ type: 'message', text: 'first' }],
      [{ type: 'message', text: 'second' }],
      [{ type: 'message', text: 'third' }],
    ])
  })

  test('deduplicates embedded and standalone tool use and result phases', () => {
    const embeddedUse = eventWithPayload(1, 'assistant', 'inbound', {
      message: {
        content: [
          {
            type: 'tool_use',
            id: 'call-1',
            name: 'Read',
            input: { path: '/tmp/example' },
          },
        ],
      },
    })
    const standaloneUseRetry = eventWithPayload(2, 'tool_use', 'inbound', {
      tool_call_id: 'call-1',
      tool_name: 'Read',
      tool_input: { path: '/tmp/example' },
    })
    const standaloneResult = eventWithPayload(3, 'tool_result', 'inbound', {
      raw: { tool_call_id: 'call-1', output: 'contents' },
    })
    const embeddedResultRetry = eventWithPayload(4, 'user', 'inbound', {
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-1',
            content: 'contents',
          },
        ],
      },
    })

    const state = [
      embeddedUse,
      standaloneUseRetry,
      standaloneResult,
      embeddedResultRetry,
    ].reduce(reduceSessionEvent, createSessionEventState())
    const tools = state.entries.filter(entry => entry.type === 'tool_call')

    expect(tools).toHaveLength(1)
    expect(tools[0]?.toolCall).toEqual({
      id: 'call-1',
      title: 'Read',
      status: 'complete',
      rawInput: { path: '/tmp/example' },
      rawOutput: { output: 'contents' },
    })
    expect([...state.seenMessageKeys]).toContain('tool_use:call-1')
    expect([...state.seenMessageKeys]).toContain('tool_result:call-1')
    expect([...state.seenEventIds]).toEqual([
      'event-1',
      'event-2',
      'event-3',
      'event-4',
    ])
  })

  test('maps embedded tool result errors and leaves the prior tool snapshot immutable', () => {
    const running = reduceSessionEvent(
      createSessionEventState(),
      eventWithPayload(1, 'tool_use', 'inbound', {
        raw: {
          tool_call_id: 'call-error',
          tool_name: 'Shell',
          tool_input: { command: 'false' },
        },
      }),
    )
    const runningEntry = running.entries[0]

    const failed = reduceSessionEvent(
      running,
      eventWithPayload(2, 'user', 'inbound', {
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call-error',
              content: 'exit 1',
              is_error: true,
            },
          ],
        },
      }),
    )

    expect(runningEntry?.type).toBe('tool_call')
    expect(
      runningEntry?.type === 'tool_call' ? runningEntry.toolCall : null,
    ).toEqual({
      id: 'call-error',
      title: 'Shell',
      status: 'running',
      rawInput: { command: 'false' },
    })
    expect(failed.entries[0]?.type).toBe('tool_call')
    expect(
      failed.entries[0]?.type === 'tool_call'
        ? failed.entries[0].toolCall
        : null,
    ).toEqual({
      id: 'call-error',
      title: 'Shell',
      status: 'error',
      rawInput: { command: 'false' },
      rawOutput: { output: 'exit 1' },
    })
    expect(failed.entries).not.toBe(running.entries)
    expect(
      failed.entries[0]?.type === 'tool_call'
        ? failed.entries[0].toolCall
        : null,
    ).not.toBe(
      runningEntry?.type === 'tool_call' ? runningEntry.toolCall : null,
    )
  })

  test('ignores orphan tool results without creating a visible entry', () => {
    const state = reduceSessionEvent(
      createSessionEventState(),
      eventWithPayload(1, 'tool_result', 'inbound', {
        tool_call_id: 'missing-call',
        output: 'unused',
      }),
    )

    expect(state.entries).toEqual([])
    expect([...state.seenMessageKeys]).toContain('tool_result:missing-call')
  })

  test('ignores partial assistant events until delta semantics are defined', () => {
    const state = reduceSessionEvent(
      createSessionEventState(),
      event(1, 'partial_assistant', 'inbound', 'snapshot', 'partial-1'),
    )

    expect(state.entries).toEqual([])
    expect(state.highWaterSeq).toBe(1)
    expect([...state.seenEventIds]).toEqual(['event-1'])
  })

  test('uses the canonical event ID when a UUID is absent', () => {
    const state = [
      event(1, 'user', 'outbound', 'hello'),
      event(2, 'assistant', 'inbound', 'answer'),
    ].reduce(reduceSessionEvent, createSessionEventState())

    const user = state.entries[0]
    const assistant = state.entries[1]
    expect(user?.type === 'user_message' ? user.id : undefined).toBe('event-1')
    expect(
      assistant?.type === 'assistant_message' ? assistant.id : undefined,
    ).toBe('event-2')
  })

  test('uses sequence only as an exact-event fallback when server ID is absent', () => {
    const first = event(7, 'user', 'outbound', 'first', undefined, '')
    const replay = event(7, 'user', 'outbound', 'changed', undefined, '')
    const state = [first, replay].reduce(
      reduceSessionEvent,
      createSessionEventState(),
    )

    expect(
      state.entries.filter(entry => entry.type === 'user_message'),
    ).toHaveLength(1)
    expect([...state.seenEventIds]).toEqual(['seq:7'])
  })
})
