import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import type { Response, ResponseStreamEvent } from 'openai/resources/responses/responses.mjs'
import { asSystemPrompt } from '../../../../utils/systemPromptType.js'

type StreamRun = {
  events?: ResponseStreamEvent[]
  finalResponse?: Response
  error?: unknown
}

let streamRuns: StreamRun[] = []
let createRuns: StreamRun[] = []
let lastRequestBody: any
let lastCreateRequestBody: any

function makeResponse(overrides: Partial<Response> = {}): Response {
  return {
    id: 'resp_test',
    object: 'response',
    created_at: 0,
    status: 'completed',
    model: 'gpt-5.4',
    output: [],
    parallel_tool_calls: false,
    store: false,
    temperature: 1,
    tool_choice: 'auto',
    top_p: 1,
    truncation: 'disabled',
    usage: {
      input_tokens: 12,
      output_tokens: 8,
      total_tokens: 20,
      input_tokens_details: {
        cached_tokens: 0,
      },
      output_tokens_details: {
        reasoning_tokens: 0,
      },
    },
    ...overrides,
  } as Response
}

function makeStream(run: StreamRun) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of run.events ?? []) {
        yield event
      }
    },
    finalResponse: async () => {
      if (run.error) {
        throw run.error
      }
      return run.finalResponse ?? makeResponse()
    },
  }
}

function makeCreateStream(run: StreamRun) {
  return {
    async *[Symbol.asyncIterator]() {
      if (run.error) {
        throw run.error
      }
      for (const event of run.events ?? []) {
        yield event
      }
    },
  }
}

mock.module('../client.js', () => ({
  getCodexClient: () => ({
    responses: {
      stream: (body: any) => {
        lastRequestBody = body
        const run = streamRuns.shift()
        if (!run) {
          throw new Error('unexpected stream call')
        }
        if (run.error && !run.events) {
          throw run.error
        }
        return makeStream(run)
      },
      create: async (body: any) => {
        lastCreateRequestBody = body
        const run = createRuns.shift()
        if (!run) {
          throw new Error('unexpected create call')
        }
        return makeCreateStream(run)
      },
    },
  }),
}))

// Mock only model resolution — conversion functions can use real implementations
// since the client mock controls API responses.
mock.module('@ant/model-provider', () => {
  // Import the real module to preserve conversion functions
  const real = require('@ant/model-provider')
  return {
    ...real,
    resolveCodexModel: () => 'gpt-5.4',
    resolveCodexMaxTokens: () => 4096,
  }
})

mock.module('../../../../utils/context.js', () => ({
  MODEL_CONTEXT_WINDOW_DEFAULT: 200_000,
  COMPACT_MAX_OUTPUT_TOKENS: 20_000,
  CAPPED_DEFAULT_MAX_TOKENS: 8_000,
  ESCALATED_MAX_TOKENS: 64_000,
  is1mContextDisabled: () => false,
  has1mContext: () => false,
  modelSupports1M: () => false,
  getContextWindowForModel: () => 200_000,
  getSonnet1mExpTreatmentEnabled: () => false,
  calculateContextPercentages: () => ({}),
  getModelMaxOutputTokens: () => ({ upperLimit: 4096 }),
  getMaxThinkingTokensForModel: () => 0,
}))

mock.module('../../../../utils/api.js', () => ({
  toolToAPISchema: async () => ({}),
  appendSystemContext: () => {},
  prependUserContext: () => {},
  logAPIPrefix: () => {},
  splitSysPromptPrefix: () => ({ prefix: '', rest: [] }),
  logContextMetrics: async () => {},
  normalizeToolInput: (input: any) => input,
  normalizeToolInputForAPI: (input: any) => input,
}))

mock.module('src/utils/debug.ts', () => ({
  getMinDebugLogLevel: () => 'debug' as const,
  isDebugMode: () => false,
  enableDebugLogging: () => false,
  getDebugFilter: () => null,
  isDebugToStdErr: () => false,
  getDebugFilePath: () => null as string | null,
  setHasFormattedOutput: () => {},
  getHasFormattedOutput: () => false,
  flushDebugLogs: async () => {},
  logForDebugging: () => {},
  getDebugLogPath: () => '/tmp/mock-debug.log',
  logAntError: () => {},
}))

mock.module('../../../../services/langfuse/tracing.js', () => ({
  createTrace: () => null,
  recordLLMObservation: () => {},
  recordToolObservation: () => {},
  createToolBatchSpan: () => null,
  endToolBatchSpan: () => {},
  createSubagentTrace: () => null,
  createChildSpan: () => null,
  endTrace: () => {},
}))

mock.module('../../../../services/langfuse/convert.js', () => ({
  convertMessagesToLangfuse: () => [],
  convertOutputToLangfuse: () => [],
  convertToolsToLangfuse: () => [],
}))

async function runQuery(
  nextStreamRuns: StreamRun[],
  nextCreateRuns: StreamRun[] = [],
  systemPrompt = asSystemPrompt([]),
) {
  streamRuns = [...nextStreamRuns]
  createRuns = [...nextCreateRuns]

  const { queryModelCodex } = await import('../index.js')
  const assistantMessages: any[] = []
  const streamEvents: any[] = []

  const options: any = {
    model: 'gpt-5.4',
    agents: [],
    querySource: 'main_loop',
    getToolPermissionContext: async () => ({
      alwaysAllow: [],
      alwaysDeny: [],
      needsPermission: [],
      mode: 'default',
      isBypassingPermissions: false,
    }),
  }

  for await (const item of queryModelCodex(
    [],
    systemPrompt,
    [],
    new AbortController().signal,
    options,
  )) {
    if (item.type === 'assistant') {
      assistantMessages.push(item)
    } else if (item.type === 'stream_event') {
      streamEvents.push(item)
    }
  }

  return { assistantMessages, streamEvents }
}

