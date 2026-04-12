import { describe, expect, test, mock } from 'bun:test'
import { discoverTools, createCachedToolDiscovery } from '../discovery.js'
import type { DiscoveryOptions } from '../discovery.js'
import type { ConnectedMCPServer } from '../types.js'
import type { McpClientDependencies } from '../interfaces.js'

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
    },
  }
}

describe('discoverTools', () => {
  test('returns empty array when capabilities.tools is missing', async () => {
    const result = await discoverTools({
      serverName: 'test',
      client: {} as any,
      capabilities: {},
      deps: createMockDeps(),
    })
    expect(result).toEqual([])
  })

  test('fetches and transforms tools from server', async () => {
    const mockClient = {
      request: mock(() =>
        Promise.resolve({
          tools: [
            {
              name: 'search',
              description: 'Search for items',
              inputSchema: { type: 'object' },
              annotations: { readOnlyHint: true, title: 'Search Items' },
            },
          ],
        }),
      ),
    }

    const result = await discoverTools({
      serverName: 'my-server',
      client: mockClient as any,
      capabilities: { tools: {} },
      deps: createMockDeps(),
    })

    expect(result).toHaveLength(1)
    const tool = result[0]
    expect(tool.name).toBe('mcp__my-server__search')
    expect(tool.mcpInfo).toEqual({ serverName: 'my-server', toolName: 'search' })
    expect(tool.isMcp).toBe(true)
    expect(tool.isReadOnly()).toBe(true)
    expect(tool.userFacingName()).toBe('Search Items')
    expect(await tool.description()).toBe('Search for items')
  })

  test('respects skipPrefix option', async () => {
    const mockClient = {
      request: mock(() =>
        Promise.resolve({
          tools: [{ name: 'search', description: 'Search' }],
        }),
      ),
    }

    const result = await discoverTools({
      serverName: 'my-server',
      client: mockClient as any,
      capabilities: { tools: {} },
      skipPrefix: true,
      deps: createMockDeps(),
    })

    expect(result[0].name).toBe('search')
  })

  test('returns empty array on fetch error', async () => {
    const mockClient = {
      request: mock(() => Promise.reject(new Error('Connection lost'))),
    }
    const deps = createMockDeps()

    const result = await discoverTools({
      serverName: 'failing-server',
      client: mockClient as any,
      capabilities: { tools: {} },
      deps,
    })

    expect(result).toEqual([])
    expect(deps.logger.warn).toHaveBeenCalled()
  })

  test('sanitizes tool data', async () => {
    const mockClient = {
      request: mock(() =>
        Promise.resolve({
          tools: [
            {
              name: 'tool\x00with\x07control',
              description: 'desc',
            },
          ],
        }),
      ),
    }

    const result = await discoverTools({
      serverName: 'test',
      client: mockClient as any,
      capabilities: { tools: {} },
      deps: createMockDeps(),
    })

    expect(result[0].name).not.toContain('\x00')
  })
})

describe('createCachedToolDiscovery', () => {
  test('caches results by server name', async () => {
    const deps = createMockDeps()
    const { discover, cache } = createCachedToolDiscovery(deps)

    const mockConn = {
      type: 'connected' as const,
      name: 'cached-server',
      client: {
        request: mock(() =>
          Promise.resolve({
            tools: [{ name: 'tool1', description: 'Tool 1' }],
          }),
        ),
      },
      capabilities: { tools: {} },
    } as unknown as ConnectedMCPServer

    // First call — should fetch
    const result1 = await discover(mockConn)
    expect(result1).toHaveLength(1)

    // Second call — should use cache
    const result2 = await discover(mockConn)
    expect(result2).toHaveLength(1)

    // Request was called only once
    expect(mockConn.client.request).toHaveBeenCalledTimes(1)

    // Cache delete works
    cache.delete('cached-server')
    const result3 = await discover(mockConn)
    expect(result3).toHaveLength(1)
    expect(mockConn.client.request).toHaveBeenCalledTimes(2)
  })
})
