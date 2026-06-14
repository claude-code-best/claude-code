import { expect, test } from 'bun:test'
import { AgentAdapterRegistry } from '../agentAdapter.js'
import { createEngineContext } from '../engine/context.js'
import { maxConcurrency, Semaphore } from '../engine/concurrency.js'
import { agentCallKey } from '../engine/journal.js'
import { makeHooks, type SubWorkflowRunner } from '../engine/hooks.js'
import { WorkflowError, WorkflowAbortedError } from '../engine/errors.js'
import { createBufferingEmitter } from '../progress/events.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'
import type {
  AgentRunParams,
  AgentRunResult,
  JournalEntry,
  ProgressEvent,
} from '../types.js'

type CtxOverrides = Partial<{
  agentResults: Map<string, AgentRunResult>
  runner: (params: AgentRunParams) => Promise<AgentRunResult>
  pending: { kind: 'skip' | 'retry' } | null
  journal: JournalEntry[]
  budgetTotal: number | null
  signal: AbortSignal
  truncated: string[]
  agentAdapterRegistry: AgentAdapterRegistry
  loggerWarn: (msg: string) => void
  // taskRegistrar agent-level abort binding (agent kill bridge).
  // When provided, buildCtx injects it into ports.taskRegistrar; hooks.agent pushes the closure into adapterCtx.
  registerAgentAbort: (
    runId: string,
    agentId: number,
    ac: AbortController,
  ) => void
  unregisterAgentAbort: (runId: string, agentId: number) => void
}>

function buildCtx(overrides: CtxOverrides = {}): {
  ctx: ReturnType<typeof createEngineContext>
  events: ProgressEvent[]
  hooks: ReturnType<typeof makeHooks>
} {
  const { emitter, events } = createBufferingEmitter()
  const results = overrides.agentResults ?? new Map<string, AgentRunResult>()
  const ports: WorkflowPorts = {
    agentRunner: {
      runAgentToResult: overrides.runner
        ? overrides.runner
        : async (params: AgentRunParams) =>
            results.get(params.prompt) ?? { kind: 'dead' },
    },
    ...(overrides.agentAdapterRegistry
      ? { agentAdapterRegistry: overrides.agentAdapterRegistry }
      : {}),
    progressEmitter: emitter,
    taskRegistrar: {
      register: () => ({ runId: 'r', signal: new AbortController().signal }),
      complete: () => {},
      fail: () => {},
      kill: () => {},
      pendingAction: () => overrides.pending ?? null,
      ...(overrides.registerAgentAbort
        ? { registerAgentAbort: overrides.registerAgentAbort }
        : {}),
      ...(overrides.unregisterAgentAbort
        ? { unregisterAgentAbort: overrides.unregisterAgentAbort }
        : {}),
    },
    journalStore: {
      read: async () => [],
      append: async () => {},
      truncate: async (id: string) => {
        overrides.truncated?.push(id)
      },
    },
    permissionGate: { isAborted: () => false },
    logger: {
      debug: () => {},
      event: () => {},
      ...(overrides.loggerWarn ? { warn: overrides.loggerWarn } : {}),
    },
    hostFactory: () => ({
      handle: createHostHandle(null),
      cwd: '/tmp',
      budgetTotal: null,
    }),
  }
  const ctx = createEngineContext({
    ports,
    host: createHostHandle(null),
    signal: overrides.signal ?? new AbortController().signal,
    runId: 'r1',
    workflowName: 'w',
    cwd: '/tmp',
    budgetTotal: overrides.budgetTotal ?? null,
    journal: overrides.journal,
  })
  const noopSub: SubWorkflowRunner = async () => null
  return { ctx, events, hooks: makeHooks(ctx, noopSub) }
}

test('agent returns text result and counts', async () => {
  const { ctx, hooks } = buildCtx({
    agentResults: new Map([
      ['hi', { kind: 'ok', output: 'hello', usage: { outputTokens: 5 } }],
    ]),
  })
  const out = await hooks.agent('hi')
  expect(out).toBe('hello')
  expect(ctx.resources.agentCountBox.value).toBe(1)
})

