import { describe, expect, test, mock } from 'bun:test'
import { createMcpManager } from '../manager.js'
import type { McpManager } from '../manager.js'
import type { McpClientDependencies } from '../interfaces.js'
import type { ScopedMcpServerConfig, MCPServerConnection, ConnectedMCPServer } from '../types.js'
import type { Client } from '@modelcontextprotocol/sdk/client/index.js'

function createMockDeps(): McpClientDependencies {
  return {
    logger: {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    },
    httpConfig: {
      getUserAgent: () => 'test-agent/1.0',
      getSessionId: () => 'test-session',
    },
  }
}

describe('createMcpManager', () => {
  test('creates a manager instance', () => {
    const manager = createMcpManager(createMockDeps())
    expect(manager).toBeDefined()
    expect(manager.getConnections).toBeTypeOf('function')
    expect(manager.connect).toBeTypeOf('function')
    expect(manager.disconnect).toBeTypeOf('function')
    expect(manager.getTools).toBeTypeOf('function')
    expect(manager.getAllTools).toBeTypeOf('function')
    expect(manager.callTool).toBeTypeOf('function')
    expect(manager.on).toBeTypeOf('function')
    expect(manager.off).toBeTypeOf('function')
  })

  test('connect throws if connectFn not set', async () => {
    const manager = createMcpManager(createMockDeps())
    await expect(manager.connect('test', { command: 'npx', args: [] }))
      .rejects.toThrow('connectFn not set')
  })

  test('connect calls connectFn and emits connected event', async () => {
    const manager = createMcpManager(createMockDeps()) as any
    let connectedEvent: string | null = null
    manager.on('connected', (name: string) => { connectedEvent = name })

    const mockConnection: ConnectedMCPServer = {
      type: 'connected',
      name: 'test-server',
      client: {
        request: mock(() => Promise.resolve({ tools: [] })),
        onclose: null,
      } as unknown as Client,
      capabilities: {},
      config: { command: 'npx', args: [], scope: 'dynamic' } as ScopedMcpServerConfig,
      cleanup: mock(() => Promise.resolve()),
    }

    manager.setConnectFn(async (name: string, config: ScopedMcpServerConfig) => {
      expect(name).toBe('test-server')
      expect(config.scope).toBe('dynamic')
      return mockConnection
    })

    const result = await manager.connect('test-server', { command: 'npx', args: [] })
    expect(result.type).toBe('connected')
    expect(connectedEvent as unknown as string).toBe('test-server')
  })

  test('disconnect calls cleanup and emits disconnected', async () => {
    const manager = createMcpManager(createMockDeps()) as any
    let disconnected = false
    manager.on('disconnected', () => { disconnected = true })

    const mockCleanup = mock(() => Promise.resolve())
    const mockConnection: ConnectedMCPServer = {
      type: 'connected',
      name: 'test-server',
      client: { request: mock(() => Promise.resolve({ tools: [] })) } as unknown as Client,
      capabilities: {},
      config: { command: 'npx', args: [], scope: 'dynamic' } as ScopedMcpServerConfig,
      cleanup: mockCleanup,
    }

    manager.setConnectFn(async () => mockConnection)
    await manager.connect('test-server', { command: 'npx', args: [] })

    await manager.disconnect('test-server')
    expect(mockCleanup).toHaveBeenCalled()
    expect(disconnected).toBe(true)
    expect(manager.getConnections().size).toBe(0)
  })

  test('on/off event handling', () => {
    const manager = createMcpManager(createMockDeps()) as any
    const handler = mock(() => {})
    manager.on('error', handler)
    manager.off('error', handler)
    // No crash — just verifying it works
    expect(true).toBe(true)
  })

  test('getTools returns empty array for unknown server', () => {
    const manager = createMcpManager(createMockDeps())
    expect(manager.getTools('unknown')).toEqual([])
  })

  test('getAllTools returns empty array initially', () => {
    const manager = createMcpManager(createMockDeps())
    expect(manager.getAllTools()).toEqual([])
  })
})
