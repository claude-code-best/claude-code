import { describe, expect, test } from 'bun:test'
import {
  mergeRuntimeMcpClients,
  resolveRuntimeToolState,
} from '../runtimeToolState.js'

function permissionContext(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {
      userSettings: [],
      projectSettings: [],
      localSettings: [],
      flagSettings: [],
      policySettings: [],
      cliArg: [],
      command: [],
      session: [],
    },
    alwaysDenyRules: {
      userSettings: [],
      projectSettings: [],
      localSettings: [],
      flagSettings: [],
      policySettings: [],
      cliArg: [],
      command: [],
      session: [],
    },
    alwaysAskRules: {
      userSettings: [],
      projectSettings: [],
      localSettings: [],
      flagSettings: [],
      policySettings: [],
      cliArg: [],
      command: [],
      session: [],
    },
    isBypassPermissionsModeAvailable: true,
    ...overrides,
  } as any
}

describe('runtime MCP tool state', () => {
  test('prefers current app-state MCP clients over session initial clients', () => {
    const merged = mergeRuntimeMcpClients(
      [{ name: 'claude-in-chrome', type: 'pending', config: {} } as any],
      [{ name: 'claude-in-chrome', type: 'connected', config: {} } as any],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.type).toBe('connected')
  })

  test('keeps initial-only clients and appends newly discovered current clients', () => {
    const merged = mergeRuntimeMcpClients(
      [{ name: 'filesystem', type: 'connected', config: {} } as any],
      [{ name: 'claude-in-chrome', type: 'connected', config: {} } as any],
    )

    expect(merged.map(client => client.name)).toEqual([
      'filesystem',
      'claude-in-chrome',
    ])
  })

  test('includes MCP tools discovered after session creation', () => {
    const mcpTool = {
      name: 'mcp__claude-in-chrome__navigate',
      isMcp: true,
      mcpInfo: {
        serverName: 'claude-in-chrome',
        toolName: 'navigate',
      },
    }

    const runtime = resolveRuntimeToolState([], [], {
      toolPermissionContext: permissionContext(),
      mcp: {
        clients: [{ name: 'claude-in-chrome', type: 'connected', config: {} }],
        tools: [mcpTool],
        resources: {},
      },
    } as any)

    expect(runtime.tools.map(tool => tool.name)).toContain(
      'mcp__claude-in-chrome__navigate',
    )
  })

  test('filters session-initial tools with current deny rules', () => {
    const mcpTool = {
      name: 'mcp__claude-in-chrome__navigate',
      isMcp: true,
      mcpInfo: {
        serverName: 'claude-in-chrome',
        toolName: 'navigate',
      },
    }

    const runtime = resolveRuntimeToolState([mcpTool] as any, [], {
      toolPermissionContext: permissionContext({
        alwaysDenyRules: {
          userSettings: ['mcp__claude-in-chrome'],
          projectSettings: [],
          localSettings: [],
          flagSettings: [],
          policySettings: [],
          cliArg: [],
          command: [],
          session: [],
        },
      }),
      mcp: {
        clients: [{ name: 'claude-in-chrome', type: 'connected', config: {} }],
        tools: [],
        resources: {},
      },
    } as any)

    expect(runtime.tools.map(tool => tool.name)).not.toContain(
      'mcp__claude-in-chrome__navigate',
    )
  })

  test('copies runtime MCP resources from app state', () => {
    const resource = {
      server: 'claude-in-chrome',
      uri: 'chrome://tabs',
      name: 'Tabs',
    }
    const resources = {
      'claude-in-chrome': [resource],
    }

    const runtime = resolveRuntimeToolState([], [], {
      toolPermissionContext: permissionContext(),
      mcp: {
        clients: [],
        tools: [],
        resources,
      },
    } as any)

    expect(runtime.mcpResources['claude-in-chrome']).toEqual([resource])
    expect(runtime.mcpResources['claude-in-chrome']).not.toBe(
      resources['claude-in-chrome'],
    )
  })
})
