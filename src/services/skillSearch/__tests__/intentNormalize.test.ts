import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Must mock queryHaiku before importing the module under test so the ESM
// import binding picks up the stub.
const haikuCalls: Array<{ systemPrompt: unknown; userPrompt: string }> = []
let haikuResponder: (userPrompt: string) => Promise<unknown> = async () => ({
  message: { content: [{ type: 'text', text: 'optimize code performance' }] },
})

mock.module('../../api/claude.js', () => ({
  queryHaiku: mock(
    async (args: { systemPrompt: unknown; userPrompt: string }) => {
      haikuCalls.push({
        systemPrompt: args.systemPrompt,
        userPrompt: args.userPrompt,
      })
      return haikuResponder(args.userPrompt)
    },
  ),
}))

import {
  clearIntentNormalizeCache,
  isIntentNormalizeEnabled,
  normalizeQueryIntent,
} from '../intentNormalize.js'

const originalEnv = { ...process.env }

beforeEach(() => {
  process.env = { ...originalEnv }
  haikuCalls.length = 0
  haikuResponder = async () => ({
    message: { content: [{ type: 'text', text: 'optimize code performance' }] },
  })
  clearIntentNormalizeCache()
})

afterEach(() => {
  process.env = { ...originalEnv }
  clearIntentNormalizeCache()
})

describe('isIntentNormalizeEnabled', () => {
  test('defaults to disabled when flag is unset', () => {
    delete process.env.SKILL_SEARCH_INTENT_ENABLED
    expect(isIntentNormalizeEnabled()).toBe(false)
  })

  test('enabled when flag is "1"', () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    expect(isIntentNormalizeEnabled()).toBe(true)
  })

  test('disabled for any value other than "1"', () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = 'true'
    expect(isIntentNormalizeEnabled()).toBe(false)
  })
})

describe('normalizeQueryIntent — feature flag gating', () => {
  test('returns query unchanged when flag is off', async () => {
    delete process.env.SKILL_SEARCH_INTENT_ENABLED
    const result = await normalizeQueryIntent('帮我优化代码的性能')
    expect(result).toBe('帮我优化代码的性能')
    expect(haikuCalls.length).toBe(0)
  })

  test('returns empty string as-is without calling Haiku', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    const result = await normalizeQueryIntent('')
    expect(result).toBe('')
    expect(haikuCalls.length).toBe(0)
  })

  test('trims whitespace-only input to empty string', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    const result = await normalizeQueryIntent('   \n  ')
    expect(result).toBe('')
    expect(haikuCalls.length).toBe(0)
  })
})

describe('normalizeQueryIntent — ASCII fast path', () => {
  test('ASCII query bypasses Haiku and returns unchanged', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    const result = await normalizeQueryIntent('optimize code performance')
    expect(result).toBe('optimize code performance')
    expect(haikuCalls.length).toBe(0)
  })

  test('ASCII query with punctuation still bypasses Haiku', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    const result = await normalizeQueryIntent('audit feature flags for stubs')
    expect(result).toBe('audit feature flags for stubs')
    expect(haikuCalls.length).toBe(0)
  })
})

describe('normalizeQueryIntent — CJK path calls Haiku', () => {
  test('CJK query concatenates keywords returned by Haiku', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async () => ({
      message: {
        content: [{ type: 'text', text: 'optimize code performance refactor' }],
      },
    })

    const result = await normalizeQueryIntent('帮我优化代码的性能')

    expect(haikuCalls.length).toBe(1)
    expect(result).toBe('帮我优化代码的性能 optimize code performance refactor')
  })

  test('mixed CJK + ASCII query also calls Haiku', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async () => ({
      message: { content: [{ type: 'text', text: 'review code audit' }] },
    })
    const result = await normalizeQueryIntent('帮我做 code review')
    expect(haikuCalls.length).toBe(1)
    expect(result).toBe('帮我做 code review review code audit')
  })

  test('Haiku output gets sanitized: lowercased, punctuation stripped', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async () => ({
      message: {
        content: [{ type: 'text', text: 'Optimize, Code! Performance?' }],
      },
    })
    const result = await normalizeQueryIntent('优化代码')
    expect(result).toBe('优化代码 optimize code performance')
  })
})

describe('normalizeQueryIntent — graceful fallback', () => {
  test('empty LLM response falls back to original query', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async () => ({
      message: { content: [{ type: 'text', text: '' }] },
    })
    const result = await normalizeQueryIntent('优化代码')
    expect(result).toBe('优化代码')
    expect(haikuCalls.length).toBe(1)
  })

  test('Haiku throwing an error falls back to original query', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async () => {
      throw new Error('network down')
    }
    const result = await normalizeQueryIntent('重构代码')
    expect(result).toBe('重构代码')
    expect(haikuCalls.length).toBe(1)
  })

  test('malformed LLM response (no text blocks) falls back', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async () => ({ message: { content: 'not-an-array' } })
    const result = await normalizeQueryIntent('优化代码')
    expect(result).toBe('优化代码')
  })

  test('LLM responds with only punctuation -> sanitize empties it -> fallback', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async () => ({
      message: { content: [{ type: 'text', text: '!!!???' }] },
    })
    const result = await normalizeQueryIntent('优化代码')
    expect(result).toBe('优化代码')
  })
})

describe('normalizeQueryIntent — cache behavior', () => {
  test('repeat calls with same query use cache (only 1 Haiku call)', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async () => ({
      message: { content: [{ type: 'text', text: 'optimize code' }] },
    })

    const a = await normalizeQueryIntent('帮我优化代码')
    const b = await normalizeQueryIntent('帮我优化代码')
    const c = await normalizeQueryIntent('帮我优化代码')

    expect(a).toBe(b)
    expect(b).toBe(c)
    expect(haikuCalls.length).toBe(1)
  })

  test('different queries trigger separate Haiku calls', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async (userPrompt: string) => ({
      message: {
        content: [{ type: 'text', text: `kw-for-${userPrompt.slice(0, 2)}` }],
      },
    })

    await normalizeQueryIntent('优化代码')
    await normalizeQueryIntent('重构模块')

    expect(haikuCalls.length).toBe(2)
  })

  test('clearIntentNormalizeCache resets the cache', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    haikuResponder = async () => ({
      message: { content: [{ type: 'text', text: 'kw' }] },
    })

    await normalizeQueryIntent('优化代码')
    clearIntentNormalizeCache()
    await normalizeQueryIntent('优化代码')

    expect(haikuCalls.length).toBe(2)
  })
})

describe('normalizeQueryIntent — input capping', () => {
  test('very long CJK input is truncated to 500 chars before sending to Haiku', async () => {
    process.env.SKILL_SEARCH_INTENT_ENABLED = '1'
    const longInput = '优化代码'.repeat(300) // 1200 chars
    haikuResponder = async () => ({
      message: { content: [{ type: 'text', text: 'optimize code' }] },
    })
    await normalizeQueryIntent(longInput)
    expect(haikuCalls[0]?.userPrompt.length).toBeLessThanOrEqual(500)
  })
})
