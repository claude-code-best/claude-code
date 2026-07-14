import { log, error as logError } from '../../logger'
import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { uuidAuth } from '../../auth/middleware'
import {
  getSession,
  isSessionClosedStatus,
  resolveOwnedWebSessionId,
  updateSessionStatus,
} from '../../services/session'
import { publishSessionEvent } from '../../services/transport'
import { getExistingEventBus } from '../../transport/event-bus'
import { IdempotencyConflictError } from '../../persistence/database'
import { publishWorkerLiveCommand } from '../../transport/live-events'
import {
  DURABLE_CONTROL_EVENT_TYPES,
  DURABLE_MESSAGE_EVENT_TYPES,
  LIVE_WORKER_COMMAND_TYPES,
} from '../../transport/event-delivery-policy'

const app = new Hono()

type OwnershipCheckResult =
  | { error: true }
  | { error: true; reason: string }
  | {
      error: false
      session: NonNullable<ReturnType<typeof getSession>>
      sessionId: string
    }

function checkOwnership(
  c: { get: (key: string) => string | undefined },
  sessionId: string,
): OwnershipCheckResult {
  const uuid = c.get('uuid')!
  const resolvedSessionId = resolveOwnedWebSessionId(sessionId, uuid)
  if (!resolvedSessionId) {
    return { error: true }
  }
  const session = getSession(resolvedSessionId)
  if (!session) {
    return { error: true }
  }
  if (isSessionClosedStatus(session.status)) {
    return { error: true, reason: `Session is ${session.status}` }
  }
  return { error: false, session, sessionId: resolvedSessionId }
}

function closedSessionResponse(message: string) {
  return { error: { type: 'session_closed', message } }
}

function nonEmptyBodyUuid(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const uuid = (body as Record<string, unknown>).uuid
  return typeof uuid === 'string' && uuid.length > 0 ? uuid : undefined
}

function idempotencyConflictResponse() {
  return {
    error: {
      type: 'idempotency_conflict',
      message: 'Event identity conflicts with an existing payload',
    },
  }
}

function unsupportedEventTypeResponse(type: string) {
  return {
    error: {
      type: 'unsupported_event_type',
      message: `Event type ${type || '(empty)'} has no delivery policy`,
    },
  }
}

/** POST /web/sessions/:id/live-events — at-most-once live worker command */
app.post('/sessions/:id/live-events', uuidAuth, async c => {
  const ownership = checkOwnership(c, c.req.param('id')!)
  if (ownership.error) {
    const message =
      'reason' in ownership ? ownership.reason : 'Not your session'
    const status = 'reason' in ownership ? 409 : 403
    return c.json(
      'reason' in ownership
        ? closedSessionResponse(message)
        : { error: { type: 'forbidden', message } },
      status,
    )
  }

  const body = (await c.req.json()) as Record<string, unknown>
  const type = typeof body.type === 'string' ? body.type : ''
  const commandId =
    typeof body.command_id === 'string' ? body.command_id.trim() : ''
  if (!LIVE_WORKER_COMMAND_TYPES.has(type) || !commandId) {
    return c.json(
      {
        error: {
          type: 'invalid_request',
          message: 'A supported type and non-empty command_id are required',
        },
      },
      400,
    )
  }

  const delivery = publishWorkerLiveCommand(
    ownership.sessionId,
    ownership.session.worker_epoch,
    commandId,
    type,
    body,
  )
  if (!delivery.accepted) {
    return c.json(
      {
        error: {
          type: 'worker_not_ready',
          message: 'Worker is not ready for live commands',
        },
      },
      409,
    )
  }
  log(
    `[RC-DEBUG] web -> worker live event: sessionId=${ownership.sessionId} type=${type} commandId=${commandId} chars=${type === 'terminal_input' && typeof body.data === 'string' ? body.data.length : 0}`,
  )
  return c.json(
    {
      status: 'accepted',
      command_id: commandId,
      generation: delivery.generation,
    },
    202,
  )
})

