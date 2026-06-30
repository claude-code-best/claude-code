import type { ProgressEvent } from '@claude-code-best/workflow-engine'
import type { ProgressBus } from './bus.js'

export type AgentProgress = {
  /** Unique id stamped by the engine, precisely correlates started/done (fixes the old LIFO race condition). */
  id: number
  label?: string
  phase?: string
  status: 'running' | 'done'
  resultKind?: string
  /** Only meaningful when done·ok: output is an object -> 'object', otherwise -> 'text'. None for dead/skipped. */
  outputShape?: 'text' | 'object'
  /** Actually parsed model id (carried in by agent_done; none while running). */
  model?: string
  /** Cumulative context tokens (live via agent_progress / final value settled by agent_done). */
  tokenCount?: number
  /** Cumulative tool-call count (live via agent_progress / final value settled by agent_done). */
  toolCount?: number
}

export type RunProgress = {
  runId: string
  workflowName: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  phases: Array<{ title: string; status: 'running' | 'done' }>
  /** From run_started.meta.phases[].title; the panel uses this to show pending(○) phases. [] when no meta. */
  declaredPhases: string[]
  currentPhase: string | null
  agents: AgentProgress[]
  agentCount: number
  returnValue?: unknown
  error?: string
  /** run_started timestamp (used by the panel to compute run duration). */
  startedAt: number
  /** workflow description (from run_started.meta.description). */
  description?: string
  updatedAt: number
}

export type ProgressStore = {
  apply(event: ProgressEvent): void
  list(): RunProgress[]
  get(runId: string): RunProgress | undefined
  /** Directly inject a run read from disk (bypassing bus); skips existing runId - in-memory takes priority. */
  hydrate(run: RunProgress): void
  /** For useSyncExternalStore: returns a stable reference, the same array when no change. */
  subscribe(listener: () => void): () => void
  getSnapshot(): RunProgress[]
}

/** Build a reactive store from the bus: subscribe to the bus, reduce events, notify React subscribers. */
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
        startedAt: Date.now(),
        updatedAt: Date.now(),
      }
      byId.set(runId, p)
    }
    return p
  }

  const apply = (event: ProgressEvent): void => {
    // log produces no visible state change (panel has no log view): early exit to avoid pointless snapshot rebuild and React re-render
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
        p.description = event.meta?.description ?? undefined
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
      case 'agent_progress': {
        // live progress: only update token/tool (high frequency, but once per agent message, frequency is controllable).
        const ap = p.agents.find(x => x.id === event.agentId)
        if (ap) {
          ap.tokenCount = event.tokenCount
          ap.toolCount = event.toolCount
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
                  tokenCount: event.result.tokenCount,
                  toolCount: event.result.toolCount,
                  model: event.result.model,
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
            a.tokenCount = event.result.tokenCount
            a.toolCount = event.result.toolCount
            a.model = event.result.model
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
    hydrate(run) {
      if (byId.has(run.runId)) return
      byId.set(run.runId, run)
      notify()
    },
    subscribe: fn => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getSnapshot: () => snapshot,
  }
}
