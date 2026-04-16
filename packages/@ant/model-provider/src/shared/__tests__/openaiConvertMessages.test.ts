import { describe, expect, test } from 'bun:test'
import { anthropicMessagesToOpenAI } from '../openaiConvertMessages.js'
import type { UserMessage, AssistantMessage } from '../../types/message.js'

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

  test('converts base64 image to image_url', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg([
        { type: 'text', text: 'what is this?' },
        {
          type: 'image' as const,
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'iVBORw0KGgo=',
          },
        },
      ])],
      [] as any,
    )
    expect(result).toEqual([{
      role: 'user',
      content: [
        { type: 'text', text: 'what is this?' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
        },
      ],
    }])
  })

  test('converts url image to image_url', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg([
        {
          type: 'image' as const,
          source: {
            type: 'url',
            url: 'https://example.com/img.png',
          },
        },
      ])],
      [] as any,
    )
    expect(result).toEqual([{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/img.png' },
        },
      ],
    }])
  })

  test('converts image-only message without text', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg([
        {
          type: 'image' as const,
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: '/9j/4AAQ',
          },
        },
      ])],
      [] as any,
    )
    expect(result).toEqual([{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ' },
        },
      ],
    }])
  })

  test('defaults to image/png when media_type is missing', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg([
        {
          type: 'image' as const,
          source: {
            type: 'base64',
            data: 'ABC123',
          },
        },
      ])],
      [] as any,
    )
    expect((result[0].content as any[])[0].image_url.url).toBe(
      'data:image/png;base64,ABC123',
    )
  })
})

