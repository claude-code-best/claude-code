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
})
