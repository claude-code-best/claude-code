import { describe, expect, test, mock } from 'bun:test'
import { callMcpTool } from '../execution.js'
import type { ConnectedMCPServer } from '../types.js'
import type { McpClientDependencies } from '../interfaces.js'
import { McpAuthError, McpToolCallError } from '../errors.js'

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

describe('callMcpTool', () => {
  test('calls tool and returns result', async () => {
    const mockResult = {
      content: [{ type: 'text', text: 'result data' }],
      _meta: { requestId: '123' },
    }

    const mockConn = {
      name: 'test-server',
      client: {
        callTool: mock(() => Promise.resolve(mockResult)),
      },
      type: 'connected' as const,
    } as unknown as ConnectedMCPServer

    const result = await callMcpTool(
      {
        client: mockConn,
        tool: 'search',
        args: { query: 'test' },
        signal: new AbortController().signal,
      },
      createMockDeps(),
    )

    expect(result.content).toBeDefined()
  })

  test('throws McpToolCallError when result has isError=true', async () => {
    const mockResult = {
      isError: true,
      content: [{ type: 'text', text: 'Something went wrong' }],
    }

    const mockConn = {
      name: 'test-server',
      client: {
        callTool: mock(() => Promise.resolve(mockResult)),
      },
      type: 'connected' as const,
    } as unknown as ConnectedMCPServer

    await expect(
      callMcpTool(
        {
          client: mockConn,
          tool: 'fail-tool',
          args: {},
          signal: new AbortController().signal,
        },
        createMockDeps(),
      ),
    ).rejects.toThrow()

    try {
      await callMcpTool(
        {
          client: mockConn,
          tool: 'fail-tool',
          args: {},
          signal: new AbortController().signal,
        },
        createMockDeps(),
      )
    } catch (e) {
      expect(e).toBeInstanceOf(McpToolCallError)
      expect((e as McpToolCallError).serverName).toBe('test-server')
      expect((e as McpToolCallError).toolName).toBe('fail-tool')
    }
  })

  test('throws McpAuthError on 401 response', async () => {
    const error = new Error('Unauthorized')
    Object.assign(error, { code: 401 })

    const mockConn = {
      name: 'auth-server',
      client: {
        callTool: mock(() => Promise.reject(error)),
      },
      type: 'connected' as const,
    } as unknown as ConnectedMCPServer

    await expect(
      callMcpTool(
        {
          client: mockConn,
          tool: 'protected-tool',
          args: {},
          signal: new AbortController().signal,
        },
        createMockDeps(),
      ),
    ).rejects.toThrow(McpAuthError)
  })

  test('passes metadata to the client', async () => {
    const mockResult = { content: [{ type: 'text', text: 'ok' }] }
    const callToolMock = mock(() => Promise.resolve(mockResult))

    const mockConn = {
      name: 'test-server',
      client: {
        callTool: callToolMock,
      },
      type: 'connected' as const,
    } as unknown as ConnectedMCPServer

    await callMcpTool(
      {
        client: mockConn,
        tool: 'my-tool',
        args: { key: 'value' },
        meta: { 'custom-key': 'custom-value' },
        signal: new AbortController().signal,
      },
      createMockDeps(),
    )

    expect(callToolMock).toHaveBeenCalled()
    const callArgs = callToolMock.mock.calls[0] as any[]
    expect(callArgs[0]._meta).toEqual({ 'custom-key': 'custom-value' })
  })
})
