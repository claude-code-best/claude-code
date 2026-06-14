import { DEFAULT_MAX_CONCURRENCY, MAX_CONCURRENCY_CAP } from '../constants.js'

/**
 * Async semaphore. acquire() returns a release function; on release the permit is transferred
 * directly to the next waiter (available stays unchanged), and only returned when there is no waiter. The total number of permits is conserved.
 *
 * acquire(signal?) supports cancellation: when the signal is already aborted or aborts while waiting, it rejects immediately,
 * the waiter is removed from the queue, and no permit is consumed (to avoid a canceled agent holding a concurrency slot).
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
      next.wake() // transfer the permit directly
    } else {
      this.available += 1
    }
  }
}

/** Default concurrency for the current process (backward-compatible entry; for a specific run, use clampMaxConcurrency to handle user input). */
export function maxConcurrency(): number {
  return DEFAULT_MAX_CONCURRENCY
}

/**
 * Normalize the "user-supplied maxConcurrency" to legal permits.
 * - undefined / NaN → DEFAULT_MAX_CONCURRENCY
 * - <1 → 1 (at least one concurrency slot, otherwise the workflow cannot progress)
 * - >MAX_CONCURRENCY_CAP → MAX_CONCURRENCY_CAP
 * - otherwise the truncated original value
 */
export function clampMaxConcurrency(n: number | undefined): number {
  if (n === undefined || Number.isNaN(n)) return DEFAULT_MAX_CONCURRENCY
  return Math.max(1, Math.min(Math.trunc(n), MAX_CONCURRENCY_CAP))
}
