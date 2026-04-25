import { assembleToolPool, filterToolsByDenyRules } from '../tools.js'
import type {
  MCPServerConnection,
  ServerResource,
} from '../services/mcp/types.js'
import type { AppState } from '../state/AppStateStore.js'
import type { Tools } from '../Tool.js'
import { mergeAndFilterTools } from './toolPool.js'

export type RuntimeToolState = {
  tools: Tools
  mcpClients: MCPServerConnection[]
  mcpResources: Record<string, ServerResource[]>
}

export function mergeRuntimeMcpClients(
  initialClients: MCPServerConnection[],
  currentClients: readonly MCPServerConnection[] | undefined,
): MCPServerConnection[] {
  const merged = new Map<string, MCPServerConnection>()
  for (const client of initialClients) {
    merged.set(client.name, client)
  }
  for (const client of currentClients ?? []) {
    merged.set(client.name, client)
  }
  return [...merged.values()]
}

function copyMcpResources(
  resources: AppState['mcp']['resources'] | undefined,
): Record<string, ServerResource[]> {
  const copy: Record<string, ServerResource[]> = {}
  for (const [serverName, serverResources] of Object.entries(
    resources ?? {},
  )) {
    copy[serverName] = [...serverResources] as ServerResource[]
  }
  return copy
}

export function resolveRuntimeToolState(
  initialTools: Tools,
  initialMcpClients: MCPServerConnection[],
  appState: AppState,
): RuntimeToolState {
  const assembled = assembleToolPool(
    appState.toolPermissionContext,
    appState.mcp?.tools ?? [],
  )
  const filteredInitialTools = filterToolsByDenyRules(
    initialTools,
    appState.toolPermissionContext,
  )
  return {
    tools: mergeAndFilterTools(
      filteredInitialTools,
      assembled,
      appState.toolPermissionContext.mode,
    ),
    mcpClients: mergeRuntimeMcpClients(
      initialMcpClients,
      appState.mcp?.clients,
    ),
    mcpResources: copyMcpResources(appState.mcp?.resources),
  }
}
