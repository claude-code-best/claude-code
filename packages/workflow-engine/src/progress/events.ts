import type { ProgressEmitter } from '../ports.js'
import type { ProgressEvent } from '../types.js'

export type { ProgressEvent }

/** 从单个回调构造 ProgressEmitter。 */
export function createProgressEmitter(
  onEvent: (e: ProgressEvent) => void,
): ProgressEmitter {
  return { emit: onEvent }
}

/** 收集所有事件到数组（测试用）。 */
export function createBufferingEmitter(): {
  emitter: ProgressEmitter
  events: ProgressEvent[]
} {
  const events: ProgressEvent[] = []
  return { emitter: { emit: e => void events.push(e) }, events }
}
