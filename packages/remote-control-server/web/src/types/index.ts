export interface Environment {
  id: string
  device_id?: string
  device_name?: string
  workspace_key?: string
  machine_name?: string
  directory?: string
  status: string
  branch?: string
  worker_type?: string
  channel_group_id?: string | null
  capabilities?: Record<string, unknown> | null
  lease_epoch?: number
}

export type ProviderKind =
  | 'anthropic'
  | 'anthropic-compatible'
  | 'openai-compatible'
  | 'chatgpt'
  | 'gemini'
  | 'grok'
  | 'bedrock'
  | 'vertex'
  | 'foundry'

export type ProviderAuthScheme =
  | 'oauth'
  | 'api-key'
  | 'bearer'
  | 'aws-iam'
  | 'gcp-adc'
  | 'azure-ad'
  | 'proxy'

export interface ProviderCatalogModelProfile {
  id: string
  displayName: string
  remoteModelId: string
  enabled: boolean
  archived: boolean
  validation: { status: 'unverified' | 'valid' | 'invalid' }
}

export interface ProviderCatalogProfile {
  id: string
  displayName: string
  kind: ProviderKind
  baseUrl?: string
  auth: {
    scheme: ProviderAuthScheme
    source:
      | 'secure-storage'
      | 'settings'
      | 'environment'
      | 'helper'
      | 'cloud-chain'
    envName?: string
    configured: boolean
    expiresAt?: number
    lastErrorCode?: string
  }
  compatRule?: 'cerebras' | 'groq' | 'deepseek' | 'strict-openai' | 'permissive'
  enabled: boolean
  archived: boolean
  models: ProviderCatalogModelProfile[]
}

export interface ProviderModelCatalog {
  version: 1
  revision: number
  defaultModel: { providerId: string; modelProfileId: string } | null
  providers: ProviderCatalogProfile[]
  features: {
    catalogWrite: boolean
    sessionPersistence: boolean
    runtimeSwitch: boolean
    secretControl: boolean
  }
}

export interface ProviderCatalogResponse {
  catalog: ProviderModelCatalog
  stale: boolean
  value?: unknown
}

export interface ProviderModelMutationPayload {
  id: string
  display_name: string
  remote_model_id: string
  enabled: boolean
  archived: boolean
  validation: { status: 'unverified' | 'valid' | 'invalid' }
}

export interface ProviderMutationPayload {
  id: string
  display_name: string
  kind: ProviderKind
  base_url?: string
  auth: {
    scheme: ProviderAuthScheme
    source:
      | 'secure-storage'
      | 'settings'
      | 'environment'
      | 'helper'
      | 'cloud-chain'
    env_name?: string
  }
  compat_rule?:
    | 'cerebras'
    | 'groq'
    | 'deepseek'
    | 'strict-openai'
    | 'permissive'
  enabled: boolean
  archived: boolean
  models: ProviderModelMutationPayload[]
}

export type Product = 'chat' | 'code'

export type ProjectState = 'active' | 'archived' | 'missing'

/** A product-owned project. Code projects may include workspace identity. */
export interface Project {
  id: string
  product: Product
  name: string
  project_prompt: string
  prompt_revision: number
  state: ProjectState
  device_id?: string | null
  workspace_key?: string | null
  canonical_path?: string | null
  git_root?: string | null
  git_repo_url?: string | null
  created_at: number
  updated_at: number
}

/** Data used by one product surface in the workspace shell. */
export interface ProductWorkspaceData {
  sessions: Session[]
  projects: Project[]
  environments: Environment[]
}

export interface RemoteDirectoryEntry {
  name: string
  kind: 'directory' | 'file'
}

export interface RemoteDirectoryListing {
  path: string
  entries: RemoteDirectoryEntry[]
}

export interface Session {
  id: string
  title?: string
  status: string
  product?: Product
  project_id?: string | null
  environment_id?: string | null
  source?: string
  permission_mode?: string | null
  directory?: string | null
  data_directory?: string | null
  project_prompt_revision?: number | null
  runtime_environment_id?: string | null
  model_selection?: SessionModelSelection | null
  created_at?: number
  updated_at?: number
  automation_state?: unknown
  worker_status?: string | null
  last_heartbeat_at?: number | null
  requires_action_details?: Record<string, unknown> | null
}

