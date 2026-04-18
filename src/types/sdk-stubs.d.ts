/**
 * Stub type declarations for missing SDK modules.
 *
 * These modules are referenced in the open-source codebase but their source
 * is not yet published. All types are exported as `any` to suppress TS errors
 * while keeping the import/export structure valid.
 */

// ============================================================================
// coreTypes.generated.js — Generated from coreSchemas.ts Zod schemas
// ============================================================================
declare module '*/sdk/coreTypes.generated.js' {
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

  // Hook types
  export type HookInput = { hook_event_name: string; [key: string]: unknown }
  export type HookJSONOutput = { [key: string]: unknown }
  export type AsyncHookJSONOutput = { [key: string]: unknown }
  export type SyncHookJSONOutput = { [key: string]: unknown }
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
    content: unknown
    uuid: string
    [key: string]: unknown
  }
  export type SDKUserMessageReplay = SDKUserMessage
  export type SDKAssistantMessage = {
    type: 'assistant'
    content: unknown
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
    [key: string]: unknown
  }
  export type SDKResultMessage = { type: 'result'; [key: string]: unknown }
  export type SDKResultSuccess = {
    type: 'result_success'
    [key: string]: unknown
  }
  export type SDKSystemMessage = { type: 'system'; [key: string]: unknown }
  export type SDKStatusMessage = { type: 'status'; [key: string]: unknown }
  export type SDKToolProgressMessage = {
    type: 'tool_progress'
    [key: string]: unknown
  }
  export type SDKCompactBoundaryMessage = {
    type: 'compact_boundary'
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

  // Account
  export type AccountInfo = { [key: string]: unknown }
}
