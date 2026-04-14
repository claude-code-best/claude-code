import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { cleanupTempDir, createTempDir } from '../../../tests/mocks/file-system'

// Mock the lockfile module so tests don't need real file locks
mock.module('../lockfile.js', () => ({
  lock: async (_file: string, _options?: unknown) => {
    return async () => {}
  },
}))

let tempDir = ''

beforeEach(async () => {
  tempDir = await createTempDir('autonomy-persistence-')
})

afterEach(async () => {
  if (tempDir) {
    await cleanupTempDir(tempDir)
  }
})

describe('withAutonomyPersistenceLock', () => {
  test('runs fn and returns its result', async () => {
    const { withAutonomyPersistenceLock } = await import(
      '../autonomyPersistence'
    )
    const result = await withAutonomyPersistenceLock(tempDir, async () => {
      return 42
    })
    expect(result).toBe(42)
  })

  test('creates the autonomy directory and lock file', async () => {
    const { withAutonomyPersistenceLock } = await import(
      '../autonomyPersistence'
    )
    await withAutonomyPersistenceLock(tempDir, async () => 'ok')

    const autonomyDir = join(tempDir, '.claude', 'autonomy')
    expect(existsSync(autonomyDir)).toBe(true)
  })

  test('propagates errors from the inner function', async () => {
    const { withAutonomyPersistenceLock } = await import(
      '../autonomyPersistence'
    )
    await expect(
      withAutonomyPersistenceLock(tempDir, async () => {
        throw new Error('inner failure')
      }),
    ).rejects.toThrow('inner failure')
  })

  test('serializes concurrent calls on the same rootDir', async () => {
    const { withAutonomyPersistenceLock } = await import(
      '../autonomyPersistence'
    )
    const order: number[] = []

    const first = withAutonomyPersistenceLock(tempDir, async () => {
      order.push(1)
      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 20))
      order.push(2)
      return 'first'
    })

    const second = withAutonomyPersistenceLock(tempDir, async () => {
      order.push(3)
      return 'second'
    })

    const [r1, r2] = await Promise.all([first, second])

    expect(r1).toBe('first')
    expect(r2).toBe('second')
    // The second call must wait for the first to finish
    expect(order).toEqual([1, 2, 3])
  })

  test('allows parallel calls on different rootDirs', async () => {
    const { withAutonomyPersistenceLock } = await import(
      '../autonomyPersistence'
    )
    const tempDir2 = await createTempDir('autonomy-persistence-2-')

    try {
      const order: string[] = []

      const first = withAutonomyPersistenceLock(tempDir, async () => {
        order.push('a-start')
        await new Promise(resolve => setTimeout(resolve, 10))
        order.push('a-end')
        return 'a'
      })

      const second = withAutonomyPersistenceLock(tempDir2, async () => {
        order.push('b-start')
        await new Promise(resolve => setTimeout(resolve, 10))
        order.push('b-end')
        return 'b'
      })

      const [r1, r2] = await Promise.all([first, second])
      expect(r1).toBe('a')
      expect(r2).toBe('b')
      // Both should start before either ends (parallel)
      expect(order.indexOf('a-start')).toBeLessThan(order.indexOf('a-end'))
      expect(order.indexOf('b-start')).toBeLessThan(order.indexOf('b-end'))
    } finally {
      await cleanupTempDir(tempDir2)
    }
  })
})
