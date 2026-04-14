// McpManager — imperative API for MCP protocol client
// Factory function that creates a manager instance with event-based notifications

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type {
  ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js'
import memoize from 'lodash-es/memoize.js'
import { buildMcpToolName } from './strings.js'
import type { CoreTool } from '@claude-code-best/agent-tools'
import type {
  McpServerConfig,
  ScopedMcpServerConfig,
  MCPServerConnection,
  ConnectedMCPServer,
  FailedMCPServer,
  NeedsAuthMCPServer,
} from './types.js'
import type { McpClientDependencies } from './interfaces.js'
import {
  McpConnectionError,
  McpAuthError,
  McpTimeoutError,
} from './errors.js'
import { memoizeWithLRU } from './cache.js'
import { discoverTools } from './discovery.js'
import { callMcpTool } from './execution.js'

// ============================================================================
// Event types
// ============================================================================

export type McpManagerEvents = {
  connected: (name: string) => void
  disconnected: (name: string, error?: Error) => void
  toolsChanged: (serverName: string, tools: CoreTool[]) => void
  error: (name: string, error: Error) => void
  authRequired: (name: string) => void
}

type EventHandler = (...args: any[]) => void

// ============================================================================
// Manager interface
// ============================================================================

export interface McpManager {
  connect(name: string, config: McpServerConfig): Promise<MCPServerConnection>
  disconnect(name: string): Promise<void>
  disconnectAll(): Promise<void>
  getConnections(): Map<string, MCPServerConnection>
  getTools(serverName: string): CoreTool[]
  getAllTools(): CoreTool[]
  callTool(serverName: string, toolName: string, args: unknown): Promise<unknown>
  on<E extends keyof McpManagerEvents>(event: E, handler: McpManagerEvents[E]): void
  off(event: string, handler: EventHandler): void
}

// ============================================================================
// Default timeout
// ============================================================================

const MCP_TIMEOUT_MS = 30_000
const MCP_REQUEST_TIMEOUT_MS = 60_000

// ============================================================================
// Manager implementation
// ============================================================================

class McpManagerImpl implements McpManager {
  private connections = new Map<string, MCPServerConnection>()
  private toolsCache = new Map<string, CoreTool[]>()
  private listeners = new Map<string, Set<EventHandler>>()
  private deps: McpClientDependencies
  private connectFn: ((name: string, config: ScopedMcpServerConfig) => Promise<MCPServerConnection>) | null = null

  constructor(deps: McpClientDependencies) {
    this.deps = deps
  }

  /** Set the connect function — the host provides this with all transport logic */
  setConnectFn(fn: (name: string, config: ScopedMcpServerConfig) => Promise<MCPServerConnection>): void {
    this.connectFn = fn
  }

  async connect(name: string, config: McpServerConfig): Promise<MCPServerConnection> {
    if (!this.connectFn) {
      throw new Error('McpManager: connectFn not set. Call setConnectFn() first.')
    }

    const scopedConfig: ScopedMcpServerConfig = { ...config, scope: 'dynamic' }

    try {
      const connection = await this.connectFn(name, scopedConfig)
      this.connections.set(name, connection)

      if (connection.type === 'connected') {
        this.emit('connected', name)
        // Fetch tools for this server
        await this.refreshTools(name, connection)
      } else if (connection.type === 'needs-auth') {
        this.emit('authRequired', name)
      }

      return connection
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this.emit('error', name, error)
      throw err
    }
  }

  async disconnect(name: string): Promise<void> {
    const conn = this.connections.get(name)
    if (!conn) return

    if (conn.type === 'connected') {
      try {
        await conn.cleanup()
      } catch (err) {
        this.deps.logger.warn(`Error disconnecting ${name}:`, err)
      }
    }

    this.connections.delete(name)
    this.toolsCache.delete(name)
    this.emit('disconnected', name)
  }

  async disconnectAll(): Promise<void> {
    const names = [...this.connections.keys()]
    await Promise.all(names.map(name => this.disconnect(name)))
  }

  getConnections(): Map<string, MCPServerConnection> {
    return new Map(this.connections)
  }

  getTools(serverName: string): CoreTool[] {
    return this.toolsCache.get(serverName) ?? []
  }

  getAllTools(): CoreTool[] {
    const all: CoreTool[] = []
    for (const tools of this.toolsCache.values()) {
      all.push(...tools)
    }
    return all
  }

  async callTool(serverName: string, toolName: string, args: unknown): Promise<unknown> {
    const conn = this.connections.get(serverName)
    if (!conn || conn.type !== 'connected') {
      throw new McpConnectionError(serverName, `Server ${serverName} is not connected`)
    }

    return callMcpTool(
      {
        client: conn,
        tool: toolName,
        args: args as Record<string, unknown>,
        signal: new AbortController().signal,
      },
      this.deps,
    )
  }

  on<E extends keyof McpManagerEvents>(event: E, handler: McpManagerEvents[E]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)
  }

  off(event: string, handler: EventHandler): void {
    this.listeners.get(event)?.delete(handler)
  }

  // ── Private ──

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(handler => {
      try {
        handler(...args)
      } catch (err) {
        this.deps.logger.error(`Error in ${event} handler:`, err)
      }
    })
  }

  private async refreshTools(name: string, conn: ConnectedMCPServer): Promise<void> {
    try {
      const tools = await discoverTools({
        serverName: name,
        client: conn.client,
        capabilities: conn.capabilities ?? {},
        deps: this.deps,
      })

      this.toolsCache.set(name, tools)
      this.emit('toolsChanged', name, tools)
    } catch (err) {
      this.deps.logger.warn(`Failed to fetch tools for ${name}:`, err)
    }
  }
}

// ============================================================================
// Factory function
// ============================================================================

/**
 * Creates a new MCP manager instance.
 *
 * The manager handles connection lifecycle, tool discovery, and event notification.
 * The host must call `setConnectFn()` to provide the transport-level connection logic.
 *
 * @param deps Host dependency injections (logger, auth, proxy, etc.)
 * @returns McpManager instance
 *
 * @example
 * ```typescript
 * const manager = createMcpManager({
 *   logger: console,
 *   httpConfig: { getUserAgent: () => 'my-app/1.0' },
 * })
 *
 * manager.setConnectFn(async (name, config) => {
 *   // Transport-level connection logic here
 * })
 *
 * manager.on('connected', (name) => console.log(`Connected to ${name}`))
 * manager.on('toolsChanged', (name, tools) => console.log(`${name}: ${tools.length} tools`))
 *
 * await manager.connect('my-server', { command: 'npx', args: ['my-mcp-server'] })
 * const tools = manager.getAllTools()
 * ```
 */
export function createMcpManager(deps: McpClientDependencies): McpManager {
  return new McpManagerImpl(deps)
}
