import type { ProgressEvent } from '@claude-code-best/workflow-engine'

/** Typed progress event bus. engine progressEmitter.emit -> broadcasts to all subscribers (store / telemetry). */
export type ProgressBus = {
  emit(event: ProgressEvent): void
  subscribe(listener: (event: ProgressEvent) => void): () => void
}

export function createProgressBus(): ProgressBus {
  const listeners = new Set<(event: ProgressEvent) => void>()
  return {
    emit(event) {
      for (const fn of listeners) fn(event)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
