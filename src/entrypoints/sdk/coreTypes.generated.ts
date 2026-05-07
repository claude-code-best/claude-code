/**
 * Stub：自动生成的 SDK Core 类型。
 *
 * 在完整构建中，这些类型会基于 coreSchemas.ts 中的 Zod schema 自动生成。
 * 这里提供的是类型化的 stub，用于覆盖代码库中引用到的所有相关类型。
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
export type HookInputBase = {
  session_id: string
  transcript_path: string
  cwd: string
  permission_mode?: string
  /** Present only for hooks fired from within a subagent. */
  agent_id?: string
  /** Present for subagent hooks, or for main-thread sessions started with --agent. */
  agent_type?: string
}

export type HookInput =
  | (HookInputBase & {
      hook_event_name: 'PreToolUse'
      tool_name: string
      tool_input: unknown
      tool_use_id: string
    })
  | (HookInputBase & {
      hook_event_name: 'PermissionRequest'
      tool_name: string
      tool_input: unknown
      permission_suggestions?: PermissionUpdate[]
    })
  | (HookInputBase & {
      hook_event_name: 'PostToolUse'
      tool_name: string
      tool_input: unknown
      tool_response: unknown
      tool_use_id: string
    })
  | (HookInputBase & {
      hook_event_name: 'PostToolUseFailure'
      tool_name: string
      tool_input: unknown
      tool_use_id: string
      error: string
      is_interrupt?: boolean
    })
  | (HookInputBase & {
      hook_event_name: 'PermissionDenied'
      tool_name: string
      tool_input: unknown
      tool_use_id: string
      reason: string
    })
  | (HookInputBase & {
      hook_event_name: 'Notification'
      message: string
      title?: string
      notification_type: string
    })
  | (HookInputBase & { hook_event_name: 'UserPromptSubmit'; prompt: string })
  | (HookInputBase & {
      hook_event_name: 'SessionStart'
      source: 'startup' | 'resume' | 'clear' | 'compact'
      agent_type?: string
      model?: string
    })
  | (HookInputBase & {
      hook_event_name: 'SessionEnd'
      reason:
        | 'clear'
        | 'resume'
        | 'logout'
        | 'prompt_input_exit'
        | 'other'
        | 'bypass_permissions_disabled'
    })
  | (HookInputBase & {
      hook_event_name: 'Setup'
      trigger: 'init' | 'maintenance'
    })
  | (HookInputBase & {
      hook_event_name: 'Stop'
      stop_hook_active: boolean
      last_assistant_message?: string
    })
  | (HookInputBase & {
      hook_event_name: 'StopFailure'
      error: string
      error_details?: unknown
      last_assistant_message?: string
    })
  | (HookInputBase & {
      hook_event_name: 'SubagentStart'
      agent_id: string
      agent_type: string
    })
  | (HookInputBase & {
      hook_event_name: 'SubagentStop'
      stop_hook_active: boolean
      agent_id: string
      agent_transcript_path: string
      agent_type: string
      last_assistant_message?: string
    })
  | (HookInputBase & {
      hook_event_name: 'PreCompact'
      trigger: 'manual' | 'auto'
      custom_instructions: string | null
    })
  | (HookInputBase & {
      hook_event_name: 'PostCompact'
      trigger: 'manual' | 'auto'
      compact_summary: string
    })
  | (HookInputBase & {
      hook_event_name: 'TeammateIdle'
      teammate_name: string
      team_name: string
    })
  | (HookInputBase & {
      hook_event_name: 'TaskCreated'
      task_id: string
      task_subject: string
      task_description?: string
      teammate_name?: string
      team_name?: string
    })
  | (HookInputBase & {
      hook_event_name: 'TaskCompleted'
      task_id: string
      task_subject: string
      task_description?: string
      teammate_name?: string
      team_name?: string
    })
  | (HookInputBase & {
      hook_event_name: 'Elicitation'
      mcp_server_name: string
      message: string
      mode?: 'form' | 'url'
      url?: string
      elicitation_id?: string
      requested_schema?: Record<string, unknown>
    })
  | (HookInputBase & {
      hook_event_name: 'ElicitationResult'
      mcp_server_name: string
      elicitation_id?: string
      mode?: 'form' | 'url'
      action: 'accept' | 'decline' | 'cancel'
      content?: Record<string, unknown>
    })
  | (HookInputBase & {
      hook_event_name: 'ConfigChange'
      source:
        | 'user_settings'
        | 'project_settings'
        | 'local_settings'
        | 'policy_settings'
        | 'skills'
      file_path?: string
    })
  | (HookInputBase & {
      hook_event_name: 'InstructionsLoaded'
      file_path: string
      memory_type: 'User' | 'Project' | 'Local' | 'Managed'
      load_reason:
        | 'session_start'
        | 'nested_traversal'
        | 'path_glob_match'
        | 'include'
        | 'compact'
      globs?: string[]
      trigger_file_path?: string
      parent_file_path?: string
    })
  | (HookInputBase & { hook_event_name: 'WorktreeCreate'; name: string })
  | (HookInputBase & {
      hook_event_name: 'WorktreeRemove'
      worktree_path: string
    })
  | (HookInputBase & {
      hook_event_name: 'CwdChanged'
      old_cwd: string
      new_cwd: string
    })
  | (HookInputBase & {
      hook_event_name: 'FileChanged'
      file_path: string
      event: 'change' | 'add' | 'unlink'
    })

