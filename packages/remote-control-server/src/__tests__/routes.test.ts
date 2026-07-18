import { describe, test, expect, beforeEach, mock } from 'bun:test'

// res.json() returns Promise<unknown> in strict mode; this helper narrows for test assertions
function resJson(res: Response) {
  return res.json() as Promise<any>
}

async function readStreamUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string,
  maxChunks = 8,
): Promise<string> {
  let text = ''
  for (let i = 0; i < maxChunks; i++) {
    const chunk = await reader.read()
    if (chunk.done) break
    text += new TextDecoder().decode(chunk.value)
    if (text.includes(marker)) return text
  }
  return text
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
  singleUser: false,
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
  storeGetEnvironment,
  storeGetProject,
  storeGetSession,
  storeGetPendingWorkItem,
  storeUpdateEnvironment,
  storeUpdateWorkItem,
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
import {
  completeEnvironmentCommand,
  createEnvironmentCommand,
} from '../services/environment-command'
import { upsertCodeProject } from '../services/project'

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
import webChat from '../routes/web/chat'
import webCode from '../routes/web/code'
import webProviders from '../routes/web/providers'

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
  app.route('/web', webChat)
  app.route('/web', webCode)
  app.route('/web', webProviders)
  app.route('/acp', acpRoutes)
  return app
}

describe('Web Provider Routes', () => {
  test('forbids reading a provider catalog from another account', async () => {
    const environment = storeCreateEnvironment({
      secret: 'provider-owner-secret',
      accountId: 'web:owner-a',
      capabilities: providerCatalogCapabilities('model-a'),
    })
    const response = await createApp().request(
      `/web/environments/${environment.id}/providers?uuid=owner-b`,
    )

    expect(response.status).toBe(403)
  })

  test('returns a fresh redacted catalog from the environment worker', async () => {
    const environment = storeCreateEnvironment({
      secret: 'provider-catalog-secret',
      accountId: 'web:provider-owner',
      capabilities: providerCatalogCapabilities('model-a'),
    })
    const responsePromise = createApp().request(
      `/web/environments/${environment.id}/providers?uuid=provider-owner`,
    )
    let command = getPersistence().listPendingEnvironmentCommands(
      environment.id,
    )[0]
    for (let attempt = 0; !command && attempt < 20; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1))
      command = getPersistence().listPendingEnvironmentCommands(
        environment.id,
      )[0]
    }
    expect(command?.kind).toBe('get_provider_catalog')
    completeEnvironmentCommand({
      commandId: command!.id,
      environmentId: environment.id,
      result: {
        kind: 'get_provider_catalog',
        ok: true,
        catalog:
          providerCatalogCapabilities('model-b').provider_model_catalog_v1,
      },
    })

    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(await resJson(response)).toMatchObject({
      stale: false,
      catalog: { revision: 5 },
    })
  })

  test('maps provider revision conflicts without accepting secret fields', async () => {
    const capabilities = providerCatalogCapabilities('model-a')
    capabilities.provider_model_catalog_v1.features.catalogWrite = true
    const environment = storeCreateEnvironment({
      secret: 'provider-mutation-secret',
      accountId: 'web:provider-editor',
      capabilities,
    })
    const forbidden = await createApp().request(
      `/web/environments/${environment.id}/providers/default?uuid=provider-editor`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation_id: '11111111-1111-4111-8111-111111111111',
          expected_revision: 4,
          model: null,
          api_key: 'must-not-enter-command',
        }),
      },
    )
    expect(forbidden.status).toBe(400)
    expect(
      getPersistence().listPendingEnvironmentCommands(environment.id),
    ).toHaveLength(0)

    const responsePromise = createApp().request(
      `/web/environments/${environment.id}/providers/default?uuid=provider-editor`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation_id: '22222222-2222-4222-8222-222222222222',
          expected_revision: 4,
          model: {
            provider_id: 'custom-openai',
            model_profile_id: 'model-b',
          },
          allow_unverified: false,
        }),
      },
    )
    let command = getPersistence().listPendingEnvironmentCommands(
      environment.id,
    )[0]
    for (let attempt = 0; !command && attempt < 20; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1))
      command = getPersistence().listPendingEnvironmentCommands(
        environment.id,
      )[0]
    }
    completeEnvironmentCommand({
      commandId: command!.id,
      environmentId: environment.id,
      result: {
        kind: 'set_default_model',
        ok: false,
        errorCode: 'provider_revision_conflict',
        catalog:
          providerCatalogCapabilities('model-b').provider_model_catalog_v1,
      },
    })

    const response = await responsePromise
    expect(response.status).toBe(409)
    expect(await resJson(response)).toMatchObject({
      error: { type: 'provider_revision_conflict' },
      catalog: { revision: 5 },
    })
  })

  test('relays provider ciphertext without persisting it in the command', async () => {
    const capabilities = providerCatalogCapabilities('model-a')
    capabilities.provider_model_catalog_v1.features.catalogWrite = true
    capabilities.provider_model_catalog_v1.features.secretControl = true
    const environment = storeCreateEnvironment({
      secret: 'provider-secret-relay',
      accountId: 'web:provider-secret-owner',
      capabilities,
    })
    const responsePromise = createApp().request(
      `/web/environments/${environment.id}/providers/custom-openai/auth/secret?uuid=provider-secret-owner`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation_id: '33333333-3333-4333-8333-333333333333',
          method: 'api-key',
          envelope: {
            algorithm: 'P256-HKDF-SHA256-AESGCM',
            browser_public_key: 'browser-public-key',
            iv: 'encrypted-iv',
            ciphertext: 'encrypted-credential',
          },
        }),
      },
    )
    let command = getPersistence().listPendingEnvironmentCommands(
      environment.id,
    )[0]
    for (let attempt = 0; !command && attempt < 20; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1))
      command = getPersistence().listPendingEnvironmentCommands(
        environment.id,
      )[0]
    }

    expect(command?.kind).toBe('begin_provider_secret')
    expect(JSON.stringify(command?.payload)).not.toContain(
      'encrypted-credential',
    )
    completeEnvironmentCommand({
      commandId: command!.id,
      environmentId: environment.id,
      result: {
        kind: 'begin_provider_secret',
        ok: true,
        value: { configured: true },
        catalog: capabilities.provider_model_catalog_v1,
      },
    })

    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(await resJson(response)).toMatchObject({
      value: { configured: true },
    })
  })
})

const AUTH_HEADERS = {
  Authorization: 'Bearer test-api-key',
  'X-Username': 'testuser',
}

