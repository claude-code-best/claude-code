import type { ProgressEvent } from '@claude-code-best/workflow-engine'
import type { ProgressBus } from './bus.js'

export type AgentProgress = {
  /** 引擎盖戳的唯一 id，精确关联 started/done（修旧 LIFO 竞态）。 */
  id: number
  label?: string
  phase?: string
  status: 'running' | 'done'
  resultKind?: string
  /** 仅 done·ok 时有意义：output 是对象→'object'，否则→'text'。dead/skipped 无。 */
  outputShape?: 'text' | 'object'
}

export type RunProgress = {
  runId: string
  workflowName: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  phases: Array<{ title: string; status: 'running' | 'done' }>
  /** 来自 run_started.meta.phases[].title；面板据此显示 pending(○) phase。无 meta → []。 */
  declaredPhases: string[]
  currentPhase: string | null
  agents: AgentProgress[]
  agentCount: number
  returnValue?: unknown
  error?: string
  updatedAt: number
}

export type ProgressStore = {
  apply(event: ProgressEvent): void
  list(): RunProgress[]
  get(runId: string): RunProgress | undefined
  /** 供 useSyncExternalStore：返回稳定引用，无变更时同一数组。 */
  subscribe(listener: () => void): () => void
  getSnapshot(): RunProgress[]
}

/** 从 bus 构造 reactive store：订阅 bus，归约事件，通知 React 订阅者。 */
export function createProgressStoreFromBus(bus: ProgressBus): ProgressStore {
  const byId = new Map<string, RunProgress>()
  let snapshot: RunProgress[] = []
  const listeners = new Set<() => void>()

  const notify = (): void => {
    snapshot = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    for (const fn of listeners) fn()
  }

  const ensure = (runId: string, workflowName: string): RunProgress => {
    let p = byId.get(runId)
    if (!p) {
      p = {
        runId,
        workflowName,
        status: 'running',
        phases: [],
        declaredPhases: [],
        currentPhase: null,
        agents: [],
        agentCount: 0,
        updatedAt: Date.now(),
      }
      byId.set(runId, p)
    }
    return p
  }

  const apply = (event: ProgressEvent): void => {
    // log 不产生可见状态变更（面板无日志视图）：早退，避免无谓的快照重建与 React 重渲染
    if (event.type === 'log') return
    const runId = event.runId
    const p = ensure(
      runId,
      'workflowName' in event ? event.workflowName : 'workflow',
    )
    p.updatedAt = Date.now()
    switch (event.type) {
      case 'run_started':
        p.workflowName = event.workflowName
        p.status = 'running'
        p.declaredPhases = event.meta?.phases?.map(ph => ph.title) ?? []
        break
      case 'phase_started':
        if (!p.phases.some(ph => ph.title === event.phase)) {
          p.phases.push({ title: event.phase, status: 'running' })
        }
        p.currentPhase = event.phase
        break
      case 'phase_done':
        for (const ph of p.phases)
          if (ph.title === event.phase) ph.status = 'done'
        if (p.currentPhase === event.phase) p.currentPhase = null
        break
      case 'agent_started': {
        let a = p.agents.find(x => x.id === event.agentId)
        if (!a) {
          a = {
            id: event.agentId,
            label: event.label,
            phase: event.phase,
            status: 'running',
          }
          p.agents.push(a)
          p.agentCount = p.agents.length
        } else {
          a.status = 'running'
          a.label = event.label
          a.phase = event.phase
        }
        break
      }
      case 'agent_done': {
        let a = p.agents.find(x => x.id === event.agentId)
        if (!a) {
          a = {
            id: event.agentId,
            label: event.label,
            phase: event.phase,
            status: 'done',
            ...(event.result.kind === 'ok'
              ? {
                  outputShape:
                    typeof event.result.output === 'object' &&
                    event.result.output !== null
                      ? ('object' as const)
                      : ('text' as const),
                }
              : {}),
          }
          p.agents.push(a)
          p.agentCount = p.agents.length
        } else {
          a.status = 'done'
          a.resultKind = event.result.kind
          if (event.result.kind === 'ok') {
            a.outputShape =
              typeof event.result.output === 'object' &&
              event.result.output !== null
                ? 'object'
                : 'text'
          }
        }
        break
      }
      case 'run_done':
        p.status = event.status
        if (event.returnValue !== undefined) p.returnValue = event.returnValue
        if (event.error !== undefined) p.error = event.error
        break
    }
    notify()
  }

  bus.subscribe(apply)
  return {
    apply,
    list: () => snapshot,
    get: id => byId.get(id),
    subscribe: fn => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getSnapshot: () => snapshot,
  }
}
