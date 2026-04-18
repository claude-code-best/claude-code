import { mock, describe, expect, test } from 'bun:test'

// Mock log.ts to cut the heavy dependency chain
mock.module('src/utils/log.ts', () => ({
  logError: () => {},
  logToFile: () => {},
  getLogDisplayTitle: () => '',
  logEvent: () => {},
  logMCPError: () => {},
  logMCPDebug: () => {},
  dateToFilename: (d: Date) => d.toISOString().replace(/[:.]/g, '-'),
  getLogFilePath: () => '/tmp/mock-log',
  attachErrorLogSink: () => {},
  getInMemoryErrors: () => [],
  loadErrorLogs: async () => [],
  getErrorLogByIndex: async () => null,
  captureAPIRequest: () => {},
  _resetErrorLogForTesting: () => {},
}))

// Mock slowOperations to avoid bun:bundle
mock.module('src/utils/slowOperations.ts', () => ({
  jsonStringify: JSON.stringify,
  jsonParse: JSON.parse,
  slowLogging: { enabled: false },
  clone: (v: any) => structuredClone(v),
  cloneDeep: (v: any) => structuredClone(v),
  callerFrame: () => '',
  SLOW_OPERATION_THRESHOLD_MS: 100,
  writeFileSync_DEPRECATED: () => {},
}))

const {
  getDenyRuleForTool,
  getAskRuleForTool,
  getDenyRuleForAgent,
  filterDeniedAgents,
} = await import('../permissions')

import { getEmptyToolPermissionContext } from '../../../Tool'

// ─── Helper ─────────────────────────────────────────────────────────────

function makeContext(opts: { denyRules?: string[]; askRules?: string[] }) {
  const ctx = getEmptyToolPermissionContext()
  const deny: Record<string, string[]> = {}
  const ask: Record<string, string[]> = {}

  // alwaysDenyRules stores raw rule strings — getDenyRules() calls
  // permissionRuleValueFromString internally
  if (opts.denyRules?.length) {
    deny['localSettings'] = opts.denyRules
  }
  if (opts.askRules?.length) {
    ask['localSettings'] = opts.askRules
  }

  return {
    ...ctx,
    alwaysDenyRules: deny,
    alwaysAskRules: ask,
  } as any
}

function makeTool(
  name: string,
  mcpInfo?: { serverName: string; toolName: string },
) {
  return { name, mcpInfo }
}

// ─── getDenyRuleForTool ─────────────────────────────────────────────────

describe('getDenyRuleForTool', () => {
  test('returns null when no deny rules', () => {
    const ctx = makeContext({})
    expect(getDenyRuleForTool(ctx, makeTool('Bash'))).toBeNull()
  })

  test('returns matching deny rule for tool', () => {
    const ctx = makeContext({ denyRules: ['Bash'] })
    const result = getDenyRuleForTool(ctx, makeTool('Bash'))
    expect(result).not.toBeNull()
    expect(result!.ruleValue.toolName).toBe('Bash')
  })

  test('returns null for non-matching tool', () => {
    const ctx = makeContext({ denyRules: ['Bash'] })
    expect(getDenyRuleForTool(ctx, makeTool('Read'))).toBeNull()
  })

  test('rule with content does not match whole-tool deny', () => {
    // getDenyRuleForTool uses toolMatchesRule which requires ruleContent === undefined
    // Rules like "Bash(rm -rf)" only match specific invocations, not the entire tool
    const ctx = makeContext({ denyRules: ['Bash(rm -rf)'] })
    const result = getDenyRuleForTool(ctx, makeTool('Bash'))
    expect(result).toBeNull()
  })
})

// ─── getAskRuleForTool ──────────────────────────────────────────────────

describe('getAskRuleForTool', () => {
  test('returns null when no ask rules', () => {
    const ctx = makeContext({})
    expect(getAskRuleForTool(ctx, makeTool('Bash'))).toBeNull()
  })

  test('returns matching ask rule', () => {
    const ctx = makeContext({ askRules: ['Write'] })
    const result = getAskRuleForTool(ctx, makeTool('Write'))
    expect(result).not.toBeNull()
  })

  test('returns null for non-matching tool', () => {
    const ctx = makeContext({ askRules: ['Write'] })
    expect(getAskRuleForTool(ctx, makeTool('Bash'))).toBeNull()
  })
})

// ─── getDenyRuleForAgent ────────────────────────────────────────────────

describe('getDenyRuleForAgent', () => {
  test('returns null when no deny rules', () => {
    const ctx = makeContext({})
    expect(getDenyRuleForAgent(ctx, 'Agent', 'Explore')).toBeNull()
  })

  test('returns matching deny rule for agent type', () => {
    const ctx = makeContext({ denyRules: ['Agent(Explore)'] })
    const result = getDenyRuleForAgent(ctx, 'Agent', 'Explore')
    expect(result).not.toBeNull()
  })

  test('returns null for non-matching agent type', () => {
    const ctx = makeContext({ denyRules: ['Agent(Explore)'] })
    expect(getDenyRuleForAgent(ctx, 'Agent', 'Research')).toBeNull()
  })
})

// ─── filterDeniedAgents ─────────────────────────────────────────────────

describe('filterDeniedAgents', () => {
  test('returns all agents when no deny rules', () => {
    const ctx = makeContext({})
    const agents = [{ agentType: 'Explore' }, { agentType: 'Research' }]
    expect(filterDeniedAgents(agents, ctx, 'Agent')).toEqual(agents)
  })

  test('filters out denied agent type', () => {
    const ctx = makeContext({ denyRules: ['Agent(Explore)'] })
    const agents = [{ agentType: 'Explore' }, { agentType: 'Research' }]
    const result = filterDeniedAgents(agents, ctx, 'Agent')
    expect(result).toHaveLength(1)
    expect(result[0]!.agentType).toBe('Research')
  })

  test('returns empty array when all agents denied', () => {
    const ctx = makeContext({
      denyRules: ['Agent(Explore)', 'Agent(Research)'],
    })
    const agents = [{ agentType: 'Explore' }, { agentType: 'Research' }]
    expect(filterDeniedAgents(agents, ctx, 'Agent')).toEqual([])
  })
})
