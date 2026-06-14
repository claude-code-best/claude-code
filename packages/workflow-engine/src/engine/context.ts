import type { HostHandle, WorkflowPorts } from '../ports.js'
import type { JournalEntry } from '../types.js'
import { Budget } from './budget.js'
import { Semaphore, clampMaxConcurrency } from './concurrency.js'

/**
 * 可被子 workflow 共享的资源。嵌套时 semaphore/budget/agentCountBox 按引用共享，
 * depth 在执行子 workflow 时临时 +1。
 */
export type SharedResources = {
  semaphore: Semaphore
  budget: Budget
  agentCountBox: { value: number }
  /** agent() 调用的递增序号，盖戳 agent_started/agent_done 供进度精确关联。子 workflow 共享。 */
  agentIdSeq: { value: number }
  depth: number
}

/** 单次 workflow 运行的执行上下文。 */
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
  /** 单次 run 的并发槽位；undefined → DEFAULT_MAX_CONCURRENCY。经 clampMaxConcurrency 钳制。 */
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
