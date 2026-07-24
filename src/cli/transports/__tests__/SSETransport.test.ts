import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildSSEPostRequest,
  getSSEPostMaxAttempts,
  parseSSEFrames,
  SSETransport,
} from '../SSETransport.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('parseSSEFrames', () => {
  test('parses LF-delimited frames', () => {
    const input = 'event: client_event\ndata: {"ok":true}\n\n'
    const { frames, remaining } = parseSSEFrames(input)

    expect(remaining).toBe('')
    expect(frames).toEqual([
      {
        event: 'client_event',
        data: '{"ok":true}',
      },
    ])
  })

  test('parses CRLF-delimited frames and strips trailing carriage returns', () => {
    const input =
      'event: client_event\r\ndata: {"ok":true}\r\nid: 7\r\n\r\nevent: keepalive\r\ndata: ping\r\n\r\n'
    const { frames, remaining } = parseSSEFrames(input)

    expect(remaining).toBe('')
    expect(frames).toEqual([
      {
        event: 'client_event',
        data: '{"ok":true}',
        id: '7',
      },
      {
        event: 'keepalive',
        data: 'ping',
      },
    ])
  })

  test('keeps incomplete trailing frame in remaining buffer for CRLF streams', () => {
    const input =
      'event: client_event\r\ndata: {"ok":true}\r\n\r\ndata: {"tail":1}\r\n'
    const { frames, remaining } = parseSSEFrames(input)

    expect(frames).toEqual([
      {
        event: 'client_event',
        data: '{"ok":true}',
      },
    ])
    expect(remaining).toBe('data: {"tail":1}\r\n')
  })
})

describe('SSETransport delivery deduplication', () => {
  test('dispatches repeated durable sequence or event IDs only once', async () => {
    Object.assign(globalThis, { MACRO: { VERSION: 'test' } })
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })
    globalThis.fetch = (async () =>
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })) as unknown as typeof fetch

    const transport = new SSETransport(
      new URL(
        'http://localhost/v1/code/sessions/session-1/worker/events/stream',
      ),
      {},
      'session-1',
      undefined,
      undefined,
      () => ({ Authorization: 'Bearer test' }),
    )
    const received: string[] = []
    transport.setOnData(data => received.push(data))

    const connected = transport.connect()
    await new Promise(resolve => setTimeout(resolve, 0))
    const data = JSON.stringify({
      event_id: 'event-1',
      sequence_num: 7,
      event_type: 'user',
      source: 'client',
      payload: { type: 'user', content: 'once' },
      created_at: new Date(0).toISOString(),
    })
    const frame = `id: 7\nevent: client_event\ndata: ${data}\n\n`
    const sameEventNewSequence = `id: 8\nevent: client_event\ndata: ${JSON.stringify(
      {
        ...JSON.parse(data),
        sequence_num: 8,
      },
    )}\n\n`
    streamController!.enqueue(
      encoder.encode(frame + frame + sameEventNewSequence),
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(received).toEqual([
      `${JSON.stringify({ type: 'user', content: 'once' })}\n`,
    ])

    transport.close()
    streamController!.close()
    await connected
  })

  test('dispatches worker_command without advancing the durable cursor', async () => {
    Object.assign(globalThis, { MACRO: { VERSION: 'test' } })
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })
    globalThis.fetch = (async () =>
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })) as unknown as typeof fetch

    const transport = new SSETransport(
      new URL(
        'http://localhost/v1/code/sessions/session-1/worker/events/stream',
      ),
      {},
      'session-1',
      undefined,
      undefined,
      () => ({ Authorization: 'Bearer test' }),
    )
    const received: string[] = []
    transport.setOnData(data => received.push(data))
    const connected = transport.connect()
    await new Promise(resolve => setTimeout(resolve, 0))

    const command = JSON.stringify({
      command_id: 'command-1',
      generation: 'generation-1',
      event_type: 'terminal_input',
      payload: {
        type: 'terminal_input',
        term_id: 'main',
        data: 'once',
      },
      created_at: new Date(0).toISOString(),
    })
    streamController!.enqueue(
      encoder.encode(`event: worker_command\ndata: ${command}\n\n`),
    )
    const interrupt = JSON.stringify({
      command_id: 'interrupt-1',
      generation: 'generation-1',
      event_type: 'interrupt',
      payload: { type: 'interrupt' },
      created_at: new Date(0).toISOString(),
    })
    streamController!.enqueue(
      encoder.encode(`event: worker_command\ndata: ${interrupt}\n\n`),
    )
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(received).toEqual([
      `${JSON.stringify({
        type: 'terminal_input',
        term_id: 'main',
        data: 'once',
        command_id: 'command-1',
        generation: 'generation-1',
      })}\n`,
      `${JSON.stringify({
        type: 'control_request',
        request_id: 'interrupt-1',
        request: { subtype: 'interrupt' },
      })}\n`,
    ])
    expect(transport.getLastSequenceNum()).toBe(0)

    transport.close()
    streamController!.close()
    await connected
  })
})

