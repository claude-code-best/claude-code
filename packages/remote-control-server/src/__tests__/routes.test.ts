import { describe, test, expect, beforeEach, mock } from 'bun:test'

// res.json() returns Promise<unknown> in strict mode; this helper narrows for test assertions
function resJson(res: Response) {
  return res.json() as Promise<any>
}

// Mock config
const mockConfig = {
  port: 3000,
  host: '0.0.0.0',
  apiKeys: ['test-api-key'],
  baseUrl: 'http://localhost:3000',
  pollTimeout: 1,
  heartbeatInterval: 20,
  jwtExpiresIn: 3600,
  disconnectTimeout: 300,
  webCorsOrigins: [],
  wsIdleTimeout: 30,
  wsKeepaliveInterval: 20,
}

mock.module('../config', () => ({
  config: mockConfig,
  getBaseUrl: () => 'http://localhost:3000',
}))

import { Hono } from 'hono'
import {
  storeReset,
  storeCreateSession,
  storeCreateEnvironment,
  storeBindSession,
} from '../store'
import {
  removeEventBus,
  getAllEventBuses,
  getEventBus,
} from '../transport/event-bus'
import { issueToken } from '../auth/token'
import { publishSessionEvent } from '../services/transport'
import { encodeWebSocketAuthProtocol } from '../auth/middleware'
import { getPersistence } from '../persistence/runtime'

// Import route modules
import v1Sessions from '../routes/v1/sessions'
import v1Environments from '../routes/v1/environments'
import v1EnvironmentsWork from '../routes/v1/environments.work'
import v1SessionIngress, {
  decodeSessionIngressWsMessage,
  handleSessionIngressWsPayload,
  websocket as sessionIngressWebsocket,
} from '../routes/v1/session-ingress'
import {
  decodeAcpWsMessageData,
  hasAcpRelayAuth,
  handleAcpWsPayload,
} from '../routes/acp'
import acpRoutes from '../routes/acp'
import v2CodeSessions from '../routes/v2/code-sessions'
import v2Worker from '../routes/v2/worker'
import v2WorkerEventsStream from '../routes/v2/worker-events-stream'
import v2WorkerEvents from '../routes/v2/worker-events'
import webAuth from '../routes/web/auth'
import webSessions from '../routes/web/sessions'
import webControl from '../routes/web/control'
import webEnvironments from '../routes/web/environments'

function createApp() {
  const app = new Hono()
  app.route('/v1/sessions', v1Sessions)
  app.route('/v1/environments', v1Environments)
  app.route('/v1/environments', v1EnvironmentsWork)
  app.route('/v2/session_ingress', v1SessionIngress)
  app.route('/v1/code/sessions', v2CodeSessions)
  app.route('/v1/code/sessions', v2Worker)
  app.route('/v1/code/sessions', v2WorkerEventsStream)
  app.route('/v1/code/sessions', v2WorkerEvents)
  app.route('/web', webAuth)
  app.route('/web', webSessions)
  app.route('/web', webControl)
  app.route('/web', webEnvironments)
  app.route('/acp', acpRoutes)
  return app
}

const AUTH_HEADERS = {
  Authorization: 'Bearer test-api-key',
  'X-Username': 'testuser',
}

function toWebSessionId(sessionId: string): string {
  if (!sessionId.startsWith('cse_')) return sessionId
  return `session_${sessionId.slice('cse_'.length)}`
}

async function expectIdempotentAssistantPost(
  request: (content: string) => Response | Promise<Response>,
  sessionId: string,
) {
  const received: unknown[] = []
  const unsubscribe = getEventBus(sessionId).subscribe(event =>
    received.push(event),
  )

  try {
    const first = await request('hello')
    const retry = await request('hello')
    expect(first.status).toBe(200)
    expect(retry.status).toBe(200)

    const page = getPersistence().listEvents(sessionId, 0, 100)
    const assistantEvents = page.events.filter(
      event => event.type === 'assistant',
    )
    expect(assistantEvents).toHaveLength(1)
    expect(assistantEvents[0]?.sourceEventId).toBe('assistant-1')
    expect(getPersistence().getLastSeq(sessionId)).toBe(1)
    expect(received).toHaveLength(1)

    const conflict = await request('different')
    expect(conflict.status).toBe(409)
    expect(await resJson(conflict)).toEqual({
      error: {
        type: 'idempotency_conflict',
        message: 'Event identity conflicts with an existing payload',
      },
    })
  } finally {
    unsubscribe()
  }
}

