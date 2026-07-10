import { Hono } from 'hono'
import { sessionIngressAuth, acceptCliHeaders } from '../../auth/middleware'
import { publishSessionEvent } from '../../services/transport'
import {
  getSession,
  touchSession,
  updateSessionStatus,
} from '../../services/session'
import { IdempotencyConflictError } from '../../persistence/database'

const app = new Hono()

interface ExtractedWorkerEvent {
  payload: Record<string, unknown>
  sourceEventId?: string
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function extractWorkerEvents(body: unknown): ExtractedWorkerEvent[] {
  if (!body || typeof body !== 'object') {
    return []
  }

  const payload = body as Record<string, unknown>
  const rawEvents = Array.isArray(payload.events)
    ? payload.events
    : Array.isArray(body)
      ? body
      : [body]

  return rawEvents
    .filter(
      (evt): evt is Record<string, unknown> => !!evt && typeof evt === 'object',
    )
    .map(evt => {
      const wrappedPayload = evt.payload
      const eventPayload =
        wrappedPayload &&
        typeof wrappedPayload === 'object' &&
        !Array.isArray(wrappedPayload)
          ? (wrappedPayload as Record<string, unknown>)
          : evt
      return {
        payload: eventPayload,
        sourceEventId:
          nonEmptyString(evt.event_id) ?? nonEmptyString(eventPayload.uuid),
      }
    })
}

/** POST /v1/code/sessions/:id/worker/events — Write events */
app.post(
  '/:id/worker/events',
  acceptCliHeaders,
  sessionIngressAuth,
  async c => {
    const sessionId = c.req.param('id')!
    if (!getSession(sessionId)) {
      return c.json(
        { error: { type: 'not_found', message: 'Session not found' } },
        404,
      )
    }
    const body = await c.req.json()

    const events = extractWorkerEvents(body)
    const published = []
    try {
      for (const evt of events) {
        const eventType =
          typeof evt.payload.type === 'string' ? evt.payload.type : 'message'
        const result = publishSessionEvent(
          sessionId,
          eventType,
          evt.payload,
          'inbound',
          { producer: 'v2-worker', sourceEventId: evt.sourceEventId },
        )
        published.push(result)
      }
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        return c.json(
          {
            error: {
              type: 'idempotency_conflict',
              message: 'Event identity conflicts with an existing payload',
            },
          },
          409,
        )
      }
      throw err
    }

    touchSession(sessionId)

    return c.json({ status: 'ok', count: published.length }, 200)
  },
)

/** PUT /v1/code/sessions/:id/worker/state — Report worker state */
app.put('/:id/worker/state', acceptCliHeaders, sessionIngressAuth, async c => {
  const sessionId = c.req.param('id')!
  if (!getSession(sessionId)) {
    return c.json(
      { error: { type: 'not_found', message: 'Session not found' } },
      404,
    )
  }
  const body = await c.req.json()

  if (body.status) {
    updateSessionStatus(sessionId, body.status)
  } else {
    touchSession(sessionId)
  }

  return c.json({ status: 'ok' }, 200)
})

/** PUT /v1/code/sessions/:id/worker/external_metadata — Report worker metadata (no-op) */
app.put(
  '/:id/worker/external_metadata',
  acceptCliHeaders,
  sessionIngressAuth,
  async c => {
    const sessionId = c.req.param('id')!
    if (!getSession(sessionId)) {
      return c.json(
        { error: { type: 'not_found', message: 'Session not found' } },
        404,
      )
    }
    // TUI's CCRClient calls this for metadata reporting. Accept and discard.
    return c.json({ status: 'ok' }, 200)
  },
)

/** POST /v1/code/sessions/:id/worker/events/delivery — Batch delivery tracking (no-op) */
app.post(
  '/:id/worker/events/delivery',
  acceptCliHeaders,
  sessionIngressAuth,
  async c => {
    const sessionId = c.req.param('id')!
    if (!getSession(sessionId)) {
      return c.json(
        { error: { type: 'not_found', message: 'Session not found' } },
        404,
      )
    }
    return c.json({ status: 'ok' }, 200)
  },
)

/** POST /v1/code/sessions/:id/worker/events/:eventId/delivery — Delivery tracking (no-op) */
app.post(
  '/:id/worker/events/:eventId/delivery',
  acceptCliHeaders,
  sessionIngressAuth,
  async c => {
    const sessionId = c.req.param('id')!
    if (!getSession(sessionId)) {
      return c.json(
        { error: { type: 'not_found', message: 'Session not found' } },
        404,
      )
    }
    // TUI's CCRClient reports event delivery status (received/processing/processed).
    // Accept and discard — event bus doesn't track per-event delivery.
    return c.json({ status: 'ok' }, 200)
  },
)

export default app
