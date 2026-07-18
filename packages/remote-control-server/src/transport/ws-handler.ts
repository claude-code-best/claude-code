import type { WSContext } from 'hono/ws'
import { randomUUID } from 'node:crypto'
import {
  getEventBus,
  projectSessionEvent,
  removeIdleEventBus,
} from './event-bus'
import type { SessionEvent } from './event-bus'
import { publishSessionEvent } from '../services/transport'
import { markSessionWorkerAlive } from '../services/session'
import { log, error as logError } from '../logger'
import { toClientPayload } from './client-payload'
import { config } from '../config'
import { getPersistence } from '../persistence/runtime'
import { publishWebLiveEvent } from './live-events'
import {
  registerWorkerLiveChannel,
  type WorkerLiveCommand,
} from './live-events'
import { storeGetSession } from '../store'

// Per-connection cleanup, keyed by sessionId (only one WS per session)
interface CleanupEntry {
  unsub: () => void
  unregisterLive: () => void
  keepalive: ReturnType<typeof setInterval>
  ws: WSContext
  openTime: number
  lastClientActivity: number
  lastLivenessTouch: number
}

// Inbound WS frames (events and keep_alives alike) prove the worker is
// alive, but a busy terminal can emit dozens of frames per second — only
// refresh the store's liveness clock at this cadence.
const LIVENESS_TOUCH_INTERVAL_MS = 15_000
const cleanupBySession = new Map<string, CleanupEntry>()

// Track all active WS connections for graceful shutdown
const activeConnections = new Set<WSContext>()

// Server-side keepalive interval (configurable via RCS_WS_KEEPALIVE_INTERVAL).
// Sends data frames to keep reverse proxies from closing idle connections.
const SERVER_KEEPALIVE_INTERVAL_MS = (config.wsKeepaliveInterval || 20) * 1000

// If no client data received within this threshold, the connection is
// considered dead. Set to 3x keepalive to tolerate one missed interval.
const CLIENT_ACTIVITY_TIMEOUT_MS = SERVER_KEEPALIVE_INTERVAL_MS * 3
const LEGACY_LIVE_TERMINAL_TYPES = new Set([
  'terminal_output',
  'terminal_state',
  'terminal_snapshot',
])

/**
 * Convert internal EventBus event -> SDK message for bridge client.
 */
function toSDKMessage(event: SessionEvent): string {
  // NDJSON format: each message MUST end with \n so the child process's
  // line-based parser can split messages correctly.
  return JSON.stringify(toClientPayload(event)) + '\n'
}

