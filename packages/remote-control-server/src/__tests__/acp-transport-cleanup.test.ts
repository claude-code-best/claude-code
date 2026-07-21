import { beforeEach, describe, expect, mock, test } from 'bun:test'

const mockConfig = {
  port: 3000,
  host: '0.0.0.0',
  apiKeys: ['test-api-key'],
  baseUrl: 'http://localhost:3000',
  pollTimeout: 8,
  heartbeatInterval: 20,
  jwtExpiresIn: 3600,
  disconnectTimeout: 300,
  webCorsOrigins: [],
  wsIdleTimeout: 30,
  wsKeepaliveInterval: 20,
}

mock.module('../config', () => ({
  config: mockConfig,
  getBaseUrl: () => 'http://localhost:3000',
}))

import { Hono } from 'hono'
import type { WSContext } from 'hono/ws'
import { storeReset } from '../store'
import { createAcpSSEStream } from '../transport/acp-sse-writer'
import {
  closeAllAcpConnections,
  handleAcpWsClose,
  handleAcpWsMessage,
  handleAcpWsOpen,
} from '../transport/acp-ws-handler'
import {
  closeAllRelayConnections,
  handleRelayClose,
  handleRelayOpen,
} from '../transport/acp-relay-handler'
import { getAllAcpEventBuses, removeAcpEventBus } from '../transport/event-bus'

function createMockWs() {
  let readyState = 1
  const sent: string[] = []
  const ws = {
    get readyState() {
      return readyState
    },
    send(message: string) {
      sent.push(message)
    },
    close() {
      readyState = 3
    },
  } as unknown as WSContext
  return { ws, sent }
}

describe('ACP transport cleanup', () => {
  beforeEach(() => {
    closeAllRelayConnections()
    closeAllAcpConnections()
    storeReset()
    for (const [channelGroupId] of getAllAcpEventBuses()) {
      removeAcpEventBus(channelGroupId)
    }
  })

  test('cancelling an ACP SSE stream releases its idle channel bus', async () => {
    const app = new Hono()
    app.get('/stream/:id', c => createAcpSSEStream(c, c.req.param('id')))

    const response = await app.request('/stream/group-sse')
    const reader = response.body!.getReader()
    await reader.read()
    expect(getAllAcpEventBuses().has('group-sse')).toBe(true)

    await reader.cancel()
    await Promise.resolve()
    expect(getAllAcpEventBuses().has('group-sse')).toBe(false)
  })

  test('agent and relay closes release the bus after the final subscriber leaves', () => {
    const agent = createMockWs()
    handleAcpWsOpen(agent.ws, 'agent-ws')
    handleAcpWsMessage(
      agent.ws,
      'agent-ws',
      `${JSON.stringify({
        type: 'register',
        agent_name: 'cleanup-agent',
        channel_group_id: 'group-relay',
      })}\n`,
    )
    const registered = JSON.parse(agent.sent.at(-1)!) as { agent_id: string }

    const relay = createMockWs()
    handleRelayOpen(relay.ws, 'relay-ws', registered.agent_id)
    expect(getAllAcpEventBuses().get('group-relay')?.subscriberCount()).toBe(2)

    handleAcpWsClose(agent.ws, 'agent-ws', 1000, 'done')
    expect(getAllAcpEventBuses().has('group-relay')).toBe(true)

    handleRelayClose(relay.ws, 'relay-ws', 1000, 'done')
    expect(getAllAcpEventBuses().has('group-relay')).toBe(false)
  })
})
