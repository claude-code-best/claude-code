import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  buildResponsesRequest,
  createOpenAIResponsesStream,
  extractUsage,
} from '../responsesAdapter.js'
import { formatOpenAIPromptCacheKey } from '../openaiShared.js'
import { calculateCacheHitRate } from '../../../../utils/cacheWarning.js'

describe('buildResponsesRequest', () => {
  const promptCacheKey = formatOpenAIPromptCacheKey('session-abc-123')

  test('includes max reasoning effort for ChatGPT Responses requests', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
      reasoningEffort: 'max',
      promptCacheKey,
    })

    expect(request.reasoning).toEqual({ effort: 'max' })
  })

  test('includes reasoning effort for ChatGPT Responses requests', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
      reasoningEffort: 'xhigh',
      promptCacheKey,
    })

    expect(request.reasoning).toEqual({ effort: 'xhigh' })
  })

  test('does not include unsupported max_output_tokens parameter', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
      promptCacheKey,
    }) as Record<string, unknown>

    expect('max_output_tokens' in request).toBe(false)
  })

  test('includes stable prompt_cache_key for session-sticky cache routing', () => {
    const request = buildResponsesRequest({
      model: 'gpt-5.6-sol',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      toolChoice: undefined,
      promptCacheKey,
    })

    expect(request.prompt_cache_key).toBe('ccb:session-abc-123')
  })

  test('prompt_cache_key is stable across turns (not derived from messages)', () => {
    const key = formatOpenAIPromptCacheKey('same-session')
    const turn1 = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'first' }],
      tools: [],
      toolChoice: undefined,
      promptCacheKey: key,
    })
    const turn2 = buildResponsesRequest({
      model: 'gpt-5.5',
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'ok' },
        { role: 'user', content: 'second' },
      ],
      tools: [],
      toolChoice: undefined,
      promptCacheKey: key,
    })

    expect(turn1.prompt_cache_key).toBe(turn2.prompt_cache_key)
    expect(turn1.prompt_cache_key).toBe('ccb:same-session')
  })
})

describe('extractUsage (OpenAI Responses → Anthropic usage)', () => {
  test('subtracts cached_tokens so hit rate uses OpenAI total as denominator', () => {
    const usage = extractUsage({
      usage: {
        input_tokens: 30_000,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: 20_000 },
      },
    })

    expect(usage).toEqual({
      input_tokens: 10_000,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 20_000,
    })

    // Was 40% under the double-count bug; correct is 66.7%.
    const hitRate = calculateCacheHitRate(usage)
    expect(hitRate).toBeCloseTo((20_000 / 30_000) * 100, 5)
  })

  test('full cache hit can report 100% (not capped at 50%)', () => {
    const usage = extractUsage({
      usage: {
        input_tokens: 30_000,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 30_000 },
      },
    })

    expect(usage.input_tokens).toBe(0)
    expect(usage.cache_read_input_tokens).toBe(30_000)
    expect(calculateCacheHitRate(usage)).toBe(100)
  })

  test('maps cache_write_tokens to cache_creation without double-counting total', () => {
    const usage = extractUsage({
      usage: {
        input_tokens: 10_000,
        output_tokens: 10,
        input_tokens_details: {
          cached_tokens: 6_000,
          cache_write_tokens: 2_000,
        },
      },
    })

    expect(usage).toEqual({
      input_tokens: 2_000,
      output_tokens: 10,
      cache_creation_input_tokens: 2_000,
      cache_read_input_tokens: 6_000,
    })
    // segments sum to OpenAI total
    expect(
      usage.input_tokens +
        usage.cache_creation_input_tokens +
        usage.cache_read_input_tokens,
    ).toBe(10_000)
    expect(calculateCacheHitRate(usage)).toBeCloseTo(60, 5)
  })

  test('clamps overlapping write/read that exceed total input', () => {
    const usage = extractUsage({
      usage: {
        input_tokens: 5_000,
        output_tokens: 0,
        input_tokens_details: {
          cached_tokens: 4_000,
          cache_write_tokens: 4_000,
        },
      },
    })

    expect(
      usage.input_tokens +
        usage.cache_creation_input_tokens +
        usage.cache_read_input_tokens,
    ).toBe(5_000)
    expect(usage.cache_read_input_tokens).toBe(4_000)
    expect(usage.cache_creation_input_tokens).toBe(1_000)
    expect(usage.input_tokens).toBe(0)
  })
})

describe('createOpenAIResponsesStream', () => {
  const originalBaseUrl = process.env.OPENAI_BASE_URL
  const originalApiKey = process.env.OPENAI_API_KEY

  beforeEach(() => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example/v1/'
    process.env.OPENAI_API_KEY = 'test-key'
  })

  afterEach(() => {
    if (originalBaseUrl === undefined) delete process.env.OPENAI_BASE_URL
    else process.env.OPENAI_BASE_URL = originalBaseUrl
    if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = originalApiKey
  })

  test('posts API-key Responses requests to the configured responses endpoint', async () => {
    const requests: Request[] = []
    const stream = await createOpenAIResponsesStream({
      request: buildResponsesRequest({
        model: 'gpt-5.6-sol',
        messages: [{ role: 'user', content: 'hello' }],
        tools: [],
        toolChoice: undefined,
        promptCacheKey: 'test-key',
      }),
      signal: new AbortController().signal,
      fetchOverride: (async (input, init) => {
        requests.push(new Request(input, init))
        return new Response(
          'data: {"type":"response.completed","response":{"status":"completed"}}\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } },
        )
      }) as typeof fetch,
    })

    await Array.fromAsync(stream)

    expect(requests[0]?.url).toBe('https://gateway.example/v1/responses')
    expect(requests[0]?.headers.get('Authorization')).toBe('Bearer test-key')
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/json')
    expect(requests[0]?.headers.get('Accept')).toBe('text/event-stream')
    expect(requests[0]?.headers.get('Origin')).toBeNull()
    expect(requests[0]?.headers.get('Referer')).toBeNull()
    expect(requests[0]?.headers.get('OpenAI-Beta')).toBeNull()
    expect(requests[0]?.headers.get('ChatGPT-Account-Id')).toBeNull()
  })

  test('throws an actionable error for a non-success Responses response', async () => {
    await expect(
      createOpenAIResponsesStream({
        request: buildResponsesRequest({
          model: 'gpt-5.6-sol',
          messages: [{ role: 'user', content: 'hello' }],
          tools: [],
          toolChoice: undefined,
          promptCacheKey: 'test-key',
        }),
        signal: new AbortController().signal,
        fetchOverride: (async () =>
          new Response('bad model', {
            status: 400,
          })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow('OpenAI Responses API request failed (400): bad model')
  })
})
