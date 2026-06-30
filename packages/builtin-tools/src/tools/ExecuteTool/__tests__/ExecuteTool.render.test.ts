import { describe, expect, test, mock } from 'bun:test'
import { logMock } from '../../../../../../tests/mocks/log'
import { debugMock } from '../../../../../../tests/mocks/debug'

// Same mock setup as ExecuteTool.runner.ts — ExecuteTool's import chain
// (growthbook, searchExtraTools, messages) loads real modules with side
// effects otherwise. mock.module is process-global; identical setup in
// sibling test files in this directory is safe (last-write-wins, same stubs).
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
  isSearchExtraToolsToolAvailable: () => true,
  isSearchExtraToolsEnabled: async () => true,
  isToolReferenceBlock: () => false,
  extractDiscoveredToolNames: () => new Set<string>(),
  isDeferredToolsDeltaEnabled: () => false,
  getDeferredToolsDelta: () => null,
}))

mock.module('src/constants/tools.js', () => ({
  CORE_TOOLS: new Set(['ExecuteExtraTool', 'SearchExtraTools']),
}))

mock.module('src/utils/messages.js', () => ({
  createUserMessage: ({ content }: { content: string }) => ({
    type: 'user' as const,
    content,
    uuid: 'test-uuid',
  }),
  INTERRUPT_MESSAGE_FOR_TOOL_USE: '[Request interrupted]',
}))

mock.module('src/utils/toolErrors.js', () => ({
  formatZodValidationError: (_name: string, error: unknown) =>
    `validation error: ${JSON.stringify(error)}`,
}))

const { ExecuteTool } = await import('../ExecuteTool.js')

type RenderResult = React.ReactNode

describe('ExecuteTool.renderToolResultMessage delegation', () => {
  test('delegates to inner tool with content.result and unwrapped params', () => {
    const seen: Array<{
      content: unknown
      input: unknown
    }> = []
    const innerRender = (
      content: unknown,
      _progress: unknown,
      options: { input?: unknown },
    ): RenderResult => {
      seen.push({ content, input: options.input })
      return 'RENDERED' as unknown as RenderResult
    }
    const innerTool = {
      name: 'artifact',
      renderToolResultMessage: innerRender,
    }
    const tools = [innerTool] as never

    const result = ExecuteTool.renderToolResultMessage(
      {
        result: {
          id: 'abc',
          url: 'https://example.com/x.html',
          expiresAt: 'T',
        },
        tool_name: 'artifact',
      },
      [],
      {
        tools,
        input: {
          tool_name: 'artifact',
          params: { file_path: '/tmp/x.html', ttl: 7 },
        },
      } as never,
    )

    expect(result).toBe('RENDERED')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.content).toEqual({
      id: 'abc',
      url: 'https://example.com/x.html',
      expiresAt: 'T',
    })
    // Inner tool should see its own params shape, not the ExecuteExtraTool wrapper
    expect(seen[0]?.input).toEqual({ file_path: '/tmp/x.html', ttl: 7 })
  })

  test('returns null when inner tool has no renderToolResultMessage', () => {
    const innerTool = { name: 'bare' }
    const tools = [innerTool] as never

    const result = ExecuteTool.renderToolResultMessage(
      { result: { ok: true }, tool_name: 'bare' },
      [],
      { tools, input: { tool_name: 'bare', params: {} } } as never,
    )

    expect(result).toBeNull()
  })

  test('returns null when inner tool is not found in tools list', () => {
    const tools = [] as never

    const result = ExecuteTool.renderToolResultMessage(
      { result: { ok: true }, tool_name: 'missing' },
      [],
      { tools, input: { tool_name: 'missing', params: {} } } as never,
    )

    expect(result).toBeNull()
  })

  test('passes through undefined input safely when input is missing', () => {
    const seen: unknown[] = []
    const innerTool = {
      name: 'artifact',
      renderToolResultMessage: (
        _content: unknown,
        _progress: unknown,
        options: { input?: unknown },
      ): RenderResult => {
        seen.push(options.input)
        return null
      },
    }
    const tools = [innerTool] as never

    const result = ExecuteTool.renderToolResultMessage(
      { result: { ok: true }, tool_name: 'artifact' },
      [],
      { tools } as never,
    )

    expect(result).toBeNull()
    expect(seen[0]).toBeUndefined()
  })
})
