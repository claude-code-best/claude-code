import { expect, test } from 'bun:test'
// DI 模式：不使用 mock.module（进程全局、last-write-wins，会污染同进程其他测试如
// autonomy.test.ts）。改为手工构造 FAKE WorkflowPorts：registry.run 返回固定 ok
// 结果，taskRegistrar 维护 abort 绑定，journalStore 内存空实现。真实 runWorkflow
// 因此跑完且无需 LLM 或 mock。

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeService, __resetWorkflowServiceForTests } from '../service.js'
import { createProgressBus } from '../progress/bus.js'
import {
  createProgressStoreFromBus,
  type RunProgress,
} from '../progress/store.js'
import type {
  AgentRunResult,
  ProgressEvent,
  WorkflowPorts,
} from '@claude-code-best/workflow-engine'

// 构造 FAKE ports：registry.run 返回固定 AgentRunResult，taskRegistrar 带 binding，
// journalStore 内存空实现。progressEmitter.emit → bus.emit（store 已在构造时订阅 bus）。
// 注意：runWorkflow 自身会发 run_started/run_done；taskRegistrar 只管 abort 绑定，
// 不重复发事件（避免 store reducer 收到重复 run_done）。
type RegistrarCall =
  | { kind: 'complete'; runId: string; summary?: string }
  | { kind: 'fail'; runId: string; error?: string }
  | { kind: 'kill'; runId: string }

function fakePorts(
  opts: {
    /** adapter.run 抛错（模拟 agent 后端崩溃）。 */
    adapterThrow?: string
    /** adapter.run 返回值（默认 ok）。 */
    adapterResult?: AgentRunResult
    /** agentRunner.runAgentToResult 返回值（fallback 路径，默认 throw）。 */
    runnerResult?: AgentRunResult
  } = {},
): {
  ports: WorkflowPorts
  store: ReturnType<typeof createProgressStoreFromBus>
  killed: string[]
  /** taskRegistrar 调用记录（complete/fail/kill）。 */
  calls: RegistrarCall[]
} {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const killed: string[] = []
  const calls: RegistrarCall[] = []
  const bindings = new Map<string, { abort: AbortController }>()
  let seq = 0
  const ports = {
    // hostFactory 实际不被 service.launch 路径调用（service 自建 host handle），
    // 但 WorkflowPorts 类型要求存在；保留一个最小实现。
    hostFactory: () => ({
      handle: {} as never,
      cwd: '/tmp',
      budgetTotal: null,
      toolUseId: 'tu',
    }),
    agentAdapterRegistry: {
      resolve: () => ({
        id: 'claude-code',
        capabilities: { structuredOutput: true },
        run:
          opts.adapterThrow !== undefined
            ? async (): Promise<AgentRunResult> => {
                throw new Error(opts.adapterThrow)
              }
            : async (): Promise<AgentRunResult> =>
                opts.adapterResult ?? {
                  kind: 'ok',
                  output: 'mock-out',
                  usage: { outputTokens: 1 },
                },
      }),
    },
    agentRunner: {
      runAgentToResult:
        opts.runnerResult !== undefined
          ? async () => opts.runnerResult
          : async () => {
              throw new Error('should not reach')
            },
    },
    progressEmitter: {
      emit: (e: ProgressEvent) => bus.emit(e),
    },
    taskRegistrar: {
      register: ({ workflowName }: { workflowName: string }) => {
        const abort = new AbortController()
        seq += 1
        const runId = `run-${seq}`
        bindings.set(runId, { abort })
        return { runId, signal: abort.signal }
      },
      complete: (runId: string, summary?: string) => {
        calls.push({ kind: 'complete', runId, summary })
      },
      fail: (runId: string, error?: string) => {
        calls.push({ kind: 'fail', runId, error })
      },
      kill: (runId: string) => {
        killed.push(runId)
        calls.push({ kind: 'kill', runId })
        bindings.get(runId)?.abort.abort()
      },
      pendingAction: () => null,
    },
    journalStore: {
      read: async () => [],
      append: async () => {},
      truncate: async () => {},
    },
    permissionGate: { isAborted: () => false },
    logger: {
      debug: () => {},
      event: () => {},
      warn: () => {},
    },
  } as unknown as WorkflowPorts
  return { ports, store, killed, calls }
}

const stubTUC = { agentId: 'a1', toolUseId: 'tu' } as never
const stubCanUseTool = (() => Promise.resolve({ behavior: 'allow' })) as never

/** 等待 detached runWorkflow 完成（detached 调用，需让微任务/宏任务排空）。 */
async function settle(): Promise<void> {
  await new Promise(r => setTimeout(r, 60))
}

test('launch → completed；store 出现该 run', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  const { runId } = await svc.launch(
    { script: `return agent('compute')` },
    stubTUC,
    stubCanUseTool,
  )
  await settle()
  const r = svc.getRun(runId)
  expect(r).toBeDefined()
  // detached 执行可能在 settle 窗口内仍 running，或已 completed——两者皆可接受。
  expect(['completed', 'running']).toContain(r!.status)
  expect(r!.workflowName).toBe('workflow')
})

