import {
  describe,
  test,
  expect,
  beforeEach,
  mock,
  setSystemTime,
} from 'bun:test'

// Mock config before imports
const mockConfig = {
  port: 3000,
  host: '0.0.0.0',
  apiKeys: ['test-api-key'],
  baseUrl: 'http://localhost:3000',
  pollTimeout: 8,
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

import {
  storeReset,
  storeCreateSession,
  storeGetSession,
  storeGetSessionWorker,
  storeUpsertSessionWorker,
} from '../store'
import {
  getEventBus,
  removeEventBus,
  getAllEventBuses,
} from '../transport/event-bus'
import {
  ingestBridgeMessage,
  handleWebSocketOpen,
  handleWebSocketMessage,
  handleWebSocketClose,
  closeAllConnections,
} from '../transport/ws-handler'
import { getPersistence } from '../persistence/runtime'
import { IdempotencyConflictError } from '../persistence/database'
import { publishSessionEvent } from '../services/transport'
import {
  publishWorkerLiveCommand,
  subscribeWebLiveEvents,
} from '../transport/live-events'

function persistTestSession(id: string): void {
  const now = Date.now()
  getPersistence().upsertSession({
    id,
    environmentId: null,
    title: null,
    status: 'idle',
    source: 'test',
    permissionMode: null,
    directory: null,
    workerEpoch: 0,
    username: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  })
}

// Minimal WSContext mock
function createMockWs(readyState = 1) {
  const sent: string[] = []
  return {
    readyState,
    send: (data: string) => sent.push(data),
    close: (_code?: number, _reason?: string) => {},
    getSentData: () => sent,
  } as any
}

describe('ws-handler', () => {
  beforeEach(() => {
    storeReset()
    persistTestSession('s1')
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
    closeAllConnections()
  })

  describe('ingestBridgeMessage', () => {
    test('ignores keep_alive messages', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', { type: 'keep_alive' })
      expect(events).toHaveLength(0)
    })

    test('derives type from message.role for user messages', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', {
        message: { role: 'user', content: 'hello' },
        uuid: 'u1',
      })
      expect(events).toHaveLength(1)
      expect((events[0] as any).type).toBe('user')
      expect((events[0] as any).direction).toBe('inbound')
    })

    test('preserves synthetic flag on inbound user messages', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', {
        message: {
          role: 'user',
          content: 'scheduled job: refresh analytics cache',
        },
        uuid: 'u_synth',
        isSynthetic: true,
      })
      expect(events).toHaveLength(1)
      expect((events[0] as any).payload.isSynthetic).toBe(true)
    })

    test('derives type from message.role for assistant messages', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', {
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'response' }],
        },
        uuid: 'u2',
      })
      expect(events).toHaveLength(1)
      expect((events[0] as any).type).toBe('assistant')
      const payload = (events[0] as any).payload as Record<string, unknown>
      expect(payload.content).toBe('response')
    })

    test('derives type from explicit type field', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', {
        type: 'control_request',
        request_id: 'r1',
        request: { subtype: 'interrupt' },
      })
      expect(events).toHaveLength(1)
      expect((events[0] as any).type).toBe('control_request')
    })

    test('derives result type from subtype/result fields', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', {
        subtype: 'success',
        uuid: 'u3',
        result: 'done',
      })
      expect(events).toHaveLength(1)
      expect((events[0] as any).type).toBe('result')
    })

    test('derives system type from session_id field', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', { session_id: 's1', init: true })
      expect(events).toHaveLength(1)
      expect((events[0] as any).type).toBe('system')
    })

    test('preserves system/init metadata fields on the payload', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', {
        type: 'system',
        subtype: 'init',
        session_id: 's1',
        cwd: '/workspace/project',
        model: 'claude-sonnet-5',
        permissionMode: 'acceptEdits',
        slash_commands: ['compact', 'cost'],
        agents: ['Explore'],
        skills: ['verify'],
        output_style: 'normal',
        claude_code_version: '2.2.1',
        uuid: 'init-1',
      })
      expect(events).toHaveLength(1)
      const payload = (events[0] as any).payload as Record<string, unknown>
      expect(payload.subtype).toBe('init')
      expect(payload.cwd).toBe('/workspace/project')
      expect(payload.model).toBe('claude-sonnet-5')
      expect(payload.permissionMode).toBe('acceptEdits')
      expect(payload.slash_commands).toEqual(['compact', 'cost'])
      expect(payload.agents).toEqual(['Explore'])
      expect(payload.skills).toEqual(['verify'])
      expect(payload.output_style).toBe('normal')
      expect(payload.claude_code_version).toBe('2.2.1')
    })

    test('handles control_response type', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', {
        type: 'control_response',
        response: { subtype: 'success' },
      })
      expect(events).toHaveLength(1)
      expect((events[0] as any).type).toBe('control_response')
    })

    test('handles partial_assistant type', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', {
        type: 'partial_assistant',
        message: { content: 'partial...' },
        uuid: 'u4',
      })
      expect(events).toHaveLength(1)
      expect((events[0] as any).type).toBe('partial_assistant')
    })

    test('normalizes legacy stream snapshots as transient partial assistants', () => {
      const liveEvents: Array<{
        type: string
        payload: Record<string, unknown>
      }> = []
      const unsubscribe = subscribeWebLiveEvents('s1', event =>
        liveEvents.push(event),
      )

      ingestBridgeMessage('s1', {
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
      })

      expect(liveEvents).toHaveLength(1)
      expect(liveEvents[0]).toMatchObject({
        type: 'partial_assistant',
        payload: {
          message_id: 'msg-1',
          block_index: 0,
          content: 'hello',
          parent_tool_use_id: null,
          snapshot: true,
        },
      })
      expect(getPersistence().listEvents('s1', 0, 100).events).toEqual([])
      unsubscribe()
    })

    test('falls back to unknown type', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))
      ingestBridgeMessage('s1', { data: 'something' })
      expect(events).toHaveLength(1)
      expect((events[0] as any).type).toBe('unknown')
    })

    test('deduplicates retries by the root message UUID before payload reshaping', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(event => events.push(event))
      const message = {
        type: 'control_request',
        uuid: 'root-control-1',
        request_id: 'r1',
        request: { subtype: 'permission', tool_name: 'Bash' },
      }

      ingestBridgeMessage('s1', message)
      ingestBridgeMessage('s1', message)

      expect(events).toHaveLength(1)
      const persisted = getPersistence().listEvents('s1', 0, 100).events
      expect(persisted).toHaveLength(1)
      expect(persisted[0]?.sourceEventId).toBe('root-control-1')
      expect(persisted[0]?.dedupeScope).toBe(
        'v1-ingress:inbound:control_request',
      )
      expect(getPersistence().getLastSeq('s1')).toBe(1)

      expect(() =>
        ingestBridgeMessage('s1', {
          ...message,
          request: { subtype: 'permission', tool_name: 'Write' },
        }),
      ).toThrow(IdempotencyConflictError)
    })
  })

  describe('handleWebSocketOpen', () => {
    test('subscribes to event bus and replays missed events', () => {
      publishSessionEvent('s1', 'user', { content: 'hello' }, 'outbound')
      publishSessionEvent('s1', 'assistant', { content: 'hi' }, 'inbound')

      const ws = createMockWs()
      handleWebSocketOpen(ws, 's1')

      // Should have replayed the outbound event (only outbound events are forwarded to WS)
      const sent = ws.getSentData()
      expect(sent.length).toBeGreaterThanOrEqual(1)
      // First message should be the outbound user event
      const msg = JSON.parse(sent[0])
      expect(msg.type).toBe('user')
    })

    test('replays synthetic user metadata back to the bridge', () => {
      persistTestSession('s3')
      publishSessionEvent(
        's3',
        'user',
        {
          content: 'scheduled job: refresh analytics cache',
          isSynthetic: true,
        },
        'outbound',
      )

      const ws = createMockWs()
      handleWebSocketOpen(ws, 's3')

      const msg = JSON.parse(ws.getSentData()[0])
      expect(msg.type).toBe('user')
      expect(msg.isSynthetic).toBe(true)
    })

    test('replaces existing connection for same session', () => {
      persistTestSession('s2')
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      handleWebSocketOpen(ws1, 's2')
      handleWebSocketOpen(ws2, 's2')

      publishSessionEvent('s2', 'user', { content: 'test' }, 'outbound')
      expect(ws2.getSentData().length).toBeGreaterThanOrEqual(1)
    })

    test('delivers terminal commands and interrupts through the live WS channel', () => {
      const ws = createMockWs()
      handleWebSocketOpen(ws, 's1')

      expect(
        publishWorkerLiveCommand(
          's1',
          0,
          'terminal-command-1',
          'terminal_input',
          {
            type: 'terminal_input',
            command_id: 'terminal-command-1',
            term_id: 'main',
            data: 'x',
          },
        ).accepted,
      ).toBe(true)
      expect(
        publishWorkerLiveCommand('s1', 0, 'interrupt-command-1', 'interrupt', {
          type: 'interrupt',
          command_id: 'interrupt-command-1',
        }).accepted,
      ).toBe(true)

      const [terminal, interrupt] = ws
        .getSentData()
        .map((message: string) => JSON.parse(message))
      expect(terminal).toMatchObject({
        type: 'terminal_input',
        command_id: 'terminal-command-1',
        term_id: 'main',
        data: 'x',
      })
      expect(interrupt).toEqual({
        type: 'control_request',
        request_id: 'interrupt-command-1',
        request: { subtype: 'interrupt' },
      })
    })

    test('bounds reconnect replay to 256 durable sequence positions', () => {
      for (let index = 1; index <= 300; index++) {
        publishSessionEvent(
          's1',
          'user',
          { content: `event-${index}` },
          'outbound',
        )
      }

      const ws = createMockWs()
      handleWebSocketOpen(ws, 's1')

      const replay = ws
        .getSentData()
        .map((message: string) => JSON.parse(message))
      expect(replay).toHaveLength(256)
      expect(replay[0]?.message.content).toBe('event-45')
      expect(replay.at(-1)?.message.content).toBe('event-300')
    })

    test('replays user prompts even when pruned protocol noise leaves seq gaps', () => {
      for (let index = 1; index <= 3; index++) {
        publishSessionEvent(
          's1',
          'user',
          { content: `prompt-${index}` },
          'outbound',
        )
      }
      // Capped protocol traffic: 300 sequence positions get allocated but
      // only the newest 8 rows survive. The old `last_seq - 256` window
      // anchored entirely inside the pruned range, replayed zero user
      // prompts, and the bridge lost everything sent while it was offline.
      for (let index = 1; index <= 300; index++) {
        publishSessionEvent(
          's1',
          'control_response',
          { response: { request_id: `req-${index}` } },
          'inbound',
        )
      }

      const ws = createMockWs()
      handleWebSocketOpen(ws, 's1')

      const replayedUsers = ws
        .getSentData()
        .map((message: string) => JSON.parse(message))
        .filter((message: { type?: string }) => message.type === 'user')
      expect(
        replayedUsers.map(
          (message: { message: { content: string } }) =>
            message.message.content,
        ),
      ).toEqual(['prompt-1', 'prompt-2', 'prompt-3'])
    })

    test('a stale replaced socket close cannot remove the newer subscription', () => {
      persistTestSession('s2')
      const oldSocket = createMockWs()
      const currentSocket = createMockWs()
      handleWebSocketOpen(oldSocket, 's2')
      handleWebSocketOpen(currentSocket, 's2')

      handleWebSocketClose(oldSocket, 's2', 1000, 'stale close')
      publishSessionEvent('s2', 'user', { content: 'still live' }, 'outbound')

      expect(currentSocket.getSentData()).toHaveLength(1)
      handleWebSocketClose(currentSocket, 's2', 1000, 'done')
      expect(getAllEventBuses().has('s2')).toBe(false)
    })
  })

  describe('handleWebSocketMessage', () => {
    test('parses NDJSON and ingests each message', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))

      const ws = createMockWs()
      const data =
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'hello' },
        }) +
        '\n' +
        JSON.stringify({
          type: 'assistant',
          message: { role: 'assistant', content: 'hi' },
        }) +
        '\n'
      handleWebSocketMessage(ws, 's1', data)
      expect(events).toHaveLength(2)
      expect(getPersistence().listEvents('s1', 0, 100).events).toHaveLength(2)
    })

    test('ignores malformed JSON lines', () => {
      const bus = getEventBus('s1')
      const events: unknown[] = []
      bus.subscribe(e => events.push(e))

      const ws = createMockWs()
      handleWebSocketMessage(ws, 's1', 'not json\n')
      expect(events).toHaveLength(0)
    })

    test('WS open marks a stale-offline worker online again', () => {
      const session = storeCreateSession({})
      persistTestSession(session.id)
      storeUpsertSessionWorker(session.id, { workerStatus: 'offline' })

      const ws = createMockWs()
      handleWebSocketOpen(ws, session.id)

      expect(storeGetSessionWorker(session.id)?.workerStatus).toBe('online')
      handleWebSocketClose(ws, session.id, 1000, 'done')
    })

    test('inbound frames refresh liveness and publish worker recovery', () => {
      const session = storeCreateSession({})
      persistTestSession(session.id)
      const ws = createMockWs()
      handleWebSocketOpen(ws, session.id)

      const bus = getEventBus(session.id)
      const events: Array<{ type: string; payload: { status?: string } }> = []
      bus.subscribe(event =>
        events.push({
          type: event.type,
          payload: event.payload as { status?: string },
        }),
      )

      // Simulate the disconnect monitor having wrongly offlined the worker
      // while the WS stayed connected, plus a stale liveness clock.
      storeUpsertSessionWorker(session.id, { workerStatus: 'offline' })
      const stale = new Date(Date.now() - 20 * 60_000)
      const rec = storeGetSession(session.id)
      if (rec) rec.updatedAt = stale

      // Advance past the liveness throttle window, then deliver any frame
      // (keep_alives count — they are dropped by ingest but prove liveness).
      setSystemTime(new Date(Date.now() + 16_000))
      try {
        handleWebSocketMessage(ws, session.id, '{"type":"keep_alive"}\n')
      } finally {
        setSystemTime()
      }

      expect(storeGetSessionWorker(session.id)?.workerStatus).toBe('online')
      expect(events).toContainEqual({
        type: 'worker_status',
        payload: { status: 'online' },
      })
      expect(storeGetSession(session.id)!.updatedAt.getTime()).toBeGreaterThan(
        stale.getTime(),
      )
      handleWebSocketClose(ws, session.id, 1000, 'done')
    })
  })

  describe('handleWebSocketClose', () => {
    test('cleans up on close', () => {
      const ws = createMockWs()
      handleWebSocketOpen(ws, 's3')
      handleWebSocketClose(ws, 's3', 1000, 'done')

      // After close, publishing events should not cause errors
      const bus = getEventBus('s3')
      expect(() =>
        bus.publish({
          id: 'e1',
          sessionId: 's3',
          type: 'user',
          payload: {},
          direction: 'outbound',
        }),
      ).not.toThrow()
    })
  })

  describe('toSDKMessage (via handleWebSocketOpen outbound delivery)', () => {
    test('converts permission_response with approved=true', () => {
      const bus = getEventBus('pr1')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'pr1')

      bus.publish({
        id: 'e1',
        sessionId: 'pr1',
        type: 'permission_response',
        payload: { approved: true, request_id: 'req1' },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('control_response')
      expect(lastMsg.response.subtype).toBe('success')
      expect(lastMsg.response.request_id).toBe('req1')
      expect(lastMsg.response.response.behavior).toBe('allow')
    })

    test('converts permission_response with approved=false', () => {
      const bus = getEventBus('pr2')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'pr2')

      bus.publish({
        id: 'e2',
        sessionId: 'pr2',
        type: 'permission_response',
        payload: { approved: false, request_id: 'req2' },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('control_response')
      expect(lastMsg.response.subtype).toBe('error')
      expect(lastMsg.response.error).toBe('Permission denied by user')
      expect(lastMsg.response.response.behavior).toBe('deny')
    })

    test('converts permission_response with existing response object', () => {
      const bus = getEventBus('pr3')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'pr3')

      bus.publish({
        id: 'e3',
        sessionId: 'pr3',
        type: 'control_response',
        payload: { response: { subtype: 'success', data: 'custom' } },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('control_response')
      expect(lastMsg.response.subtype).toBe('success')
      expect(lastMsg.response.data).toBe('custom')
    })

    test('does not deliver interrupt events from the durable bus', () => {
      const bus = getEventBus('int1')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'int1')

      bus.publish({
        id: 'e4',
        sessionId: 'int1',
        type: 'interrupt',
        payload: { action: 'interrupt' },
        direction: 'outbound',
      })

      expect(ws.getSentData()).toEqual([])
    })

    test('converts control_request event', () => {
      const bus = getEventBus('cr1')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'cr1')

      bus.publish({
        id: 'e5',
        sessionId: 'cr1',
        type: 'control_request',
        payload: {
          request_id: 'req5',
          request: { subtype: 'permission', tool_name: 'Bash' },
        },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('control_request')
      expect(lastMsg.request_id).toBe('req5')
      expect(lastMsg.request.subtype).toBe('permission')
    })

    test('converts user_message event type', () => {
      const bus = getEventBus('um1')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'um1')

      bus.publish({
        id: 'e6',
        sessionId: 'um1',
        type: 'user_message',
        payload: { content: 'hello world' },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('user')
      expect(lastMsg.message.content).toBe('hello world')
    })

    test('preserves payload uuid for outbound user events', () => {
      const bus = getEventBus('um2')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'um2')

      bus.publish({
        id: 'internal-event-id',
        sessionId: 'um2',
        type: 'user',
        payload: { uuid: 'web-message-uuid', content: 'hello from web' },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('user')
      expect(lastMsg.uuid).toBe('web-message-uuid')
      expect(lastMsg.message.content).toBe('hello from web')
    })

    test('converts generic event type', () => {
      const bus = getEventBus('gen1')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'gen1')

      bus.publish({
        id: 'e7',
        sessionId: 'gen1',
        type: 'status',
        payload: { state: 'running' },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('status')
      expect(lastMsg.message).toEqual({ state: 'running' })
    })

    test('permission_response with updated_input', () => {
      const bus = getEventBus('ui1')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'ui1')

      bus.publish({
        id: 'e8',
        sessionId: 'ui1',
        type: 'permission_response',
        payload: {
          approved: true,
          request_id: 'req8',
          updated_input: { cmd: 'ls -la' },
        },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.response.response.behavior).toBe('allow')
      expect(lastMsg.response.response.updatedInput).toEqual({ cmd: 'ls -la' })
    })

    test('permission_response with updated_permissions', () => {
      const bus = getEventBus('up1')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'up1')

      const permissions = [
        { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
      ]
      bus.publish({
        id: 'ep1',
        sessionId: 'up1',
        type: 'permission_response',
        payload: {
          approved: true,
          request_id: 'req-ep1',
          updated_input: { plan: 'my plan' },
          updated_permissions: permissions,
        },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('control_response')
      expect(lastMsg.response.subtype).toBe('success')
      expect(lastMsg.response.response.behavior).toBe('allow')
      expect(lastMsg.response.response.updatedInput).toEqual({
        plan: 'my plan',
      })
      expect(lastMsg.response.response.updatedPermissions).toEqual(permissions)
    })

    test('permission_response denied with feedback message', () => {
      const bus = getEventBus('dm1')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'dm1')

      bus.publish({
        id: 'dm1',
        sessionId: 'dm1',
        type: 'permission_response',
        payload: {
          approved: false,
          request_id: 'req-dm1',
          message: 'Please add more tests',
        },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('control_response')
      expect(lastMsg.response.subtype).toBe('error')
      expect(lastMsg.response.response.behavior).toBe('deny')
      expect(lastMsg.response.message).toBe('Please add more tests')
    })

    test('does not forward inbound events to WS', () => {
      const bus = getEventBus('no_in')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'no_in')

      bus.publish({
        id: 'e9',
        sessionId: 'no_in',
        type: 'assistant',
        payload: { content: 'reply' },
        direction: 'inbound',
      })

      // Only replayed events, no new inbound delivery
      const sent = ws.getSentData()
      // No outbound events were published, so only replay (if any)
      // Since the bus was fresh, no replay
      expect(sent).toHaveLength(0)
    })

    test('control_request falls back to payload when no request field', () => {
      const bus = getEventBus('cf1')
      const ws = createMockWs()
      handleWebSocketOpen(ws, 'cf1')

      bus.publish({
        id: 'e10',
        sessionId: 'cf1',
        type: 'control_request',
        payload: { request_id: 'req10', subtype: 'custom', data: 'test' },
        direction: 'outbound',
      })

      const sent = ws.getSentData()
      const lastMsg = JSON.parse(sent[sent.length - 1])
      expect(lastMsg.type).toBe('control_request')
      expect(lastMsg.request_id).toBe('req10')
    })
  })

  describe('closeAllConnections', () => {
    test('closes all active connections', () => {
      const ws1 = createMockWs()
      const ws2 = createMockWs()
      handleWebSocketOpen(ws1, 's1')
      handleWebSocketOpen(ws2, 's2')
      closeAllConnections()
      // No errors thrown
    })

    test('no-op when no connections', () => {
      expect(() => closeAllConnections()).not.toThrow()
    })
  })
})
