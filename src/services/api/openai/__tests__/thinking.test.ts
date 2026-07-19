import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'
import {
  isOpenAIThinkingEnabled,
  buildOpenAIRequestBody,
} from '../requestBody.js'

// Re-register envUtils.js with correct isEnvDefinedFalsy and isEnvTruthy to
// override pollution from other test files (debug-tool-call, issue,
// break-cache, MagicDocs/prompts, SessionMemory/prompts, cacheStats) that
// mock this module without exporting isEnvDefinedFalsy.
mock.module('src/utils/envUtils.js', () => ({
  isEnvTruthy: (v: string | boolean | undefined): boolean => {
    if (!v) return false
    if (typeof v === 'boolean') return v
    return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase().trim())
  },
  isEnvDefinedFalsy: (v: string | boolean | undefined): boolean => {
    if (v === undefined) return false
    if (typeof v === 'boolean') return !v
    if (!v) return false
    return ['0', 'false', 'no', 'off'].includes(v.toLowerCase().trim())
  },
}))

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
    test('does not send provider-specific thinking fields to generic models', () => {
      for (const value of ['1', 'true', 'yes', 'on', 'TRUE']) {
        process.env.OPENAI_ENABLE_THINKING = value
        expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(false)
      }
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
      expect(isOpenAIThinkingEnabled('TokenService/deepseek-reasoner')).toBe(
        true,
      )
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

    test('returns true when model name is "mimo-v2-flash"', () => {
      expect(isOpenAIThinkingEnabled('mimo-v2-flash')).toBe(true)
    })

    test('returns true when model name is "mimo-v2-pro"', () => {
      expect(isOpenAIThinkingEnabled('mimo-v2-pro')).toBe(true)
    })

    test('returns true when model name is "mimo-v2.5-pro"', () => {
      expect(isOpenAIThinkingEnabled('mimo-v2.5-pro')).toBe(true)
    })

    test('returns true when model name contains "mimo"', () => {
      expect(isOpenAIThinkingEnabled('MiMo-V2-Omni')).toBe(true)
    })

    test('returns false when model name is "gpt-4o"', () => {
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(false)
    })

    test('returns false when model name is empty', () => {
      expect(isOpenAIThinkingEnabled('')).toBe(false)
    })
  })

  describe('priority and combined detection', () => {
    test('OPENAI_ENABLE_THINKING=1 only enables provider-specific fields for detected models', () => {
      process.env.OPENAI_ENABLE_THINKING = '1'
      expect(isOpenAIThinkingEnabled('gpt-4o')).toBe(false)
      expect(isOpenAIThinkingEnabled('deepseek-v3')).toBe(true)
      expect(isOpenAIThinkingEnabled('qwen-3')).toBe(false)
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
    // Avoid depending on bootstrap session state in pure request-body tests.
    promptCacheKey: 'ccb:test-session',
  } as any

  test('includes official DeepSeek API thinking format when enabled', () => {
    const body = buildOpenAIRequestBody({ ...baseParams, enableThinking: true })
    expect(body.thinking).toEqual({ type: 'enabled' })
  })

  test('includes prompt_cache_key for sticky OpenAI cache routing', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
      maxTokens: 1024,
    })
    expect(body.prompt_cache_key).toBe('ccb:test-session')
  })

  test('sends reasoning effort with the DeepSeek thinking body', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: true,
      reasoningEffort: 'high',
    }) as Record<string, unknown>
    expect(body.reasoning_effort).toBe('high')
    expect(body.thinking).toEqual({ type: 'enabled' })
    expect('enable_thinking' in body).toBe(false)
    expect('chat_template_kwargs' in body).toBe(false)
  })

  test('does NOT include thinking params when disabled', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
    }) as Record<string, unknown>
    expect(body.thinking).toBeUndefined()
    expect('enable_thinking' in body).toBe(false)
    expect('chat_template_kwargs' in body).toBe(false)
  })

  test('always includes stream and stream_options', () => {
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
    })
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
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
    })
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
    const body = buildOpenAIRequestBody({
      ...baseParams,
      enableThinking: false,
    })
    expect(body.tools).toBeUndefined()
    expect(body.tool_choice).toBeUndefined()
  })
})
