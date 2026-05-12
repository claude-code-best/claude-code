import { describe, expect, test } from 'bun:test'
import { filterParentToolsForFork } from '../agentToolFilter.js'
import { ALL_AGENT_DISALLOWED_TOOLS } from '../../constants/tools.js'
import type { Tool } from '../../Tool.js'

// L6 fix: synthetic tool factory typed precisely. filterParentToolsForFork
// only reads .name; if the filter ever needed more (e.g. .isEnabled()),
// the cast site would surface the missing fields rather than silently
// pass through `as Tool`.
function fakeTool(name: string): Tool {
  return { name } as unknown as Tool
}

describe('filterParentToolsForFork', () => {
  test('strips tools that are in ALL_AGENT_DISALLOWED_TOOLS', () => {
    // Pick any disallowed tool name for a deterministic test.
    const disallowed = Array.from(ALL_AGENT_DISALLOWED_TOOLS)[0]!
    const parent: Tool[] = [fakeTool('AllowedTool'), fakeTool(disallowed)]
    const result = filterParentToolsForFork(parent)
    expect(result.map(t => t.name)).toEqual(['AllowedTool'])
  })

  test('strips LocalMemoryRecall (registered as disallowed in PR-1)', () => {
    const parent: Tool[] = [
      fakeTool('LocalMemoryRecall'),
      fakeTool('Bash'),
      fakeTool('FileRead'),
    ]
    const result = filterParentToolsForFork(parent)
    expect(result.map(t => t.name)).toEqual(['Bash', 'FileRead'])
  })

  test('passes through tools that are not in the disallow set', () => {
    const parent: Tool[] = [
      fakeTool('Bash'),
      fakeTool('Read'),
      fakeTool('WebFetch'),
    ]
    const result = filterParentToolsForFork(parent)
    expect(result).toEqual(parent)
  })

  test('handles empty input', () => {
    expect(filterParentToolsForFork([])).toEqual([])
  })

  test('preserves order of allowed tools', () => {
    const parent: Tool[] = [
      fakeTool('A'),
      fakeTool('LocalMemoryRecall'),
      fakeTool('B'),
      fakeTool('C'),
    ]
    const result = filterParentToolsForFork(parent)
    expect(result.map(t => t.name)).toEqual(['A', 'B', 'C'])
  })

  test('strips multiple disallowed tools in one pass', () => {
    const disallowed = Array.from(ALL_AGENT_DISALLOWED_TOOLS).slice(0, 2)
    const parent: Tool[] = [
      fakeTool('Keep1'),
      fakeTool(disallowed[0]!),
      fakeTool('Keep2'),
      fakeTool(disallowed[1]!),
      fakeTool('Keep3'),
    ]
    const result = filterParentToolsForFork(parent)
    expect(result.map(t => t.name)).toEqual(['Keep1', 'Keep2', 'Keep3'])
  })
})

describe('AC11a: ALL_AGENT_DISALLOWED_TOOLS contains LocalMemoryRecall', () => {
  test('layer 1 gate registration is in place', () => {
    expect(ALL_AGENT_DISALLOWED_TOOLS.has('LocalMemoryRecall')).toBe(true)
  })
})

describe('AC11b: layer 2 fork-path filter integration semantics', () => {
  // Both AgentTool.tsx (new fork) and resumeAgent.ts (resumed fork) must
  // call filterParentToolsForFork before passing tools to runAgent. We
  // verify the wiring via grep snapshot — a missing call is the only way
  // for layer 2 to silently fail. The actual fork execution pathway
  // requires a full Ink REPL and is exercised in REPL AC.
  test('AgentTool.tsx fork path uses filterParentToolsForFork', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    // Resolve relative to the test worker's cwd, which is the project root.
    const file = path.resolve(
      'packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx',
    )
    const src = fs.readFileSync(file, 'utf8')
    expect(src).toContain(
      'filterParentToolsForFork(toolUseContext.options.tools)',
    )
  })

  test('resumeAgent.ts resumed-fork path uses filterParentToolsForFork', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const file = path.resolve(
      'packages/builtin-tools/src/tools/AgentTool/resumeAgent.ts',
    )
    const src = fs.readFileSync(file, 'utf8')
    expect(src).toContain(
      'filterParentToolsForFork(toolUseContext.options.tools)',
    )
  })
})
