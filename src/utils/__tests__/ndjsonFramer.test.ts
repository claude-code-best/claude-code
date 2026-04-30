import { EventEmitter } from 'node:events'
import type { Socket } from 'node:net'
import { describe, expect, test } from 'bun:test'
import { attachNdjsonFramer } from '../ndjsonFramer.js'

type TestSocket = Socket & {
  destroyed: boolean
  emitData: (chunk: Buffer) => void
}

function createTestSocket(): TestSocket {
  const emitter = new EventEmitter() as TestSocket
  emitter.destroyed = false
  emitter.destroy = ((_error?: Error) => {
    emitter.destroyed = true
    emitter.emit('close')
    return emitter
  }) as TestSocket['destroy']
  emitter.emitData = (chunk: Buffer) => {
    emitter.emit('data', chunk)
  }
  return emitter
}

describe('attachNdjsonFramer', () => {
  test('accepts a complete frame at the configured byte limit', () => {
    const socket = createTestSocket()
    const messages: unknown[] = []
    const errors: Error[] = []

    attachNdjsonFramer(
      socket,
      msg => messages.push(msg),
      text => JSON.parse(text) as unknown,
      {
        maxFrameBytes: Buffer.byteLength('{"a":1}', 'utf8'),
        onFrameError: error => errors.push(error),
      },
    )

    socket.emitData(Buffer.from('{"a":1}\n'))

    expect(messages).toEqual([{ a: 1 }])
    expect(errors).toEqual([])
    expect(socket.destroyed).toBe(false)
  })

  test('destroys a complete frame over the configured byte limit', () => {
    const socket = createTestSocket()
    const messages: unknown[] = []
    const errors: Error[] = []

    attachNdjsonFramer(
      socket,
      msg => messages.push(msg),
      text => JSON.parse(text) as unknown,
      {
        maxFrameBytes: 8,
        onFrameError: error => errors.push(error),
      },
    )

    socket.emitData(Buffer.from('{"long":true}\n'))

    expect(messages).toEqual([])
    expect(errors[0]?.message).toContain('NDJSON frame exceeded')
    expect(socket.destroyed).toBe(true)
  })

  test('destroys oversized no-newline input before a frame can form', () => {
    const socket = createTestSocket()
    const messages: unknown[] = []
    const errors: Error[] = []

    attachNdjsonFramer(
      socket,
      msg => messages.push(msg),
      text => JSON.parse(text) as unknown,
      {
        maxFrameBytes: 8,
        onFrameError: error => errors.push(error),
      },
    )

    socket.emitData(Buffer.from('x'.repeat(9)))

    expect(messages).toEqual([])
    expect(errors[0]?.message).toContain('NDJSON frame exceeded')
    expect(socket.destroyed).toBe(true)
  })

  test('lets callers own oversized-frame shutdown when configured', () => {
    const socket = createTestSocket()
    const errors: Error[] = []

    attachNdjsonFramer(
      socket,
      () => undefined,
      text => JSON.parse(text) as unknown,
      {
        maxFrameBytes: 8,
        onFrameError: error => errors.push(error),
        destroyOnFrameError: false,
      },
    )

    socket.emitData(Buffer.from('{"long":true}\n'))

    expect(errors[0]?.message).toContain('NDJSON frame exceeded')
    expect(socket.destroyed).toBe(false)
  })

  test('reports malformed non-empty frames without changing default compatibility', () => {
    const socket = createTestSocket()
    const messages: unknown[] = []
    const errors: Error[] = []

    attachNdjsonFramer(
      socket,
      msg => messages.push(msg),
      text => JSON.parse(text) as unknown,
      {
        onInvalidFrame: error => errors.push(error),
      },
    )

    socket.emitData(Buffer.from('{not-json\n'))

    expect(messages).toEqual([])
    expect(errors).toHaveLength(1)
    expect(socket.destroyed).toBe(false)
  })

  test('destroys malformed frames when configured by the caller', () => {
    const socket = createTestSocket()
    const errors: Error[] = []

    attachNdjsonFramer(
      socket,
      () => undefined,
      text => JSON.parse(text) as unknown,
      {
        destroyOnInvalidFrame: true,
        onInvalidFrame: error => errors.push(error),
      },
    )

    socket.emitData(Buffer.from('{not-json\n'))

    expect(errors).toHaveLength(1)
    expect(socket.destroyed).toBe(true)
  })
})
