import { describe, expect, mock, test } from 'bun:test'

// Controlled fake socket so connectTcp()'s timeout race can be tested
// deterministically. Spread pattern (see lanBeacon.test.ts): other modules
// importing 'net' keep getting the real implementation.
let connectCallback: (() => void) | null = null
let fakeSocket: {
  on: (event: string, cb: (...args: unknown[]) => void) => unknown
  destroy: () => void
}

mock.module('net', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const real = require('net') as Record<string, unknown>
  return {
    ...real,
    default: real,
    createConnection: ((opts: unknown, cb?: () => void) => {
      connectCallback = cb ?? null
      void opts
      return fakeSocket as never
    }) as unknown as typeof real.createConnection,
  }
})

const { PipeClient } = await import('../pipeTransport.js')

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('PipeClient.connectTcp timeout race', () => {
  test('destroys the socket when the connect times out', async () => {
    let destroyed = false
    fakeSocket = {
      on: () => fakeSocket,
      destroy: () => {
        destroyed = true
      },
    }

    const client = new PipeClient('timeout-target', 'tester', {
      host: '127.0.0.1',
      port: 1,
    })

    let error: unknown = null
    await client.connect(50).catch((err: unknown) => {
      error = err
    })

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('timed out')
    expect(destroyed).toBe(true)
    expect((client as unknown as { socket: unknown }).socket).toBeNull()
  })

  test('a late successful handshake after timeout cannot attach the socket', async () => {
    fakeSocket = {
      on: () => fakeSocket,
      destroy: mock(() => {}),
    }

    const client = new PipeClient('late-target', 'tester', {
      host: '127.0.0.1',
      port: 1,
    })

    // Rejected promise is captured immediately so it never surfaces as an
    // unhandled rejection while we wait out the timer.
    const pending = client.connect(50).catch((err: Error) => err)

    // The TCP handshake "completes" after the timeout already fired —
    // exactly the scenario where the old code leaked the connection.
    await sleep(80)
    connectCallback?.()

    const error = (await pending) as Error
    expect(error.message).toContain('timed out')
    expect(fakeSocket.destroy).toHaveBeenCalled()
    expect((client as unknown as { socket: unknown }).socket).toBeNull()
  })
})
