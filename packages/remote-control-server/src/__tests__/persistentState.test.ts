import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { config } from '../config'
import {
  getPersistence,
  initializePersistence,
  resetPersistenceForTests,
} from '../persistence/runtime'
import {
  closePersistentState,
  initializePersistentState,
} from '../services/persistentState'
import {
  storeBindSession,
  storeClearPersistentCachesForTests,
  storeCreateSession,
  storeGetSession,
  storeGetSessionWorker,
  storeIsSessionOwner,
  storeUpdateSession,
} from '../store'

describe('persistent state lifecycle', () => {
  const dirs: string[] = []

  afterEach(() => {
    storeClearPersistentCachesForTests()
    resetPersistenceForTests()
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('recovers ownership and immediately reconciles a stale session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-state-'))
    dirs.push(dir)
    const dbPath = join(dir, 'rcs.sqlite')
    const now = Date.now()
    const staleUpdatedAt = now - config.disconnectTimeout * 1000 * 2 - 1

    initializePersistence(dbPath)
    const session = storeCreateSession({ title: 'Recovered session' })
    storeBindSession(session.id, 'owner-1')
    storeUpdateSession(session.id, { status: 'running' })

    const persistedSession = storeGetSession(session.id)
    expect(persistedSession).toBeDefined()
    if (!persistedSession) return
    getPersistence().upsertSession({
      ...persistedSession,
      archivedAt: null,
      createdAt: persistedSession.createdAt.getTime(),
      updatedAt: staleUpdatedAt,
    })

    closePersistentState()
    storeClearPersistentCachesForTests()
    expect(storeGetSession(session.id)).toBeUndefined()
    expect(storeIsSessionOwner(session.id, 'owner-1')).toBe(false)

    initializePersistentState(dbPath, now)

    expect(storeGetSession(session.id)).toMatchObject({
      title: 'Recovered session',
      status: 'idle',
    })
    expect(storeGetSessionWorker(session.id)?.workerStatus).toBe('offline')
    expect(storeIsSessionOwner(session.id, 'owner-1')).toBe(true)
  })
})
