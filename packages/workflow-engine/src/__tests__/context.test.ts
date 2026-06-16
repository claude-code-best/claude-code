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

test('createSharedResources initializes budget and counts', () => {
  const r = createSharedResources(100)
  expect(r.budget.total).toBe(100)
  expect(r.agentCountBox.value).toBe(0)
  expect(r.depth).toBe(0)
})

test('createSharedResources: maxConcurrency controls semaphore permits', async () => {
  // default permits = DEFAULT_MAX_CONCURRENCY = 3: after 4 acquires the 4th is pending
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
  releases1[0]!() // release one, the fourth should be woken up
  releases1.push(await pending)
  for (const rel of releases1) rel()

  // explicit maxConcurrency=2: the 3rd acquire is pending
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

test('createEngineContext passes maxConcurrency through to resources.semaphore', async () => {
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
  // maxConcurrency=1: the second acquire should be pending
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

test('createEngineContext copies journal and resets cursor', () => {
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

test('createBufferingEmitter collects events', () => {
  const { emitter, events } = createBufferingEmitter()
  emitter.emit({ type: 'log', runId: 'r', message: 'hi' })
  expect(events).toHaveLength(1)
})

test('WorkflowError is recognizable', () => {
  const e = new WorkflowError('boom')
  expect(e).toBeInstanceOf(Error)
  expect(e.message).toBe('boom')
})
