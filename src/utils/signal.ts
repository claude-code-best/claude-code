/**
* 用于纯事件信号（不存储状态）的微型监​​听器集合原语。
*
* 将大约 8 行的 `const listeners = new Set(); function subscribe(){…};
* function notify(){for(const l of listeners) l()}` 样板代码（在代码库中重复了约 15 次）
* 简化为一行代码。
*
* 与 store（AppState、createStore）不同——没有快照，也没有
* getState。当订阅者只需要知道“发生了什么”，
* （可选地）带有事件参数，而不是“当前值是什么”时，可以使用此方法。
*
* 用法：
* const changed = createSignal<[SettingSource]>()
* export const subscribe = changed.subscribe
* // 稍后：changed.emit('userSettings')
*/
export type Signal<Args extends unknown[] = []> = {
  /** 订阅监听器。返回一个取消订阅函数。 */
  subscribe: (listener: (...args: Args) => void) => () => void
  /** Call all subscribed listeners with the given arguments. */
  emit: (...args: Args) => void
  /** 移除所有监听器。在释放/重置路径时非常有用。 */
  clear: () => void
}

export function createSignal<Args extends unknown[] = []>(): Signal<Args> {
  const listeners = new Set<(...args: Args) => void>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(...args) {
      for (const listener of listeners) listener(...args)
    },
    clear() {
      listeners.clear()
    },
  }
}
