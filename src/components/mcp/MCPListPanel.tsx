import figures from 'figures'
import React, { useCallback, useState } from 'react'
import type { CommandResultDisplay } from '../../commands.js'
import { Box, color, Link, Text, useTheme } from '@anthropic/ink'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import type { ConfigScope } from '../../services/mcp/types.js'
import { describeMcpConfigFilePath } from '../../services/mcp/utils.js'
import { isDebugMode } from '../../utils/debug.js'
import { plural } from '../../utils/stringUtils.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { Byline, Dialog, KeyboardShortcutHint } from '@anthropic/ink'
import { McpParsingWarnings } from './McpParsingWarnings.js'
import type { AgentMcpServerInfo, ServerInfo } from './types.js'

type Props = {
  servers: ServerInfo[]
  agentServers?: AgentMcpServerInfo[]
  onSelectServer: (server: ServerInfo) => void
  onSelectAgentServer?: (agentServer: AgentMcpServerInfo) => void
  onComplete: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  defaultTab?: string
}

type SelectableItem =
  | { type: 'server'; server: ServerInfo }
  | { type: 'agent-server'; agentServer: AgentMcpServerInfo }

// Define scope order for display (constant, outside component)
// 'dynamic' (built-in) is rendered separately at the end
const SCOPE_ORDER: ConfigScope[] = ['project', 'local', 'user', 'enterprise']

// Get scope heading parts (label is bold, path is grey)
function getScopeHeading(scope: ConfigScope): { label: string; path?: string } {
  switch (scope) {
    case 'project':
      return { label: 'Project MCPs', path: describeMcpConfigFilePath(scope) }
    case 'user':
      return { label: 'User MCPs', path: describeMcpConfigFilePath(scope) }
    case 'local':
      return { label: 'Local MCPs', path: describeMcpConfigFilePath(scope) }
    case 'enterprise':
      return { label: 'Enterprise MCPs' }
    case 'dynamic':
      return { label: 'Built-in MCPs', path: 'always available' }
    default:
      return { label: scope }
  }
}

// Group servers by scope
function groupServersByScope(
  serverList: ServerInfo[],
): Map<ConfigScope, ServerInfo[]> {
  const groups = new Map<ConfigScope, ServerInfo[]>()
  for (const server of serverList) {
    const scope = server.scope
    if (!groups.has(scope)) {
      groups.set(scope, [])
    }
    groups.get(scope)!.push(server)
  }
  // Sort servers within each group alphabetically
  for (const [, groupServers] of groups) {
    groupServers.sort((a, b) => a.name.localeCompare(b.name))
  }
  return groups
}

