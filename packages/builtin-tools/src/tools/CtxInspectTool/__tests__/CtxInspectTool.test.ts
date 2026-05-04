import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { logMock } from '../../../../../../tests/mocks/log'

mock.module('src/utils/log.ts', logMock)

mock.module('src/services/tokenEstimation.ts', () => ({
  roughTokenCountEstimation: (text: string) => Math.ceil(text.length / 4),
  roughTokenCountEstimationForMessages: (msgs: unknown[]) => msgs.length * 64,
  roughTokenCountEstimationForMessage: () => 64,
  roughTokenCountEstimationForFileType: () => 64,
  bytesPerTokenForFileType: () => 4,
  countTokensWithAPI: async () => 0,
  countMessagesTokensWithAPI: async () => 0,
  countTokensViaHaikuFallback: async () => 0,
}))

let sessionMemoryInitialized = false
mock.module('src/services/SessionMemory/sessionMemoryUtils.ts', () => ({
  isSessionMemoryInitialized: () => sessionMemoryInitialized,
  waitForSessionMemoryExtraction: async () => {},
  getLastSummarizedMessageId: () => undefined,
  getSessionMemoryContent: async () => null,
  setLastSummarizedMessageId: () => {},
  markExtractionStarted: () => {},
  markExtractionCompleted: () => {},
  setSessionMemoryConfig: () => {},
  getSessionMemoryConfig: () => ({}),
  recordExtractionTokenCount: () => {},
  markSessionMemoryInitialized: () => {},
  hasMetInitializationThreshold: () => false,
  hasMetUpdateThreshold: () => false,
  getToolCallsBetweenUpdates: () => 0,
  resetSessionMemoryState: () => {},
  DEFAULT_SESSION_MEMORY_CONFIG: {},
}))

mock.module('src/utils/slowOperations.ts', () => ({
  jsonStringify: JSON.stringify,
  jsonParse: JSON.parse,
  slowLogging: { enabled: false },
  clone: (value: unknown) => structuredClone(value),
  cloneDeep: (value: unknown) => structuredClone(value),
  callerFrame: () => '',
  SLOW_OPERATION_THRESHOLD_MS: 100,
  writeFileSync_DEPRECATED: () => {},
}))

const { initContextCollapse, resetContextCollapse } = await import(
  'src/services/contextCollapse/index.js'
)
const { tokenCountWithEstimation } = await import('src/utils/tokens.js')
const { CtxInspectTool } = await import('../CtxInspectTool.js')

function makeUserMessage(text: string) {
  return {
    type: 'user' as const,
    uuid: `user-${text}`,
    message: { role: 'user' as const, content: text },
  }
}

function makeAssistantMessage(text: string) {
  return {
    type: 'assistant' as const,
    uuid: `assistant-${text}`,
    message: {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text }],
    },
  }
}

function makeContext(messages: unknown[], mainLoopModel = 'claude-sonnet-4-6') {
  return {
    messages,
    options: {
      mainLoopModel,
    },
    getAppState: () => ({}),
  } as any
}

const allowTool = async (input: Record<string, unknown>) => ({
  behavior: 'allow' as const,
  updatedInput: input,
})

const parentMessage = makeAssistantMessage('Parent tool call')

beforeEach(() => {
  resetContextCollapse()
  sessionMemoryInitialized = false
})

afterEach(() => {
  resetContextCollapse()
  sessionMemoryInitialized = false
})

describe('CtxInspectTool', () => {
  test('tool exports and metadata remain stable', async () => {
    expect(CtxInspectTool).toBeDefined()
    expect(CtxInspectTool.name).toBe('CtxInspect')
    expect(typeof CtxInspectTool.call).toBe('function')
    expect(await CtxInspectTool.description()).toContain('context')
    expect(CtxInspectTool.userFacingName()).toBe('CtxInspect')
    expect(CtxInspectTool.isReadOnly()).toBe(true)
    expect(CtxInspectTool.isConcurrencySafe()).toBe(true)
  })

  test('formats tool results for transcript rendering', () => {
    const block = CtxInspectTool.mapToolResultToToolResultBlockParam(
      {
        total_tokens: 192,
        message_count: 3,
        context_window_model: 'claude-sonnet-4-6',
        prompt_caching_enabled: true,
        session_memory_enabled: true,
        context_collapse_enabled: false,
        summary: 'Context collapse: disabled',
      },
      'tool-use-id',
    )

    expect(block.tool_use_id).toBe('tool-use-id')
    expect(block.content).toContain('192 tokens')
    expect(block.content).toContain('3 messages')
    expect(block.content).toContain('Context collapse: disabled')
  })

  test('returns live context counts and mechanism state', async () => {
    const messages = [
      makeUserMessage('Inspect the current context budget.'),
      makeAssistantMessage('Looking at the current conversation state.'),
    ]
    const context = makeContext(messages, 'claude-sonnet-4-6')

    const result = await (CtxInspectTool as any).call(
      {},
      context,
      allowTool,
      parentMessage,
    )

    expect(Object.keys(result.data).sort()).toEqual([
      'context_collapse_enabled',
      'context_window_model',
      'message_count',
      'prompt_caching_enabled',
      'session_memory_enabled',
      'summary',
      'total_tokens',
    ])
    expect(result.data.message_count).toBe(messages.length)
    expect(result.data.total_tokens).toBe(
      tokenCountWithEstimation(messages as any),
    )
    expect(result.data.context_window_model).toBe('claude-sonnet-4-6')
    expect(result.data.prompt_caching_enabled).toBe(true)
    expect(result.data.session_memory_enabled).toBe(false)
    expect(result.data.context_collapse_enabled).toBe(false)
    expect(result.data.summary).toContain('Overall context summary')
    expect(result.data.summary).toContain('Session memory: disabled')
    expect(result.data.summary).toContain('Context collapse: disabled')
  })

  test('query input focuses summary and collapse runtime changes the reported state', async () => {
    const messages = [
      makeUserMessage('Show me tool usage pressure in this thread.'),
      makeAssistantMessage('Summarizing tool-heavy context now.'),
    ]
    const context = makeContext(messages, 'claude-sonnet-4-6')

    const disabledResult = await (CtxInspectTool as any).call(
      { query: 'tool usage' },
      context,
      allowTool,
      parentMessage,
    )

    initContextCollapse()

    const enabledResult = await (CtxInspectTool as any).call(
      { query: 'tool usage' },
      context,
      allowTool,
      parentMessage,
    )

    expect(disabledResult.data.message_count).toBe(messages.length)
    expect(enabledResult.data.message_count).toBe(messages.length)
    expect(disabledResult.data.total_tokens).toBe(
      tokenCountWithEstimation(messages as any),
    )
    expect(enabledResult.data.total_tokens).toBe(
      tokenCountWithEstimation(messages as any),
    )
    expect(disabledResult.data.summary).toContain('Focus: tool usage')
    expect(disabledResult.data.context_collapse_enabled).toBe(false)
    expect(enabledResult.data.context_collapse_enabled).toBe(true)
    expect(enabledResult.data.summary).toContain('Context collapse: enabled')
    expect(enabledResult.data.summary).toContain('Collapse spans:')
  })
})
