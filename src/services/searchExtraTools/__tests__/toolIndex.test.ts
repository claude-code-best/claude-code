import { describe, test, expect, beforeEach } from 'bun:test'
import { mock } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { debugMock } from '../../../../tests/mocks/debug'

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

const {
  parseToolName,
  buildToolIndex,
  searchTools,
  getToolIndex,
  clearToolIndexCache,
} = await import('../toolIndex.js')

type MockTool = {
  name: string
  alwaysLoad?: boolean
  isMcp?: boolean
  shouldDefer?: boolean
  searchHint?: string
  prompt: () => Promise<string>
  inputJSONSchema?: object
  inputSchema?: unknown
}

function makeMockTool(overrides: Partial<MockTool> = {}): MockTool {
  return {
    name: 'TestTool',
    isMcp: false,
    shouldDefer: undefined,
    alwaysLoad: undefined,
    searchHint: undefined,
    prompt: async () => 'A test tool for testing purposes.',
    inputJSONSchema: undefined,
    inputSchema: undefined,
    ...overrides,
  }
}

describe('parseToolName', () => {
  test('parses MCP tool names', () => {
    const result = parseToolName('mcp__github__create_issue')
    expect(result.isMcp).toBe(true)
    expect(result.parts).toEqual(['github', 'create', 'issue'])
  })

  test('parses built-in tool names', () => {
    const result = parseToolName('NotebookEditTool')
    expect(result.isMcp).toBe(false)
    expect(result.parts).toEqual(['notebook', 'edit', 'tool'])
  })

  test('parses underscore-separated tool names', () => {
    const result = parseToolName('EnterWorktreeTool')
    expect(result.isMcp).toBe(false)
    expect(result.parts).toContain('enter')
    expect(result.parts).toContain('worktree')
  })
})

describe('buildToolIndex', () => {
  test('builds index from deferred tools only', async () => {
    const tools = [
      makeMockTool({ name: 'CoreRead', alwaysLoad: true }),
      makeMockTool({
        name: 'ConfigTool',
        searchHint: 'configure settings options',
        prompt: async () => 'Manage configuration settings.',
      }),
      makeMockTool({
        name: 'CronCreateTool',
        searchHint: 'schedule recurring prompt',
        prompt: async () => 'Create cron jobs for scheduling.',
      }),
    ] as unknown as import('../../../Tool.js').Tool[]

    const index = await buildToolIndex(tools)
    // Only non-core, non-alwaysLoad tools should be indexed
    expect(index.length).toBe(2)
    for (const entry of index) {
      expect(entry.tokens.length).toBeGreaterThan(0)
      expect(entry.tfVector.size).toBeGreaterThan(0)
    }
  })

  test('returns empty array when all tools are core', async () => {
    const tools = [
      makeMockTool({ name: 'Read', alwaysLoad: true }),
      makeMockTool({ name: 'Edit', alwaysLoad: true }),
    ] as unknown as import('../../../Tool.js').Tool[]

    const index = await buildToolIndex(tools)
    expect(index.length).toBe(0)
  })
})

describe('searchTools', () => {
  test('finds tools matching query', async () => {
    const tools = [
      makeMockTool({
        name: 'CronCreateTool',
        searchHint: 'schedule a recurring or one-shot prompt',
        prompt: async () => 'Create cron jobs for scheduling tasks.',
      }),
      makeMockTool({
        name: 'ConfigTool',
        searchHint: 'configure settings options',
        prompt: async () => 'Manage configuration settings.',
      }),
    ] as unknown as import('../../../Tool.js').Tool[]

    const index = await buildToolIndex(tools)
    const results = searchTools('schedule cron job', index)
    expect(results.length).toBeGreaterThan(0)
    // CronCreateTool should rank highest for "schedule cron job"
    expect(results[0]!.name).toBe('CronCreateTool')
    expect(results[0]!.score).toBeGreaterThan(0)
  })

  test('returns empty array for empty query', async () => {
    const tools = [
      makeMockTool({
        name: 'ConfigTool',
        prompt: async () => 'Manage configuration.',
      }),
    ] as unknown as import('../../../Tool.js').Tool[]

    const index = await buildToolIndex(tools)
    expect(searchTools('', index)).toEqual([])
  })

  test('returns empty array when no tools match', async () => {
    const tools = [
      makeMockTool({
        name: 'ConfigTool',
        prompt: async () => 'Manage configuration settings.',
      }),
    ] as unknown as import('../../../Tool.js').Tool[]

    const index = await buildToolIndex(tools)
    const results = searchTools('quantum physics entanglement', index)
    expect(results).toEqual([])
  })

  test('CJK tokenization produces bigrams', async () => {
    // Verify CJK text is tokenized into bigrams (delegated to localSearch.tokenize)
    const { tokenizeAndStem } = await import('../../skillSearch/localSearch.js')
    const tokens = tokenizeAndStem('搜索代码')
    expect(tokens).toContain('搜索')
    expect(tokens).toContain('代码')
  })
})

describe('getToolIndex caching', () => {
  beforeEach(() => {
    clearToolIndexCache()
  })

  test('returns cached index for same tool list', async () => {
    const tools = [
      makeMockTool({
        name: 'ConfigTool',
        prompt: async () => 'Manage configuration.',
      }),
    ] as unknown as import('../../../Tool.js').Tool[]

    const first = await getToolIndex(tools)
    const second = await getToolIndex(tools)
    expect(first).toBe(second) // Same reference = cached
  })

  test('rebuilds index after clearToolIndexCache', async () => {
    const tools = [
      makeMockTool({
        name: 'ConfigTool',
        prompt: async () => 'Manage configuration.',
      }),
    ] as unknown as import('../../../Tool.js').Tool[]

    const first = await getToolIndex(tools)
    clearToolIndexCache()
    const second = await getToolIndex(tools)
    expect(first).not.toBe(second) // Different reference = rebuilt
  })
})
