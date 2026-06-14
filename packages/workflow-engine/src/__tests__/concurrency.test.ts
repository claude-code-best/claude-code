import { expect, test } from 'bun:test'
import {
  clampMaxConcurrency,
  Semaphore,
  maxConcurrency,
} from '../engine/concurrency.js'
import { DEFAULT_MAX_CONCURRENCY, MAX_CONCURRENCY_CAP } from '../constants.js'

test('Semaphore 限制并发，permit 转移不泄漏', async () => {
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
  expect(peak).toBe(2) // 永不超过 permits
})

test('maxConcurrency 返回 DEFAULT_MAX_CONCURRENCY (=3)', () => {
  expect(maxConcurrency()).toBe(DEFAULT_MAX_CONCURRENCY)
  expect(maxConcurrency()).toBe(3)
})

test('clampMaxConcurrency：undefined/NaN→DEFAULT；<1→1；>CAP→CAP；正常原值', () => {
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
  // 小数截断（Semaphore 已有 Math.max(1, Math.floor)；clampMaxConcurrency 显式 trunc）
  expect(clampMaxConcurrency(2.9)).toBe(2)
})

test('Semaphore(0) 至少 1 permit，acquire 不阻塞', async () => {
  const sem = new Semaphore(0)
  const release = await sem.acquire()
  expect(release).toBeTypeOf('function')
  release()
})

test('Semaphore 唤醒按 FIFO 顺序', async () => {
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

test('Semaphore.acquire 传 aborted signal → 立即 reject，不消耗 permit', async () => {
  // 修复 L：queued waiter 在 abort 时必须立即 reject 而非等 permit。
  // 否则一个被取消的 agent 阻塞在 acquire()，permit 被消耗（transfer 给已死的 waiter），
  // 实际并发能力降低；最坏情况下所有 waiter 都被取消，semaphore 还在排队等死掉的 waiter。
  const sem = new Semaphore(1)
  const ac = new AbortController()

  // 占用唯一 permit
  const first = await sem.acquire()

  // 排队的 waiter
  const queued = sem.acquire(ac.signal)
  await new Promise(r => {
    setTimeout(r, 5)
  })

  // abort → waiter 应立即 reject
  ac.abort()
  await expect(queued).rejects.toThrow()

  // permit 无泄漏：释放 first 后，新 acquire 应能立即拿到（无 stale waiter 抢占）
  first()
  const third = await sem.acquire()
  expect(third).toBeTypeOf('function')
  third()
})

test('Semaphore.acquire 传已 aborted 的 signal → 同步 reject', async () => {
  const sem = new Semaphore(1)
  const ac = new AbortController()
  ac.abort()
  // 信号已 aborted，即使有 permit 也不应 acquire（语义：调用者已取消）
  // 注意：当前实现先看 available，可能直接返回。本测试 lock "先 check abort"。
  // 若实现选择"permit 可用时优先发放"，则此测试改为：acquire 成功，调用者后续检查 abort。
  // 当前实现选择前者：aborted signal 立即抛错，避免已死 agent 拿 permit。
  await expect(sem.acquire(ac.signal)).rejects.toThrow()
})