describe('SSETransport worker supersede (409)', () => {
  test('409 worker_epoch_mismatch closes immediately without reconnecting', async () => {
    Object.assign(globalThis, { MACRO: { VERSION: 'test' } })
    let fetchCalls = 0
    globalThis.fetch = (async () => {
      fetchCalls++
      return new Response(
        JSON.stringify({ error: { type: 'worker_epoch_mismatch' } }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )
    }) as unknown as typeof fetch

    const transport = new SSETransport(
      new URL(
        'http://localhost/v1/code/sessions/session-1/worker/events/stream',
      ),
      {},
      'session-1',
      undefined,
      undefined,
      () => ({ Authorization: 'Bearer test' }),
    )
    let closed = false
    let closeCode: number | undefined
    transport.setOnClose(code => {
      closed = true
      closeCode = code
    })

    await transport.connect()
    // A scheduled reconnect would use RECONNECT_BASE_DELAY_MS (1s); wait past
    // it to prove no reconnect was queued.
    await new Promise(resolve => setTimeout(resolve, 1100))

    expect(closed).toBe(true)
    expect(closeCode).toBe(409)
    expect(transport.isClosedStatus()).toBe(true)
    expect(fetchCalls).toBe(1)
  })
})

describe('SSETransport live output routing', () => {
  test('never retries transient terminal frames', () => {
    expect(getSSEPostMaxAttempts({ type: 'terminal_output' })).toBe(1)
    expect(getSSEPostMaxAttempts({ type: 'terminal_snapshot' })).toBe(1)
    expect(getSSEPostMaxAttempts({ type: 'stream_event' })).toBe(1)
    expect(getSSEPostMaxAttempts({ type: 'assistant' })).toBeGreaterThan(1)
  })

  test('routes terminal output to the non-durable worker live endpoint', () => {
    expect(
      buildSSEPostRequest(
        'https://rcs.test/v1/code/sessions/cse_1/worker/events',
        {
          type: 'terminal_output',
          uuid: 'terminal-output-1',
          term_id: 'main',
          stream_id: 'stream-1',
          output_seq: 1,
          data: 'hello',
        },
      ),
    ).toEqual({
      url: 'https://rcs.test/v1/code/sessions/cse_1/worker/live-events',
      body: {
        event_id: 'terminal-output-1',
        type: 'terminal_output',
        payload: {
          type: 'terminal_output',
          uuid: 'terminal-output-1',
          term_id: 'main',
          stream_id: 'stream-1',
          output_seq: 1,
          data: 'hello',
        },
      },
    })
  })

  test('keeps normal worker events on the durable endpoint', () => {
    const message = { type: 'assistant', message: { content: 'hello' } }
    expect(
      buildSSEPostRequest(
        'https://rcs.test/v1/code/sessions/cse_1/worker/events',
        message,
      ),
    ).toEqual({
      url: 'https://rcs.test/v1/code/sessions/cse_1/worker/events',
      body: message,
    })
  })

  test('routes stream snapshots to the non-durable worker live endpoint', () => {
    const message = {
      type: 'stream_event',
      uuid: 'partial-1',
      message_id: 'msg-1',
      snapshot: true,
    }
    expect(
      buildSSEPostRequest(
        'https://rcs.test/v1/code/sessions/cse_1/worker/events',
        message,
      ),
    ).toEqual({
      url: 'https://rcs.test/v1/code/sessions/cse_1/worker/live-events',
      body: {
        event_id: 'partial-1',
        type: 'stream_event',
        payload: message,
      },
    })
  })
})
