import { expect, test } from 'bun:test'
// 注意：本测试不 mock bootstrap/state、utils/cwd、analytics、debug。
// 原因：mock.module 是进程全局的（last-write-wins），mock 这些公共模块会污染
// 同进程其他测试（如 src/commands/__tests__/autonomy.test.ts 经其依赖链 import
// 真实 bootstrap/state）。ports 在测试环境下能正常解析 getProjectRoot/getCwd，
// logEvent/logForDebugging 在 sink 未 attach 时为静默 no-op，无需 mock。

import { buildRegistry } from '../registry.js'
import { createWorkflowPorts } from '../ports.js'
import { createProgressBus } from '../progress/bus.js'
import { createProgressStoreFromBus } from '../progress/store.js'
import { getProjectRoot } from '../../bootstrap/state.js'
import type { SetAppState } from '../../Task.js'
import type { AppState } from '../../state/AppState.tsx'

test('buildRegistry 注册 claude-code 为默认且 resolve 命中', () => {
  const reg = buildRegistry()
  expect(reg.has('claude-code')).toBe(true)
  expect(reg.resolve({ prompt: 'x' }).id).toBe('claude-code')
  expect(reg.resolve({ prompt: 'x', agentType: 'whatever' }).id).toBe(
    'claude-code',
  )
})

test('createWorkflowPorts 组装完整端口（含 agentAdapterRegistry 与 progressEmitter→bus）', () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })

  expect(ports.agentAdapterRegistry).toBeDefined()
  expect(ports.agentAdapterRegistry!.resolve({ prompt: 'x' }).id).toBe(
    'claude-code',
  )
  expect(typeof ports.taskRegistrar.register).toBe('function')
  expect(typeof ports.taskRegistrar.kill).toBe('function')
  expect(typeof ports.hostFactory).toBe('function')
  // agentRunner 兜底字段仍存在（WorkflowPorts 必填）
  expect(ports.agentRunner).toBeDefined()
  expect(typeof ports.agentRunner.runAgentToResult).toBe('function')

  // progressEmitter 经 bus → store：发一个 run_started，store 能看到
  ports.progressEmitter.emit({
    type: 'run_started',
    runId: 't',
    workflowName: 'w',
    meta: null,
  })
  expect(store.get('t')?.workflowName).toBe('w')
})

test('taskRegistrar.register/complete/kill 经 RunBinding 路由（真 setAppState，无 mock）', () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })

  // 真 setAppState：用一个本地 AppState 对象承载 tasks，registerTask 走真实代码路径。
  const state = { tasks: {} } as unknown as AppState
  const setAppState: SetAppState = f => {
    Object.assign(state, f(state))
  }

  const hostCtx = ports.hostFactory({
    context: {
      agentId: 'a-1',
      toolUseId: 'tu-1',
      setAppState,
    },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })

  const { runId, signal } = ports.taskRegistrar.register(
    {
      workflowName: 'wf',
      summary: 'summary',
      workflowFile: 'wf.ts',
      toolUseId: 'tu-1',
    },
    hostCtx.handle,
  )
  expect(typeof runId).toBe('string')
  expect(signal).toBeInstanceOf(AbortSignal)

  // complete/fail/kill 不抛（RunBinding 命中）
  expect(() => ports.taskRegistrar.complete(runId, 'done')).not.toThrow()
  expect(() => ports.taskRegistrar.kill(runId)).not.toThrow()
  // 未知 runId 安全 no-op
  expect(() => ports.taskRegistrar.complete('nope')).not.toThrow()
  expect(ports.taskRegistrar.pendingAction('nope')).toBeNull()

  // 终态后 binding 回收：再次 complete 同 runId 应安全 no-op（不抛错、不重复调用 workflow task fn）
  ports.taskRegistrar.complete(runId)
  ports.taskRegistrar.kill(runId)
})

