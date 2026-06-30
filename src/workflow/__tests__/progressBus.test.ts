import { expect, test, mock } from 'bun:test'
import { createProgressBus } from '../progress/bus.js'

test('emit broadcasts to all subscribers', () => {
  const bus = createProgressBus()
  const a = mock(() => {})
  const b = mock(() => {})
  bus.subscribe(a)
  bus.subscribe(b)
  const ev = { type: 'log' as const, runId: 'r', message: 'hi' }
  bus.emit(ev)
  expect(a).toHaveBeenCalledTimes(1)
  expect(b).toHaveBeenCalledWith(ev)
})

test('subscribe returns unsubscribe', () => {
  const bus = createProgressBus()
  const fn = mock(() => {})
  const unsub = bus.subscribe(fn)
  unsub()
  bus.emit({ type: 'log', runId: 'r', message: 'x' })
  expect(fn).not.toHaveBeenCalled()
})
