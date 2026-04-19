import { afterEach, describe, expect, test } from 'bun:test'
import { is1PApiCustomer } from '../auth.js'

describe('is1PApiCustomer', () => {
  const originalOpenAI = process.env.CLAUDE_CODE_USE_OPENAI
  const originalGemini = process.env.CLAUDE_CODE_USE_GEMINI
  const originalGrok = process.env.CLAUDE_CODE_USE_GROK

  afterEach(() => {
    if (originalOpenAI === undefined) {
      delete process.env.CLAUDE_CODE_USE_OPENAI
    } else {
      process.env.CLAUDE_CODE_USE_OPENAI = originalOpenAI
    }
    if (originalGemini === undefined) {
      delete process.env.CLAUDE_CODE_USE_GEMINI
    } else {
      process.env.CLAUDE_CODE_USE_GEMINI = originalGemini
    }
    if (originalGrok === undefined) {
      delete process.env.CLAUDE_CODE_USE_GROK
    } else {
      process.env.CLAUDE_CODE_USE_GROK = originalGrok
    }
  })

  test('returns false for openai provider', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    delete process.env.CLAUDE_CODE_USE_GEMINI
    delete process.env.CLAUDE_CODE_USE_GROK
    expect(is1PApiCustomer()).toBe(false)
  })
})
