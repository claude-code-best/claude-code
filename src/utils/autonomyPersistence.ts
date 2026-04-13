import { mkdir, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { lock } from './lockfile.js'

const persistenceLocks = new Map<string, Promise<void>>()

export async function withAutonomyPersistenceLock<T>(
  rootDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = resolve(rootDir)
  const lockPath = join(key, '.claude', 'autonomy', '.lock')
  const previous = persistenceLocks.get(key) ?? Promise.resolve()

  let release!: () => void
  const current = new Promise<void>(resolve => {
    release = resolve
  })
  persistenceLocks.set(
    key,
    previous.then(() => current),
  )

  await previous
  try {
    await mkdir(join(key, '.claude', 'autonomy'), { recursive: true })
    await writeFile(lockPath, '', { flag: 'a' })
    const unlock = await lock(lockPath, {
      lockfilePath: `${lockPath}.lock`,
      retries: {
        retries: 10,
        factor: 1.2,
        minTimeout: 10,
        maxTimeout: 100,
      },
    })
    try {
      return await fn()
    } finally {
      await unlock().catch(() => {})
    }
  } finally {
    release()
    if (persistenceLocks.get(key) === current) {
      persistenceLocks.delete(key)
    }
  }
}
