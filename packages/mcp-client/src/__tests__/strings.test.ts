import { describe, expect, test } from 'bun:test'
import {
  buildMcpToolName,
  normalizeNameForMCP,
  mcpInfoFromString,
  getMcpPrefix,
  getToolNameForPermissionCheck,
  getMcpDisplayName,
  extractMcpToolDisplayName,
} from '../strings.js'

describe('normalizeNameForMCP', () => {
  test('keeps valid names unchanged', () => {
    expect(normalizeNameForMCP('my-server')).toBe('my-server')
    expect(normalizeNameForMCP('my_server')).toBe('my_server')
    expect(normalizeNameForMCP('server123')).toBe('server123')
  })

  test('replaces dots and spaces with underscores', () => {
    expect(normalizeNameForMCP('test.server')).toBe('test_server')
    expect(normalizeNameForMCP('test server')).toBe('test_server')
  })

  test('collapses underscores for claude.ai prefix', () => {
    expect(normalizeNameForMCP('claude.ai Slack')).toBe('claude_ai_Slack')
    expect(normalizeNameForMCP('claude.ai My Server')).toBe(
      'claude_ai_My_Server',
    )
  })
})

describe('buildMcpToolName', () => {
  test('builds fully qualified name', () => {
    expect(buildMcpToolName('my-server', 'query')).toBe('mcp__my-server__query')
  })

  test('normalizes server name with dots', () => {
    expect(buildMcpToolName('test.server', 'tool')).toBe(
      'mcp__test_server__tool',
    )
  })
})

describe('mcpInfoFromString', () => {
  test('parses valid MCP tool name', () => {
    const info = mcpInfoFromString('mcp__my-server__query')
    expect(info).toEqual({ serverName: 'my-server', toolName: 'query' })
  })

  test('returns null for non-MCP names', () => {
    expect(mcpInfoFromString('bash')).toBeNull()
    expect(mcpInfoFromString('mcp__')).toBeNull()
    expect(mcpInfoFromString('')).toBeNull()
  })

  test('handles tool names with double underscores', () => {
    const info = mcpInfoFromString('mcp__server__tool__part')
    expect(info).toEqual({ serverName: 'server', toolName: 'tool__part' })
  })

  test('handles server-only (no tool name)', () => {
    const info = mcpInfoFromString('mcp__server')
    expect(info).toEqual({ serverName: 'server', toolName: undefined })
  })
})

describe('getMcpPrefix', () => {
  test('returns correct prefix', () => {
    expect(getMcpPrefix('my-server')).toBe('mcp__my-server__')
  })
})

describe('getToolNameForPermissionCheck', () => {
  test('uses mcp prefix for MCP tools', () => {
    expect(
      getToolNameForPermissionCheck({
        name: 'query',
        mcpInfo: { serverName: 'my-server', toolName: 'query' },
      }),
    ).toBe('mcp__my-server__query')
  })

  test('uses raw name for non-MCP tools', () => {
    expect(getToolNameForPermissionCheck({ name: 'bash' })).toBe('bash')
  })
})

describe('getMcpDisplayName', () => {
  test('strips MCP prefix', () => {
    // getMcpDisplayName normalizes server name before building prefix
    expect(getMcpDisplayName('mcp__my_server__query', 'my.server')).toBe(
      'query',
    )
  })
})

describe('extractMcpToolDisplayName', () => {
  test('removes MCP suffix', () => {
    expect(extractMcpToolDisplayName('github - Add comment (MCP)')).toBe(
      'Add comment',
    )
  })

  test('handles no dash', () => {
    expect(extractMcpToolDisplayName('Add comment (MCP)')).toBe('Add comment')
  })

  test('handles no suffix', () => {
    expect(extractMcpToolDisplayName('github - Add comment')).toBe(
      'Add comment',
    )
  })
})
