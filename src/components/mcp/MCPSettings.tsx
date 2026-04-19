import React, { useEffect, useMemo } from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import { ClaudeAuthProvider } from '../../services/mcp/auth.js'
import type {
  McpClaudeAIProxyServerConfig,
  McpHTTPServerConfig,
  McpSSEServerConfig,
  McpStdioServerConfig,
} from '../../services/mcp/types.js'
import {
  extractAgentMcpServers,
  filterToolsByServer,
} from '../../services/mcp/utils.js'
import { useAppState } from '../../state/AppState.js'
import { getSessionIngressAuthToken } from '../../utils/sessionIngressAuth.js'
import { MCPAgentServerMenu } from './MCPAgentServerMenu.js'
import { MCPListPanel } from './MCPListPanel.js'
import { MCPRemoteServerMenu } from './MCPRemoteServerMenu.js'
import { MCPStdioServerMenu } from './MCPStdioServerMenu.js'
import { MCPToolDetailView } from './MCPToolDetailView.js'
import { MCPToolListView } from './MCPToolListView.js'
import type { AgentMcpServerInfo, MCPViewState, ServerInfo } from './types.js'

type Props = {
  onComplete: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
}

export function MCPSettings({ onComplete }: Props): React.ReactNode {
  const mcp = useAppState(s => s.mcp)
  const agentDefinitions = useAppState(s => s.agentDefinitions)
  const mcpClients = mcp.clients
  const [viewState, setViewState] = React.useState<MCPViewState>({
    type: 'list',
  })
  const [servers, setServers] = React.useState<ServerInfo[]>([])

  // Extract agent-specific MCP servers from agent definitions
  const agentMcpServers = useMemo(
    () => extractAgentMcpServers(agentDefinitions.allAgents),
    [agentDefinitions.allAgents],
  )

  const filteredClients = React.useMemo(
    () =>
      mcpClients
        .filter(client => client.name !== 'ide')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [mcpClients],
  )

  React.useEffect(() => {
    let cancelled = false
    async function prepareServers() {
      const serverInfos = await Promise.all(
        filteredClients.map(async client => {
          const scope = client.config.scope
          const isSSE = client.config.type === 'sse'
          const isHTTP = client.config.type === 'http'
          const isClaudeAIProxy = client.config.type === 'claudeai-proxy'
          let isAuthenticated: boolean | undefined 

          if (isSSE || isHTTP) {
            const authProvider = new ClaudeAuthProvider(
              client.name,
              client.config as McpSSEServerConfig | McpHTTPServerConfig,
            )
            const tokens = await authProvider.tokens()
            // Server is authenticated if:
            // 1. It has OAuth tokens, OR
            // 2. It's connected via session auth (has session token and is connected), OR
            // 3. It's connected and has tools (meaning it's working, regardless of auth method)
            const hasSessionAuth =
              getSessionIngressAuthToken() !== null &&
              client.type === 'connected'
            const hasToolsAndConnected =
              client.type === 'connected' &&
              filterToolsByServer(mcp.tools, client.name).length > 0
            isAuthenticated =
              Boolean(tokens) || hasSessionAuth || hasToolsAndConnected
          }

          const baseInfo = {
            name: client.name,
            client,
            scope,
          }

          if (isClaudeAIProxy) {
            return {
              ...baseInfo,
              transport: 'claudeai-proxy' as const,
              isAuthenticated: false,
              config: client.config as McpClaudeAIProxyServerConfig,
            }
          } else if (isSSE) {
            return {
              ...baseInfo,
              transport: 'sse' as const,
              isAuthenticated,
              config: client.config as McpSSEServerConfig,
            }
          } else if (isHTTP) {
            return {
              ...baseInfo,
              transport: 'http' as const,
              isAuthenticated,
              config: client.config as McpHTTPServerConfig,
            }
          } else {
            return {
              ...baseInfo,
              transport: 'stdio' as const,
              config: client.config as McpStdioServerConfig,
            }
          }
        }),
      )

      if (cancelled) return
      setServers(serverInfos)
    }

    void prepareServers()
    return () => {
      cancelled = true
    }
  }, [filteredClients, mcp.tools])

  useEffect(() => {
    if (servers.length === 0 && filteredClients.length > 0) {
      // Still loading
      return
    }

    // Only show "no servers" message if no regular servers AND no agent servers
    if (servers.length === 0 && agentMcpServers.length === 0) {
      onComplete(
        'No MCP servers configured. Please run /doctor if this is unexpected. Otherwise, run `claude mcp --help` or visit https://code.claude.com/docs/en/mcp to learn more.',
      )
    }
  }, [
    servers.length,
    filteredClients.length,
    agentMcpServers.length,
    onComplete,
  ])

  switch (viewState.type) {
    case 'list':
      return (
        <MCPListPanel
          servers={servers}
          agentServers={agentMcpServers}
          onSelectServer={server =>
            setViewState({ type: 'server-menu', server })
          }
          onSelectAgentServer={(agentServer: AgentMcpServerInfo) =>
            setViewState({ type: 'agent-server-menu', agentServer })
          }
          onComplete={onComplete}
          defaultTab={viewState.defaultTab}
        />
      )

    case 'server-menu': {
      const serverTools = filterToolsByServer(mcp.tools, viewState.server.name)

      const defaultTab =
        viewState.server.transport === 'claudeai-proxy'
          ? 'claude.ai'
          : 'Claude Code'

      if (viewState.server.transport === 'stdio') {
        return (
          <MCPStdioServerMenu
            server={viewState.server}
            serverToolsCount={serverTools.length}
            onViewTools={() =>
              setViewState({ type: 'server-tools', server: viewState.server })
            }
            onCancel={() => setViewState({ type: 'list', defaultTab })}
            onComplete={onComplete}
          />
        )
      } else {
        return (
          <MCPRemoteServerMenu
            server={viewState.server}
            serverToolsCount={serverTools.length}
            onViewTools={() =>
              setViewState({ type: 'server-tools', server: viewState.server })
            }
            onCancel={() => setViewState({ type: 'list', defaultTab })}
            onComplete={onComplete}
          />
        )
      }
    }

    case 'server-tools':
      return (
        <MCPToolListView
          server={viewState.server}
          onSelectTool={(_, index) =>
            setViewState({
              type: 'server-tool-detail',
              server: viewState.server,
              toolIndex: index,
            })
          }
          onBack={() =>
            setViewState({ type: 'server-menu', server: viewState.server })
          }
        />
      )

    case 'server-tool-detail': {
      const serverTools = filterToolsByServer(mcp.tools, viewState.server.name)
      const tool = serverTools[viewState.toolIndex]
      if (!tool) {
        setViewState({ type: 'server-tools', server: viewState.server })
        return null
      }
      return (
        <MCPToolDetailView
          tool={tool}
          server={viewState.server}
          onBack={() =>
            setViewState({ type: 'server-tools', server: viewState.server })
          }
        />
      )
    }

    case 'agent-server-menu':
      return (
        <MCPAgentServerMenu
          agentServer={viewState.agentServer}
          onCancel={() => setViewState({ type: 'list', defaultTab: 'Agents' })}
          onComplete={onComplete}
        />
      )
  }
}
