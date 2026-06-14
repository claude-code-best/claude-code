import { DEFAULT_MAX_CONCURRENCY, MAX_CONCURRENCY_CAP } from '../constants.js'

/**
 * 异步信号量。acquire() 返回一个 release 函数；permit 在 release 时直接
 * 转移给下一个等待者（available 不变），无等待者时才归还。permit 总数守恒。
 *
 * acquire(signal?) 支持取消：signal 已 aborted 或在等待期间 abort 时立即 reject，
 * waiter 从队列移除、不消耗 permit（避免被取消的 agent 占用并发槽）。
 */
export class Semaphore {
  private available: number
  private readonly waiters: Array<{
    wake: () => void
    cleanup: () => void
  }> = []

  constructor(permits: number) {
    this.available = Math.max(1, Math.floor(permits))
  }

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) {
      throw new Error('Semaphore.acquire aborted (signal already aborted)')
    }
    if (this.available > 0) {
      this.available -= 1
      return () => this.release()
    }
    return new Promise<() => void>((resolve, reject) => {
      const onAbort = () => {
        const idx = this.waiters.indexOf(entry)
        if (idx >= 0) this.waiters.splice(idx, 1)
        reject(new Error('Semaphore.acquire aborted'))
      }
      const wake = () => {
        signal?.removeEventListener('abort', onAbort)
        resolve(() => this.release())
      }
      const entry = {
        wake,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.waiters.push(entry)
    })
  }

  private release(): void {
    const next = this.waiters.shift()
    if (next) {
      next.wake() // 直接转移 permit
    } else {
      this.available += 1
    }
  }
}

/** 当前进程默认并发（向下兼容入口；具体 run 请用 clampMaxConcurrency 处理用户入参）。 */
export function maxConcurrency(): number {
  return DEFAULT_MAX_CONCURRENCY
}

/**
 * 把"用户传入的 maxConcurrency"归一到合法 permits。
 * - undefined / NaN → DEFAULT_MAX_CONCURRENCY
 * - <1 → 1（至少 1 个并发槽，否则 workflow 无法推进）
 * - >MAX_CONCURRENCY_CAP → MAX_CONCURRENCY_CAP
 * - 否则取整后原值
 */
export function clampMaxConcurrency(n: number | undefined): number {
  if (n === undefined || Number.isNaN(n)) return DEFAULT_MAX_CONCURRENCY
  return Math.max(1, Math.min(Math.trunc(n), MAX_CONCURRENCY_CAP))
}