/** Called from onOpen — subscribes to event bus, forwards outbound events to bridge WS */
export function handleWebSocketOpen(ws: WSContext, sessionId: string) {
  const openTime = Date.now()
  log(`[RC-DEBUG] [WS] Open session=${sessionId}`)
  activeConnections.add(ws)

  // If there's an existing connection for this session, clean it up first
  const existing = cleanupBySession.get(sessionId)
  if (existing) {
    log(`[WS] Replacing existing connection for session=${sessionId}`)
    existing.unsub()
    clearInterval(existing.keepalive)
    activeConnections.delete(existing.ws)
  }

  const bus = getEventBus(sessionId)
  const pendingLive = new Map<number, SessionEvent>()
  let catchingUp = true
  let highWater = 0

  const sendOutbound = (event: SessionEvent) => {
    if (event.seqNum <= highWater) return
    highWater = event.seqNum
    if (ws.readyState !== 1) return
    if (event.direction !== 'outbound') return
    // Interrupt is a live side effect. Defensively ignore historical rows or
    // direct EventBus publications so reconnect replay cannot execute it.
    if (event.type === 'interrupt') return
    try {
      const sdkMsg = toSDKMessage(event)
      log(
        `[RC-DEBUG] [WS] -> bridge (outbound): type=${event.type} len=${sdkMsg.length} msg=${sdkMsg.slice(0, 300)}`,
      )
      ws.send(sdkMsg)
    } catch (err) {
      logError('[RC-DEBUG] [WS] send error:', err)
    }
  }

  const unsub = bus.subscribe((event: SessionEvent) => {
    if (catchingUp) {
      pendingLive.set(event.seqNum, event)
      return
    }
    sendOutbound(event)
  })

  const persistence = getPersistence()
  const snapshotTail = persistence.getLastSeq(sessionId)
  // Replay the newest durable rows that actually exist. Anchoring on
  // `last_seq - N` arithmetic breaks once retention pruning or migrations
  // leave seq gaps: the window can land on a fully pruned range and replay
  // nothing, losing user prompts sent while the bridge was offline.
  const replay = persistence.listEventsTail(sessionId, 256).events
  if (replay.length > 0) {
    log(`[WS] Replaying up to ${replay.length} recent durable event(s)`)
    for (const row of replay) {
      if (row.seqNum > snapshotTail) break
      sendOutbound(projectSessionEvent(row))
    }
  } else {
    highWater = snapshotTail
  }
  catchingUp = false
  for (const event of [...pendingLive.values()].sort(
    (left, right) => left.seqNum - right.seqNum,
  )) {
    sendOutbound(event)
  }

  const keepalive = setInterval(() => {
    if (ws.readyState !== 1) {
      clearInterval(keepalive)
      return
    }
    // Check if client is still alive — close if no data received for too long
    const lastClientActivity =
      cleanupBySession.get(sessionId)?.lastClientActivity ?? openTime
    const silenceMs = Date.now() - lastClientActivity
    if (silenceMs > CLIENT_ACTIVITY_TIMEOUT_MS) {
      log(
        `[WS] Client inactive for ${Math.round(silenceMs / 1000)}s on session=${sessionId}, closing dead connection`,
      )
      try {
        ws.close(1000, 'client inactive')
      } catch {
        clearInterval(keepalive)
      }
      return
    }
    try {
      ws.send('{"type":"keep_alive"}\n')
    } catch {
      clearInterval(keepalive)
    }
  }, SERVER_KEEPALIVE_INTERVAL_MS)

  const workerEpoch = storeGetSession(sessionId)?.workerEpoch ?? 0
  const sendLiveCommand = (command: WorkerLiveCommand): boolean => {
    if (ws.readyState !== 1) return false
    const message =
      command.type === 'interrupt'
        ? {
            type: 'control_request',
            request_id: command.commandId,
            request: { subtype: 'interrupt' },
          }
        : {
            ...command.payload,
            type: command.type,
            command_id: command.commandId,
            generation: command.generation,
          }
    try {
      ws.send(`${JSON.stringify(message)}\n`)
      log(
        `[RC-DEBUG] [WS] -> bridge live: type=${command.type} commandId=${command.commandId} chars=${command.type === 'terminal_input' && typeof command.payload.data === 'string' ? command.payload.data.length : 0}`,
      )
      return true
    } catch (err) {
      logError('[RC-DEBUG] [WS] live send error:', err)
      return false
    }
  }
  const unregisterLive = registerWorkerLiveChannel(
    sessionId,
    workerEpoch,
    sendLiveCommand,
    () => {
      if (ws.readyState !== 1) return
      try {
        ws.close(1000, 'worker connection replaced')
      } catch {
        // socket is already closing
      }
    },
  )

  cleanupBySession.set(sessionId, {
    unsub,
    unregisterLive,
    keepalive,
    ws,
    openTime,
    lastClientActivity: openTime,
    lastLivenessTouch: openTime,
  })
  markSessionWorkerAlive(sessionId)
}

/** True while a live bridge WS is attached for the session. */
export function hasActiveSessionConnection(sessionId: string): boolean {
  const entry = cleanupBySession.get(sessionId)
  return !!entry && entry.ws.readyState === 1
}

/**
 * Called from onMessage — bridge sends newline-delimited JSON.
 */
export function handleWebSocketMessage(
  ws: WSContext,
  sessionId: string,
  data: string,
) {
  // Track client activity for dead-connection detection
  const entry = cleanupBySession.get(sessionId)
  if (entry?.ws === ws) {
    entry.lastClientActivity = Date.now()
    if (
      entry.lastClientActivity - entry.lastLivenessTouch >=
      LIVENESS_TOUCH_INTERVAL_MS
    ) {
      entry.lastLivenessTouch = entry.lastClientActivity
      markSessionWorkerAlive(sessionId)
    }
  }
  const lines = data.split('\n').filter(l => l.trim())
  for (const line of lines) {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line) as Record<string, unknown>
    } catch (err) {
      logError('[WS] parse error:', err)
      continue
    }
    try {
      ingestBridgeMessage(sessionId, msg)
    } catch (err) {
      // A failure here means a conversation event was dropped — keep the
      // connection alive for the remaining lines, but say loudly what died.
      logError(
        `[WS] ingest failed (event dropped): session=${sessionId} type=${
          typeof msg.type === 'string' ? msg.type : 'unknown'
        }`,
        err,
      )
    }
  }
}

/** Called from onClose — unsubscribes from event bus */
export function handleWebSocketClose(
  ws: WSContext,
  sessionId: string,
  code?: number,
  reason?: string,
) {
  activeConnections.delete(ws)

  const entry = cleanupBySession.get(sessionId)
  const duration = entry ? Math.round((Date.now() - entry.openTime) / 1000) : -1

  log(
    `[WS] Close session=${sessionId} code=${code ?? 'none'} reason=${reason || '(none)'} duration=${duration}s`,
  )

  if (entry?.ws === ws) {
    entry.unsub()
    entry.unregisterLive()
    clearInterval(entry.keepalive)
    cleanupBySession.delete(sessionId)
    removeIdleEventBus(sessionId)
  }
}

