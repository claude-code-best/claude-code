import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { isOpenAIThinkingEnabled, buildOpenAIRequestBody } from '../requestBody.js'

describe('isOpenAIThinkingEnabled', () => {
  const originalEnv = {
    OPENAI_ENABLE_THINKING: process.env.OPENAI_ENABLE_THINKING,
  }

  beforeEach(() => {
    // Clear env var before each test
    delete process.env.OPENAI_ENABLE_THINKING
  })

  afterEach(() => {
    // Restore original env var — delete key if it was originally undefined
    // to avoid leaking the env key into subsequent tests
    if (originalEnv.OPENAI_ENABLE_THINKING === undefined) {
      delete process.env.OPENAI_ENABLE_THINKING
    } else {
      process.env.OPENAI_ENABLE_THINKING = originalEnv.OPENAI_ENABLE_THINKING
    }
  })

  describe('OPENAI_ENABLE_THINKING env var', () => {
    test('returns true when OPENAI_ENABLE_THINKING=1', () => {
      process.env.OPENAI_ENABLE_THINKING = '1'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('returns true when OPENAI_ENABLE_THINKING=true', () => {
      process.env.OPENAI_ENABLE_THINKING = 'true'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('returns true when OPENAI_ENABLE_THINKING=yes', () => {
      process.env.OPENAI_ENABLE_THINKING = 'yes'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('returns true when OPENAI_ENABLE_THINKING=on', () => {
      process.env.OPENAI_ENABLE_THINKING = 'on'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('returns true when OPENAI_ENABLE_THINKING=TRUE (case insensitive)', () => {
      process.env.OPENAI_ENABLE_THINKING = 'TRUE'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
    })

    test('returns false when OPENAI_ENABLE_THINKING=0', () => {
      process.env.OPENAI_ENABLE_THINKING = '0'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(false)
    })

    test('returns false when OPENAI_ENABLE_THINKING=false', () => {
      process.env.OPENAI_ENABLE_THINKING = 'false'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(false)
    })

    test('returns false when OPENAI_ENABLE_THINKING is empty', () => {
      process.env.OPENAI_ENABLE_THINKING = ''
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(false)
    })

    test('returns false when OPENAI_ENABLE_THINKING is not set', () => {
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(false)
    })
  })

  describe('model name auto-detect', () => {
    test('returns true when model name is "deepseek-reasoner"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(true)
    })

    test('returns true when model name contains "deepseek-reasoner" (case insensitive)', () => {
      expect(isOpenAIThinkingEnabled('DeepSeek-Reasoner')).toBe(true)
    })

    test('returns true when model name has prefix/suffix for deepseek-reasoner', () => {
      expect(isOpenAIThinkingEnabled('my-deepseek-reasoner-v1')).toBe(true)
    })

    test('returns true when model name is namespaced for deepseek-reasoner', () => {
      expect(isOpenAIThinkingEnabled('TokenService/deepseek-reasoner')).toBe(true)
    })

    test('returns true when model name is "deepseek-v3.2"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-v3.2')).toBe(true)
    })

    test('returns true when model name contains "deepseek-v3.2" (case insensitive)', () => {
      expect(isOpenAIThinkingEnabled('DeepSeek-V3.2')).toBe(true)
    })

    test('returns true when model name has prefix/suffix for deepseek-v3.2', () => {
      expect(isOpenAIThinkingEnabled('my-deepseek-v3.2-v1')).toBe(true)
    })

    test('returns true when model name is namespaced for deepseek-v3.2', () => {
      expect(isOpenAIThinkingEnabled('TokenService/deepseek-v3.2')).toBe(true)
    })

    test('returns true when model name is "deepseek-chat"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-chat')).toBe(true)
    })

    test('returns true when model name is "deepseek-v3"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-v3')).toBe(true)
    })

    test('returns true when model name is "deepseek-v4"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-v4')).toBe(true)
    })

    test('returns true when model name is "deepseek-v4-pro"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-v4-pro')).toBe(true)
    })

    test('returns true when model name is "deepseek-r1"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-r1')).toBe(true)
    })

    test('returns true when model name contains "deepseek"', () => {
      expect(isOpenAIThinkingEnabled('deepseek-coder')).toBe(true)
    })

    test('returns false when model name is "gpt-4o"', () => {
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(false)
    })

    test('returns false when model name is empty', () => {
      expect(isOpenAIThinkingEnabled('')).toBe(false)
    })
  })

  describe('priority and combined detection', () => {
    test('OPENAI_ENABLE_THINKING=1 enables thinking for any model', () => {
      process.env.OPENAI_ENABLE_THINKING = '1'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(true)
      expect(isOpenAIThinkingEnabled('deepseek-v3')).toBe(true)
      expect(isOpenAIThinkingEnabled('qwen-3')).toBe(true)
    })

    test('OPENAI_ENABLE_THINKING=false disables thinking even for deepseek-reasoner', () => {
      process.env.OPENAI_ENABLE_THINKING = 'false'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(false)
    })

    test('OPENAI_ENABLE_THINKING=0 disables thinking even for deepseek-reasoner', () => {
      process.env.OPENAI_ENABLE_THINKING = '0'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(false)
    })

    test('both conditions can enable thinking', () => {
      process.env.OPENAI_ENABLE_THINKING = '1'
      expect(isOpenAIThinkingEnabled('deepseek-reasoner')).toBe(true)
    })
  })
})

describe('buildOpenAIRequestBody — thinking params', () => {
  const baseParams = {
    model: 'deepseek-reasoner',
    messages: [{ role: 'user', content: 'hello' }],
    tools: [] as any[],
    toolChoice: undefined as any,
  } as any

  test('includes official DeepSeek API thinking format when enabled', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: true })
    expect(body.thinking).toEqual({ type: 'enabled' })
  })

  test('includes vLLM/self-hosted thinking format when enabled', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: true })
    expect(body.enable_thinking).toBe(true)
    expect(body.chat_template_kwargs).toEqual({ thinking: true })
  })

  test('includes both formats simultaneously when enabled', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: true })
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect(body.enable_thinking).toBe(true)
    expect(body.chat_template_kwargs!.thinking).toBe(true)
  })

  test('does NOT include thinking params when disabled', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: false })
    expect(body.thinking).toBeUndefined()
    expect(body.enable_thinking).toBeUndefined()
    expect(body.chat_template_kwargs).toBeUndefined()
  })

  test('always includes stream and stream_options', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: false })
    expect(body.stream).toBe(true)
    expect(body.stream_options).toEqual({ include_usage: true })
  })

  test('includes temperature when thinking is off and override is set', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
      temperatureOverride: 0.7,
    })
    expect(body.temperature).toBe(0.7)
  })

  test('excludes temperature when thinking is on even if override is set', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: true,
      temperatureOverride: 0.7,
    })
    expect(body.temperature).toBeUndefined()
  })

  test('excludes temperature when thinking is off and no override', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: false })
    expect(body.temperature).toBeUndefined()
  })

  test('includes tools and tool_choice when tools are provided', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      tools: [{ type: 'function', function: { name: 'test' } }],
      toolChoice: 'auto',
      enableThinking: false,
    })
    expect(body.tools).toHaveLength(1)
    expect(body.tool_choice).toBe('auto')
  })

  test('excludes tools when empty', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: false })
    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
  })
})