import { describe, expect, test } from 'bun:test'
import type { Message } from '../../../types/message.js'
import {
  getSummaryContextFingerprint,
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
})
