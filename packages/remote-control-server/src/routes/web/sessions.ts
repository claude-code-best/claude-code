import { log, error as logError } from '../../logger'
import { Hono } from 'hono'
import { uuidAuth } from '../../auth/middleware'
import { getAutomationStateSnapshot } from '../../services/automationState'
import {
  createSession,
  archiveSession,
  restoreSession,
  deleteSession,
  getSession,
  isSessionClosedStatus,
  listWebSessionSummariesByOwnerUuid,
  listWebSessionsByOwnerUuid,
  resolveOwnedWebSessionId,
  toWebSessionResponse,
  resolveExistingSessionId,
  rebindSessionEnvironment,
  updateSessionTitle,
} from '../../services/session'
import {
  storeBindSession,
  storeGetEnvironment,
  storeGetSessionWorker,
} from '../../store'
import { createWorkItem } from '../../services/work-dispatch'
import { createSSEStream } from '../../transport/sse-writer'
import { projectSessionEvent } from '../../transport/event-bus'
import { getPersistence } from '../../persistence/runtime'
import { parseNonNegativeSafeInteger } from '../../transport/cursor'
import type { HistoryResponse } from '../../types/api'
import {
  resolveDefaultSessionModel,
  toSessionModelSelectionPayload,
} from '../../services/provider-catalog'

const app = new Hono()

function invalidQueryResponse(message: string) {
  return { error: { type: 'invalid_request', message } }
}

/** POST /web/sessions — Create a session from web UI */
app.post('/sessions', uuidAuth, async c => {
  const uuid = c.get('uuid')!
  const body = await c.req.json()
  const directory =
    typeof body.directory === 'string' && body.directory.trim()
      ? body.directory.trim()
      : null
  const environmentId =
    typeof body.environment_id === 'string' && body.environment_id
      ? body.environment_id
      : null
  const environment = environmentId
    ? storeGetEnvironment(environmentId)
    : undefined
  const session = createSession({
    environment_id: environmentId,
    title: body.title || 'New Session',
    source: 'web',
    permission_mode: body.permission_mode || 'default',
    directory,
    model_selection: toSessionModelSelectionPayload(
      environment ? resolveDefaultSessionModel(environment) : null,
    ),
  })

  // Auto-bind to creator's UUID
  storeBindSession(session.id, uuid)

  // Dispatch work to environment if specified
  if (environmentId) {
    try {
      await createWorkItem(environmentId, session.id)
    } catch (err) {
      logError(`[RCS] Failed to create work item: ${(err as Error).message}`)
    }
  }

  return c.json(session, 200)
})

/** GET /web/sessions — List sessions owned by the requesting UUID */
app.get('/sessions', uuidAuth, async c => {
  const uuid = c.get('uuid')!
  const sessions = listWebSessionsByOwnerUuid(
    uuid,
    c.req.query('include_archived') === '1',
  )
  return c.json(
    sessions.map(session => {
      const storedId = resolveExistingSessionId(session.id) ?? session.id
      const worker = storeGetSessionWorker(storedId)
      const automationState = getAutomationStateSnapshot(
        worker?.externalMetadata,
      )
      return {
        ...session,
        worker_status: worker?.workerStatus ?? null,
        last_heartbeat_at: worker?.lastHeartbeatAt?.getTime() ?? null,
        requires_action_details: worker?.requiresActionDetails ?? null,
        ...(automationState === undefined
          ? {}
          : { automation_state: automationState }),
      }
    }),
    200,
  )
})

/** GET /web/sessions/all — List sessions owned by the requesting UUID (unowned sessions excluded) */
app.get('/sessions/all', uuidAuth, async c => {
  const uuid = c.get('uuid')!
  const sessions = listWebSessionSummariesByOwnerUuid(
    uuid,
    c.req.query('include_archived') === '1',
  )
  return c.json(sessions, 200)
})

function resolveLifecycleSessionId(
  requestedSessionId: string,
  uuid: string,
): string | null {
  const sessionId = resolveOwnedWebSessionId(requestedSessionId, uuid)
  return sessionId && getSession(sessionId) ? sessionId : null
}

function forbiddenLifecycleResponse() {
  return { error: { type: 'forbidden', message: 'Not your session' } }
}

app.post('/sessions/:id/archive', uuidAuth, async c => {
  const sessionId = resolveLifecycleSessionId(
    c.req.param('id')!,
    c.get('uuid')!,
  )
  if (!sessionId) return c.json(forbiddenLifecycleResponse(), 403)
  return c.json({ status: 'ok', result: archiveSession(sessionId) }, 200)
})

app.post('/sessions/:id/restore', uuidAuth, async c => {
  const sessionId = resolveLifecycleSessionId(
    c.req.param('id')!,
    c.get('uuid')!,
  )
  if (!sessionId) return c.json(forbiddenLifecycleResponse(), 403)
  return c.json({ status: 'ok', result: restoreSession(sessionId) }, 200)
})

app.post('/sessions/:id/rebind', uuidAuth, async c => {
  const sessionId = resolveLifecycleSessionId(
    c.req.param('id')!,
    c.get('uuid')!,
  )
  if (!sessionId) return c.json(forbiddenLifecycleResponse(), 403)
  const body = await c.req.json()
  const environmentId =
    typeof body.environment_id === 'string' ? body.environment_id : ''
  if (!environmentId) {
    return c.json(invalidQueryResponse('environment_id is required'), 400)
  }
  const result = rebindSessionEnvironment(
    sessionId,
    environmentId,
    c.get('accountId')!,
  )
  if (result === 'missing_environment') {
    return c.json(
      invalidQueryResponse('environment is missing or offline'),
      409,
    )
  }
  if (result === 'closed') {
    return c.json(invalidQueryResponse('session is archived'), 409)
  }
  if (result === 'immutable_product_session') {
    return c.json(
      invalidQueryResponse('product sessions cannot change environments'),
      409,
    )
  }
  if (result === 'missing_session') {
    return c.json(forbiddenLifecycleResponse(), 403)
  }
  return c.json({ status: 'ok', result }, 200)
})

