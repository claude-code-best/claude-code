import type { AgentAdapterRegistry } from './agentAdapter.js'
import type {
  AgentRunParams,
  AgentRunResult,
  JournalEntry,
  ProgressEvent,
} from './types.js'

/**
 * 不透明 host 句柄。核心侧每次工具调用构造一个，内含 toolUseContext/
 * canUseTool/parentMessage 等。包内绝不检视其内部，只透传给 AgentRunner。
 * 这是包与核心层之间唯一的耦合缝隙，且是不透明的。
 */
const HOST_HANDLE = Symbol('workflow.hostHandle')

export type HostBundle = unknown

export type HostHandle = { readonly [HOST_HANDLE]: HostBundle }

/** 核心 side hostFactory 用：把任意 bundle 包成不透明句柄。 */
export function createHostHandle(bundle: HostBundle): HostHandle {
  return { [HOST_HANDLE]: bundle } as HostHandle
}

/** 类型守卫。 */
export function isHostHandle(value: unknown): value is HostHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    HOST_HANDLE in (value as object)
  )
}

/** 核心 side adapter 用：解包（仅 adapter 应调用）。 */
export function unwrapHostHandle(handle: HostHandle): HostBundle {
  return (handle as { [k: symbol]: HostBundle })[HOST_HANDLE]
}

/** agent() 钩子的后端。 */
export type AgentRunner = {
  runAgentToResult(
    params: AgentRunParams,
    host: HostHandle,
  ): Promise<AgentRunResult>
}

/** 进度事件发射。 */
export type ProgressEmitter = {
  emit(event: ProgressEvent): void
}

/** 后台任务生命周期。 */
export type TaskRegistrar = {
  /**
   * 注册后台任务。adapter 创建 AbortController 并存入 task 状态，
   * 返回 runId 与 signal（供引擎 detached 执行 + kill 中止用）。
   */
  register(
    opts: {
      workflowName: string
      workflowFile?: string
      summary?: string
      toolUseId?: string
      /** resume 时复用既有 runId（读其 journal）。省略则生成新 id。 */
      runId?: string
    },
    host: HostHandle,
  ): { runId: string; signal: AbortSignal }
  complete(runId: string, summary?: string): void
  fail(runId: string, error: string): void
  kill(runId: string): void
  /** 返回当前待处理的 skip/retry 动作，或 null。 */
  pendingAction(runId: string): { kind: 'skip' | 'retry' } | null
}

/** journal 持久化。 */
export type JournalStore = {
  read(runId: string): Promise<JournalEntry[]>
  append(runId: string, entry: JournalEntry): Promise<void>
  truncate(runId: string): Promise<void>
}

/** 取消/权限门。 */
export type PermissionGate = {
  isAborted(host: HostHandle): boolean
}

/** 日志 + 遥测。 */
export type Logger = {
  debug(msg: string): void
  event(name: string, metadata?: Record<string, unknown>): void
  /**
   * 警告级日志（如 parallel/pipeline 单项失败被吞掉的错误）。
   * Optional：旧 ports 实现可省略；hooks 用 `?.()` 容错。
   */
  warn?(msg: string): void
}

/** 引擎从 host 提取的可直接使用上下文（句柄 + 基本字段）。 */
export type WorkflowHostContext = {
  /** 透传给 AgentRunner 的不透明句柄（内含 toolUseContext/canUseTool/parentMessage）。 */
  handle: HostHandle
  cwd: string
  /** token 预算上限，null 表示无限制。 */
  budgetTotal: number | null
  /** 核心 side 的工具调用 ID（透传给 task 注册）。 */
  toolUseId?: string
}

/**
 * 核心 side 提供：从工具调用的核心上下文构造 WorkflowHostContext。
 * 参数对包是不透明的（unknown）；核心侧 hostFactory 知道真实类型。
 */
export type HostFactory = (args: {
  context: unknown
  canUseTool: unknown
  parentMessage: unknown
}) => WorkflowHostContext

/** 所有端口的聚合。createWorkflowTool(ports) 注入。 */
export type WorkflowPorts = {
  agentRunner: AgentRunner
  /**
   * 多后端 adapter registry。提供时优先于 agentRunner——hooks.agent 按 registry
   * 路由到 adapter.run；省略则回退 agentRunner（兼容旧用法）。
   */
  agentAdapterRegistry?: AgentAdapterRegistry
  progressEmitter: ProgressEmitter
  taskRegistrar: TaskRegistrar
  journalStore: JournalStore
  permissionGate: PermissionGate
  logger: Logger
  hostFactory: HostFactory
}