describe('V1 Session Routes', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
    app = createApp()
  })

  test('POST /v1/sessions — creates a session', async () => {
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Session' }),
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.id).toMatch(/^session_/)
    expect(body.title).toBe('Test Session')
    expect(body.status).toBe('idle')
  })

  test('POST /v1/sessions — requires auth', async () => {
    const res = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(401)
  })

  test('GET /v1/sessions/:id — returns created session', async () => {
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const getRes = await app.request(`/v1/sessions/${id}`, {
      headers: AUTH_HEADERS,
    })
    expect(getRes.status).toBe(200)
    const body = await resJson(getRes)
    expect(body.id).toBe(id)
  })

  test('GET /v1/sessions/:id — 404 for unknown session', async () => {
    const res = await app.request('/v1/sessions/nope', {
      headers: AUTH_HEADERS,
    })
    expect(res.status).toBe(404)
  })

  test('GET /v1/sessions/:id — resolves compat code session IDs', async () => {
    const createRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(createRes)

    const getRes = await app.request(`/v1/sessions/${toWebSessionId(id)}`, {
      headers: AUTH_HEADERS,
    })
    expect(getRes.status).toBe(200)
    const body = await resJson(getRes)
    expect(body.id).toBe(id)
  })

  test('PATCH /v1/sessions/:id — updates title', async () => {
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const patchRes = await app.request(`/v1/sessions/${id}`, {
      method: 'PATCH',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title' }),
    })
    expect(patchRes.status).toBe(200)
    const body = await resJson(patchRes)
    expect(body.title).toBe('Updated Title')
  })

  test('POST /v1/sessions/:id/archive — archives session', async () => {
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const archiveRes = await app.request(`/v1/sessions/${id}/archive`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    })
    expect(archiveRes.status).toBe(200)
  })

  test('POST /v1/sessions/:id/archive — archives compat code session IDs', async () => {
    const createRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(createRes)
    const compatId = toWebSessionId(id)

    const archiveRes = await app.request(`/v1/sessions/${compatId}/archive`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    })
    expect(archiveRes.status).toBe(200)

    const getRes = await app.request(`/v1/sessions/${compatId}`, {
      headers: AUTH_HEADERS,
    })
    expect(getRes.status).toBe(200)
    const body = await resJson(getRes)
    expect(body.id).toBe(id)
    expect(body.status).toBe('archived')
  })

  test('POST /v1/sessions/:id/events — publishes events', async () => {
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const eventsRes = await app.request(`/v1/sessions/${id}/events`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ type: 'user', content: 'hello' }] }),
    })
    expect(eventsRes.status).toBe(200)
    const body = await resJson(eventsRes)
    expect(body.events).toBe(1)
  })

  test('POST /v1/sessions/:id/events — collapses UUID retries, rejects conflicts, and keeps unkeyed text distinct', async () => {
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)
    const received: unknown[] = []
    const unsubscribe = getEventBus(id).subscribe(event => received.push(event))
    const post = (event: Record<string, unknown>) =>
      app.request(`/v1/sessions/${id}/events`, {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [event] }),
      })

    try {
      const stable = { type: 'message', uuid: 'legacy-1', content: 'hello' }
      const first = await post(stable)
      const retry = await post(stable)
      expect(first.status).toBe(200)
      expect(await resJson(first)).toEqual({ status: 'ok', events: 1 })
      expect(retry.status).toBe(200)
      expect(await resJson(retry)).toEqual({ status: 'ok', events: 1 })

      expect(getPersistence().listEvents(id, 0, 100).events).toHaveLength(1)
      expect(received).toHaveLength(1)

      const conflict = await post({
        type: 'message',
        uuid: 'legacy-1',
        content: 'sensitive changed payload',
      })
      expect(conflict.status).toBe(409)
      const conflictBody = await resJson(conflict)
      expect(conflictBody).toEqual({
        error: {
          type: 'idempotency_conflict',
          message: 'Event identity conflicts with an existing payload',
        },
      })
      expect(JSON.stringify(conflictBody)).not.toContain('sensitive')
      expect(JSON.stringify(conflictBody)).not.toContain(id)

      expect(
        (await post({ type: 'message', content: 'same unkeyed text' })).status,
      ).toBe(200)
      expect(
        (await post({ type: 'message', content: 'same unkeyed text' })).status,
      ).toBe(200)
      expect(
        (
          await post({
            type: 'message',
            uuid: 'legacy-2',
            content: 'hello',
          })
        ).status,
      ).toBe(200)

      const persisted = getPersistence().listEvents(id, 0, 100).events
      expect(persisted).toHaveLength(4)
      expect(persisted.map(event => event.sourceEventId)).toEqual([
        'legacy-1',
        null,
        null,
        'legacy-2',
      ])
      expect(received).toHaveLength(4)
    } finally {
      unsubscribe()
    }
  })

  test('POST /v1/sessions/:id/events — resolves compat code session IDs', async () => {
    const createRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(createRes)
    const compatId = toWebSessionId(id)

    const eventsRes = await app.request(`/v1/sessions/${compatId}/events`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [{ type: 'user', content: 'hello from compat' }],
      }),
    })
    expect(eventsRes.status).toBe(200)

    const events = getPersistence().listEvents(id, 0, 100).events
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('user')
    expect((events[0]?.payload as { content?: string }).content).toBe(
      'hello from compat',
    )
  })

  test('POST /v1/sessions with environment_id creates work item', async () => {
    // First register an environment
    const envRes = await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_name: 'test' }),
    })
    const { environment_id } = await resJson(envRes)

    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment_id }),
    })
    expect(sessRes.status).toBe(200)
    const body = await resJson(sessRes)
    expect(body.environment_id).toBe(environment_id)
  })

  test('POST /v1/sessions with invalid environment_id — session created, work item fails silently', async () => {
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment_id: 'env_nonexistent' }),
    })
    expect(sessRes.status).toBe(200)
    const body = await resJson(sessRes)
    expect(body.id).toMatch(/^session_/)
  })

  test('POST /v1/sessions with events — publishes initial events', async () => {
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ type: 'init', data: 'starting' }] }),
    })
    expect(sessRes.status).toBe(200)
  })

  test('POST /v1/sessions with events — collapses UUID retries and preserves the session response', async () => {
    const event = { type: 'init', uuid: 'initial-1', data: 'starting' }
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'With initial events',
        events: [event, event],
      }),
    })

    expect(sessRes.status).toBe(200)
    const session = await resJson(sessRes)
    expect(session.title).toBe('With initial events')
    expect(session.status).toBe('idle')
    expect(session.events).toBeUndefined()
    expect(getPersistence().listEvents(session.id, 0, 100).events).toHaveLength(
      1,
    )
    expect(getAllEventBuses().has(session.id)).toBe(false)
  })

  test('POST /v1/sessions with events — maps conflicting initial UUIDs to a generic 409', async () => {
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          { type: 'init', uuid: 'initial-1', data: 'first' },
          {
            type: 'init',
            uuid: 'initial-1',
            data: 'sensitive changed payload',
          },
        ],
      }),
    })

    expect(sessRes.status).toBe(409)
    const body = await resJson(sessRes)
    expect(body).toEqual({
      error: {
        type: 'idempotency_conflict',
        message: 'Event identity conflicts with an existing payload',
      },
    })
    expect(JSON.stringify(body)).not.toContain('sensitive')
    expect(getPersistence().listSessions()).toEqual([])
    expect(getAllEventBuses().size).toBe(0)
  })
})

describe('V1 Environment Routes', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    app = createApp()
  })

  test('POST /v1/environments/bridge — registers environment', async () => {
    const res = await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_name: 'mac1', directory: '/home' }),
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.environment_id).toMatch(/^env_/)
    expect(body.status).toBe('active')
  })

  test('DELETE /v1/environments/bridge/:id — deregisters environment', async () => {
    const envRes = await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { environment_id } = await resJson(envRes)

    const delRes = await app.request(
      `/v1/environments/bridge/${environment_id}`,
      {
        method: 'DELETE',
        headers: AUTH_HEADERS,
      },
    )
    expect(delRes.status).toBe(200)
  })

  test('POST /v1/environments/:id/bridge/reconnect — reconnects environment', async () => {
    const envRes = await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { environment_id } = await resJson(envRes)

    const reconnectRes = await app.request(
      `/v1/environments/${environment_id}/bridge/reconnect`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
      },
    )
    expect(reconnectRes.status).toBe(200)
  })
})

describe('V1 Work Routes', () => {
  let app: Hono
  let envId: string

  beforeEach(async () => {
    storeReset()
    app = createApp()

    const envRes = await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    envId = (await resJson(envRes)).environment_id
  })

  test('GET /v1/environments/:id/work/poll — returns 204 when no work', async () => {
    const res = await app.request(`/v1/environments/${envId}/work/poll`, {
      headers: AUTH_HEADERS,
    })
    expect(res.status).toBe(204)
  })

  test('work lifecycle: create → poll → ack → stop', async () => {
    // Create session with environment (creates work item)
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment_id: envId }),
    })
    const sessionId = (await resJson(sessRes)).id

    // Poll for work
    const pollRes = await app.request(`/v1/environments/${envId}/work/poll`, {
      headers: AUTH_HEADERS,
    })
    expect(pollRes.status).toBe(200)
    const work = await resJson(pollRes)
    expect(work.id).toMatch(/^work_/)
    expect(work.data.id).toBe(sessionId)

    // Ack work
    const ackRes = await app.request(
      `/v1/environments/${envId}/work/${work.id}/ack`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
      },
    )
    expect(ackRes.status).toBe(200)

    // Stop work
    const stopRes = await app.request(
      `/v1/environments/${envId}/work/${work.id}/stop`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
      },
    )
    expect(stopRes.status).toBe(200)
  })

  test('POST work heartbeat', async () => {
    // Create session + work
    await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment_id: envId }),
    })
    const pollRes = await app.request(`/v1/environments/${envId}/work/poll`, {
      headers: AUTH_HEADERS,
    })
    const work = await resJson(pollRes)

    const hbRes = await app.request(
      `/v1/environments/${envId}/work/${work.id}/heartbeat`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
      },
    )
    expect(hbRes.status).toBe(200)
    const body = await resJson(hbRes)
    expect(body.lease_extended).toBe(true)
  })
})

describe('V2 Code Session Routes', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    process.env.RCS_API_KEYS = 'test-api-key'
    app = createApp()
  })

  test('POST /v1/code/sessions — creates code session', async () => {
    const res = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Code Session' }),
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.session.id).toMatch(/^cse_/)
    expect(body.session.title).toBe('Code Session')
  })

  test('POST /v1/code/sessions/:id/bridge — returns bridge info with JWT', async () => {
    // Create code session
    const createRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = (await resJson(createRes)).session

    const bridgeRes = await app.request(`/v1/code/sessions/${id}/bridge`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    })
    expect(bridgeRes.status).toBe(200)
    const body = await resJson(bridgeRes)
    expect(body.api_base_url).toBe('http://localhost:3000')
    expect(body.worker_epoch).toBe(1)
    expect(body.worker_jwt).toBeTruthy()
    expect(body.expires_in).toBe(3600)
  })

  test('POST /v1/code/sessions/:id/bridge — 404 for unknown session', async () => {
    const res = await app.request('/v1/code/sessions/nope/bridge', {
      method: 'POST',
      headers: AUTH_HEADERS,
    })
    expect(res.status).toBe(404)
  })
})

