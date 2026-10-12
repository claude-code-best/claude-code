import { describe, test, expect } from 'bun:test'
import { mock } from 'bun:test'
import { z } from 'zod/v4'
import { logMock } from '../../../../../../tests/mocks/log'
import { debugMock } from '../../../../../../tests/mocks/debug'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

// Mock all heavy dependencies before importing ExecuteTool
mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => false,
  checkStatsigFeatureGate_CACHED_MAY_BE_STALE: () => false,
  getFeatureValue_DEPRECATED: async () => undefined,
  getFeatureValue_CACHED_WITH_REFRESH: async () => undefined,
  hasGrowthBookEnvOverride: () => false,
  getAllGrowthBookFeatures: () => ({}),
  getGrowthBookConfigOverrides: () => ({}),
  setGrowthBookConfigOverride: () => {},
  clearGrowthBookConfigOverrides: () => {},
  getApiBaseUrlHost: () => undefined,
  onGrowthBookRefresh: () => {},
  initializeGrowthBook: async () => {},
  checkSecurityRestrictionGate: async () => false,
  checkGate_CACHED_OR_BLOCKING: async () => false,
  refreshGrowthBookAfterAuthChange: () => {},
  resetGrowthBook: () => {},
  refreshGrowthBookFeatures: async () => {},
  setupPeriodicGrowthBookRefresh: () => {},
  stopPeriodicGrowthBookRefresh: () => {},
}))

mock.module('src/utils/searchExtraTools.js', () => ({
  isSearchExtraToolsEnabledOptimistic: () => true,
  getAutoSearchExtraToolsCharThreshold: () => 100,
  getSearchExtraToolsMode: () => 'tst' as const,
  isSearchExtraToolsToolAvailable: () => true,
  isSearchExtraToolsEnabled: async () => true,
  isToolReferenceBlock: () => false,
  // Mark every name as discovered so tests can exercise tools other than
  // TestTool/SecretTool without being blocked by the discovery guard.
  extractDiscoveredToolNames: () =>
    new Set([
      'TestTool',
      'SecretTool',
      'CronCreate',
      'WithDefaults',
      'McpTool',
    ]),
  isDeferredToolsDeltaEnabled: () => false,
  getDeferredToolsDelta: () => null,
}))

mock.module('src/constants/tools.js', () => ({
  CORE_TOOLS: new Set(['ExecuteExtraTool', 'SearchExtraTools']),
}))

// Mock messages module
mock.module('src/utils/messages.js', () => ({
  createUserMessage: ({ content }: { content: string }) => ({
    type: 'user' as const,
    content,
    uuid: 'test-uuid',
  }),
  INTERRUPT_MESSAGE_FOR_TOOL_USE: '[Request interrupted]',
}))

const { ExecuteTool } = await import('../ExecuteTool.js')
const { EXECUTE_TOOL_NAME } = await import('../constants.js')

function makeContext(tools: unknown[] = []) {
  return {
    options: {
      tools,
    },
    cwd: '/tmp',
    sessionId: 'test',
  } as never
}

function makeMockTool(name: string, callResult: unknown = 'ok') {
  return {
    name,
    call: async () => ({ data: callResult }),
    checkPermissions: async () => ({ behavior: 'allow' as const }),
    prompt: async () => `Description for ${name}`,
    description: async () => `Description for ${name}`,
    inputSchema: {},
    isEnabled: () => true,
    isConcurrencySafe: () => true,
    isReadOnly: () => false,
    isMcp: false,
    alwaysLoad: undefined,
    shouldDefer: undefined,
    searchHint: '',
    userFacingName: () => name,
    renderToolUseMessage: () => `Running ${name}`,
    mapToolResultToToolResultBlockParam: (content: unknown, id: string) => ({
      tool_use_id: id,
      type: 'tool_result',
      content,
    }),
  }
}

/**
 * Builds a mock tool with a real zod inputSchema, mirroring how actual
 * deferred tools (e.g. CronCreateTool) expose their schema. Records the
 * params that reach call() so tests can assert what was delegated.
 */
/**
 * Builds a mock tool that advertises a raw JSON Schema via inputJSONSchema,
 * mirroring how MCP tools expose their parameter schema (client.ts sets
 * inputJSONSchema: tool.inputSchema while inputSchema stays a passthrough zod
 * object). Records params that reach call().
 */
