import { describe, expect, test } from 'bun:test'
import { anthropicMessagesToOpenAI } from '../convertMessages.js'

// SystemPrompt is `readonly string[]` — pass string arrays
describe('anthropicMessagesToOpenAI', () => {
  test('converts system prompt to system message', () => {
    const result = anthropicMessagesToOpenAI(
      [{ role: 'user', content: 'hello' }],
      ['You are helpful.'] as any,
    )
    expect(result[0]).toEqual({ role: 'system', content: 'You are helpful.' })
  })

  test('joins multiple system prompt strings', () => {
    const result = anthropicMessagesToOpenAI(
      [{ role: 'user', content: 'hi' }],
      ['Part 1', 'Part 2'] as any,
    )
    expect(result[0]).toEqual({ role: 'system', content: 'Part 1\n\nPart 2' })
  })

  test('skips empty system prompt', () => {
    const result = anthropicMessagesToOpenAI(
      [{ role: 'user', content: 'hi' }],
      [] as any,
    )
    expect(result[0].role).toBe('user')
  })

  test('converts simple user text message', () => {
    const result = anthropicMessagesToOpenAI(
      [{ role: 'user', content: 'hello world' }],
      [] as any,
    )
    expect(result).toEqual([{ role: 'user', content: 'hello world' }])
  })

  test('converts user message with content array', () => {
    const result = anthropicMessagesToOpenAI(
      [{
        role: 'user',
        content: [
          { type: 'text', text: 'line 1' },
          { type: 'text', text: 'line 2' },
        ],
      }],
      [] as any,
    )
    expect(result).toEqual([{ role: 'user', content: 'line 1\nline 2' }])
  })

  test('converts assistant message with text', () => {
    const result = anthropicMessagesToOpenAI(
      [{ role: 'assistant', content: 'response text' }],
      [] as any,
    )
    expect(result).toEqual([{ role: 'assistant', content: 'response text' }])
  })

  test('converts assistant message with tool_use', () => {
    const result = anthropicMessagesToOpenAI(
      [{
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me help.' },
          {
            type: 'tool_use' as const,
            id: 'toolu_123',
            name: 'bash',
            input: { command: 'ls' },
          },
        ],
      }],
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
      [{
        role: 'user',
        content: [
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_123',
            content: 'file1.txt\nfile2.txt',
          },
        ],
      }],
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
      [{
        role: 'assistant',
        content: [
          { type: 'thinking' as const, thinking: 'internal thoughts...' },
          { type: 'text', text: 'visible response' },
        ],
      }],
      [] as any,
    )
    expect(result).toEqual([{ role: 'assistant', content: 'visible response' }])
  })

  test('handles full conversation with tools', () => {
    const result = anthropicMessagesToOpenAI(
      [
        { role: 'user', content: 'list files' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use' as const,
              id: 'toolu_abc',
              name: 'bash',
              input: { command: 'ls' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: 'toolu_abc',
              content: 'file.txt',
            },
          ],
        },
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
