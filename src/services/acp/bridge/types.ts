// Shared ACP-bridge type definitions.
//
// Re-exports the SDK type-only imports that the rest of the bridge sub-modules
// depend on, plus the local discriminated union of every message shape consumed
// by the forwarding loop.
import type {
  ContentBlock,
  ToolCallContent,
  ToolCallLocation,
  ToolKind,
} from '@agentclientprotocol/sdk'

export type { ContentBlock, ToolCallContent, ToolCallLocation, ToolKind }

// ── ToolUseCache ──────────────────────────────────────────────────

/** Maps tool_use_id → tool metadata for tracked inflight tool calls. */
export type ToolUseCache = {
  [key: string]: {
    type: 'tool_use' | 'server_tool_use' | 'mcp_tool_use'
    id: string
    name: string
    input: unknown
  }
}

// ── Session usage tracking ────────────────────────────────────────

/** Accumulated token usage across a session, updated per result message. */
export type SessionUsage = {
  inputTokens: number
  outputTokens: number
  cachedReadTokens: number
  cachedWriteTokens: number
}

/** Token usage reported in SDK result messages. */
export type BridgeUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** system-init, compact_boundary, status, api_retry, local_command_output messages. */
export type BridgeSystemMessage = {
  type: 'system'
  subtype?: string
  session_id?: string
  content?: string
  status?: string
  compact_result?: string
  compact_error?: string
  model?: string
  uuid?: string
  [key: string]: unknown
}

/** Turn completion message: success with usage, or error with stop_reason. */
export type BridgeResultMessage = {
  type: 'result'
  subtype?: string
  usage?: BridgeUsage
  modelUsage?: Record<string, { contextWindow?: number }>
  total_cost_usd?: number
  is_error?: boolean
  stop_reason?: string | null
  result?: string
  errors?: string[]
  duration_ms?: number
  duration_api_ms?: number
  num_turns?: number
  permission_denials?: unknown[]
  session_id?: string
  [key: string]: unknown
}

/** Full assistant response message after the turn completes. */
export type BridgeAssistantMessage = {
  type: 'assistant'
  message?: {
    role?: string
    id?: string
    model?: string
    content?: string | Array<Record<string, unknown>>
    usage?: BridgeUsage | Record<string, unknown>
    stop_reason?: string | null
    [key: string]: unknown
  }
  parent_tool_use_id?: string | null
  uuid?: string
  session_id?: string
  error?: unknown
  [key: string]: unknown
}

/** Real-time streaming event (aka partial_assistant in the SDK schema). */
export type BridgeStreamEventMessage = {
  type: 'stream_event'
  event?: { type?: string; [key: string]: unknown }
  message?: Record<string, unknown>
  parent_tool_use_id?: string | null
  session_id?: string
  uuid?: string
  [key: string]: unknown
}

/** User prompt message (may include tool_use_result from prior turns). */
export type BridgeUserMessage = {
  type: 'user'
  message?: Record<string, unknown>
  uuid?: string
  isReplay?: boolean
  isMeta?: boolean
  timestamp?: string
  [key: string]: unknown
}

/** Subagent or hook progress notification (internal, not an SDK message member). */
export type BridgeProgressMessage = {
  type: 'progress'
  data?: {
    type?: string
    message?: Record<string, unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Summary of tool calls made during a turn. */
export type BridgeToolUseSummaryMessage = {
  type: 'tool_use_summary'
  summary?: string
  preceding_tool_use_ids?: string[]
  uuid?: string
  session_id?: string
  [key: string]: unknown
}

/** File attachment metadata (internal, not an SDK message member). */
export type BridgeAttachmentMessage = {
  type: 'attachment'
  [key: string]: unknown
}

/** Compaction boundary marker (type is 'compact_boundary', not 'system'). */
export type BridgeCompactBoundaryMessage = {
  type: 'compact_boundary'
  compact_metadata?: Record<string, unknown>
  [key: string]: unknown
}

/** ACP bridge local discriminated union — covers all message shapes consumed by the forwarding loop. */
export type BridgeSDKMessage =
  | BridgeSystemMessage
  | BridgeResultMessage
  | BridgeAssistantMessage
  | BridgeStreamEventMessage
  | BridgeUserMessage
  | BridgeProgressMessage
  | BridgeToolUseSummaryMessage
  | BridgeAttachmentMessage
  | BridgeCompactBoundaryMessage

// ── Tool info / edit response shapes ──────────────────────────────

/** Sanitised tool metadata sent to ACP client for tool_call notifications. */
export interface ToolInfo {
  title: string
  kind: ToolKind
  content: ToolCallContent[]
  locations?: ToolCallLocation[]
}

/** Context lines and diff metadata for one hunk of an Edit tool response. */
export interface EditToolResponseHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

/** Result block for Edit/Write tool responses containing hunks and optional file stats. */
export interface EditToolResponse {
  filePath?: string
  structuredPatch?: EditToolResponseHunk[]
}
