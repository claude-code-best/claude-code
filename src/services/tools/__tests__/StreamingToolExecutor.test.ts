import { describe, expect, test } from 'bun:test'
import { StreamingToolExecutor } from '../StreamingToolExecutor.js'
import type { ToolUseContext } from '../../../Tool.js'

function makeMinimalContext(): ToolUseContext {
  const abortController = new AbortController()
  return {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'test-model',
      tools: [],
      verbose: false,
      thinkingConfig: { type: 'disabled' },
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { builtinAgents: [], customAgents: [] },
    },
    abortController,
    readFileState: {
      get: () => undefined,
      set: () => {},
      delete: () => false,
      has: () => false,
      clear: () => {},
    } as any,
    getAppState: () => ({}) as any,
    setAppState: () => {},
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [],
  } as unknown as ToolUseContext
}

describe('StreamingToolExecutor.discard()', () => {
  test('clears the internal tools array', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    // Access internal state via reflection
    const toolsBefore = (executor as unknown as { tools: unknown[] }).tools
    expect(toolsBefore).toHaveLength(0)

    executor.discard()

    const toolsAfter = (executor as unknown as { tools: unknown[] }).tools
    expect(toolsAfter).toHaveLength(0)
  })

  test('aborts the sibling abort controller', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    const siblingController = (
      executor as unknown as { siblingAbortController: AbortController }
    ).siblingAbortController
    expect(siblingController.signal.aborted).toBe(false)

    executor.discard()

    expect(siblingController.signal.aborted).toBe(true)
  })

  test('sets discarded flag so getCompletedResults yields nothing', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    executor.discard()

    const results = [...executor.getCompletedResults()]
    expect(results).toHaveLength(0)
  })

  test('sets discarded flag so getRemainingResults yields nothing', async () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    executor.discard()

    const results: unknown[] = []
    for await (const update of executor.getRemainingResults()) {
      results.push(update)
    }
    expect(results).toHaveLength(0)
  })

  test('clears progressAvailableResolve', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    executor.discard()

    const resolve = (
      executor as unknown as { progressAvailableResolve?: () => void }
    ).progressAvailableResolve
    expect(resolve).toBeUndefined()
  })

  test('can be called multiple times without error', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    expect(() => {
      executor.discard()
      executor.discard()
      executor.discard()
    }).not.toThrow()
  })

  test('releases references to allow GC of discarded executor', () => {
    const ctx = makeMinimalContext()
    const executor = new StreamingToolExecutor([], () => true as any, ctx)

    executor.discard()

    // All internal references should be cleared/released
    const internals = executor as unknown as {
      tools: unknown[]
      progressAvailableResolve?: () => void
      turnSpan: unknown
    }
    expect(internals.tools).toHaveLength(0)
    expect(internals.progressAvailableResolve).toBeUndefined()
    expect(internals.turnSpan).toBeNull()
  })
})
