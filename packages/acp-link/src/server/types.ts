import type { ChildProcess } from 'node:child_process'
import * as acp from '@agentclientprotocol/sdk'

// JSON-RPC 2.0 reserved error codes (spec §5.1)
export const JSONRPC_PARSE_ERROR = -32700
export const JSONRPC_INVALID_REQUEST = -32600
export const JSONRPC_METHOD_NOT_FOUND = -32601
export const JSONRPC_INVALID_PARAMS = -32602
export const JSONRPC_INTERNAL_ERROR = -32603

export interface ServerConfig {
  port: number
  host: string
  command: string
  args: string[]
  cwd: string
  debug?: boolean
  token?: string
  https?: boolean
  /** Default permission mode for new sessions (e.g. "auto", "default", "bypassPermissions") */
  permissionMode?: string
  /** Channel group ID for RCS registration */
  group?: string
}

// Pending permission request
export interface PendingPermission {
  resolve: (
    outcome:
      | { outcome: 'cancelled' }
      | { outcome: 'selected'; optionId: string },
  ) => void
  timeout: ReturnType<typeof setTimeout>
}

// PromptCapabilities from ACP protocol
// Reference: Zed's prompt_capabilities to check image support
export interface PromptCapabilities {
  audio?: boolean
  embeddedContext?: boolean
  image?: boolean
}

// SessionModelState from ACP protocol
// Reference: Zed's AgentModelSelector reads from state.available_models
export interface SessionModelState {
  availableModels: Array<{
    modelId: string
    name: string
    description?: string | null
  }>
  currentModelId: string
}

// AgentCapabilities from ACP protocol
// Reference: Zed's AcpConnection.agent_capabilities
// Matches SDK's AgentCapabilities exactly
export interface AgentCapabilities {
  _meta?: Record<string, unknown> | null
  loadSession?: boolean
  mcpCapabilities?: {
    _meta?: Record<string, unknown> | null
    clientServers?: boolean
  }
  promptCapabilities?: PromptCapabilities
  sessionCapabilities?: {
    _meta?: Record<string, unknown> | null
    fork?: Record<string, unknown> | null
    list?: Record<string, unknown> | null
    resume?: Record<string, unknown> | null
  }
}

// Track connected clients and their agent connections
export interface ClientState {
  process: ChildProcess | null
  connection: acp.ClientSideConnection | null
  sessionId: string | null
  pendingPermissions: Map<string, PendingPermission>
  agentCapabilities: AgentCapabilities | null
  promptCapabilities: PromptCapabilities | null
  modelState: SessionModelState | null
  isAlive: boolean
  /**
   * True when this client speaks JSON-RPC 2.0 (determined from the first
   * framed message). When true, responses are emitted as JSON-RPC responses
   * that preserve the request `id`; otherwise the legacy `{type, payload}`
   * envelope is used for backwards compatibility.
   */
  jsonRpc: boolean
  /**
   * Client-supplied identity and capabilities, captured from the JSON-RPC
   * `initialize` request or legacy `connect` payload and forwarded to the
   * agent instead of the hardcoded Zed fallback. See audit §8.7.
   */
  clientInfo: { name: string; version: string }
  clientCapabilities: Record<string, unknown>
  /** Negotiated ACP protocolVersion surfaced back to the client (audit §8.13). */
  protocolVersion: number | null
  /** Agent identity from InitializeResult.agentInfo (audit §8.13). */
  agentInfo: { name: string; version: string; [k: string]: unknown } | null
  /**
   * Currently in-flight JSON-RPC request being serviced. The proxy echoes this
   * id back in the JSON-RPC response (audit §8.2). At most one request is
   * processed per client at a time because onMessage is awaited serially.
   */
  pendingJsonRpc: {
    id: string | number | null
    /** Legacy response type the handler will emit via send(). */
    responseType: string
  } | null
}

// Default fallback client identity (used only when the client provides none)
export const DEFAULT_CLIENT_INFO = Object.freeze({
  name: 'zed',
  version: '1.0.0',
})
export const DEFAULT_CLIENT_CAPABILITIES = Object.freeze({
  fs: { readTextFile: true, writeTextFile: true },
})

/**
 * Create a fresh ClientState with the default fallback client identity and
 * capabilities. Used by every WebSocket open handler and the RCS relay.
 */
export function createClientState(): ClientState {
  return {
    process: null,
    connection: null,
    sessionId: null,
    pendingPermissions: new Map(),
    agentCapabilities: null,
    promptCapabilities: null,
    modelState: null,
    isAlive: true,
    jsonRpc: false,
    clientInfo: { ...DEFAULT_CLIENT_INFO },
    clientCapabilities: { ...DEFAULT_CLIENT_CAPABILITIES },
    protocolVersion: null,
    agentInfo: null,
    pendingJsonRpc: null,
  }
}

// ContentBlock type matching @agentclientprotocol/sdk
export interface ContentBlock {
  type: string
  text?: string
  data?: string
  mimeType?: string
  uri?: string
  name?: string
}

export type PermissionResponsePayload = {
  requestId: string
  outcome: { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string }
}

export type ProxyMessage =
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'new_session'; payload: { cwd?: string; permissionMode?: string } }
  | { type: 'prompt'; payload: { content: ContentBlock[] } }
  | { type: 'permission_response'; payload: PermissionResponsePayload }
  | { type: 'cancel' }
  | { type: 'set_session_model'; payload: { modelId: string } }
  | { type: 'list_sessions'; payload: { cwd?: string; cursor?: string } }
  | { type: 'load_session'; payload: { sessionId: string; cwd?: string } }
  | { type: 'resume_session'; payload: { sessionId: string; cwd?: string } }
  | { type: 'ping' }