test('agent skipped → null and not counted', async () => {
  const { hooks } = buildCtx({
    agentResults: new Map([['hi', { kind: 'skipped' }]]),
  })
  expect(await hooks.agent('hi')).toBeNull()
})

test('agent dead → null', async () => {
  const { hooks } = buildCtx({
    agentResults: new Map([['hi', { kind: 'dead' }]]),
  })
  expect(await hooks.agent('hi')).toBeNull()
})

// Retry: dead or non-abort throw both get one retry chance; WorkflowAbortedError (kill) is not retried.
// Retry still fails: dead stays dead; throw degrades to dead (does not break the workflow, hooks.agent returns null).
test('agent dead → retry once succeeds → ok', async () => {
  let calls = 0
  const { hooks } = buildCtx({
    runner: async () => {
      calls++
      return calls === 1
        ? { kind: 'dead' as const }
        : {
            kind: 'ok' as const,
            output: 'recovered',
            usage: { outputTokens: 5 },
          }
    },
  })
  expect(await hooks.agent('p')).toBe('recovered')
  expect(calls).toBe(2)
})

test('agent dead → retry still dead → final null (dead stays dead)', async () => {
  let calls = 0
  const { hooks } = buildCtx({
    runner: async () => {
      calls++
      return { kind: 'dead' as const }
    },
    loggerWarn: () => {},
  })
  expect(await hooks.agent('p')).toBeNull()
  expect(calls).toBe(2)
})

test('agent non-abort throw → retry once succeeds → ok', async () => {
  let calls = 0
  const { hooks } = buildCtx({
    runner: async () => {
      calls++
      if (calls === 1) throw new Error('transient network')
      return {
        kind: 'ok' as const,
        output: 'recovered',
        usage: { outputTokens: 3 },
      }
    },
    loggerWarn: () => {},
  })
  expect(await hooks.agent('p')).toBe('recovered')
  expect(calls).toBe(2)
})

test('agent non-abort throw → retry still throws → degrade to dead (returns null, does not break workflow)', async () => {
  let calls = 0
  const { hooks } = buildCtx({
    runner: async () => {
      calls++
      throw new Error('persistent')
    },
    loggerWarn: () => {},
  })
  expect(await hooks.agent('p')).toBeNull()
  expect(calls).toBe(2)
})

test('agent throw WorkflowAbortedError → no retry, rethrow directly (kill does not allow retry)', async () => {
  let calls = 0
  const { hooks } = buildCtx({
    runner: async () => {
      calls++
      throw new WorkflowAbortedError()
    },
  })
  await expect(hooks.agent('p')).rejects.toBeInstanceOf(WorkflowAbortedError)
  expect(calls).toBe(1)
})

test('agent ok → no retry (calls=1, saves a backend round-trip)', async () => {
  let calls = 0
  const { hooks } = buildCtx({
    runner: async () => {
      calls++
      return {
        kind: 'ok' as const,
        output: 'first-try',
        usage: { outputTokens: 1 },
      }
    },
  })
  expect(await hooks.agent('p')).toBe('first-try')
  expect(calls).toBe(1)
})

test('agent skipped → no retry (user actively skips, no retry)', async () => {
  let calls = 0
  const { hooks } = buildCtx({
    runner: async () => {
      calls++
      return { kind: 'skipped' as const }
    },
  })
  expect(await hooks.agent('p')).toBeNull()
  expect(calls).toBe(1)
})

test('agent journal hit does not call runner', async () => {
  let called = 0
  const { emitter } = createBufferingEmitter()
  const ports: WorkflowPorts = {
    agentRunner: {
      runAgentToResult: async () => {
        called++
        return { kind: 'ok', output: 'live', usage: { outputTokens: 1 } }
      },
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
      cwd: '/tmp',
      budgetTotal: null,
    }),
  }
  const key = agentCallKey('hi', { prompt: 'hi' })
  const ctx = createEngineContext({
    ports,
    host: createHostHandle(null),
    signal: new AbortController().signal,
    runId: 'r1',
    workflowName: 'w',
    cwd: '/tmp',
    budgetTotal: null,
    journal: [
      {
        key,
        seq: 0,
        result: { kind: 'ok', output: 'cached', usage: { outputTokens: 1 } },
      },
    ],
  })
  const hooks = makeHooks(ctx, async () => null)
  expect(await hooks.agent('hi')).toBe('cached')
  expect(called).toBe(0)
})

