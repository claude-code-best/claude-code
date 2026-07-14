import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleToolCall } from '../toolCalls'
import type { ClaudeForChromeContext, SocketClient } from '../types'

const originalScope = process.env.CLAUDE_CODE_BROWSER_SCOPE_ID
const originalDataDirectory = process.env.CLAUDE_CODE_SESSION_DATA_DIR
const originalStateDirectory = process.env.CLAUDE_CODE_BROWSER_STATE_DIR
const roots: string[] = []

afterEach(() => {
  if (originalScope === undefined)
    delete process.env.CLAUDE_CODE_BROWSER_SCOPE_ID
  else process.env.CLAUDE_CODE_BROWSER_SCOPE_ID = originalScope
  if (originalDataDirectory === undefined)
    delete process.env.CLAUDE_CODE_SESSION_DATA_DIR
  else process.env.CLAUDE_CODE_SESSION_DATA_DIR = originalDataDirectory
  if (originalStateDirectory === undefined)
    delete process.env.CLAUDE_CODE_BROWSER_STATE_DIR
  else process.env.CLAUDE_CODE_BROWSER_STATE_DIR = originalStateDirectory
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

describe('Chat browser tab ownership', () => {
  test('records only tabs created by the scoped Chat session', async () => {
    const root = mkdtempSync(join(tmpdir(), 'chat-browser-scope-'))
    roots.push(root)
    process.env.CLAUDE_CODE_BROWSER_SCOPE_ID = 'session-1'
    process.env.CLAUDE_CODE_SESSION_DATA_DIR = join(root, 'scratch')
    process.env.CLAUDE_CODE_BROWSER_STATE_DIR = join(root, 'bridge-state')

    const socketClient = {
      ensureConnected: async () => true,
      callTool: async (name: string) => ({
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                name === 'tabs_context_mcp'
                  ? { tabId: 9, title: 'Existing user tab' }
                  : { tabId: 41, title: 'Created tab' },
              ),
            },
          ],
        },
      }),
      isConnected: () => true,
      getTabOwnerIdentity: () => 'profile-test',
      disconnect: () => {},
      setNotificationHandler: () => {},
    } satisfies SocketClient
    const noop = () => {}
    const context = {
      serverName: 'test',
      logger: { info: noop, error: noop, warn: noop, debug: noop, silly: noop },
      socketPath: '/tmp/not-used',
      clientTypeId: 'claude-code',
      onAuthenticationError: noop,
      onToolCallDisconnected: () => 'offline',
    } satisfies ClaudeForChromeContext

    await handleToolCall(context, socketClient, 'tabs_create_mcp', {})

    expect(
      JSON.parse(
        readFileSync(
          join(root, 'bridge-state', 'browser-owned-tabs.json'),
          'utf8',
        ),
      ),
    ).toEqual({
      scopeId: 'session-1',
      tabs: [{ tabId: 41, ownerId: 'profile-test' }],
    })
    expect(existsSync(join(root, 'scratch', 'browser-owned-tabs.json'))).toBe(
      false,
    )
  })

  test('does not claim tab IDs returned by a failed create call', async () => {
    const root = mkdtempSync(join(tmpdir(), 'chat-browser-scope-'))
    roots.push(root)
    process.env.CLAUDE_CODE_BROWSER_SCOPE_ID = 'session-2'
    process.env.CLAUDE_CODE_SESSION_DATA_DIR = join(root, 'scratch')
    process.env.CLAUDE_CODE_BROWSER_STATE_DIR = join(root, 'bridge-state')

    const socketClient = {
      ensureConnected: async () => true,
      callTool: async () => ({
        error: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ tabId: 7, message: 'creation failed' }),
            },
          ],
        },
      }),
      isConnected: () => true,
      getTabOwnerIdentity: () => 'profile-test',
      disconnect: () => {},
      setNotificationHandler: () => {},
    } satisfies SocketClient
    const noop = () => {}
    const context = {
      serverName: 'test',
      logger: { info: noop, error: noop, warn: noop, debug: noop, silly: noop },
      socketPath: '/tmp/not-used',
      clientTypeId: 'claude-code',
      onAuthenticationError: noop,
      onToolCallDisconnected: () => 'offline',
    } satisfies ClaudeForChromeContext

    await handleToolCall(context, socketClient, 'tabs_create_mcp', {})

    expect(
      existsSync(join(root, 'bridge-state', 'browser-owned-tabs.json')),
    ).toBe(false)
  })

  test('does not claim existing tabs when the before-snapshot has an empty error', async () => {
    const root = mkdtempSync(join(tmpdir(), 'chat-browser-scope-'))
    roots.push(root)
    process.env.CLAUDE_CODE_BROWSER_SCOPE_ID = 'session-snapshot-error'
    process.env.CLAUDE_CODE_SESSION_DATA_DIR = join(root, 'scratch')
    process.env.CLAUDE_CODE_BROWSER_STATE_DIR = join(root, 'bridge-state')

    let calls = 0
    const socketClient = {
      ensureConnected: async () => true,
      callTool: async () => {
        calls += 1
        return calls === 1
          ? { error: '' }
          : {
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      tabId: 9,
                      title: 'Existing user tab',
                    }),
                  },
                ],
              },
            }
      },
      isConnected: () => true,
      getTabOwnerIdentity: () => 'profile-test',
      disconnect: () => {},
      setNotificationHandler: () => {},
    } satisfies SocketClient
    const noop = () => {}
    const context = {
      serverName: 'test',
      logger: { info: noop, error: noop, warn: noop, debug: noop, silly: noop },
      socketPath: '/tmp/not-used',
      clientTypeId: 'claude-code',
      onAuthenticationError: noop,
      onToolCallDisconnected: () => 'offline',
    } satisfies ClaudeForChromeContext

    await handleToolCall(context, socketClient, 'tabs_create_mcp', {})

    expect(
      existsSync(join(root, 'bridge-state', 'browser-owned-tabs.json')),
    ).toBe(false)
  })

  test('claims the tab created when an empty scoped context is initialized', async () => {
    const root = mkdtempSync(join(tmpdir(), 'chat-browser-scope-'))
    roots.push(root)
    process.env.CLAUDE_CODE_BROWSER_SCOPE_ID = 'session-3'
    process.env.CLAUDE_CODE_SESSION_DATA_DIR = join(root, 'scratch')
    process.env.CLAUDE_CODE_BROWSER_STATE_DIR = join(root, 'bridge-state')

    let contextCalls = 0
    const socketClient = {
      ensureConnected: async () => true,
      callTool: async (name: string) => {
        if (name !== 'tabs_context_mcp') return null
        contextCalls += 1
        return contextCalls === 1
          ? { result: { content: [] } }
          : {
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ tabId: 55, title: 'New group' }),
                  },
                ],
              },
            }
      },
      isConnected: () => true,
      getTabOwnerIdentity: () => 'profile-test',
      disconnect: () => {},
      setNotificationHandler: () => {},
    } satisfies SocketClient
    const noop = () => {}
    const context = {
      serverName: 'test',
      logger: { info: noop, error: noop, warn: noop, debug: noop, silly: noop },
      socketPath: '/tmp/not-used',
      clientTypeId: 'claude-code',
      onAuthenticationError: noop,
      onToolCallDisconnected: () => 'offline',
    } satisfies ClaudeForChromeContext

    await handleToolCall(context, socketClient, 'tabs_context_mcp', {
      createIfEmpty: true,
    })

    expect(
      JSON.parse(
        readFileSync(
          join(root, 'bridge-state', 'browser-owned-tabs.json'),
          'utf8',
        ),
      ),
    ).toEqual({
      scopeId: 'session-3',
      tabs: [{ tabId: 55, ownerId: 'profile-test' }],
    })
  })
})
