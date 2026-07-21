import { log } from '../logger'
import type { Context } from 'hono'
import type { SessionEvent } from './event-bus'
import { getAcpEventBus, removeIdleAcpEventBus } from './event-bus'

/** Create SSE response stream for an ACP channel group */
export function createAcpSSEStream(
  c: Context,
  channelGroupId: string,
  fromSeqNum = 0,
) {
  const bus = getAcpEventBus(channelGroupId)
  let cancelStream = () => {}

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      let cleaned = false
      let keepalive: ReturnType<typeof setInterval> | undefined
      let unsub = () => {}

      const cleanup = (closeController: boolean) => {
        if (cleaned) return
        cleaned = true
        c.req.raw.signal.removeEventListener('abort', onAbort)
        unsub()
        if (keepalive) clearInterval(keepalive)
        removeIdleAcpEventBus(channelGroupId)
        if (closeController) {
          try {
            controller.close()
          } catch {
            // already closed
          }
        }
      }
      cancelStream = () => cleanup(false)

      function onAbort() {
        cleanup(true)
      }

      // Send historical events if reconnecting
      if (fromSeqNum > 0) {
        const missed = bus.getEventsSince(fromSeqNum)
        for (const event of missed) {
          const data = JSON.stringify({
            type: event.type,
            payload: event.payload,
            direction: event.direction,
            seqNum: event.seqNum,
            channel_group_id: channelGroupId,
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
      unsub = bus.subscribe(event => {
        const data = JSON.stringify({
          type: event.type,
          payload: event.payload,
          direction: event.direction,
          seqNum: event.seqNum,
          channel_group_id: channelGroupId,
        })
        try {
          log(
            `[ACP-SSE] -> subscriber: channelGroup=${channelGroupId} type=${event.type} seq=${event.seqNum}`,
          )
          controller.enqueue(
            encoder.encode(
              `id: ${event.seqNum}\nevent: message\ndata: ${data}\n\n`,
            ),
          )
        } catch {
          cleanup(false)
        }
      })

      // Keepalive interval
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keepalive\n\n'))
        } catch {
          cleanup(false)
        }
      }, 15000)

      // Cleanup on abort
      c.req.raw.signal.addEventListener('abort', onAbort, { once: true })
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
