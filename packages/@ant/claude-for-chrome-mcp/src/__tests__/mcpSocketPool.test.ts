import { describe, expect, test } from 'bun:test'
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createMcpSocketClient,
  getSocketPathIncarnation,
  type McpSocketClient,
} from '../mcpSocketClient.js'
import { McpSocketPool } from '../mcpSocketPool.js'
import { BridgeClient } from '../bridgeClient.js'
import type { ClaudeForChromeContext } from '../types.js'

const noop = () => {}

function context(): ClaudeForChromeContext {
  return {
    serverName: 'test',
    logger: { info: noop, error: noop, warn: noop, debug: noop, silly: noop },
    socketPath: '/tmp/not-used',
    clientTypeId: 'claude-code',
    onAuthenticationError: noop,
    onToolCallDisconnected: () => 'offline',
  }
}

function connectedClient(
  callTool: McpSocketClient['callTool'],
  ownerId?: string,
): McpSocketClient {
  return {
    isConnected: () => true,
    callTool,
    getTabOwnerIdentity: () => ownerId ?? null,
  } as unknown as McpSocketClient
}

describe('McpSocketPool multi-profile snapshots', () => {
  test('native owner identity stays bound to its connected socket incarnation', () => {
    const root = mkdtempSync(join(tmpdir(), 'browser-owner-incarnation-'))
    const socketPath = join(root, 'legacy.sock')
    const replacementPath = join(root, 'replacement.sock')
    try {
      writeFileSync(socketPath, 'first incarnation')
      writeFileSync(replacementPath, 'second incarnation')
      const firstClient = createMcpSocketClient({
        ...context(),
        socketPath,
      })
      const firstOwner = getSocketPathIncarnation(socketPath)
      const firstClientState = firstClient as unknown as {
        connected: boolean
        socketOwnerIdentity: string | null
      }
      firstClientState.connected = true
      firstClientState.socketOwnerIdentity = firstOwner

      renameSync(replacementPath, socketPath)
      const secondOwner = getSocketPathIncarnation(socketPath)
      const secondClient = createMcpSocketClient({
        ...context(),
        socketPath,
      })
      const secondClientState = secondClient as unknown as {
        connected: boolean
        socketOwnerIdentity: string | null
      }
      secondClientState.connected = true
      secondClientState.socketOwnerIdentity = secondOwner

      expect(firstOwner).not.toBeNull()
      expect(secondOwner).not.toBe(firstOwner)
      expect(firstClient.getTabOwnerIdentity(41)).toBe(firstOwner)
      expect(secondClient.getTabOwnerIdentity(41)).toBe(secondOwner)

      firstClientState.connected = false
      expect(firstClient.getTabOwnerIdentity(41)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('bridge owner identity changes with the browser connection incarnation', () => {
    const client = new BridgeClient(context())
    const selectExtension = (
      client as unknown as {
        selectExtension: (deviceId: string, connectedAt?: number) => void
      }
    ).selectExtension.bind(client)

    selectExtension('device-stable', 100)
    expect(client.getTabOwnerIdentity(41)).toBe('bridge:device-stable:100')
    selectExtension('device-stable', 200)
    expect(client.getTabOwnerIdentity(41)).toBe('bridge:device-stable:200')
    selectExtension('device-stable')
    expect(client.getTabOwnerIdentity(41)).toBeNull()
  })

  test('fails closed when any connected profile snapshot is incomplete', async () => {
    const pool = new McpSocketPool(context())
    const clients = (
      pool as unknown as { clients: Map<string, McpSocketClient> }
    ).clients
    clients.set(
      'profile-a',
      connectedClient(async () => ({
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                availableTabs: [
                  { tabId: 9, title: 'Existing', url: 'about:blank' },
                ],
              }),
            },
          ],
        },
      })),
    )
    clients.set(
      'profile-b',
      connectedClient(async () => {
        throw new Error('profile snapshot unavailable')
      }),
    )

    const response = await pool.callTool('tabs_context_mcp', {
      createIfEmpty: false,
    })

    expect(response).toHaveProperty('error')
  })

  test('fails closed when one profile returns a tool-level error', async () => {
    const pool = new McpSocketPool(context())
    const clients = (
      pool as unknown as { clients: Map<string, McpSocketClient> }
    ).clients
    clients.set(
      'profile-a',
      connectedClient(async () => ({ result: { content: [] } })),
    )
    clients.set(
      'profile-b',
      connectedClient(async () => ({ error: '' })),
    )

    const response = await pool.callTool('tabs_context_mcp', {
      createIfEmpty: false,
    })

    expect(response).toHaveProperty('error')
  })

  test('rejects ambiguous tab IDs instead of routing across profiles', async () => {
    const pool = new McpSocketPool(context())
    const clients = (
      pool as unknown as { clients: Map<string, McpSocketClient> }
    ).clients
    const tab = {
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              availableTabs: [
                { tabId: 41, title: 'Profile tab', url: 'about:blank' },
              ],
            }),
          },
        ],
      },
    }
    clients.set(
      'profile-a',
      connectedClient(async () => tab),
    )
    clients.set(
      'profile-b',
      connectedClient(async () => tab),
    )

    const response = await pool.callTool('tabs_context_mcp', {
      createIfEmpty: false,
    })

    expect(response).toHaveProperty('error')
  })

  test('rebuilds the route before sending a tab command to its profile', async () => {
    const pool = new McpSocketPool(context())
    const clients = (
      pool as unknown as { clients: Map<string, McpSocketClient> }
    ).clients
    const calls: string[] = []
    const profileClient = (profile: string, tabId: number) =>
      connectedClient(async name => {
        calls.push(`${profile}:${name}`)
        return name === 'tabs_context_mcp'
          ? {
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      availableTabs: [
                        { tabId, title: profile, url: 'about:blank' },
                      ],
                    }),
                  },
                ],
              },
            }
          : { result: { content: [] } }
      }, profile)
    clients.set('profile-a', profileClient('profile-a', 11))
    clients.set('profile-b', profileClient('profile-b', 41))

    await pool.callTool('tabs_context_mcp', { createIfEmpty: false })
    expect(pool.getTabOwnerIdentity(41)).toBe('profile-b')
    await pool.callTool('javascript_tool', { tabId: 41 })

    expect(calls).toEqual([
      'profile-a:tabs_context_mcp',
      'profile-b:tabs_context_mcp',
      'profile-b:javascript_tool',
    ])
  })

  test('never falls back when the routed profile disconnects after the snapshot', async () => {
    const pool = new McpSocketPool(context())
    const clients = (
      pool as unknown as { clients: Map<string, McpSocketClient> }
    ).clients
    let profileAConnected = true
    const profileACalls: string[] = []
    const profileBCalls: string[] = []
    clients.set('profile-a', {
      isConnected: () => profileAConnected,
      callTool: async (name: string) => {
        profileACalls.push(name)
        return {
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ availableTabs: [{ tabId: 41 }] }),
              },
            ],
          },
        }
      },
    } as unknown as McpSocketClient)
    clients.set('profile-b', {
      isConnected: () => true,
      callTool: async (name: string) => {
        profileBCalls.push(name)
        return {
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ availableTabs: [{ tabId: 11 }] }),
              },
            ],
          },
        }
      },
    } as unknown as McpSocketClient)

    await pool.callTool('tabs_context_mcp', { createIfEmpty: false })
    profileAConnected = false

    await expect(
      pool.callTool('javascript_tool', { tabId: 41 }),
    ).rejects.toThrow(/profile.*unavailable/i)
    expect(profileACalls).toEqual(['tabs_context_mcp'])
    expect(profileBCalls).toEqual(['tabs_context_mcp'])
  })

  test('records the owner route from a single-tab create response', async () => {
    const pool = new McpSocketPool(context())
    const clients = (
      pool as unknown as { clients: Map<string, McpSocketClient> }
    ).clients
    clients.set(
      'profile-a',
      connectedClient(
        async () => ({
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ tabId: 41, title: 'Created tab' }),
              },
            ],
          },
        }),
        'profile-a',
      ),
    )
    clients.set(
      'profile-b',
      connectedClient(async () => ({ result: { content: [] } })),
    )

    await pool.callTool('tabs_create_mcp', {})

    expect(pool.getTabOwnerIdentity(41)).toBe('profile-a')
  })
})
