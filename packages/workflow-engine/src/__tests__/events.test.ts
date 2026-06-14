import { expect, test } from 'bun:test'
import {
  createBufferingEmitter,
  createProgressEmitter,
} from '../progress/events.js'
import type { ProgressEvent } from '../types.js'

const log = (message: string): ProgressEvent =>
  ({ type: 'log', runId: 'r', message }) as ProgressEvent
const phase = (p: string): ProgressEvent =>
  ({ type: 'phase_started', runId: 'r', phase: p }) as ProgressEvent

test('createBufferingEmitter collects all events in order', () => {
  const { emitter, events } = createBufferingEmitter()
  emitter.emit(log('a'))
  emitter.emit(phase('P'))
  expect(events).toHaveLength(2)
  expect(events[0]).toEqual(log('a'))
  expect(events[1]).toEqual(phase('P'))
})

test('createBufferingEmitter emit returns void (no return value)', () => {
  const { emitter } = createBufferingEmitter()
  expect(emitter.emit(log('x'))).toBeUndefined()
})

test('createBufferingEmitter instances are independent (no shared buffer)', () => {
  const a = createBufferingEmitter()
  const b = createBufferingEmitter()
  a.emitter.emit(log('1'))
  expect(a.events).toHaveLength(1)
  expect(b.events).toHaveLength(0)
})

test('createProgressEmitter forwards events to callback (in order, no buffering)', () => {
  const received: ProgressEvent[] = []
  const emitter = createProgressEmitter(e => void received.push(e))
  emitter.emit(log('a'))
  emitter.emit(log('b'))
  expect(received).toEqual([log('a'), log('b')])
})

test('createProgressEmitter triggers callback synchronously', () => {
  let seen = ''
  const emitter = createProgressEmitter(e => {
    seen = (e as { message: string }).message
  })
  emitter.emit(log('sync'))
  // callback already executed before emit returns
  expect(seen).toBe('sync')
})
