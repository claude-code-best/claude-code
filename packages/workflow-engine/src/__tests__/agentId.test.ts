import { expect, test } from 'bun:test'
import { createEngineContext } from '../engine/context.js'
import { makeHooks } from '../engine/hooks.js'
import { createBufferingEmitter } from '../progress/events.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'
import type { AgentRunParams, AgentRunResult } from '../types.js'

function build(results: Map<string, AgentRunResult>) {
  const { emitter, events } = createBufferingEmitter()
  const ports: WorkflowPorts = {
    agentRunner: {
      runAgentToResult: async (p: AgentRunParams) =>
        results.get(p.prompt) ?? { kind: 'dead' },
    },
    progressEmitter: emitter,
    taskRegistrar: {
      register: () => ({ runId: 'r', signal: new AbortController().signal }),
      complete: () => {},
      fail: () => {},
      kill: () => {},
      pendingAction: () => null,
    },
    journalStore: {
      read: async () => [],
      append: async () => {},
      truncate: async () => {},
    },
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({
      handle: createHostHandle(null),
      signal: new AbortController().signal,
      cwd: '/tmp',
      budgetTotal: null,
    }),
  }
  const ctx = createEngineContext({
    ports,
    host: createHostHandle(null),
    signal: new AbortController().signal,
    runId: 'r',
    workflowName: 'w',
    cwd: '/tmp',
    budgetTotal: null,
  })
  return { ctx, events, hooks: makeHooks(ctx, async () => null) }
}

test('concurrent agents each get a unique agentId, started/done are paired', async () => {
  const ok = (out: string): AgentRunResult => ({
    kind: 'ok',
    output: out,
    usage: { outputTokens: 1 },
  })
  const { ctx, events, hooks } = build(
    new Map([
      ['a', ok('1')],
      ['b', ok('2')],
    ]),
  )
  await hooks.parallel([() => hooks.agent('a'), () => hooks.agent('b')])
  const started = events.filter(e => e.type === 'agent_started')
  const done = events.filter(e => e.type === 'agent_done')
  expect(started).toHaveLength(2)
  expect(done).toHaveLength(2)
  const ids = started.map(e => (e as { agentId: number }).agentId)
  expect(new Set(ids).size).toBe(2)
  for (const d of done as Array<{ agentId: number }>) {
    expect(ids).toContain(d.agentId)
  }
  expect(ctx.resources.agentIdSeq.value).toBe(2)
})

test('agentId increases monotonically', async () => {
  const ok = (out: string): AgentRunResult => ({
    kind: 'ok',
    output: out,
    usage: { outputTokens: 1 },
  })
  const { events, hooks } = build(
    new Map([
      ['a', ok('1')],
      ['b', ok('2')],
      ['c', ok('3')],
    ]),
  )
  await hooks.agent('a')
  await hooks.agent('b')
  await hooks.agent('c')
  const ids = events
    .filter(e => e.type === 'agent_started')
    .map(e => (e as { agentId: number }).agentId)
  expect(ids).toEqual([0, 1, 2])
})