describe('queryModelCodex streaming fallback', () => {
  const originalCodexApiKey = process.env.CODEX_API_KEY

  beforeEach(() => {
    process.env.CODEX_API_KEY = 'test-key'
  })

  afterEach(() => {
    streamRuns = []
    createRuns = []
    lastRequestBody = undefined
    lastCreateRequestBody = undefined
    if (originalCodexApiKey === undefined) {
      delete process.env.CODEX_API_KEY
    } else {
      process.env.CODEX_API_KEY = originalCodexApiKey
    }
  })

  test('builds the final assistant text from streamed blocks when final snapshots are empty', async () => {
    const response = makeResponse()
    const events: ResponseStreamEvent[] = [
      { type: 'response.created', response } as any,
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          content: [],
          status: 'in_progress',
        },
      } as any,
      {
        type: 'response.output_text.delta',
        output_index: 0,
        item_id: 'msg_1',
        delta: 'hello',
      } as any,
      {
        type: 'response.output_text.done',
        output_index: 0,
        item_id: 'msg_1',
        text: 'hello world',
      } as any,
      { type: 'response.completed', response } as any,
    ]

    const { assistantMessages, streamEvents } = await runQuery([
      { events, finalResponse: response },
    ])

    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0].message.content).toEqual([
      { type: 'text', text: 'hello world' },
    ])
    expect(assistantMessages[0].message.stop_reason).toBe('end_turn')
    expect(
      streamEvents.find((item: any) => item.event.type === 'message_delta')?.event.delta
        .stop_reason,
    ).toBe('end_turn')
  })

  test('builds tool_use blocks from streamed arguments when final snapshots are empty', async () => {
    const response = makeResponse()
    const events: ResponseStreamEvent[] = [
      { type: 'response.created', response } as any,
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'function_call',
          id: 'fc_1',
          call_id: 'call_1',
          name: 'Read',
          arguments: '',
          status: 'in_progress',
        },
      } as any,
      {
        type: 'response.function_call_arguments.delta',
        output_index: 0,
        item_id: 'fc_1',
        delta: '{"file_path":"README.md"}',
      } as any,
      {
        type: 'response.function_call_arguments.done',
        output_index: 0,
        item_id: 'fc_1',
        arguments: '{"file_path":"README.md"}',
      } as any,
      { type: 'response.completed', response } as any,
    ]

    const { assistantMessages, streamEvents } = await runQuery([
      { events, finalResponse: response },
    ])

    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0].message.content).toEqual([
      {
        type: 'tool_use',
        id: 'call_1',
        name: 'Read',
        input: { file_path: 'README.md' },
      },
    ])
    expect(assistantMessages[0].message.stop_reason).toBe('tool_use')
    expect(
      streamEvents.find((item: any) => item.event.type === 'message_delta')?.event.delta
        .stop_reason,
    ).toBe('tool_use')
  })

  test('sends system prompt via top-level instructions instead of system messages', async () => {
    const response = makeResponse({
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'ok' }],
          status: 'completed',
        } as any,
      ],
      output_text: 'ok',
    })

    const events: ResponseStreamEvent[] = [
      { type: 'response.created', response } as any,
      { type: 'response.completed', response } as any,
    ]

    await runQuery(
      [{ events, finalResponse: response }],
      [],
      asSystemPrompt(['system one', 'system two']),
    )

    expect(lastRequestBody.instructions).toBe('system one\n\nsystem two')
    expect(lastRequestBody.input).toEqual([])
  })

  test('continues incomplete responses and aggregates usage across attempts', async () => {
    const incompleteResponse = makeResponse({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' } as any,
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
        input_tokens_details: { cached_tokens: 1 },
        output_tokens_details: { reasoning_tokens: 0 },
      } as any,
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'hello ' }],
          status: 'incomplete',
        } as any,
      ],
    })
    const completedResponse = makeResponse({
      usage: {
        input_tokens: 20,
        output_tokens: 6,
        total_tokens: 26,
        input_tokens_details: { cached_tokens: 2 },
        output_tokens_details: { reasoning_tokens: 0 },
      } as any,
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'world' }],
          status: 'completed',
        } as any,
      ],
    })

    const { assistantMessages } = await runQuery([
      {
        events: [
          { type: 'response.created', response: incompleteResponse } as any,
          { type: 'response.incomplete', response: incompleteResponse } as any,
        ],
        finalResponse: incompleteResponse,
      },
      {
        events: [
          { type: 'response.created', response: completedResponse } as any,
          { type: 'response.completed', response: completedResponse } as any,
        ],
        finalResponse: completedResponse,
      },
    ])

    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0].message.content).toEqual([
      { type: 'text', text: 'hello world' },
    ])
    expect(assistantMessages[0].message.usage).toMatchObject({
      input_tokens: 30,
      output_tokens: 10,
      cache_read_input_tokens: 3,
    })
  })

  test('falls back to responses.create(stream:true) when helper streaming fails', async () => {
    const fallbackResponse = makeResponse({
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'fallback ok' }],
          status: 'completed',
        } as any,
      ],
    })

    const { assistantMessages } = await runQuery(
      [{ error: new Error('helper stream failed') }],
      [
        {
          events: [
            { type: 'response.created', response: fallbackResponse } as any,
            { type: 'response.completed', response: fallbackResponse } as any,
          ],
        },
      ],
    )

    expect(lastCreateRequestBody.stream).toBe(true)
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0].message.content).toEqual([
      { type: 'text', text: 'fallback ok' },
    ])
  })
})
