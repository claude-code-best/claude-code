import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attachRunStatePersistence, readRunState } from '../persistence.js'
import { createProgressBus } from '../progress/bus.js'
import { createProgressStoreFromBus } from '../progress/store.js'

/**
 * attachRunStatePersistence 的契约测试（调整后 Task 4）：
 * 直接测 bus + store 组合，不走 makeService（保持 makeService 签名 (ports, store, cwdOverride?) 不变）。
 *
 * runsDir 通过 attachRunStatePersistence 的第三个参数 runsDirProvider 注入 tmpdir，
 * 避免写真实项目目录（Bun ESM 模块命名空间只读，无法 monkey-patch getRunsDir）。
 */

test('run_done completed → 写盘 state.json，returnValue 一致', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-persist-'))
  try {
    const bus = createProgressBus()
    const store = createProgressStoreFromBus(bus)
    attachRunStatePersistence(bus, store, () => dir)

    bus.emit({
      type: 'run_started',
      runId: 'rW',
      workflowName: 'w',
      meta: null,
    })
    bus.emit({
      type: 'run_done',
      runId: 'rW',
      status: 'completed',
      returnValue: { ok: true, n: 3 },
    })

    // writeRunState 是 async（订阅里 void writeRunState(...)）；让 microtask 跑完
    await new Promise(r => setTimeout(r, 50))

    const got = await readRunState(dir, 'rW')
    expect(got).not.toBeNull()
    expect(got!.status).toBe('completed')
    expect(got!.returnValue).toEqual({ ok: true, n: 3 })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('run_done failed → 写盘 status=failed + error 字段', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-persist-'))
  try {
    const bus = createProgressBus()
    const store = createProgressStoreFromBus(bus)
    attachRunStatePersistence(bus, store, () => dir)

    bus.emit({
      type: 'run_started',
      runId: 'rF',
      workflowName: 'w',
      meta: null,
    })
    bus.emit({
      type: 'run_done',
      runId: 'rF',
      status: 'failed',
      error: 'boom',
    })
    await new Promise(r => setTimeout(r, 50))

    const got = await readRunState(dir, 'rF')
    expect(got).not.toBeNull()
    expect(got!.status).toBe('failed')
    expect(got!.error).toBe('boom')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('run_done killed → 写盘 status=killed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-persist-'))
  try {
    const bus = createProgressBus()
    const store = createProgressStoreFromBus(bus)
    attachRunStatePersistence(bus, store, () => dir)

    bus.emit({
      type: 'run_started',
      runId: 'rK',
      workflowName: 'w',
      meta: null,
    })
    bus.emit({ type: 'run_done', runId: 'rK', status: 'killed' })
    await new Promise(r => setTimeout(r, 50))

    const got = await readRunState(dir, 'rK')
    expect(got?.status).toBe('killed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeRunState 内部 IO 异常被吞掉：attachRunStatePersistence 不传播，bus emit 不中断', async () => {
  const blockerDir = await mkdtemp(join(tmpdir(), 'wf-persist-'))
  // 先创建一个同名文件，让子路径 mkdir 失败 → writeRunState 内部 catch 吞掉
  await writeFile(join(blockerDir, 'not-a-dir.txt'), 'blocker', 'utf-8')
  try {
    const bus = createProgressBus()
    const store = createProgressStoreFromBus(bus)
    // runsDir 指向一个父路径是文件的目录：mkdir recursive 失败
    attachRunStatePersistence(bus, store, () =>
      join(blockerDir, 'not-a-dir.txt'),
    )

    // 额外的订阅者，验证它仍被通知（bus emit 不应因持久化 listener 内部异常中断）
    let otherNotified = 0
    bus.subscribe(() => otherNotified++)

    // bus.emit 不应抛——writeRunState 内部吞异常
    expect(() => {
      bus.emit({
        type: 'run_started',
        runId: 'rErr',
        workflowName: 'w',
        meta: null,
      })
      bus.emit({
        type: 'run_done',
        runId: 'rErr',
        status: 'completed',
        returnValue: 'x',
      })
    }).not.toThrow()

    // 让 writeRunState 的 microtask 跑完（异常在内部被吞）
    await new Promise(r => setTimeout(r, 50))

    // store 这条订阅者仍正常工作（收到了 run_started + run_done 两次事件）
    expect(otherNotified).toBeGreaterThanOrEqual(2)
    expect(store.get('rErr')?.status).toBe('completed')
  } finally {
    await rm(blockerDir, { recursive: true, force: true })
  }
})

test('attachRunStatePersistence 返回 unsubscribe；调用后不再写盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-persist-'))
  try {
    const bus = createProgressBus()
    const store = createProgressStoreFromBus(bus)
    const unsub = attachRunStatePersistence(bus, store, () => dir)

    // 先发一个 run_done，验证写盘生效
    bus.emit({
      type: 'run_started',
      runId: 'r1',
      workflowName: 'w',
      meta: null,
    })
    bus.emit({ type: 'run_done', runId: 'r1', status: 'completed' })
    await new Promise(r => setTimeout(r, 50))
    expect(await readRunState(dir, 'r1')).not.toBeNull()

    // unsubscribe 后再发 run_done，不应再写盘
    unsub()
    bus.emit({
      type: 'run_started',
      runId: 'r2',
      workflowName: 'w',
      meta: null,
    })
    bus.emit({ type: 'run_done', runId: 'r2', status: 'completed' })
    await new Promise(r => setTimeout(r, 50))
    expect(await readRunState(dir, 'r2')).toBeNull()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
