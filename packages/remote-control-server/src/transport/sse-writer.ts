import { log, error as logError } from '../logger'
import type { Context } from 'hono'
import type { SessionEvent } from './event-bus'
import { getEventBus } from './event-bus'
import { toClientPayload } from './client-payload'

export interface SSEWriter {
  send(event: SessionEvent): void
  close(): void
}

export function createSSEWriter(c: Context): SSEWriter {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      c.req.raw.signal.addEventListener('abort', () => {
        controller.close()
      })

      // Store encoder and controller for later use
      ;(c as any)._sseEncoder = encoder
      ;(c as any)._sseController = controller
    },
  })

  return {
    send(event: SessionEvent) {
      const encoder = (c as any)._sseEncoder as TextEncoder
      const controller = (c as any)
        ._sseController as ReadableStreamDefaultController
      if (!encoder || !controller) return
      const data = JSON.stringify({
        type: event.type,
        payload: event.payload,
        direction: event.direction,
        seqNum: event.seqNum,
      })
      const msg = `id: ${event.seqNum}\nevent: message\ndata: ${data}\n\n`
      controller.enqueue(encoder.encode(msg))
    },
    close() {
      const controller = (c as any)
        ._sseController as ReadableStreamDefaultController
      controller?.close()
    },
  }
}

/** Create SSE response stream for a session */
export function createSSEStream(c: Context, sessionId: string, fromSeqNum = 0) {
  const bus = getEventBus(sessionId)

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      // Send historical events if reconnecting
      if (fromSeqNum > 0) {
        const missed = bus.getEventsSince(fromSeqNum)
        for (const event of missed) {
          const data = JSON.stringify({
            type: event.type,
            payload: event.payload,
            direction: event.direction,
            seqNum: event.seqNum,
          })
          controller.enqueue(
            encoder.encode(
              `id: ${event.seqNum}\nevent: message\ndata: ${data}\n\n`,
            ),
          )
        }
      }

      // Send initial keepalive
      controller.enqueue(encoder.encode(': keepalive\n\n'))

      // Subscribe to new events
      const unsub = bus.subscribe(event => {
        const data = JSON.stringify({
          type: event.type,
          payload: event.payload,
          direction: event.direction,
          seqNum: event.seqNum,
        })
        try {
          log(
            `[RC-DEBUG] SSE -> web: sessionId=${sessionId} type=${event.type} dir=${event.direction} seq=${event.seqNum}`,
          )
          controller.enqueue(
            encoder.encode(
              `id: ${event.seqNum}\nevent: message\ndata: ${data}\n\n`,
            ),
          )
        } catch {
          unsub()
        }
      })

      // Keepalive interval
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          clearInterval(keepalive)
          unsub()
        }
      }, 15000)

      // Cleanup on abort
      c.req.raw.signal.addEventListener('abort', () => {
        unsub()
        clearInterval(keepalive)
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function toWorkerClientPayload(event: SessionEvent): Record<string, unknown> {
  if (
    event.type === 'permission_response' ||
    event.type === 'control_response' ||
    event.type === 'control_request' ||
    event.type === 'interrupt'
  ) {
    return toClientPayload(event)
  }

  const normalized =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : undefined
  const raw =
    normalized?.raw &&
    typeof normalized.raw === 'object' &&
    !Array.isArray(normalized.raw)
      ? (normalized.raw as Record<string, unknown>)
      : undefined
  const payload: Record<string, unknown> = {
    ...(raw ?? normalized ?? {}),
    type: event.type,
  }

  if (event.type === 'user') {
    const message = payload.message
    if (!message || typeof message !== 'object' || !('content' in message)) {
      const content =
        typeof normalized?.content === 'string'
          ? normalized.content
          : typeof payload.content === 'string'
            ? payload.content
            : typeof event.payload === 'string'
              ? event.payload
              : ''
      payload.content = content
      payload.message = { content }
    }
  }

  return payload
}

function toWorkerClientFrame(event: SessionEvent): string {
  const data = JSON.stringify({
    event_id: event.id,
    sequence_num: event.seqNum,
    event_type: event.type,
    source: 'client',
    payload: toWorkerClientPayload(event),
    created_at: new Date(event.createdAt).toISOString(),
  })
  return `id: ${event.seqNum}\nevent: client_event\ndata: ${data}\n\n`
}

/** Create CCR worker SSE stream (client_event frames, outbound events only). */
export function createWorkerEventStream(
  c: Context,
  sessionId: string,
  fromSeqNum = 0,
) {
  const bus = getEventBus(sessionId)

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      if (fromSeqNum > 0) {
        const missed = bus
          .getEventsSince(fromSeqNum)
          .filter(event => event.direction === 'outbound')
        for (const event of missed) {
          controller.enqueue(encoder.encode(toWorkerClientFrame(event)))
        }
      }

      controller.enqueue(encoder.encode(': keepalive\n\n'))

      const unsub = bus.subscribe(event => {
        if (event.direction !== 'outbound') {
          return
        }
        try {
          controller.enqueue(encoder.encode(toWorkerClientFrame(event)))
        } catch {
          unsub()
        }
      })

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          clearInterval(keepalive)
          unsub()
        }
      }, 15000)

      c.req.raw.signal.addEventListener('abort', () => {
        unsub()
        clearInterval(keepalive)
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