function providerCatalogCapabilities(defaultModelId: 'model-a' | 'model-b') {
  return {
    provider_model_catalog_v1: {
      version: 1,
      revision: defaultModelId === 'model-a' ? 4 : 5,
      defaultModel: {
        providerId: 'custom-openai',
        modelProfileId: defaultModelId,
      },
      providers: [
        {
          id: 'custom-openai',
          displayName: 'Custom OpenAI',
          kind: 'openai-compatible',
          baseUrl: 'https://example.test/v1',
          auth: {
            scheme: 'api-key',
            source: 'environment',
            envName: 'CUSTOM_OPENAI_API_KEY',
            configured: true,
          },
          compatRule: 'permissive',
          enabled: true,
          archived: false,
          models: [
            {
              id: 'model-a',
              displayName: 'Model A',
              remoteModelId: 'remote-a',
              enabled: true,
              archived: false,
              validation: { status: 'valid' },
            },
            {
              id: 'model-b',
              displayName: 'Model B',
              remoteModelId: 'remote-b',
              enabled: true,
              archived: false,
              validation: { status: 'valid' },
            },
          ],
        },
      ],
      features: {
        catalogWrite: false,
        sessionPersistence: false,
        runtimeSwitch: false,
        secretControl: false,
      },
    },
  }
}

function toWebSessionId(sessionId: string): string {
  if (!sessionId.startsWith('cse_')) return sessionId
  return `session_${sessionId.slice('cse_'.length)}`
}

function currentWorkerEpoch(sessionId: string): number {
  return storeGetSession(sessionId)?.workerEpoch ?? 0
}

