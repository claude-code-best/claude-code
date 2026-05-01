import {
  createMcpSocketClient,
  SocketConnectionError,
} from './mcpSocketClient.js'
import type { McpSocketClient } from './mcpSocketClient.js'
import type {
  ClaudeForChromeContext,
  PermissionMode,
  PermissionOverrides,
} from './types.js'

/**
 * Manages connections to multiple Chrome native host sockets (one per Chrome profile).
 * Routes tool calls to the correct socket based on tab ID.
 *
 * For `tabs_context_mcp`: queries all connected sockets and merges results.
 * For other tools: routes based on the `tabId` argument using a routing table
 * built from tabs_context_mcp responses.
 */
export class McpSocketPool {
  private clients: Map<string, McpSocketClient> = new Map()
  private tabRoutes: Map<number, string> = new Map()
  private context: ClaudeForChromeContext
  private notificationHandler:
    | ((notification: {
        method: string
        params?: Record<string, unknown>
      }) => void)
    | null = null

  constructor(context: ClaudeForChromeContext) {
    this.context = context
  }

  public setNotificationHandler(
    handler: (notification: {
      method: string
      params?: Record<string, unknown>
    }) => void,
  ): void {
    this.notificationHandler = handler
    for (const client of this.clients.values()) {
      client.setNotificationHandler(handler)
    }
  }

  /**
   * Discover available sockets and ensure at least one is connected.
   */
  public async ensureConnected(): Promise<boolean> {
    const { logger, serverName } = this.context

    this.refreshClients()

    // Try to connect any disconnected clients
    const connectPromises: Promise<boolean>[] = []
    for (const client of this.clients.values()) {
      if (!client.isConnected()) {
        connectPromises.push(client.ensureConnected().catch(() => false))
      }
    }

    if (connectPromises.length > 0) {
      await Promise.all(connectPromises)
    }

    const connectedCount = this.getConnectedClients().length
    if (connectedCount === 0) {
      logger.info(`[${serverName}] No connected sockets in pool`)
      return false
    }

    logger.info(`[${serverName}] Socket pool: ${connectedCount} connected`)
    return true
  }

  /**
   * Call a tool, routing to the correct socket based on tab ID.
   * For tabs_context_mcp, queries all sockets and merges results.
   */
  public async callTool(
    name: string,
    args: Record<string, unknown>,
    _permissionOverrides?: PermissionOverrides,
  ): Promise<unknown> {
    if (name === 'tabs_context_mcp') {
      return this.callTabsContext(args)
    }

    // Route by tabId if present
    const tabId = args.tabId as number | undefined
    if (tabId !== undefined) {
      const socketPath = this.tabRoutes.get(tabId)
      if (socketPath) {
        const client = this.clients.get(socketPath)
        if (client?.isConnected()) {
          return client.callTool(name, args)
        }
      }
      // Tab route not found or client disconnected — fall through to any connected
    }

    // Fallback: use first connected client
    const connected = this.getConnectedClients()
    if (connected.length === 0) {
      throw new SocketConnectionError(
        `[${this.context.serverName}] No connected sockets available`,
      )
    }
    return connected[0]!.callTool(name, args)
  }

  public async setPermissionMode(
    mode: PermissionMode,
    allowedDomains?: string[],
  ): Promise<void> {
    const connected = this.getConnectedClients()
    await Promise.all(
      connected.map(client => client.setPermissionMode(mode, allowedDomains)),
    )
  }

  public isConnected(): boolean {
    return this.getConnectedClients().length > 0
  }

  public disconnect(): void {
    for (const client of this.clients.values()) {
      client.disconnect()
    }
    this.clients.clear()
    this.tabRoutes.clear()
  }

  private getConnectedClients(): McpSocketClient[] {
    return [...this.clients.values()].filter(c => c.isConnected())
  }

