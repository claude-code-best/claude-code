// MCP tool execution — call tools on connected MCP servers
// Extracted from src/services/mcp/client.ts (callMCPTool)

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ConnectedMCPServer } from './types.js'
import type { McpClientDependencies } from './interfaces.js'
import { McpToolCallError, McpAuthError } from './errors.js'

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for MCP tool calls (~27.8 hours — effectively infinite) */
const DEFAULT_MCP_TOOL_TIMEOUT_MS = 100_000_000

// ============================================================================
// Tool execution
// ============================================================================

export interface CallToolOptions {
  /** The connected MCP server to call */
  client: ConnectedMCPServer
  /** Tool name (as registered on the server, not the fully qualified name) */
  tool: string
  /** Tool arguments */
  args: Record<string, unknown>
  /** Optional metadata to send with the call */
  meta?: Record<string, unknown>
  /** Abort signal for cancellation */
  signal: AbortSignal
  /** Progress callback */
  onProgress?: (data: {
    progress?: number
    total?: number
    message?: string
  }) => void
  /** Tool call timeout in ms (defaults to ~27.8 hours) */
  timeoutMs?: number
}

export interface CallToolResult {
  content: unknown
  _meta?: Record<string, unknown>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/**
 * Call a tool on a connected MCP server with timeout and progress handling.
 *
 * This is the protocol-level tool execution function. The host is responsible for:
 * - Session management (reconnection on expiry)
 * - Result transformation (content processing, truncation, persistence)
 * - Error wrapping for telemetry
 */
export async function callMcpTool(
  options: CallToolOptions,
  deps: McpClientDependencies,
): Promise<CallToolResult> {
  const { client, tool, args, meta, signal, onProgress, timeoutMs } = options
  const { name: serverName, client: mcpClient } = client
  const effectiveTimeout = timeoutMs ?? getMcpToolTimeoutMs()

  let progressInterval: ReturnType<typeof setInterval> | undefined

  try {
    deps.logger.debug(`[${serverName}] Calling MCP tool: ${tool}`)

    // Progress logging for long-running tools (every 30 seconds)
    progressInterval = setInterval(() => {
      deps.logger.debug(`[${serverName}] Tool '${tool}' still running`)
    }, 30_000)

    const result = await Promise.race([
      mcpClient.callTool(
        {
          name: tool,
          arguments: args,
          _meta: meta,
        },
        CallToolResultSchema,
        {
          signal,
          timeout: effectiveTimeout,
          onprogress: onProgress,
        },
      ),
      createTimeoutPromise(serverName, tool, effectiveTimeout),
    ])

    // Handle isError in result
    if ('isError' in result && result.isError) {
      let errorDetails = 'Unknown error'
      if (
        'content' in result &&
        Array.isArray(result.content) &&
        result.content.length > 0
      ) {
        const firstContent = result.content[0]
        if (
          firstContent &&
          typeof firstContent === 'object' &&
          'text' in firstContent
        ) {
          errorDetails = (firstContent as { text: string }).text
        }
      }

      throw new McpToolCallError(serverName, tool, errorDetails)
    }

    return {
      content: result,
      _meta: result._meta as Record<string, unknown> | undefined,
      structuredContent: result.structuredContent as
        | Record<string, unknown>
        | undefined,
    }
  } catch (e) {
    if (progressInterval !== undefined) {
      clearInterval(progressInterval)
    }

    if (e instanceof Error && e.name !== 'AbortError') {
      deps.logger.debug(`[${serverName}] Tool '${tool}' failed: ${e.message}`)
    }

    // Check for 401 errors
    if (e instanceof Error) {
      const errorCode = 'code' in e ? (e.code as number | undefined) : undefined
      if (errorCode === 401) {
        throw new McpAuthError(
          serverName,
          `MCP server "${serverName}" requires re-authorization (token expired)`,
        )
      }
    }

    throw e
  } finally {
    if (progressInterval !== undefined) {
      clearInterval(progressInterval)
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function getMcpToolTimeoutMs(): number {
  return (
    parseInt(process.env.MCP_TOOL_TIMEOUT || '', 10) ||
    DEFAULT_MCP_TOOL_TIMEOUT_MS
  )
}

function createTimeoutPromise(
  serverName: string,
  tool: string,
  timeoutMs: number,
): Promise<never> {
  return new Promise((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new Error(
          `MCP server "${serverName}" tool "${tool}" timed out after ${Math.floor(timeoutMs / 1000)}s`,
        ),
      )
    }, timeoutMs)
    timeoutId.unref?.()
  })
}
