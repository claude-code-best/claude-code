import { describe, expect, test } from 'bun:test'
import { anthropicMessagesToOpenAI } from '../convertMessages.js'
import type { UserMessage, AssistantMessage } from '../../../../types/message.js'

// Helpers to create internal-format messages
function makeUserMsg(content: string | any[]): UserMessage {
  return {
    type: 'user',
    uuid: '00000000-0000-0000-0000-000000000000',
    message: { role: 'user', content },
  } as UserMessage
}

function makeAssistantMsg(content: string | any[]): AssistantMessage {
  return {
    type: 'assistant',
    uuid: '00000000-0000-0000-0000-000000000001',
    message: { role: 'assistant', content },
  } as AssistantMessage
}

describe('anthropicMessagesToOpenAI', () => {
  test('converts system prompt to system message', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg('hello')],
      ['You are helpful.'] as any,
    )
    expect(result[0]).toEqual({ role: 'system', content: 'You are helpful.' })
  })

  test('joins multiple system prompt strings', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg('hi')],
      ['Part 1', 'Part 2'] as any,
    )
    expect(result[0]).toEqual({ role: 'system', content: 'Part 1\n\nPart 2' })
  })

  test('skips empty system prompt', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg('hi')],
      [] as any,
    )
    expect(result[0].role).toBe('user')
  })

  test('converts simple user text message', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg('hello world')],
      [] as any,
    )
    expect(result).toEqual([{ role: 'user', content: 'hello world' }])
  })

  test('converts user message with content array', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg([
        { type: 'text', text: 'line 1' },
        { type: 'text', text: 'line 2' },
      ])],
      [] as any,
    )
    expect(result).toEqual([{ role: 'user', content: 'line 1\nline 2' }])
  })

  test('converts assistant message with text', () => {
    const result = anthropicMessagesToOpenAI(
      [makeAssistantMsg('response text')],
      [] as any,
    )
    expect(result).toEqual([{ role: 'assistant', content: 'response text' }])
  })

  test('converts assistant message with tool_use', () => {
    const result = anthropicMessagesToOpenAI(
      [makeAssistantMsg([
        { type: 'text', text: 'Let me help.' },
        {
          type: 'tool_use' as const,
          id: 'toolu_123',
          name: 'bash',
          input: { command: 'ls' },
        },
      ])],
      [] as any,
    )
    expect(result).toEqual([{
      role: 'assistant',
      content: 'Let me help.',
      tool_calls: [{
        id: 'toolu_123',
        type: 'function',
        function: { name: 'bash', arguments: '{"command":"ls"}' },
      }],
    }])
  })

  test('converts tool_result to tool message', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg([
        {
          type: 'tool_result' as const,
          tool_use_id: 'toolu_123',
          content: 'file1.txt\nfile2.txt',
        },
      ])],
      [] as any,
    )
    expect(result).toEqual([{
      role: 'tool',
      tool_call_id: 'toolu_123',
      content: 'file1.txt\nfile2.txt',
    }])
  })

  test('strips thinking blocks', () => {
    const result = anthropicMessagesToOpenAI(
      [makeAssistantMsg([
        { type: 'thinking' as const, thinking: 'internal thoughts...' },
        { type: 'text', text: 'visible response' },
      ])],
      [] as any,
    )
    expect(result).toEqual([{ role: 'assistant', content: 'visible response' }])
  })

  test('handles full conversation with tools', () => {
    const result = anthropicMessagesToOpenAI(
      [
        makeUserMsg('list files'),
        makeAssistantMsg([
          {
            type: 'tool_use' as const,
            id: 'toolu_abc',
            name: 'bash',
            input: { command: 'ls' },
          },
        ]),
        makeUserMsg([
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_abc',
            content: 'file.txt',
          },
        ]),
      ],
      ['You are helpful.'] as any,
    )

    expect(result).toHaveLength(4)
    expect(result[0].role).toBe('system')
    expect(result[1].role).toBe('user')
    expect(result[2].role).toBe('assistant')
    expect((result[2] as any).tool_calls).toBeDefined()
    expect(result[3].role).toBe('tool')
  })
})
