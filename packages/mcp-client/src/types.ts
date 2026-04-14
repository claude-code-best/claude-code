// MCP configuration types, schemas, and connection state types
// Adapted from src/services/mcp/types.ts — uses zod directly instead of lazySchema

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type {
  Resource,
  ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod/v4'

// ============================================================================
// Configuration scope
// ============================================================================

export const ConfigScope = z.enum([
  'local',
  'user',
  'project',
  'dynamic',
  'enterprise',
  'claudeai',
  'managed',
])
export type ConfigScope = z.infer<typeof ConfigScope>

// ============================================================================
// Transport type
// ============================================================================

export const TransportType = z.enum([
  'stdio',
  'sse',
  'sse-ide',
  'http',
  'ws',
  'sdk',
  'claudeai-proxy',
])
export type Transport = z.infer<typeof TransportType>

// ============================================================================
// Server configuration schemas
// ============================================================================

export const McpStdioServerConfigSchema = z.object({
  type: z.literal('stdio').optional(),
  command: z.string().min(1, 'Command cannot be empty'),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).optional(),
})

const McpOAuthConfigSchema = z.object({
  clientId: z.string().optional(),
  callbackPort: z.number().int().positive().optional(),
  authServerMetadataUrl: z
    .string()
    .url()
    .startsWith('https://', {
      message: 'authServerMetadataUrl must use https://',
    })
    .optional(),
  xaa: z.boolean().optional(),
})

export const McpSSEServerConfigSchema = z.object({
  type: z.literal('sse'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  headersHelper: z.string().optional(),
  oauth: McpOAuthConfigSchema.optional(),
})

export const McpSSEIDEServerConfigSchema = z.object({
  type: z.literal('sse-ide'),
  url: z.string(),
  ideName: z.string(),
  ideRunningInWindows: z.boolean().optional(),
})

export const McpWebSocketIDEServerConfigSchema = z.object({
  type: z.literal('ws-ide'),
  url: z.string(),
  ideName: z.string(),
  authToken: z.string().optional(),
  ideRunningInWindows: z.boolean().optional(),
})

export const McpHTTPServerConfigSchema = z.object({
  type: z.literal('http'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  headersHelper: z.string().optional(),
  oauth: McpOAuthConfigSchema.optional(),
})

export const McpWebSocketServerConfigSchema = z.object({
  type: z.literal('ws'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  headersHelper: z.string().optional(),
})

export const McpSdkServerConfigSchema = z.object({
  type: z.literal('sdk'),
  name: z.string(),
})

export const McpClaudeAIProxyServerConfigSchema = z.object({
  type: z.literal('claudeai-proxy'),
  url: z.string(),
  id: z.string(),
})

export const McpServerConfigSchema = z.union([
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpSSEIDEServerConfigSchema,
  McpWebSocketIDEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
  McpSdkServerConfigSchema,
  McpClaudeAIProxyServerConfigSchema,
])

// ============================================================================
// Inferred config types
// ============================================================================

export type McpStdioServerConfig = z.infer<typeof McpStdioServerConfigSchema>
export type McpSSEServerConfig = z.infer<typeof McpSSEServerConfigSchema>
export type McpSSEIDEServerConfig = z.infer<typeof McpSSEIDEServerConfigSchema>
export type McpWebSocketIDEServerConfig = z.infer<
  typeof McpWebSocketIDEServerConfigSchema
>
export type McpHTTPServerConfig = z.infer<typeof McpHTTPServerConfigSchema>
export type McpWebSocketServerConfig = z.infer<
  typeof McpWebSocketServerConfigSchema
>
export type McpSdkServerConfig = z.infer<typeof McpSdkServerConfigSchema>
export type McpClaudeAIProxyServerConfig = z.infer<
  typeof McpClaudeAIProxyServerConfigSchema
>
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>

export type ScopedMcpServerConfig = McpServerConfig & {
  scope: ConfigScope
  pluginSource?: string
}

export const McpJsonConfigSchema = z.object({
  mcpServers: z.record(z.string(), McpServerConfigSchema),
})

export type McpJsonConfig = z.infer<typeof McpJsonConfigSchema>

// ============================================================================
// Server connection state types
// ============================================================================

export type ConnectedMCPServer = {
  client: Client
  name: string
  type: 'connected'
  capabilities: ServerCapabilities
  serverInfo?: {
    name: string
    version: string
  }
  instructions?: string
  config: ScopedMcpServerConfig
  cleanup: () => Promise<void>
}

export type FailedMCPServer = {
  name: string
  type: 'failed'
  config: ScopedMcpServerConfig
  error?: string
}

export type NeedsAuthMCPServer = {
  name: string
  type: 'needs-auth'
  config: ScopedMcpServerConfig
}

export type PendingMCPServer = {
  name: string
  type: 'pending'
  config: ScopedMcpServerConfig
  reconnectAttempt?: number
  maxReconnectAttempts?: number
}

export type DisabledMCPServer = {
  name: string
  type: 'disabled'
  config: ScopedMcpServerConfig
}

export type MCPServerConnection =
  | ConnectedMCPServer
  | FailedMCPServer
  | NeedsAuthMCPServer
  | PendingMCPServer
  | DisabledMCPServer

// ============================================================================
// Resource and serialization types
// ============================================================================

export type ServerResource = Resource & { server: string }

export interface SerializedTool {
  name: string
  description: string
  inputJSONSchema?: {
    [x: string]: unknown
    type: 'object'
    properties?: {
      [x: string]: unknown
    }
  }
  isMcp?: boolean
  originalToolName?: string
}

export interface SerializedClient {
  name: string
  type: 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'
  capabilities?: ServerCapabilities
}

export interface MCPCliState {
  clients: SerializedClient[]
  configs: Record<string, ScopedMcpServerConfig>
  tools: SerializedTool[]
  resources: Record<string, ServerResource[]>
  normalizedNames?: Record<string, string>
}
