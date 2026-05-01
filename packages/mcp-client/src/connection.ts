// MCP connection utilities — protocol-level helpers for establishing and managing connections
// These are building blocks used by the host's connectToServer implementation.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { McpClientDependencies } from './interfaces.js'
import type { ConnectedMCPServer, ScopedMcpServerConfig } from './types.js'

// ============================================================================
// Constants
// ============================================================================

/** Default connection timeout in milliseconds */
export const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000

/** Maximum length for MCP descriptions/instructions */
export const MAX_MCP_DESCRIPTION_LENGTH = 2048

/** Maximum consecutive terminal errors before triggering reconnection */
export const MAX_ERRORS_BEFORE_RECONNECT = 3

// ============================================================================
// Client creation
// ============================================================================

export interface CreateClientOptions {
  /** Client name (e.g., "claude-code") */
  name: string
  /** Client title */
  title?: string
  /** Client version */
  version: string
  /** Client description */
  description?: string
  /** Client website URL */
  websiteUrl?: string
  /** Root URI for ListRoots requests (defaults to current working directory) */
  rootUri?: string
}

/**
 * Creates a configured MCP Client instance with standard capabilities and handlers.
 * The host can further customize the client before connecting.
 */
export function createMcpClient(options: CreateClientOptions): Client {
  const client = new Client(
    {
      name: options.name,
      title: options.title ?? options.name,
      version: options.version,
      description: options.description,
      websiteUrl: options.websiteUrl,
    },
    {
      capabilities: {
        roots: {},
        elicitation: {},
      },
    },
  )

  // Register default ListRoots handler
  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: [
      {
        uri: options.rootUri ?? `file://${process.cwd()}`,
      },
    ],
  }))

  return client
}

// ============================================================================
// Connection timeout
// ============================================================================

/**
 * Wraps a connection promise with a timeout.
 * Returns the result of connectPromise or rejects with a timeout error.
 */
