import { describe, test, expect } from 'bun:test'
import { mock } from 'bun:test'
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
  isSearchExtraToolsToolAvailable: async () => true,
  isSearchExtraToolsEnabled: async () => true,
  isToolReferenceBlock: () => false,
  extractDiscoveredToolNames: () => new Set(),
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

  test('has correct name', () => {
    expect(ExecuteTool.name).toBe(EXECUTE_TOOL_NAME)
  })

  test('searchHint contains keywords', () => {
    expect(ExecuteTool.searchHint).toContain('execute')
    expect(ExecuteTool.searchHint).toContain('tool')
  })
})