test('agent exceeding total cap throws', async () => {
  const { hooks, ctx } = buildCtx()
  ctx.resources.agentCountBox.value = 1000
  await expect(hooks.agent('hi')).rejects.toThrow(WorkflowError)
})

test('parallel single item throws → null, others kept', async () => {
  const { hooks } = buildCtx()
  const out = await hooks.parallel([
    async () => 'a',
    async () => {
      throw new Error('x')
    },
    async () => 'c',
  ])
  expect(out).toEqual(['a', null, 'c'])
})

test('parallel single item throws → logger.warn records the failure reason', async () => {
  const warns: string[] = []
  const { hooks } = buildCtx({ loggerWarn: msg => warns.push(msg) })
  await hooks.parallel([
    async () => 'a',
    async () => {
      throw new Error('boom-x')
    },
    async () => 'c',
  ])
  expect(warns.length).toBe(1)
  expect(warns[0]).toMatch(/boom-x/)
})

test('pipeline chains stage by stage, stage throws → null', async () => {
  const { hooks } = buildCtx()
  const out = await hooks.pipeline(
    [1, 2],
    n => Promise.resolve((n as number) + 1),
    m => Promise.resolve((m as number) * 10),
  )
  expect(out).toEqual([20, 30])
  const out2 = await hooks.pipeline(
    [1],
    () => Promise.reject(new Error('boom')),
    m => Promise.resolve(m),
  )
  expect(out2).toEqual([null])
})

test('pipeline stage throws → logger.warn records the failure reason', async () => {
  const warns: string[] = []
  const { hooks } = buildCtx({ loggerWarn: msg => warns.push(msg) })
  await hooks.pipeline(
    [1],
    () => Promise.reject(new Error('stage-boom')),
    m => Promise.resolve(m),
  )
  expect(warns.length).toBe(1)
  expect(warns[0]).toMatch(/stage-boom/)
})

test('pipeline over 4096 throws', async () => {
  const { hooks } = buildCtx()
  await expect(
    hooks.pipeline(Array(4097), () => Promise.resolve(1)),
  ).rejects.toThrow(WorkflowError)
})

test('phase switch emits phase_started/done; log emits log', () => {
  const { hooks, events } = buildCtx()
  hooks.phase('A')
  hooks.log('hello')
  hooks.phase('B')
  expect(events.some(e => e.type === 'phase_started' && e.phase === 'A')).toBe(
    true,
  )
  expect(events.some(e => e.type === 'phase_done' && e.phase === 'A')).toBe(
    true,
  )
  expect(events.some(e => e.type === 'log' && e.message === 'hello')).toBe(true)
  expect(events.some(e => e.type === 'phase_started' && e.phase === 'B')).toBe(
    true,
  )
})

// ---- boundary and error paths ----

test('agent dead also counts in agentCountBox', async () => {
  const { hooks, ctx } = buildCtx({
    agentResults: new Map([['x', { kind: 'dead' }]]),
  })
  await hooks.agent('x')
  expect(ctx.resources.agentCountBox.value).toBe(1)
})

test('agent pendingAction=skip → null, does not call runner, not counted', async () => {
  let called = 0
  const { hooks, ctx } = buildCtx({
    pending: { kind: 'skip' },
    runner: async () => {
      called++
      return { kind: 'ok', output: 'x', usage: { outputTokens: 1 } }
    },
  })
  expect(await hooks.agent('x')).toBeNull()
  expect(called).toBe(0)
  expect(ctx.resources.agentCountBox.value).toBe(0)
})