describe('DeepSeek thinking mode (enableThinking)', () => {
  test('preserves thinking block as reasoning_content when enabled', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg('question'), makeAssistantMsg([
        { type: 'thinking' as const, thinking: 'Let me reason about this...' },
        { type: 'text', text: 'The answer is 42.' },
      ])],
      [] as any,
      { enableThinking: true },
    )
    // Should have: user, assistant with reasoning_content
    expect(result).toHaveLength(2)
    expect(result[0].role).toBe('user')
    const assistant = result[1] as any
    expect(assistant.role).toBe('assistant')
    expect(assistant.content).toBe('The answer is 42.')
    expect(assistant.reasoning_content).toBe('Let me reason about this...')
  })

  test('drops thinking block when enableThinking is false (default)', () => {
    const result = anthropicMessagesToOpenAI(
      [makeAssistantMsg([
        { type: 'thinking' as const, thinking: 'internal thoughts...' },
        { type: 'text', text: 'visible response' },
      ])],
      [] as any,
    )
    const assistant = result[0] as any
    expect(assistant.content).toBe('visible response')
    expect(assistant.reasoning_content).toBeUndefined()
  })

  test('preserves reasoning_content with tool_calls in same turn', () => {
    const result = anthropicMessagesToOpenAI(
      [
        makeUserMsg('what is the weather?'),
        makeAssistantMsg([
          { type: 'thinking' as const, thinking: 'I need to call the weather tool.' },
          { type: 'text', text: '' },
          {
            type: 'tool_use' as const,
            id: 'toolu_001',
            name: 'get_weather',
            input: { location: 'Hangzhou' },
          },
        ]),
        makeUserMsg([
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_001',
            content: 'Cloudy 7~13°C',
          },
        ]),
      ],
      [] as any,
      { enableThinking: true },
    )

    // Find the assistant message
    const assistants = result.filter(m => m.role === 'assistant')
    expect(assistants.length).toBe(1)
    const assistant = assistants[0] as any
    expect(assistant.reasoning_content).toBe('I need to call the weather tool.')
    expect(assistant.tool_calls).toBeDefined()
    expect(assistant.tool_calls[0].function.name).toBe('get_weather')
  })

  test('strips reasoning_content from previous turns', () => {
    const result = anthropicMessagesToOpenAI(
      [
        // Turn 1: user → assistant (with thinking)
        makeUserMsg('question 1'),
        makeAssistantMsg([
          { type: 'thinking' as const, thinking: 'Turn 1 reasoning...' },
          { type: 'text', text: 'Turn 1 answer' },
        ]),
        // Turn 2: new user message → previous reasoning should be stripped
        makeUserMsg('question 2'),
        makeAssistantMsg([
          { type: 'thinking' as const, thinking: 'Turn 2 reasoning...' },
          { type: 'text', text: 'Turn 2 answer' },
        ]),
      ],
      [] as any,
      { enableThinking: true },
    )

    const assistants = result.filter(m => m.role === 'assistant')
    // Turn 1 assistant: reasoning should be stripped (previous turn)
    expect((assistants[0] as any).reasoning_content).toBeUndefined()
    expect((assistants[0] as any).content).toBe('Turn 1 answer')
    // Turn 2 assistant: reasoning should be preserved (current turn)
    expect((assistants[1] as any).reasoning_content).toBe('Turn 2 reasoning...')
    expect((assistants[1] as any).content).toBe('Turn 2 answer')
  })

  test('preserves reasoning_content in multi-iteration tool call within same turn', () => {
    // Simulates a full DeepSeek tool call iteration:
    // user → assistant(thinking+tool_call) → tool_result → assistant(thinking+tool_call) → tool_result → assistant(thinking+text)
    const result = anthropicMessagesToOpenAI(
      [
        makeUserMsg("tomorrow's weather in Hangzhou"),
        // Iteration 1: thinking + tool call
        makeAssistantMsg([
          { type: 'thinking' as const, thinking: 'I need the date first.' },
          {
            type: 'tool_use' as const,
            id: 'toolu_001',
            name: 'get_date',
            input: {},
          },
        ]),
        makeUserMsg([
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_001',
            content: '2026-04-08',
          },
        ]),
        // Iteration 2: thinking + tool call
        makeAssistantMsg([
          { type: 'thinking' as const, thinking: 'Now I can get the weather.' },
          {
            type: 'tool_use' as const,
            id: 'toolu_002',
            name: 'get_weather',
            input: { location: 'Hangzhou', date: '2026-04-08' },
          },
        ]),
        makeUserMsg([
          {
            type: 'tool_result' as const,
            tool_use_id: 'toolu_002',
            content: 'Cloudy 7~13°C',
          },
        ]),
        // Iteration 3: thinking + final answer
        makeAssistantMsg([
          { type: 'thinking' as const, thinking: 'I have the info now.' },
          { type: 'text', text: 'Tomorrow will be cloudy, 7-13°C.' },
        ]),
      ],
      [] as any,
      { enableThinking: true },
    )

    const assistants = result.filter(m => m.role === 'assistant')
    expect(assistants.length).toBe(3)
    // All iterations within the same turn preserve reasoning
    expect((assistants[0] as any).reasoning_content).toBe('I need the date first.')
    expect((assistants[1] as any).reasoning_content).toBe('Now I can get the weather.')
    expect((assistants[2] as any).reasoning_content).toBe('I have the info now.')
  })

  test('handles multiple thinking blocks in single assistant message', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg('question'), makeAssistantMsg([
        { type: 'thinking' as const, thinking: 'First thought.' },
        { type: 'thinking' as const, thinking: 'Second thought.' },
        { type: 'text', text: 'Final answer.' },
      ])],
      [] as any,
      { enableThinking: true },
    )
    const assistant = result.filter(m => m.role === 'assistant')[0] as any
    expect(assistant.reasoning_content).toBe('First thought.\nSecond thought.')
  })

  test('skips empty thinking blocks', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg('question'), makeAssistantMsg([
        { type: 'thinking' as const, thinking: '' },
        { type: 'text', text: 'Answer.' },
      ])],
      [] as any,
      { enableThinking: true },
    )
    const assistant = result.filter(m => m.role === 'assistant')[0] as any
    expect(assistant.reasoning_content).toBeUndefined()
  })

  // ── fix: reorder tool and user messages for OpenAI API compatibility (#168) ──

  test('tool messages come BEFORE user text when mixed in same turn', () => {
    // OpenAI requires: assistant(tool_calls) → tool → user
    // Bug: previously user text was emitted before tool messages
    const result = anthropicMessagesToOpenAI(
      [
        makeUserMsg('run ls'),
        makeAssistantMsg([
          { type: 'tool_use' as const, id: 'toolu_1', name: 'bash', input: { command: 'ls' } },
        ]),
        makeUserMsg([
          { type: 'tool_result' as const, tool_use_id: 'toolu_1', content: 'file.txt' },
          { type: 'text' as const, text: 'looks good' },
        ]),
      ],
      [] as any,
    )
    // Find the tool message and the user text message
    const toolIdx = result.findIndex(m => m.role === 'tool')
    const userTextIdx = result.findIndex(
      m => m.role === 'user' && typeof m.content === 'string' && m.content.includes('looks good'),
    )
    expect(toolIdx).toBeGreaterThanOrEqual(0)
    expect(userTextIdx).toBeGreaterThanOrEqual(0)
    // Tool MUST come before user text
    expect(toolIdx).toBeLessThan(userTextIdx)
  })

  test('tool message immediately follows assistant tool_calls (no user message in between)', () => {
    const result = anthropicMessagesToOpenAI(
      [
        makeUserMsg('do something'),
        makeAssistantMsg([
          { type: 'tool_use' as const, id: 'toolu_2', name: 'bash', input: { command: 'pwd' } },
        ]),
        makeUserMsg([
          { type: 'tool_result' as const, tool_use_id: 'toolu_2', content: '/home/user' },
        ]),
      ],
      [] as any,
    )
    const assistantIdx = result.findIndex(m => m.role === 'assistant' && (m as any).tool_calls)
    const toolIdx = result.findIndex(m => m.role === 'tool')
    expect(assistantIdx).toBeGreaterThanOrEqual(0)
    expect(toolIdx).toBe(assistantIdx + 1)
  })

  test('sets content to null when only thinking and tool_calls present', () => {
    const result = anthropicMessagesToOpenAI(
      [makeUserMsg('question'), makeAssistantMsg([
        { type: 'thinking' as const, thinking: 'Reasoning only.' },
        {
          type: 'tool_use' as const,
          id: 'toolu_001',
          name: 'bash',
          input: { command: 'ls' },
        },
      ])],
      [] as any,
      { enableThinking: true },
    )
    const assistant = result.filter(m => m.role === 'assistant')[0] as any
    expect(assistant.content).toBeNull()
    expect(assistant.reasoning_content).toBe('Reasoning only.')
    expect(assistant.tool_calls).toHaveLength(1)
  })
})
