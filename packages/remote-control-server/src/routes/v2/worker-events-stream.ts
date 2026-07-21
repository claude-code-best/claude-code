import { Hono } from 'hono'
import { sessionIngressAuth, acceptCliHeaders } from '../../auth/middleware'
import { createWorkerEventStream } from '../../transport/sse-writer'
import { getSession } from '../../services/session'
import { parseNonNegativeSafeInteger } from '../../transport/cursor'

const app = new Hono()

/** SSE /v1/code/sessions/:id/worker/events/stream — SSE event stream */
app.get(
  '/:id/worker/events/stream',
  acceptCliHeaders,
  sessionIngressAuth,
  async c => {
    const sessionId = c.req.param('id')!
    const session = getSession(sessionId)
    if (!session) {
      return c.json(
        { error: { type: 'not_found', message: 'Session not found' } },
        404,
      )
    }

    // Support Last-Event-ID / from_sequence_num for reconnection
    const rawHeaderCursor = c.req.header('Last-Event-ID')
    const rawQueryCursor = c.req.query('from_sequence_num')
    const headerCursor = parseNonNegativeSafeInteger(rawHeaderCursor)
    const queryCursor = parseNonNegativeSafeInteger(rawQueryCursor)
    if (
      (rawHeaderCursor !== undefined && headerCursor === undefined) ||
      (rawQueryCursor !== undefined && queryCursor === undefined)
    ) {
      return c.json(
        {
          error: {
            type: 'invalid_request',
            message: 'event cursor must be a non-negative integer',
          },
        },
        400,
      )
    }
    const fromSeqNum = Math.max(headerCursor ?? 0, queryCursor ?? 0)
    const rawWorkerEpoch = c.req.query('worker_epoch')
    const workerEpoch = parseNonNegativeSafeInteger(rawWorkerEpoch)
    if (workerEpoch === undefined || workerEpoch !== session.worker_epoch) {
      return c.json(
        {
          error: {
            type: 'worker_epoch_mismatch',
            message: 'Worker epoch is missing or stale',
          },
        },
        409,
      )
    }

    return createWorkerEventStream(c, sessionId, workerEpoch, fromSeqNum)
  },
)

export default app
