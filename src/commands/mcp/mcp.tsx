import React, { useEffect, useRef } from 'react';
import type { Command } from '../../commands.js';
import { MCPSettings } from '../../components/mcp/index.js';
import { MCPReconnect } from '../../components/mcp/MCPReconnect.js';
import { clearServerCache, reconnectMcpServerImpl } from '../../services/mcp/client.js';
import {
  getAllMcpConfigs,
  getClaudeCodeMcpConfigs,
  isMcpServerDisabled,
  setMcpServerEnabled,
} from '../../services/mcp/config.js';
import { useMcpToggleEnabled } from '../../services/mcp/MCPConnectionManager.js';
import type { ConfigScope, MCPServerConnection, ServerResource } from '../../services/mcp/types.js';
import {
  describeMcpConfigFilePath,
  excludeCommandsByServer,
  excludeResourcesByServer,
  excludeToolsByServer,
  filterToolsByServer,
} from '../../services/mcp/utils.js';
import { useAppState } from '../../state/AppState.js';
import type { Tool } from '../../Tool.js';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { plural } from '../../utils/stringUtils.js';
import { PluginSettings } from '../plugin/PluginSettings.js';

type McpUpdate = MCPServerConnection & {
  tools?: Tool[];
  commands?: Command[];
  resources?: ServerResource[];
};

const HEADLESS_SCOPE_ORDER: ConfigScope[] = ['project', 'local', 'user', 'enterprise'];

function getToggleSelection(
  action: 'enable' | 'disable',
  target: string,
  mcpClients: MCPServerConnection[],
): {
  toToggle: MCPServerConnection[];
  emptyMessage?: string;
} {
  const isEnabling = action === 'enable';
  const clients = mcpClients.filter(c => c.name !== 'ide');
  const matching = target === 'all' ? clients : clients.filter(c => c.name === target);
  const toToggle = matching.filter(c => (isEnabling ? c.type === 'disabled' : c.type !== 'disabled'));

  if (toToggle.length > 0) return { toToggle };

  if (target === 'all') {
    return {
      toToggle,
      emptyMessage: `All MCP servers are already ${isEnabling ? 'enabled' : 'disabled'}`,
    };
  }

  if (matching.length === 0) {
    return { toToggle, emptyMessage: `MCP server "${target}" not found` };
  }

  return {
    toToggle,
    emptyMessage: `MCP server "${target}" is already ${isEnabling ? 'enabled' : 'disabled'}`,
  };
}

function getToggleSuccessMessage(action: 'enable' | 'disable', target: string, count: number): string {
  const isEnabling = action === 'enable';
  return target === 'all'
    ? `${isEnabling ? 'Enabled' : 'Disabled'} ${count} MCP server(s)`
    : `MCP server "${target}" ${isEnabling ? 'enabled' : 'disabled'}`;
}

async function getHeadlessMcpClients(context: LocalJSXCommandContext): Promise<MCPServerConnection[]> {
  const clients = new Map(
    context
      .getAppState()
      .mcp.clients.filter(client => client.name !== 'ide')
      .map(client => [client.name, client] as const),
  );

  const { servers: allServers } = await getAllMcpConfigs().catch(() =>
    getClaudeCodeMcpConfigs(context.options.dynamicMcpConfig),
  );
  const servers = { ...allServers, ...context.options.dynamicMcpConfig };
  for (const [name, config] of Object.entries(servers)) {
    if (name === 'ide' || clients.has(name)) continue;
    clients.set(name, {
      name,
      type: isMcpServerDisabled(name) ? 'disabled' : 'pending',
      config,
    });
  }

  return [...clients.values()];
}