test('agent journal key diverges → invalidate and truncate', async () => {
  const truncated: string[] = []
  const { hooks, ctx } = buildCtx({
    runner: async () => ({
      kind: 'ok',
      output: 'live',
      usage: { outputTokens: 1 },
    }),
    journal: [
      {
        key: 'stale-key',
        seq: 0,
        result: { kind: 'ok', output: 'old', usage: { outputTokens: 1 } },
      },
    ],
    truncated,
  })
  const out = await hooks.agent('different-prompt')
  expect(out).toBe('live')
  expect(truncated).toContain('r1')
  expect(ctx.journalInvalidated).toBe(true)
})

test('agent throws when budget exhausted', async () => {
  const { hooks, ctx } = buildCtx({
    budgetTotal: 10,
    runner: async () => ({
      kind: 'ok',
      output: 'x',
      usage: { outputTokens: 1 },
    }),
  })
  ctx.resources.budget.addOutputTokens(10)
  await expect(hooks.agent('x')).rejects.toThrow()
})

test('agent budget check inside semaphore critical section (queued waiter sees latest spent)', async () => {
  // When semaphore capacity < parallel agent count, some agents will queue.
  // Old bug: assertCanSpend was before acquire, all waiters entered the queue with spent=0 and passed the check;
  // after permits released waiters ran the runner and deducted the budget without re-checking → all over-spent.
  // Fix: assertCanSpend moved into the critical section; waiters check spent after being woken before deciding to run.
  // Force capacity=1 (serializing semaphore) to ensure N>1 agents must queue.
  const { hooks, ctx } = buildCtx({
    budgetTotal: 10,
    runner: async () => {
      // make the runner a bit slow to ensure waiters truly queue
      await new Promise(r => {
        setTimeout(r, 5)
      })
      return {
        kind: 'ok',
        output: 'x',
        usage: { outputTokens: 6 }, // 6 tokens each, 2 runs exceed 10
      }
    },
  })
  // replace the default semaphore with a single-permit one, forcing serialization
  ctx.resources.semaphore = new Semaphore(1)
  const results = await hooks.parallel([
    () => hooks.agent('a'),
    () => hooks.agent('b'),
    () => hooks.agent('c'),
    () => hooks.agent('d'),
  ])
  // at least 1 agent is caught as null by parallel (assertCanSpend throws)
  expect(results.some(r => r === null)).toBe(true)
  // not all 4 should run and spend 24; the cap is at-most-one-over (first two spend 12, last two blocked)
  expect(ctx.resources.budget.spent()).toBeLessThanOrEqual(12)
})

test('agent signal aborted → WorkflowAbortedError', async () => {
  const ac = new AbortController()
  ac.abort()
  const { hooks } = buildCtx({
    signal: ac.signal,
    runner: async () => ({
      kind: 'ok',
      output: 'x',
      usage: { outputTokens: 1 },
    }),
  })
  await expect(hooks.agent('x')).rejects.toThrow(WorkflowAbortedError)
})

test('parallel over 4096 items throws', async () => {
  const { hooks } = buildCtx()
  await expect(
    hooks.parallel(Array.from({ length: 4097 }, () => async () => 1)),
  ).rejects.toThrow(WorkflowError)
})

test('workflow() nesting beyond one level throws', async () => {
  const { hooks, ctx } = buildCtx()
  ctx.resources.depth = 1
  await expect(hooks.workflow('child')).rejects.toThrow(WorkflowError)
})

test('agent concurrency bounded by semaphore (does not exceed maxConcurrency)', async () => {
  let active = 0
  let peak = 0
  const { hooks } = buildCtx({
    runner: async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise(r => {
        setTimeout(r, 5)
      })
      active--
      return { kind: 'ok', output: 'x', usage: { outputTokens: 1 } }
    },
  })
  await hooks.parallel(Array.from({ length: 32 }, () => () => hooks.agent('p')))
  expect(peak).toBeLessThanOrEqual(maxConcurrency())
})

