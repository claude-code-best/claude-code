import type { HostHandle, WorkflowPorts } from '../ports.js'
import type { JournalEntry } from '../types.js'
import { Budget } from './budget.js'
import { Semaphore, clampMaxConcurrency } from './concurrency.js'

/**
 * Resources that can be shared by sub-workflows. When nesting, semaphore/budget/agentCountBox are shared by reference,
 * and depth is temporarily +1 while executing a sub-workflow.
 */
export type SharedResources = {
  semaphore: Semaphore
  budget: Budget
  agentCountBox: { value: number }
  /** Increasing sequence number for agent() calls; stamps agent_started/agent_done for precise progress correlation. Shared across sub-workflows. */
  agentIdSeq: { value: number }
  depth: number
}

/** Execution context for a single workflow run. */
export type EngineContext = {
  ports: WorkflowPorts
  host: HostHandle
  signal: AbortSignal
  runId: string
  workflowName: string
  cwd: string
  resources: SharedResources
  journal: JournalEntry[]
  journalIndex: number
  journalInvalidated: boolean
  currentPhase: string | null
}

export function createSharedResources(
  budgetTotal: number | null,
  maxConcurrency?: number,
): SharedResources {
  return {
    semaphore: new Semaphore(clampMaxConcurrency(maxConcurrency)),
    budget: new Budget(budgetTotal),
    agentCountBox: { value: 0 },
    agentIdSeq: { value: 0 },
    depth: 0,
  }
}

export function createEngineContext(opts: {
  ports: WorkflowPorts
  host: HostHandle
  signal: AbortSignal
  runId: string
  workflowName: string
  cwd: string
  budgetTotal: number | null
  /** Concurrency slots for a single run; undefined → DEFAULT_MAX_CONCURRENCY. Clamped by clampMaxConcurrency. */
  maxConcurrency?: number
  journal?: JournalEntry[]
}): EngineContext {
  const resources = createSharedResources(opts.budgetTotal, opts.maxConcurrency)
  return {
    ports: opts.ports,
    host: opts.host,
    signal: opts.signal,
    runId: opts.runId,
    workflowName: opts.workflowName,
    cwd: opts.cwd,
    resources,
    journal: opts.journal ? [...opts.journal] : [],
    journalIndex: 0,
    journalInvalidated: false,
    currentPhase: null,
  }
}
