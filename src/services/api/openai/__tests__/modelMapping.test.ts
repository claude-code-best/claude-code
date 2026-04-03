import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { resolveOpenAIModel } from '../modelMapping.js'

// Cache is module-level, so we need to invalidate it by changing env vars
describe('resolveOpenAIModel', () => {
  const originalEnv = {
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_MODEL_MAP: process.env.OPENAI_MODEL_MAP,
  }

  beforeEach(() => {
    // Reset env and clear module cache between tests
    delete process.env.OPENAI_MODEL
    delete process.env.OPENAI_MODEL_MAP
  })

  afterEach(() => {
    process.env.OPENAI_MODEL = originalEnv.OPENAI_MODEL
    process.env.OPENAI_MODEL_MAP = originalEnv.OPENAI_MODEL_MAP
  })

  test('OPENAI_MODEL env var overrides all', () => {
    process.env.OPENAI_MODEL = 'my-custom-model'
    // Need to reimport to bust cache — but since resolveOpenAIModel reads env at call time
    // for OPENAI_MODEL, this should work
    expect(resolveOpenAIModel('claude-sonnet-4-6')).toBe('my-custom-model')
  })

  test('maps known Anthropic model via DEFAULT_MODEL_MAP', () => {
    // claude-sonnet-4-6 → gpt-4o per default map
    expect(resolveOpenAIModel('claude-sonnet-4-6')).toBe('gpt-4o')
  })

  test('maps haiku model', () => {
    expect(resolveOpenAIModel('claude-haiku-4-5-20251001')).toBe('gpt-4o-mini')
  })

  test('maps opus model', () => {
    expect(resolveOpenAIModel('claude-opus-4-6')).toBe('o3')
  })

  test('passes through unknown model name', () => {
    expect(resolveOpenAIModel('some-random-model')).toBe('some-random-model')
  })

  test('strips [1m] suffix', () => {
    // claude-sonnet-4-6[1m] → gpt-4o (same as without suffix)
    expect(resolveOpenAIModel('claude-sonnet-4-6[1m]')).toBe('gpt-4o')
  })
})
