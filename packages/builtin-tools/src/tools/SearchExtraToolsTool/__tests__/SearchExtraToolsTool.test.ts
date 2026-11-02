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
  CORE_TOOLS: new Set(['Read', 'Edit', 'SearchExtraTools', 'ExecuteExtraTool']),
}))

// Mock toolIndex module
type MockSearchExtraToolsResult = {
  name: string
  description: string
  searchHint: string | undefined
  score: number
  isMcp: boolean
  isDeferred: boolean
  inputSchema: object | undefined
}
// Mutable backing value read by the mock implementation. Tests that need a
// non-empty result assign to `searchToolsResult` rather than re-mocking, so
// the behavior does not depend on runtime mock re-configuration.
let searchToolsResult: MockSearchExtraToolsResult[] = []
const mockSearchTools = mock(
  (
    _query: string,
    _index: unknown,
    _limit?: number,
  ): MockSearchExtraToolsResult[] => searchToolsResult,
)
const mockGetToolIndex = mock(async (_tools: unknown) => [])

mock.module('src/services/searchExtraTools/toolIndex.js', () => ({
  getToolIndex: mockGetToolIndex,
  searchTools: mockSearchTools,
}))

// Mock analytics
mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
}))

const { SearchExtraToolsTool } = await import('../SearchExtraToolsTool.js')

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

describe('SearchExtraToolsTool search enhancements', () => {
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
      SearchExtraToolsTool as any
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
      SearchExtraToolsTool as any
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
    // mapToolResultToToolResultBlockParam always returns text, not tool_reference
    const blockParam = SearchExtraToolsTool.mapToolResultToToolResultBlockParam(
      { matches: ['TestTool'], query: 'test', total_deferred_tools: 1 },
      'tool-use-123',
      { mainLoopModel: 'claude-3-haiku-20240307' },
    )

    expect(typeof blockParam.content).toBe('string')
    expect(blockParam.content as string).toContain('TestTool')
    expect(blockParam.content as string).toContain('ExecuteExtraTool')
  })

  test('text output works for any model without distinction', async () => {
    const blockParam = SearchExtraToolsTool.mapToolResultToToolResultBlockParam(
      { matches: ['TestTool'], query: 'test', total_deferred_tools: 1 },
      'tool-use-123',
      { mainLoopModel: 'claude-sonnet-4-20250514' },
    )

    expect(typeof blockParam.content).toBe('string')
    expect(blockParam.content as string).toContain('TestTool')
    expect(blockParam.content as string).toContain('ExecuteExtraTool')
  })

  test('backwards compatible without context parameter', async () => {
    const blockParam = SearchExtraToolsTool.mapToolResultToToolResultBlockParam(
      { matches: ['TestTool'], query: 'test', total_deferred_tools: 1 },
      'tool-use-123',
    )

    expect(typeof blockParam.content).toBe('string')
    expect(blockParam.content as string).toContain('TestTool')
    expect(blockParam.content as string).toContain('ExecuteExtraTool')
  })

  test('empty results return helpful message', async () => {
    const blockParam = SearchExtraToolsTool.mapToolResultToToolResultBlockParam(
      { matches: [], query: 'nonexistent', total_deferred_tools: 5 },
      'tool-use-123',
    )

    expect(blockParam.content).toContain('No matching deferred tools found')
  })

  test('discover: surfaces tool_details so schemas reach the model', async () => {
    const tool = {
      name: 'mcp__demo__search',
      isMcp: true,
      alwaysLoad: undefined,
      shouldDefer: undefined,
      searchHint: '',
      prompt: async () => 'Search the demo index',
      description: async () => 'Search the demo index',
      inputSchema: {},
      inputJSONSchema: {
        type: 'object',
        properties: { q: { type: 'string' } },
        required: ['q'],
      },
      isEnabled: () => true,
    }
    mockGetToolIndex.mockResolvedValueOnce([])
    searchToolsResult = [
      {
        name: 'mcp__demo__search',
        description: 'Search the demo index',
        searchHint: undefined,
        score: 0.9,
        isMcp: true,
        isDeferred: true,
        inputSchema: undefined,
      },
    ]

    const result: { data: { tool_details?: unknown[] } } = await (
      SearchExtraToolsTool as any
    ).call(
      { query: 'discover:demo search', max_results: 5 },
      makeContext([tool]),
      async () => ({ behavior: 'allow' }),
      { type: 'assistant', content: [], uuid: 'msg1' } as never,
      undefined,
    )
    searchToolsResult = []

    expect(result.data.tool_details).toBeDefined()
    expect(result.data.tool_details!.length).toBe(1)
    // The raw MCP JSON schema is carried through untouched.
    expect(
      (result.data.tool_details![0] as { input_schema: unknown }).input_schema,
    ).toEqual({
      type: 'object',
      properties: { q: { type: 'string' } },
      required: ['q'],
    })
  })

  test('select: renders the parameter schema into the tool_result text', async () => {
    // Core regression for the reported bug: the model must receive the exact
    // property name ('q') rather than only the tool name and having to guess.
    const tool = {
      name: 'SearchDemo',
      isMcp: false,
      alwaysLoad: undefined,
      shouldDefer: undefined,
      searchHint: '',
      prompt: async () => 'Search the demo index',
      description: async () => 'Search the demo index',
      inputSchema: {},
      inputJSONSchema: {
        type: 'object',
        properties: { q: { type: 'string' } },
        required: ['q'],
      },
      isEnabled: () => true,
    }

    const result: { data: { matches: string[]; tool_details?: unknown } } =
      await (SearchExtraToolsTool as any).call(
        { query: 'select:SearchDemo', max_results: 5 },
        makeContext([tool]),
        async () => ({ behavior: 'allow' }),
        { type: 'assistant', content: [], uuid: 'msg1' } as never,
        undefined,
      )

    expect(result.data.matches).toContain('SearchDemo')
    expect(result.data.tool_details).toBeDefined()

    const blockParam = SearchExtraToolsTool.mapToolResultToToolResultBlockParam(
      result.data as never,
      'tool-use-1',
    )
    const text = blockParam.content as string
    expect(text).toContain('SearchDemo')
    expect(text).toContain('Parameter schemas')
    // The exact property name from the schema must appear in the text.
    expect(text).toContain('"q"')
    // And the model is warned not to rename it.
    expect(text).toMatch(/EXACT property names/i)
  })
})