test('launch inline script → 返回 scriptPath（持久化到 cwdOverride 目录）', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, dir)
    const result = await svc.launch(
      { script: `return agent('x')` },
      stubTUC,
      stubCanUseTool,
    )
    expect(result.scriptPath).toBe(
      join(dir, '.claude', 'workflow-runs', 'run-1', 'script.js'),
    )
    const { readFile } = await import('node:fs/promises')
    expect(await readFile(result.scriptPath!, 'utf-8')).toBe(
      `return agent('x')`,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('kill 走 taskRegistrar.kill', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, killed } = fakePorts()
  const svc = makeService(ports, store)
  const { runId } = await svc.launch(
    { script: `return agent('x')` },
    stubTUC,
    stubCanUseTool,
  )
  svc.kill(runId)
  expect(killed).toContain(runId)
})

test('listRuns/subscribe 来自 store', () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  expect(svc.listRuns()).toEqual([])
  let n = 0
  const unsub = svc.subscribe(() => {
    n++
  })
  expect(typeof unsub).toBe('function')
  unsub()
  expect(n).toBe(0)
})

test('listNamed 委托 namedWorkflows（空目录→[]；有文件→列出）', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  // 不存在的目录 → []
  const empty = await svc.listNamed(
    join(tmpdir(), `wf-nope-${Math.random().toString(36).slice(2)}`),
  )
  expect(empty).toEqual([])
  // 有命名文件的目录 → 列出 name（去扩展名，排序）
  const dir = await mkdtemp(join(tmpdir(), 'wf-named-'))
  try {
    await writeFile(
      join(dir, 'a.ts'),
      'export const meta = { name: "a", description: "d" }\nreturn 1',
    )
    await writeFile(join(dir, 'b.js'), 'return 2')
    const names = await svc.listNamed(dir)
    expect(names).toEqual(['a', 'b'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('缺 script/name/scriptPath → 抛错', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  await expect(svc.launch({}, stubTUC, stubCanUseTool)).rejects.toThrow(
    /script|name|scriptPath/,
  )
})

test('scriptPath 读取文件内容并校验', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  const dir = await mkdtemp(join(tmpdir(), 'wf-path-'))
  const file = join(dir, 's.ts')
  try {
    await writeFile(file, `return agent('from-file')`)
    const { runId } = await svc.launch(
      { scriptPath: file },
      stubTUC,
      stubCanUseTool,
    )
    await settle()
    const r = svc.getRun(runId)
    expect(r).toBeDefined()
    expect(['completed', 'running']).toContain(r!.status)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('parseScript 校验失败 → launch 抛错', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store } = fakePorts()
  const svc = makeService(ports, store)
  // 触发 ScriptError：meta 字面量缺 description（validateMeta 要求 name+description 均为字符串）
  await expect(
    svc.launch(
      { script: `export const meta = { name: "x" }\nreturn 1` },
      stubTUC,
      stubCanUseTool,
    ),
  ).rejects.toThrow(/校验失败/)
})

// ---- 服务层失败路由覆盖（审查 gap：.then/.catch → taskRegistrar 路径）----

test('脚本运行抛错 → service 路由到 taskRegistrar.fail，带 error 文本', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, calls } = fakePorts()
  const svc = makeService(ports, store)
  await svc.launch(
    { script: `throw new Error('script boom')` },
    stubTUC,
    stubCanUseTool,
  )
  await settle()
  const fail = calls.find(c => c.kind === 'fail')
  expect(fail).toBeDefined()
  expect(fail?.kind === 'fail' && fail.error).toMatch(/script boom/)
})

test('adapter 抛错 → service 通过 .catch 路径路由到 taskRegistrar.fail', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, calls } = fakePorts({ adapterThrow: 'adapter boom' })
  const svc = makeService(ports, store)
  await svc.launch({ script: `return agent('x')` }, stubTUC, stubCanUseTool)
  await settle()
  const fail = calls.find(c => c.kind === 'fail')
  expect(fail).toBeDefined()
  // adapter throw → runWorkflow 的内部 try/catch 转 failed status，error 透传；
  // 或透传到 detached promise 的 .catch。两者最终都进 taskRegistrar.fail。
  expect(fail?.kind === 'fail' && fail.error).toMatch(/adapter boom/)
})

test('脚本正常完成 → service 路由到 taskRegistrar.complete', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, calls } = fakePorts()
  const svc = makeService(ports, store)
  await svc.launch({ script: `return agent('x')` }, stubTUC, stubCanUseTool)
  await settle()
  expect(calls.some(c => c.kind === 'complete')).toBe(true)
})

// ---- 修复 N：shutdown 清理 ----

