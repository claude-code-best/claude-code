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

test('createSharedResources：maxConcurrency 控制 semaphore permits', async () => {
  // 默认 permits = DEFAULT_MAX_CONCURRENCY = 3：4 次 acquire 后第 4 次 pending
  const r1 = createSharedResources(null)
  const releases1: Array<() => void> = []
  for (let i = 0; i < 3; i++) releases1.push(await r1.semaphore.acquire())
  let fourthResolved = false
  const pending = r1.semaphore.acquire().then(r => {
    fourthResolved = true
    return r
  })
  await new Promise(res => {
    setTimeout(res, 5)
  })
  expect(fourthResolved).toBe(false)
  releases1[0]!() // 释放一个，第四个应被唤醒
  releases1.push(await pending)
  for (const rel of releases1) rel()

  // 显式 maxConcurrency=2：第 3 次 acquire pending
  const r2 = createSharedResources(null, 2)
  const releases2: Array<() => void> = []
  releases2.push(await r2.semaphore.acquire())
  releases2.push(await r2.semaphore.acquire())
  let thirdResolved = false
  const pending2 = r2.semaphore.acquire().then(r => {
    thirdResolved = true
    return r
  })
  await new Promise(res => {
    setTimeout(res, 5)
  })
  expect(thirdResolved).toBe(false)
  releases2[0]!()
  releases2.push(await pending2)
  for (const rel of releases2) rel()
})

test('createEngineContext 透传 maxConcurrency 到 resources.semaphore', async () => {
  const ctx = createEngineContext({
    ports: mockPorts(),
    host: createHostHandle(null),
    signal: new AbortController().signal,
    runId: 'r-mc',
    workflowName: 'w',
    cwd: '/tmp',
    budgetTotal: null,
    maxConcurrency: 1,
  })
  // maxConcurrency=1：第二次 acquire 应 pending
  const first = await ctx.resources.semaphore.acquire()
  let secondResolved = false
  const pending = ctx.resources.semaphore.acquire().then(r => {
    secondResolved = true
    return r
  })
  await new Promise(res => {
    setTimeout(res, 5)
  })
  expect(secondResolved).toBe(false)
  first()
  await pending
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