export function MCPListPanel({
  servers,
  agentServers = [],
  onSelectServer,
  onSelectAgentServer,
  onComplete,
}: Props): React.ReactNode {
  const [theme] = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Non-claudeai servers grouped by scope
  const serversByScope = React.useMemo(() => {
    const regularServers = servers.filter(
      s => s.client.config.type !== 'claudeai-proxy',
    )
    return groupServersByScope(regularServers)
  }, [servers])

  const claudeAiServers = React.useMemo(
    () =>
      servers
        .filter(s => s.client.config.type === 'claudeai-proxy')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [servers],
  )

  // Built-in (dynamic) servers - rendered last
  const dynamicServers = React.useMemo(
    () =>
      (serversByScope.get('dynamic') ?? []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [serversByScope],
  )

  // Pre-compute dynamic heading for render
  const dynamicHeading = getScopeHeading('dynamic')

  // Build flat list of selectable items in display order
  const selectableItems = React.useMemo(() => {
    const items: SelectableItem[] = []
    for (const scope of SCOPE_ORDER) {
      const scopeServers = serversByScope.get(scope) ?? []
      for (const server of scopeServers) {
        items.push({ type: 'server', server })
      }
    }
    for (const server of claudeAiServers) {
      items.push({ type: 'server', server })
    }
    for (const agentServer of agentServers) {
      items.push({ type: 'agent-server', agentServer })
    }
    // Dynamic (built-in) servers come last
    for (const server of dynamicServers) {
      items.push({ type: 'server', server })
    }
    return items
  }, [serversByScope, claudeAiServers, agentServers, dynamicServers])

  const handleCancel = useCallback((): void => {
    onComplete('MCP dialog dismissed', {
      display: 'system',
    })
  }, [onComplete])

  const handleSelect = useCallback((): void => {
    const item = selectableItems[selectedIndex]
    if (!item) return
    if (item.type === 'server') {
      onSelectServer(item.server)
    } else if (item.type === 'agent-server' && onSelectAgentServer) {
      onSelectAgentServer(item.agentServer)
    }
  }, [selectableItems, selectedIndex, onSelectServer, onSelectAgentServer])

  // Use configurable keybindings for navigation and selection
  useKeybindings(
    {
      'confirm:previous': () =>
        setSelectedIndex(prev =>
          prev === 0 ? selectableItems.length - 1 : prev - 1,
        ),
      'confirm:next': () =>
        setSelectedIndex(prev =>
          prev === selectableItems.length - 1 ? 0 : prev + 1,
        ),
      'confirm:yes': handleSelect,
      'confirm:no': handleCancel,
    },
    { context: 'Confirmation' },
  )

  // Build index lookup for each server
  const getServerIndex = (server: ServerInfo): number => {
    return selectableItems.findIndex(
      item => item.type === 'server' && item.server === server,
    )
  }

  const getAgentServerIndex = (agentServer: AgentMcpServerInfo): number => {
    return selectableItems.findIndex(
      item => item.type === 'agent-server' && item.agentServer === agentServer,
    )
  }

  const debugMode = isDebugMode()
  const hasFailedClients = servers.some(s => s.client.type === 'failed')

  if (servers.length === 0 && agentServers.length === 0) {
    return null
  }

  const renderServerItem = (server: ServerInfo): React.ReactNode => {
    const index = getServerIndex(server)
    const isSelected = selectedIndex === index
    let statusIcon = ''
    let statusText = ''

    if (server.client.type === 'disabled') {
      statusIcon = color('inactive', theme)(figures.radioOff)
      statusText = 'disabled'
    } else if (server.client.type === 'connected') {
      statusIcon = color('success', theme)(figures.tick)
      statusText = 'connected'
    } else if (server.client.type === 'pending') {
      statusIcon = color('inactive', theme)(figures.radioOff)
      const { reconnectAttempt, maxReconnectAttempts } = server.client
      if (reconnectAttempt && maxReconnectAttempts) {
        statusText = `reconnecting (${reconnectAttempt}/${maxReconnectAttempts})…`
      } else {
        statusText = 'connecting…'
      }
    } else if (server.client.type === 'needs-auth') {
      statusIcon = color('warning', theme)(figures.triangleUpOutline)
      statusText = 'needs authentication'
    } else {
      statusIcon = color('error', theme)(figures.cross)
      statusText = 'failed'
    }

    return (
      <Box key={`${server.name}-${index}`}>
        <Text color={isSelected ? 'suggestion' : undefined}>
          {isSelected ? `${figures.pointer} ` : '  '}
        </Text>
        <Text color={isSelected ? 'suggestion' : undefined}>{server.name}</Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>{statusText}</Text>
      </Box>
    )
  }

  const renderAgentServerItem = (
    agentServer: AgentMcpServerInfo,
  ): React.ReactNode => {
    const index = getAgentServerIndex(agentServer)
    const isSelected = selectedIndex === index
    const statusIcon = agentServer.needsAuth
      ? color('warning', theme)(figures.triangleUpOutline)
      : color('inactive', theme)(figures.radioOff)
    const statusText = agentServer.needsAuth ? 'may need auth' : 'agent-only'

    return (
      <Box key={`agent-${agentServer.name}-${index}`}>
        <Text color={isSelected ? 'suggestion' : undefined}>
          {isSelected ? `${figures.pointer} ` : '  '}
        </Text>
        <Text color={isSelected ? 'suggestion' : undefined}>
          {agentServer.name}
        </Text>
        <Text dimColor={!isSelected}> · {statusIcon} </Text>
        <Text dimColor={!isSelected}>{statusText}</Text>
      </Box>
    )
  }

  const totalServers = servers.length + agentServers.length

  return (
    <Box flexDirection="column">
      <McpParsingWarnings />

      <Dialog
        title="Manage MCP servers"
        subtitle={`${totalServers} ${plural(totalServers, 'server')}`}
        onCancel={handleCancel}
        hideInputGuide
      >
        <Box flexDirection="column">
          {/* Regular servers grouped by scope */}
          {SCOPE_ORDER.map(scope => {
            const scopeServers = serversByScope.get(scope)
            if (!scopeServers || scopeServers.length === 0) return null
            const heading = getScopeHeading(scope)
            return (
              <Box key={scope} flexDirection="column" marginBottom={1}>
                <Box paddingLeft={2}>
                  <Text bold>{heading.label}</Text>
                  {heading.path && <Text dimColor> ({heading.path})</Text>}
                </Box>
                {scopeServers.map(server => renderServerItem(server))}
              </Box>
            )
          })}

          {/* Claude.ai servers section */}
          {claudeAiServers.length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Box paddingLeft={2}>
                <Text bold>claude.ai</Text>
              </Box>
              {claudeAiServers.map(server => renderServerItem(server))}
            </Box>
          )}

          {/* Agent servers section - grouped by source agent */}
          {agentServers.length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Box paddingLeft={2}>
                <Text bold>Agent MCPs</Text>
              </Box>
              {/* Group servers by source agent */}
              {[...new Set(agentServers.flatMap(s => s.sourceAgents))].map(
                agentName => (
                  <Box key={agentName} flexDirection="column" marginTop={1}>
                    <Box paddingLeft={2}>
                      <Text dimColor>@{agentName}</Text>
                    </Box>
                    {agentServers
                      .filter(s => s.sourceAgents.includes(agentName))
                      .map(agentServer => renderAgentServerItem(agentServer))}
                  </Box>
                ),
              )}
            </Box>
          )}

          {/* Built-in (dynamic) servers section - always last */}
          {dynamicServers.length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Box paddingLeft={2}>
                <Text bold>{dynamicHeading.label}</Text>
                {dynamicHeading.path && (
                  <Text dimColor> ({dynamicHeading.path})</Text>
                )}
              </Box>
              {dynamicServers.map(server => renderServerItem(server))}
            </Box>
          )}

          {/* Footer info */}
          <Box flexDirection="column">
            {hasFailedClients && (
              <Text dimColor>
                {debugMode
                  ? '※ Error logs shown inline with --debug'
                  : '※ Run claude --debug to see error logs'}
              </Text>
            )}
            <Text dimColor>
              <Link url="https://code.claude.com/docs/en/mcp">
                https://code.claude.com/docs/en/mcp
              </Link>{' '}
              for help
            </Text>
          </Box>
        </Box>
      </Dialog>

      {/* Custom footer with navigation hint */}
      <Box paddingX={1}>
        <Text dimColor italic>
          <Byline>
            <KeyboardShortcutHint shortcut="↑↓" action="navigate" />
            <KeyboardShortcutHint shortcut="Enter" action="confirm" />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="cancel"
            />
          </Byline>
        </Text>
      </Box>
    </Box>
  )
}
