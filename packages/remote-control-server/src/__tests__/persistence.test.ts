import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IdempotencyConflictError, RcsDatabase } from '../persistence/database'

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

  test('canonicalizes nested object keys for idempotency while preserving changed values', () => {
    const database = new RcsDatabase(':memory:')
    database.upsertSession({
      id: 'session-1',
      environmentId: null,
      title: null,
      status: 'idle',
      source: 'web',
      permissionMode: null,
      workerEpoch: 0,
      username: null,
      createdAt: 100,
      updatedAt: 100,
      archivedAt: null,
    })

    const first = database.commitEvent({
      id: 'event-1',
      sessionId: 'session-1',
      type: 'user',
      payload: {
        content: 'hello',
        raw: {
          metadata: { beta: 2, alpha: 1 },
          parts: [{ second: 2, first: 1 }, 'tail'],
        },
      },
      direction: 'outbound',
      sourceEventId: 'message-1',
      dedupeScope: 'web:outbound:user',
      createdAt: 101,
    })
    const reorderedRetry = database.commitEvent({
      id: 'event-2',
      sessionId: 'session-1',
      type: 'user',
      payload: {
        raw: {
          parts: [{ first: 1, second: 2 }, 'tail'],
          metadata: { alpha: 1, beta: 2 },
        },
        content: 'hello',
      },
      direction: 'outbound',
      sourceEventId: 'message-1',
      dedupeScope: 'web:outbound:user',
      createdAt: 102,
    })

    expect(reorderedRetry).toEqual({ event: first.event, duplicate: true })
    expect(database.listEvents('session-1', 0, 100).events).toHaveLength(1)
    expect(database.getLastSeq('session-1')).toBe(1)

    expect(() =>
      database.commitEvent({
        id: 'event-3',
        sessionId: 'session-1',
        type: 'user',
        payload: {
          content: 'hello',
          raw: {
            metadata: { alpha: 1, beta: 3 },
            parts: [{ first: 1, second: 2 }, 'tail'],
          },
        },
        direction: 'outbound',
        sourceEventId: 'message-1',
        dedupeScope: 'web:outbound:user',
        createdAt: 103,
      }),
    ).toThrow(IdempotencyConflictError)

    database.close()
  })
})
