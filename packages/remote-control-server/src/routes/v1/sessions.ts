import { log, error as logError } from '../../logger'
import { Hono } from 'hono'
import {
  createSession,
  getSession,
  updateSessionTitle,
  updateSessionTitleIfCurrent,
  archiveSession,
  resolveExistingSessionId,
} from '../../services/session'
import { createWorkItem } from '../../services/work-dispatch'
import { apiKeyAuth, acceptCliHeaders } from '../../auth/middleware'
import { publishSessionEvent } from '../../services/transport'
import { IdempotencyConflictError } from '../../persistence/database'
import { storeDeleteSession, storeGetEnvironment } from '../../store'
import { removeEventBus } from '../../transport/event-bus'
import {
  resolveDefaultSessionModel,
  toSessionModelSelectionPayload,
} from '../../services/provider-catalog'

const app = new Hono()

function nonEmptyEventUuid(event: unknown): string | undefined {
  if (!event || typeof event !== 'object') return undefined
  const uuid = (event as Record<string, unknown>).uuid
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

/** POST /v1/sessions — Create session */
app.post('/', acceptCliHeaders, apiKeyAuth, async c => {
  const body = await c.req.json()
  const username = c.get('username')
  const environmentId =
    typeof body.environment_id === 'string' && body.environment_id
      ? body.environment_id
      : null
  const environment = environmentId
    ? storeGetEnvironment(environmentId)
    : undefined
  const { model_selection: _ignoredModelSelection, ...sessionBody } = body
  const session = createSession({
    ...sessionBody,
    environment_id: environmentId,
    model_selection: toSessionModelSelectionPayload(
      environment ? resolveDefaultSessionModel(environment) : null,
    ),
    username,
  })

  // Publish initial events if provided
  if (body.events && Array.isArray(body.events)) {
    try {
      for (const evt of body.events) {
        publishSessionEvent(session.id, evt.type || 'init', evt, 'outbound', {
          producer: 'v1-ingress',
          sourceEventId: nonEmptyEventUuid(evt),
        })
      }
    } catch (err) {
      if (err instanceof IdempotencyConflictError) {
        storeDeleteSession(session.id)
        removeEventBus(session.id)
        return c.json(idempotencyConflictResponse(), 409)
      }
      throw err
    }
  }

  // Create work item only after initial events have committed successfully.
  // dispatch_work: false lets the bridge pre-create its empty landing session
  // without spawning a worker — the first user message dispatches on demand
  // (dispatchWorkForUserInput), so untouched sessions cost nothing.
  if (environmentId && body.dispatch_work !== false) {
    try {
      await createWorkItem(environmentId, session.id)
    } catch (err) {
      logError(`[RCS] Failed to create work item: ${(err as Error).message}`)
    }
  }

  return c.json(session, 200)
})

/** GET /v1/sessions/:id — Get session */
app.get('/:id', acceptCliHeaders, apiKeyAuth, async c => {
  const sessionId =
    resolveExistingSessionId(c.req.param('id')!) ?? c.req.param('id')!
  const session = getSession(sessionId)
  if (!session) {
    return c.json(
      { error: { type: 'not_found', message: 'Session not found' } },
      404,
    )
  }
  return c.json(session, 200)
})

/** PATCH /v1/sessions/:id — Update session title */
app.patch('/:id', acceptCliHeaders, apiKeyAuth, async c => {
  const sessionId =
    resolveExistingSessionId(c.req.param('id')!) ?? c.req.param('id')!
  const existing = getSession(sessionId)
  if (!existing) {
    return c.json(
      { error: { type: 'not_found', message: 'Session not found' } },
      404,
    )
  }
  const body = await c.req.json()
  if (
    body.expected_title !== undefined &&
    typeof body.expected_title !== 'string'
  ) {
    return c.json(
      {
        error: {
          type: 'invalid_request',
          message: 'expected_title must be a string',
        },
      },
      400,
    )
  }
  if (body.title) {
    if (typeof body.expected_title === 'string') {
      const updated = updateSessionTitleIfCurrent(
        sessionId,
        body.expected_title,
        body.title,
      )
      if (!updated) {
        return c.json(
          {
            error: {
              type: 'title_changed',
              message:
                'Session title changed before automatic title generation completed',
            },
          },
          409,
        )
      }
    } else {
      updateSessionTitle(sessionId, body.title)
    }
  }
  const session = getSession(sessionId)
  return c.json(session, 200)
})

/** POST /v1/sessions/:id/archive — Archive session */
app.post('/:id/archive', acceptCliHeaders, apiKeyAuth, async c => {
  const sessionId =
    resolveExistingSessionId(c.req.param('id')!) ?? c.req.param('id')!
  const session = getSession(sessionId)
  if (!session) {
    return c.json(
      { error: { type: 'not_found', message: 'Session not found' } },
      404,
    )
  }

  try {
    archiveSession(sessionId)
  } catch {
    return c.json({ status: 'ok' }, 409)
  }

  return c.json({ status: 'ok' }, 200)
})

/** POST /v1/sessions/:id/events — Send event to session */
app.post('/:id/events', acceptCliHeaders, apiKeyAuth, async c => {
  const sessionId =
    resolveExistingSessionId(c.req.param('id')!) ?? c.req.param('id')!
  const session = getSession(sessionId)
  if (!session) {
    return c.json(
      { error: { type: 'not_found', message: 'Session not found' } },
      404,
    )
  }
  const body = await c.req.json()

  const events = body.events
    ? Array.isArray(body.events)
      ? body.events
      : [body.events]
    : Array.isArray(body)
      ? body
      : [body]
  const published = []
  try {
    for (const evt of events) {
      const { event } = publishSessionEvent(
        sessionId,
        evt.type || 'message',
        evt,
        'inbound',
        {
          producer: 'v1-ingress',
          sourceEventId: nonEmptyEventUuid(evt),
        },
      )
      published.push(event)
    }
  } catch (err) {
    if (err instanceof IdempotencyConflictError) {
      return c.json(idempotencyConflictResponse(), 409)
    }
    throw err
  }

  return c.json({ status: 'ok', events: published.length }, 200)
})

export default app