/**
 * Derive event type from a child process message that may lack an explicit
 * `type` field. The child's --print --output-format stream-json mode sends:
 *   {"message":{"role":"user",...},"uuid":"..."}       → type "user"
 *   {"message":{"role":"assistant",...},"uuid":"..."}  → type "assistant"
 *   {"subtype":"success","uuid":"...","result":"..."}  → type "result"
 */
function deriveEventType(msg: Record<string, unknown>): string {
  if (msg.type && typeof msg.type === 'string') return msg.type

  // Child process stream-json format: message.role determines type
  const message = msg.message as Record<string, unknown> | undefined
  if (message && typeof message.role === 'string') {
    return message.role // "user", "assistant", "system"
  }

  // Result message
  if (msg.subtype || msg.result !== undefined) return 'result'

  // System/init message
  if (msg.session_id) return 'system'

  return 'unknown'
}

/**
 * Parse a single SDK message from bridge -> publish to EventBus as inbound.
 */
export function ingestBridgeMessage(
  sessionId: string,
  msg: Record<string, unknown>,
) {
  if (msg.type === 'keep_alive') return

  const eventType = deriveEventType(msg)
  const sourceEventId =
    typeof msg.uuid === 'string' && msg.uuid.length > 0 ? msg.uuid : undefined

  log(
    `[RC-DEBUG] [WS] <- bridge (inbound): sessionId=${sessionId} type=${eventType}${sourceEventId ? ` uuid=${sourceEventId}` : ''} chars=${eventType === 'terminal_output' && typeof msg.data === 'string' ? msg.data.length : 0}`,
  )

  if (eventType.startsWith('terminal_')) {
    if (LEGACY_LIVE_TERMINAL_TYPES.has(eventType)) {
      publishWebLiveEvent({
        eventId: sourceEventId ?? randomUUID(),
        sessionId,
        type: eventType,
        payload: msg,
        createdAt: Date.now(),
      })
    } else {
      log(
        `[RC-DEBUG] [WS] dropped unsupported terminal event: sessionId=${sessionId} type=${eventType}`,
      )
    }
    return
  }

  let payload: unknown

  if (eventType === 'assistant' || eventType === 'partial_assistant') {
    const message = msg.message as Record<string, unknown> | undefined
    const content = message?.content
    // Extract text from content blocks for simple display
    let text = ''
    if (typeof content === 'string') {
      text = content
    } else if (Array.isArray(content)) {
      text = content
        .filter(
          (b: unknown) =>
            b &&
            typeof b === 'object' &&
            'type' in (b as Record<string, unknown>) &&
            (b as Record<string, unknown>).type === 'text',
        )
        .map(
          (b: Record<string, unknown>) =>
            (b as Record<string, unknown>).text || '',
        )
        .join('')
    }
    payload = { message: msg.message, uuid: msg.uuid, content: text }
  } else if (eventType === 'user') {
    payload = {
      message: msg.message,
      uuid: msg.uuid,
      ...(typeof msg.isSynthetic === 'boolean'
        ? { isSynthetic: msg.isSynthetic }
        : {}),
    }
  } else if (eventType === 'system') {
    // Keep every field — system/init carries session metadata (subtype, cwd,
    // model, permissionMode, slash_commands, agents, skills, output_style)
    // that the web UI renders in the session control bar. The v2 worker path
    // already preserves the full payload; mirror that here.
    payload = { ...msg }
  } else if (eventType === 'control_request') {
    payload = { request_id: msg.request_id, request: msg.request }
  } else if (eventType === 'control_response') {
    payload = { response: msg.response }
  } else if (eventType === 'result' || eventType === 'result_success') {
    payload = { subtype: msg.subtype, uuid: msg.uuid, result: msg.result }
  } else {
    payload = msg
  }

  publishSessionEvent(sessionId, eventType, payload, 'inbound', {
    producer: 'v1-ingress',
    sourceEventId,
  })
}

/**
 * Gracefully close all active WebSocket connections.
 */
export function closeAllConnections(): void {
  const count = activeConnections.size
  if (count === 0) return

  log(`[WS] Gracefully closing ${count} active connection(s)...`)
  for (const [sessionId, entry] of cleanupBySession) {
    try {
      entry.unsub()
      entry.unregisterLive()
      clearInterval(entry.keepalive)
      if (entry.ws.readyState === 1) {
        entry.ws.close(1001, 'server_shutdown')
      }
    } catch {
      // ignore errors during shutdown
    }
    removeIdleEventBus(sessionId)
  }
  cleanupBySession.clear()
  activeConnections.clear()
  log('[WS] All connections closed')
}
