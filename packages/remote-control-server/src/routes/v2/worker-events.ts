import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { sessionIngressAuth, acceptCliHeaders } from '../../auth/middleware'
import { publishSessionEvent } from '../../services/transport'
import {
  getSession,
  touchSession,
  updateSessionStatus,
} from '../../services/session'
import { IdempotencyConflictError } from '../../persistence/database'
import { getPersistence } from '../../persistence/runtime'
import { publishWebLiveEvent } from '../../transport/live-events'
import {
  isCurrentWorkerEpoch,
  workerEpochMismatchError,
} from '../../transport/worker-epoch'
import type { PersistedInternalEventInput } from '../../persistence/types'

const app = new Hono()

const WORKER_LIVE_EVENT_TYPES = new Set([
  'terminal_output',
  'terminal_state',
  'terminal_snapshot',
])

interface ExtractedWorkerEvent {
  payload: Record<string, unknown>
  sourceEventId?: string
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function encodeInternalEventCursor(cursor: {
  createdAt: number
  eventId: string
}): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeInternalEventCursor(
  value: string | undefined,
): { createdAt: number; eventId: string } | undefined {
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    )
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      typeof (parsed as { createdAt?: unknown }).createdAt !== 'number' ||
      !Number.isSafeInteger((parsed as { createdAt: number }).createdAt) ||
      typeof (parsed as { eventId?: unknown }).eventId !== 'string' ||
      !(parsed as { eventId: string }).eventId
    ) {
      return undefined
    }
    return parsed as { createdAt: number; eventId: string }
  } catch {
    return undefined
  }
}

function parseInternalEventLimit(value: string | undefined): number | null {
  if (value === undefined) return 100
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 500) {
    return null
  }
  return parsed
}

function parseInternalEventCreatedAt(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return Date.now()
}

function parseInternalEventBatch(
  body: unknown,
  sessionId: string,
): PersistedInternalEventInput[] | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const rawBody = body as Record<string, unknown>
  if (!Array.isArray(rawBody.events)) return null

  const events: PersistedInternalEventInput[] = []
  for (const raw of rawBody.events) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const event = raw as Record<string, unknown>
    const payload =
      event.payload &&
      typeof event.payload === 'object' &&
      !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : null
    if (!payload) return null

    const eventId =
      nonEmptyString(event.event_id) ?? nonEmptyString(payload.uuid)
    const eventType =
      nonEmptyString(event.event_type) ?? nonEmptyString(payload.type)
    if (!eventId || !eventType) return null

    const eventMetadata =
      event.event_metadata &&
      typeof event.event_metadata === 'object' &&
      !Array.isArray(event.event_metadata)
        ? (event.event_metadata as Record<string, unknown>)
        : null
    events.push({
      sessionId,
      eventId,
      eventType,
      payload,
      eventMetadata,
      isCompaction: event.is_compaction === true,
      agentId: nonEmptyString(event.agent_id) ?? null,
      createdAt: parseInternalEventCreatedAt(event.created_at),
    })
  }
  return events
}

function toInternalEventResponse(event: {
  eventId: string
  eventType: string
  payload: Record<string, unknown>
  eventMetadata: Record<string, unknown> | null
  isCompaction: boolean
  agentId: string | null
  createdAt: number
}) {
  return {
    event_id: event.eventId,
    event_type: event.eventType,
    payload: event.payload,
    event_metadata: event.eventMetadata,
    is_compaction: event.isCompaction,
    created_at: new Date(event.createdAt).toISOString(),
    agent_id: event.agentId,
  }
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
    if (!isCurrentWorkerEpoch(sessionId, body?.worker_epoch)) {
      return c.json(workerEpochMismatchError(), 409)
    }

    const events = extractWorkerEvents(body)
    const unsupportedTerminalType = events
      .map(evt =>
        typeof evt.payload.type === 'string' ? evt.payload.type : 'message',
      )
      .find(
        eventType =>
          eventType.startsWith('terminal_') &&
          !WORKER_LIVE_EVENT_TYPES.has(eventType),
      )
    if (unsupportedTerminalType) {
      return c.json(
        {
          error: {
            type: 'unsupported_event_type',
            message: `Event type ${unsupportedTerminalType} has no delivery policy`,
          },
        },
        400,
      )
    }
    let count = 0
    try {
      for (const evt of events) {
        const eventType =
          typeof evt.payload.type === 'string' ? evt.payload.type : 'message'
        if (WORKER_LIVE_EVENT_TYPES.has(eventType)) {
          publishWebLiveEvent({
            eventId: evt.sourceEventId ?? randomUUID(),
            sessionId,
            type: eventType,
            payload: evt.payload,
            createdAt: Date.now(),
          })
        } else {
          publishSessionEvent(sessionId, eventType, evt.payload, 'inbound', {
            producer: 'v2-worker',
            sourceEventId: evt.sourceEventId,
          })
        }
        count += 1
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

    return c.json({ status: 'ok', count }, 200)
  },
)

/** POST /v1/code/sessions/:id/worker/live-events — transient worker output */
app.post(
  '/:id/worker/live-events',
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
    const body = (await c.req.json()) as Record<string, unknown>
    if (!isCurrentWorkerEpoch(sessionId, body.worker_epoch)) {
      return c.json(workerEpochMismatchError(), 409)
    }
    const events = Array.isArray(body.events) ? body.events : [body]
    let count = 0
    for (const raw of events) {
      if (!raw || typeof raw !== 'object') continue
      const event = raw as Record<string, unknown>
      const type = typeof event.type === 'string' ? event.type : ''
      const eventId =
        typeof event.event_id === 'string' ? event.event_id.trim() : ''
      const payload =
        event.payload &&
        typeof event.payload === 'object' &&
        !Array.isArray(event.payload)
          ? (event.payload as Record<string, unknown>)
          : event
      if (!eventId || !WORKER_LIVE_EVENT_TYPES.has(type)) {
        return c.json(
          {
            error: {
              type: 'invalid_request',
              message: 'Unsupported live event or missing event_id',
            },
          },
          400,
        )
      }
      publishWebLiveEvent({
        eventId,
        sessionId,
        type,
        payload,
        createdAt: Date.now(),
      })
      count += 1
    }
    touchSession(sessionId)
    return c.json({ status: 'ok', count }, 200)
  },
)

