/**
 * Stub: Generated SDK core types.
 *
 * In the full build, this is auto-generated from coreSchemas.ts Zod schemas.
 * Here we provide typed stubs for all the types referenced throughout the codebase.
 */

import type { UUID } from 'crypto'
import type { MessageContent } from '../../types/message.js'
import type { BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

// Usage & Model
export type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow: number
  maxOutputTokens: number
}

export type ApiKeySource = string

export type ModelInfo = {
  name: string
  displayName?: string
  [key: string]: unknown
}

// MCP
export type McpServerConfigForProcessTransport = {
  command: string
  args: string[]
  type?: 'stdio'
  env?: Record<string, string>
} & { scope: string; pluginSource?: string }

export type McpServerStatus = {
  name: string
  status: 'connected' | 'disconnected' | 'error'
  [key: string]: unknown
}

// Permissions
export type PermissionMode = string

export type PermissionResult =
  | { behavior: 'allow' }
  | { behavior: 'deny'; message?: string }

export type PermissionUpdate = {
  path: string
  permission: string
  [key: string]: unknown
}

// Rewind
export type RewindFilesResult = {
  filesChanged: string[]
  [key: string]: unknown
}

// Account
export type AccountInfo = Record<string, unknown>

// Hook input types
export type HookInput = { hook_event_name: string; [key: string]: unknown }
export type HookJSONOutput = Record<string, unknown>
export type AsyncHookJSONOutput = Record<string, unknown>
export type SyncHookJSONOutput = Record<string, unknown>

export type PreToolUseHookInput = HookInput & { tool_name: string }
export type PostToolUseHookInput = HookInput & { tool_name: string }
export type PostToolUseFailureHookInput = HookInput & { tool_name: string }
export type PermissionRequestHookInput = HookInput & { tool_name: string }
export type PermissionDeniedHookInput = HookInput
export type NotificationHookInput = HookInput & { message: string }
export type UserPromptSubmitHookInput = HookInput & { prompt: string }
export type SessionStartHookInput = HookInput
export type SessionEndHookInput = HookInput & { exit_reason: string }
export type SetupHookInput = HookInput
export type StopHookInput = HookInput
export type StopFailureHookInput = HookInput
export type SubagentStartHookInput = HookInput
export type SubagentStopHookInput = HookInput
export type PreCompactHookInput = HookInput
export type PostCompactHookInput = HookInput
export type TeammateIdleHookInput = HookInput
export type TaskCreatedHookInput = HookInput
export type TaskCompletedHookInput = HookInput
export type ElicitationHookInput = HookInput
export type ElicitationResultHookInput = HookInput
export type ConfigChangeHookInput = HookInput
export type InstructionsLoadedHookInput = HookInput
export type CwdChangedHookInput = HookInput & { cwd: string }
export type FileChangedHookInput = HookInput & { path: string }

// SDK Message types
export type SDKMessage = { type: string; [key: string]: unknown }
export type SDKUserMessage = {
  type: 'user'
  content: string | Array<{ type: string; [key: string]: unknown }>
  uuid: string
  message?: {
    role?: string
    id?: string
    content?: MessageContent
    usage?: BetaUsage | Record<string, unknown>
    [key: string]: unknown
  }
  tool_use_result?: unknown
  timestamp?: string
  [key: string]: unknown
}
export type SDKUserMessageReplay = SDKUserMessage
export type SDKAssistantMessage = {
  type: 'assistant'
  content: unknown
  message?: {
    role?: string
    id?: string
    content?: MessageContent
    usage?: BetaUsage | Record<string, unknown>
    [key: string]: unknown
  }
  uuid?: UUID
  error?: unknown
  [key: string]: unknown
}
export type SDKAssistantErrorMessage = {
  type: 'assistant_error'
  error: unknown
  [key: string]: unknown
}
export type SDKAssistantMessageError =
  | 'authentication_failed'
  | 'billing_error'
  | 'rate_limit'
  | 'invalid_request'
  | 'server_error'
  | 'unknown'
  | 'max_output_tokens'
export type SDKPartialAssistantMessage = {
  type: 'partial_assistant'
  event: { type: string; [key: string]: unknown }
  [key: string]: unknown
}
export type SDKResultMessage = {
  type: 'result'
  subtype?: string
  errors?: string[]
  result?: string
  uuid?: UUID
  [key: string]: unknown
}
export type SDKResultSuccess = {
  type: 'result_success'
  [key: string]: unknown
}
export type SDKSystemMessage = {
  type: 'system'
  subtype?: string
  model?: string
  uuid?: UUID
  [key: string]: unknown
}
export type SDKStatusMessage = {
  type: 'status'
  subtype?: string
  status?: string
  uuid?: UUID
  [key: string]: unknown
}
export type SDKToolProgressMessage = {
  type: 'tool_progress'
  tool_name?: string
  elapsed_time_seconds?: number
  uuid?: UUID
  tool_use_id?: string
  [key: string]: unknown
}
export type SDKCompactBoundaryMessage = {
  type: 'compact_boundary'
  uuid?: UUID
  compact_metadata: {
    trigger?: unknown
    pre_tokens?: unknown
    preserved_segment?: {
      head_uuid: UUID
      anchor_uuid: UUID
      tail_uuid: UUID
      [key: string]: unknown
    }
    [key: string]: unknown
  }
  [key: string]: unknown
}
export type SDKPermissionDenial = {
  type: 'permission_denial'
  [key: string]: unknown
}
export type SDKRateLimitInfo = { type: 'rate_limit'; [key: string]: unknown }
export type SDKStatus = 'active' | 'idle' | 'error' | string

export type SDKSessionInfo = {
  sessionId: string
  summary?: string
  [key: string]: unknown
}

// Other referenced types
export type OutputFormat = {
  type: 'json_schema'
  schema: Record<string, unknown>
}
export type ConfigScope = string
export type SdkBeta = string
export type ThinkingConfig = { type: string; [key: string]: unknown }
export type McpStdioServerConfig = {
  command: string
  args: string[]
  type: 'stdio'
  env?: Record<string, string>
}
export type McpSSEServerConfig = {
  type: 'sse'
  url: string
  [key: string]: unknown
}
export type McpHttpServerConfig = {
  type: 'http'
  url: string
  [key: string]: unknown
}
export type McpSdkServerConfig = { type: 'sdk'; [key: string]: unknown }
export type McpClaudeAIProxyServerConfig = {
  type: 'claudeai-proxy'
  [key: string]: unknown
}
export type McpServerStatusConfig = { [key: string]: unknown }
export type McpSetServersResult = { [key: string]: unknown }
export type PermissionUpdateDestination = string
export type PermissionBehavior = string
export type PermissionRuleValue = string
export type PermissionDecisionClassification = string
export type PromptRequestOption = { [key: string]: unknown }
export type PromptRequest = { [key: string]: unknown }
export type PromptResponse = { [key: string]: unknown }
export type SlashCommand = { [key: string]: unknown }
export type AgentInfo = { [key: string]: unknown }
export type AgentMcpServerSpec = { [key: string]: unknown }
export type AgentDefinition = { [key: string]: unknown }
export type SettingSource = { [key: string]: unknown }
export type SdkPluginConfig = { [key: string]: unknown }
export type FastModeState = { [key: string]: unknown }