export async function withConnectionTimeout<T>(
  connectPromise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Promise<void> | void,
): Promise<T> {
  const startTime = Date.now()

  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(async () => {
      await onTimeout()
      reject(new Error(`MCP connection timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    // Clean up timeout if connect resolves or rejects
    connectPromise.then(
      () => clearTimeout(timeoutId),
      () => clearTimeout(timeoutId),
    )
  })

  return Promise.race([connectPromise, timeoutPromise])
}

// ============================================================================
// Stderr capture
// ============================================================================

/**
 * Sets up stderr capture for stdio transports.
 * Returns the stderr output accumulator and cleanup function.
 */
export function captureStderr(
  transport: StdioClientTransport,
  maxSize = 8 * 1024 * 1024,
): {
  getOutput: () => string
  clearOutput: () => void
  removeHandler: () => void
} {
  let stderrOutput = ''

  const handler = (data: Buffer) => {
    if (stderrOutput.length < maxSize) {
      try {
        stderrOutput += data.toString()
      } catch {
        // Ignore errors from exceeding max string length
      }
    }
  }

  transport.stderr?.on('data', handler)

  return {
    getOutput: () => stderrOutput,
    clearOutput: () => {
      stderrOutput = ''
    },
    removeHandler: () => {
      transport.stderr?.off('data', handler)
    },
  }
}

// ============================================================================
// Error/close handlers
// ============================================================================

/**
 * Terminal connection error patterns that indicate the connection is broken.
 */
export function isTerminalConnectionError(msg: string): boolean {
  return (
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('EPIPE') ||
    msg.includes('EHOSTUNREACH') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Body Timeout Error') ||
    msg.includes('terminated') ||
    msg.includes('SSE stream disconnected') ||
    msg.includes('Failed to reconnect SSE stream')
  )
}

/**
 * Detects MCP "Session not found" errors (HTTP 404 + JSON-RPC code -32001).
 */
export function isMcpSessionExpiredError(error: Error): boolean {
  const httpStatus =
    'code' in error ? (error as Error & { code?: number }).code : undefined
  if (httpStatus !== 404) {
    return false
  }
  return (
    error.message.includes('"code":-32001') ||
    error.message.includes('"code": -32001')
  )
}

export interface ConnectionMonitorOptions {
  serverName: string
  transportType: string
  logger: McpClientDependencies['logger']
  /** Called when the transport should be closed to trigger reconnection */
  closeTransport: () => void
  /** Called to clear connection caches on close */
  onConnectionClosed?: () => void
}

/**
 * Installs enhanced error and close handlers on an MCP Client for
 * connection drop detection and automatic reconnection.
 *
 * Returns the cleanup function to remove handlers.
 */
export function installConnectionMonitor(
  client: Client,
  options: ConnectionMonitorOptions,
): () => void {
  const {
    serverName,
    transportType,
    logger,
    closeTransport,
    onConnectionClosed,
  } = options
  const connectionStartTime = Date.now()
  let hasErrorOccurred = false
  let consecutiveConnectionErrors = 0
  let hasTriggeredClose = false

  const originalOnerror = client.onerror
  const originalOnclose = client.onclose

  const safeClose = (reason: string) => {
    if (hasTriggeredClose) return
    hasTriggeredClose = true
    logger.debug(`[${serverName}] Closing transport (${reason})`)
    void client.close().catch(e => {
      logger.debug(`[${serverName}] Error during close: ${e}`)
    })
  }

  // Error handler
  client.onerror = (error: Error) => {
    const uptime = Date.now() - connectionStartTime
    hasErrorOccurred = true

    logger.debug(
      `[${serverName}] ${transportType.toUpperCase()} connection dropped after ${Math.floor(uptime / 1000)}s uptime`,
    )

    // Session expiry for HTTP transports
    if (
      (transportType === 'http' || transportType === 'claudeai-proxy') &&
      isMcpSessionExpiredError(error)
    ) {
      logger.debug(
        `[${serverName}] MCP session expired, triggering reconnection`,
      )
      safeClose('session expired')
      originalOnerror?.(error)
      return
    }

    // Terminal error tracking for remote transports
    if (
      transportType === 'sse' ||
      transportType === 'http' ||
      transportType === 'claudeai-proxy'
    ) {
      if (error.message.includes('Maximum reconnection attempts')) {
        safeClose('SSE reconnection exhausted')
        originalOnerror?.(error)
        return
      }

      if (isTerminalConnectionError(error.message)) {
        consecutiveConnectionErrors++
        logger.debug(
          `[${serverName}] Terminal connection error ${consecutiveConnectionErrors}/${MAX_ERRORS_BEFORE_RECONNECT}`,
        )

        if (consecutiveConnectionErrors >= MAX_ERRORS_BEFORE_RECONNECT) {
          consecutiveConnectionErrors = 0
          safeClose('max consecutive terminal errors')
        }
      } else {
        consecutiveConnectionErrors = 0
      }
    }

    originalOnerror?.(error)
  }

  // Close handler
  client.onclose = () => {
    const uptime = Date.now() - connectionStartTime
    logger.debug(
      `[${serverName}] ${transportType.toUpperCase()} connection closed after ${Math.floor(uptime / 1000)}s (${hasErrorOccurred ? 'with errors' : 'cleanly'})`,
    )

    onConnectionClosed?.()
    originalOnclose?.()
  }

  // Return cleanup function
  return () => {
    client.onerror = originalOnerror
    client.onclose = originalOnclose
  }
}

// ============================================================================
// Signal escalation for stdio cleanup
// ============================================================================

/**
 * Terminates a stdio child process with escalating signals:
 * SIGINT (100ms) → SIGTERM (400ms) → SIGKILL
 *
 * Total maximum cleanup time: ~500ms
 */
export async function terminateWithSignalEscalation(
  childPid: number,
  logger: McpClientDependencies['logger'],
  serverName: string,
): Promise<void> {
  try {
    logger.debug(`[${serverName}] Sending SIGINT to MCP server process`)

    try {
      process.kill(childPid, 'SIGINT')
    } catch (error) {
      logger.debug(`[${serverName}] Error sending SIGINT: ${error}`)
      return
    }

    // biome-ignore lint/suspicious/noAsyncPromiseExecutor: complex cleanup logic requires async in executor
    await new Promise<void>(async resolve => {
      let resolved = false

      const checkInterval = setInterval(() => {
        try {
          process.kill(childPid, 0)
        } catch {
          if (!resolved) {
            resolved = true
            clearInterval(checkInterval)
            clearTimeout(failsafeTimeout)
            logger.debug(`[${serverName}] MCP server process exited cleanly`)
            resolve()
          }
        }
      }, 50)

      const failsafeTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          clearInterval(checkInterval)
          logger.debug(
            `[${serverName}] Cleanup timeout reached, stopping process monitoring`,
          )
          resolve()
        }
      }, 600)

      try {
        // Wait 100ms for SIGINT to work
        await sleep(100)

        if (!resolved) {
          try {
            process.kill(childPid, 0)
            // Process still exists, try SIGTERM
            logger.debug(`[${serverName}] SIGINT failed, sending SIGTERM`)
            try {
              process.kill(childPid, 'SIGTERM')
            } catch (termError) {
              logger.debug(
                `[${serverName}] Error sending SIGTERM: ${termError}`,
              )
              resolved = true
              clearInterval(checkInterval)
              clearTimeout(failsafeTimeout)
              resolve()
              return
            }
          } catch {
            resolved = true
            clearInterval(checkInterval)
            clearTimeout(failsafeTimeout)
            resolve()
            return
          }

          // Wait 400ms for SIGTERM
          await sleep(400)

          if (!resolved) {
            try {
              process.kill(childPid, 0)
              logger.debug(`[${serverName}] SIGTERM failed, sending SIGKILL`)
              try {
                process.kill(childPid, 'SIGKILL')
              } catch (killError) {
                logger.debug(
                  `[${serverName}] Error sending SIGKILL: ${killError}`,
                )
              }
            } catch {
              resolved = true
              clearInterval(checkInterval)
              clearTimeout(failsafeTimeout)
              resolve()
            }
          }
        }

        if (!resolved) {
          resolved = true
          clearInterval(checkInterval)
          clearTimeout(failsafeTimeout)
          resolve()
        }
      } catch {
        if (!resolved) {
          resolved = true
          clearInterval(checkInterval)
          clearTimeout(failsafeTimeout)
          resolve()
        }
      }
    })
  } catch (processError) {
    logger.debug(`[${serverName}] Error terminating process: ${processError}`)
  }
}

/** Simple sleep utility (avoids importing from host) */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ============================================================================
// Cleanup factory
// ============================================================================

export interface CleanupOptions {
  client: Client
  transport: Transport
  transportType: string
  childPid?: number
  inProcessServer?: { close(): Promise<void> }
  stderrCleanup?: { removeHandler: () => void }
  logger: McpClientDependencies['logger']
  serverName: string
}

/**
 * Creates a cleanup function for an MCP connection.
 * Handles in-process servers, stderr listener removal, signal escalation, and client close.
 */
export function createCleanup(options: CleanupOptions): () => Promise<void> {
  const {
    client,
    transport,
    transportType,
    childPid,
    inProcessServer,
    stderrCleanup,
    logger,
    serverName,
  } = options

  return async () => {
    // In-process servers
    if (inProcessServer) {
      try {
        await inProcessServer.close()
      } catch (error) {
        logger.debug(
          `[${serverName}] Error closing in-process server: ${error}`,
        )
      }
      try {
        await client.close()
      } catch (error) {
        logger.debug(`[${serverName}] Error closing client: ${error}`)
      }
      return
    }

    // Remove stderr listener
    stderrCleanup?.removeHandler()

    // Signal escalation for stdio
    if (transportType === 'stdio' && childPid) {
      await terminateWithSignalEscalation(childPid, logger, serverName)
    }

    // Close the client connection (which also closes the transport)
    try {
      await client.close()
    } catch (error) {
      logger.debug(`[${serverName}] Error closing client: ${error}`)
    }
  }
}

// ============================================================================
// Connected server result builder
// ============================================================================

export interface BuildConnectedServerOptions {
  name: string
  client: Client
  config: ScopedMcpServerConfig
  cleanup: () => Promise<void>
}

/**
 * Builds a ConnectedMCPServer result from a connected client.
 * Truncates server instructions if they exceed MAX_MCP_DESCRIPTION_LENGTH.
 */
export function buildConnectedServer(
  options: BuildConnectedServerOptions,
  logger: McpClientDependencies['logger'],
): ConnectedMCPServer {
  const { name, client, config, cleanup } = options

  const capabilities = client.getServerCapabilities() ?? {}
  const serverVersion = client.getServerVersion()
  const rawInstructions = client.getInstructions()

  let instructions = rawInstructions
  if (rawInstructions && rawInstructions.length > MAX_MCP_DESCRIPTION_LENGTH) {
    instructions =
      rawInstructions.slice(0, MAX_MCP_DESCRIPTION_LENGTH) + '… [truncated]'
    logger.debug(
      `[${name}] Server instructions truncated from ${rawInstructions.length} to ${MAX_MCP_DESCRIPTION_LENGTH} chars`,
    )
  }

  return {
    name,
    client,
    type: 'connected' as const,
    capabilities,
    serverInfo: serverVersion,
    instructions,
    config,
    cleanup,
  }
}
