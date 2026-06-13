import { describe, expect, test } from 'bun:test'
import type { RunProgress } from '../progress/store.js'
import type { WorkflowService } from '../service.js'

function makeMockService(runs: RunProgress[]): {
  service: WorkflowService
  emit: () => void
  setRuns: (runs: RunProgress[]) => void
} {
  let current = runs
  const listeners = new Set<() => void>()
  return {
    service: {
      ports: {},
      launch: async () => ({ runId: 'x' }),
      kill: () => {},
      listRuns: () => current,
      getRun: () => undefined,
      subscribe: (fn: () => void) => {
        listeners.add(fn)
        return () => {
          listeners.delete(fn)
        }
      },
      listNamed: async () => [],
    } as unknown as WorkflowService,
    emit: () => {
      for (const fn of listeners) fn()
    },
    setRuns: r => {
      current = r
    },
  }
}

function makeRun(
  runId: string,
  status: RunProgress['status'],
  overrides: Partial<RunProgress> = {},
): RunProgress {
  return {
    runId,
    workflowName: 'wf',
    status,
    phases: [],
    declaredPhases: [],
    currentPhase: null,
    agents: [],
    agentCount: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('installWorkflowNotifications', () => {
  test('running → completed 触发通知（含 workflow 名）', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    const unsubscribe = installWorkflowNotifications(service, msg =>
      calls.push(msg),
    )

    // 第一次 emit：listener 记录初始 running 状态，不发通知
    emit()
    expect(calls.length).toBe(0)

    setRuns([makeRun('r1', 'completed')])
    emit()

    expect(calls.length).toBe(1)
    expect(calls[0]).toMatch(/task-notification/)
    expect(calls[0]).toMatch(/completed successfully/)
    expect(calls[0]).toMatch(/"wf"/)
    unsubscribe()
  })

  test('running → failed 触发通知，含 error 文字', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    emit() // 记录初始 running
    setRuns([makeRun('r1', 'failed', { error: 'agent X boom' })])
    emit()

    expect(calls.length).toBe(1)
    expect(calls[0]).toMatch(/failed/)
    expect(calls[0]).toMatch(/agent X boom/)
  })

  test('running → killed 触发通知', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    emit() // 记录初始 running
    setRuns([makeRun('r1', 'killed')])
    emit()

    expect(calls.length).toBe(1)
    expect(calls[0]).toMatch(/was stopped/)
  })

  test('初次见到 run（无 prev）不发通知（避免启动时通知历史 run）', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    // 启动后第一次 emit，看到 r1 已 completed——不应通知（不是从 running 转换来）
    setRuns([makeRun('r1', 'completed')])
    emit()

    expect(calls.length).toBe(0)
  })

  test('running → running 不发通知', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    emit() // 记录初始 running
    setRuns([makeRun('r1', 'running', { agentCount: 1 })])
    emit()

    expect(calls.length).toBe(0)
  })

  test('已 completed 的 run 再次 emit 不重复通知', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    emit() // 记录初始 running
    setRuns([makeRun('r1', 'completed')])
    emit()
    expect(calls.length).toBe(1)

    emit()
    expect(calls.length).toBe(1)
  })

  test('unsubscribe 后不再发通知', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    const unsubscribe = installWorkflowNotifications(service, msg =>
      calls.push(msg),
    )

    emit() // 记录初始 running
    unsubscribe()
    setRuns([makeRun('r1', 'completed')])
    emit()

    expect(calls.length).toBe(0)
  })
})
