import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildOpenAIResponsesRequestBody,
  getOpenAIPromptCacheRetention,
} from '../responsesRequestBody.js'

const originalBaseURL = process.env.OPENAI_BASE_URL
const originalRetention = process.env.OPENAI_PROMPT_CACHE_RETENTION

afterEach(() => {
  if (originalBaseURL === undefined) {
    delete process.env.OPENAI_BASE_URL
  } else {
    process.env.OPENAI_BASE_URL = originalBaseURL
  }

  if (originalRetention === undefined) {
    delete process.env.OPENAI_PROMPT_CACHE_RETENTION
  } else {
    process.env.OPENAI_PROMPT_CACHE_RETENTION = originalRetention
  }
})

describe('buildOpenAIResponsesRequestBody', () => {
  test('includes cache and encrypted reasoning fields for GPT-5.4', () => {
    process.env.OPENAI_BASE_URL = 'https://code.ylsagi.com/codex'
    const body = buildOpenAIResponsesRequestBody({
      model: 'gpt-5.4',
      instructions: 'Be helpful',
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
      tools: [{ type: 'function', name: 'bash', description: 'Run bash', parameters: { type: 'object' } }],
      toolChoice: { type: 'function', name: 'bash' },
      maxTokens: 123,
      effort: 'max',
    })

    expect(body.store).toBe(false)
    expect(body.include).toEqual(['reasoning.encrypted_content'])
    expect(body.prompt_cache_retention).toBe('24h')
    expect(String(body.prompt_cache_key)).toMatch(/^ccb:/)
    expect(body.reasoning).toEqual({ effort: 'xhigh' })
    expect(body.max_output_tokens).toBe(123)
  })

  test('defaults non GPT-5.4 models to in_memory retention', () => {
    delete process.env.OPENAI_PROMPT_CACHE_RETENTION
    expect(getOpenAIPromptCacheRetention('gpt-4o')).toBe('in_memory')
  })
})
