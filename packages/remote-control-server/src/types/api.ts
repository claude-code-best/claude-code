/** API 请求/响应类型定义 */

import type { SessionEvent } from '../transport/event-bus'

// Hono context variable types
declare module 'hono' {
  interface ContextVariableMap {
    username?: string
    accountId?: string
    uuid?: string
    jwtPayload?: { session_id: string; role: string; iat: number; exp: number }
  }
}

// --- Environment ---

export interface RegisterEnvironmentRequest {
  device_id?: string
  device_name?: string
  workspace_key?: string
  connection_id?: string
  legacy_environment_id?: string
  resume_session_id?: string
  machine_name?: string
  directory?: string
  branch?: string
  git_repo_url?: string
  max_sessions?: number
  worker_type?: string
  bridge_id?: string
  capabilities?: Record<string, unknown>
}

export interface RegisterEnvironmentResponse {
  id: string
  secret: string
  status: string
}

export type SessionWorkData = {
  type: 'session'
  id: string
  /** Per-session working-directory override chosen from the web UI. */
  directory?: string
  product?: 'chat' | 'code'
  project_id?: string | null
  project_prompt?: string
  artifact_directory?: string
  model_selection?: SessionModelSelectionPayload
}

export type EnvironmentCommandWorkData =
  | { type: 'list_directory'; path: string }
  | { type: 'resolve_workspace'; path: string; device_id: string }
  | {
      type: 'cleanup_chat_session'
      data_directory: string
      browser_scope_id: string
    }
  | { type: 'probe_workspace'; path: string }

export interface WorkResponse {
  id: string
  type: 'work'
  environment_id: string
  state: string
  data:
    | SessionWorkData
    | { type: 'healthcheck'; id: string }
    | EnvironmentCommandWorkData
  secret: string
  created_at: string
}

export interface WorkSecretPayload {
  version: number
  session_ingress_token: string
  api_base_url: string
  sources: string[]
  auth: string[]
  use_code_sessions: boolean
}

// --- Session ---

export interface SessionModelSelectionPayload {
  provider_id: string
  model_profile_id: string
  resolved_model_id: string
  provider_config_revision: number
  updated_at: number
}

export interface CreateSessionRequest {
  environment_id?: string | null
  title?: string
  events?: unknown[]
  source?: string
  permission_mode?: string
  directory?: string | null
  product?: 'chat' | 'code'
  project_id?: string | null
  runtime_environment_id?: string | null
  data_directory?: string | null
  project_prompt_revision?: number | null
  model_selection?: SessionModelSelectionPayload | null
}

export interface SessionResponse {
  id: string
  environment_id: string | null
  title: string | null
  status: string
  source: string
  permission_mode: string | null
  directory: string | null
  product: 'chat' | 'code'
  project_id: string | null
  runtime_environment_id: string | null
  data_directory: string | null
  project_prompt_revision: number | null
  model_selection: SessionModelSelectionPayload | null
  worker_epoch: number
  username: string | null
  created_at: number
  updated_at: number
  automation_state?: AutomationStateResponse
}

export interface AutomationStateResponse {
  enabled: boolean
  phase: 'standby' | 'sleeping' | null
  next_tick_at: number | null
  sleep_until: number | null
}

// --- v2 Code Sessions ---

export interface CreateCodeSessionRequest {
  title?: string
  source?: string
  permission_mode?: string
}

export interface BridgeResponse {
  api_base_url: string
  worker_epoch: number
  worker_jwt: string
  expires_in: number
}

// --- Web ---

export interface EnvironmentResponse {
  id: string
  device_id?: string | null
  device_name?: string | null
  workspace_key?: string | null
  machine_name: string | null
  directory: string | null
  branch: string | null
  status: string
  username: string | null
  last_poll_at: number | null
  worker_type?: string
  channel_group_id?: string | null
  capabilities?: Record<string, unknown> | null
  lease_epoch?: number
}

export interface SessionSummaryResponse {
  id: string
  title: string | null
  status: string
  username: string | null
  updated_at: number
}

// --- Web Auth ---

export interface WebLoginRequest {
  apiKey: string
  username: string
}

export interface WebLoginResponse {
  token: string
  expires_in: number
}

export interface WebControlRequest {
  type: string
  content?: string
  [key: string]: unknown
}

// --- Error ---

export interface ErrorResponse {
  error: {
    type: string
    message: string
  }
}

// --- Event ---

export interface SessionEventPayload {
  id: string
  session_id: string
  type: string
  payload: unknown
  direction: 'inbound' | 'outbound'
  seq_num: number
  created_at: number
}

export interface HistoryResponse {
  events: SessionEvent[]
  next_cursor: number
  has_more: boolean
  oldest_available_seq: number | null
  truncated: boolean
}
