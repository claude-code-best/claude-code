import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import type { Socket } from 'node:net'
import { attachUdsResponseReader } from '../udsResponseReader.js'

class FakeSocket extends EventEmitter {
  destroyed = false
  ended = false

  destroy(): this {
    this.destroyed = true
    this.emit('close', true)
    return this
  }

  end(): this {
    this.ended = true
    this.emit('close', false)
    return this
  }

  emitData(chunk: Buffer): void {
    this.emit('data', chunk)
  }
}

function asSocket(socket: FakeSocket): Socket {
  return socket as unknown as Socket
}

describe('attachUdsResponseReader', () => {
  test('tracks byte limits across split multibyte response chunks', () => {
    const socket = new FakeSocket()
    let settled = false
    let settledError: Error | undefined

    attachUdsResponseReader(asSocket(socket), {
      maxFrameBytes: 128,
      onSettled: error => {
        settled = true
        settledError = error
      },
    })

    const multibyte = String.fromCodePoint(0x20ac)
    const frame = Buffer.from(
      JSON.stringify({ type: 'response', data: `ok ${multibyte}` }) + '\n',
      'utf8',
    )
    const multibyteStart = frame.indexOf(Buffer.from(multibyte, 'utf8')[0])

    socket.emitData(frame.subarray(0, multibyteStart + 1))
    expect(settled).toBe(false)

    socket.emitData(frame.subarray(multibyteStart + 1))
    expect(settled).toBe(true)
    expect(settledError).toBeUndefined()
    expect(socket.ended).toBe(true)
  })

  test('rejects malformed response frames immediately', () => {
    const socket = new FakeSocket()
    let settledError: Error | undefined

    attachUdsResponseReader(asSocket(socket), {
      maxFrameBytes: 128,
      onSettled: error => {
        settledError = error
      },
    })

    socket.emitData(Buffer.from('{bad-json}\n'))

    expect(settledError?.message).toBe('Invalid UDS response frame')
    expect(socket.destroyed).toBe(true)
  })

  test('skips blank frames before a valid response', () => {
    const socket = new FakeSocket()
    let settled = false
    let settledError: Error | undefined

    attachUdsResponseReader(asSocket(socket), {
      maxFrameBytes: 128,
      onSettled: error => {
        settled = true
        settledError = error
      },
    })

    socket.emitData(Buffer.from('\n \n'))
    expect(settled).toBe(false)

    socket.emitData(Buffer.from(`${JSON.stringify({ type: 'response' })}\n`))
    expect(settled).toBe(true)
    expect(settledError).toBeUndefined()
    expect(socket.ended).toBe(true)
  })

  test('continues scanning when blank and valid frames share one chunk', () => {
    const socket = new FakeSocket()
    let settled = false
    let settledError: Error | undefined

    attachUdsResponseReader(asSocket(socket), {
      maxFrameBytes: 128,
      onSettled: error => {
        settled = true
        settledError = error
      },
    })

    socket.emitData(Buffer.from(`\n${JSON.stringify({ type: 'response' })}\n`))

    expect(settled).toBe(true)
    expect(settledError).toBeUndefined()
    expect(socket.ended).toBe(true)
  })

  test('rejects receiver error frames', () => {
    const socket = new FakeSocket()
    let settledError: Error | undefined

    attachUdsResponseReader(asSocket(socket), {
      maxFrameBytes: 128,
      onSettled: error => {
        settledError = error
      },
    })

    socket.emitData(
      Buffer.from(`${JSON.stringify({ type: 'error', data: 'denied' })}\n`),
    )

    expect(settledError?.message).toBe('denied')
    expect(socket.destroyed).toBe(true)
  })

  test('ignores unrelated receiver frames until a terminal response arrives', () => {
    const socket = new FakeSocket()
    let settled = false
    let settledError: Error | undefined

    attachUdsResponseReader(asSocket(socket), {
      maxFrameBytes: 128,
      onSettled: error => {
        settled = true
        settledError = error
      },
    })

    socket.emitData(
      Buffer.from(
        `${JSON.stringify({ type: 'notification', data: 'queued' })}\n`,
      ),
    )
    expect(settled).toBe(false)

    socket.emitData(Buffer.from(`${JSON.stringify({ type: 'response' })}\n`))
    expect(settled).toBe(true)
    expect(settledError).toBeUndefined()
  })

  test('uses custom socket error formatting', () => {
    const socket = new FakeSocket()
    let settledError: Error | undefined

    attachUdsResponseReader(asSocket(socket), {
      maxFrameBytes: 128,
      onSettled: error => {
        settledError = error
      },
      formatSocketError: error =>
        new Error(`wrapped:${(error as Error).message}`),
    })

    socket.emit('error', new Error('connect failed'))

    expect(settledError?.message).toBe('wrapped:connect failed')
    expect(socket.destroyed).toBe(true)
  })

  test('rejects socket end before response', () => {
    const socket = new FakeSocket()
    let settledError: Error | undefined

    attachUdsResponseReader(asSocket(socket), {
      maxFrameBytes: 128,
      onSettled: error => {
        settledError = error
      },
    })

    socket.emit('end')

    expect(settledError?.message).toBe('UDS socket ended before response')
    expect(socket.destroyed).toBe(true)
  })

  test('rejects clean socket close before response', () => {
    const socket = new FakeSocket()
    let settledError: Error | undefined

    attachUdsResponseReader(asSocket(socket), {
      maxFrameBytes: 128,
      onSettled: error => {
        settledError = error
      },
    })

    socket.emit('close', false)

    expect(settledError?.message).toBe('UDS socket closed before response')
    expect(socket.destroyed).toBe(true)
  })
})
