import type { ProgressEmitter } from '../ports.js'
import type { ProgressEvent } from '../types.js'

export type { ProgressEvent }

/** Construct a ProgressEmitter from a single callback. */
export function createProgressEmitter(
  onEvent: (e: ProgressEvent) => void,
): ProgressEmitter {
  return { emit: onEvent }
}

/** Collect all events into an array (for tests). */
export function createBufferingEmitter(): {
  emitter: ProgressEmitter
  events: ProgressEvent[]
} {
  const events: ProgressEvent[] = []
  return { emitter: { emit: e => void events.push(e) }, events }
}
