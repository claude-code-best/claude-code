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
