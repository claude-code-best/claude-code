import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock config with very short timeout for testing
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
  storeCreateEnvironment,
  storeUpdateEnvironment,
  storeCreateSession,
  storeUpdateSession,
  storeGetEnvironment,
  storeGetSession,
  storeGetSessionWorker,
} from '../store'
import {
  getEventBus,
  getAllEventBuses,
  removeEventBus,
} from '../transport/event-bus'
import { runDisconnectMonitorSweep } from '../services/disconnect-monitor'
import {
  handleWebSocketOpen,
  handleWebSocketClose,
  closeAllConnections,
} from '../transport/ws-handler'

describe('Disconnect Monitor Logic', () => {
  beforeEach(() => {
    storeReset()
    closeAllConnections()
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key)
    }
  })

  test('environment times out when lastPollAt is too old', () => {
    const env = storeCreateEnvironment({ secret: 's' })
    const timeoutMs = 300 * 1000 // 5 minutes

    // Simulate lastPollAt being 6 minutes ago
    const oldDate = new Date(Date.now() - timeoutMs - 60000)
    storeUpdateEnvironment(env.id, { lastPollAt: oldDate })

    runDisconnectMonitorSweep()

    const updated = storeGetEnvironment(env.id)
    expect(updated?.status).toBe('offline')
  })

  test('environment stays active when lastPollAt is recent', () => {
    const env = storeCreateEnvironment({ secret: 's' })
    runDisconnectMonitorSweep()

    const updated = storeGetEnvironment(env.id)
    expect(updated?.status).toBe('active')
  })

  test('stale running session becomes idle with an offline worker', () => {
    const session = storeCreateSession({})
    storeUpdateSession(session.id, { status: 'running' })
    const rec = storeGetSession(session.id)
    expect(rec).toBeTruthy()
    if (!rec) return

    rec.updatedAt = new Date(Date.now() - 300 * 1000 * 2 - 60000)

    runDisconnectMonitorSweep()

    const updated = storeGetSession(session.id)
    expect(updated?.status).toBe('idle')
    expect(storeGetSessionWorker(session.id)?.workerStatus).toBe('offline')
  })

  test('session stays running when recently updated', () => {
    const session = storeCreateSession({})
    storeUpdateSession(session.id, { status: 'running' })

    runDisconnectMonitorSweep()

    const updated = storeGetSession(session.id)
    expect(updated?.status).toBe('running')
  })

  test('session timeout publishes worker availability without closing the session', () => {
    const session = storeCreateSession({})
    storeUpdateSession(session.id, { status: 'idle' })
    const rec = storeGetSession(session.id)
    expect(rec).toBeTruthy()
    if (!rec) return
    rec.updatedAt = new Date(Date.now() - 300 * 1000 * 2 - 60000)

    const bus = getEventBus(session.id)
    const events: Array<{ type: string; payload: { status?: string } }> = []
    bus.subscribe(event => {
      events.push({
        type: event.type,
        payload: event.payload as { status?: string },
      })
    })

    runDisconnectMonitorSweep()

    expect(events).toContainEqual({
      type: 'worker_status',
      payload: { status: 'offline' },
    })
    expect(storeGetSession(session.id)?.status).toBe('idle')
  })

  test('session with a live bridge WS is never marked offline', () => {
    const session = storeCreateSession({})
    storeUpdateSession(session.id, { status: 'idle' })

    const ws = {
      readyState: 1,
      send: () => {},
      close: () => {},
    } as any
    handleWebSocketOpen(ws, session.id)

    // updatedAt is stale (v1 sessions only refresh it on inbound frames),
    // but the live WS must win over the stale clock.
    const rec = storeGetSession(session.id)
    expect(rec).toBeTruthy()
    if (rec) rec.updatedAt = new Date(Date.now() - 300 * 1000 * 2 - 60000)

    runDisconnectMonitorSweep()

    expect(storeGetSessionWorker(session.id)?.workerStatus ?? null).not.toBe(
      'offline',
    )
    expect(storeGetSession(session.id)?.status).toBe('idle')
    handleWebSocketClose(ws, session.id, 1000, 'done')
  })
})