function applyMcpUpdate(context: LocalJSXCommandContext, update: McpUpdate) {
  const { tools, commands, resources, ...client } = update;
  context.setAppState(prev => {
    const clients = prev.mcp.clients.some(c => c.name === client.name)
      ? prev.mcp.clients.map(c => (c.name === client.name ? client : c))
      : [...prev.mcp.clients, client];

    return {
      ...prev,
      mcp: {
        ...prev.mcp,
        clients,
        tools: tools === undefined ? prev.mcp.tools : [...excludeToolsByServer(prev.mcp.tools, client.name), ...tools],
        commands:
          commands === undefined
            ? prev.mcp.commands
            : [...excludeCommandsByServer(prev.mcp.commands, client.name), ...commands],
        resources:
          resources === undefined
            ? prev.mcp.resources
            : resources.length > 0
              ? {
                  ...excludeResourcesByServer(prev.mcp.resources, client.name),
                  [client.name]: resources,
                }
              : excludeResourcesByServer(prev.mcp.resources, client.name),
      },
    };
  });
}

async function setMcpServerState(
  context: LocalJSXCommandContext,
  server: MCPServerConnection,
  enabled: boolean,
): Promise<void> {
  setMcpServerEnabled(server.name, enabled);

  if (!enabled) {
    if (server.type === 'connected') {
      await clearServerCache(server.name, server.config);
    }
    applyMcpUpdate(context, {
      name: server.name,
      type: 'disabled',
      config: server.config,
      tools: [],
      commands: [],
      resources: [],
    });
    return;
  }

  applyMcpUpdate(context, {
    name: server.name,
    type: 'pending',
    config: server.config,
  });
  const result = await reconnectMcpServerImpl(server.name, server.config);
  applyMcpUpdate(context, {
    ...result.client,
    tools: result.tools,
    commands: result.commands,
    resources: result.resources ?? [],
  });
}

async function completeHeadlessToggle(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  action: 'enable' | 'disable',
  target: string,
): Promise<void> {
  const { toToggle, emptyMessage } = getToggleSelection(action, target, await getHeadlessMcpClients(context));

  if (emptyMessage) {
    onDone(emptyMessage, { display: 'system' });
    return;
  }

  for (const server of toToggle) {
    await setMcpServerState(context, server, action === 'enable');
  }

  onDone(getToggleSuccessMessage(action, target, toToggle.length), {
    display: 'system',
  });
}

