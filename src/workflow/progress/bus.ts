import type { ProgressEvent } from '@claude-code-best/workflow-engine'

/** 类型化进度事件总线。引擎 progressEmitter.emit → 广播给所有订阅者（store / 遥测）。 */
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
