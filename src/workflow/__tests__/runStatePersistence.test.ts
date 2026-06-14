import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attachRunStatePersistence, readRunState } from '../persistence.js'
import { createProgressBus } from '../progress/bus.js'
import { createProgressStoreFromBus } from '../progress/store.js'

/**
 * Contract test for attachRunStatePersistence (adjusted Task 4):
 * directly test the bus + store combination, bypassing makeService (keeps makeService signature (ports, store, cwdOverride?) unchanged).
 *
 * runsDir is injected as tmpdir via attachRunStatePersistence's third parameter runsDirProvider,
 * to avoid writing to the real project directory (Bun ESM module namespace is read-only, cannot monkey-patch getRunsDir).
 */

test('run_done completed → writes state.json to disk, returnValue consistent', async () => {
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

    // writeRunState is async (void writeRunState(...) in the subscription); let the microtask complete
    await new Promise(r => setTimeout(r, 50))

    const got = await readRunState(dir, 'rW')
    expect(got).not.toBeNull()
    expect(got!.status).toBe('completed')
    expect(got!.returnValue).toEqual({ ok: true, n: 3 })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('run_done failed → writes status=failed + error field to disk', async () => {
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

test('run_done killed → writes status=killed to disk', async () => {
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

test('writeRunState internal IO exception is swallowed: attachRunStatePersistence does not propagate, bus emit does not break', async () => {
  const blockerDir = await mkdtemp(join(tmpdir(), 'wf-persist-'))
  // first create a same-named file, so subdir mkdir fails → writeRunState internal catch swallows it
  await writeFile(join(blockerDir, 'not-a-dir.txt'), 'blocker', 'utf-8')
  try {
    const bus = createProgressBus()
    const store = createProgressStoreFromBus(bus)
    // runsDir points to a dir whose parent path is a file: mkdir recursive fails
    attachRunStatePersistence(bus, store, () =>
      join(blockerDir, 'not-a-dir.txt'),
    )

    // an extra subscriber to verify it still gets notified (bus emit should not break due to internal exception in persistence listener)
    let otherNotified = 0
    bus.subscribe(() => otherNotified++)

    // bus.emit should not throw — writeRunState swallows the exception internally
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

    // let writeRunState's microtask complete (exception swallowed internally)
    await new Promise(r => setTimeout(r, 50))

    // this store subscriber still works normally (received both run_started + run_done events)
    expect(otherNotified).toBeGreaterThanOrEqual(2)
    expect(store.get('rErr')?.status).toBe('completed')
  } finally {
    await rm(blockerDir, { recursive: true, force: true })
  }
})

test('attachRunStatePersistence returns unsubscribe; after calling it no more disk writes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-persist-'))
  try {
    const bus = createProgressBus()
    const store = createProgressStoreFromBus(bus)
    const unsub = attachRunStatePersistence(bus, store, () => dir)

    // first emit a run_done, verify disk write takes effect
    bus.emit({
      type: 'run_started',
      runId: 'r1',
      workflowName: 'w',
      meta: null,
    })
    bus.emit({ type: 'run_done', runId: 'r1', status: 'completed' })
    await new Promise(r => setTimeout(r, 50))
    expect(await readRunState(dir, 'r1')).not.toBeNull()

    // after unsubscribe, emit run_done again, should not write to disk
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