export type AsyncHookJSONOutput = {
  async: true
  asyncTimeout?: number
}

export type SyncHookJSONOutput = {
  continue?: boolean
  suppressOutput?: boolean
  stopReason?: string
  decision?: 'approve' | 'block'
  systemMessage?: string
  reason?: string
  hookSpecificOutput?:
    | {
        hookEventName: 'PreToolUse'
        permissionDecision?: string
        permissionDecisionReason?: string
        updatedInput?: Record<string, unknown>
        additionalContext?: string
      }
    | { hookEventName: 'UserPromptSubmit'; additionalContext?: string }
    | {
        hookEventName: 'SessionStart'
        additionalContext?: string
        initialUserMessage?: string
        watchPaths?: string[]
      }
    | { hookEventName: 'Setup'; additionalContext?: string }
    | { hookEventName: 'SubagentStart'; additionalContext?: string }
    | {
        hookEventName: 'PostToolUse'
        additionalContext?: string
        updatedMCPToolOutput?: unknown
      }
    | { hookEventName: 'PostToolUseFailure'; additionalContext?: string }
    | { hookEventName: 'PermissionDenied'; retry?: boolean }
    | { hookEventName: 'Notification'; additionalContext?: string }
    | {
        hookEventName: 'PermissionRequest'
        decision:
          | {
              behavior: 'allow'
              updatedInput?: Record<string, unknown>
              /**
               * Note: the hook JSON schema uses PermissionUpdateSchema(), which is a
               * richer union than the legacy `{path, permission}` shape.
               */
              updatedPermissions?: unknown[]
            }
          | { behavior: 'deny'; message?: string; interrupt?: boolean }
      }
    | {
        hookEventName: 'Elicitation'
        action?: 'accept' | 'decline' | 'cancel'
        content?: Record<string, unknown>
      }
    | {
        hookEventName: 'ElicitationResult'
        action?: 'accept' | 'decline' | 'cancel'
        content?: Record<string, unknown>
      }
    | { hookEventName: 'CwdChanged'; watchPaths?: string[] }
    | { hookEventName: 'FileChanged'; watchPaths?: string[] }
    | { hookEventName: 'WorktreeCreate'; worktreePath: string }
}

export type HookJSONOutput = AsyncHookJSONOutput | SyncHookJSONOutput

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
