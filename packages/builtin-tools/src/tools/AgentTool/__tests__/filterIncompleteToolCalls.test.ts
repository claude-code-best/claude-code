import { describe, expect, test } from 'bun:test'
import type { Message } from 'src/types/message.js'
import { filterIncompleteToolCalls } from '../filterIncompleteToolCalls.js'

describe('filterIncompleteToolCalls', () => {
  test('drops assistant tool uses that do not have matching results', () => {
    const messages = [
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'missing', name: 'Read' }],
        },
      },
      {
        type: 'user',
        uuid: 'u1',
        message: { role: 'user', content: 'continue' },
      },
    ] as unknown as Message[]

    expect(
      filterIncompleteToolCalls(messages).map(message => String(message.uuid)),
    ).toEqual(['u1'])
  })

  test('preserves assistant text when dropping orphan tool uses', () => {
    const messages = [
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will read the file.' },
            { type: 'tool_use', id: 'missing', name: 'Read' },
          ],
        },
      },
    ] as unknown as Message[]

    const filtered = filterIncompleteToolCalls(messages)
    expect(filtered).toHaveLength(1)
    const first = filtered[0]!
    const content = first.message!.content
    expect(
      Array.isArray(content) ? content.map(block => block.type) : [],
    ).toEqual(['text'])
  })

  test('keeps completed parallel tool calls when dropping an orphan', () => {
    const messages = [
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'done', name: 'Read' },
            { type: 'tool_use', id: 'missing', name: 'Grep' },
          ],
        },
      },
      {
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'done', content: 'ok' },
          ],
        },
      },
    ] as unknown as Message[]

    const filtered = filterIncompleteToolCalls(messages)
    expect(filtered.map(message => String(message.uuid))).toEqual(['a1', 'u1'])
    const first = filtered[0]!
    const content = first.message!.content
    expect(
      Array.isArray(content)
        ? content.map(block =>
            block.type === 'tool_use' ? block.id : block.type,
          )
        : [],
    ).toEqual(['done'])
  })

  test('keeps assistant tool uses that have matching results', () => {
    const messages = [
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'done', name: 'Read' }],
        },
      },
      {
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'done', content: 'ok' },
          ],
        },
      },
    ] as unknown as Message[]

    expect(
      filterIncompleteToolCalls(messages).map(message => String(message.uuid)),
    ).toEqual(['a1', 'u1'])
  })

  test('drops orphan tool results when their tool use was removed', () => {
    const messages = [
      {
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 'missing', content: 'late' },
          ],
        },
      },
    ] as unknown as Message[]

    expect(filterIncompleteToolCalls(messages)).toEqual([])
  })

  test('keeps user text while dropping orphan tool results', () => {
    const messages = [
      {
        type: 'assistant',
        uuid: 'a1',
        message: { role: 'assistant', content: 'done' },
      },
      {
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'keep this' },
            { type: 'tool_result', tool_use_id: 'missing', content: 'late' },
          ],
        },
      },
    ] as unknown as Message[]

    const filtered = filterIncompleteToolCalls(messages)
    expect(filtered.map(message => String(message.uuid))).toEqual(['a1', 'u1'])
    const content = filtered[1]!.message!.content
    expect(Array.isArray(content) ? content : []).toEqual([
      { type: 'text', text: 'keep this' },
    ])
  })

  test('drops malformed tool blocks without ids', () => {
    const messages = [
      {
        type: 'assistant',
        uuid: 'a1',
        message: {
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'Read' }],
        },
      },
      {
        type: 'user',
        uuid: 'u1',
        message: {
          role: 'user',
          content: [{ type: 'tool_result', content: 'late' }],
        },
      },
    ] as unknown as Message[]

    expect(filterIncompleteToolCalls(messages)).toEqual([])
  })
})
