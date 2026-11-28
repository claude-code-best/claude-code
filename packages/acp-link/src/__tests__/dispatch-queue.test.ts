import { describe, expect, test } from 'bun:test'
import { enqueueClientDispatch } from '../server/runtime-state.js'
import { createClientState } from '../server/types.js'

describe('enqueueClientDispatch', () => {
  test('pipelined tasks run serially, not concurrently', async () => {
    const state = createClientState()
    const events: string[] = []
    let releaseFirst!: () => void

    const first = enqueueClientDispatch(state, async () => {
      events.push('first:start')
      await new Promise<void>(resolve => {
        releaseFirst = resolve
      })
      events.push('first:end')
    })
    const second = enqueueClientDispatch(state, async () => {
      events.push('second:start')
    })

    // Give the first task a chance to start before releasing it.
    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })

  test('the single pendingJsonRpc slot is never clobbered', async () => {
    // Regression: node-ws does not await async onMessage handlers. Two
    // pipelined requests used to overwrite each other's slot, producing an
    // empty `{}` response for id 1 and no response at all for id 2.
    const state = createClientState()
    const observed: Array<string | number | null> = []
    let releaseFirst!: () => void

    const request = (id: number) =>
      enqueueClientDispatch(state, async () => {
        state.pendingJsonRpc = { id, responseType: `response_${id}` }
        observed.push(state.pendingJsonRpc.id)
        await new Promise<void>(resolve => {
          if (id === 1) releaseFirst = resolve
          else resolve()
        })
        // Simulate send() consuming the response before the slot is cleared.
        observed.push(state.pendingJsonRpc?.id ?? null)
        state.pendingJsonRpc = null
      })

    const first = request(1)
    const second = request(2)
    await Promise.resolve()
    releaseFirst()
    await Promise.all([first, second])

    expect(observed).toEqual([1, 1, 2, 2])
  })

  test('a rejected task does not block later tasks', async () => {
    const state = createClientState()
    const first = enqueueClientDispatch(state, async () => {
      throw new Error('boom')
    })
    const second = enqueueClientDispatch(state, async () => 'ok')

    expect(await first.catch((error: Error) => error.message)).toBe('boom')
    expect(await second).toBe('ok')
  })
})
