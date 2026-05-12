import { describe, expect, test } from 'bun:test'
import { buildResponsesRequest } from '../responsesAdapter.js'

describe('buildResponsesRequest', () => {
  test('includes reasoning effort for ChatGPT Responses requests', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
      reasoningEffort: 'xhigh',
    })

    expect(request.reasoning).toEqual({ effort: 'xhigh' })
  })

  test('does not include unsupported max_output_tokens parameter', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
    }) as Record<string, unknown>

    expect('max_output_tokens' in request).toBe(false)
  })
})
