import type { WSContext } from 'hono/ws'
import { findAcpConnectionByAgentId, sendToAgentWs } from './acp-ws-handler'
import { getAcpEventBus } from './event-bus'
import type { SessionEvent } from './event-bus'
import { log, error as logError } from '../logger'

// Per-relay connection state
interface RelayConnectionEntry {
  agentId: string
  unsub: (() => void) | null
  keepalive: ReturnType<typeof setInterval> | null
  ws: WSContext
  openTime: number
}

const relayConnections = new Map<string, RelayConnectionEntry>() // key: relayWsId

const RELAY_KEEPALIVE_INTERVAL_MS = 20_000

/** Send a JSON message to relay WS */
function sendToRelayWs(ws: WSContext, msg: object): void {
  if (ws.readyState !== 1) return
  try {
    ws.send(JSON.stringify(msg))
  } catch (err) {
    logError('[ACP-Relay] send error:', err)
  }
}

/** Called from onOpen — finds target agent and bridges connection */
export function handleRelayOpen(
  ws: WSContext,
  relayWsId: string,
  agentId: string,
): void {
  log(
    `[ACP-Relay] Relay connection opened: relayWsId=${relayWsId} agentId=${agentId}`,
  )

  // Check if agent is online
  const agentConn = findAcpConnectionByAgentId(agentId)
  if (!agentConn) {
    log(`[ACP-Relay] Agent ${agentId} not found or offline`)
    sendToRelayWs(ws, { type: 'error', message: 'Agent not found or offline' })
    ws.close(4004, 'agent not found')
    return
  }

  // Keepalive interval
  const keepalive = setInterval(() => {
    const entry = relayConnections.get(relayWsId)
    if (!entry || entry.ws.readyState !== 1) {
      clearInterval(keepalive)
      return
    }
    sendToRelayWs(entry.ws, { type: 'keep_alive' })
  }, RELAY_KEEPALIVE_INTERVAL_MS)

  // Subscribe to channel group EventBus — forward agent responses to frontend
  const channelGroupId = agentConn.channelGroupId
  const bus = getAcpEventBus(channelGroupId)
  const unsub = bus.subscribe((event: SessionEvent) => {
    if (ws.readyState !== 1) return
    if (event.direction !== 'inbound') return
    // Handle agent disconnect specially: send status to frontend
    if (event.type === 'agent_disconnect') {
      sendToRelayWs(ws, { type: 'status', payload: { connected: false } })
      return
    }
    // Forward agent responses to the frontend WebSocket
    sendToRelayWs(ws, event.payload as object)
  })

  relayConnections.set(relayWsId, {
    agentId,
    unsub,
    keepalive,
    ws,
    openTime: Date.now(),
  })

  // Don't send a synthetic status message here!
  // The frontend sends a "connect" command, which acp-link processes
  // and responds with a real status message including capabilities.
  // Sending a fake status would make the frontend think it's connected
  // before the agent process is actually ready.

  log(
    `[ACP-Relay] Relay established: relayWsId=${relayWsId} → agentId=${agentId}`,
  )
}

/** Called from onMessage — forwards frontend messages to acp-link */
export function handleRelayMessage(
  ws: WSContext,
  relayWsId: string,
  data: string,
): void {
  const entry = relayConnections.get(relayWsId)
  if (!entry) return

  const lines = data.split('\n').filter(l => l.trim())
  for (const line of lines) {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line)
    } catch {
      logError('[ACP-Relay] parse error:', line)
      continue
    }

    // Ignore keepalive responses
    if (msg.type === 'keep_alive') continue

    // Forward to acp-link agent
    const sent = sendToAgentWs(entry.agentId, msg)
    if (!sent) {
      sendToRelayWs(ws, { type: 'error', message: 'Agent connection lost' })
      return
    }
  }
}

/** Called from onClose — cleans up relay connection */
export function handleRelayClose(
  ws: WSContext,
  relayWsId: string,
  code?: number,
  reason?: string,
): void {
  const entry = relayConnections.get(relayWsId)
  if (!entry) return

  const duration = Math.round((Date.now() - entry.openTime) / 1000)
  log(
    `[ACP-Relay] Connection closed: relayWsId=${relayWsId} agentId=${entry.agentId} code=${code ?? 'none'} reason=${reason || '(none)'} duration=${duration}s`,
  )

  if (entry.unsub) {
    entry.unsub()
  }
  if (entry.keepalive) {
    clearInterval(entry.keepalive)
  }

  relayConnections.delete(relayWsId)
}

/** Close all relay connections (for graceful shutdown) */
export function closeAllRelayConnections(): void {
  if (relayConnections.size === 0) return

  log(`[ACP-Relay] Closing ${relayConnections.size} relay connection(s)...`)
  for (const [relayWsId, entry] of relayConnections) {
    try {
      if (entry.unsub) entry.unsub()
      if (entry.keepalive) clearInterval(entry.keepalive)
      if (entry.ws.readyState === 1) {
        entry.ws.close(1001, 'server_shutdown')
      }
    } catch {
      // ignore errors during shutdown
    }
  }
  relayConnections.clear()
  log('[ACP-Relay] All relay connections closed')
}