/** POST /v1/code/sessions/:id/worker/internal-events — Persist CCR transcript events. */
app.post(
  '/:id/worker/internal-events',
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
    if (!isCurrentWorkerEpoch(sessionId, body?.worker_epoch)) {
      return c.json(workerEpochMismatchError(), 409)
    }
    const events = parseInternalEventBatch(body, sessionId)
    if (!events) {
      return c.json(
        {
          error: {
            type: 'invalid_request',
            message: 'events must contain payload objects with UUIDs and types',
          },
        },
        400,
      )
    }
    const result = getPersistence().insertInternalEvents(events)
    touchSession(sessionId)
    return c.json({ status: 'ok', count: result.inserted }, 200)
  },
)

/** GET /v1/code/sessions/:id/worker/internal-events — Read CCR transcript events. */
app.get(
  '/:id/worker/internal-events',
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
    const limit = parseInternalEventLimit(c.req.query('limit'))
    const cursorValue = c.req.query('cursor')
    const cursor = decodeInternalEventCursor(cursorValue)
    if (limit === null || (cursorValue !== undefined && !cursor)) {
      return c.json(
        {
          error: {
            type: 'invalid_request',
            message: 'Invalid cursor or limit',
          },
        },
        400,
      )
    }
    const page = getPersistence().listInternalEvents(sessionId, {
      after: cursor,
      limit,
      subagents: c.req.query('subagents') === 'true',
    })
    return c.json(
      {
        data: page.events.map(toInternalEventResponse),
        ...(page.nextCursor
          ? { next_cursor: encodeInternalEventCursor(page.nextCursor) }
          : {}),
      },
      200,
    )
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
  if (!isCurrentWorkerEpoch(sessionId, body?.worker_epoch)) {
    return c.json(workerEpochMismatchError(), 409)
  }

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
    const body = (await c.req.json()) as Record<string, unknown>
    if (!isCurrentWorkerEpoch(sessionId, body.worker_epoch)) {
      return c.json(workerEpochMismatchError(), 409)
    }
    // TUI's CCRClient calls this for metadata reporting. Accept and discard.
    return c.json({ status: 'ok' }, 200)
  },
)

const DELIVERY_STATUSES = new Set(['received', 'processing', 'processed'])

/** POST /v1/code/sessions/:id/worker/events/delivery — Batch delivery tracking */
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
    const body = (await c.req.json()) as Record<string, unknown>
    if (!isCurrentWorkerEpoch(sessionId, body.worker_epoch)) {
      return c.json(workerEpochMismatchError(), 409)
    }
    const workerEpoch = Number(body.worker_epoch ?? 0)
    const updates = Array.isArray(body.updates) ? body.updates : []
    let count = 0
    for (const raw of updates) {
      if (!raw || typeof raw !== 'object') continue
      const update = raw as Record<string, unknown>
      const eventId = typeof update.event_id === 'string' ? update.event_id : ''
      const status = typeof update.status === 'string' ? update.status : ''
      if (!eventId || !DELIVERY_STATUSES.has(status)) continue
      if (
        getPersistence().recordEventDelivery(
          sessionId,
          eventId,
          Number.isSafeInteger(workerEpoch) ? workerEpoch : 0,
          status as 'received' | 'processing' | 'processed',
        )
      ) {
        count += 1
      }
    }
    return c.json({ status: 'ok', count }, 200)
  },
)

/** POST /v1/code/sessions/:id/worker/events/:eventId/delivery — Delivery tracking */
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
    const body = (await c.req.json()) as Record<string, unknown>
    if (!isCurrentWorkerEpoch(sessionId, body.worker_epoch)) {
      return c.json(workerEpochMismatchError(), 409)
    }
    const status = typeof body.status === 'string' ? body.status : ''
    if (!DELIVERY_STATUSES.has(status)) {
      return c.json(
        { error: { type: 'invalid_request', message: 'Invalid status' } },
        400,
      )
    }
    const delivery = getPersistence().recordEventDelivery(
      sessionId,
      c.req.param('eventId')!,
      Number.isSafeInteger(Number(body.worker_epoch))
        ? Number(body.worker_epoch)
        : 0,
      status as 'received' | 'processing' | 'processed',
    )
    return c.json({ status: 'ok', recorded: !!delivery }, 200)
  },
)

export default app
