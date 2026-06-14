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
  test('running → completed triggers notification (incl. workflow name)', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    const unsubscribe = installWorkflowNotifications(service, msg =>
      calls.push(msg),
    )

    // first emit: listener records initial running state, no notification
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

  test('running → failed triggers notification, includes error text', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    emit() // record initial running
    setRuns([makeRun('r1', 'failed', { error: 'agent X boom' })])
    emit()

    expect(calls.length).toBe(1)
    expect(calls[0]).toMatch(/failed/)
    expect(calls[0]).toMatch(/agent X boom/)
  })

  test('running → killed triggers notification', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    emit() // record initial running
    setRuns([makeRun('r1', 'killed')])
    emit()

    expect(calls.length).toBe(1)
    expect(calls[0]).toMatch(/was stopped/)
  })

  test('first time seeing run (no prev) does not notify (avoid notifying historical runs on startup)', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    // first emit after startup, sees r1 already completed — should not notify (not a transition from running)
    setRuns([makeRun('r1', 'completed')])
    emit()

    expect(calls.length).toBe(0)
  })

  test('running → running does not notify', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    emit() // record initial running
    setRuns([makeRun('r1', 'running', { agentCount: 1 })])
    emit()

    expect(calls.length).toBe(0)
  })

  test('already completed run emitting again does not repeat notification', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    installWorkflowNotifications(service, msg => calls.push(msg))

    emit() // record initial running
    setRuns([makeRun('r1', 'completed')])
    emit()
    expect(calls.length).toBe(1)

    emit()
    expect(calls.length).toBe(1)
  })

  test('after unsubscribe no more notifications', async () => {
    const { installWorkflowNotifications } = await import('../notifications.js')
    const { service, emit, setRuns } = makeMockService([
      makeRun('r1', 'running'),
    ])
    const calls: string[] = []
    const unsubscribe = installWorkflowNotifications(service, msg =>
      calls.push(msg),
    )

    emit() // record initial running
    unsubscribe()
    setRuns([makeRun('r1', 'completed')])
    emit()

    expect(calls.length).toBe(0)
  })
})