test('shutdown 杀掉所有 running run（taskRegistrar.kill 调用每个）', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, killed } = fakePorts()
  // 让 adapter 慢一点，settle 期间 run 仍在 running
  const slowPorts = {
    ...ports,
    agentAdapterRegistry: {
      resolve: () => ({
        id: 'claude-code',
        capabilities: { structuredOutput: true },
        run: async (): Promise<AgentRunResult> => {
          await new Promise(r => setTimeout(r, 200))
          return { kind: 'ok', output: 'slow', usage: { outputTokens: 1 } }
        },
      }),
    },
  } as unknown as typeof ports
  const slowSvc = makeService(slowPorts, store)
  const { runId: a } = await slowSvc.launch(
    { script: `return agent('a')` },
    stubTUC,
    stubCanUseTool,
  )
  const { runId: b } = await slowSvc.launch(
    { script: `return agent('b')` },
    stubTUC,
    stubCanUseTool,
  )
  killed.length = 0
  slowSvc.shutdown()
  expect(killed).toContain(a)
  expect(killed).toContain(b)
})

test('shutdown 不重复杀已完成 run；幂等（多次调用安全）', async () => {
  __resetWorkflowServiceForTests()
  const { ports, store, killed } = fakePorts()
  const svc = makeService(ports, store)
  const { runId } = await svc.launch(
    { script: `return agent('x')` },
    stubTUC,
    stubCanUseTool,
  )
  await settle() // 完成
  killed.length = 0
  svc.shutdown()
  // 已完成的不应再被 kill
  expect(killed).not.toContain(runId)
  // 幂等
  expect(() => svc.shutdown()).not.toThrow()
})

// ---- Task 5: loadPersistedRuns + getRunAsync fallback ----
// runsDirProvider 作为 makeService 第四个可选参数注入 tmpdir，避免写真实项目目录
// （Bun ESM 模块命名空间只读，无法 monkey-patch getRunsDir）。

test('loadPersistedRuns 扫盘 hydrate 历史 run；已有内存 run 不被覆盖', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    // 磁盘先有两个历史 run
    const { writeRunState } = await import('../persistence.js')
    const historicalA = {
      runId: 'hA',
      workflowName: 'old-A',
      status: 'completed',
      phases: [],
      declaredPhases: [],
      currentPhase: null,
      agents: [],
      agentCount: 1,
      returnValue: 'a',
      startedAt: 10,
      updatedAt: 20,
    } as RunProgress
    const historicalB = {
      runId: 'hB',
      workflowName: 'old-B',
      status: 'failed',
      phases: [],
      declaredPhases: [],
      currentPhase: null,
      agents: [],
      agentCount: 2,
      error: 'x',
      startedAt: 30,
      updatedAt: 40,
    } as RunProgress
    await writeRunState(dir, historicalA)
    await writeRunState(dir, historicalB)

    const { ports, store } = fakePorts()
    // 内存先有一个本次会话 run（通过 ports.progressEmitter.emit 走 bus → store）
    ports.progressEmitter.emit({
      type: 'run_started',
      runId: 'live',
      workflowName: 'live-w',
      meta: null,
    })
    const svc = makeService(ports, store, undefined, () => dir)

    await svc.loadPersistedRuns()

    const ids = svc.listRuns().map(r => r.runId)
    expect(ids).toContain('hA')
    expect(ids).toContain('hB')
    expect(ids).toContain('live')
    // 内存优先：live 仍是 running（不被磁盘覆盖；磁盘里没有 live 也不会注入 STALE）
    expect(svc.getRun('live')!.status).toBe('running')
    expect(svc.getRun('hA')!.returnValue).toBe('a')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('loadPersistedRuns 重复调用仅扫盘一次（persistedLoaded flag）', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, undefined, () => dir)

    await svc.loadPersistedRuns()
    await svc.loadPersistedRuns()
    await svc.loadPersistedRuns()

    // 重复调用不抛错、不改变 listRuns 结果（空目录）
    expect(svc.listRuns()).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunAsync 内存命中 → 不读盘', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, undefined, () => dir)
    ports.progressEmitter.emit({
      type: 'run_started',
      runId: 'live',
      workflowName: 'w',
      meta: null,
    })

    const got = await svc.getRunAsync('live')
    expect(got?.runId).toBe('live')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunAsync 内存 miss + 磁盘命中 → 返回磁盘值，且不注入内存（再次 get 仍读盘）', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { writeRunState } = await import('../persistence.js')
    const historical = {
      runId: 'hist-only',
      workflowName: 'old',
      status: 'completed',
      phases: [],
      declaredPhases: [],
      currentPhase: null,
      agents: [],
      agentCount: 0,
      returnValue: { x: 1 },
      startedAt: 1,
      updatedAt: 2,
    } as RunProgress
    await writeRunState(dir, historical)

    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, undefined, () => dir)

    const got = await svc.getRunAsync('hist-only')
    expect(got?.returnValue).toEqual({ x: 1 })
    // 不注入内存：内存 list 不含（未 hydrate）
    expect(svc.listRuns().map(r => r.runId)).not.toContain('hist-only')
    // 再次 get 仍能返回（每次走 readRunState fallback）
    const got2 = await svc.getRunAsync('hist-only')
    expect(got2?.returnValue).toEqual({ x: 1 })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunAsync 内存 miss + 磁盘 miss → undefined', async () => {
  __resetWorkflowServiceForTests()
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  try {
    const { ports, store } = fakePorts()
    const svc = makeService(ports, store, undefined, () => dir)

    const got = await svc.getRunAsync('no-such-run')
    expect(got).toBeUndefined()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