export interface SessionModelSelection {
  provider_id: string
  model_profile_id: string
  resolved_model_id: string
  provider_config_revision: number
  updated_at: number
}

export interface SessionEvent {
  id: string
  sessionId: string
  type: string
  payload: EventPayload
  direction: 'inbound' | 'outbound'
  seqNum: number
  createdAt: number
}

export interface SessionHistoryResponse {
  events: SessionEvent[]
  next_cursor: number
  has_more: boolean
  oldest_available_seq: number | null
  truncated: boolean
}

export interface EventPayloadImage {
  mimeType: string
  data: string
}

export interface EventPayload {
  content?: string
  message_id?: string
  block_index?: number
  parent_tool_use_id?: string | null
  snapshot?: boolean
  message?: unknown
  status?: string
  subtype?: string
  uuid?: string
  isSynthetic?: boolean
  raw?: Record<string, unknown>
  request_id?: string
  request?: PermissionRequest
  approved?: boolean
  updated_input?: Record<string, unknown>
  tool_name?: string
  tool_input?: unknown
  tool_call_id?: string
  tool_use_id?: string
  output?: unknown
  is_error?: boolean
  input?: unknown
  description?: string
  images?: EventPayloadImage[]
  task_list_id?: string
  taskListId?: string
  tasks?: unknown[]
  /** control_response payload from the CLI (set_model / set_permission_mode …) */
  response?: ControlResponsePayload
  // system/init session metadata (subtype === 'init')
  cwd?: string
  model?: string
  permissionMode?: string
  slash_commands?: string[]
  tools?: string[]
  agents?: string[]
  skills?: string[]
  mcp_servers?: Array<{ name?: string; status?: string }>
  plugins?: Array<{ name?: string; path?: string; source?: string }>
  output_style?: string
  claude_code_version?: string
  capabilities?: Record<string, unknown>
  goal?: unknown
  runs?: unknown[]
  named_workflows?: string[]
  runs_directory?: string
}

export interface ControlResponsePayload {
  subtype?: string
  request_id?: string
  error?: string
  response?: unknown
}

/** MCP server connection announced by the CLI via system/init. */
export interface SessionMcpServer {
  name: string
  status: string
}

/** Plugin announced by the CLI via system/init. */
export interface SessionPlugin {
  name: string
  path?: string
  source?: string
}

/** Session metadata announced by the CLI via system/init. */
export interface SessionInitInfo {
  cwd?: string
  model?: string
  permissionMode?: string
  slashCommands?: string[]
  tools?: string[]
  agents?: string[]
  skills?: string[]
  mcpServers?: SessionMcpServer[]
  plugins?: SessionPlugin[]
  outputStyle?: string
  version?: string
  capabilities?: Record<string, unknown>
}

/** Cumulative token usage aggregated from assistant events. */
export interface TokenUsageTotals {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  apiCalls: number
}

export interface ContentBlock {
  type: string
  text?: string
  id?: string
  tool_use_id?: string
  name?: string
  input?: unknown
  content?: unknown
  is_error?: boolean
}

export interface PermissionRequest {
  subtype?: string
  tool_use_id?: string
  tool_name?: string
  input?: unknown
  tool_input?: unknown
  description?: string
}

export interface Question {
  question: string
  header?: string
  multiSelect?: boolean
  options?: QuestionOption[]
  metadata?: Record<string, unknown>
}

export interface QuestionOption {
  label: string
  description?: string
}

export interface ControlResponse {
  type: 'permission_response'
  approved: boolean
  request_id: string
  message?: string
  updated_input?: Record<string, unknown>
  updated_permissions?: PermissionUpdate[]
}

/**
 * Outbound control request envelope (web → CLI). Mirrors the SDK control
 * protocol — the CLI handles subtypes set_model / set_permission_mode /
 * set_max_thinking_tokens / interrupt and replies with a control_response
 * carrying the same request_id.
 */
export interface ControlRequestEnvelope {
  type: 'control_request'
  request_id: string
  request: { subtype: string; [key: string]: unknown }
  uuid?: string
}

export interface PermissionUpdate {
  type: string
  mode: string
  destination: string
}

export type ActivityMode = 'working' | 'idle' | 'standby' | 'sleeping'

export interface AutomationActivity {
  mode: ActivityMode
  iconVariant: string
  label: string
  endsAt?: number
}