/** POST /web/sessions/:id/events — Send user message to session */
app.post('/sessions/:id/events', uuidAuth, async c => {
  const requestedSessionId = c.req.param('id')!
  const ownership = checkOwnership(c, requestedSessionId)
  if (ownership.error) {
    const message =
      'reason' in ownership ? ownership.reason : 'Not your session'
    const status = 'reason' in ownership ? 409 : 403
    return c.json(
      'reason' in ownership
        ? closedSessionResponse(message)
        : { error: { type: 'forbidden', message } },
      status,
    )
  }
  const { sessionId } = ownership

  const body = await c.req.json()
  const eventType =
    typeof body.type === 'string' && body.type ? body.type : 'user'
  if (!DURABLE_MESSAGE_EVENT_TYPES.has(eventType)) {
    return c.json(unsupportedEventTypeResponse(eventType), 400)
  }
  log(
    `[RC-DEBUG] web -> server: POST /web/sessions/${sessionId}/events type=${eventType}`,
  )
  try {
    const { event } = publishSessionEvent(
      sessionId,
      eventType,
      body,
      'outbound',
      { producer: 'web', sourceEventId: nonEmptyBodyUuid(body) },
    )
    log(
      `[RC-DEBUG] web -> server: published outbound event id=${event.id} type=${event.type} direction=${event.direction} subscribers=${getExistingEventBus(sessionId)?.subscriberCount() ?? 0}`,
    )
    return c.json({ status: 'ok', event }, 200)
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      return c.json(idempotencyConflictResponse(), 409)
    }
    throw err
  }
})

/** POST /web/sessions/:id/control — Send control request (permission approval etc) */
app.post('/sessions/:id/control', uuidAuth, async c => {
  const requestedSessionId = c.req.param('id')!
  const ownership = checkOwnership(c, requestedSessionId)
  if (ownership.error) {
    const message =
      'reason' in ownership ? ownership.reason : 'Not your session'
    const status = 'reason' in ownership ? 409 : 403
    return c.json(
      'reason' in ownership
        ? closedSessionResponse(message)
        : { error: { type: 'forbidden', message } },
      status,
    )
  }
  const { sessionId } = ownership

  const body = await c.req.json()
  const eventType =
    typeof body.type === 'string' && body.type ? body.type : 'control_request'
  if (!DURABLE_CONTROL_EVENT_TYPES.has(eventType)) {
    return c.json(unsupportedEventTypeResponse(eventType), 400)
  }
  try {
    const { event } = publishSessionEvent(
      sessionId,
      eventType,
      body,
      'outbound',
      { producer: 'web', sourceEventId: nonEmptyBodyUuid(body) },
    )
    return c.json({ status: 'ok', event }, 200)
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      return c.json(idempotencyConflictResponse(), 409)
    }
    throw err
  }
})

/** POST /web/sessions/:id/interrupt — Interrupt session */
app.post('/sessions/:id/interrupt', uuidAuth, async c => {
  const requestedSessionId = c.req.param('id')!
  const ownership = checkOwnership(c, requestedSessionId)
  if (ownership.error) {
    const message =
      'reason' in ownership ? ownership.reason : 'Not your session'
    const status = 'reason' in ownership ? 409 : 403
    return c.json(
      'reason' in ownership
        ? closedSessionResponse(message)
        : { error: { type: 'forbidden', message } },
      status,
    )
  }
  const { sessionId } = ownership
  const commandId = randomUUID()
  const delivery = publishWorkerLiveCommand(
    sessionId,
    ownership.session.worker_epoch,
    commandId,
    'interrupt',
    {
      type: 'interrupt',
      command_id: commandId,
      action: 'interrupt',
    },
  )
  if (!delivery.accepted) {
    return c.json(
      {
        error: {
          type: 'worker_not_ready',
          message: 'Worker is not ready for live commands',
        },
      },
      409,
    )
  }
  updateSessionStatus(sessionId, 'idle')
  return c.json(
    {
      status: 'accepted',
      command_id: commandId,
      generation: delivery.generation,
    },
    202,
  )
})

export default app
