import { describe, expect, test } from 'bun:test'
import {
  getWorkSignalGeneration,
  notifyWorkAvailable,
  waitForWorkSignal,
} from '../services/work-signal'

describe('work signal', () => {
  test('wakes an environment waiter when work becomes available', async () => {
    const environmentId = 'env-signal-wake'
    const generation = getWorkSignalGeneration(environmentId)
    let resolved = false
    const waiter = waitForWorkSignal(environmentId, generation, 1_000).then(
      () => {
        resolved = true
      },
    )

    await Promise.resolve()
    expect(resolved).toBe(false)
    notifyWorkAvailable(environmentId)
    await waiter
    expect(resolved).toBe(true)
  })

  test('resolves immediately when notification raced ahead of registration', async () => {
    const environmentId = 'env-signal-race'
    const generation = getWorkSignalGeneration(environmentId)
    notifyWorkAvailable(environmentId)

    const startedAt = Date.now()
    await waitForWorkSignal(environmentId, generation, 1_000)
    expect(Date.now() - startedAt).toBeLessThan(100)
  })

  test('resolves at the deadline when no notification arrives', async () => {
    const environmentId = 'env-signal-timeout'
    const generation = getWorkSignalGeneration(environmentId)
    const startedAt = Date.now()

    await waitForWorkSignal(environmentId, generation, 20)

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15)
  })

  test('keeps control and session wakeups isolated', async () => {
    const environmentId = 'env-signal-lanes'
    const controlGeneration = getWorkSignalGeneration(environmentId, 'control')
    const sessionGeneration = getWorkSignalGeneration(environmentId, 'session')
    let controlResolved = false
    let sessionResolved = false
    const controlWaiter = waitForWorkSignal(
      environmentId,
      controlGeneration,
      1_000,
      'control',
    ).then(() => {
      controlResolved = true
    })
    const sessionWaiter = waitForWorkSignal(
      environmentId,
      sessionGeneration,
      1_000,
      'session',
    ).then(() => {
      sessionResolved = true
    })

    notifyWorkAvailable(environmentId, 'session')
    await sessionWaiter
    expect(sessionResolved).toBe(true)
    expect(controlResolved).toBe(false)

    notifyWorkAvailable(environmentId, 'control')
    await controlWaiter
    expect(controlResolved).toBe(true)
  })
})