// agent 级 kill 桥接：register → killAgent 精确中断；kill(runId) 顺带 abort 所有 agent。
test('taskRegistrar agentAbortControllers：register/killAgent 精确中断；kill(runId) 批量 abort', () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  // 实现always provides these — cast 把 optional 拍平为 required（避免每行 ! 断言）
  const tr = ports.taskRegistrar as Required<typeof ports.taskRegistrar>

  const state = { tasks: {} } as unknown as AppState
  const setAppState: SetAppState = f => {
    Object.assign(state, f(state))
  }
  const hostCtx = ports.hostFactory({
    context: { agentId: 'a-1', toolUseId: 'tu-1', setAppState },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })
  const { runId } = tr.register(
    {
      workflowName: 'wf',
      summary: 'summary',
      workflowFile: 'wf.ts',
      toolUseId: 'tu-1',
    },
    hostCtx.handle,
  )

  // 注册两个 agent 的 AbortController（模拟 backend 在启动 agent 时调用）
  const ac1 = new AbortController()
  const ac2 = new AbortController()
  tr.registerAgentAbort(runId, 1, ac1)
  tr.registerAgentAbort(runId, 2, ac2)
  expect(ac1.signal.aborted).toBe(false)
  expect(ac2.signal.aborted).toBe(false)

  // killAgent 精确中断 agent #1：仅 ac1 abort，ac2 不受影响
  expect(tr.killAgent(runId, 1)).toBe(true)
  expect(ac1.signal.aborted).toBe(true)
  expect(ac2.signal.aborted).toBe(false)
  // 重复 kill 同 agent：controller 已 delete，返回 false（幂等）
  expect(tr.killAgent(runId, 1)).toBe(false)

  // 未知 agentId / 未知 runId 安全返回 false
  expect(tr.killAgent(runId, 999)).toBe(false)
  expect(tr.killAgent('nope', 1)).toBe(false)

  // kill(runId) 批量 abort 剩余 agent（ac2）
  tr.kill(runId)
  expect(ac2.signal.aborted).toBe(true)

  // run 终态后 binding 已回收：再 killAgent 返回 false
  expect(tr.killAgent(runId, 2)).toBe(false)
})

test('unregisterAgentAbort 从 Map 删除（backend finally 清理幂等）', () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  const tr = ports.taskRegistrar as Required<typeof ports.taskRegistrar>

  const state = { tasks: {} } as unknown as AppState
  const setAppState: SetAppState = f => {
    Object.assign(state, f(state))
  }
  const hostCtx = ports.hostFactory({
    context: { agentId: 'a-1', toolUseId: 'tu-1', setAppState },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })
  const { runId } = tr.register(
    {
      workflowName: 'wf',
      summary: 'summary',
      workflowFile: 'wf.ts',
      toolUseId: 'tu-1',
    },
    hostCtx.handle,
  )
  const ac = new AbortController()
  tr.registerAgentAbort(runId, 5, ac)
  // 注销后 killAgent 无目标，返 false（不抛）
  tr.unregisterAgentAbort(runId, 5)
  expect(tr.killAgent(runId, 5)).toBe(false)
  // 重复注销幂等（backend finally 不抛）
  expect(() => tr.unregisterAgentAbort(runId, 5)).not.toThrow()
  // 未知 runId 安全 no-op
  expect(() => tr.unregisterAgentAbort('nope', 5)).not.toThrow()
})

test('hostFactory.cwd 与 journalStore 同根（getProjectRoot）—— 修复 K 回归', () => {
  // 历史 bug：hostFactory.cwd 用 getCwd()、journalStore 用 getProjectRoot()，
  // 用户进入 worktree/子目录时两者不同 → 命名 workflow 解析与 journal 落盘不同步。
  // 修复后两者都用 projectRoot，本测试 lock-in 该选择，防止回归。
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  const hostCtx = ports.hostFactory({
    context: { agentId: 'a', toolUseId: 'tu' },
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: {} as never,
  })
  expect(hostCtx.cwd).toBe(getProjectRoot())
})
