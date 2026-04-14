import { describe, expect, test } from 'bun:test'
import {
  McpError,
  McpConnectionError,
  McpAuthError,
  McpTimeoutError,
  McpToolCallError,
  McpSessionExpiredError,
} from '../errors.js'

describe('McpError', () => {
  test('has correct properties', () => {
    const err = new McpError('test message', 'my-server', 'TEST_CODE')
    expect(err.message).toBe('test message')
    expect(err.serverName).toBe('my-server')
    expect(err.code).toBe('TEST_CODE')
    expect(err.name).toBe('McpError')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('McpConnectionError', () => {
  test('inherits from McpError', () => {
    const cause = new Error('ECONNREFUSED')
    const err = new McpConnectionError('my-server', 'Connection failed', cause)
    expect(err).toBeInstanceOf(McpError)
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('CONNECTION_FAILED')
    expect(err.serverName).toBe('my-server')
    expect(err.cause).toBe(cause)
  })

  test('works without cause', () => {
    const err = new McpConnectionError('my-server', 'Failed')
    expect(err.cause).toBeUndefined()
  })
})

describe('McpAuthError', () => {
  test('has AUTH_REQUIRED code', () => {
    const err = new McpAuthError('my-server', 'Auth needed')
    expect(err.code).toBe('AUTH_REQUIRED')
    expect(err).toBeInstanceOf(McpError)
  })
})

describe('McpTimeoutError', () => {
  test('has timeout info in message', () => {
    const err = new McpTimeoutError('my-server', 5000)
    expect(err.code).toBe('TIMEOUT')
    expect(err.timeoutMs).toBe(5000)
    expect(err.message).toContain('5000')
  })
})

describe('McpToolCallError', () => {
  test('has tool name', () => {
    const err = new McpToolCallError('my-server', 'query', 'Tool failed')
    expect(err.code).toBe('TOOL_CALL_FAILED')
    expect(err.toolName).toBe('query')
  })
})

describe('McpSessionExpiredError', () => {
  test('has SESSION_EXPIRED code', () => {
    const err = new McpSessionExpiredError('my-server')
    expect(err.code).toBe('SESSION_EXPIRED')
  })
})
