import { expect, test } from 'bun:test'
import { createBufferingEmitter } from '../progress/events.js'
import {
  createEngineContext,
  createSharedResources,
} from '../engine/context.js'
import { WorkflowError } from '../engine/errors.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'

function mockPorts(): WorkflowPorts {
  return {
    agentRunner: { runAgentToResult: async () => ({ kind: 'dead' }) },
    progressEmitter: { emit: () => {} },
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
      cwd: '/tmp',
      budgetTotal: null,
    }),
  }
}

test('createSharedResources 初始化预算与计数', () => {
  const r = createSharedResources(100)
  expect(r.budget.total).toBe(100)
  expect(r.agentCountBox.value).toBe(0)
  expect(r.depth).toBe(0)
})

test('createEngineContext 复制 journal 并重置游标', () => {
  const journal = [
    {
      key: 'k',
      seq: 0,
      result: { kind: 'ok' as const, output: 'x', usage: { outputTokens: 1 } },
    },
  ]
  const ctx = createEngineContext({
    ports: mockPorts(),
    host: createHostHandle(null),
    signal: new AbortController().signal,
    runId: 'r1',
    workflowName: 'w',
    cwd: '/tmp',
    budgetTotal: null,
    journal,
  })
  expect(ctx.journal).toHaveLength(1)
  expect(ctx.journalIndex).toBe(0)
  expect(ctx.journalInvalidated).toBe(false)
})

test('createBufferingEmitter 收集事件', () => {
  const { emitter, events } = createBufferingEmitter()
  emitter.emit({ type: 'log', runId: 'r', message: 'hi' })
  expect(events).toHaveLength(1)
})

test('WorkflowError 可识别', () => {
  const e = new WorkflowError('boom')
  expect(e).toBeInstanceOf(Error)
  expect(e.message).toBe('boom')
})
