import { expect, test } from 'bun:test'
import {
  clampMaxConcurrency,
  Semaphore,
  maxConcurrency,
} from '../engine/concurrency.js'
import { DEFAULT_MAX_CONCURRENCY, MAX_CONCURRENCY_CAP } from '../constants.js'

test('Semaphore limits concurrency, permit transfer does not leak', async () => {
  const sem = new Semaphore(2)
  let active = 0
  let peak = 0
  const task = async (): Promise<void> => {
    const release = await sem.acquire()
    active++
    peak = Math.max(peak, active)
    await new Promise(r => {
      setTimeout(r, 10)
    })
    active--
    release()
  }
  await Promise.all(Array.from({ length: 6 }, () => task()))
  expect(peak).toBe(2) // never exceeds permits
})

test('maxConcurrency returns DEFAULT_MAX_CONCURRENCY (=3)', () => {
  expect(maxConcurrency()).toBe(DEFAULT_MAX_CONCURRENCY)
  expect(maxConcurrency()).toBe(3)
})

test('clampMaxConcurrency: undefined/NaN→DEFAULT; <1→1; >CAP→CAP; normal value kept', () => {
  expect(clampMaxConcurrency(undefined)).toBe(DEFAULT_MAX_CONCURRENCY)
  expect(clampMaxConcurrency(Number.NaN)).toBe(DEFAULT_MAX_CONCURRENCY)
  expect(clampMaxConcurrency(0)).toBe(1)
  expect(clampMaxConcurrency(-3)).toBe(1)
  expect(clampMaxConcurrency(MAX_CONCURRENCY_CAP + 100)).toBe(
    MAX_CONCURRENCY_CAP,
  )
  expect(clampMaxConcurrency(5)).toBe(5)
  expect(clampMaxConcurrency(1)).toBe(1)
  expect(clampMaxConcurrency(MAX_CONCURRENCY_CAP)).toBe(MAX_CONCURRENCY_CAP)
  // decimal truncation (Semaphore already does Math.max(1, Math.floor); clampMaxConcurrency explicitly truncs)
  expect(clampMaxConcurrency(2.9)).toBe(2)
})

test('Semaphore(0) has at least 1 permit, acquire does not block', async () => {
  const sem = new Semaphore(0)
  const release = await sem.acquire()
  expect(release).toBeTypeOf('function')
  release()
})

test('Semaphore wakes up in FIFO order', async () => {
  const sem = new Semaphore(1)
  const order: string[] = []
  const first = await sem.acquire()
  const p1 = sem.acquire().then(r => {
    order.push('p1')
    return r
  })
  const p2 = sem.acquire().then(r => {
    order.push('p2')
    return r
  })
  await new Promise(r => {
    setTimeout(r, 5)
  })
  expect(order).toEqual([])
  first()
  await new Promise(r => {
    setTimeout(r, 5)
  })
  expect(order).toEqual(['p1'])
  ;(await p1)()
  await new Promise(r => {
    setTimeout(r, 5)
  })
  expect(order).toEqual(['p1', 'p2'])
  ;(await p2)()
})

test('Semaphore.acquire with an aborted signal → immediately rejects, no permit consumed', async () => {
  // Fix L: a queued waiter on abort must reject immediately instead of waiting for a permit.
  // Otherwise a cancelled agent blocks on acquire(), the permit is consumed (transferred to a dead waiter),
  // reducing actual concurrency capacity; in the worst case all waiters are cancelled while the semaphore still queues for dead waiters.
  const sem = new Semaphore(1)
  const ac = new AbortController()

  // occupy the only permit
  const first = await sem.acquire()

  // queued waiter
  const queued = sem.acquire(ac.signal)
  await new Promise(r => {
    setTimeout(r, 5)
  })

  // abort → waiter should reject immediately
  ac.abort()
  await expect(queued).rejects.toThrow()

  // no permit leak: after releasing first, a new acquire should get it immediately (no stale waiter preemption)
  first()
  const third = await sem.acquire()
  expect(third).toBeTypeOf('function')
  third()
})

test('Semaphore.acquire with an already aborted signal → synchronous reject', async () => {
  const sem = new Semaphore(1)
  const ac = new AbortController()
  ac.abort()
  // signal already aborted, should not acquire even if a permit is available (semantics: caller already cancelled)
  // Note: current implementation checks available first and may return directly. This test locks "check abort first".
  // If the implementation chose "prefer granting when permit available", this test would change to: acquire succeeds, caller checks abort later.
  // Current implementation chose the former: aborted signal throws immediately, preventing dead agents from grabbing permits.
  await expect(sem.acquire(ac.signal)).rejects.toThrow()
})
