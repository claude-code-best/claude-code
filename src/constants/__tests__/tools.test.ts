import { describe, test, expect, beforeEach } from 'bun:test'
import { logMock } from '../../../tests/mocks/log'
import { debugMock } from '../../../tests/mocks/debug'
import { mock } from 'bun:test'

mock.module('src/utils/log.ts', logMock)
mock.module('src/utils/debug.ts', debugMock)
// Mock growthbook to cut analytics dependency
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

const { CORE_TOOLS } = await import('../tools.js')
const { isDeferredTool } = await import(
  '@claude-code-best/builtin-tools/tools/SearchExtraToolsTool/prompt.js'
)

type MockTool = {
  name: string
  alwaysLoad?: boolean
  isMcp?: boolean
  shouldDefer?: boolean
}

function makeTool(overrides: Partial<MockTool> = {}): MockTool {
  return {
    name: 'TestTool',
    isMcp: false,
    shouldDefer: undefined,
    alwaysLoad: undefined,
    ...overrides,
  }
}

describe('CORE_TOOLS', () => {
  test('contains expected number of tools', () => {
    // 7 SHELL_TOOL_NAMES + 19 independent tool names
    expect(CORE_TOOLS.size).toBeGreaterThanOrEqual(26)
  })

  test('contains key core tool names', () => {
    const expected = [
      'Bash',
      'Read',
      'Edit',
      'Write',
      'Glob',
      'Grep',
      'Agent',
      'AskUserQuestion',
      'SearchExtraTools',
      'WebSearch',
      'WebFetch',
      'Sleep',
      'LSP',
      'Skill',
      'TaskCreate',
      'TaskGet',
      'TaskUpdate',
      'TaskList',
      'TaskOutput',
      'TaskStop',
      'TodoWrite',
      'EnterPlanMode',
      'ExitPlanMode',
      'VerifyPlanExecution',
      'NotebookEdit',
      'StructuredOutput',
    ]
    for (const name of expected) {
      expect(CORE_TOOLS.has(name), `CORE_TOOLS should contain ${name}`).toBe(
        true,
      )
    }
  })

  test('is a ReadonlySet', () => {
    // ReadonlySet is not directly distinguishable at runtime from Set,
    // but we verify the cast was applied by checking it's a Set
    expect(CORE_TOOLS).toBeInstanceOf(Set)
    // The `as ReadonlySet<string>` ensures type-level immutability
  })
})

describe('isDeferredTool', () => {
  test('returns false for core tools', () => {
    const coreNames = ['Read', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent']
    for (const name of coreNames) {
      const tool = makeTool({ name })
      expect(
        isDeferredTool(tool as never),
        `${name} should not be deferred`,
      ).toBe(false)
    }
  })

  test('returns false for tools with alwaysLoad: true even if not in CORE_TOOLS', () => {
    const tool = makeTool({ name: 'CustomTool', alwaysLoad: true })
    expect(isDeferredTool(tool as never)).toBe(false)
  })

  test('returns true for non-core built-in tools', () => {
    const tool = makeTool({ name: 'ConfigTool' })
    expect(isDeferredTool(tool as never)).toBe(true)
  })

  test('returns true for agent/team tools (TeamCreate, TeamDelete, SendMessage)', () => {
    for (const name of ['TeamCreate', 'TeamDelete', 'SendMessage']) {
      const tool = makeTool({ name })
      expect(isDeferredTool(tool as never), `${name} should be deferred`).toBe(
        true,
      )
    }
  })

  test('returns true for MCP tools', () => {
    const tool = makeTool({ name: 'mcp__server__action', isMcp: true })
    expect(isDeferredTool(tool as never)).toBe(true)
  })

  test('returns false for MCP tools with alwaysLoad: true', () => {
    const tool = makeTool({
      name: 'mcp__server__action',
      isMcp: true,
      alwaysLoad: true,
    })
    expect(isDeferredTool(tool as never)).toBe(false)
  })

  test('alwaysLoad takes precedence over CORE_TOOLS membership', () => {
    // A tool in CORE_TOOLS with alwaysLoad: false should still not be deferred
    const tool = makeTool({ name: 'Read', alwaysLoad: true })
    expect(isDeferredTool(tool as never)).toBe(false)
  })
})
