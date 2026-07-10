import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { migrateSchema } from './schema'
import {
  IdempotencyConflictError,
  type PersistedEventCommitResult,
  type PersistedEventInput,
  type PersistedEventPage,
  type PersistedSession,
  type PersistedSessionEvent,
  type PersistedSessionOwner,
  type PersistedSessionWorker,
} from './types'

export { IdempotencyConflictError } from './types'
export type {
  PersistedEventCommitResult,
  PersistedEventInput,
  PersistedEventPage,
  PersistedSession,
  PersistedSessionEvent,
  PersistedSessionOwner,
  PersistedSessionWorker,
} from './types'

interface SessionRow {
  id: string
  environmentId: string | null
  title: string | null
  status: string
  source: string
  permissionMode: string | null
  workerEpoch: number
  username: string | null
  archivedAt: number | null
  createdAt: number
  updatedAt: number
}

interface OwnerRow {
  sessionId: string
  ownerUuid: string
  createdAt: number
}

interface WorkerRow {
  sessionId: string
  workerStatus: string | null
  externalMetadataJson: string | null
  requiresActionDetailsJson: string | null
  lastHeartbeatAt: number | null
  createdAt: number
  updatedAt: number
}

interface EventRow {
  id: string
  sessionId: string
  seqNum: number
  type: string
  payloadJson: string
  direction: 'inbound' | 'outbound'
  sourceEventId: string | null
  dedupeScope: string | null
  createdAt: number
}

const SESSION_COLUMNS = `
  id,
  environment_id AS environmentId,
  title,
  status,
  source,
  permission_mode AS permissionMode,
  worker_epoch AS workerEpoch,
  username,
  archived_at_ms AS archivedAt,
  created_at_ms AS createdAt,
  updated_at_ms AS updatedAt
`

const EVENT_COLUMNS = `
  id,
  session_id AS sessionId,
  seq_num AS seqNum,
  type,
  payload_json AS payloadJson,
  direction,
  source_event_id AS sourceEventId,
  dedupe_scope AS dedupeScope,
  created_at_ms AS createdAt
`

function isBoxedJsonPrimitive(value: object): boolean {
  const tag = Object.prototype.toString.call(value)
  return (
    tag === '[object Boolean]' ||
    tag === '[object Number]' ||
    tag === '[object String]' ||
    tag === '[object BigInt]' ||
    tag === '[object Symbol]'
  )
}

function createCanonicalJsonReplacer() {
  const sortedObjects = new WeakMap<object, object>()

  return (_key: string, value: unknown): unknown => {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      isBoxedJsonPrimitive(value)
    ) {
      return value
    }

    const cached = sortedObjects.get(value)
    if (cached) return cached

    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    sortedObjects.set(value, sorted)
    for (const key of Object.keys(record).sort()) {
      sorted[key] = record[key]
    }
    return sorted
  }
}

function serializeJson(value: unknown, label: string): string {
  const serialized = JSON.stringify(value, createCanonicalJsonReplacer())
  if (serialized === undefined) {
    throw new TypeError(`${label} must be JSON-serializable`)
  }
  return serialized
}

function canonicalizeSerializedJson(serialized: string): string {
  return serializeJson(JSON.parse(serialized) as unknown, 'stored payload')
}

function parseNullableRecord(
  serialized: string | null,
): Record<string, unknown> | null {
  return serialized === null
    ? null
    : (JSON.parse(serialized) as Record<string, unknown>)
}

function toSession(row: SessionRow): PersistedSession {
  return row
}

function toOwner(row: OwnerRow): PersistedSessionOwner {
  return row
}

