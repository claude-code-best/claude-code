// MCP tool discovery — fetch and process tools from connected MCP servers
// Extracted from src/services/mcp/client.ts (fetchToolsForClient)

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  ListToolsResultSchema,
  type ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js'
import type { CoreTool } from '@claude-code-best/agent-tools'
import type { ConnectedMCPServer } from './types.js'
import type { McpClientDependencies } from './interfaces.js'
import { buildMcpToolName } from './strings.js'
import { memoizeWithLRU } from './cache.js'
import { recursivelySanitizeUnicode } from './sanitization.js'

// ============================================================================
// Constants
// ============================================================================

/** Default max cache size for tool discovery (keyed by server name) */
export const MCP_FETCH_CACHE_SIZE = 20

/** Maximum description length before truncation */
const MAX_MCP_DESCRIPTION_LENGTH = 2048

// ============================================================================
// Tool discovery
// ============================================================================

export interface DiscoveryOptions {
  /** Server name for logging and tool naming */
  serverName: string
  /** Connected MCP server client */
  client: Client
  /** Server capabilities (checked before fetching) */
  capabilities: Record<string, unknown>
  /** Whether to skip the mcp__ prefix for tool names */
  skipPrefix?: boolean
  /** Host dependencies for logging */
  deps: McpClientDependencies
}

/**
 * Fetches tools from a connected MCP server and converts them to CoreTool format.
 * Returns empty array if the server doesn't support tools or if fetching fails.
 */
export async function discoverTools(
  options: DiscoveryOptions,
): Promise<CoreTool[]> {
  const { serverName, client, capabilities, skipPrefix, deps } = options

  if (!capabilities?.tools) {
    return []
  }

  try {
    const result = (await client.request(
      { method: 'tools/list' },
      ListToolsResultSchema,
    )) as ListToolsResult

    // Sanitize tool data from MCP server
    const toolsToProcess = recursivelySanitizeUnicode(result.tools)

    return toolsToProcess.map((tool): CoreTool => {
      const fullyQualifiedName = buildMcpToolName(serverName, tool.name)
      const effectiveName = skipPrefix ? tool.name : fullyQualifiedName

      return {
        name: effectiveName,
        mcpInfo: { serverName, toolName: tool.name },
        isMcp: true,
        inputJSONSchema: tool.inputSchema as CoreTool['inputJSONSchema'],
        async description() {
          return tool.description ?? ''
        },
        async prompt() {
          const desc = tool.description ?? ''
          return desc.length > MAX_MCP_DESCRIPTION_LENGTH
            ? desc.slice(0, MAX_MCP_DESCRIPTION_LENGTH) + '… [truncated]'
            : desc
        },
        isConcurrencySafe: () => tool.annotations?.readOnlyHint ?? false,
        isReadOnly: () => tool.annotations?.readOnlyHint ?? false,
        isDestructive: () => tool.annotations?.destructiveHint ?? false,
        isOpenWorld: () => tool.annotations?.openWorldHint ?? false,
        isEnabled: () => true,
        async checkPermissions() {
          return { behavior: 'passthrough' as const }
        },
        toAutoClassifierInput: () => '',
        userFacingName: () => tool.annotations?.title ?? tool.name,
        maxResultSizeChars: 100_000,
        mapToolResultToToolResultBlockParam: (
          content: unknown,
          id: string,
        ) => ({
          type: 'tool_result' as const,
          tool_use_id: id,
          content,
        }),
        async call() {
          throw new Error('Use manager.callTool() instead')
        },
        inputSchema: {} as CoreTool['inputSchema'],
      } satisfies CoreTool
    })
  } catch (error) {
    deps.logger.warn(`Failed to fetch tools for ${serverName}:`, error)
    return []
  }
}

// ============================================================================
// Cached tool discovery (LRU by server name)
// ============================================================================

/**
 * Creates a memoized tool discovery function with LRU caching.
 * Cache is keyed by server name (stable across reconnects).
 */
export function createCachedToolDiscovery(
  deps: McpClientDependencies,
  cacheSize: number = MCP_FETCH_CACHE_SIZE,
): {
  discover: (
    server: ConnectedMCPServer,
    skipPrefix?: boolean,
  ) => Promise<CoreTool[]>
  cache: { delete(key: string): void; clear(): void }
} {
  const discover = memoizeWithLRU(
    async (
      server: ConnectedMCPServer,
      skipPrefix?: boolean,
    ): Promise<CoreTool[]> => {
      if (server.type !== 'connected') return []
      return discoverTools({
        serverName: server.name,
        client: server.client,
        capabilities: server.capabilities ?? {},
        skipPrefix,
        deps,
      })
    },
    (server: ConnectedMCPServer) => server.name,
    cacheSize,
  )

  return {
    discover,
    cache: discover.cache,
  }
}
