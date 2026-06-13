import { expect, test } from 'bun:test'
import { createProgressBus, type ProgressBus } from '../progress/bus.js'
import { createProgressStoreFromBus } from '../progress/store.js'
import type { AgentRunResult } from '@claude-code-best/workflow-engine'

const ok = (o: string): AgentRunResult => ({
  kind: 'ok',
  output: o,
  usage: { outputTokens: 1 },
})

function newStore() {
  const bus: ProgressBus = createProgressBus()
  return { bus, store: createProgressStoreFromBus(bus) }
}

test('run_started 建条目；phase_started/done 更新 phases', () => {
  const { bus, store } = newStore()
  bus.emit({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null })
  bus.emit({ type: 'phase_started', runId: 'r1', phase: 'A' })
  bus.emit({ type: 'phase_started', runId: 'r1', phase: 'B' })
  bus.emit({ type: 'phase_done', runId: 'r1', phase: 'A' })
  const r = store.get('r1')!
  expect(r.phases.map(p => [p.title, p.status])).toEqual([
    ['A', 'done'],
    ['B', 'running'],
  ])
  expect(r.currentPhase).toBe('B')
})

test('并发 agent_done 按 agentId 精确关联（回归旧 LIFO 竞态）', () => {
  const { bus, store } = newStore()
  bus.emit({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null })
  bus.emit({
    type: 'agent_started',
    runId: 'r1',
    agentId: 0,
    label: 'a',
    phase: 'A',
  })
  bus.emit({
    type: 'agent_started',
    runId: 'r1',
    agentId: 1,
    label: 'b',
    phase: 'A',
  })
  bus.emit({
    type: 'agent_done',
    runId: 'r1',
    agentId: 1,
    label: 'b',
    phase: 'A',
    result: ok('b-out'),
  })
  bus.emit({
    type: 'agent_done',
    runId: 'r1',
    agentId: 0,
    label: 'a',
    phase: 'A',
    result: ok('a-out'),
  })
  const agents = store.get('r1')!.agents
  expect(agents.find(x => x.id === 0)?.status).toBe('done')
  expect(agents.find(x => x.id === 1)?.status).toBe('done')
  expect(agents.find(x => x.id === 0)?.label).toBe('a')
  expect(agents.find(x => x.id === 1)?.label).toBe('b')
})

test('journal 命中（仅 agent_done 无 started）按 id 补建 done 条目', () => {
  const { bus, store } = newStore()
  bus.emit({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null })
  bus.emit({
    type: 'agent_done',
    runId: 'r1',
    agentId: 7,
    label: 'c',
    phase: 'A',
    result: ok('c'),
  })
  const a = store.get('r1')!.agents.find(x => x.id === 7)!
  expect(a.status).toBe('done')
})

test('run_done 终态 + list 排序 + subscribe 通知', () => {
  const { bus, store } = newStore()
  let calls = 0
  store.subscribe(() => calls++)
  bus.emit({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null })
  bus.emit({
    type: 'run_done',
    runId: 'r1',
    status: 'completed',
    returnValue: 42,
  })
  const r = store.get('r1')!
  expect(r.status).toBe('completed')
  expect(r.returnValue).toBe(42)
  expect(store.list().map(x => x.runId)).toEqual(['r1'])
  expect(calls).toBe(2)
})

test('run_done failed 终态记录 error', () => {
  const { bus, store } = newStore()
  bus.emit({ type: 'run_started', runId: 'r2', workflowName: 'w', meta: null })
  bus.emit({ type: 'run_done', runId: 'r2', status: 'failed', error: 'boom' })
  const r = store.get('r2')!
  expect(r.status).toBe('failed')
  expect(r.error).toBe('boom')
})

test('log 事件不触发 notify', () => {
  const { bus, store } = newStore()
  let calls = 0
  store.subscribe(() => calls++)
  bus.emit({ type: 'run_started', runId: 'r3', workflowName: 'w', meta: null })
  const before = calls
  bus.emit({ type: 'log', runId: 'r3', message: 'hi' })
  expect(calls).toBe(before) // log 不应触发 notify
})

test('run_started 落地 declaredPhases（来自 meta.phases，顺序保留）', () => {
  const { bus, store } = newStore()
  bus.emit({
    type: 'run_started',
    runId: 'r1',
    workflowName: 'w',
    meta: {
      name: 'w',
      description: 'd',
      phases: [{ title: 'Find' }, { title: 'Review' }, { title: 'Verify' }],
    },
  })
  expect(store.get('r1')!.declaredPhases).toEqual(['Find', 'Review', 'Verify'])
})

test('run_started meta 为 null → declaredPhases = []', () => {
  const { bus, store } = newStore()
  bus.emit({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null })
  expect(store.get('r1')!.declaredPhases).toEqual([])
})

test('agent_done 落地 outputShape（ok·object / ok·text / dead 无）', () => {
  const { bus, store } = newStore()
  bus.emit({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null })
  bus.emit({ type: 'agent_started', runId: 'r1', agentId: 0, phase: 'A' })
  bus.emit({ type: 'agent_started', runId: 'r1', agentId: 1, phase: 'A' })
  bus.emit({ type: 'agent_started', runId: 'r1', agentId: 2, phase: 'A' })
  bus.emit({
    type: 'agent_done',
    runId: 'r1',
    agentId: 0,
    phase: 'A',
    result: { kind: 'ok', output: { x: 1 }, usage: { outputTokens: 1 } },
  })
  bus.emit({
    type: 'agent_done',
    runId: 'r1',
    agentId: 1,
    phase: 'A',
    result: { kind: 'ok', output: 'hi', usage: { outputTokens: 1 } },
  })
  bus.emit({
    type: 'agent_done',
    runId: 'r1',
    agentId: 2,
    phase: 'A',
    result: { kind: 'dead' },
  })
  const agents = store.get('r1')!.agents
  expect(agents.find(a => a.id === 0)?.outputShape).toBe('object')
  expect(agents.find(a => a.id === 1)?.outputShape).toBe('text')
  expect(agents.find(a => a.id === 2)?.outputShape).toBeUndefined()
})
