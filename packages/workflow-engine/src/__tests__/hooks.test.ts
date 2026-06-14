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
  // taskRegistrar 的 agent 级 abort 绑定（agent kill 桥接）。
  // 提供后 buildCtx 注入到 ports.taskRegistrar；hooks.agent 把闭包塞进 adapterCtx。
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

test('agent 返回文本结果并计数', async () => {
  const { ctx, hooks } = buildCtx({
    agentResults: new Map([
      ['hi', { kind: 'ok', output: 'hello', usage: { outputTokens: 5 } }],
    ]),
  })
  const out = await hooks.agent('hi')
  expect(out).toBe('hello')
  expect(ctx.resources.agentCountBox.value).toBe(1)
})

test('agent skipped → null 且不计数', async () => {
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

test('agent journal 命中时不调用 runner', async () => {
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

test('agent 超过总数上限抛错', async () => {
  const { hooks, ctx } = buildCtx()
  ctx.resources.agentCountBox.value = 1000
  await expect(hooks.agent('hi')).rejects.toThrow(WorkflowError)
})

test('parallel 单项抛错 → null，其余保留', async () => {
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

test('parallel 单项抛错 → logger.warn 记录失败原因', async () => {
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

test('pipeline 逐 stage 链式，stage 抛错 → null', async () => {
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

test('pipeline stage 抛错 → logger.warn 记录失败原因', async () => {
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

test('pipeline 超 4096 抛错', async () => {
  const { hooks } = buildCtx()
  await expect(
    hooks.pipeline(Array(4097), () => Promise.resolve(1)),
  ).rejects.toThrow(WorkflowError)
})

test('phase 切换发射 phase_started/done；log 发射 log', () => {
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

// ---- 边界与错误路径 ----

test('agent dead 也计入 agentCountBox', async () => {
  const { hooks, ctx } = buildCtx({
    agentResults: new Map([['x', { kind: 'dead' }]]),
  })
  await hooks.agent('x')
  expect(ctx.resources.agentCountBox.value).toBe(1)
})

test('agent pendingAction=skip → null、不调 runner、不计数', async () => {
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

test('agent journal key 发散 → invalidate 并 truncate', async () => {
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

test('agent 预算耗尽时抛错', async () => {
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

test('agent 预算检查在 semaphore 临界区内（queued waiter 看到最新 spent）', async () => {
  // 当 semaphore capacity < parallel agent 数时，部分 agent 会排队。
  // 旧 bug：assertCanSpend 在 acquire 之前，所有 waiter 入队时 spent=0 都过检；
  // 后续 permit 释放后 waiter 直接跑 runner、扣预算，不再 re-check → 全部超支。
  // 修复：assertCanSpend 移入临界区，waiter 被唤醒后先看 spent 再决定是否跑。
  // 强制 capacity=1（serializing semaphore）确保 N>1 个 agent 必须排队。
  const { hooks, ctx } = buildCtx({
    budgetTotal: 10,
    runner: async () => {
      // 让 runner 慢一点，确保 waiter 真的排队
      await new Promise(r => {
        setTimeout(r, 5)
      })
      return {
        kind: 'ok',
        output: 'x',
        usage: { outputTokens: 6 }, // 每次 6 token，2 次即超 10
      }
    },
  })
  // 用单 permit semaphore 替换默认的，强制序列化
  ctx.resources.semaphore = new Semaphore(1)
  const results = await hooks.parallel([
    () => hooks.agent('a'),
    () => hooks.agent('b'),
    () => hooks.agent('c'),
    () => hooks.agent('d'),
  ])
  // 至少 1 个 agent 被 parallel catch 成 null（assertCanSpend 抛错）
  expect(results.some(r => r === null)).toBe(true)
  // 不应 4 个全跑扣 24；上限是 at-most-one-over（前两个扣 12，后两个被拦）
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

test('parallel 超过 4096 项抛错', async () => {
  const { hooks } = buildCtx()
  await expect(
    hooks.parallel(Array.from({ length: 4097 }, () => async () => 1)),
  ).rejects.toThrow(WorkflowError)
})

test('workflow() 嵌套超过一层抛错', async () => {
  const { hooks, ctx } = buildCtx()
  ctx.resources.depth = 1
  await expect(hooks.workflow('child')).rejects.toThrow(WorkflowError)
})

test('agent 并发受 semaphore 限制（不超 maxConcurrency）', async () => {
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

test('agentAdapterRegistry 优先于 agentRunner（按路由分发到 adapter）', async () => {
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

test('agentAdapterRegistry resolve 抛错 → agent 上抛（workflow failed）', async () => {
  const registry = new AgentAdapterRegistry().default('missing') // 未注册
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

// service.kill(runId, agentId) 桥接：hooks.agent 必须把 taskRegistrar 的
// registerAgentAbort/unregisterAgentAbort 注入 adapterCtx（绑定当前 runId）。
// backend 据此把 agentAbort controller 塞进 Map，service.kill 据 agentId 精确 abort。
test('agentAdapter ctx 注入 registerAgentAbort/unregisterAgentAbort（绑定 runId 转发 taskRegistrar）', async () => {
  const registered: Array<{
    runId: string
    agentId: number
    controller: AbortController
  }> = []
  const unregistered: Array<{ runId: string; agentId: number }> = []
  // 捕获 hooks 传给 adapter 的 ctx（验证 register/unregister 已注入且绑定 runId）
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
  // ctx 含 register/unregister（闭包绑定 runId='r1'）
  expect(capturedCtx).not.toBeNull()
  expect(typeof capturedCtx!.registerAgentAbort).toBe('function')
  expect(typeof capturedCtx!.unregisterAgentAbort).toBe('function')
  // 模拟 backend 调用：注入的闭包把 (agentId, controller) 转发到 taskRegistrar，
  // 并自动补 runId='r1'（backend 不需要知道 runId）
  const ac = new AbortController()
  capturedCtx!.registerAgentAbort!(7, ac)
  capturedCtx!.unregisterAgentAbort!(7)
  expect(registered).toEqual([{ runId: 'r1', agentId: 7, controller: ac }])
  expect(unregistered).toEqual([{ runId: 'r1', agentId: 7 }])
})

test('taskRegistrar 未提供 registerAgentAbort → adapterCtx 也不含（hooks 不报错）', async () => {
  // 不传 registerAgentAbort/unregisterAgentAbort overrides → buildCtx 也不注入 taskRegistrar
  // hooks 用 optional chaining 跳过，adapterCtx 不含这两个字段
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