function workerStreamPath(
  sessionId: string,
  workerEpoch = storeGetSession(sessionId)?.workerEpoch ?? 0,
  fromSequenceNum?: number,
): string {
  const query = new URLSearchParams({ worker_epoch: String(workerEpoch) })
  if (fromSequenceNum !== undefined) {
    query.set('from_sequence_num', String(fromSequenceNum))
  }
  return `/v1/code/sessions/${sessionId}/worker/events/stream?${query}`
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
    mockConfig.singleUser = false
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

  test('a poll from the current lease restores an offline environment', async () => {
    const registered = await resJson(
      await app.request('/v1/environments/bridge', {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-recovery',
          workspace_key: 'wrk-recovery',
          connection_id: 'connection-current',
          worker_type: 'claude_code',
        }),
      }),
    )
    storeUpdateEnvironment(registered.environment_id, { status: 'offline' })

    const poll = await app.request(
      `/v1/environments/${registered.environment_id}/work/poll`,
      {
        headers: {
          ...AUTH_HEADERS,
          'X-Bridge-Lease': registered.lease_token,
        },
      },
    )

    expect(poll.status).toBe(204)
    expect(storeGetEnvironment(registered.environment_id)?.status).toBe(
      'active',
    )
  })

  test('new registration fences every environment route used by the old lease', async () => {
    const register = (connectionId: string) =>
      app.request('/v1/environments/bridge', {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: 'device-a',
          device_name: 'macbook',
          workspace_key: 'wrk-repo',
          connection_id: connectionId,
          worker_type: 'claude_code',
        }),
      })

    const first = await resJson(await register('connection-1'))
    const second = await resJson(await register('connection-2'))
    expect(second.environment_id).toBe(first.environment_id)
    storeUpdateEnvironment(first.environment_id, { status: 'offline' })

    const oldPoll = await app.request(
      `/v1/environments/${first.environment_id}/work/poll`,
      {
        headers: { ...AUTH_HEADERS, 'X-Bridge-Lease': first.lease_token },
      },
    )
    expect(oldPoll.status).toBe(409)
    expect(await resJson(oldPoll)).toMatchObject({
      error: { type: 'lease_superseded' },
    })
    expect(storeGetEnvironment(first.environment_id)?.status).toBe('offline')

    const oldDelete = await app.request(
      `/v1/environments/bridge/${first.environment_id}`,
      {
        method: 'DELETE',
        headers: { ...AUTH_HEADERS, 'X-Bridge-Lease': first.lease_token },
      },
    )
    expect(oldDelete.status).toBe(409)
    expect(storeGetEnvironment(first.environment_id)?.status).toBe('offline')

    const currentPoll = await app.request(
      `/v1/environments/${second.environment_id}/work/poll`,
      {
        headers: { ...AUTH_HEADERS, 'X-Bridge-Lease': second.lease_token },
      },
    )
    expect(currentPoll.status).toBe(204)
    expect(storeGetEnvironment(second.environment_id)?.status).toBe('active')

    const currentDelete = await app.request(
      `/v1/environments/bridge/${first.environment_id}`,
      {
        method: 'DELETE',
        headers: { ...AUTH_HEADERS, 'X-Bridge-Lease': second.lease_token },
      },
    )
    expect(currentDelete.status).toBe(200)
    expect(storeGetEnvironment(first.environment_id)?.status).toBe(
      'deregistered',
    )
  })

  test('single-user mode scopes every authenticated bridge to one account', async () => {
    mockConfig.singleUser = true
    const body = {
      device_id: 'device-a',
      device_name: 'macbook',
      workspace_key: 'wrk-repo',
      worker_type: 'claude_code',
    }
    const first = await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: {
        ...AUTH_HEADERS,
        'X-Username': 'alice',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, connection_id: 'connection-1' }),
    })
    const second = await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: {
        ...AUTH_HEADERS,
        'X-Username': 'bob',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...body, connection_id: 'connection-2' }),
    })

    expect((await resJson(second)).environment_id).toBe(
      (await resJson(first)).environment_id,
    )
  })

  test('re-registration requeues durable sessions after an offline message', async () => {
    const registrationBody = {
      device_id: 'device-a',
      device_name: 'macbook',
      workspace_key: 'wrk-repo',
      worker_type: 'claude_code',
    }
    const firstRegistration = await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...registrationBody,
        connection_id: 'connection-1',
      }),
    })
    const first = await resJson(firstRegistration)
    const create = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment_id: first.environment_id }),
    })
    const session = await resJson(create)
    const originalWork = storeGetPendingWorkItem(first.environment_id)
    expect(originalWork?.sessionId).toBe(session.id)
    storeUpdateWorkItem(originalWork!.id, { state: 'completed' })

    await app.request(`/v1/environments/bridge/${first.environment_id}`, {
      method: 'DELETE',
      headers: { ...AUTH_HEADERS, 'X-Bridge-Lease': first.lease_token },
    })
    const offlineMessage = await app.request(
      `/web/sessions/${session.id}/events?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'user',
          uuid: 'offline-message',
          content: 'continue later',
        }),
      },
    )
    expect(offlineMessage.status).toBe(200)

    const secondRegistration = await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...registrationBody,
        connection_id: 'connection-2',
      }),
    })
    const second = await resJson(secondRegistration)

    expect(second.environment_id).toBe(first.environment_id)
    expect(storeGetPendingWorkItem(second.environment_id)?.sessionId).toBe(
      session.id,
    )
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

  test('completes an environment command only through its leased environment', async () => {
    const command = createEnvironmentCommand({
      environmentId: envId,
      ownerId: 'owner-1',
      kind: 'list_directory',
      payload: { path: '/workspace' },
    })
    await app.request(`/v1/environments/${envId}/work/poll`, {
      headers: AUTH_HEADERS,
    })

    const other = storeCreateEnvironment({ secret: 'other' })
    const wrongEnvironment = await app.request(
      `/v1/environments/${other.id}/work/${command.id}/result`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: { path: '/workspace', entries: [] } }),
      },
    )
    expect(wrongEnvironment.status).toBe(404)

    const unauthenticated = await app.request(
      `/v1/environments/${envId}/work/${command.id}/result`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: { path: '/workspace', entries: [] } }),
      },
    )
    expect(unauthenticated.status).toBe(401)

    const completed = await app.request(
      `/v1/environments/${envId}/work/${command.id}/result`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: { path: '/workspace', entries: [] } }),
      },
    )
    expect(completed.status).toBe(200)
    expect(getPersistence().getEnvironmentCommand(command.id)).toMatchObject({
      state: 'completed',
      result: { path: '/workspace', entries: [] },
    })

    const duplicate = await app.request(
      `/v1/environments/${envId}/work/${command.id}/result`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: { path: '/different', entries: ['late'] },
        }),
      },
    )
    expect(duplicate.status).toBe(200)
    expect(getPersistence().getEnvironmentCommand(command.id)).toMatchObject({
      state: 'completed',
      result: { path: '/workspace', entries: [] },
    })
  })

  test('rejects ambiguous environment command completion bodies', async () => {
    const command = createEnvironmentCommand({
      environmentId: envId,
      ownerId: 'owner-1',
      kind: 'probe_workspace',
      payload: { path: '/workspace' },
    })
    const response = await app.request(
      `/v1/environments/${envId}/work/${command.id}/result`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: { exists: true }, error: 'also error' }),
      },
    )

    expect(response.status).toBe(400)
    expect(getPersistence().getEnvironmentCommand(command.id)?.state).toBe(
      'pending',
    )
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

describe('Product Web Routes', () => {
  let app: Hono

  beforeEach(() => {
    storeReset()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
    app = createApp()
  })

  test('creates chat projects and increments prompt revisions only on change', async () => {
    const createResponse = await app.request('/web/chat/projects?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Research' }),
    })
    expect(createResponse.status).toBe(200)
    const project = await resJson(createResponse)
    expect(project).toMatchObject({
      product: 'chat',
      name: 'Research',
      project_prompt: '',
      prompt_revision: 0,
    })

    const updateResponse = await app.request(
      `/web/chat/projects/${project.id}/prompt?uuid=user-1`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Cite sources.' }),
      },
    )
    expect(updateResponse.status).toBe(200)
    expect(await resJson(updateResponse)).toMatchObject({
      project_prompt: 'Cite sources.',
      prompt_revision: 1,
    })

    const unchangedResponse = await app.request(
      `/web/chat/projects/${project.id}/prompt?uuid=user-1`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Cite sources.' }),
      },
    )
    expect(await resJson(unchangedResponse)).toMatchObject({
      prompt_revision: 1,
    })
  })

  test('keeps chat and code session lists disjoint', async () => {
    storeCreateEnvironment({
      secret: 'chat-runtime',
      accountId: 'web:user-1',
      capabilities: { chat: true, chat_sandbox: true },
    })
    const chatCreate = await app.request('/web/chat/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Chat' }),
    })
    expect(chatCreate.status).toBe(200)
    const legacyCodeCreate = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Code' }),
    })
    expect(legacyCodeCreate.status).toBe(200)

    const chatSessions = await resJson(
      await app.request('/web/chat/sessions?uuid=user-1'),
    )
    const codeSessions = await resJson(
      await app.request('/web/code/sessions?uuid=user-1'),
    )
    expect(chatSessions).toHaveLength(1)
    expect(chatSessions[0].product).toBe('chat')
    expect(codeSessions).toHaveLength(1)
    expect(codeSessions[0].product).toBe('code')
  })

  test('rejects assigning a code session to a chat project', async () => {
    const projectResponse = await app.request(
      '/web/chat/projects?uuid=user-1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Research' }),
      },
    )
    const project = await resJson(projectResponse)
    const sessionResponse = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Code' }),
    })
    const session = await resJson(sessionResponse)

    const response = await app.request(
      `/web/chat/sessions/${session.id}/project?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id }),
      },
    )
    expect(response.status).toBe(400)
    expect((await resJson(response)).error.message).toMatch(/product mismatch/)
  })

  test('creates a Code session only after remote workspace resolution', async () => {
    const environment = storeCreateEnvironment({
      secret: 'secret',
      accountId: 'web:user-1',
      deviceId: 'device-1',
    })
    const responsePromise = app.request('/web/code/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environment_id: environment.id,
        requested_directory: '/repo-link',
        title: 'Implement feature',
        permission_mode: 'default',
      }),
    })

    let command = getPersistence().listPendingEnvironmentCommands(
      environment.id,
    )[0]
    for (let attempt = 0; !command && attempt < 20; attempt++) {
      await Bun.sleep(1)
      command = getPersistence().listPendingEnvironmentCommands(
        environment.id,
      )[0]
    }
    if (command) {
      completeEnvironmentCommand({
        commandId: command.id,
        environmentId: environment.id,
        result: {
          kind: 'resolve_workspace',
          value: {
            deviceId: 'device-1',
            canonicalPath: '/real/repo',
            workspaceKey: 'wrk-1',
            gitRoot: '/real/repo',
            gitRepoUrl: null,
          },
        },
      })
    }

    const response = await responsePromise
    expect(response.status).toBe(200)
    const session = await resJson(response)
    expect(session).toMatchObject({
      product: 'code',
      directory: '/real/repo',
      environment_id: environment.id,
    })
    expect(session.project_id).toMatch(/^project_/)
  })

  test('lists a remote Code directory through the selected environment', async () => {
    const environment = storeCreateEnvironment({
      secret: 'secret',
      accountId: 'web:user-1',
      deviceId: 'device-1',
    })
    const responsePromise = app.request(
      `/web/code/environments/${environment.id}/directory?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/workspace' }),
      },
    )

    let command = getPersistence()
      .listPendingEnvironmentCommands(environment.id)
      .find(item => item.kind === 'list_directory')
    for (let attempt = 0; !command && attempt < 20; attempt++) {
      await Bun.sleep(1)
      command = getPersistence()
        .listPendingEnvironmentCommands(environment.id)
        .find(item => item.kind === 'list_directory')
    }
    expect(command?.payload).toEqual({ path: '/workspace' })
    completeEnvironmentCommand({
      commandId: command!.id,
      environmentId: environment.id,
      result: {
        kind: 'list_directory',
        value: {
          path: '/real/workspace',
          entries: [
            { name: 'src', kind: 'directory' },
            { name: 'README.md', kind: 'file' },
          ],
        },
      },
    })

    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(await resJson(response)).toEqual({
      path: '/real/workspace',
      entries: [
        { name: 'src', kind: 'directory' },
        { name: 'README.md', kind: 'file' },
      ],
    })
  })

  test('rejects cross-account Code environments and requires Chat sandbox capability', async () => {
    const otherEnvironment = storeCreateEnvironment({
      secret: 'other',
      accountId: 'web:user-2',
      deviceId: 'device-2',
      capabilities: { chat: true, chat_sandbox: true },
    })
    const crossAccount = await app.request('/web/code/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environment_id: otherEnvironment.id,
        requested_directory: '/other/repo',
      }),
    })
    expect(crossAccount.status).toBe(400)
    expect(
      getPersistence().listPendingEnvironmentCommands(otherEnvironment.id),
    ).toHaveLength(0)

    storeCreateEnvironment({
      secret: 'code-only',
      accountId: 'web:user-1',
      deviceId: 'device-1',
      capabilities: { claude_code: true },
    })
    const noChatSandbox = await app.request('/web/chat/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Must fail closed' }),
    })
    expect(noChatSandbox.status).toBe(400)
    expect((await resJson(noChatSandbox)).error.message).toMatch(
      /no Chat runtime/i,
    )
  })

  test('archives and restores Code projects without deleting their sessions', async () => {
    const project = upsertCodeProject('user-1', {
      deviceId: 'device-1',
      canonicalPath: '/real/repo',
      workspaceKey: 'wrk-1',
      gitRoot: '/real/repo',
      gitRepoUrl: null,
    })
    const session = storeCreateSession({
      product: 'code',
      projectId: project.id,
      directory: '/real/repo',
    })
    storeBindSession(session.id, 'user-1')

    const archived = await app.request(
      `/web/code/projects/${project.id}?uuid=user-1`,
      { method: 'DELETE' },
    )
    expect(archived.status).toBe(200)
    expect(await resJson(archived)).toMatchObject({ state: 'archived' })
    expect(storeGetSession(session.id)).toBeDefined()

    const restored = await app.request(
      `/web/code/projects/${project.id}/restore?uuid=user-1`,
      { method: 'POST' },
    )
    expect(restored.status).toBe(200)
    expect(await resJson(restored)).toMatchObject({ state: 'active' })
    expect(storeGetSession(session.id)).toBeDefined()
  })

  test('does not mutate project prompts through the other product API', async () => {
    const chatCreate = await app.request('/web/chat/projects?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Research' }),
    })
    const chatProject = await resJson(chatCreate)

    const crossProduct = await app.request(
      `/web/code/projects/${chatProject.id}/prompt?uuid=user-1`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'must not persist' }),
      },
    )

    expect(crossProduct.status).toBe(400)
    expect(storeGetProject(chatProject.id)?.projectPrompt).toBe('')
    expect(storeGetProject(chatProject.id)?.promptRevision).toBe(0)
  })

  test('assigns Chat runtime storage server-side and rejects workspace inputs', async () => {
    const environment = storeCreateEnvironment({
      secret: 'secret',
      accountId: 'web:user-1',
      deviceId: 'device-1',
      directory: '/code/workspace',
      capabilities: { chat: true, chat_sandbox: true },
    })
    const rejected = await app.request('/web/chat/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Chat',
        environment_id: environment.id,
        directory: '/code/workspace',
      }),
    })
    expect(rejected.status).toBe(400)

    const created = await app.request('/web/chat/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Chat' }),
    })
    expect(created.status).toBe(200)
    const session = await resJson(created)
    expect(session.environment_id).toBe(environment.id)
    expect(session.directory).toBeNull()
    expect(session.data_directory).toBe(
      `~/.real-agentc/chat-sessions/${session.id}`,
    )
    expect(storeGetPendingWorkItem(environment.id)?.sessionId).toBe(session.id)
  })

  test('permanently deletes Chat records after runtime scratch cleanup', async () => {
    const environment = storeCreateEnvironment({
      secret: 'chat-runtime',
      accountId: 'web:user-1',
      capabilities: { chat: true, chat_sandbox: true },
    })
    const created = await app.request('/web/chat/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Disposable Chat' }),
    })
    const session = await resJson(created)

    const deletionPromise = app.request(
      `/web/chat/sessions/${session.id}?uuid=user-1`,
      { method: 'DELETE' },
    )
    let cleanup = getPersistence()
      .listPendingEnvironmentCommands(environment.id)
      .find(command => command.kind === 'cleanup_chat_session')
    for (let attempt = 0; !cleanup && attempt < 20; attempt++) {
      await Bun.sleep(1)
      cleanup = getPersistence()
        .listPendingEnvironmentCommands(environment.id)
        .find(command => command.kind === 'cleanup_chat_session')
    }
    expect(cleanup).toBeDefined()
    completeEnvironmentCommand({
      commandId: cleanup!.id,
      environmentId: environment.id,
      result: {
        kind: 'cleanup_chat_session',
        value: { removed: true, closedTabIds: [] },
      },
    })

    const deleted = await deletionPromise
    expect(deleted.status).toBe(200)
    expect(await resJson(deleted)).toEqual({ cleanupPending: false })
    expect(storeGetSession(session.id)).toBeUndefined()
    expect(getPersistence().getCleanupTombstone(session.id)).toBeUndefined()
  })

  test('generic deletion cannot bypass Chat cleanup', async () => {
    const session = storeCreateSession({ product: 'chat' })
    storeBindSession(session.id, 'user-1')

    const response = await app.request(
      `/web/sessions/${session.id}?uuid=user-1`,
      { method: 'DELETE' },
    )

    expect(response.status).toBe(409)
    expect(storeGetSession(session.id)).toBeDefined()
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
    expect(body.product).toBe('code')
  })

  test('session routes copy the environment default and ignore forged model input', async () => {
    const environment = storeCreateEnvironment({
      secret: 'secret',
      capabilities: providerCatalogCapabilities('model-a'),
    })
    const forged = {
      provider_id: 'custom-openai',
      model_profile_id: 'model-b',
      resolved_model_id: 'remote-b',
      provider_config_revision: 5,
      updated_at: 1,
    }
    const webResponse = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environment_id: environment.id,
        model_selection: forged,
      }),
    })
    const first = await resJson(webResponse)
    expect(first.model_selection).toMatchObject({
      model_profile_id: 'model-a',
      resolved_model_id: 'remote-a',
      provider_config_revision: 4,
    })

    storeUpdateEnvironment(environment.id, {
      capabilities: providerCatalogCapabilities('model-b'),
    })
    const v1Response = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environment_id: environment.id,
        model_selection: {
          ...forged,
          model_profile_id: 'model-a',
          resolved_model_id: 'remote-a',
        },
      }),
    })
    const second = await resJson(v1Response)
    expect(second.model_selection).toMatchObject({
      model_profile_id: 'model-b',
      resolved_model_id: 'remote-b',
      provider_config_revision: 5,
    })
    expect(storeGetSession(first.id)?.modelSelection?.modelProfileId).toBe(
      'model-a',
    )
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

  test('GET /web/sessions — includes worker telemetry for the global runtime center', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)
    const { storeUpsertSessionWorker } = await import('../store')
    storeUpsertSessionWorker(id, {
      workerStatus: 'requires_action',
      requiresActionDetails: { type: 'permission' },
      externalMetadata: {
        automation_state: { enabled: true, phase: 'standby' },
      },
    })

    const listRes = await app.request('/web/sessions?uuid=user-1')
    const sessions = await resJson(listRes)
    expect(sessions[0]).toEqual(
      expect.objectContaining({
        worker_status: 'requires_action',
        requires_action_details: { type: 'permission' },
        automation_state: expect.objectContaining({
          enabled: true,
          phase: 'standby',
        }),
      }),
    )
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

  test('GET /web/sessions and /all — defaults to non-archived and can include archived', async () => {
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
      inactive.id,
      open.id,
    ])

    const allRes = await app.request('/web/sessions/all?uuid=user-1')
    expect(allRes.status).toBe(200)
    const summaries = await resJson(allRes)
    expect(summaries.map((session: { id: string }) => session.id)).toEqual([
      inactive.id,
      open.id,
    ])

    for (const path of ['/web/sessions', '/web/sessions/all']) {
      const inclusive = await app.request(
        `${path}?uuid=user-1&include_archived=1`,
      )
      const inclusiveBody = await resJson(inclusive)
      expect(
        inclusiveBody.map((session: { id: string }) => session.id),
      ).toEqual([archived.id, inactive.id, open.id])

      const nonInclusive = await app.request(
        `${path}?uuid=user-1&include_archived=true`,
      )
      const nonInclusiveBody = await resJson(nonInclusive)
      expect(
        nonInclusiveBody.map((session: { id: string }) => session.id),
      ).toEqual([inactive.id, open.id])
    }
  })

  test('owner archive and restore are durable, idempotent, and keep history readable', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Lifecycle' }),
    })
    const { id } = await resJson(createRes)
    publishSessionEvent(
      id,
      'user',
      { content: 'keep me', uuid: 'message-1' },
      'outbound',
      { producer: 'web', sourceEventId: 'message-1' },
    )

    for (let attempt = 0; attempt < 2; attempt++) {
      const archive = await app.request(
        `/web/sessions/${id}/archive?uuid=user-1`,
        { method: 'POST' },
      )
      expect(archive.status).toBe(200)
    }

    const archivedDetail = await app.request(`/web/sessions/${id}?uuid=user-1`)
    expect((await resJson(archivedDetail)).status).toBe('archived')
    const history = await app.request(`/web/sessions/${id}/history?uuid=user-1`)
    const historyBody = await resJson(history)
    expect(
      historyBody.events.some(
        (event: { type: string; payload: { content?: string } }) =>
          event.type === 'user' && event.payload.content === 'keep me',
      ),
    ).toBe(true)

    for (let attempt = 0; attempt < 2; attempt++) {
      const restore = await app.request(
        `/web/sessions/${id}/restore?uuid=user-1`,
        { method: 'POST' },
      )
      expect(restore.status).toBe(200)
    }
    const restoredDetail = await app.request(`/web/sessions/${id}?uuid=user-1`)
    expect((await resJson(restoredDetail)).status).toBe('idle')

    const list = await app.request('/web/sessions?uuid=user-1')
    expect(
      (await resJson(list)).map((session: { id: string }) => session.id),
    ).toContain(id)

    const workerRegister = await app.request(
      `/v1/code/sessions/${id}/worker/register`,
      { method: 'POST', headers: AUTH_HEADERS },
    )
    expect(workerRegister.status).toBe(200)
  })

  test('owner can explicitly rebind an orphan session to an active environment', async () => {
    const oldEnvironment = storeCreateEnvironment({ secret: 'old' })
    const targetEnvironment = storeCreateEnvironment({
      secret: 'target',
      accountId: 'web:user-1',
    })
    const session = storeCreateSession({
      environmentId: oldEnvironment.id,
    })
    storeBindSession(session.id, 'user-1')

    const response = await app.request(
      `/web/sessions/${session.id}/rebind?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment_id: targetEnvironment.id }),
      },
    )

    expect(response.status).toBe(200)
    expect(storeGetSession(session.id)?.environmentId).toBe(
      targetEnvironment.id,
    )
    expect(storeGetPendingWorkItem(targetEnvironment.id)?.sessionId).toBe(
      session.id,
    )
  })

  test('product sessions cannot be rebound away from their immutable runtime', async () => {
    const targetEnvironment = storeCreateEnvironment({
      secret: 'target',
      accountId: 'web:user-1',
    })
    const project = upsertCodeProject('user-1', {
      deviceId: 'device-1',
      canonicalPath: '/repo',
      workspaceKey: 'workspace-1',
      gitRoot: '/repo',
      gitRepoUrl: null,
    })
    const session = storeCreateSession({
      product: 'code',
      projectId: project.id,
      directory: '/repo',
    })
    storeBindSession(session.id, 'user-1')

    const response = await app.request(
      `/web/sessions/${session.id}/rebind?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment_id: targetEnvironment.id }),
      },
    )

    expect(response.status).toBe(409)
    expect(storeGetSession(session.id)?.environmentId).toBeNull()
  })

  test('lifecycle mutations hide session existence from non-owners', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    for (const [method, suffix] of [
      ['POST', 'archive'],
      ['POST', 'restore'],
      ['DELETE', ''],
    ] as const) {
      const response = await app.request(
        `/web/sessions/${id}${suffix ? `/${suffix}` : ''}?uuid=user-2`,
        { method },
      )
      expect(response.status, `${method} ${suffix}`).toBe(403)
    }
  })

  test('permanent delete cascades durable and cached session state', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)
    publishSessionEvent(id, 'assistant', { content: 'durable' }, 'inbound')
    const {
      storeCreateWorkItem,
      storeGetWorkItem,
      storeGetSession,
      storeGetSessionWorker,
      storeIsSessionOwner,
      storeUpsertSessionWorker,
    } = await import('../store')
    storeUpsertSessionWorker(id, { workerStatus: 'idle' })
    const work = storeCreateWorkItem({
      environmentId: 'env-1',
      sessionId: id,
      secret: 'secret',
    })
    getEventBus(id).subscribe(() => {})

    const deleted = await app.request(`/web/sessions/${id}?uuid=user-1`, {
      method: 'DELETE',
    })
    expect(deleted.status).toBe(200)
    expect(storeGetSession(id)).toBeUndefined()
    expect(storeGetSessionWorker(id)).toBeUndefined()
    expect(storeGetWorkItem(work.id)).toBeUndefined()
    expect(storeIsSessionOwner(id, 'user-1')).toBe(false)
    expect(getPersistence().getSession(id)).toBeUndefined()
    expect(getPersistence().getWorker(id)).toBeUndefined()
    expect(getPersistence().isOwner(id, 'user-1')).toBe(false)
    expect(getPersistence().listEvents(id, 0, 100).events).toEqual([])
    expect(getAllEventBuses().has(id)).toBe(false)

    const history = await app.request(`/web/sessions/${id}/history?uuid=user-1`)
    expect(history.status).toBe(403)
    const mutation = await app.request(
      `/web/sessions/${id}/events?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', content: 'gone' }),
      },
    )
    expect(mutation.status).toBe(403)
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

  test('PATCH /web/sessions/:id — renames only an owned session', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '旧标题' }),
    })
    const created = await createRes.json()
    const forbidden = await app.request(
      `/web/sessions/${created.id}?uuid=user-2`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '越权标题' }),
      },
    )
    expect(forbidden.status).toBe(403)

    const renamed = await app.request(
      `/web/sessions/${created.id}?uuid=user-1`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '新标题' }),
      },
    )
    expect(renamed.status).toBe(200)
    expect((await renamed.json()).title).toBe('新标题')
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
        worker_epoch: currentWorkerEpoch(id),
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

  test('GET /web/sessions/:id/history — 403 after permanent deletion clears ownership', async () => {
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
    expect(histRes.status).toBe(403)
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
      const text = await readStreamUntil(reader, ': keepalive')
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
      const text = await readStreamUntil(reader, ': keepalive')
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

    const workerStream = await app.request(workerStreamPath(rawSessionId), {
      headers: AUTH_HEADERS,
    })
    const workerReader = workerStream.body!.getReader()
    await workerReader.read()

    const interruptRes = await app.request(
      `/web/sessions/${compatId}/interrupt?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    )
    expect(interruptRes.status).toBe(202)
    await workerReader.cancel()
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
    const streamRes = await app.request(workerStreamPath(sessionId), {
      headers: AUTH_HEADERS,
    })
    const reader = streamRes.body!.getReader()
    await reader.read()
    const res = await app.request(
      `/web/sessions/${sessionId}/interrupt?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    )
    expect(res.status).toBe(202)
    const chunk = await reader.read()
    const frame = new TextDecoder().decode(chunk.value!)
    expect(frame).toContain('event: worker_command')
    expect(frame).toContain('"event_type":"interrupt"')
    expect(
      getPersistence()
        .listEvents(sessionId, 0, 100)
        .events.some(event => event.type === 'interrupt'),
    ).toBe(false)
    await reader.cancel()
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

    const token = issueToken('testuser')
    const res = await app.request('/web/environments?uuid=user-1', {
      headers: { Authorization: `Bearer ${token.token}` },
    })
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

  test('POST session ingress keeps legacy terminal output live and out of history', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    storeBindSession(id, 'user-1')
    const webStream = await app.request(
      `/web/sessions/${toWebSessionId(id)}/events?uuid=user-1`,
    )
    const reader = webStream.body!.getReader()
    await readStreamUntil(reader, ': keepalive')

    const res = await app.request(`/v2/session_ingress/session/${id}/events`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'terminal_output',
        uuid: 'legacy-terminal-output-1',
        term_id: 'main',
        stream_id: 'stream-legacy',
        output_seq: 1,
        data: 'live only',
      }),
    })

    expect(res.status).toBe(200)
    const frame = await readStreamUntil(reader, 'event: live_event')
    expect(frame).toContain('legacy-terminal-output-1')
    expect(frame).toContain('terminal_output')
    expect(getPersistence().listEvents(id, 0, 100).events).toEqual([])
    await reader.cancel()
  })

  test('GET /v2/session_ingress/ws/:sessionId — keeps legacy Chat transport available', async () => {
    const { id } = storeCreateSession({ product: 'chat' })

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

  test('GET /v2/session_ingress/ws/:sessionId — rejects Code raw and compat IDs with an upgrade error', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    const compatId = toWebSessionId(id)

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket: {
        ...sessionIngressWebsocket,
        idleTimeout: 30,
      },
    })

    try {
      for (const requestedId of [id, compatId]) {
        const closed = await new Promise<{ code: number; reason: string }>(
          (resolve, reject) => {
            const ws = new WebSocket(
              `ws://127.0.0.1:${server.port}/v2/session_ingress/ws/${requestedId}`,
              [encodeWebSocketAuthProtocol('test-api-key')],
            )
            const timeout = setTimeout(() => {
              ws.close()
              reject(new Error('Timed out waiting for Code WS rejection'))
            }, 2000)
            ws.onclose = event => {
              clearTimeout(timeout)
              resolve({ code: event.code, reason: event.reason })
            }
          },
        )
        expect(closed.code).toBe(1002)
        expect(closed.reason).toContain('SSE')
      }
    } finally {
      void server.stop(true)
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
      body: JSON.stringify({
        worker_epoch: currentWorkerEpoch(id),
        events: [{ type: 'assistant', content: 'response' }],
      }),
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
        worker_epoch: currentWorkerEpoch(id),
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
            worker_epoch: currentWorkerEpoch(id),
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
        body: JSON.stringify({
          worker_epoch: currentWorkerEpoch(id),
          events: [event],
        }),
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

  test('POST/GET /v1/code/sessions/:id/worker/internal-events — persists and pages CCR transcript events', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    const epoch = currentWorkerEpoch(id)
    const path = `/v1/code/sessions/${id}/worker/internal-events`
    const body = {
      worker_epoch: epoch,
      events: [
        {
          payload: {
            type: 'transcript',
            uuid: 'internal-foreground-1',
            content: 'hello',
          },
        },
        {
          payload: {
            type: 'transcript',
            uuid: 'internal-agent-1',
            content: 'tool result',
          },
          agent_id: 'agent-a',
          event_metadata: { source: 'subagent' },
        },
        {
          payload: {
            type: 'transcript',
            uuid: 'internal-foreground-2',
            content: 'world',
          },
          is_compaction: true,
        },
      ],
    }

    const first = await app.request(path, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(first.status).toBe(200)
    expect(await resJson(first)).toEqual({ status: 'ok', count: 3 })

    const retry = await app.request(path, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(retry.status).toBe(200)
    expect(await resJson(retry)).toEqual({ status: 'ok', count: 0 })

    const foreground = await app.request(`${path}?limit=1`, {
      headers: AUTH_HEADERS,
    })
    expect(foreground.status).toBe(200)
    const foregroundBody = await resJson(foreground)
    expect(foregroundBody.data).toHaveLength(1)
    expect(foregroundBody.data[0]).toMatchObject({
      event_id: 'internal-foreground-1',
      event_type: 'transcript',
      payload: { content: 'hello' },
      is_compaction: false,
      agent_id: null,
    })
    expect(typeof foregroundBody.next_cursor).toBe('string')

    const subagents = await app.request(`${path}?subagents=true`, {
      headers: AUTH_HEADERS,
    })
    expect(subagents.status).toBe(200)
    expect((await resJson(subagents)).data).toEqual([
      expect.objectContaining({
        event_id: 'internal-agent-1',
        agent_id: 'agent-a',
      }),
    ])

    const stale = await app.request(path, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, worker_epoch: epoch - 1 }),
    })
    expect(stale.status).toBe(409)
  })

  test('Code worker can return idle after transcript flush and receive the next turn', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    const epoch = currentWorkerEpoch(id)
    const streamRes = await app.request(workerStreamPath(id, epoch), {
      headers: AUTH_HEADERS,
    })
    const reader = streamRes.body!.getReader()
    await reader.read()

    publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'first turn' },
      'outbound',
    )
    expect(await readStreamUntil(reader, 'first turn')).toContain('first turn')

    const postWorkerEvents = await app.request(
      `/v1/code/sessions/${id}/worker/events`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_epoch: epoch,
          events: [
            {
              event_id: 'assistant-first',
              payload: { type: 'assistant', content: 'first answer' },
            },
            {
              event_id: 'result-first',
              payload: { type: 'result', content: '' },
            },
          ],
        }),
      },
    )
    expect(postWorkerEvents.status).toBe(200)

    const postInternalEvents = await app.request(
      `/v1/code/sessions/${id}/worker/internal-events`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_epoch: epoch,
          events: [
            {
              payload: {
                type: 'transcript',
                uuid: 'transcript-first',
                content: 'first answer',
              },
            },
          ],
        }),
      },
    )
    expect(postInternalEvents.status).toBe(200)

    const idle = await app.request(`/v1/code/sessions/${id}/worker`, {
      method: 'PUT',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ worker_epoch: epoch, worker_status: 'idle' }),
    })
    expect(idle.status).toBe(200)
    expect(storeGetSession(id)?.status).toBe('idle')

    publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'second turn' },
      'outbound',
    )
    expect(await readStreamUntil(reader, 'second turn')).toContain(
      'second turn',
    )
    await reader.cancel()
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
        worker_epoch: currentWorkerEpoch(id),
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
          worker_epoch: currentWorkerEpoch(id),
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
        body: JSON.stringify({ worker_epoch: currentWorkerEpoch(id) }),
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

    const streamRes = await app.request(workerStreamPath(id), {
      headers: AUTH_HEADERS,
    })
    expect(streamRes.status).toBe(200)

    const reader = streamRes.body?.getReader()
    expect(reader).toBeTruthy()
    if (!reader) return

    const firstChunk = await reader.read()
    const keepalive = new TextDecoder().decode(firstChunk.value!)
    expect(keepalive).toContain(': keepalive')

    const durable = publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'hello' },
      'outbound',
    ).event

    const secondChunk = await reader.read()
    const frame = new TextDecoder().decode(secondChunk.value!)
    expect(frame).toContain('event: client_event')
    expect(frame).toContain(
      '"payload":{"type":"user","content":"hello","message":{"role":"user","content":"hello"}',
    )
    expect(frame).toContain(`"uuid":"${durable.id}"`)
    reader.cancel()
  })

  test('worker streams require the current epoch and replace split-brain subscribers', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    const epoch = storeGetSession(id)!.workerEpoch

    const missing = await app.request(
      `/v1/code/sessions/${id}/worker/events/stream`,
      { headers: AUTH_HEADERS },
    )
    expect(missing.status).toBe(409)
    const stale = await app.request(workerStreamPath(id, epoch - 1), {
      headers: AUTH_HEADERS,
    })
    expect(stale.status).toBe(409)

    const first = await app.request(workerStreamPath(id, epoch), {
      headers: AUTH_HEADERS,
    })
    const firstReader = first.body!.getReader()
    await firstReader.read()

    const replacement = await app.request(workerStreamPath(id, epoch), {
      headers: AUTH_HEADERS,
    })
    const replacementReader = replacement.body!.getReader()
    await replacementReader.read()

    const oldClosed = await Promise.race([
      firstReader.read().then(chunk => chunk.done),
      new Promise<false>(resolve => setTimeout(() => resolve(false), 50)),
    ])
    expect(oldClosed).toBe(true)

    publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'new worker only' },
      'outbound',
    )
    const frame = new TextDecoder().decode(
      (await replacementReader.read()).value!,
    )
    expect(frame).toContain('new worker only')
    await replacementReader.cancel()
  })

  test('stale worker epochs cannot publish live output or acknowledge durable work', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)
    const epoch = storeGetSession(id)!.workerEpoch
    const durable = publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'still pending' },
      'outbound',
    ).event

    const live = await app.request(
      `/v1/code/sessions/${id}/worker/live-events`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_epoch: epoch - 1,
          event_id: 'output-stale',
          type: 'terminal_output',
          payload: { type: 'terminal_output', data: 'stale' },
        }),
      },
    )
    expect(live.status).toBe(409)

    const delivery = await app.request(
      `/v1/code/sessions/${id}/worker/events/delivery`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_epoch: epoch - 1,
          updates: [{ event_id: durable.id, status: 'processed' }],
        }),
      },
    )
    expect(delivery.status).toBe(409)
    expect(getPersistence().isEventProcessed(id, durable.id)).toBe(false)
  })

  test('POST live-events rejects terminal input while worker is offline without persisting it', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const res = await app.request(
      `/web/sessions/${id}/live-events?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'terminal_input',
          command_id: 'command-offline',
          term_id: 'main',
          data: 'secret&value',
        }),
      },
    )

    expect(res.status).toBe(409)
    expect(await resJson(res)).toEqual({
      error: {
        type: 'worker_not_ready',
        message: 'Worker is not ready for live commands',
      },
    })
    expect(getPersistence().listEvents(id, 0, 100).events).toEqual([])
    expect(getPersistence().getLastSeq(id)).toBe(0)
  })

  test('generic web event ingestion rejects terminal and undeclared side-effect types', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    for (const body of [
      {
        type: 'terminal_input',
        term_id: 'main',
        data: 'must-not-persist',
      },
      { type: 'mystery_side_effect', value: true },
    ]) {
      const res = await app.request(`/web/sessions/${id}/events?uuid=user-1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      expect(res.status).toBe(400)
      expect((await resJson(res)).error.type).toBe('unsupported_event_type')
    }
    expect(getPersistence().listEvents(id, 0, 100).events).toEqual([])
  })

  test('POST live-events sends a terminal command on the active worker stream without a durable cursor', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)
    const streamRes = await app.request(workerStreamPath(id), {
      headers: AUTH_HEADERS,
    })
    const reader = streamRes.body!.getReader()
    await reader.read() // worker_ready + keepalive

    const res = await app.request(
      `/web/sessions/${id}/live-events?uuid=user-1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'terminal_input',
          command_id: 'command-live',
          term_id: 'main',
          data: 'once&only',
        }),
      },
    )
    expect(res.status).toBe(202)

    const chunk = await reader.read()
    const frame = new TextDecoder().decode(chunk.value!)
    expect(frame).toContain('event: worker_command')
    expect(frame).toContain('"command_id":"command-live"')
    expect(frame).toContain('"type":"terminal_input"')
    expect(frame).not.toContain('id: ')
    expect(frame).not.toContain('sequence_num')
    expect(getPersistence().listEvents(id, 0, 100).events).toEqual([])

    await reader.cancel()
  })

  test('worker terminal output reaches the web live stream without entering history', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)
    const webStream = await app.request(
      `/web/sessions/${id}/events?uuid=user-1`,
    )
    const reader = webStream.body!.getReader()
    await readStreamUntil(reader, ': keepalive')

    const outputRes = await app.request(
      `/v1/code/sessions/${id}/worker/events`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_epoch: currentWorkerEpoch(id),
          events: [
            {
              event_id: 'terminal-output-1',
              payload: {
                type: 'terminal_output',
                term_id: 'main',
                stream_id: 'stream-1',
                output_seq: 1,
                data: 'hello',
              },
            },
          ],
        }),
      },
    )
    expect(outputRes.status).toBe(200)

    const frame = await readStreamUntil(reader, 'event: live_event')
    expect(frame).toContain('event: live_event')
    expect(frame).toContain('"event_id":"terminal-output-1"')
    expect(frame).toContain('"type":"terminal_output"')
    expect(frame).not.toContain('id: ')
    expect(getPersistence().listEvents(id, 0, 100).events).toEqual([])

    await reader.cancel()
  })

  test('worker stream snapshots reach the web as partial assistants without entering history', async () => {
    const createRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(createRes)
    const webStream = await app.request(
      `/web/sessions/${id}/events?uuid=user-1`,
    )
    const reader = webStream.body!.getReader()
    await readStreamUntil(reader, ': keepalive')
    const before = getPersistence().listEvents(id, 0, 100).events

    const outputRes = await app.request(
      `/v1/code/sessions/${id}/worker/live-events`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_epoch: currentWorkerEpoch(id),
          events: [
            {
              event_id: 'partial-1',
              type: 'stream_event',
              payload: {
                type: 'stream_event',
                uuid: 'partial-1',
                message_id: 'msg-1',
                snapshot: true,
                parent_tool_use_id: null,
                event: {
                  type: 'content_block_delta',
                  index: 0,
                  delta: { type: 'text_delta', text: 'hello' },
                },
              },
            },
          ],
        }),
      },
    )
    expect(outputRes.status).toBe(200)

    const frame = await readStreamUntil(reader, 'event: live_event')
    expect(frame).toContain('event: live_event')
    expect(frame).toContain('"type":"partial_assistant"')
    expect(frame).toContain('"message_id":"msg-1"')
    expect(frame).toContain('"content":"hello"')
    expect(getPersistence().listEvents(id, 0, 100).events).toEqual(before)

    await reader.cancel()
  })

  test('worker event ingestion rejects undeclared terminal event types instead of persisting them', async () => {
    const createRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(createRes)

    const res = await app.request(`/v1/code/sessions/${id}/worker/events`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_epoch: currentWorkerEpoch(id),
        event_id: 'terminal-unknown-1',
        payload: { type: 'terminal_unknown', data: 'must-not-persist' },
      }),
    })

    expect(res.status).toBe(400)
    expect((await resJson(res)).error.type).toBe('unsupported_event_type')
    expect(getPersistence().listEvents(id, 0, 100).events).toEqual([])
  })

  test('GET /v1/code/sessions/:id/worker/events/stream — normalizes web permission approvals to control_response', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const streamRes = await app.request(workerStreamPath(id), {
      headers: AUTH_HEADERS,
    })
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

    const streamRes = await app.request(workerStreamPath(id), {
      headers: AUTH_HEADERS,
    })
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

  test('GET /v1/code/sessions/:id/worker/events/stream — sends interrupts as non-durable worker commands', async () => {
    const createRes = await app.request('/web/sessions?uuid=user-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(createRes)

    const streamRes = await app.request(workerStreamPath(id), {
      headers: AUTH_HEADERS,
    })
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
    expect(interruptRes.status).toBe(202)

    const chunk = await reader.read()
    const frame = new TextDecoder().decode(chunk.value!)
    expect(frame).toContain('event: worker_command')
    expect(frame).toContain('"event_type":"interrupt"')
    expect(frame).toContain('"payload":{"type":"interrupt"')
    expect(frame).not.toContain('id: ')
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
      body: JSON.stringify({
        worker_epoch: currentWorkerEpoch(id),
        status: 'running',
      }),
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
        body: JSON.stringify({
          worker_epoch: currentWorkerEpoch(id),
          meta: 'data',
        }),
      },
    )
    expect(res.status).toBe(200)
  })

  test('POST /v1/code/sessions/:id/worker/events/:eventId/delivery — records delivery state', async () => {
    const sessRes = await app.request('/v1/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const { id } = await resJson(sessRes)

    const event = publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'ack me' },
      'outbound',
    ).event
    const res = await app.request(
      `/v1/code/sessions/${id}/worker/events/${event.id}/delivery`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'received',
          worker_epoch: currentWorkerEpoch(id),
        }),
      },
    )
    expect(res.status).toBe(200)
    expect(getPersistence().getEventDelivery(id, event.id)).toMatchObject({
      eventId: event.id,
      sequenceNum: event.seqNum,
      workerEpoch: currentWorkerEpoch(id),
      status: 'received',
    })
  })

  test('processed delivery acknowledgements prevent durable replay', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)

    const durable = publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'do not replay' },
      'outbound',
      { producer: 'web', sourceEventId: 'durable-1' },
    ).event

    const res = await app.request(
      `/v1/code/sessions/${id}/worker/events/delivery`,
      {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_epoch: currentWorkerEpoch(id),
          updates: [{ event_id: durable.id, status: 'processed' }],
        }),
      },
    )
    expect(res.status).toBe(200)

    const streamRes = await app.request(workerStreamPath(id), {
      headers: AUTH_HEADERS,
    })
    const reader = streamRes.body!.getReader()
    const first = await reader.read()
    const frame = new TextDecoder().decode(first.value!)
    expect(frame).not.toContain('do not replay')
    expect(frame).toContain(': keepalive')
    await reader.cancel()
  })

  test('server delivery state replays an unprocessed event even when the client cursor is ahead', async () => {
    const sessRes = await app.request('/v1/code/sessions', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const {
      session: { id },
    } = await resJson(sessRes)

    const unprocessed = publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'must replay' },
      'outbound',
      { producer: 'web', sourceEventId: 'durable-unprocessed' },
    ).event
    const processed = publishSessionEvent(
      id,
      'user',
      { type: 'user', content: 'must not replay' },
      'outbound',
      { producer: 'web', sourceEventId: 'durable-processed' },
    ).event
    getPersistence().recordEventDelivery(id, processed.id, 1, 'processed', 200)

    const streamRes = await app.request(workerStreamPath(id, undefined, 2), {
      headers: AUTH_HEADERS,
    })
    const reader = streamRes.body!.getReader()
    const frame = await readStreamUntil(reader, ': keepalive')
    expect(frame).toContain(`id: ${unprocessed.seqNum}`)
    expect(frame).toContain('must replay')
    expect(frame).not.toContain('must not replay')
    await reader.cancel()
  })
})