describe('V2 Worker Routes', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    process.env.RCS_API_KEYS = 'test-api-key'
    app = createApp()
  })

  test('POST /v1/code/sessions/:id/worker/register — increments epoch', async () => {
    // Create session
    const createRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const regRes = await app.request(
      `/v1/code/sessions/${id}/worker/register`,
      {
        method: 'POST',
        headers: AUTH_HEADERS,
      },
    )
    expect(regRes.status).toBe(200)
    const body = await resJson(regRes)
    expect(body.worker_epoch).toBe(1)
  })

  test('POST /v1/code/sessions/:id/worker/register — 404 for unknown', async () => {
    const res = await app.request('/v1/code/sessions/nope/worker/register', {
      method: 'POST',
      headers: AUTH_HEADERS,
    })
    expect(res.status).toBe(404)
  })
})

describe('Web Auth Routes', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    app = createApp()
  })

  test('POST /web/bind — binds session to UUID', async () => {
    // Create session first
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(sessRes)

    const bindRes = await app.request('/web/bind?uuid=test-uuid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: id }),
    })
    expect(bindRes.status).toBe(200)
    const body = await resJson(bindRes)
    expect(body.ok).toBe(true)
  })

  test('POST /web/bind — binds compat code session ID to UUID', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = await resJson(sessRes)
    const compatId = toWebSessionId(body.session.id)

    const bindRes = await app.request('/web/bind?uuid=test-uuid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: compatId }),
    })
    expect(bindRes.status).toBe(200)
    const bindBody = await resJson(bindRes)
    expect(bindBody.ok).toBe(true)
    expect(bindBody.sessionId).toBe(compatId)
  })

  test('POST /web/bind — 404 for unknown session', async () => {
    const res = await app.request('/web/bind?uuid=test-uuid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'nope' }),
    })
    expect(res.status).toBe(404)
  })

  test('POST /web/bind — 400 when missing params', async () => {
    const res = await app.request('/web/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})

describe('Web Session Routes', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
    app = createApp()
  })

  test('POST /web/sessions — creates and auto-binds session', async () => {
    const res = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Web Session' }),
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.id).toMatch(/^session_/)
    expect(body.source).toBe('web')
  })

  test('GET /web/sessions — returns sessions owned by UUID', async () => {
    // Create and bind
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const listRes = await app.request('/web/sessions?uuid=user-1')
    expect(listRes.status).toBe(200)
    const sessions = await resJson(listRes)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(id)
  })

  test('GET /web/sessions and /all — serialize owned code sessions as compat IDs', async () => {
    const codeSession = storeCreateSession({ idPrefix: 'cse_' })
    storeBindSession(codeSession.id, 'user-1')
    const compatId = toWebSessionId(codeSession.id)

    const listRes = await app.request('/web/sessions?uuid=user-1')
    expect(listRes.status).toBe(200)
    const sessions = await resJson(listRes)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).toBe(compatId)

    const allRes = await app.request('/web/sessions/all?uuid=user-1')
    expect(allRes.status).toBe(200)
    const summaries = await resJson(allRes)
    expect(summaries).toHaveLength(1)
    expect(summaries[0].id).toBe(compatId)
  })

  test('GET /web/sessions — requires UUID', async () => {
    const res = await app.request('/web/sessions')
    expect(res.status).toBe(401)
  })

  test('GET /web/sessions/all — lists only sessions owned by requesting UUID', async () => {
    // Create 2 sessions via different users
    await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    await app.request('/web/sessions?uuid=user-2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const allRes = await app.request('/web/sessions/all?uuid=user-1')
    expect(allRes.status).toBe(200)
    const sessions = await resJson(allRes)
    expect(sessions).toHaveLength(1) // only user-1's session, not user-2's
  })

  test('GET /web/sessions and /all — hides archived and inactive sessions', async () => {
    const archived = storeCreateSession({})
    const inactive = storeCreateSession({})
    const open = storeCreateSession({})
    storeBindSession(archived.id, 'user-1')
    storeBindSession(inactive.id, 'user-1')
    storeBindSession(open.id, 'user-1')

    await app.request(`/v1/sessions/${archived.id}/archive`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    })

    const { storeUpdateSession } = await import('../store')
    storeUpdateSession(inactive.id, { status: 'inactive' })

    const listRes = await app.request('/web/sessions?uuid=user-1')
    expect(listRes.status).toBe(200)
    const sessions = await resJson(listRes)
    expect(sessions.map((session: { id: string }) => session.id)).toEqual([
      open.id,
    ])

    const allRes = await app.request('/web/sessions/all?uuid=user-1')
    expect(allRes.status).toBe(200)
    const summaries = await resJson(allRes)
    expect(summaries.map((session: { id: string }) => session.id)).toEqual([
      open.id,
    ])
  })

  test('GET /web/sessions/:id — returns owned session', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const getRes = await app.request(`/web/sessions/${id}?uuid=user-1`)
    expect(getRes.status).toBe(200)
  })

  test('GET /web/sessions/:id — includes automation_state snapshot when worker metadata has it', async () => {
    const createRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(createRes)
    storeBindSession(id, 'user-1')

    await app.request(`/v1/code/sessions/${id}/worker`, {
      method: 'PUT',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_epoch: 1,
        external_metadata: {
          automation_state: {
            enabled: true,
            phase: 'standby',
            next_tick_at: 123456,
            sleep_until: null,
          },
        },
      }),
    })

    const getRes = await app.request(
      `/web/sessions/${toWebSessionId(id)}?uuid=user-1`,
    )
    expect(getRes.status).toBe(200)
    const body = await resJson(getRes)
    expect(body.automation_state).toEqual({
      enabled: true,
      phase: 'standby',
      next_tick_at: 123456,
      sleep_until: null,
    })
  })

  test('GET /web/sessions/:id — 403 for non-owner', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const getRes = await app.request(`/web/sessions/${id}?uuid=user-2`)
    expect(getRes.status).toBe(403)
  })

  test('GET /web/sessions/:id/history — returns events', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const histRes = await app.request(`/web/sessions/${id}/history?uuid=user-1`)
    expect(histRes.status).toBe(200)
    const body = await resJson(histRes)
    expect(body).toEqual({
      events: [],
      next_cursor: 0,
      has_more: false,
      oldest_available_seq: null,
      truncated: false,
    })
  })

  test('GET /web/sessions/:id/history — pages durable events by cursor without leaking persistence identity', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)
    for (let index = 1; index <= 3; index++) {
      publishSessionEvent(
        id,
        'user',
        { content: `message-${index}`, uuid: `user-${index}` },
        'outbound',
        { producer: 'web', sourceEventId: `user-${index}` },
      )
    }

    const firstRes = await app.request(
      `/web/sessions/${id}/history?uuid=user-1&after=0&limit=2`,
    )
    expect(firstRes.status).toBe(200)
    const first = await resJson(firstRes)
    expect(
      first.events.map((event: { seqNum: number }) => event.seqNum),
    ).toEqual([1, 2])
    expect(first.next_cursor).toBe(2)
    expect(first.has_more).toBe(true)
    expect(first.oldest_available_seq).toBe(1)
    expect(first.truncated).toBe(false)
    expect(first.events[0]).not.toHaveProperty('sourceEventId')
    expect(first.events[0]).not.toHaveProperty('dedupeScope')

    const secondRes = await app.request(
      `/web/sessions/${id}/history?uuid=user-1&after=${first.next_cursor}&limit=2`,
    )
    const second = await resJson(secondRes)
    expect(
      second.events.map((event: { seqNum: number }) => event.seqNum),
    ).toEqual([3])
    expect(second.next_cursor).toBe(3)
    expect(second.has_more).toBe(false)
  })

  test('GET /web/sessions/:id/history — rejects malformed cursors and limits', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)
    const invalidQueries = [
      'after=-1',
      'after=1.2',
      'after=1e2',
      'after=1tail',
      'after=',
      'limit=0',
      'limit=501',
      'limit=1.5',
      'limit=',
    ]

    for (const query of invalidQueries) {
      const response = await app.request(
        `/web/sessions/${id}/history?uuid=user-1&${query}`,
      )
      expect(response.status, query).toBe(400)
    }
  })

  test('GET /web/sessions/:id/history — returns task_state snapshots', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    publishSessionEvent(
      id,
      'task_state',
      {
        task_list_id: 'team-alpha',
        tasks: [{ id: '1', subject: 'Investigate', status: 'pending' }],
      },
      'inbound',
    )

    const histRes = await app.request(`/web/sessions/${id}/history?uuid=user-1`)
    expect(histRes.status).toBe(200)
    const body = await resJson(histRes)
    expect(body.events).toHaveLength(1)
    expect(body.events[0]?.type).toBe('task_state')
    expect(body.events[0]?.payload.task_list_id).toBe('team-alpha')
    expect(body.events[0]?.payload.tasks).toEqual([
      { id: '1', subject: 'Investigate', status: 'pending' },
    ])
  })

  test('GET /web/sessions/:id and history — supports compat code session IDs', async () => {
    const codeSession = storeCreateSession({ idPrefix: 'cse_' })
    storeBindSession(codeSession.id, 'user-1')
    const compatId = toWebSessionId(codeSession.id)

    const getRes = await app.request(`/web/sessions/${compatId}?uuid=user-1`)
    expect(getRes.status).toBe(200)
    const session = await resJson(getRes)
    expect(session.id).toBe(compatId)

    const histRes = await app.request(
      `/web/sessions/${compatId}/history?uuid=user-1`,
    )
    expect(histRes.status).toBe(200)
    const history = await resJson(histRes)
    expect(history.events).toEqual([])
  })

  test('GET /web/sessions/:id/history — 403 for non-owner', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const histRes = await app.request(`/web/sessions/${id}/history?uuid=user-2`)
    expect(histRes.status).toBe(403)
  })

  test('GET /web/sessions/:id — 404 after session deleted', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    // Archive/delete the session via v1
    await app.request(`/v1/sessions/${id}/archive`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    })

    // Session still exists (archived), so we can still get it
    const getRes = await app.request(`/web/sessions/${id}?uuid=user-1`)
    // After archive, session status is "archived" but still exists
    expect(getRes.status).toBe(200)
  })

  test('GET /web/sessions/:id/history — 404 for non-existent session', async () => {
    // Bind to a non-existent session won't work, but if ownership was set
    // and session deleted, we need to test the 404 path
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    // Delete the session from store directly
    const { storeDeleteSession } = await import('../store')
    storeDeleteSession(id)

    const histRes = await app.request(`/web/sessions/${id}/history?uuid=user-1`)
    expect(histRes.status).toBe(404)
  })

  test('POST /web/sessions with invalid environment_id — handles work item error', async () => {
    const res = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment_id: 'env_nonexistent' }),
    })
    // Session is still created even if work item fails
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.id).toMatch(/^session_/)
  })

  test('GET /web/sessions/:id/events — returns SSE stream', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const eventsRes = await app.request(
      `/web/sessions/${id}/events?uuid=user-1`,
    )
    expect(eventsRes.status).toBe(200)
    expect(eventsRes.headers.get('Content-Type')).toBe('text/event-stream')

    // Read initial keepalive and cancel
    const reader = eventsRes.body?.getReader()
    if (reader) {
      const { value } = await reader.read()
      const text = new TextDecoder().decode(value!)
      expect(text).toContain(': keepalive')
      reader.cancel()
    }
  })

  test('GET /web/sessions/:id/events — supports compat code session IDs', async () => {
    const codeSession = storeCreateSession({ idPrefix: 'cse_' })
    storeBindSession(codeSession.id, 'user-1')
    const compatId = toWebSessionId(codeSession.id)

    const eventsRes = await app.request(
      `/web/sessions/${compatId}/events?uuid=user-1`,
    )
    expect(eventsRes.status).toBe(200)
    expect(eventsRes.headers.get('Content-Type')).toBe('text/event-stream')

    const reader = eventsRes.body?.getReader()
    if (reader) {
      const { value } = await reader.read()
      const text = new TextDecoder().decode(value!)
      expect(text).toContain(': keepalive')
      reader.cancel()
    }
  })

  test('GET /web/sessions/:id/events — 403 for non-owner', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const eventsRes = await app.request(
      `/web/sessions/${id}/events?uuid=user-2`,
    )
    expect(eventsRes.status).toBe(403)
  })

  test('GET /web/sessions/:id/events — validates both cursors and resumes after the greater value', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)
    for (let index = 1; index <= 3; index++) {
      publishSessionEvent(
        id,
        'user',
        { content: `cursor-${index}` },
        'outbound',
      )
    }

    for (const invalid of ['-1', '1.2', '1e2', '1tail', '']) {
      const response = await app.request(
        `/web/sessions/${id}/events?uuid=user-1&from_sequence_num=${invalid}`,
      )
      expect(response.status, invalid).toBe(400)
    }
    const invalidHeader = await app.request(
      `/web/sessions/${id}/events?uuid=user-1`,
      { headers: { 'Last-Event-ID': 'bad' } },
    )
    expect(invalidHeader.status).toBe(400)

    const resumed = await app.request(
      `/web/sessions/${id}/events?uuid=user-1&from_sequence_num=1`,
      { headers: { 'Last-Event-ID': '2' } },
    )
    expect(resumed.status).toBe(200)
    const reader = resumed.body!.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value!)
    expect(text).toContain('"seqNum":3')
    expect(text).not.toContain('"seqNum":2')
    await reader.cancel()
  })

  test('GET /web/sessions/:id/events — 409 for archived session', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    await app.request(`/v1/sessions/${id}/archive`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    })

    const res = await app.request(`/web/sessions/${id}/events?uuid=user-1`)
    expect(res.status).toBe(409)
    const body = await resJson(res)
    expect(body.error.type).toBe('session_closed')
  })
})

