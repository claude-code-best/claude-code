/**
 * Regression: Auto mode classifier sideQuery under ChatGPT OAuth.
 *
 * Bug: sideQueryViaOpenAICompatible always used getOpenAIClient() which only
 * reads OPENAI_API_KEY. With OPENAI_AUTH_MODE=chatgpt and no API key, the
 * classifier got 401 and fail-closed to human confirmation.
 *
 * Fix: when isChatGPTAuthEnabled(), route OpenAI side queries through the
 * ChatGPT Responses + OAuth path used by the main loop.
 *
 * Avoid mocking getAPIProvider (process-global pollution). Select OpenAI via
 * CLAUDE_CODE_USE_OPENAI env. Mock only client + ChatGPT token surface.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
  logEventAsync: async () => {},
  stripProtoFields: <V>(v: V) => v,
  attachAnalyticsSink: () => {},
  _resetForTesting: () => {},
}))

let getOpenAIClientCallCount = 0
let chatCompletionsCreateCount = 0
let lastChatCompletionsArgs: Record<string, unknown> | null = null
let chatCompletionsUsage: Record<string, unknown> = {}

mock.module('src/services/api/openai/client.js', () => ({
  getOpenAIClient: () => {
    getOpenAIClientCallCount++
    return {
      chat: {
        completions: {
          create: async (args: Record<string, unknown>) => {
            chatCompletionsCreateCount++
            lastChatCompletionsArgs = args
            return {
              id: 'chatcmpl_test',
              choices: [
                {
                  finish_reason: 'tool_calls',
                  message: {
                    content: null,
                    tool_calls: [
                      {
                        type: 'function',
                        id: 'call_api_key',
                        function: {
                          name: 'classify_result',
                          arguments: JSON.stringify({ shouldBlock: false }),
                        },
                      },
                    ],
                  },
                },
              ],
              usage: chatCompletionsUsage,
            }
          },
        },
      },
    }
  },
  clearOpenAIClientCache: () => {},
}))

// Keep isChatGPTAuthEnabled env-driven (same as production) so other suite
// files are not forced into ChatGPT mode.
mock.module('src/services/api/openai/chatgptAuth.js', () => ({
  isChatGPTAuthEnabled: () => process.env.OPENAI_AUTH_MODE === 'chatgpt',
  getValidChatGPTAuth: async () => ({
    accessToken: 'test-access-token-not-real',
    accountId: 'acct_test',
  }),
  removeChatGPTAuth: async () => {},
  requestChatGPTDeviceCode: async () => {
    throw new Error('not used')
  },
  completeChatGPTDeviceLogin: async () => {
    throw new Error('not used')
  },
}))

type CapturedFetch = {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}
let capturedFetch: CapturedFetch | null = null
let originalFetch: typeof globalThis.fetch

const ENV_KEYS = [
  'CLAUDE_CODE_USE_OPENAI',
  'CLAUDE_CODE_USE_GROK',
  'CLAUDE_CODE_USE_GEMINI',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'OPENAI_AUTH_MODE',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
] as const

const savedEnv: Record<string, string | undefined> = {}

function buildFunctionCallSse(toolName: string, argsJson: string): string {
  return [
    `data: ${JSON.stringify({
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        type: 'function_call',
        call_id: 'call_chatgpt_1',
        name: toolName,
      },
    })}`,
    '',
    `data: ${JSON.stringify({
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: argsJson,
    })}`,
    '',
    `data: ${JSON.stringify({
      type: 'response.output_item.done',
      output_index: 0,
    })}`,
    '',
    `data: ${JSON.stringify({
      type: 'response.completed',
      response: {
        status: 'completed',
        usage: { input_tokens: 11, output_tokens: 7 },
      },
    })}`,
    '',
    '',
  ].join('\n')
}

function enableOpenAIProvider(): void {
  process.env.CLAUDE_CODE_USE_OPENAI = '1'
  delete process.env.CLAUDE_CODE_USE_GROK
  delete process.env.CLAUDE_CODE_USE_GEMINI
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.CLAUDE_CODE_USE_FOUNDRY
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
  }
  getOpenAIClientCallCount = 0
  chatCompletionsCreateCount = 0
  lastChatCompletionsArgs = null
  chatCompletionsUsage = { prompt_tokens: 3, completion_tokens: 2 }
  capturedFetch = null
  enableOpenAIProvider()
  originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers: Record<string, string> = {}
    const rawHeaders = init?.headers
    if (
      rawHeaders &&
      typeof rawHeaders === 'object' &&
      !Array.isArray(rawHeaders)
    ) {
      for (const [k, v] of Object.entries(
        rawHeaders as Record<string, string>,
      )) {
        headers[k] = v
      }
    }
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : {}
    capturedFetch = { url, headers, body }
    return new Response(
      buildFunctionCallSse(
        'classify_result',
        '{"shouldBlock":false,"reason":"ok"}',
      ),
      {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    )
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const key of ENV_KEYS) {
    const value = savedEnv[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const classifierTool = {
  name: 'classify_result',
  description: 'Classify the action',
  input_schema: {
    type: 'object',
    properties: {
      shouldBlock: { type: 'boolean' },
      reason: { type: 'string' },
    },
  },
}

describe('sideQuery OpenAI ChatGPT OAuth path', () => {
  test('uses ChatGPT Responses + OAuth, not empty-key Chat Completions', async () => {
    process.env.OPENAI_AUTH_MODE = 'chatgpt'
    delete process.env.OPENAI_API_KEY
    const { sideQuery } = await import('../sideQuery.js')

    const result = await sideQuery({
      querySource: 'auto_mode',
      model: 'gpt-5.5',
      system: 'You are a classifier.',
      messages: [{ role: 'user', content: 'classify this action' }],
      tools: [classifierTool as never],
      tool_choice: { type: 'tool', name: 'classify_result' },
      max_tokens: 256,
    })

    expect(getOpenAIClientCallCount).toBe(0)
    expect(chatCompletionsCreateCount).toBe(0)
    expect(capturedFetch).not.toBeNull()
    expect(capturedFetch!.url).toContain(
      'chatgpt.com/backend-api/codex/responses',
    )
    // OAuth header present; do not assert the real token value.
    expect(capturedFetch!.headers.Authorization).toMatch(/^Bearer \S+/)
    expect(capturedFetch!.headers['ChatGPT-Account-Id']).toBe('acct_test')
    expect(capturedFetch!.body.stream).toBe(true)
    expect(capturedFetch!.body.model).toBe('gpt-5.5')
    expect(Array.isArray(capturedFetch!.body.tools)).toBe(true)
    expect(capturedFetch!.body.tool_choice).toEqual({
      type: 'function',
      name: 'classify_result',
    })

    const toolUse = result.content.find(
      (
        b,
      ): b is {
        type: 'tool_use'
        id: string
        name: string
        input: unknown
      } => b.type === 'tool_use',
    )
    expect(toolUse).toBeDefined()
    expect(toolUse!.name).toBe('classify_result')
    expect(toolUse!.input).toEqual({ shouldBlock: false, reason: 'ok' })
    expect(result.stop_reason).toBe('tool_use')
    expect(result.usage.input_tokens).toBe(11)
    expect(result.usage.output_tokens).toBe(7)
  })

  test('official API key mode uses a session cache key and normalized usage', async () => {
    delete process.env.OPENAI_AUTH_MODE
    delete process.env.OPENAI_BASE_URL
    process.env.OPENAI_API_KEY = 'sk-test-not-real'
    chatCompletionsUsage = {
      prompt_tokens: 1000,
      completion_tokens: 50,
      prompt_tokens_details: {
        cached_tokens: 600,
        cache_write_tokens: 250,
      },
    }
    const { sideQuery } = await import('../sideQuery.js')

    const result = await sideQuery({
      querySource: 'auto_mode',
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [classifierTool as never],
      tool_choice: { type: 'tool', name: 'classify_result' },
    })

    expect(getOpenAIClientCallCount).toBe(1)
    expect(chatCompletionsCreateCount).toBe(1)
    expect(capturedFetch).toBeNull()
    expect(lastChatCompletionsArgs?.model).toBe('gpt-4o')
    expect(lastChatCompletionsArgs?.prompt_cache_key).toMatch(/^ccb:/)

    const toolUse = result.content.find(b => b.type === 'tool_use') as
      | { type: 'tool_use'; name: string; input: unknown }
      | undefined
    expect(toolUse?.name).toBe('classify_result')
    expect(toolUse?.input).toEqual({ shouldBlock: false })
    expect(result.usage.input_tokens).toBe(150)
    expect(result.usage.cache_read_input_tokens).toBe(600)
    expect(result.usage.cache_creation_input_tokens).toBe(250)
  })

  test('compatible API key mode omits official cache fields', async () => {
    delete process.env.OPENAI_AUTH_MODE
    process.env.OPENAI_BASE_URL = 'https://api.deepseek.com/v1'
    process.env.OPENAI_API_KEY = 'sk-test-not-real'
    chatCompletionsUsage = {
      prompt_tokens: 1000,
      completion_tokens: 50,
      prompt_tokens_details: {
        cached_tokens: 600,
        cache_write_tokens: 250,
      },
    }
    const { sideQuery } = await import('../sideQuery.js')

    const result = await sideQuery({
      querySource: 'auto_mode',
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(lastChatCompletionsArgs).not.toBeNull()
    expect('prompt_cache_key' in lastChatCompletionsArgs!).toBe(false)
    expect(result.usage.input_tokens).toBe(400)
    expect(result.usage.cache_read_input_tokens).toBe(600)
    expect(result.usage.cache_creation_input_tokens).toBe(0)
  })

  test('ChatGPT OAuth request failure propagates for fail-closed classifiers', async () => {
    process.env.OPENAI_AUTH_MODE = 'chatgpt'
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'unauthorized' } }), {
        status: 401,
        statusText: 'Unauthorized',
      })) as unknown as typeof fetch

    const { sideQuery } = await import('../sideQuery.js')

    await expect(
      sideQuery({
        querySource: 'auto_mode',
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'classify' }],
        tools: [classifierTool as never],
        tool_choice: { type: 'tool', name: 'classify_result' },
      }),
    ).rejects.toThrow(/ChatGPT Responses API request failed \(401\)/)
    expect(getOpenAIClientCallCount).toBe(0)
  })
})