test('agentAdapterRegistry takes priority over agentRunner (dispatched to adapter by route)', async () => {
  const called: string[] = []
  const registry = new AgentAdapterRegistry()
    .register({
      id: 'ad',
      capabilities: { structuredOutput: true },
      async run() {
        called.push('adapter')
        return {
          kind: 'ok',
          output: 'from-adapter',
          usage: { outputTokens: 1 },
        }
      },
    })
    .default('ad')
  const { hooks } = buildCtx({
    agentAdapterRegistry: registry,
    runner: async () => {
      called.push('runner')
      return { kind: 'ok', output: 'from-runner', usage: { outputTokens: 1 } }
    },
  })
  expect(await hooks.agent('x')).toBe('from-adapter')
  expect(called).toEqual(['adapter'])
})

test('agentAdapterRegistry resolve throws → agent rethrows (workflow failed)', async () => {
  const registry = new AgentAdapterRegistry().default('missing') // not registered
  const { hooks } = buildCtx({
    agentAdapterRegistry: registry,
    runner: async () => ({
      kind: 'ok',
      output: 'x',
      usage: { outputTokens: 1 },
    }),
  })
  await expect(hooks.agent('x')).rejects.toThrow()
})

// service.kill(runId, agentId) bridge: hooks.agent must inject taskRegistrar's
// registerAgentAbort/unregisterAgentAbort into adapterCtx (bound to the current runId).
// The backend puts the agentAbort controller into a Map based on this; service.kill aborts precisely by agentId.
test('agentAdapter ctx injects registerAgentAbort/unregisterAgentAbort (bound to runId, forwards to taskRegistrar)', async () => {
  const registered: Array<{
    runId: string
    agentId: number
    controller: AbortController
  }> = []
  const unregistered: Array<{ runId: string; agentId: number }> = []
  // capture the ctx hooks pass to the adapter (verify register/unregister are injected and bound to runId)
  let capturedCtx: {
    registerAgentAbort?: (id: number, ac: AbortController) => void
    unregisterAgentAbort?: (id: number) => void
    agentId: number
    runId: string
  } | null = null
  const registry = new AgentAdapterRegistry()
    .register({
      id: 'ad',
      capabilities: { structuredOutput: true },
      async run(_params, ctx) {
        capturedCtx = ctx
        return { kind: 'ok', output: 'x', usage: { outputTokens: 1 } }
      },
    })
    .default('ad')
  const { hooks } = buildCtx({
    agentAdapterRegistry: registry,
    registerAgentAbort: (runId, agentId, controller) =>
      registered.push({ runId, agentId, controller }),
    unregisterAgentAbort: (runId, agentId) =>
      unregistered.push({ runId, agentId }),
  })
  await hooks.agent('x')
  // ctx contains register/unregister (closure bound to runId='r1')
  expect(capturedCtx).not.toBeNull()
  expect(typeof capturedCtx!.registerAgentAbort).toBe('function')
  expect(typeof capturedCtx!.unregisterAgentAbort).toBe('function')
  // simulate backend call: the injected closure forwards (agentId, controller) to taskRegistrar,
  // and auto-fills runId='r1' (backend does not need to know runId)
  const ac = new AbortController()
  capturedCtx!.registerAgentAbort!(7, ac)
  capturedCtx!.unregisterAgentAbort!(7)
  expect(registered).toEqual([{ runId: 'r1', agentId: 7, controller: ac }])
  expect(unregistered).toEqual([{ runId: 'r1', agentId: 7 }])
})

test('taskRegistrar does not provide registerAgentAbort → adapterCtx also lacks it (hooks do not error)', async () => {
  // without registerAgentAbort/unregisterAgentAbort overrides → buildCtx does not inject taskRegistrar either
  // hooks skip via optional chaining; adapterCtx lacks these two fields
  let capturedCtx: object | null = null
  const registry = new AgentAdapterRegistry()
    .register({
      id: 'ad',
      capabilities: { structuredOutput: true },
      async run(_params, ctx) {
        capturedCtx = ctx
        return { kind: 'ok', output: 'x', usage: { outputTokens: 1 } }
      },
    })
    .default('ad')
  const { hooks } = buildCtx({ agentAdapterRegistry: registry })
  await hooks.agent('x')
  expect(capturedCtx).not.toBeNull()
  expect(
    (capturedCtx! as Record<string, unknown>).registerAgentAbort,
  ).toBeUndefined()
})