app.delete('/sessions/:id', uuidAuth, async c => {
  const sessionId = resolveLifecycleSessionId(
    c.req.param('id')!,
    c.get('uuid')!,
  )
  if (!sessionId) return c.json(forbiddenLifecycleResponse(), 403)
  if (getSession(sessionId)?.product === 'chat') {
    return c.json(
      invalidQueryResponse('Chat sessions must use the cleanup delete route'),
      409,
    )
  }
  if (!deleteSession(sessionId))
    return c.json(forbiddenLifecycleResponse(), 403)
  return c.json({ status: 'ok' }, 200)
})

/** PATCH /web/sessions/:id — Rename an owned session */
app.patch('/sessions/:id', uuidAuth, async c => {
  const sessionId = resolveLifecycleSessionId(
    c.req.param('id')!,
    c.get('uuid')!,
  )
  if (!sessionId) return c.json(forbiddenLifecycleResponse(), 403)

  const body = await c.req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return c.json(invalidQueryResponse('title is required'), 400)

  updateSessionTitle(sessionId, title)
  return c.json(toWebSessionResponse(getSession(sessionId)!), 200)
})

/** GET /web/sessions/:id — Session detail */
app.get('/sessions/:id', uuidAuth, async c => {
  const uuid = c.get('uuid')!
  const sessionId = resolveOwnedWebSessionId(c.req.param('id')!, uuid)
  if (!sessionId) {
    return c.json(
      { error: { type: 'forbidden', message: 'Not your session' } },
      403,
    )
  }
  const session = getSession(sessionId)
  if (!session) {
    return c.json(
      { error: { type: 'not_found', message: 'Session not found' } },
      404,
    )
  }
  const worker = storeGetSessionWorker(sessionId)
  const automationState = getAutomationStateSnapshot(worker?.externalMetadata)
  const response = toWebSessionResponse(session)
  return c.json(
    automationState === undefined
      ? response
      : { ...response, automation_state: automationState },
    200,
  )
})

/** GET /web/sessions/:id/history — Historical events for session */
app.get('/sessions/:id/history', uuidAuth, async c => {
  const uuid = c.get('uuid')!
  const sessionId = resolveOwnedWebSessionId(c.req.param('id')!, uuid)
  if (!sessionId) {
    return c.json(
      { error: { type: 'forbidden', message: 'Not your session' } },
      403,
    )
  }
  const session = getSession(sessionId)
  if (!session) {
    return c.json(
      { error: { type: 'not_found', message: 'Session not found' } },
      404,
    )
  }

  const rawAfter = c.req.query('after')
  const rawLimit = c.req.query('limit')
  const after = parseNonNegativeSafeInteger(rawAfter) ?? 0
  const limit = parseNonNegativeSafeInteger(rawLimit) ?? 200
  if (
    rawAfter !== undefined &&
    parseNonNegativeSafeInteger(rawAfter) === undefined
  ) {
    return c.json(
      invalidQueryResponse('after must be a non-negative integer'),
      400,
    )
  }
  if (
    (rawLimit !== undefined &&
      parseNonNegativeSafeInteger(rawLimit) === undefined) ||
    limit < 1 ||
    limit > 500
  ) {
    return c.json(
      invalidQueryResponse('limit must be an integer from 1 to 500'),
      400,
    )
  }

  const persistence = getPersistence()
  const rows = persistence.listEvents(sessionId, after, limit + 1).events
  const hasMore = rows.length > limit
  const events = rows.slice(0, limit).map(projectSessionEvent)
  const oldest = persistence.listEvents(sessionId, 0, 1).events[0]
  const response: HistoryResponse = {
    events,
    next_cursor: events.at(-1)?.seqNum ?? after,
    has_more: hasMore,
    oldest_available_seq: oldest?.seqNum ?? null,
    truncated: false,
  }
  return c.json(response, 200)
})

/** SSE /web/sessions/:id/events — Real-time event stream */
app.get('/sessions/:id/events', uuidAuth, async c => {
  const uuid = c.get('uuid')!
  const sessionId = resolveOwnedWebSessionId(c.req.param('id')!, uuid)
  if (!sessionId) {
    return c.json(
      { error: { type: 'forbidden', message: 'Not your session' } },
      403,
    )
  }
  const session = getSession(sessionId)
  if (!session) {
    return c.json(
      { error: { type: 'not_found', message: 'Session not found' } },
      404,
    )
  }
  if (isSessionClosedStatus(session.status)) {
    return c.json(
      {
        error: {
          type: 'session_closed',
          message: `Session is ${session.status}`,
        },
      },
      409,
    )
  }

  const rawQueryCursor = c.req.query('from_sequence_num')
  const rawHeaderCursor = c.req.header('Last-Event-ID')
  const queryCursor = parseNonNegativeSafeInteger(rawQueryCursor)
  const headerCursor = parseNonNegativeSafeInteger(rawHeaderCursor)
  if (
    (rawQueryCursor !== undefined && queryCursor === undefined) ||
    (rawHeaderCursor !== undefined && headerCursor === undefined)
  ) {
    return c.json(
      invalidQueryResponse('event cursor must be a non-negative integer'),
      400,
    )
  }
  const fromSeqNum = Math.max(queryCursor ?? 0, headerCursor ?? 0)
  return createSSEStream(c, sessionId, fromSeqNum)
})

export default app
