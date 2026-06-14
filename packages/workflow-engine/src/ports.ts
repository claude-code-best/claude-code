import type { AgentAdapterRegistry } from './agentAdapter.js'
import type {
  AgentRunParams,
  AgentRunResult,
  JournalEntry,
  ProgressEvent,
} from './types.js'

/**
 * Opaque host handle. The core side constructs one per tool call, containing toolUseContext/
 * canUseTool/parentMessage, etc. The package never inspects its internals; it only passes it through to the AgentRunner.
 * This is the only coupling seam between the package and the core layer, and it is opaque.
 */
const HOST_HANDLE = Symbol('workflow.hostHandle')

export type HostBundle = unknown

export type HostHandle = { readonly [HOST_HANDLE]: HostBundle }

/** Used by the core-side hostFactory: wraps any bundle into an opaque handle. */
export function createHostHandle(bundle: HostBundle): HostHandle {
  return { [HOST_HANDLE]: bundle } as HostHandle
}

/** Type guard. */
export function isHostHandle(value: unknown): value is HostHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    HOST_HANDLE in (value as object)
  )
}

/** Used by the core-side adapter: unwraps (only the adapter should call this). */
export function unwrapHostHandle(handle: HostHandle): HostBundle {
  return (handle as { [k: symbol]: HostBundle })[HOST_HANDLE]
}

/** Backend for the agent() hook. */
export type AgentRunner = {
  runAgentToResult(
    params: AgentRunParams,
    host: HostHandle,
  ): Promise<AgentRunResult>
}

/** Progress event emitter. */
export type ProgressEmitter = {
  emit(event: ProgressEvent): void
}

/** Background task lifecycle. */
export type TaskRegistrar = {
  /**
   * Register a background task. The adapter creates an AbortController and stores it in task state,
   * returning runId and signal (for the engine to execute detached + kill to abort).
   */
  register(
    opts: {
      workflowName: string
      workflowFile?: string
      summary?: string
      toolUseId?: string
      /** On resume, reuse the existing runId (read its journal). Omit to generate a new id. */
      runId?: string
    },
    host: HostHandle,
  ): { runId: string; signal: AbortSignal }
  complete(runId: string, summary?: string): void
  fail(runId: string, error: string): void
  kill(runId: string): void
  /**
   * Register an agent-level AbortController. Called by the backend when starting an agent, so that service
   * .kill(runId, agentId) can precisely abort a single agent (without affecting other agents in the same run).
   * Idempotent: re-registering with the same agentId overwrites.
   */
  registerAgentAbort?(runId: string, agentId: number, ac: AbortController): void
  /**
   * Unregister an agent-level AbortController (called when the agent completes/fails; idempotent).
   */
  unregisterAgentAbort?(runId: string, agentId: number): void
  /**
   * Abort a single agent. Returns whether it hit (false = agent already completed/does not exist).
   * Does not affect other agents in the same run; the workflow continues (the aborted agent returns dead → null).
   */
  killAgent?(runId: string, agentId: number): boolean
  /** Returns the current pending skip/retry action, or null. */
  pendingAction(runId: string): { kind: 'skip' | 'retry' } | null
}

/** Journal persistence. */
export type JournalStore = {
  read(runId: string): Promise<JournalEntry[]>
  append(runId: string, entry: JournalEntry): Promise<void>
  truncate(runId: string): Promise<void>
}

/** Cancellation / permission gate. */
export type PermissionGate = {
  isAborted(host: HostHandle): boolean
}

/** Logging + telemetry. */
export type Logger = {
  debug(msg: string): void
  event(name: string, metadata?: Record<string, unknown>): void
  /**
   * Warning-level log (e.g. errors swallowed when a single parallel/pipeline item fails).
   * Optional: old ports implementations may omit it; hooks tolerate it with `?.()`.
   */
  warn?(msg: string): void
}

/** Ready-to-use context the engine extracts from the host (handle + basic fields). */
export type WorkflowHostContext = {
  /** Opaque handle passed through to the AgentRunner (contains toolUseContext/canUseTool/parentMessage). */
  handle: HostHandle
  cwd: string
  /** Token budget cap; null means unlimited. */
  budgetTotal: number | null
  /** Core-side tool-use id (passed through to task registration). */
  toolUseId?: string
}

/**
 * Provided by the core side: constructs a WorkflowHostContext from the tool call's core context.
 * The arguments are opaque to the package (unknown); the core-side hostFactory knows the real types.
 */
export type HostFactory = (args: {
  context: unknown
  canUseTool: unknown
  parentMessage: unknown
}) => WorkflowHostContext

/** Aggregate of all ports. Injected into createWorkflowTool(ports). */
export type WorkflowPorts = {
  agentRunner: AgentRunner
  /**
   * Multi-backend adapter registry. When provided, takes precedence over agentRunner — hooks.agent routes
   * to adapter.run via the registry; when omitted, falls back to agentRunner (backward compatibility).
   */
  agentAdapterRegistry?: AgentAdapterRegistry
  progressEmitter: ProgressEmitter
  taskRegistrar: TaskRegistrar
  journalStore: JournalStore
  permissionGate: PermissionGate
  logger: Logger
  hostFactory: HostFactory
}
