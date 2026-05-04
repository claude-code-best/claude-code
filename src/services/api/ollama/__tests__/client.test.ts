import { afterEach, describe, expect, test } from 'bun:test'
import {
  clearOllamaClientCache,
  getOllamaContextLength,
  listOllamaModels,
  showOllamaModel,
} from '../client.js'
import {
  extractOllamaModelInfoContextLength,
  extractOllamaNumCtxParameter,
} from '../context.js'

const originalApiKey = process.env.OLLAMA_API_KEY
const originalBaseUrl = process.env.OLLAMA_BASE_URL

afterEach(() => {
  clearOllamaClientCache()
  if (originalApiKey === undefined) {
    delete process.env.OLLAMA_API_KEY
  } else {
    process.env.OLLAMA_API_KEY = originalApiKey
  }
  if (originalBaseUrl === undefined) {
    delete process.env.OLLAMA_BASE_URL
  } else {
    process.env.OLLAMA_BASE_URL = originalBaseUrl
  }
})

describe('listOllamaModels', () => {
  test('lists models via native /api/tags', async () => {
    process.env.OLLAMA_BASE_URL = 'https://ollama.com'
    process.env.OLLAMA_API_KEY = 'test-key'
    let requestUrl = ''
    let authorization = ''

    const models = await listOllamaModels({
      fetchOverride: (async (input, init) => {
        requestUrl = String(input)
        authorization = new Headers(init?.headers).get('Authorization') ?? ''
        return new Response(
          JSON.stringify({
            models: [{ name: 'gpt-oss:120b' }, { name: 'qwen3-coder' }],
          }),
        )
      }) as typeof fetch,
    })

    expect(requestUrl).toBe('https://ollama.com/api/tags')
    expect(authorization).toBe('Bearer test-key')
    expect(models.map(model => model.name)).toEqual([
      'gpt-oss:120b',
      'qwen3-coder',
    ])
  })
})

describe('showOllamaModel', () => {
  test('fetches model details via native /api/show', async () => {
    process.env.OLLAMA_BASE_URL = 'https://ollama.com'
    process.env.OLLAMA_API_KEY = 'test-key'
    let requestUrl = ''
    let requestBody: Record<string, unknown> | undefined

    const details = await showOllamaModel('qwen3-coder', {
      fetchOverride: (async (input, init) => {
        requestUrl = String(input)
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(
          JSON.stringify({
            model_info: { 'qwen3.context_length': 262144 },
          }),
        )
      }) as typeof fetch,
    })

    expect(requestUrl).toBe('https://ollama.com/api/show')
    expect(requestBody).toEqual({ model: 'qwen3-coder', verbose: true })
    expect(details.model_info?.['qwen3.context_length']).toBe(262144)
  })

  test('extracts context length from model_info and num_ctx parameters', () => {
    expect(
      extractOllamaModelInfoContextLength({
        'qwen3.context_length': 262144,
      }),
    ).toBe(262144)
    expect(
      extractOllamaModelInfoContextLength({
        'llama.context_length': '131072',
      }),
    ).toBe(131072)
    expect(extractOllamaNumCtxParameter('temperature 0.7\nnum_ctx 65536')).toBe(
      65536,
    )
  })

  test('caches context length after /api/show', async () => {
    let calls = 0
    const fetchOverride = (async () => {
      calls += 1
      return new Response(
        JSON.stringify({
          model_info: { 'qwen3.context_length': 262144 },
        }),
      )
    }) as unknown as typeof fetch

    expect(
      await getOllamaContextLength({ model: 'qwen3-coder', fetchOverride }),
    ).toBe(262144)
    expect(
      await getOllamaContextLength({ model: 'qwen3-coder', fetchOverride }),
    ).toBe(262144)
    expect(calls).toBe(1)
  })
})
