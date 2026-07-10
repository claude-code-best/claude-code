import { log, error as logError } from '../logger'
import type { Context } from 'hono'
import type { SessionEvent } from './event-bus'
import {
  getEventBus,
  projectSessionEvent,
  removeIdleEventBus,
} from './event-bus'
import { toClientPayload } from './client-payload'
import { getPersistence } from '../persistence/runtime'

export interface SSEWriter {
  send(event: SessionEvent): void
  close(): void
}

function toWebEventFrame(event: SessionEvent): string {
  return `id: ${event.seqNum}\nevent: message\ndata: ${JSON.stringify(event)}\n\n`
}

export function createSSEWriter(c: Context): SSEWriter {
  let encoder: TextEncoder | undefined
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      encoder = new TextEncoder()
      controller = streamController
      c.req.raw.signal.addEventListener('abort', () => {
        if (closed) return
        closed = true
        try {
          streamController.close()
        } catch {
          // already closed
        }
      })
    },
  })
  void stream

  return {
    send(event: SessionEvent) {
      if (!encoder || !controller || closed) return
      controller.enqueue(encoder.encode(toWebEventFrame(event)))
    },
    close() {
      if (!controller || closed) return
      closed = true
      controller.close()
    },
  }
}

function createDurableSessionStream(
  c: Context,
  sessionId: string,
  fromSeqNum: number,
  shouldSend: (event: SessionEvent) => boolean,
  toFrame: (event: SessionEvent) => string,
) {
  const bus = getEventBus(sessionId)
  let cancelStream = () => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      const pendingLive = new Map<number, SessionEvent>()
      let catchingUp = true
      let highWater = fromSeqNum
      let cleaned = false
      let keepalive: ReturnType<typeof setInterval> | undefined
      let unsubscribe = () => {}

      const cleanup = (closeController: boolean) => {
        if (cleaned) return
        cleaned = true
        c.req.raw.signal.removeEventListener('abort', onAbort)
        unsubscribe()
        if (keepalive) clearInterval(keepalive)
        removeIdleEventBus(sessionId)
        if (closeController) {
          try {
            controller.close()
          } catch {
            // already closed
          }
        }
      }
      cancelStream = () => cleanup(false)

      const enqueue = (frame: string): boolean => {
        if (cleaned) return false
        try {
          controller.enqueue(encoder.encode(frame))
          return true
        } catch {
          cleanup(false)
          return false
        }
      }

      const emit = (event: SessionEvent) => {
        if (event.seqNum <= highWater) return
        highWater = event.seqNum
        if (!shouldSend(event)) return
        log(
          `[RC-DEBUG] SSE -> subscriber: sessionId=${sessionId} type=${event.type} dir=${event.direction} seq=${event.seqNum}`,
        )
        enqueue(toFrame(event))
      }

      unsubscribe = bus.subscribe(event => {
        if (catchingUp) {
          pendingLive.set(event.seqNum, event)
          return
        }
        emit(event)
      })

      function onAbort() {
        cleanup(true)
      }
      c.req.raw.signal.addEventListener('abort', onAbort, { once: true })

      try {
        const persistence = getPersistence()
        const snapshotTail = persistence.getLastSeq(sessionId)
        let cursor = fromSeqNum
        while (cursor < snapshotTail) {
          const rows = persistence.listEvents(sessionId, cursor, 500).events
          if (rows.length === 0) break
          let progressed = false
          for (const row of rows) {
            if (row.seqNum > snapshotTail) break
            cursor = row.seqNum
            progressed = true
            emit(projectSessionEvent(row))
          }
          if (!progressed || rows.length < 500) break
        }

        catchingUp = false
        for (const event of [...pendingLive.values()].sort(
          (left, right) => left.seqNum - right.seqNum,
        )) {
          emit(event)
        }
        pendingLive.clear()

        enqueue(': keepalive\n\n')
        keepalive = setInterval(() => {
          enqueue(': keepalive\n\n')
        }, 15000)
      } catch (error) {
        cleanup(false)
        controller.error(error)
      }
    },
    cancel() {
      cancelStream()
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

/** Create SSE response stream for a Web session. */
export function createSSEStream(c: Context, sessionId: string, fromSeqNum = 0) {
  return createDurableSessionStream(
    c,
    sessionId,
    fromSeqNum,
    () => true,
    toWebEventFrame,
  )
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
  return createDurableSessionStream(
    c,
    sessionId,
    fromSeqNum,
    event => event.direction === 'outbound',
    toWorkerClientFrame,
  )
}
