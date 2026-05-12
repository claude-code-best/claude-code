import { describe, expect, test } from 'bun:test'
import type { Message } from '../../../types/message.js'
import {
  buildSummaryContext,
  estimateMessageChars,
  getSummaryContextFingerprint,
  MAX_SUMMARY_CONTEXT_CHARS,
  selectSummaryContextMessages,
} from '../summaryContext.js'

function makeMessage(
  type: 'user' | 'assistant',
  uuid: string,
  content: string,
): Message {
  return {
    type,
    uuid,
    message: {
      role: type,
      content,
    },
  } as unknown as Message
}

describe('selectSummaryContextMessages', () => {
  test('keeps a bounded recent suffix that starts with a user message', () => {
    const messages = [
      makeMessage('assistant', 'a0', 'older assistant'),
      makeMessage('user', 'u1', 'first prompt'),
      makeMessage('assistant', 'a1', 'first response'),
      makeMessage('user', 'u2', 'second prompt'),
      makeMessage('assistant', 'a2', 'second response'),
    ]

    const selected = selectSummaryContextMessages(messages, {
      maxMessages: 3,
      maxChars: 1_000,
    })

    expect(selected.map(message => String(message.uuid))).toEqual(['u2', 'a2'])
  })

  test('returns no context when the newest message exceeds the byte budget', () => {
    const messages = [
      makeMessage('user', 'u1', 'first prompt'),
      makeMessage('assistant', 'a1', 'x'.repeat(100)),
    ]

    const selected = selectSummaryContextMessages(messages, {
      maxMessages: 10,
      maxChars: 10,
    })

    expect(selected).toEqual([])
  })

  test('uses serialized message size for nested content budgets', () => {
    const messages = [
      makeMessage('user', 'u1', 'first prompt'),
      {
        ...makeMessage('assistant', 'a1', 'short'),
        nested: {
          payload: Array.from({ length: 50 }, (_value, index) => ({
            index,
            text: 'x'.repeat(20),
          })),
        },
      } as unknown as Message,
    ]

    const selected = selectSummaryContextMessages(messages, {
      maxMessages: 10,
      maxChars: 200,
    })

    expect(selected).toEqual([])
  })

  test('stops at an older oversized message after keeping the recent suffix', () => {
    const messages = [
      makeMessage('user', 'u1', 'x'.repeat(5_000)),
      makeMessage('user', 'u2', 'small prompt'),
      makeMessage('assistant', 'a2', 'small answer'),
    ]

    const selected = selectSummaryContextMessages(messages, {
      maxMessages: 10,
      maxChars: 1_000,
    })

    expect(selected.map(message => String(message.uuid))).toEqual(['u2', 'a2'])
  })

  test('drops leading orphan tool results after bounding', () => {
    const messages = [
      makeMessage('assistant', 'a0', 'older assistant'),
      {
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' },
          ],
        },
      } as unknown as Message,
      makeMessage('assistant', 'a1', 'after orphan'),
      makeMessage('user', 'u2', 'next prompt'),
    ]

    const selected = selectSummaryContextMessages(messages, {
      maxMessages: 3,
      maxChars: 1_000,
    })

    expect(selected.map(message => String(message.uuid))).toEqual(['u2'])
  })
})

