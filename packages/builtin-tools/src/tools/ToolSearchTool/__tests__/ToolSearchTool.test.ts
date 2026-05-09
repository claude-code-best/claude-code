import { describe, test, expect } from 'bun:test'
import { mock } from 'bun:test'
import { logMock } from '../../../../../../tests/mocks/log'
import { debugMock } from '../../../../../../tests/mocks/debug'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)

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

mock.module('src/utils/toolSearch.js', () => ({
  isToolSearchEnabledOptimistic: () => true,
  getAutoToolSearchCharThreshold: () => 100,
  getToolSearchMode: () => 'tst' as const,
  isToolSearchToolAvailable: async () => true,
  isToolSearchEnabled: async () => true,
  isToolReferenceBlock: () => false,
  extractDiscoveredToolNames: () => new Set(),
  isDeferredToolsDeltaEnabled: () => false,
  getDeferredToolsDelta: () => null,
}))

mock.module('src/constants/tools.js', () => ({
  CORE_TOOLS: new Set(['Read', 'Edit', 'ToolSearch', 'ExecuteExtraTool']),
}))

// Mock toolIndex module
type MockToolSearchResult = {
  name: string
  description: string
  searchHint: string | undefined
  score: number
  isMcp: boolean
  isDeferred: boolean
  inputSchema: object | undefined
}
const mockSearchTools = mock(
  (
    _query: string,
    _index: unknown,
    _limit?: number,
  ): MockToolSearchResult[] => [],
)
const mockGetToolIndex = mock(async (_tools: unknown) => [])

mock.module('src/services/toolSearch/toolIndex.js', () => ({
  getToolIndex: mockGetToolIndex,
  searchTools: mockSearchTools,
}))

// Mock analytics
mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
}))

const { ToolSearchTool } = await import('../ToolSearchTool.js')

function makeDeferredTool(name: string, desc: string = 'A tool') {
  return {
    name,
    isMcp: false,
    alwaysLoad: undefined,
    shouldDefer: undefined,
    searchHint: '',
    prompt: async () => desc,
    description: async () => desc,
    inputSchema: {},
    isEnabled: () => true,
  }
}

function makeContext(tools: unknown[] = []) {
  return {
    options: { tools },
    cwd: '/tmp',
    sessionId: 'test',
    getAppState: () => ({
      mcp: { clients: [] },
    }),
  } as never
}

describe('ToolSearchTool search enhancements', () => {
  test('discover: prefix triggers TF-IDF search and returns matches', async () => {
    const mockTool = makeDeferredTool('CronCreate', 'Schedule cron jobs')
    mockGetToolIndex.mockResolvedValueOnce([])
    mockSearchTools.mockReturnValueOnce([
      {
        name: 'CronCreate',
        description: 'Schedule cron jobs',
        searchHint: undefined,
        score: 0.85,
        isMcp: false,
        isDeferred: true,
        inputSchema: undefined,
      },
    ])

    const result: { data: { matches: string[] } } = await (
      ToolSearchTool as any
    ).call(
      { query: 'discover:schedule cron job', max_results: 5 },
      makeContext([mockTool]),
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    expect(result.data.matches).toContain('CronCreate')
  })

  test('keyword + TF-IDF parallel search merges results', async () => {
    const toolA = makeDeferredTool('ToolA', 'Tool A description')
    const toolB = makeDeferredTool('ToolB', 'Tool B description')
    const toolC = makeDeferredTool('ToolC', 'Tool C description')

    // getToolIndex returns tools, searchTools returns different ranking
    mockGetToolIndex.mockResolvedValueOnce([])
    mockSearchTools.mockReturnValueOnce([
      {
        name: 'ToolB',
        description: 'Tool B',
        searchHint: undefined,
        score: 0.9,
        isMcp: false,
        isDeferred: true,
        inputSchema: undefined,
      },
      {
        name: 'ToolC',
        description: 'Tool C',
        searchHint: undefined,
        score: 0.8,
        isMcp: false,
        isDeferred: true,
        inputSchema: undefined,
      },
    ])

    const result: { data: { matches: string[] } } = await (
      ToolSearchTool as any
    ).call(
      { query: 'tool B', max_results: 5 },
      makeContext([toolA, toolB, toolC]),
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )

    // ToolB should be in results (matched by both keyword and TF-IDF)
    expect(result.data.matches).toContain('ToolB')
  })

  test('text mode output for all models (unified self-built search)', async () => {
    const tool = makeDeferredTool('TestTool', 'A test tool')
    mockGetToolIndex.mockResolvedValueOnce([])
    mockSearchTools.mockReturnValueOnce([])

    // First call: search returns matches
    mockSearchTools.mockReturnValueOnce([
      {
        name: 'TestTool',
        description: 'A test',
        searchHint: undefined,
        score: 0.9,
        isMcp: false,
        isDeferred: true,
        inputSchema: undefined,
      },
    ])

    // mapToolResultToToolResultBlockParam always returns text, not tool_reference
    const blockParam = ToolSearchTool.mapToolResultToToolResultBlockParam(
      { matches: ['TestTool'], query: 'test', total_deferred_tools: 1 },
      'tool-use-123',
      { mainLoopModel: 'claude-3-haiku-20240307' },
    )

    expect(typeof blockParam.content).toBe('string')
    expect(blockParam.content as string).toContain('TestTool')
    expect(blockParam.content as string).toContain('ExecuteExtraTool')
  })

  test('text output works for any model without distinction', async () => {
    const blockParam = ToolSearchTool.mapToolResultToToolResultBlockParam(
      { matches: ['TestTool'], query: 'test', total_deferred_tools: 1 },
      'tool-use-123',
      { mainLoopModel: 'claude-sonnet-4-20250514' },
    )

    expect(typeof blockParam.content).toBe('string')
    expect(blockParam.content as string).toContain('TestTool')
    expect(blockParam.content as string).toContain('ExecuteExtraTool')
  })

  test('backwards compatible without context parameter', async () => {
    const blockParam = ToolSearchTool.mapToolResultToToolResultBlockParam(
      { matches: ['TestTool'], query: 'test', total_deferred_tools: 1 },
      'tool-use-123',
    )

    expect(typeof blockParam.content).toBe('string')
    expect(blockParam.content as string).toContain('TestTool')
    expect(blockParam.content as string).toContain('ExecuteExtraTool')
  })

  test('empty results return helpful message', async () => {
    const blockParam = ToolSearchTool.mapToolResultToToolResultBlockParam(
      { matches: [], query: 'nonexistent', total_deferred_tools: 5 },
      'tool-use-123',
    )

    expect(blockParam.content).toContain('No matching deferred tools found')
  })
})