  /**
   * Query all connected sockets for tabs and merge results.
   * Updates the tab routing table.
   */
  private async callTabsContext(
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const { logger, serverName } = this.context
    const connected = this.getConnectedClients()

    if (connected.length === 0) {
      throw new SocketConnectionError(
        `[${serverName}] No connected sockets available`,
      )
    }

    // If only one client, skip merging overhead
    if (connected.length === 1) {
      const result = await connected[0]!.callTool('tabs_context_mcp', args)
      this.updateTabRoutes(result, this.getSocketPathForClient(connected[0]!))
      return result
    }

    // Query all connected clients in parallel
    const results = await Promise.allSettled(
      connected.map(async client => {
        const result = await client.callTool('tabs_context_mcp', args)
        const socketPath = this.getSocketPathForClient(client)
        return { result, socketPath }
      }),
    )

    // Merge tab results
    const mergedTabs: unknown[] = []
    this.tabRoutes.clear()

    for (const settledResult of results) {
      if (settledResult.status !== 'fulfilled') {
        logger.info(
          `[${serverName}] tabs_context_mcp failed on one socket: ${settledResult.reason}`,
        )
        continue
      }

      const { result, socketPath } = settledResult.value
      this.updateTabRoutes(result, socketPath)

      const tabs = this.extractTabs(result)
      if (tabs) {
        mergedTabs.push(...tabs)
      }
    }

    // Return merged result in the same format as the extension response
    if (mergedTabs.length > 0) {
      const tabListText = mergedTabs
        .map(t => {
          const tab = t as { tabId: number; title: string; url: string }
          return `  • tabId ${tab.tabId}: "${tab.title}" (${tab.url})`
        })
        .join('\n')

      return {
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ availableTabs: mergedTabs }),
            },
            {
              type: 'text',
              text: `\n\nTab Context:\n- Available tabs:\n${tabListText}`,
            },
          ],
        },
      }
    }

    // Fallback: return first successful result as-is
    for (const settledResult of results) {
      if (settledResult.status === 'fulfilled') {
        return settledResult.value.result
      }
    }

    throw new SocketConnectionError(
      `[${serverName}] All sockets failed for tabs_context_mcp`,
    )
  }

  /**
   * Extract tab objects from a tool response to update routing table.
   */
  private updateTabRoutes(result: unknown, socketPath: string): void {
    const tabs = this.extractTabs(result)
    if (!tabs) return

    for (const tab of tabs) {
      if (typeof tab === 'object' && tab !== null && 'tabId' in tab) {
        const tabId = (tab as { tabId: number }).tabId
        this.tabRoutes.set(tabId, socketPath)
      }
    }
  }

  private extractTabs(result: unknown): unknown[] | null {
    if (!result || typeof result !== 'object') return null

    // Response format: { result: { content: [{ type: "text", text: "{\"availableTabs\":[...],\"tabGroupId\":...}" }] } }
    const asResponse = result as {
      result?: { content?: Array<{ type: string; text?: string }> }
    }
    const content = asResponse.result?.content
    if (!content || !Array.isArray(content)) return null

    for (const item of content) {
      if (item.type === 'text' && item.text) {
        try {
          const parsed = JSON.parse(item.text)
          if (Array.isArray(parsed)) return parsed
          // Handle { availableTabs: [...] } format
          if (parsed && Array.isArray(parsed.availableTabs)) {
            return parsed.availableTabs
          }
        } catch {
          // Not JSON, skip
        }
      }
    }
    return null
  }

  private getSocketPathForClient(client: McpSocketClient): string {
    for (const [path, c] of this.clients.entries()) {
      if (c === client) return path
    }
    return ''
  }

  /**
   * Scan for available sockets and create/remove clients as needed.
   */
  private refreshClients(): void {
    const socketPaths = this.getAvailableSocketPaths()
    const { logger, serverName } = this.context

    // Add new clients for newly discovered sockets
    for (const path of socketPaths) {
      if (!this.clients.has(path)) {
        logger.info(`[${serverName}] Adding socket to pool: ${path}`)
        const clientContext: ClaudeForChromeContext = {
          ...this.context,
          socketPath: path,
          getSocketPath: undefined,
          getSocketPaths: undefined,
        }
        const client = createMcpSocketClient(clientContext)
        client.disableAutoReconnect = true
        if (this.notificationHandler) {
          client.setNotificationHandler(this.notificationHandler)
        }
        this.clients.set(path, client)
      }
    }

    // Remove clients for sockets that no longer exist
    for (const [path, client] of this.clients.entries()) {
      if (!socketPaths.includes(path)) {
        logger.info(`[${serverName}] Removing stale socket from pool: ${path}`)
        client.disconnect()
        this.clients.delete(path)
        for (const [tabId, socketPath] of this.tabRoutes.entries()) {
          if (socketPath === path) {
            this.tabRoutes.delete(tabId)
          }
        }
      }
    }
  }

  private getAvailableSocketPaths(): string[] {
    return this.context.getSocketPaths?.() ?? []
  }
}

export function createMcpSocketPool(
  context: ClaudeForChromeContext,
): McpSocketPool {
  return new McpSocketPool(context)
}
