// Re-export core message types from @ant/model-provider
// This file adds UI-specific types on top of the base types.
export type {
  MessageType,
  ContentItem,
  MessageContent,
  TypedMessageContent,
  Message,
  AssistantMessage,
  AttachmentMessage,
  ProgressMessage,
  SystemLocalCommandMessage,
  SystemMessage,
  UserMessage,
  NormalizedUserMessage,
  RequestStartEvent,
  StreamEvent,
  SystemCompactBoundaryMessage,
  TombstoneMessage,
  ToolUseSummaryMessage,
  MessageOrigin,
  CompactMetadata,
  SystemAPIErrorMessage,
  SystemFileSnapshotMessage,
  NormalizedAssistantMessage,
  NormalizedMessage,
  PartialCompactDirection,
  StopHookInfo,
  SystemAgentsKilledMessage,
  SystemApiMetricsMessage,
  SystemAwaySummaryMessage,
  SystemBridgeStatusMessage,
  SystemInformationalMessage,
  SystemMemorySavedMessage,
  SystemMessageLevel,
  SystemMicrocompactBoundaryMessage,
  SystemPermissionRetryMessage,
  SystemScheduledTaskFireMessage,
  SystemStopHookSummaryMessage,
  SystemTurnDurationMessage,
  GroupedToolUseMessage,
  CollapsibleMessage,
  HookResultMessage,
  SystemThinkingMessage,
} from '@ant/model-provider'

// UI-specific types that depend on main-project internals
import type {
  BranchAction,
  CommitKind,
  PrAction,
} from '@claude-code-best/builtin-tools/tools/shared/gitOperationTracking.js'
import type {
  AssistantMessage,
  CollapsibleMessage,
  NormalizedAssistantMessage,
  NormalizedUserMessage,
  UserMessage,
} from '@ant/model-provider'
import type { UUID } from 'crypto'
import type { StopHookInfo } from '@ant/model-provider'

export type RenderableMessage =
  | AssistantMessage
  | UserMessage
  | (import('@ant/model-provider').Message & { type: 'system' })
  | (import('@ant/model-provider').Message & { type: 'attachment'; attachment: { type: string; memories?: { path: string; content: string; mtimeMs: number }[]; [key: string]: unknown } })
  | (import('@ant/model-provider').Message & { type: 'progress' })
  | import('@ant/model-provider').GroupedToolUseMessage
  | CollapsedReadSearchGroup

export type CollapsedReadSearchGroup = {
  type: 'collapsed_read_search'
  uuid: UUID
  timestamp?: unknown
  searchCount: number
  readCount: number
  listCount: number
  replCount: number
  memorySearchCount: number
  memoryReadCount: number
  memoryWriteCount: number
  readFilePaths: string[]
  searchArgs: string[]
  latestDisplayHint?: string
  messages: CollapsibleMessage[]
  displayMessage: CollapsibleMessage
  mcpCallCount?: number
  mcpServerNames?: string[]
  bashCount?: number
  gitOpBashCount?: number
  commits?: { sha: string; kind: CommitKind }[]
  pushes?: { branch: string }[]
  branches?: { ref: string; action: BranchAction }[]
  prs?: { number: number; url?: string; action: PrAction }[]
  hookTotalMs?: number
  hookCount?: number
  hookInfos?: StopHookInfo[]
  relevantMemories?: { path: string; content: string; mtimeMs: number }[]
  teamMemorySearchCount?: number
  teamMemoryReadCount?: number
  teamMemoryWriteCount?: number
  [key: string]: unknown
}