describe('getSummaryContextFingerprint', () => {
  test('estimates circular messages as unbounded', () => {
    const circular = makeMessage('assistant', 'a1', 'cycle') as Message & {
      self?: unknown
    }
    circular.self = circular

    expect(estimateMessageChars(circular)).toBe(Number.POSITIVE_INFINITY)
  })

  test('ignores non-json primitive fields in size estimates', () => {
    const message = makeMessage('assistant', 'a1', 'metadata') as Message & {
      skipUndefined?: undefined
      skipFunction?: () => void
      skipSymbol?: symbol
    }
    message.skipUndefined = undefined
    message.skipFunction = () => undefined
    message.skipSymbol = Symbol('ignored')

    expect(estimateMessageChars(message)).toBeGreaterThan(0)
  })

  test('treats unsupported top-level primitives as zero-size estimates', () => {
    expect(estimateMessageChars((() => undefined) as unknown as Message)).toBe(
      0,
    )
    expect(estimateMessageChars(1n as unknown as Message)).toBe(0)
  })

  test('returns null for an empty transcript', () => {
    expect(getSummaryContextFingerprint([])).toBeNull()
  })

  test('changes when the transcript grows', () => {
    const messages = [
      makeMessage('user', 'u1', 'first prompt'),
      makeMessage('assistant', 'a1', 'first response'),
    ]

    const first = getSummaryContextFingerprint(messages)
    const second = getSummaryContextFingerprint([
      ...messages,
      makeMessage('user', 'u2', 'next prompt'),
    ])
    expect(first?.startsWith('2:a1:')).toBe(true)
    expect(second?.startsWith('3:u2:')).toBe(true)
    expect(first).not.toBe(second)
  })

  test('changes when message content changes under the same uuid', () => {
    const first = getSummaryContextFingerprint([
      makeMessage('user', 'u1', 'first prompt'),
      makeMessage('assistant', 'a1', 'first response'),
    ])
    const second = getSummaryContextFingerprint([
      makeMessage('user', 'u1', 'first prompt'),
      makeMessage('assistant', 'a1', 'updated response'),
    ])

    expect(first).not.toBe(second)
  })

  test('includes a truncation marker for oversized primitive values', () => {
    const prefix = 'x'.repeat(MAX_SUMMARY_CONTEXT_CHARS + 100)
    const first = getSummaryContextFingerprint([
      makeMessage('assistant', 'a1', `${prefix}a`),
    ])
    const second = getSummaryContextFingerprint([
      makeMessage('assistant', 'a1', `${prefix}b`),
    ])

    expect(first).not.toBe(second)
  })

  test('fingerprints circular message references without recursing forever', () => {
    const circular = makeMessage('assistant', 'a1', 'cycle') as Message & {
      self?: unknown
    }
    circular.self = circular

    expect(getSummaryContextFingerprint([circular])).toContain(':a1:')
  })
})

describe('buildSummaryContext', () => {
  test('returns bounded messages and fingerprint for summarizable context', () => {
    const messages = [
      { type: 'user', uuid: 'u1', message: { content: 'start' } },
      {
        type: 'assistant',
        uuid: 'a1',
        message: { content: [{ type: 'text', text: 'working' }] },
      },
      { type: 'user', uuid: 'u2', message: { content: 'continue' } },
    ] as unknown as Message[]

    const result = buildSummaryContext(messages, null)

    expect(result.skipReason).toBeUndefined()
    expect(result.messages.map(message => String(message.uuid))).toEqual([
      'u1',
      'a1',
      'u2',
    ])
    expect(result.fingerprint).toContain('3:u2:')
  })

  test('reports unchanged contexts by fingerprint', () => {
    const messages = [
      { type: 'user', uuid: 'u1', message: { content: 'start' } },
      {
        type: 'assistant',
        uuid: 'a1',
        message: { content: [{ type: 'text', text: 'working' }] },
      },
      { type: 'user', uuid: 'u2', message: { content: 'continue' } },
    ] as unknown as Message[]
    const first = buildSummaryContext(messages, null)

    const second = buildSummaryContext(messages, first.fingerprint)

    expect(second.skipReason).toBe('unchanged')
    expect(second.fingerprint).toBe(first.fingerprint)
  })

  test('filters incomplete tool calls before deciding context is too small', () => {
    const messages = [
      { type: 'user', uuid: 'u1', message: { content: 'start' } },
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          content: [{ type: 'tool_use', id: 'missing', name: 'Read' }],
        },
      },
      { type: 'user', uuid: 'u2', message: { content: 'continue' } },
    ] as unknown as Message[]

    const result = buildSummaryContext(messages, null)

    expect(result.skipReason).toBe('too_small')
    expect(result.messages.map(message => String(message.uuid))).toEqual([
      'u1',
      'u2',
    ])
  })
})