function makeMockMcpTool(
  name: string,
  inputJSONSchema: Record<string, unknown>,
  callResult: unknown = { result: 'ok' },
) {
  const calls: Record<string, unknown>[] = []
  return {
    tool: {
      name,
      isMcp: true,
      inputSchema: z.object({}).passthrough(),
      inputJSONSchema,
      call: async (input: Record<string, unknown>) => {
        calls.push(input)
        return { data: callResult }
      },
      checkPermissions: async () => ({ behavior: 'allow' as const }),
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => false,
      userFacingName: () => name,
      renderToolUseMessage: () => `Running ${name}`,
      mapToolResultToToolResultBlockParam: (content: unknown, id: string) => ({
        tool_use_id: id,
        type: 'tool_result',
        content,
      }),
    },
    calls,
  }
}

function makeMockToolWithSchema(
  name: string,
  schema: z.ZodType,
  opts: {
    validateInput?: (input: Record<string, unknown>) => {
      result: boolean
      message?: string
    }
  } = {},
) {
  const calls: Record<string, unknown>[] = []
  return {
    tool: {
      name,
      inputSchema: schema,
      call: async (input: Record<string, unknown>) => {
        calls.push(input)
        return { data: { ok: true, received: input } }
      },
      validateInput: opts.validateInput,
      checkPermissions: async () => ({ behavior: 'allow' as const }),
      isEnabled: () => true,
      isConcurrencySafe: () => true,
      isReadOnly: () => false,
      isMcp: false,
      userFacingName: () => name,
      renderToolUseMessage: () => `Running ${name}`,
      mapToolResultToToolResultBlockParam: (content: unknown, id: string) => ({
        tool_use_id: id,
        type: 'tool_result',
        content,
      }),
    },
    calls,
  }
}

