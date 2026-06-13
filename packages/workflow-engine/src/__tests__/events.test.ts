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

test('createBufferingEmitter 按序收集所有事件', () => {
  const { emitter, events } = createBufferingEmitter()
  emitter.emit(log('a'))
  emitter.emit(phase('P'))
  expect(events).toHaveLength(2)
  expect(events[0]).toEqual(log('a'))
  expect(events[1]).toEqual(phase('P'))
})

test('createBufferingEmitter emit 返回 void（无返回值）', () => {
  const { emitter } = createBufferingEmitter()
  expect(emitter.emit(log('x'))).toBeUndefined()
})

test('createBufferingEmitter 各自独立（不共享缓冲）', () => {
  const a = createBufferingEmitter()
  const b = createBufferingEmitter()
  a.emitter.emit(log('1'))
  expect(a.events).toHaveLength(1)
  expect(b.events).toHaveLength(0)
})

test('createProgressEmitter 转发事件到回调（按序、不缓冲）', () => {
  const received: ProgressEvent[] = []
  const emitter = createProgressEmitter(e => void received.push(e))
  emitter.emit(log('a'))
  emitter.emit(log('b'))
  expect(received).toEqual([log('a'), log('b')])
})

test('createProgressEmitter 回调同步触发', () => {
  let seen = ''
  const emitter = createProgressEmitter(e => {
    seen = (e as { message: string }).message
  })
  emitter.emit(log('sync'))
  // emit 返回前回调已执行
  expect(seen).toBe('sync')
})
