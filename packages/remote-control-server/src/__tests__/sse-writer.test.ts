import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock config
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

import { Hono } from 'hono'
import { storeCreateSession, storeReset } from '../store'
import { removeEventBus, getAllEventBuses } from '../transport/event-bus'
import { createSSEWriter, createSSEStream } from '../transport/sse-writer'
import { publishSessionEvent } from '../services/transport'

/** Read up to N bytes from a Response stream, then cancel */
async function readPartialStream(
  res: Response,
  maxBytes = 4096,
): Promise<string> {
  const reader = res.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalBytes += value.length
      if (new TextDecoder().decode(value).includes(': keepalive')) break
    }
  } finally {
    reader.cancel()
  }
  const combined = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(combined)
}

describe('SSE Writer', () => {
  describe('createSSEWriter', () => {
    test('creates SSEWriter with send and close methods', () => {
      const app = new Hono()
      let capturedWriter: ReturnType<typeof createSSEWriter> | null = null

      app.get('/test', c => {
        capturedWriter = createSSEWriter(c)
        return c.text('ok')
      })

      app.request('/test')
      expect(capturedWriter).not.toBeNull()
      expect(typeof capturedWriter!.send).toBe('function')
      expect(typeof capturedWriter!.close).toBe('function')
    })
  })

  describe('createSSEStream', () => {
    beforeEach(() => {
      storeReset()
      for (const [key] of getAllEventBuses()) {
        removeEventBus(key)
      }
    })

    test('returns Response with correct SSE headers', async () => {
      const app = new Hono()

      app.get('/stream/:sessionId', c => {
        const sessionId = c.req.param('sessionId')
        return createSSEStream(c, sessionId, 0)
      })

      const res = await app.request('/stream/s1')
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('text/event-stream')
      expect(res.headers.get('Cache-Control')).toBe('no-cache')
      expect(res.headers.get('Connection')).toBe('keep-alive')
      expect(res.headers.get('X-Accel-Buffering')).toBe('no')

      // Cancel the stream
      res.body?.cancel()
    })

    test('sends initial keepalive', async () => {
      const app = new Hono()

      app.get('/stream/:sessionId', c => {
        const sessionId = c.req.param('sessionId')
        return createSSEStream(c, sessionId, 0)
      })

      const res = await app.request('/stream/s2')
      const text = await readPartialStream(res)
      expect(text).toContain(': keepalive')
    })

    test('replays durable events after the cursor with the full canonical shape', async () => {
      const session = storeCreateSession({})
      publishSessionEvent(session.id, 'user', { content: 'hello' }, 'outbound')
      const second = publishSessionEvent(
        session.id,
        'assistant',
        { content: 'hi' },
        'inbound',
      ).event

      const app = new Hono()

      app.get('/stream/:sessionId', c => {
        const sessionId = c.req.param('sessionId')
        const fromSeq = parseInt(c.req.query('fromSeq') || '0', 10)
        return createSSEStream(c, sessionId, fromSeq)
      })

      const res = await app.request(`/stream/${session.id}?fromSeq=1`)
      const text = await readPartialStream(res)
      expect(text).toContain('"seqNum":2')
      expect(text).toContain('assistant')
      expect(text).toContain(`"id":"${second.id}"`)
      expect(text).toContain(`"sessionId":"${session.id}"`)
      expect(text).toContain(`"createdAt":${second.createdAt}`)
      expect(text).not.toContain('sourceEventId')
      expect(text).not.toContain('dedupeScope')
    })

    test('cursor zero replays durable history from the beginning', async () => {
      const session = storeCreateSession({})
      publishSessionEvent(
        session.id,
        'user',
        { content: 'from-start' },
        'outbound',
      )

      const app = new Hono()

      app.get('/stream/:sessionId', c => {
        const sessionId = c.req.param('sessionId')
        return createSSEStream(c, sessionId, 0)
      })

      const res = await app.request(`/stream/${session.id}`)
      const text = await readPartialStream(res)
      expect(text).toContain('event: message')
      expect(text).toContain('from-start')
    })

    test('subscribes to new events and delivers them', async () => {
      const session = storeCreateSession({})
      const app = new Hono()

      app.get('/stream/:sessionId', c => {
        const sessionId = c.req.param('sessionId')
        return createSSEStream(c, sessionId, 0)
      })

      const res = await app.request(`/stream/${session.id}`)

      // Drain the initial ephemeral runtime snapshot and keepalive first.
      const reader = res.body!.getReader()
      let initialText = ''
      for (
        let chunk = 0;
        chunk < 4 && !initialText.includes(': keepalive');
        chunk++
      ) {
        const { value } = await reader.read()
        initialText += new TextDecoder().decode(value!)
      }
      expect(initialText).toContain(': keepalive')

      // Now publish an event
      publishSessionEvent(
        session.id,
        'user',
        { content: 'real-time' },
        'outbound',
      )

      // Initial ephemeral runtime state may be queued immediately after the
      // keepalive. Drain it until the durable event arrives.
      let eventText = ''
      for (
        let chunk = 0;
        chunk < 4 && !eventText.includes('event: message');
        chunk++
      ) {
        const { value } = await reader.read()
        eventText += new TextDecoder().decode(value!)
      }
      expect(eventText).toContain('event: message')
      expect(eventText).toContain('real-time')

      await reader.cancel()
      await Promise.resolve()
      expect(getAllEventBuses().has(session.id)).toBe(false)
    })
  })
})