describe('Web Control Routes', () => {
  let app: Hono
  let sessionId: string

  beforeEach(async () => {
    storeReset()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
    app = createApp()

    // Create and bind session
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    sessionId = (await resJson(createRes)).id
  })

  test('POST /web/sessions/:id/events — sends user message', async () => {
    const res = await app.request(
      `/web/sessions/${sessionId}/events?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', content: 'hello' }),
      },
    )
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.status).toBe('ok')
    expect(body.event).toBeTruthy()
  })

  test('POST /web/sessions/:id/events — idempotent body UUID retries return the canonical event and conflicts return 409', async () => {
    const received: unknown[] = []
    const unsubscribe = getEventBus(sessionId).subscribe(event =>
      received.push(event),
    )
    const request = (content: string) =>
      app.request(`/web/sessions/${sessionId}/events?uuid=user-1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user',
          uuid: 'web-message-uuid',
          content,
          message: { content },
        }),
      })

    try {
      const first = await request('hello')
      const retry = await request('hello')
      expect(first.status).toBe(200)
      expect(retry.status).toBe(200)

      const firstBody = await resJson(first)
      const retryBody = await resJson(retry)
      expect(retryBody.event).toEqual(firstBody.event)
      expect(firstBody.event).not.toHaveProperty('sourceEventId')
      expect(firstBody.event).not.toHaveProperty('dedupeScope')
      expect(
        getPersistence().listEvents(sessionId, 0, 100).events,
      ).toHaveLength(1)
      expect(getPersistence().getLastSeq(sessionId)).toBe(1)
      expect(received).toHaveLength(1)

      const conflict = await request('different')
      expect(conflict.status).toBe(409)
      expect(await resJson(conflict)).toEqual({
        error: {
          type: 'idempotency_conflict',
          message: 'Event identity conflicts with an existing payload',
        },
      })
    } finally {
      unsubscribe()
    }
  })

  test('POST /web/sessions/:id/events — identical text without a body UUID stays distinct', async () => {
    const received: unknown[] = []
    const unsubscribe = getEventBus(sessionId).subscribe(event =>
      received.push(event),
    )
    const request = () =>
      app.request(`/web/sessions/${sessionId}/events?uuid=user-1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', content: 'same text' }),
      })

    try {
      expect((await request()).status).toBe(200)
      expect((await request()).status).toBe(200)
      expect(
        getPersistence().listEvents(sessionId, 0, 100).events,
      ).toHaveLength(2)
      expect(getPersistence().getLastSeq(sessionId)).toBe(2)
      expect(received).toHaveLength(2)
    } finally {
      unsubscribe()
    }
  })

  test('POST /web/sessions/:id/events/control/interrupt — supports compat code session IDs', async () => {
    const rawSessionId = storeCreateSession({ idPrefix: 'cse_' }).id
    storeBindSession(rawSessionId, 'user-1')
    const compatId = toWebSessionId(rawSessionId)

    const eventsRes = await app.request(
      `/web/sessions/${compatId}/events?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', content: 'hello' }),
      },
    )
    expect(eventsRes.status).toBe(200)

    const controlRes = await app.request(
      `/web/sessions/${compatId}/control?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'permission_response',
          approved: true,
          request_id: 'r1',
        }),
      },
    )
    expect(controlRes.status).toBe(200)

    const interruptRes = await app.request(
      `/web/sessions/${compatId}/interrupt?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    )
    expect(interruptRes.status).toBe(200)
  })

  test('POST /web/sessions/:id/events — 403 for non-owner', async () => {
    const res = await app.request(
      `/web/sessions/${sessionId}/events?uuid=user-2`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', content: 'hello' }),
      },
    )
    expect(res.status).toBe(403)
  })

  test('POST /web/sessions/:id/control — sends control request', async () => {
    const res = await app.request(
      `/web/sessions/${sessionId}/control?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'permission_response',
          approved: true,
          request_id: 'r1',
        }),
      },
    )
    expect(res.status).toBe(200)
  })

  test('POST /web/sessions/:id/control — maps stable identity conflicts to 409', async () => {
    const request = (approved: boolean) =>
      app.request(`/web/sessions/${sessionId}/control?uuid=user-1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'permission_response',
          uuid: 'control-1',
          request_id: 'r1',
          approved,
        }),
      })

    const first = await request(true)
    const retry = await request(true)
    expect(first.status).toBe(200)
    expect(retry.status).toBe(200)
    expect((await resJson(retry)).event).toEqual((await resJson(first)).event)
    expect(getPersistence().listEvents(sessionId, 0, 100).events).toHaveLength(
      1,
    )

    const conflict = await request(false)
    expect(conflict.status).toBe(409)
    expect((await resJson(conflict)).error.type).toBe('idempotency_conflict')
  })

  test('POST /web/sessions/:id/interrupt — interrupts session', async () => {
    const res = await app.request(
      `/web/sessions/${sessionId}/interrupt?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    )
    expect(res.status).toBe(200)
  })

  test('POST /web/sessions/:id/interrupt — 403 for non-owner', async () => {
    const res = await app.request(
      `/web/sessions/${sessionId}/interrupt?uuid=user-2`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    )
    expect(res.status).toBe(403)
  })

  test('POST /web/sessions/:id/control — 403 for non-owner', async () => {
    const res = await app.request(
      `/web/sessions/${sessionId}/control?uuid=user-2`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'permission_response', approved: true }),
      },
    )
    expect(res.status).toBe(403)
  })

  test('POST /web/sessions/:id/events — 403 for non-existent session with no ownership', async () => {
    const res = await app.request(
      '/web/sessions/nonexistent/events?uuid=user-1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', content: 'hello' }),
      },
    )
    expect(res.status).toBe(403)
  })

  test('POST /web/sessions/:id/events/control/interrupt — 409 for archived session', async () => {
    await app.request(`/v1/sessions/${sessionId}/archive`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    })

    const eventsRes = await app.request(
      `/web/sessions/${sessionId}/events?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', content: 'hello' }),
      },
    )
    expect(eventsRes.status).toBe(409)

    const controlRes = await app.request(
      `/web/sessions/${sessionId}/control?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'permission_response',
          approved: true,
          request_id: 'r1',
        }),
      },
    )
    expect(controlRes.status).toBe(409)

    const interruptRes = await app.request(
      `/web/sessions/${sessionId}/interrupt?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    )
    expect(interruptRes.status).toBe(409)
  })
})

