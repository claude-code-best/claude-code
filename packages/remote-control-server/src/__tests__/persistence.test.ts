import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RcsDatabase } from '../persistence/database'

describe('RcsDatabase', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('migrates idempotently and restores sessions, owners, and events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const first = new RcsDatabase(path)
    first.upsertSession({
      id: 'session-1',
      environmentId: null,
      title: 'Saved',
      status: 'idle',
      source: 'web',
      permissionMode: 'default',
      workerEpoch: 0,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })
    first.bindOwner('session-1', 'owner-1', 100)
    const committed = first.commitEvent({
      id: 'event-1',
      sessionId: 'session-1',
      type: 'user',
      payload: { content: 'hello', uuid: 'message-1' },
      direction: 'outbound',
      sourceEventId: 'message-1',
      dedupeScope: 'web:outbound:user',
      createdAt: 101,
    })
    expect(committed.duplicate).toBe(false)
    expect(committed.event.seqNum).toBe(1)
    first.close()

    const second = new RcsDatabase(path)
    expect(second.getSession('session-1')?.title).toBe('Saved')
    expect(second.isOwner('session-1', 'owner-1')).toBe(true)
    expect(second.listEvents('session-1', 0, 100).events).toHaveLength(1)
    second.migrate()
    second.close()
  })
})