async function completeHeadlessReconnect(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  serverName: string,
): Promise<void> {
  const server = (await getHeadlessMcpClients(context)).find(c => c.name === serverName);
  if (!server) {
    onDone(`MCP server "${serverName}" not found`, { display: 'system' });
    return;
  }
  if (server.type === 'disabled' || isMcpServerDisabled(serverName)) {
    onDone(`MCP server "${serverName}" is disabled. Enable it first.`, {
      display: 'system',
    });
    return;
  }

  try {
    const result = await reconnectMcpServerImpl(serverName, server.config);
    applyMcpUpdate(context, {
      ...result.client,
      tools: result.tools,
      commands: result.commands,
      resources: result.resources ?? [],
    });

    switch (result.client.type) {
      case 'connected':
        onDone(`Successfully reconnected to ${serverName}`, {
          display: 'system',
        });
        return;
      case 'needs-auth':
        onDone(`${serverName} requires authentication. Use /mcp to authenticate.`, {
          display: 'system',
        });
        return;
      case 'pending':
      case 'failed':
      case 'disabled':
        onDone(`Failed to reconnect to ${serverName}`, { display: 'system' });
        return;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    onDone(`Error: ${errorMessage}`, { display: 'system' });
  }
}

async function completeHeadlessSummary(onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext): Promise<void> {
  const clients = await getHeadlessMcpClients(context);

  if (clients.length === 0) {
    onDone('Manage MCP servers\n  0 servers', { display: 'system' });
    return;
  }

  onDone(formatHeadlessMcpList(clients), {
    display: 'system',
  });
}

function formatHeadlessMcpList(clients: MCPServerConnection[]): string {
  const lines = ['Manage MCP servers', `  ${clients.length} ${plural(clients.length, 'server')}`, ''];
  const regularByScope = groupHeadlessMcpClients(clients.filter(c => c.config.type !== 'claudeai-proxy'));
  const claudeAiClients = clients.filter(c => c.config.type === 'claudeai-proxy').sort(compareMcpClients);
  const dynamicClients = regularByScope.get('dynamic') ?? [];

  for (const scope of HEADLESS_SCOPE_ORDER) {
    appendHeadlessMcpGroup(lines, getHeadlessScopeHeading(scope), regularByScope.get(scope) ?? []);
  }
  for (const [scope, scopeClients] of regularByScope) {
    if (scope === 'dynamic' || HEADLESS_SCOPE_ORDER.includes(scope)) continue;
    appendHeadlessMcpGroup(lines, getHeadlessScopeHeading(scope), scopeClients);
  }

  appendHeadlessMcpGroup(lines, 'claude.ai', claudeAiClients);
  appendHeadlessMcpGroup(lines, 'Built-in MCPs (always available)', dynamicClients);

  while (lines.at(-1) === '') {
    lines.pop();
  }
  return lines.join('\n');
}

function groupHeadlessMcpClients(clients: MCPServerConnection[]): Map<ConfigScope, MCPServerConnection[]> {
  const groups = new Map<ConfigScope, MCPServerConnection[]>();
  for (const client of clients) {
    const scope = client.config.scope;
    if (!groups.has(scope)) {
      groups.set(scope, []);
    }
    groups.get(scope)!.push(client);
  }
  for (const group of groups.values()) {
    group.sort(compareMcpClients);
  }
  return groups;
}

function appendHeadlessMcpGroup(lines: string[], heading: string, clients: MCPServerConnection[]): void {
  if (clients.length === 0) return;
  lines.push(`    ${heading}`);
  for (const client of clients) {
    lines.push(`    ${client.name} · ${formatMcpListStatus(client)}`);
  }
  lines.push('');
}

function getHeadlessScopeHeading(scope: ConfigScope): string {
  switch (scope) {
    case 'project':
      return `Project MCPs (${describeMcpConfigFilePath(scope)})`;
    case 'local':
      return `Local MCPs (${describeMcpConfigFilePath(scope)})`;
    case 'user':
      return `User MCPs (${describeMcpConfigFilePath(scope)})`;
    case 'enterprise':
      return 'Enterprise MCPs';
    default:
      return scope;
  }
}

function compareMcpClients(left: MCPServerConnection, right: MCPServerConnection): number {
  return left.name.localeCompare(right.name);
}

function formatMcpListStatus(client: MCPServerConnection): string {
  switch (client.type) {
    case 'connected':
      return '✔ connected';
    case 'needs-auth':
      return '△ needs authentication';
    case 'pending':
      return '◯ pending';
    case 'failed':
      return '✘ failed';
    case 'disabled':
      return '◯ disabled';
  }
}

async function completeHeadlessServerStatus(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  serverName: string,
): Promise<void> {
  const server = (await getHeadlessMcpClients(context)).find(c => c.name === serverName);
  if (!server) {
    onDone(`MCP server "${serverName}" not found`, { display: 'system' });
    return;
  }

  const tools = filterToolsByServer(context.getAppState().mcp.tools, server.name);
  const resources = context.getAppState().mcp.resources[server.name] ?? [];
  const actions = [
    'status',
    ...(tools.length > 0 ? ['tools'] : []),
    ...(server.type === 'disabled' ? ['enable'] : ['reconnect', 'disable']),
  ].join(', ');
  onDone(
    [
      `MCP server "${server.name}"`,
      `Status: ${formatMcpStatus(server)}`,
      `Transport: ${server.config.type ?? 'stdio'}`,
      `Scope: ${server.config.scope}`,
      `Tools: ${tools.length}`,
      `Resources: ${resources.length}`,
      `Actions: ${actions}`,
    ].join('\n'),
    { display: 'system' },
  );
}

async function completeHeadlessTools(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  serverName: string,
): Promise<void> {
  const server = (await getHeadlessMcpClients(context)).find(c => c.name === serverName);
  if (!server) {
    onDone(`MCP server "${serverName}" not found`, { display: 'system' });
    return;
  }

  const tools = filterToolsByServer(context.getAppState().mcp.tools, server.name);
  if (tools.length === 0) {
    onDone(`No tools are currently available for MCP server "${server.name}".`, {
      display: 'system',
    });
    return;
  }

  onDone(
    `Tools for ${server.name}:\n${tools
      .map(tool => `- ${tool.name}${tool.description ? `: ${tool.description}` : ''}`)
      .join('\n')}`,
    { display: 'system' },
  );
}

function formatMcpStatus(client: MCPServerConnection): string {
  switch (client.type) {
    case 'connected':
      return 'connected';
    case 'needs-auth':
      return 'needs authentication';
    case 'pending':
      return 'pending';
    case 'failed':
      return client.error ? `failed (${client.error})` : 'failed';
    case 'disabled':
      return 'disabled';
  }
}

// TODO: This is a hack to get the context value from toggleMcpServer (useContext only works in a component)
// Ideally, all MCP state and functions would be in global state.
function MCPToggle({
  action,
  target,
  onComplete,
}: {
  action: 'enable' | 'disable';
  target: string;
  onComplete: (result: string) => void;
}): null {
  const mcpClients = useAppState(s => s.mcp.clients);
  const toggleMcpServer = useMcpToggleEnabled();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const isEnabling = action === 'enable';
    const { toToggle, emptyMessage } = getToggleSelection(action, target, mcpClients);

    if (emptyMessage) {
      onComplete(emptyMessage);
      return;
    }

    for (const s of toToggle) {
      void toggleMcpServer(s.name);
    }

    onComplete(getToggleSuccessMessage(action, target, toToggle.length));
  }, [action, target, mcpClients, toggleMcpServer, onComplete]);

  return null;
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  args?: string,
): Promise<React.ReactNode> {
  if (args) {
    const parts = args.trim().split(/\s+/);

    // Allow /mcp no-redirect to bypass the redirect for testing
    if (parts[0] === 'no-redirect') {
      return <MCPSettings onComplete={onDone} />;
    }

    if (parts[0] === 'reconnect' && parts[1]) {
      if (context.options.isNonInteractiveSession) {
        await completeHeadlessReconnect(onDone, context, parts.slice(1).join(' '));
        return null;
      }
      return <MCPReconnect serverName={parts.slice(1).join(' ')} onComplete={onDone} />;
    }

    if ((parts[0] === 'status' || parts[0] === 'tools') && parts[1]) {
      if (context.options.isNonInteractiveSession) {
        if (parts[0] === 'tools') {
          await completeHeadlessTools(onDone, context, parts.slice(1).join(' '));
        } else {
          await completeHeadlessServerStatus(onDone, context, parts.slice(1).join(' '));
        }
        return null;
      }
    }

    if (parts[0] === 'enable' || parts[0] === 'disable') {
      if (context.options.isNonInteractiveSession) {
        await completeHeadlessToggle(onDone, context, parts[0], parts.length > 1 ? parts.slice(1).join(' ') : 'all');
        return null;
      }
      return (
        <MCPToggle action={parts[0]} target={parts.length > 1 ? parts.slice(1).join(' ') : 'all'} onComplete={onDone} />
      );
    }

    if (context.options.isNonInteractiveSession) {
      await completeHeadlessServerStatus(onDone, context, args.trim());
      return null;
    }
  }

  if (context.options.isNonInteractiveSession) {
    await completeHeadlessSummary(onDone, context);
    return null;
  }

  // Redirect base /mcp command to /plugins installed tab for ant users
  if (process.env.USER_TYPE === 'ant') {
    return <PluginSettings onComplete={onDone} args="manage" showMcpRedirectMessage />;
  }

  return <MCPSettings onComplete={onDone} />;
}