function toWorker(row: WorkerRow): PersistedSessionWorker {
  return {
    sessionId: row.sessionId,
    workerStatus: row.workerStatus,
    externalMetadata: parseNullableRecord(row.externalMetadataJson),
    requiresActionDetails: parseNullableRecord(row.requiresActionDetailsJson),
    lastHeartbeatAt: row.lastHeartbeatAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toEvent(row: EventRow): PersistedSessionEvent {
  return {
    id: row.id,
    sessionId: row.sessionId,
    seqNum: row.seqNum,
    type: row.type,
    payload: JSON.parse(row.payloadJson) as unknown,
    direction: row.direction,
    sourceEventId: row.sourceEventId,
    dedupeScope: row.dedupeScope,
    createdAt: row.createdAt,
  }
}

export class RcsDatabase {
  private readonly database: Database

  constructor(path: string) {
    if (path !== ':memory:' && path !== '') {
      mkdirSync(dirname(resolve(path)), { recursive: true })
    }

    const database = new Database(path, { create: true, strict: true })
    this.database = database

    try {
      this.migrate()
    } catch (error) {
      database.close()
      throw error
    }
  }

  migrate(): void {
    migrateSchema(this.database)
  }

  upsertSession(session: PersistedSession): void {
    this.database
      .query<
        unknown,
        {
          id: string
          environmentId: string | null
          title: string | null
          status: string
          source: string
          permissionMode: string | null
          workerEpoch: number
          username: string | null
          archivedAt: number | null
          createdAt: number
          updatedAt: number
        }
      >(
        `INSERT INTO sessions (
           id, environment_id, title, status, source, permission_mode,
           worker_epoch, username, archived_at_ms, created_at_ms, updated_at_ms
         ) VALUES (
           $id, $environmentId, $title, $status, $source, $permissionMode,
           $workerEpoch, $username, $archivedAt, $createdAt, $updatedAt
         )
         ON CONFLICT(id) DO UPDATE SET
           environment_id = excluded.environment_id,
           title = excluded.title,
           status = excluded.status,
           source = excluded.source,
           permission_mode = excluded.permission_mode,
           worker_epoch = excluded.worker_epoch,
           username = excluded.username,
           archived_at_ms = excluded.archived_at_ms,
           created_at_ms = excluded.created_at_ms,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run(session)
  }

  getSession(id: string): PersistedSession | undefined {
    const row = this.database
      .query<SessionRow, { id: string }>(
        `SELECT ${SESSION_COLUMNS} FROM sessions WHERE id = $id`,
      )
      .get({ id })
    return row ? toSession(row) : undefined
  }

  listSessions(): PersistedSession[] {
    return this.database
      .query<SessionRow, []>(
        `SELECT ${SESSION_COLUMNS}
         FROM sessions
         ORDER BY created_at_ms, id`,
      )
      .all()
      .map(toSession)
  }

  bindOwner(sessionId: string, ownerUuid: string, createdAt: number): void {
    this.database
      .query<
        unknown,
        { sessionId: string; ownerUuid: string; createdAt: number }
      >(
        `INSERT OR IGNORE INTO session_owners (
           session_id, owner_uuid, created_at_ms
         ) VALUES ($sessionId, $ownerUuid, $createdAt)`,
      )
      .run({ sessionId, ownerUuid, createdAt })
  }

  isOwner(sessionId: string, ownerUuid: string): boolean {
    return Boolean(
      this.database
        .query<{ owned: number }, { sessionId: string; ownerUuid: string }>(
          `SELECT 1 AS owned
           FROM session_owners
           WHERE session_id = $sessionId AND owner_uuid = $ownerUuid`,
        )
        .get({ sessionId, ownerUuid }),
    )
  }

  listOwners(): PersistedSessionOwner[] {
    return this.database
      .query<OwnerRow, []>(
        `SELECT
           session_id AS sessionId,
           owner_uuid AS ownerUuid,
           created_at_ms AS createdAt
         FROM session_owners
         ORDER BY session_id, owner_uuid`,
      )
      .all()
      .map(toOwner)
  }

  upsertWorker(worker: PersistedSessionWorker): void {
    this.database
      .query<
        unknown,
        {
          sessionId: string
          workerStatus: string | null
          externalMetadataJson: string | null
          requiresActionDetailsJson: string | null
          lastHeartbeatAt: number | null
          createdAt: number
          updatedAt: number
        }
      >(
        `INSERT INTO session_workers (
           session_id, worker_status, external_metadata_json,
           requires_action_details_json, last_heartbeat_at_ms,
           created_at_ms, updated_at_ms
         ) VALUES (
           $sessionId, $workerStatus, $externalMetadataJson,
           $requiresActionDetailsJson, $lastHeartbeatAt,
           $createdAt, $updatedAt
         )
         ON CONFLICT(session_id) DO UPDATE SET
           worker_status = excluded.worker_status,
           external_metadata_json = excluded.external_metadata_json,
           requires_action_details_json = excluded.requires_action_details_json,
           last_heartbeat_at_ms = excluded.last_heartbeat_at_ms,
           created_at_ms = excluded.created_at_ms,
           updated_at_ms = excluded.updated_at_ms`,
      )
      .run({
        sessionId: worker.sessionId,
        workerStatus: worker.workerStatus,
        externalMetadataJson:
          worker.externalMetadata === null
            ? null
            : serializeJson(worker.externalMetadata, 'externalMetadata'),
        requiresActionDetailsJson:
          worker.requiresActionDetails === null
            ? null
            : serializeJson(
                worker.requiresActionDetails,
                'requiresActionDetails',
              ),
        lastHeartbeatAt: worker.lastHeartbeatAt,
        createdAt: worker.createdAt,
        updatedAt: worker.updatedAt,
      })
  }

  getWorker(sessionId: string): PersistedSessionWorker | undefined {
    const row = this.database
      .query<WorkerRow, { sessionId: string }>(
        `SELECT
           session_id AS sessionId,
           worker_status AS workerStatus,
           external_metadata_json AS externalMetadataJson,
           requires_action_details_json AS requiresActionDetailsJson,
           last_heartbeat_at_ms AS lastHeartbeatAt,
           created_at_ms AS createdAt,
           updated_at_ms AS updatedAt
         FROM session_workers
         WHERE session_id = $sessionId`,
      )
      .get({ sessionId })
    return row ? toWorker(row) : undefined
  }

  commitEvent(input: PersistedEventInput): PersistedEventCommitResult {
    const payloadJson = serializeJson(input.payload, 'payload')
    const commit = this.database.transaction(() => {
      if (input.dedupeScope !== null && input.sourceEventId !== null) {
        const existing = this.database
          .query<
            EventRow,
            {
              sessionId: string
              dedupeScope: string
              sourceEventId: string
            }
          >(
            `SELECT ${EVENT_COLUMNS}
             FROM session_events
             WHERE session_id = $sessionId
               AND dedupe_scope = $dedupeScope
               AND source_event_id = $sourceEventId`,
          )
          .get({
            sessionId: input.sessionId,
            dedupeScope: input.dedupeScope,
            sourceEventId: input.sourceEventId,
          })

        if (existing) {
          if (
            existing.payloadJson !== payloadJson &&
            canonicalizeSerializedJson(existing.payloadJson) !== payloadJson
          ) {
            throw new IdempotencyConflictError(
              input.sessionId,
              input.dedupeScope,
              input.sourceEventId,
            )
          }
          return { event: toEvent(existing), duplicate: true }
        }
      }

      const sequence = this.database
        .query<{ seqNum: number }, { sessionId: string }>(
          `UPDATE sessions
           SET last_seq = last_seq + 1
           WHERE id = $sessionId
           RETURNING last_seq AS seqNum`,
        )
        .get({ sessionId: input.sessionId })

      if (!sequence) {
        throw new Error(
          `Cannot commit event for missing session ${input.sessionId}`,
        )
      }

      this.database
        .query<
          unknown,
          {
            id: string
            sessionId: string
            seqNum: number
            type: string
            direction: 'inbound' | 'outbound'
            payloadJson: string
            sourceEventId: string | null
            dedupeScope: string | null
            createdAt: number
          }
        >(
          `INSERT INTO session_events (
             id, session_id, seq_num, type, direction, payload_json,
             source_event_id, dedupe_scope, created_at_ms
           ) VALUES (
             $id, $sessionId, $seqNum, $type, $direction, $payloadJson,
             $sourceEventId, $dedupeScope, $createdAt
           )`,
        )
        .run({
          id: input.id,
          sessionId: input.sessionId,
          seqNum: sequence.seqNum,
          type: input.type,
          direction: input.direction,
          payloadJson,
          sourceEventId: input.sourceEventId,
          dedupeScope: input.dedupeScope,
          createdAt: input.createdAt,
        })

      return {
        event: { ...input, seqNum: sequence.seqNum },
        duplicate: false,
      }
    })

    return commit.immediate()
  }

  listEvents(
    sessionId: string,
    afterSeq: number,
    limit: number,
  ): PersistedEventPage {
    const rows = this.database
      .query<EventRow, { sessionId: string; afterSeq: number; limit: number }>(
        `SELECT ${EVENT_COLUMNS}
         FROM session_events
         WHERE session_id = $sessionId AND seq_num > $afterSeq
         ORDER BY seq_num
         LIMIT $limit`,
      )
      .all({ sessionId, afterSeq, limit })
    return { events: rows.map(toEvent) }
  }

  getLastSeq(sessionId: string): number {
    return (
      this.database
        .query<{ lastSeq: number }, { sessionId: string }>(
          `SELECT last_seq AS lastSeq FROM sessions WHERE id = $sessionId`,
        )
        .get({ sessionId })?.lastSeq ?? 0
    )
  }

  archiveSession(sessionId: string, now: number): boolean {
    const result = this.database
      .query<unknown, { sessionId: string; now: number }>(
        `UPDATE sessions
         SET status = 'archived', archived_at_ms = $now, updated_at_ms = $now
         WHERE id = $sessionId AND archived_at_ms IS NULL`,
      )
      .run({ sessionId, now })
    return result.changes > 0
  }

  restoreSession(sessionId: string, now: number): boolean {
    const result = this.database
      .query<unknown, { sessionId: string; now: number }>(
        `UPDATE sessions
         SET status = 'inactive', archived_at_ms = NULL, updated_at_ms = $now
         WHERE id = $sessionId
           AND (archived_at_ms IS NOT NULL OR status = 'archived')`,
      )
      .run({ sessionId, now })
    return result.changes > 0
  }

  deleteSession(sessionId: string): boolean {
    const result = this.database
      .query<unknown, { sessionId: string }>(
        'DELETE FROM sessions WHERE id = $sessionId',
      )
      .run({ sessionId })
    return result.changes > 0
  }

  reset(): void {
    const reset = this.database.transaction(() => {
      this.database.exec('DELETE FROM session_workers')
      this.database.exec('DELETE FROM session_events')
      this.database.exec('DELETE FROM session_owners')
      this.database.exec('DELETE FROM sessions')
    })
    reset.immediate()
  }

  close(): void {
    this.database.close()
  }
}