describe('ExecuteTool', () => {
  test('executes a target tool by name', async () => {
    const mockTarget = makeMockTool('TestTool', { result: 'success' })
    const ctx = makeContext([mockTarget])

    const result = await ExecuteTool.call(
      { tool_name: 'TestTool', params: {} },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data).toEqual({
      result: { result: 'success' },
      tool_name: 'TestTool',
    })
  })

  test('returns error when tool not found', async () => {
    const ctx = makeContext([])

    const result = await ExecuteTool.call(
      { tool_name: 'NonexistentTool', params: {} },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data).toEqual({
      result: null,
      tool_name: 'NonexistentTool',
    })
    expect(result.newMessages).toBeDefined()
    expect(result.newMessages!.length).toBeGreaterThan(0)
  })

  test('returns permission denied when target denies', async () => {
    const mockTarget = makeMockTool('SecretTool', 'secret')
    mockTarget.checkPermissions = async () =>
      ({
        behavior: 'deny' as const,
        message: 'Access denied',
      }) as never
    const ctx = makeContext([mockTarget])

    const result = await ExecuteTool.call(
      { tool_name: 'SecretTool', params: {} },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data).toEqual({
      result: null,
      tool_name: 'SecretTool',
    })
    expect(result.newMessages).toBeDefined()
  })

  test('returns error when deferred tool has not been discovered via SearchExtraTools', async () => {
    const mockTarget = makeMockTool('UndiscoveredTool', 'result')
    const ctx = makeContext([mockTarget])

    const result = await ExecuteTool.call(
      { tool_name: 'UndiscoveredTool', params: {} },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data).toEqual({
      result: null,
      tool_name: 'UndiscoveredTool',
    })
    expect(result.newMessages).toBeDefined()
    expect(result.newMessages![0].content).toContain('has not been discovered')
  })

  test('has correct name', () => {
    expect(ExecuteTool.name).toBe(EXECUTE_TOOL_NAME)
  })

  test('searchHint contains keywords', () => {
    expect(ExecuteTool.searchHint).toContain('execute')
    expect(ExecuteTool.searchHint).toContain('tool')
  })

  test('schema-validates params against target tool before delegating', async () => {
    // Reproduces the CronCreate bug class: model passes 'schedule' but the
    // schema requires 'cron'. Without the pre-validation, params reach
    // validateInput with cron=undefined and crash on .trim().
    const { tool, calls } = makeMockToolWithSchema(
      'CronCreate',
      z.strictObject({
        cron: z.string(),
        prompt: z.string(),
      }),
      {
        validateInput: input => {
          // Mirrors CronCreateTool.validateInput pre-fix behavior — would
          // crash on undefined.trim() if schema pre-validation lets bad
          // params through. The guard in ExecuteTool must prevent this.
          const cron = input.cron as string | undefined
          if (typeof cron !== 'string') {
            throw new TypeError(
              "undefined is not an object (evaluating 'cron.trim')",
            )
          }
          return { result: true }
        },
      },
    )
    const ctx = makeContext([tool])

    const result = await ExecuteTool.call(
      {
        tool_name: 'CronCreate',
        params: { schedule: '*/5 * * * *', prompt: 'hi' },
      },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    // Schema validation rejects the wrong field name and returns a model-
    // friendly error instead of crashing.
    expect(result.data).toEqual({
      result: null,
      tool_name: 'CronCreate',
    })
    expect(result.newMessages).toBeDefined()
    const message = result.newMessages![0].content as string
    // Model gets told both what was missing and what was unexpected.
    expect(message).toMatch(/cron/i)
    expect(message).toMatch(/schedule/i)
    // validateInput was never called, so no crash reached it.
    expect(calls.length).toBe(0)
  })

  test('passes through parsed params to target tool, applying schema defaults', async () => {
    const { tool, calls } = makeMockToolWithSchema(
      'WithDefaults',
      z.strictObject({
        cron: z.string(),
        prompt: z.string(),
        recurring: z.boolean().default(true),
      }),
    )
    const ctx = makeContext([tool])

    const result = await ExecuteTool.call(
      {
        // recurring intentionally omitted — schema default must fill it in.
        tool_name: 'WithDefaults',
        params: { cron: '*/5 * * * *', prompt: 'hi' },
      },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data).toEqual({
      result: {
        ok: true,
        received: { cron: '*/5 * * * *', prompt: 'hi', recurring: true },
      },
      tool_name: 'WithDefaults',
    })
    expect(calls.length).toBe(1)
    // .default() applied — target tool sees recurring: true without
    // needing to defend against undefined itself.
    expect(calls[0]).toEqual({
      cron: '*/5 * * * *',
      prompt: 'hi',
      recurring: true,
    })
  })

  test('validates MCP params against inputJSONSchema and rejects a renamed field', async () => {
    // The tool declares property 'q' but the model sends a differently named
    // key. Before this guard the params were forwarded verbatim to the server,
    // which failed opaquely. Now the call is rejected in the client with an
    // error that names the expected property.
    const { tool, calls } = makeMockMcpTool('McpTool', {
      type: 'object',
      properties: { q: { type: 'string' } },
      required: ['q'],
    })
    const ctx = makeContext([tool])

    const result = await ExecuteTool.call(
      { tool_name: 'McpTool', params: { query: 'hello' } },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data).toEqual({ result: null, tool_name: 'McpTool' })
    expect(result.newMessages).toBeDefined()
    const message = result.newMessages![0].content as string
    expect(message).toMatch(/\bq\b/)
    expect(message).toMatch(/required|match/i)
    // The stray key is named explicitly — the required-property error alone
    // never mentions it.
    expect(message).toMatch(/query/)
    expect(message).toMatch(/undeclared/i)
    // The target tool was never called — no opaque server-side failure.
    expect(calls.length).toBe(0)
  })

  test('skips validation (does not block) when the schema cannot be compiled', async () => {
    // A schema Ajv cannot compile (e.g. an unresolvable $ref) must degrade to
    // pass-through rather than rejecting every call.
    const { tool, calls } = makeMockMcpTool('McpTool', {
      type: 'object',
      properties: { q: { $ref: '#/definitions/does-not-exist' } },
      required: ['q'],
    })
    const ctx = makeContext([tool])

    const result = await ExecuteTool.call(
      { tool_name: 'McpTool', params: { q: 'hello' } },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data).toEqual({
      result: { result: 'ok' },
      tool_name: 'McpTool',
    })
    expect(calls.length).toBe(1)
  })

  test('accepts MCP params that match inputJSONSchema', async () => {
    const { tool, calls } = makeMockMcpTool('McpTool', {
      type: 'object',
      properties: { q: { type: 'string' } },
      required: ['q'],
    })
    const ctx = makeContext([tool])

    const result = await ExecuteTool.call(
      { tool_name: 'McpTool', params: { q: 'hello' } },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data).toEqual({
      result: { result: 'ok' },
      tool_name: 'McpTool',
    })
    expect(calls.length).toBe(1)
  })

  test('skips schema validation for tools with no usable schema at all', async () => {
    // A tool exposing neither zod safeParse nor inputJSONSchema must not crash
    // the duck-typed schema check; params pass through untouched.
    const mockTarget = makeMockTool('McpTool', { result: 'ok' })
    const ctx = makeContext([mockTarget])

    const result = await ExecuteTool.call(
      { tool_name: 'McpTool', params: { anything: true } },
      ctx,
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data).toEqual({
      result: { result: 'ok' },
      tool_name: 'McpTool',
    })
  })
})
