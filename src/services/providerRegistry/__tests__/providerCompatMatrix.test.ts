import { describe, test, expect } from 'bun:test'
import {
  COMPAT_PROFILES,
  applyCompatRule,
  getDeepSeekReasoningMode,
} from '../providerCompatMatrix.js'

describe('COMPAT_PROFILES', () => {
  test('cerebras does not support stream_options', () => {
    expect(COMPAT_PROFILES['cerebras'].supportsStreamUsageOption).toBe(false)
  })

  test('cerebras does not support thinking field', () => {
    expect(COMPAT_PROFILES['cerebras'].supportsThinkingField).toBe(false)
  })

  test('groq strips reasoning_content', () => {
    expect(COMPAT_PROFILES['groq'].reasoningContentEcho).toBe('strip')
  })

  test('deepseek preserves reasoning_content', () => {
    expect(COMPAT_PROFILES['deepseek'].reasoningContentEcho).toBe(
      'always-preserve',
    )
  })

  test('deepseek supports thinking field', () => {
    expect(COMPAT_PROFILES['deepseek'].supportsThinkingField).toBe(true)
  })

  test('strict-openai strips stream_options', () => {
    expect(COMPAT_PROFILES['strict-openai'].supportsStreamUsageOption).toBe(
      false,
    )
  })

  test('permissive allows all fields', () => {
    expect(COMPAT_PROFILES['permissive'].supportsStreamUsageOption).toBe(true)
    expect(COMPAT_PROFILES['permissive'].supportsThinkingField).toBe(true)
  })
})

describe('applyCompatRule - stream_options stripping', () => {
  test('strips stream_options.include_usage for cerebras', () => {
    const body = {
      model: 'llama-3.3-70b',
      messages: [],
      stream: true,
      stream_options: { include_usage: true },
    }
    const result = applyCompatRule(body, 'cerebras')
    expect(result['stream_options']).toBeUndefined()
  })

  test('strips stream_options for strict-openai', () => {
    const body = {
      messages: [],
      stream_options: { include_usage: true },
    }
    const result = applyCompatRule(body, 'strict-openai')
    expect(result['stream_options']).toBeUndefined()
  })

  test('preserves stream_options for deepseek', () => {
    const body = {
      messages: [],
      stream_options: { include_usage: true },
    }
    const result = applyCompatRule(body, 'deepseek')
    expect(result['stream_options']).toEqual({ include_usage: true })
  })

  test('preserves stream_options for permissive', () => {
    const body = {
      messages: [],
      stream_options: { include_usage: true, other_field: 'x' },
    }
    const result = applyCompatRule(body, 'permissive')
    expect(result['stream_options']).toEqual({
      include_usage: true,
      other_field: 'x',
    })
  })

  test('does not mutate input body', () => {
    const body = {
      messages: [],
      stream_options: { include_usage: true },
    }
    applyCompatRule(body, 'groq')
    // Input must be unchanged
    expect(body['stream_options']).toEqual({ include_usage: true })
  })
})

describe('applyCompatRule - thinking field stripping', () => {
  test('strips thinking field from messages for cerebras', () => {
    const body = {
      messages: [{ role: 'user', content: 'hi', thinking: { budget: 1000 } }],
    }
    const result = applyCompatRule(body, 'cerebras')
    const msgs = result['messages'] as Record<string, unknown>[]
    expect(msgs[0]!['thinking']).toBeUndefined()
    expect(msgs[0]!['content']).toBe('hi')
  })

  test('preserves thinking field for deepseek', () => {
    const body = {
      messages: [{ role: 'user', content: 'hi', thinking: { budget: 1000 } }],
    }
    const result = applyCompatRule(body, 'deepseek')
    const msgs = result['messages'] as Record<string, unknown>[]
    expect(msgs[0]!['thinking']).toEqual({ budget: 1000 })
  })
})

describe('applyCompatRule - DeepSeek reasoning_content three modes', () => {
  test('thinking-only mode: strips reasoning_content for strict-openai (non-deepseek)', () => {
    const body = {
      messages: [
        { role: 'assistant', content: 'answer', reasoning_content: 'thoughts' },
      ],
    }
    const result = applyCompatRule(body, 'strict-openai')
    const msgs = result['messages'] as Record<string, unknown>[]
    expect(msgs[0]!['reasoning_content']).toBeUndefined()
  })

  test('thinking-only mode: preserves reasoning_content for deepseek', () => {
    const body = {
      messages: [
        { role: 'assistant', content: 'answer', reasoning_content: 'thoughts' },
      ],
    }
    const result = applyCompatRule(body, 'deepseek')
    const msgs = result['messages'] as Record<string, unknown>[]
    expect(msgs[0]!['reasoning_content']).toBe('thoughts')
  })

  test('thinking+tools mode: preserves reasoning_content for deepseek', () => {
    const body = {
      messages: [
        {
          role: 'assistant',
          content: null,
          reasoning_content: 'deep thoughts',
          tool_calls: [{ id: 'call_1', function: { name: 'search' } }],
        },
      ],
    }
    const result = applyCompatRule(body, 'deepseek')
    const msgs = result['messages'] as Record<string, unknown>[]
    expect(msgs[0]!['reasoning_content']).toBe('deep thoughts')
  })

  test('permissive with non-thinking model strips reasoning_content', () => {
    const body = {
      model: 'gpt-4o',
      messages: [
        { role: 'assistant', content: 'hi', reasoning_content: 'unused' },
      ],
    }
    const result = applyCompatRule(body, 'permissive')
    const msgs = result['messages'] as Record<string, unknown>[]
    expect(msgs[0]!['reasoning_content']).toBeUndefined()
  })

  test('permissive with thinking model preserves reasoning_content', () => {
    const body = {
      model: 'deepseek-reasoner',
      messages: [
        { role: 'assistant', content: 'hi', reasoning_content: 'thoughts' },
      ],
    }
    const result = applyCompatRule(body, 'permissive')
    const msgs = result['messages'] as Record<string, unknown>[]
    expect(msgs[0]!['reasoning_content']).toBe('thoughts')
  })
})

describe('getDeepSeekReasoningMode', () => {
  test('thinking-only: has reasoning_content, no tool_calls', () => {
    const msg = { reasoning_content: 'thoughts', content: 'answer' }
    expect(getDeepSeekReasoningMode(msg)).toBe('thinking-only')
  })

  test('thinking+tools: has both reasoning_content and tool_calls', () => {
    const msg = {
      reasoning_content: 'deep thoughts',
      tool_calls: [{ id: 'call_1' }],
    }
    expect(getDeepSeekReasoningMode(msg)).toBe('thinking+tools')
  })

  test('normal: no reasoning_content', () => {
    const msg = { content: 'plain answer' }
    expect(getDeepSeekReasoningMode(msg)).toBe('normal')
  })

  test('normal: empty tool_calls array with no reasoning_content', () => {
    const msg = { content: 'plain', tool_calls: [] }
    expect(getDeepSeekReasoningMode(msg)).toBe('normal')
  })
})
