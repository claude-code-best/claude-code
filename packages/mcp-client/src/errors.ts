// MCP typed error hierarchy

/**
 * Base error class for all MCP-related errors.
 */
export class McpError extends Error {
  constructor(
    message: string,
    public readonly serverName: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'McpError'
  }
}

/**
 * Error thrown when connection to an MCP server fails.
 */
export class McpConnectionError extends McpError {
  constructor(
    serverName: string,
    message: string,
    public readonly cause?: Error,
  ) {
    super(message, serverName, 'CONNECTION_FAILED')
    this.name = 'McpConnectionError'
  }
}

/**
 * Error thrown when authentication is required but not available.
 */
export class McpAuthError extends McpError {
  constructor(serverName: string, message: string) {
    super(message, serverName, 'AUTH_REQUIRED')
    this.name = 'McpAuthError'
  }
}

/**
 * Error thrown when a connection or request times out.
 */
export class McpTimeoutError extends McpError {
  constructor(
    serverName: string,
    public readonly timeoutMs: number,
  ) {
    super(
      `Connection to ${serverName} timed out after ${timeoutMs}ms`,
      serverName,
      'TIMEOUT',
    )
    this.name = 'McpTimeoutError'
  }
}

/**
 * Error thrown when an MCP tool call fails.
 */
export class McpToolCallError extends McpError {
  constructor(
    serverName: string,
    public readonly toolName: string,
    message: string,
  ) {
    super(message, serverName, 'TOOL_CALL_FAILED')
    this.name = 'McpToolCallError'
  }
}

/**
 * Error thrown when an MCP session has expired.
 */
export class McpSessionExpiredError extends McpError {
  constructor(serverName: string) {
    super(`Session expired for ${serverName}`, serverName, 'SESSION_EXPIRED')
    this.name = 'McpSessionExpiredError'
  }
}
