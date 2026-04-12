// mcp-client — MCP protocol client
// Strict protocol layer: connection, transport, tool discovery, execution

// Types & schemas
export {
  ConfigScope,
  TransportType,
  McpStdioServerConfigSchema,
  McpSSEServerConfigSchema,
  McpHTTPServerConfigSchema,
  McpWebSocketServerConfigSchema,
  McpSdkServerConfigSchema,
  McpClaudeAIProxyServerConfigSchema,
  McpServerConfigSchema,
  McpJsonConfigSchema,
} from './types.js'

export type {
  ConfigScope as ConfigScopeType,
  Transport,
  McpStdioServerConfig,
  McpSSEServerConfig,
  McpSSEIDEServerConfig,
  McpWebSocketIDEServerConfig,
  McpHTTPServerConfig,
  McpWebSocketServerConfig,
  McpSdkServerConfig,
  McpClaudeAIProxyServerConfig,
  McpServerConfig,
  ScopedMcpServerConfig,
  McpJsonConfig,
  MCPServerConnection,
  ConnectedMCPServer,
  FailedMCPServer,
  NeedsAuthMCPServer,
  PendingMCPServer,
  DisabledMCPServer,
  ServerResource,
  SerializedTool,
  SerializedClient,
  MCPCliState,
} from './types.js'

// Errors
export {
  McpError,
  McpConnectionError,
  McpAuthError,
  McpTimeoutError,
  McpToolCallError,
  McpSessionExpiredError,
} from './errors.js'

// Interfaces (host dependency injection)
export type {
  Logger,
  AnalyticsSink,
  FeatureGate,
  AuthProvider,
  ProxyConfig,
  ContentStorage,
  ImageProcessor,
  HttpConfig,
  SubprocessEnvProvider,
  McpClientDependencies,
} from './interfaces.js'

// Transport
export { createLinkedTransportPair } from './transport/InProcessTransport.js'

// String utilities
export {
  buildMcpToolName,
  normalizeNameForMCP,
  mcpInfoFromString,
  getMcpPrefix,
  getToolNameForPermissionCheck,
  getMcpDisplayName,
  extractMcpToolDisplayName,
} from './strings.js'

// Cache
export { memoizeWithLRU } from './cache.js'

// Sanitization
export { recursivelySanitizeUnicode } from './sanitization.js'

// Connection utilities
export {
  DEFAULT_CONNECTION_TIMEOUT_MS,
  MAX_MCP_DESCRIPTION_LENGTH,
  MAX_ERRORS_BEFORE_RECONNECT,
  createMcpClient,
  withConnectionTimeout,
  captureStderr,
  isTerminalConnectionError,
  isMcpSessionExpiredError,
  installConnectionMonitor,
  terminateWithSignalEscalation,
  createCleanup,
  buildConnectedServer,
} from './connection.js'
export type {
  CreateClientOptions,
  ConnectionMonitorOptions,
  CleanupOptions,
  BuildConnectedServerOptions,
} from './connection.js'

// Tool discovery
export {
  MCP_FETCH_CACHE_SIZE,
  discoverTools,
  createCachedToolDiscovery,
} from './discovery.js'
export type { DiscoveryOptions } from './discovery.js'

// Tool execution
export { callMcpTool } from './execution.js'
export type { CallToolOptions, CallToolResult } from './execution.js'

// Manager (main API)
export { createMcpManager } from './manager.js'
export type { McpManager } from './manager.js'
