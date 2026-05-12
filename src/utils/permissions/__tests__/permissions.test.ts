import { mock, describe, expect, test } from 'bun:test'
import { logMock } from '../../../../tests/mocks/log'
import { createFileStateCacheWithSizeLimit } from '../../../utils/fileStateCache.js'
import { createSubagentContext } from '../../../utils/forkedAgent.js'
import { getEmptyToolPermissionContext } from '../../../Tool.js'

mock.module('src/utils/log.ts', logMock)

const {
  getDenyRuleForTool,
  getAskRuleForTool,
  getDenyRuleForAgent,
  filterDeniedAgents,
} = await import('../permissions')

function makeContext(opts: { denyRules?: string[]; askRules?: string[] }) {
  const ctx = getEmptyToolPermissionContext()
  const deny: Record<string, string[]> = {}
  const ask: Record<string, string[]> = {}
  if (opts.denyRules?.length) deny.localSettings = opts.denyRules
  if (opts.askRules?.length) ask.localSettings = opts.askRules
  return { ...ctx, alwaysDenyRules: deny, alwaysAskRules: ask } as any
}

function makeTool(
  name: string,
  mcpInfo?: { serverName: string; toolName: string },
) {
  return { name, mcpInfo }
}

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
    const ctx = makeContext({ denyRules: ['Bash(rm -rf)'] })
    const result = getDenyRuleForTool(ctx, makeTool('Bash'))
    expect(result).toBeNull()
  })
})

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

describe('Langfuse trace propagation', () => {
  test('subagent context preserves parent trace for nested side queries', () => {
    const parentTrace = { id: 'parent-trace' } as never
    const parentContext = {
      ...getEmptyToolPermissionContext(),
      messages: [],
      abortController: new AbortController(),
      readFileState: createFileStateCacheWithSizeLimit(1),
      getAppState: () => ({
        toolPermissionContext: getEmptyToolPermissionContext(),
      }),
      setAppState: () => {},
      updateFileHistoryState: () => {},
      updateAttributionState: () => {},
      setInProgressToolUseIDs: () => {},
      setResponseLength: () => {},
      langfuseTrace: parentTrace,
    } as never
    const subagentContext = createSubagentContext(parentContext)
    expect(subagentContext.langfuseRootTrace).toBe(parentTrace)
  })
})

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