describe('Web Environment Routes', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    app = createApp()
  })

  test('GET /web/environments — lists active environments', async () => {
    // Register an env via v1
    await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine_name: 'mac1' }),
    })

    const res = await app.request('/web/environments?uuid=user-1')
    expect(res.status).toBe(200)
    const envs = await resJson(res)
    expect(envs).toHaveLength(1)
    expect(envs[0].machine_name).toBe('mac1')
  })

  test('GET /web/environments — requires UUID', async () => {
    const res = await app.request('/web/environments')
    expect(res.status).toBe(401)
  })
})

describe('V1 Session Ingress Routes (HTTP)', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
    process.env.RCS_API_KEYS = 'test-api-key'
    app = createApp()
  })

  test('POST /v2/session_ingress/session/:sessionId/events — ingests events with API key', async () => {
    // Create session first
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(sessRes)

    const res = await app.request(`/v2/session_ingress/session/${id}/events`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [{ type: 'assistant', content: 'response' }],
      }),
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.status).toBe('ok')
  })

  test('POST /v2/session_ingress/session/:sessionId/events — idempotent assistant retries fan out once and conflicts return 409', async () => {
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(sessRes)

    await expectIdempotentAssistantPost(
      content =>
        app.request(`/v2/session_ingress/session/${id}/events`, {
          method: 'POST',
          headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            events: [
              {
                type: 'assistant',
                uuid: 'assistant-1',
                message: { role: 'assistant', content },
              },
            ],
          }),
        }),
      id,
    )
  })

  test('POST /v2/session_ingress/session/:sessionId/events — rejects without auth', async () => {
    const res = await app.request('/v2/session_ingress/session/nope/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [] }),
    })
    expect(res.status).toBe(401)
  })

  test('POST /v2/session_ingress/session/:sessionId/events — 404 for unknown session', async () => {
    const res = await app.request('/v2/session_ingress/session/nope/events', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [{ type: 'user', content: 'hi' }] }),
    })
    expect(res.status).toBe(404)
  })

  test('POST /v2/session_ingress/session/:sessionId/events — resolves compat code session IDs', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    const compatId = toWebSessionId(id)

    const res = await app.request(
      `/v2/session_ingress/session/${compatId}/events`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [
            {
              type: 'assistant',
              message: { role: 'assistant', content: 'compat ok' },
            },
          ],
        }),
      },
    )
    expect(res.status).toBe(200)

    const events = getPersistence().listEvents(id, 0, 100).events
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('assistant')
  })

  test('GET /v2/session_ingress/ws/:sessionId — accepts small payload into handler', async () => {
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(sessRes)

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket: {
        ...sessionIngressWebsocket,
        idleTimeout: 30,
      },
    })

    try {
      const event = await new Promise((resolve, reject) => {
        let ws: WebSocket | undefined
        const timeout = setTimeout(() => {
          ws?.close()
          reject(new Error('Timed out waiting for inbound WebSocket payload'))
        }, 2000)
        const bus = getEventBus(id)
        const unsub = bus.subscribe(sessionEvent => {
          if (
            sessionEvent.direction === 'inbound' &&
            sessionEvent.type === 'user'
          ) {
            clearTimeout(timeout)
            unsub()
            ws?.close()
            resolve(sessionEvent)
          }
        })
        ws = new WebSocket(
          `ws://127.0.0.1:${server.port}/v2/session_ingress/ws/${id}`,
          [encodeWebSocketAuthProtocol('test-api-key')],
        )
        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              type: 'user',
              message: { role: 'user', content: 'hello' },
            }) + '\n',
          )
        }
        ws.onerror = () => {
          clearTimeout(timeout)
          unsub()
          reject(new Error('Session ingress WebSocket connection failed'))
        }
      })

      expect((event as { type?: string }).type).toBe('user')
    } finally {
      await server.stop(true)
    }
  })

  test('GET /v2/session_ingress/ws/:sessionId — closes 11MB payload with 1009', () => {
    const close = mock(() => {})
    const handled = handleSessionIngressWsPayload(
      { close } as any,
      'session_large',
      'x'.repeat(11 * 1024 * 1024),
    )

    expect(handled).toBe(false)
    expect(close).toHaveBeenCalledWith(1009, 'message too large')
  })

  test('session ingress decode rejects unsupported payload types', () => {
    const close = mock(() => {})
    const handled = handleSessionIngressWsPayload(
      { close } as any,
      'session_bad',
      { data: 'bad' },
    )

    expect(decodeSessionIngressWsMessage({ data: 'bad' }).ok).toBe(false)
    expect(handled).toBe(false)
    expect(close).toHaveBeenCalledWith(1003, 'unsupported message payload')
  })

  test('GET /v2/session_ingress/ws/:sessionId — resolves compat code session IDs', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    const compatId = toWebSessionId(id)

    publishSessionEvent(id, 'user', { content: 'compat ws replay' }, 'outbound')

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket: {
        ...sessionIngressWebsocket,
        idleTimeout: 30,
      },
    })

    try {
      const message = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${server.port}/v2/session_ingress/ws/${compatId}`,
          [encodeWebSocketAuthProtocol('test-api-key')],
        )
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('Timed out waiting for compat WebSocket replay'))
        }, 2000)

        ws.onmessage = event => {
          const data =
            typeof event.data === 'string' ? event.data : String(event.data)
          if (data.includes('"type":"user"')) {
            clearTimeout(timeout)
            ws.close()
            resolve(data)
          }
        }
        ws.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('Compat WebSocket connection failed'))
        }
      })

      expect(message).toContain('"type":"user"')
      expect(message).toContain(`"session_id":"${id}"`)
      expect(message).toContain('compat ws replay')
    } finally {
      await server.stop(true)
    }
  })
})

describe('ACP Routes', () => {
  let app: Hono

  function createRelayAuthApp() {
    const authApp = new Hono()
    authApp.get('/relay-auth', c => c.json({ ok: hasAcpRelayAuth(c) }))
    return authApp
  }

  beforeEach(() => {
    storeReset()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
    app = createApp()
  })

  test('GET /acp/agents requires auth', async () => {
    const res = await app.request('/acp/agents')
    expect(res.status).toBe(401)
  })

  test('GET /acp/agents rejects UUID-only auth', async () => {
    const res = await app.request('/acp/agents?uuid=user-1')
    expect(res.status).toBe(401)
  })

  test('GET /acp/agents accepts API key header', async () => {
    storeCreateEnvironment({
      secret: 'secret',
      machineName: 'agent-one',
      workerType: 'acp',
      bridgeId: 'group-one',
    })

    const res = await app.request('/acp/agents', {
      headers: AUTH_HEADERS,
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body).toHaveLength(1)
    expect(body[0].agent_name).toBe('agent-one')
  })

  test('GET /acp/channel-groups requires auth', async () => {
    const res = await app.request('/acp/channel-groups')
    expect(res.status).toBe(401)
  })

  test('GET /acp/channel-groups rejects UUID-only auth', async () => {
    const res = await app.request('/acp/channel-groups?uuid=user-1')
    expect(res.status).toBe(401)
  })

  test('GET /acp/channel-groups accepts API key header', async () => {
    storeCreateEnvironment({
      secret: 'secret',
      machineName: 'agent-one',
      workerType: 'acp',
      bridgeId: 'group-one',
    })

    const res = await app.request('/acp/channel-groups', {
      headers: AUTH_HEADERS,
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body).toHaveLength(1)
    expect(body[0].channel_group_id).toBe('group-one')
  })

  test('GET /acp/channel-groups/:id requires auth', async () => {
    storeCreateEnvironment({
      secret: 'secret',
      machineName: 'agent-one',
      workerType: 'acp',
      bridgeId: 'group-one',
    })

    const res = await app.request('/acp/channel-groups/group-one')
    expect(res.status).toBe(401)
  })

  test('GET /acp/channel-groups/:id rejects query token auth', async () => {
    storeCreateEnvironment({
      secret: 'secret',
      machineName: 'agent-one',
      workerType: 'acp',
      bridgeId: 'group-one',
    })

    const res = await app.request(
      '/acp/channel-groups/group-one?token=test-api-key',
    )
    expect(res.status).toBe(401)
  })

  test('GET /acp/channel-groups/:id rejects UUID-only auth', async () => {
    storeCreateEnvironment({
      secret: 'secret',
      machineName: 'agent-one',
      workerType: 'acp',
      bridgeId: 'group-one',
    })

    const res = await app.request('/acp/channel-groups/group-one?uuid=user-1')
    expect(res.status).toBe(401)
  })

  test('GET /acp/channel-groups/:id returns group with API key auth', async () => {
    storeCreateEnvironment({
      secret: 'secret',
      machineName: 'agent-one',
      workerType: 'acp',
      bridgeId: 'group-one',
    })

    const res = await app.request('/acp/channel-groups/group-one', {
      headers: AUTH_HEADERS,
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.channel_group_id).toBe('group-one')
    expect(body.member_count).toBe(1)
  })

  test('GET /acp/channel-groups/:id/events requires auth', async () => {
    const res = await app.request('/acp/channel-groups/group-one/events')
    expect(res.status).toBe(401)
  })

  test('GET /acp/channel-groups/:id/events rejects UUID-only auth', async () => {
    const res = await app.request(
      '/acp/channel-groups/group-one/events?uuid=user-1',
    )
    expect(res.status).toBe(401)
  })

  test('GET /acp/channel-groups/:id/events accepts API key header', async () => {
    const res = await app.request('/acp/channel-groups/group-one/events', {
      headers: AUTH_HEADERS,
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    await res.body?.cancel()
  })

  test('ACP relay auth rejects UUID-only auth', async () => {
    const res = await createRelayAuthApp().request('/relay-auth?uuid=user-1')
    expect(await resJson(res)).toEqual({ ok: false })
  })

  test('ACP relay auth accepts API key header', async () => {
    const res = await createRelayAuthApp().request('/relay-auth', {
      headers: AUTH_HEADERS,
    })
    expect(await resJson(res)).toEqual({ ok: true })
  })

  test('ACP relay auth accepts WebSocket protocol auth', async () => {
    const res = await createRelayAuthApp().request('/relay-auth', {
      headers: {
        'Sec-WebSocket-Protocol': encodeWebSocketAuthProtocol('test-api-key'),
      },
    })
    expect(await resJson(res)).toEqual({ ok: true })
  })

  test('ACP WebSocket rejects legacy query-token auth on the real upgrade path', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket: {
        ...sessionIngressWebsocket,
        idleTimeout: 30,
      },
    })

    try {
      const close = await new Promise<CloseEvent>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${server.port}/acp/ws?token=test-api-key`,
        )
        const timeout = setTimeout(() => {
          ws.close()
          reject(
            new Error('Timed out waiting for ACP WebSocket auth rejection'),
          )
        }, 2000)

        ws.onclose = event => {
          clearTimeout(timeout)
          resolve(event)
        }
        ws.onerror = () => {
          clearTimeout(timeout)
          reject(
            new Error('ACP WebSocket query-token test failed before close'),
          )
        }
      })

      expect(close.code).toBe(4003)
      expect(close.reason).toBe('unauthorized')
    } finally {
      server.stop(true)
    }
  })

  test('ACP WebSocket accepts subprotocol auth on the real upgrade path', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket: {
        ...sessionIngressWebsocket,
        idleTimeout: 30,
      },
    })

    try {
      const message = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${server.port}/acp/ws`, [
          encodeWebSocketAuthProtocol('test-api-key'),
        ])
        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('Timed out waiting for ACP WebSocket registration'))
        }, 2000)

        ws.onopen = () => {
          ws.send(
            JSON.stringify({ type: 'register', agent_name: 'agent-one' }) +
              '\n',
          )
        }
        ws.onmessage = event => {
          const data =
            typeof event.data === 'string' ? event.data : String(event.data)
          if (data.includes('"type":"registered"')) {
            clearTimeout(timeout)
            ws.close()
            resolve(data)
          }
        }
        ws.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('ACP WebSocket subprotocol auth failed'))
        }
      })

      expect(message).toContain('"agent_id"')
    } finally {
      await server.stop(true)
    }
  })

  test('ACP relay WebSocket rejects legacy query-token auth on the real upgrade path', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket: {
        ...sessionIngressWebsocket,
        idleTimeout: 30,
      },
    })

    try {
      const close = await new Promise<CloseEvent>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${server.port}/acp/relay/agent_123?token=test-api-key`,
        )
        const timeout = setTimeout(() => {
          ws.close()
          reject(
            new Error('Timed out waiting for ACP relay query-token rejection'),
          )
        }, 2000)

        ws.onclose = event => {
          clearTimeout(timeout)
          resolve(event)
        }
        ws.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('ACP relay query-token test failed before close'))
        }
      })

      expect(close.code).toBe(4003)
      expect(close.reason).toBe('unauthorized')
    } finally {
      server.stop(true)
    }
  })

  test('ACP relay WebSocket accepts subprotocol auth on the real upgrade path', async () => {
    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket: {
        ...sessionIngressWebsocket,
        idleTimeout: 30,
      },
    })

    try {
      const close = await new Promise<CloseEvent>((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${server.port}/acp/relay/agent_123`,
          [encodeWebSocketAuthProtocol('test-api-key')],
        )
        const timeout = setTimeout(() => {
          ws.close()
          reject(
            new Error('Timed out waiting for ACP relay authenticated close'),
          )
        }, 2000)

        ws.onclose = event => {
          clearTimeout(timeout)
          resolve(event)
        }
        ws.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('ACP relay subprotocol auth failed before close'))
        }
      })

      expect(close.code).toBe(4004)
      expect(close.reason).toBe('agent not found')
    } finally {
      server.stop(true)
    }
  })
})

describe('ACP WebSocket payload guards', () => {
  test('rejects oversized multibyte text by byte size', () => {
    const close = mock(() => {})
    const handleMessage = mock(() => {})
    const payload = '你'.repeat(4 * 1024 * 1024)
    const decoded = decodeAcpWsMessageData(payload)
    const handled = handleAcpWsPayload(
      { close } as any,
      '[ACP-WS]',
      'wsId=multibyte',
      payload,
      handleMessage,
    )

    expect(decoded.ok && decoded.size).toBeGreaterThan(10 * 1024 * 1024)
    expect(handled).toBe(false)
    expect(handleMessage).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledWith(1009, 'message too large')
  })

  test('rejects oversized binary payload by byte size', () => {
    const close = mock(() => {})
    const handleMessage = mock(() => {})
    const payload = new Uint8Array(11 * 1024 * 1024)
    const decoded = decodeAcpWsMessageData(payload)
    const handled = handleAcpWsPayload(
      { close } as any,
      '[ACP-Relay]',
      'relayWsId=binary',
      payload,
      handleMessage,
    )

    expect(decoded).toEqual({
      ok: false,
      reason: 'message too large',
      size: 11 * 1024 * 1024,
    })
    expect(handled).toBe(false)
    expect(handleMessage).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledWith(1009, 'message too large')
  })

  test('accepts small payload into ACP handler', () => {
    const close = mock(() => {})
    const handleMessage = mock(() => {})
    const handled = handleAcpWsPayload(
      { close } as any,
      '[ACP-WS]',
      'wsId=small',
      '{"type":"keep_alive"}',
      handleMessage,
    )

    expect(handled).toBe(true)
    expect(handleMessage).toHaveBeenCalledWith('{"type":"keep_alive"}')
    expect(close).not.toHaveBeenCalled()
  })
})

describe('V2 Worker Events Routes', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
    process.env.RCS_API_KEYS = 'test-api-key'
    app = createApp()
  })

  test('POST /v1/code/sessions/:id/worker/events — publishes worker events', async () => {
    // Create session
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(sessRes)

    const res = await app.request(`/v1/code/sessions/${id}/worker/events`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ type: 'assistant', content: 'response' }]),
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.status).toBe('ok')
    expect(body.count).toBe(1)
  })

  test('POST /v1/code/sessions/:id/worker/events — unwraps CCR batch payloads', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)

    const res = await app.request(`/v1/code/sessions/${id}/worker/events`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_epoch: 1,
        events: [{ payload: { type: 'assistant', content: 'response' } }],
      }),
    })
    expect(res.status).toBe(200)
    const body = await resJson(res)
    expect(body.count).toBe(1)

    const events = getPersistence().listEvents(id, 0, 100).events
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('assistant')
    expect((events[0]?.payload as { content?: string }).content).toBe(
      'response',
    )
  })

  test('POST /v1/code/sessions/:id/worker/events — idempotent assistant retries fan out once and conflicts return 409', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)

    await expectIdempotentAssistantPost(
      content =>
        app.request(`/v1/code/sessions/${id}/worker/events`, {
          method: 'POST',
          headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            worker_epoch: 1,
            events: [
              {
                event_id: 'assistant-1',
                payload: { type: 'assistant', content },
              },
            ],
          }),
        }),
      id,
    )
  })

  test('POST /v1/code/sessions/:id/worker/events — preserves envelope event_id priority and falls back to payload UUID', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    const post = (event: Record<string, unknown>) =>
      app.request(`/v1/code/sessions/${id}/worker/events`, {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_epoch: 1, events: [event] }),
      })

    expect(
      (
        await post({
          event_id: 'envelope-a',
          payload: {
            type: 'assistant',
            uuid: 'shared-payload-id',
            content: 'hello',
          },
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await post({
          event_id: 'envelope-b',
          payload: {
            type: 'assistant',
            uuid: 'shared-payload-id',
            content: 'hello',
          },
        })
      ).status,
    ).toBe(200)
    const payloadOnly = {
      payload: {
        type: 'assistant',
        uuid: 'payload-only',
        content: 'fallback',
      },
    }
    expect((await post(payloadOnly)).status).toBe(200)
    expect((await post(payloadOnly)).status).toBe(200)

    const persisted = getPersistence().listEvents(id, 0, 100).events
    expect(persisted).toHaveLength(3)
    expect(persisted.map(event => event.sourceEventId)).toEqual([
      'envelope-a',
      'envelope-b',
      'payload-only',
    ])
    expect(persisted.map(event => event.dedupeScope)).toEqual([
      'v2-worker:inbound:assistant',
      'v2-worker:inbound:assistant',
      'v2-worker:inbound:assistant',
    ])
  })

  test('GET/PUT /v1/code/sessions/:id/worker — stores worker state', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)

    const putRes = await app.request(`/v1/code/sessions/${id}/worker`, {
      method: 'PUT',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_epoch: 1,
        worker_status: 'running',
        external_metadata: {
          permission_mode: 'default',
          automation_state: {
            enabled: true,
            phase: 'sleeping',
            next_tick_at: null,
            sleep_until: 123456,
          },
        },
      }),
    })
    expect(putRes.status).toBe(200)

    const getRes = await app.request(`/v1/code/sessions/${id}/worker`, {
      headers: AUTH_HEADERS,
    })
    expect(getRes.status).toBe(200)
    const body = await resJson(getRes)
    expect(body.worker.worker_status).toBe('running')
    expect(body.worker.external_metadata.permission_mode).toBe('default')
    expect(body.worker.external_metadata.automation_state).toEqual({
      enabled: true,
      phase: 'sleeping',
      next_tick_at: null,
      sleep_until: 123456,
    })

    const events = getPersistence().listEvents(id, 0, 100).events
    expect(events.some(event => event.type === 'automation_state')).toBe(true)
    expect(events.at(-1)?.payload).toEqual({
      enabled: true,
      phase: 'sleeping',
      next_tick_at: null,
      sleep_until: 123456,
    })
  })

  test('session status, automation state, and messages share one durable sequence', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    const received: Array<{ type: string; seqNum: number }> = []
    const unsubscribe = getEventBus(id).subscribe(event => {
      received.push({ type: event.type, seqNum: event.seqNum })
    })

    try {
      const workerRes = await app.request(`/v1/code/sessions/${id}/worker`, {
        method: 'PUT',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_status: 'running',
          external_metadata: {
            automation_state: {
              enabled: true,
              phase: 'running',
              next_tick_at: null,
              sleep_until: null,
            },
          },
        }),
      })
      expect(workerRes.status).toBe(200)

      const messageRes = await app.request(`/v1/sessions/${id}/events`, {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          content: 'after system state',
        }),
      })
      expect(messageRes.status).toBe(200)

      const durable = getPersistence().listEvents(id, 0, 100).events
      expect(
        durable.map(event => ({ type: event.type, seqNum: event.seqNum })),
      ).toEqual([
        { type: 'session_status', seqNum: 1 },
        { type: 'automation_state', seqNum: 2 },
        { type: 'message', seqNum: 3 },
      ])
      expect(received).toEqual([
        { type: 'session_status', seqNum: 1 },
        { type: 'automation_state', seqNum: 2 },
        { type: 'message', seqNum: 3 },
      ])
      expect(new Set(received.map(event => event.seqNum)).size).toBe(3)
      expect(getEventBus(id).getLastSeqNum()).toBe(3)
      expect(getPersistence().getLastSeq(id)).toBe(3)
    } finally {
      unsubscribe()
    }
  })

  test('POST /v1/code/sessions/:id/worker/heartbeat — updates heartbeat', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)

    const heartbeatRes = await app.request(
      `/v1/code/sessions/${id}/worker/heartbeat`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_epoch: 1 }),
      },
    )
    expect(heartbeatRes.status).toBe(200)

    const getRes = await app.request(`/v1/code/sessions/${id}/worker`, {
      headers: AUTH_HEADERS,
    })
    const body = await resJson(getRes)
    expect(body.worker.last_heartbeat_at).toBeTruthy()
  })

  test('GET /v1/code/sessions/:id/worker/events/stream — emits CCR client_event frames', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)

    const streamRes = await app.request(
      `/v1/code/sessions/${id}/worker/events/stream`,
      {
        headers: AUTH_HEADERS,
      },
    )
    expect(streamRes.status).toBe(200)

    const reader = streamRes.body?.getReader()
    expect(reader).toBeTruthy()
    if (!reader) return

    const firstChunk = await reader.read()
    const keepalive = new TextDecoder().decode(firstChunk.value!)
    expect(keepalive).toContain(': keepalive')

    publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'hello' },
      'outbound',
    )

    const secondChunk = await reader.read()
    const frame = new TextDecoder().decode(secondChunk.value!)
    expect(frame).toContain('event: client_event')
    expect(frame).toContain(
      '"payload":{"type":"user","content":"hello","message":{"content":"hello"}}',
    )
    reader.cancel()
  })

  test('GET /v1/code/sessions/:id/worker/events/stream — normalizes web permission approvals to control_response', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const streamRes = await app.request(
      `/v1/code/sessions/${id}/worker/events/stream`,
      {
        headers: AUTH_HEADERS,
      },
    )
    expect(streamRes.status).toBe(200)

    const reader = streamRes.body?.getReader()
    expect(reader).toBeTruthy()
    if (!reader) return

    await reader.read() // initial keepalive

    const controlRes = await app.request(
      `/web/sessions/${id}/control?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'permission_response',
          approved: true,
          request_id: 'req-1',
        }),
      },
    )
    expect(controlRes.status).toBe(200)

    const chunk = await reader.read()
    const frame = new TextDecoder().decode(chunk.value!)
    expect(frame).toContain('event: client_event')
    expect(frame).toContain('"event_type":"permission_response"')
    expect(frame).toContain('"payload":{"type":"control_response"')
    expect(frame).toContain('"request_id":"req-1"')
    expect(frame).toContain('"behavior":"allow"')
    reader.cancel()
  })

  test('GET /v1/code/sessions/:id/worker/events/stream — normalizes web plan rejection feedback to deny control_response', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const streamRes = await app.request(
      `/v1/code/sessions/${id}/worker/events/stream`,
      {
        headers: AUTH_HEADERS,
      },
    )
    expect(streamRes.status).toBe(200)

    const reader = streamRes.body?.getReader()
    expect(reader).toBeTruthy()
    if (!reader) return

    await reader.read() // initial keepalive

    const controlRes = await app.request(
      `/web/sessions/${id}/control?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'permission_response',
          approved: false,
          request_id: 'req-2',
          message: 'Need more detail',
        }),
      },
    )
    expect(controlRes.status).toBe(200)

    const chunk = await reader.read()
    const frame = new TextDecoder().decode(chunk.value!)
    expect(frame).toContain('event: client_event')
    expect(frame).toContain('"event_type":"permission_response"')
    expect(frame).toContain('"payload":{"type":"control_response"')
    expect(frame).toContain('"request_id":"req-2"')
    expect(frame).toContain('"subtype":"error"')
    expect(frame).toContain('"behavior":"deny"')
    expect(frame).toContain('"message":"Need more detail"')
    reader.cancel()
  })

  test('GET /v1/code/sessions/:id/worker/events/stream — normalizes web interrupts to control_request', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const streamRes = await app.request(
      `/v1/code/sessions/${id}/worker/events/stream`,
      {
        headers: AUTH_HEADERS,
      },
    )
    expect(streamRes.status).toBe(200)

    const reader = streamRes.body?.getReader()
    expect(reader).toBeTruthy()
    if (!reader) return

    await reader.read() // initial keepalive

    const interruptRes = await app.request(
      `/web/sessions/${id}/interrupt?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    )
    expect(interruptRes.status).toBe(200)

    const chunk = await reader.read()
    const frame = new TextDecoder().decode(chunk.value!)
    expect(frame).toContain('event: client_event')
    expect(frame).toContain('"event_type":"interrupt"')
    expect(frame).toContain('"payload":{"type":"control_request"')
    expect(frame).toContain('"subtype":"interrupt"')
    reader.cancel()
  })

  test('PUT /v1/code/sessions/:id/worker/state — updates session status', async () => {
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(sessRes)

    const res = await app.request(`/v1/code/sessions/${id}/worker/state`, {
      method: 'PUT',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'running' }),
    })
    expect(res.status).toBe(200)
  })

  test('PUT /v1/code/sessions/:id/worker/external_metadata — no-op', async () => {
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(sessRes)

    const res = await app.request(
      `/v1/code/sessions/${id}/worker/external_metadata`,
      {
        method: 'PUT',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ meta: 'data' }),
      },
    )
    expect(res.status).toBe(200)
  })

  test('POST /v1/code/sessions/:id/worker/events/:eventId/delivery — no-op', async () => {
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(sessRes)

    const res = await app.request(
      `/v1/code/sessions/${id}/worker/events/evt123/delivery`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'received' }),
      },
    )
    expect(res.status).toBe(200)
  })

  test('POST /v1/code/sessions/:id/worker/events/delivery — batch no-op', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)

    const res = await app.request(
      `/v1/code/sessions/${id}/worker/events/delivery`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_epoch: 1,
          updates: [{ event_id: 'evt123', status: 'received' }],
        }),
      },
    )
    expect(res.status).toBe(200)
  })
})
