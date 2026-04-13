// Auto-generated stub — replace with real implementation
import type { UUID } from 'crypto'
import type {
  ContentBlockParam,
  ContentBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  BranchAction,
  CommitKind,
  PrAction,
} from '@claude-code-best/builtin-tools/tools/shared/gitOperationTracking.js'

/**
 * Base message type with discriminant `type` field and common properties.
 * Individual message subtypes (UserMessage, AssistantMessage, etc.) extend
 * this with narrower `type` literals and additional fields.
 */
export type MessageType = 'user' | 'assistant' | 'system' | 'attachment' | 'progress' | 'grouped_tool_use' | 'collapsed_read_search'

/** A single content element inside message.content arrays. */
export type ContentItem = ContentBlockParam | ContentBlock

export type MessageContent = string | ContentBlockParam[] | ContentBlock[]

/**
 * Typed content array — used in narrowed message subtypes so that
 * `message.content[0]` resolves to `ContentItem` instead of
 * `string | ContentBlockParam | ContentBlock`.
 */
export type TypedMessageContent = ContentItem[]

export type Message = {
  type: MessageType
  uuid: UUID
  isMeta?: boolean
  isCompactSummary?: boolean
  toolUseResult?: unknown
  isVisibleInTranscriptOnly?: boolean
  attachment?: { type: string; toolUseID?: string; [key: string]: unknown; addedNames: string[]; addedLines: string[]; removedNames: string[] }
  message?: {
    role?: string
    id?: string
    content?: MessageContent
    usage?: BetaUsage | Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type AssistantMessage = Message & {
  type: 'assistant'
  message: NonNullable<Message['message']>
}
export type AttachmentMessage<T = { type: string; [key: string]: unknown }> = Message & { type: 'attachment'; attachment: T }
export type ProgressMessage<T = unknown> = Message & { type: 'progress'; data: T }
export type SystemLocalCommandMessage = Message & { type: 'system' }
export type SystemMessage = Message & { type: 'system' }
export type UserMessage = Message & {
  type: 'user'
  message: NonNullable<Message['message']>
  imagePasteIds?: number[]
}
export type NormalizedUserMessage = UserMessage
export type RequestStartEvent = { type: string; [key: string]: unknown }
export type StreamEvent = { type: string; [key: string]: unknown }
export type SystemCompactBoundaryMessage = Message & {
  type: 'system'
  compactMetadata: {
    preservedSegment?: {
      headUuid: UUID
      tailUuid: UUID
      anchorUuid: UUID
      [key: string]: unknown
    }
    [key: string]: unknown
  }
}
export type TombstoneMessage = Message
export type ToolUseSummaryMessage = Message
export type MessageOrigin = string
export type CompactMetadata = Record<string, unknown>
export type SystemAPIErrorMessage = Message & { type: 'system' }
export type SystemFileSnapshotMessage = Message & { type: 'system' }
export type NormalizedAssistantMessage<T = unknown> = AssistantMessage
export type NormalizedMessage = Message
export type PartialCompactDirection = string

export type StopHookInfo = {
  command?: string
  durationMs?: number
  [key: string]: unknown
}

export type SystemAgentsKilledMessage = Message & { type: 'system' }
export type SystemApiMetricsMessage = Message & { type: 'system' }
export type SystemAwaySummaryMessage = Message & { type: 'system' }
export type SystemBridgeStatusMessage = Message & { type: 'system' }
export type SystemInformationalMessage = Message & { type: 'system' }
export type SystemMemorySavedMessage = Message & { type: 'system' }
export type SystemMessageLevel = string
export type SystemMicrocompactBoundaryMessage = Message & { type: 'system' }
export type SystemPermissionRetryMessage = Message & { type: 'system' }
export type SystemScheduledTaskFireMessage = Message & { type: 'system' }

export type SystemStopHookSummaryMessage = Message & {
  type: 'system'
  subtype: string
  hookLabel: string
  hookCount: number
  totalDurationMs?: number
  hookInfos: StopHookInfo[]
}

export type SystemTurnDurationMessage = Message & { type: 'system' }

export type GroupedToolUseMessage = Message & {
  type: 'grouped_tool_use'
  toolName: string
  messages: NormalizedAssistantMessage[]
  results: NormalizedUserMessage[]
  displayMessage: NormalizedAssistantMessage | NormalizedUserMessage
}

export type RenderableMessage =
  | AssistantMessage
  | UserMessage
  | (Message & { type: 'system' })
  | (Message & { type: 'attachment'; attachment: { type: string; memories?: { path: string; content: string; mtimeMs: number }[]; [key: string]: unknown } })
  | (Message & { type: 'progress' })
  | GroupedToolUseMessage
  | CollapsedReadSearchGroup

export type CollapsibleMessage =
  | AssistantMessage
  | UserMessage
  | GroupedToolUseMessage

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

export type HookResultMessage = Message
export type SystemThinkingMessage = Message & { type: 'system' }
