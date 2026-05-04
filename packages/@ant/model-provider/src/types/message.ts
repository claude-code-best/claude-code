// 模型提供者包的核心消息类型。从 src/t
// ypes/message.ts 移出，以解耦 API 层与主项目。

import type { UUID } from 'crypto'
import type {
  ContentBlockParam,
  ContentBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

/**
 * Base message type with discriminant `type` field and common properties.
 * Individual message subtypes (UserMessage, AssistantMessage, etc.) extend
 * this with narrower `type` literals and additional fields.
 */
export type MessageType =
  | 'user'
  | 'assistant'
  | 'system'
  | 'attachment'
  | 'progress'
  | 'grouped_tool_use'
  | 'collapsed_read_search'

/** 消息内容数组 message.content 中的单个内容元素。
 * ContentBlockParam代表发送的消息内容，ContentBlock代表接收的消息内容 */
export type ContentItem = ContentBlockParam | ContentBlock

export type MessageContent = string | ContentBlockParam[] | ContentBlock[]

/** * 类型化内容数组 —— 用于更具体的消息子类型，以便 `message.content[0]` 解析为 `ContentItem` 而非 `string | ContentBlockParam | ContentBlock`。 */
export type TypedMessageContent = ContentItem[]

export type Message = {
  type: MessageType
  uuid: UUID
  isMeta?: boolean
  isCompactSummary?: boolean
  toolUseResult?: unknown
  isVisibleInTranscriptOnly?: boolean
  attachment?: {
    type: string
    toolUseID?: string
    [key: string]: unknown
    addedNames: string[]
    addedLines: string[]
    removedNames: string[]
  }
  message?: {
    role?: string // Anthropic/API 角色：user / assistant（序列化进请求体）
    id?: string // 服务商返回的消息 id（流式 delta 关联、续写等）
    content?: MessageContent // 文本或内容块数组（text、tool_use、tool_result、thinking 等），即 API `messages[].content`
    usage?: BetaUsage | Record<string, unknown> // 助手消息上的 token 用量（input/output/cache 等），stats、预算、权限 UI 会读
    [key: string]: unknown
  }
  [key: string]: unknown // 允许各子类型扩展字段而不破坏结构（与主工程 `src/types/message.ts` 的交叉类型配合）
}

export type AssistantMessage = Message & {
  type: 'assistant'
  message: NonNullable<Message['message']>
}
export type AttachmentMessage<T = { type: string; [key: string]: unknown }> =
  Message & { type: 'attachment'; attachment: T }
export type ProgressMessage<T = unknown> = Message & {
  type: 'progress'
  data: T
}
export type SystemLocalCommandMessage = Message & { type: 'system' }
// 通常的系统信息
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

// CollapsibleMessage 由主项目的 CollapsedReadSearchGroup 使用。
export type CollapsibleMessage =
  | AssistantMessage
  | UserMessage
  | GroupedToolUseMessage

export type HookResultMessage = Message
export type SystemThinkingMessage = Message & { type: 'system' }
