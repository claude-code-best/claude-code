// =============================================================================
// Unified Chat Data Model — shared between ACP and RCS chat interfaces
// =============================================================================

import type { ToolCallContent, PermissionOption, PlanEntry } from '../acp/types'
import type { SessionInitInfo, TokenUsageTotals } from '../types'

// 工具调用状态
export type ToolCallStatus =
  | 'running'
  | 'complete'
  | 'error'
  | 'waiting_for_confirmation'
  | 'rejected'
  | 'canceled'

// 工具调用数据
export interface ToolCallData {
  id: string
  title: string
  status: ToolCallStatus
  content?: ToolCallContent[]
  rawInput?: Record<string, unknown>
  rawOutput?: Record<string, unknown>
  // 权限请求（仅当 status === "waiting_for_confirmation"）
  permissionRequest?: {
    requestId: string
    options: PermissionOption[]
  }
  // 独立权限请求（无匹配工具调用时创建）
  isStandalonePermission?: boolean
}

// 助手消息块 — 普通消息或思考过程
export type AssistantChunk =
  | { type: 'message'; text: string }
  | { type: 'thought'; text: string }

// 用户消息中的图片
export interface UserMessageImage {
  mimeType: string
  data: string // base64 encoded
}

// 用户消息条目
export interface UserMessageEntry {
  type: 'user_message'
  id: string
  content: string
  images?: UserMessageImage[]
}

// 助手消息条目
export interface AssistantMessageEntry {
  type: 'assistant_message'
  id: string
  chunks: AssistantChunk[]
}

// 工具调用条目
export interface ToolCallEntry {
  type: 'tool_call'
  toolCall: ToolCallData
}

// Plan 展示条目（Agent 执行计划）
export interface PlanDisplayEntry {
  type: 'plan'
  id: string
  entries: PlanEntry[]
}

// 统一聊天条目类型
export type ThreadEntry =
  | UserMessageEntry
  | AssistantMessageEntry
  | ToolCallEntry
  | PlanDisplayEntry

export interface SessionEventState {
  entries: ThreadEntry[]
  /** Full-so-far text blocks for transient assistant messages, by API message ID. */
  streamingAssistantBlocks: Record<string, Record<number, string>>
  seenEventIds: Set<string>
  seenMessageKeys: Set<string>
  highWaterSeq: number
  /** Session metadata from the CLI's system/init announcement. */
  sessionInfo: SessionInitInfo | null
  /** Cumulative token usage (deduped per API message id). */
  usage: TokenUsageTotals
  seenUsageIds: Set<string>
  /** Model reported on the most recent assistant message. */
  lastAssistantModel: string | null
  /** Authoritative runtime signals emitted by the Claude Code SDK bridge. */
  runtime: SessionRuntimeState
  /** Permission requests still awaiting a durable response. */
  pendingPermissions: Record<string, PendingPermission>
}

export type RuntimeTurnState =
  | 'unknown'
  | 'idle'
  | 'running'
  | 'requires_action'

export interface RuntimeTaskUsage {
  totalTokens: number
  toolUses: number
  durationMs: number
}

export interface RuntimeTask {
  id: string
  toolUseId?: string
  description: string
  taskType?: string
  workflowName?: string
  prompt?: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  usage?: RuntimeTaskUsage
  lastToolName?: string
  summary?: string
  outputFile?: string
  workflowProgress?: unknown[]
  startedAt?: number
  updatedAt: number
}

export interface RuntimeTaskListItem {
  id: string
  subject: string
  description?: string
  activeForm?: string
  status: string
  owner?: string
  blocks: string[]
  blockedBy: string[]
}

export interface RuntimeTaskList {
  id: string
  tasks: RuntimeTaskListItem[]
  updatedAt: number
}

export interface RuntimeToolProgress {
  toolUseId: string
  toolName: string
  parentToolUseId?: string
  elapsedSeconds: number
  taskId?: string
  updatedAt: number
}

export interface RuntimeGoal {
  objective: string
  status:
    | 'active'
    | 'paused'
    | 'blocked'
    | 'budget_limited'
    | 'usage_limited'
    | 'max_turns'
    | 'complete'
  tokenBudget: number | null
  tokensUsed: number
  turnsExecuted: number
  activeElapsedMs: number
  startTime: number
  pausedAt: number | null
  accumulatedActiveMs: number
  blockedAttempts: number
  lastBlockReason: string | null
  updatedAt: number
}

export interface RuntimeWorkflowAgent {
  id: number
  label?: string
  phase?: string
  status: 'running' | 'done'
  resultKind?: string
  outputShape?: 'text' | 'object'
  model?: string
  tokenCount?: number
  toolCount?: number
}

export interface RuntimeWorkflowRun {
  runId: string
  workflowName: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  phases: Array<{ title: string; status: 'running' | 'done' }>
  declaredPhases: string[]
  currentPhase: string | null
  agents: RuntimeWorkflowAgent[]
  agentCount: number
  returnValue?: unknown
  error?: string
  startedAt: number
  description?: string
  updatedAt: number
}

export interface SessionRuntimeState {
  turnState: RuntimeTurnState
  turnStateSource: 'unknown' | 'sdk' | 'event_fallback'
  workerStatus: string | null
  tasks: Record<string, RuntimeTask>
  taskLists: Record<string, RuntimeTaskList>
  toolProgress: Record<string, RuntimeToolProgress>
  goal: RuntimeGoal | null
  workflowRuns: Record<string, RuntimeWorkflowRun>
  namedWorkflows: string[]
  workflowRunsDirectory: string | null
}

// =============================================================================
// Chat 组件 Props 类型
// =============================================================================

// ChatInput 提交消息
export interface ChatInputMessage {
  text: string
  images?: UserMessageImage[]
}

// 权限请求条目（用于 PermissionPanel）
export interface PendingPermission {
  requestId: string
  toolName: string
  toolInput: Record<string, unknown>
  description?: string
  options?: PermissionOption[]
}

// 会话列表条目（用于 SessionSidebar）
export interface SessionListItem {
  id: string
  title?: string | null
  updatedAt?: string | null
  isActive?: boolean
}
