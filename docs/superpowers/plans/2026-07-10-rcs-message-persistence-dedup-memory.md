# RCS Message Persistence, Deduplication, and Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RCS conversations durable, idempotent, lifecycle-manageable from the Web UI, and bounded in resident memory.

**Architecture:** Bun SQLite is the durable source for sessions, owners, worker snapshots, and ordered events. Existing process-local stores remain transient caches/connection registries, while a single commit service allocates durable sequence numbers before fan-out. The Web adapter owns one cancellable EventSource and reduces history/live events by stable identity.

**Tech Stack:** TypeScript, Bun 1.3+, `bun:sqlite`, Hono, React 19, native EventSource, Bun test, Vite.

## Global Constraints

- Preserve every pre-existing user modification in the dirty worktree; never reset or overwrite unrelated hunks.
- Production database path is `RCS_DB_PATH` or `./data/rcs.sqlite` from the RCS process working directory.
- Supported deployment is one RCS process per SQLite database.
- Durable conversation events have no automatic retention; only permanent session deletion removes them.
- EventBus catch-up memory is bounded to 256 events and 4 MiB per bus.
- Archive is reversible and preserves history; permanent delete is explicit and irreversible.
- Do not deduplicate by content. Only stable upstream identities may collapse retries.
- `bun run typecheck` must finish with zero errors.
- Production code must not use `as any`.
- Use Conventional Commits for commits that can be isolated safely.
- Do not stage an entire pre-existing dirty Web file merely to create a commit; leave overlapping user-owned changes unstaged unless an exact hunk can be isolated safely.

---

## Planned file structure

- `packages/remote-control-server/src/persistence/schema.ts`: versioned SQLite DDL and migration execution.
- `packages/remote-control-server/src/persistence/database.ts`: typed synchronous repository for durable sessions, owners, workers, and events.
- `packages/remote-control-server/src/persistence/runtime.ts`: process-wide repository selection, production initialization, test reset, and close.
- `packages/remote-control-server/src/persistence/types.ts`: persisted row/input/result interfaces shared by store and transport.
- `packages/remote-control-server/src/__tests__/persistence.test.ts`: migration, restart, ownership, sequence, and idempotency tests.
- `packages/remote-control-server/web/src/lib/session-event-reducer.ts`: pure history/live event-to-thread reducer.
- `packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts`: user echo, assistant retry, cursor, and identical-text tests.
- `packages/remote-control-server/web/src/components/SessionActions.tsx`: archive/restore/delete menu and confirmation dialogs.
- Existing store, services, routes, transports, adapter, pages, docs, and API client are modified only at their responsibility boundaries.

---

### Task 1: SQLite schema and typed repository

**Files:**
- Create: `packages/remote-control-server/src/persistence/types.ts`
- Create: `packages/remote-control-server/src/persistence/schema.ts`
- Create: `packages/remote-control-server/src/persistence/database.ts`
- Create: `packages/remote-control-server/src/persistence/runtime.ts`
- Create: `packages/remote-control-server/src/__tests__/persistence.test.ts`
- Modify: `packages/remote-control-server/src/config.ts`

**Interfaces:**
- Produces: `RcsDatabase`, `initializePersistence(path: string)`, `getPersistence()`, `closePersistence()`, `resetPersistenceForTests()`.
- Produces: `commitEvent(input: PersistedEventInput): PersistedEventCommitResult` and `listEvents(sessionId, afterSeq, limit)`.
- Consumes: Bun `Database` from `bun:sqlite`.

- [ ] **Step 1: Write failing migration and restart tests**

```ts
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RcsDatabase } from '../persistence/database'

describe('RcsDatabase', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  test('migrates idempotently and restores sessions, owners, and events', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rcs-db-'))
    dirs.push(dir)
    const path = join(dir, 'rcs.sqlite')
    const first = new RcsDatabase(path)
    first.upsertSession({
      id: 'session-1', environmentId: null, title: 'Saved', status: 'idle',
      source: 'web', permissionMode: 'default', workerEpoch: 0, username: null,
      createdAt: 100, updatedAt: 100, archivedAt: null,
    })
    first.bindOwner('session-1', 'owner-1', 100)
    const committed = first.commitEvent({
      id: 'event-1', sessionId: 'session-1', type: 'user',
      payload: { content: 'hello', uuid: 'message-1' }, direction: 'outbound',
      sourceEventId: 'message-1', dedupeScope: 'web:outbound:user', createdAt: 101,
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bun test packages/remote-control-server/src/__tests__/persistence.test.ts`

Expected: FAIL because `RcsDatabase` and persistence modules do not exist.

- [ ] **Step 3: Define persistence types and complete schema**

```ts
export interface PersistedEventInput {
  id: string
  sessionId: string
  type: string
  payload: unknown
  direction: 'inbound' | 'outbound'
  sourceEventId: string | null
  dedupeScope: string | null
  createdAt: number
}

export interface PersistedSessionEvent extends PersistedEventInput {
  seqNum: number
}

export type PersistedEventCommitResult = {
  event: PersistedSessionEvent
  duplicate: boolean
}
```

`schema.ts` must execute this version-1 schema transactionally:

```sql
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  environment_id TEXT,
  title TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  permission_mode TEXT,
  worker_epoch INTEGER NOT NULL DEFAULT 0,
  username TEXT,
  last_seq INTEGER NOT NULL DEFAULT 0,
  archived_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session_owners (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  owner_uuid TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (session_id, owner_uuid)
);
CREATE TABLE IF NOT EXISTS session_events (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq_num INTEGER NOT NULL,
  id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
  payload_json TEXT NOT NULL,
  source_event_id TEXT,
  dedupe_scope TEXT,
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (session_id, seq_num)
);
CREATE UNIQUE INDEX IF NOT EXISTS session_events_dedupe
  ON session_events(session_id, dedupe_scope, source_event_id)
  WHERE dedupe_scope IS NOT NULL AND source_event_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS session_workers (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  worker_status TEXT,
  external_metadata_json TEXT,
  requires_action_details_json TEXT,
  last_heartbeat_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);
```

- [ ] **Step 4: Implement `RcsDatabase` with prepared statements and transactional event commits**

`commitEvent` must query the partial unique key first. Equal canonical JSON returns `{ duplicate: true }`; different canonical JSON throws `IdempotencyConflictError`. A new event increments `sessions.last_seq` and inserts the row in one transaction. Implement `upsertSession`, `listSessions`, `getSession`, `bindOwner`, `isOwner`, `listOwners`, `upsertWorker`, `getWorker`, `listEvents`, `getLastSeq`, `archiveSession`, `restoreSession`, `deleteSession`, `reset`, and `close`.

The public class surface is fixed as:

```ts
export class RcsDatabase {
  constructor(path: string)
  migrate(): void
  upsertSession(session: PersistedSession): void
  getSession(id: string): PersistedSession | undefined
  listSessions(): PersistedSession[]
  bindOwner(sessionId: string, ownerUuid: string, createdAt: number): void
  isOwner(sessionId: string, ownerUuid: string): boolean
  listOwners(): PersistedSessionOwner[]
  upsertWorker(worker: PersistedSessionWorker): void
  getWorker(sessionId: string): PersistedSessionWorker | undefined
  commitEvent(input: PersistedEventInput): PersistedEventCommitResult
  listEvents(sessionId: string, afterSeq: number, limit: number): PersistedEventPage
  getLastSeq(sessionId: string): number
  archiveSession(sessionId: string, now: number): boolean
  restoreSession(sessionId: string, now: number): boolean
  deleteSession(sessionId: string): boolean
  reset(): void
  close(): void
}
```

Canonical payload JSON uses the existing `jsonStringify` helper when possible; otherwise use `JSON.stringify` consistently for both insert and comparison.

- [ ] **Step 5: Add runtime initialization and exact config**

```ts
export const config = {
  version: process.env.RCS_VERSION || '0.1.0',
  port: parseInt(process.env.RCS_PORT || '3000', 10),
  host: process.env.RCS_HOST || '0.0.0.0',
  apiKeys: (process.env.RCS_API_KEYS || '').split(',').filter(Boolean),
  baseUrl: process.env.RCS_BASE_URL || '',
  pollTimeout: parseInt(process.env.RCS_POLL_TIMEOUT || '8', 10),
  heartbeatInterval: parseInt(process.env.RCS_HEARTBEAT_INTERVAL || '20', 10),
  jwtExpiresIn: parseInt(process.env.RCS_JWT_EXPIRES_IN || '3600', 10),
  disconnectTimeout: parseInt(process.env.RCS_DISCONNECT_TIMEOUT || '300', 10),
  webCorsOrigins: (process.env.RCS_WEB_CORS_ORIGINS || '')
    .split(',').map(origin => origin.trim()).filter(Boolean),
  wsIdleTimeout: parseInt(process.env.RCS_WS_IDLE_TIMEOUT || '30', 10),
  wsKeepaliveInterval: parseInt(process.env.RCS_WS_KEEPALIVE_INTERVAL || '20', 10),
  dbPath: process.env.RCS_DB_PATH || './data/rcs.sqlite',
} as const
```

`runtime.ts` starts with an isolated `:memory:` database for route/unit tests, swaps to the configured file in `initializePersistence`, and closes the previous instance. It must never silently fall back after a production open error.

- [ ] **Step 6: Run persistence tests and typecheck**

Run: `bun test packages/remote-control-server/src/__tests__/persistence.test.ts`

Expected: PASS.

Run: `bun run --cwd packages/remote-control-server typecheck`

Expected: zero TypeScript errors.

- [ ] **Step 7: Commit isolated new backend files**

```bash
git add packages/remote-control-server/src/persistence \
  packages/remote-control-server/src/__tests__/persistence.test.ts \
  packages/remote-control-server/src/config.ts
git commit -m "feat: add RCS SQLite persistence"
```

---

### Task 2: Durable sessions, owners, and worker snapshots

**Files:**
- Modify: `packages/remote-control-server/src/store.ts`
- Modify: `packages/remote-control-server/src/services/session.ts`
- Modify: `packages/remote-control-server/src/index.ts`
- Modify: `packages/remote-control-server/src/__tests__/store.test.ts`
- Modify: `packages/remote-control-server/src/__tests__/services.test.ts`
- Modify: `packages/remote-control-server/src/__tests__/disconnect-monitor.test.ts`

**Interfaces:**
- Consumes: `getPersistence()` repository methods from Task 1.
- Produces: existing store API with write-through durability and `storeHydratePersistentState()`.

- [ ] **Step 1: Add failing write-through and owner recovery tests**

Use the public store API in this recovery test:

```ts
test('hydrates durable sessions, owners, and workers without orphan claiming', () => {
  const session = storeCreateSession({ title: 'Durable' })
  storeBindSession(session.id, 'owner-a')
  storeUpsertSessionWorker(session.id, { workerStatus: 'idle' })
  storeUpdateSession(session.id, { status: 'archived', title: 'Saved' })

  storeClearPersistentCachesForTests()
  storeHydratePersistentState()

  expect(storeGetSession(session.id)?.title).toBe('Saved')
  expect(storeGetSessionWorker(session.id)?.workerStatus).toBe('idle')
  expect(storeIsSessionOwner(session.id, 'owner-a')).toBe(true)
  expect(storeIsSessionOwner(session.id, 'owner-b')).toBe(false)
  expect(storeListSessionsByOwnerUuid('owner-b')).toHaveLength(0)
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test packages/remote-control-server/src/__tests__/store.test.ts packages/remote-control-server/src/__tests__/services.test.ts`

Expected: FAIL because current Map operations do not write or hydrate SQLite.

- [ ] **Step 3: Wire existing store functions to persistence**

For session/owner/worker operations, commit to SQLite before updating Maps. `storeReset()` clears both the Maps and current test database. `storeHydratePersistentState()` clears only durable caches, loads sessions/owners/workers from SQLite, and leaves users, tokens, environments, work items, and connection registries transient.

Keep returned `Date` objects and existing public record shapes unchanged so current services and tests retain their contracts.

- [ ] **Step 4: Initialize and close persistence in the RCS process**

Before `Bun.serve` receives traffic, `src/index.ts` calls:

```ts
initializePersistence(config.dbPath)
storeHydratePersistentState()
runDisconnectMonitorSweep()
```

Graceful shutdown calls `closePersistence()` after closing sockets. Replace the `In-memory store ready` startup line with a storage-ready message that does not expose the path.

- [ ] **Step 5: Run focused and existing backend tests**

Run: `bun test packages/remote-control-server/src/__tests__/store.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/disconnect-monitor.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/remote-control-server/src/store.ts \
  packages/remote-control-server/src/services/session.ts \
  packages/remote-control-server/src/index.ts \
  packages/remote-control-server/src/__tests__/store.test.ts \
  packages/remote-control-server/src/__tests__/services.test.ts \
  packages/remote-control-server/src/__tests__/disconnect-monitor.test.ts
git commit -m "feat: persist RCS sessions and ownership"
```

---

### Task 3: Idempotent durable event commit

**Files:**
- Modify: `packages/remote-control-server/src/services/transport.ts`
- Modify: `packages/remote-control-server/src/transport/event-bus.ts`
- Modify: `packages/remote-control-server/src/routes/v1/session-ingress.ts`
- Modify: `packages/remote-control-server/src/routes/v2/worker-events.ts`
- Modify: `packages/remote-control-server/src/routes/web/control.ts`
- Modify: `packages/remote-control-server/src/transport/ws-handler.ts`
- Modify: `packages/remote-control-server/src/__tests__/event-bus.test.ts`
- Modify: `packages/remote-control-server/src/__tests__/routes.test.ts`
- Modify: `packages/remote-control-server/src/__tests__/ws-handler.test.ts`

**Interfaces:**
- Consumes: `RcsDatabase.commitEvent` from Task 1 and durable sessions from Task 2.
- Produces: `publishSessionEvent(sessionId, type, payload, direction, identity?)` returning `{ event, duplicate }`.
- Produces: `EventBus.publishCommitted(event)` for fan-out without sequence allocation.

- [ ] **Step 1: Write failing duplicate-ingress tests**

For both `/v2/session_ingress/session/:id/events` and `/v1/code/sessions/:id/worker/events`, use the same assertion helper:

```ts
async function expectIdempotentAssistantPost(
  request: (content: string) => Promise<Response>,
  sessionId: string,
) {
  const received: unknown[] = []
  const unsubscribe = getEventBus(sessionId).subscribe(event => received.push(event))
  expect((await request('hello')).status).toBe(200)
  expect((await request('hello')).status).toBe(200)
  const page = getPersistence().listEvents(sessionId, 0, 100)
  expect(page.events.filter(event => event.type === 'assistant')).toHaveLength(1)
  expect(getPersistence().getLastSeq(sessionId)).toBe(1)
  expect(received).toHaveLength(1)
  expect((await request('different')).status).toBe(409)
  unsubscribe()
}
```

Each `request` body carries the stable UUID `assistant-1`; only its content changes for the conflict assertion.

- [ ] **Step 2: Run duplicate tests and verify RED**

Run: `bun test packages/remote-control-server/src/__tests__/routes.test.ts --test-name-pattern "idempotent|conflict"`

Expected: FAIL with two events/two notifications and no conflict.

- [ ] **Step 3: Preserve upstream identities at every ingress**

Use this identity contract:

```ts
export interface EventIdentity {
  sourceEventId?: string
  producer: 'web' | 'v1-ingress' | 'v2-worker' | 'system'
}

const dedupeScope = sourceEventId
  ? `${producer}:${direction}:${type}`
  : null
```

- Web obtains `sourceEventId` from `body.uuid`.
- V1 obtains it from `msg.uuid`.
- V2 preserves envelope `event_id`; otherwise uses `payload.uuid`.
- System events without stable IDs remain non-idempotent.

- [ ] **Step 4: Commit before fan-out**

`publishSessionEvent` normalizes once, calls `commitEvent`, and invokes
`getEventBus(sessionId).publishCommitted(event)` only when `duplicate === false`.
Convert `IdempotencyConflictError` to HTTP 409 at batch routes. Batch processing
must not allocate a second sequence for duplicate members.

Keep `EventBus.publish` for ACP/transient callers and existing unit tests;
`publishCommitted` only notifies and adds to its bounded ring.

- [ ] **Step 5: Run focused tests**

Run: `bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/ws-handler.test.ts packages/remote-control-server/src/__tests__/event-bus.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/remote-control-server/src/services/transport.ts \
  packages/remote-control-server/src/transport/event-bus.ts \
  packages/remote-control-server/src/routes/v1/session-ingress.ts \
  packages/remote-control-server/src/routes/v2/worker-events.ts \
  packages/remote-control-server/src/routes/web/control.ts \
  packages/remote-control-server/src/transport/ws-handler.ts \
  packages/remote-control-server/src/__tests__
git commit -m "fix: make RCS event ingestion idempotent"
```

---

### Task 4: Durable history, cursor handoff, and bounded buses

**Files:**
- Modify: `packages/remote-control-server/src/transport/event-bus.ts`
- Modify: `packages/remote-control-server/src/transport/sse-writer.ts`
- Modify: `packages/remote-control-server/src/transport/acp-sse-writer.ts`
- Modify: `packages/remote-control-server/src/routes/web/sessions.ts`
- Modify: `packages/remote-control-server/src/transport/ws-handler.ts`
- Modify: `packages/remote-control-server/src/types/api.ts`
- Modify: `packages/remote-control-server/src/__tests__/sse-writer.test.ts`
- Modify: `packages/remote-control-server/src/__tests__/routes.test.ts`
- Modify: `packages/remote-control-server/src/__tests__/event-bus.test.ts`

**Interfaces:**
- Consumes: `getPersistence().listEvents(sessionId, afterSeq, limit)`.
- Produces: `HistoryResponse { events, next_cursor, has_more, oldest_available_seq, truncated }`.
- Produces: SSE frames containing `id`, `sessionId`, `type`, `payload`, `direction`, `seqNum`, and `createdAt`.

- [ ] **Step 1: Write failing cursor and memory-bound tests**

Add tests for:

```ts
test('history cursor followed by SSE receives boundary event once', async () => {
  publishSessionEvent('session-1', 'user', { uuid: 'u1', content: 'one' }, 'outbound', {
    producer: 'web', sourceEventId: 'u1',
  })
  const history = await requestHistory('session-1')
  expect(history.next_cursor).toBe(1)
  publishSessionEvent('session-1', 'assistant', { uuid: 'a1', content: 'two' }, 'inbound', {
    producer: 'v2-worker', sourceEventId: 'a1',
  })
  const frames = await readSseFrames('session-1', history.next_cursor, 1)
  expect(frames.map(frame => frame.seqNum)).toEqual([2])
})

test('event bus evicts until count and byte limits both hold', () => {
  const bus = new EventBus({ maxEvents: 3, maxBytes: 64 })
  for (let index = 0; index < 4; index++) {
    bus.publish({ id: `e${index}`, sessionId: 's1', type: 'user',
      payload: { content: '1234567890' }, direction: 'outbound' })
  }
  expect(bus.retainedEventCount).toBeLessThanOrEqual(3)
  expect(bus.retainedBytes).toBeLessThanOrEqual(64)
})
```

Also assert invalid, negative, and non-integer cursors return 400.

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test packages/remote-control-server/src/__tests__/sse-writer.test.ts packages/remote-control-server/src/__tests__/event-bus.test.ts packages/remote-control-server/src/__tests__/routes.test.ts --test-name-pattern "cursor|boundary|byte limits"`

Expected: FAIL because history is bus-backed, the query cursor is unsupported, and bus memory is count-only.

- [ ] **Step 3: Move history/replay reads to SQLite**

`GET /web/sessions/:id/history` supports `after` and `limit` (`1..500`, default
`200`) and returns the structured response. `createSSEStream` performs a durable
catch-up query from the validated cursor, subscribes for live events, and drops
any live frame whose sequence is not greater than the connection high-water
mark.

Use a subscribe-before-catch-up arrangement with sequence filtering so a commit
between query and subscription cannot be lost or duplicated.

- [ ] **Step 4: Bound and release live buses**

`EventBus` constructor defaults to `{ maxEvents: 256, maxBytes: 4 * 1024 * 1024 }`.
Track serialized payload bytes per retained event. Evict oldest entries until
both limits hold. Add `removeIdleEventBus(sessionId)` and ACP equivalent; archive,
delete, and connection cleanup call it when subscriber count reaches zero.

Legacy WS reconnect reads at most 256 recent outbound durable events. It never
loads the complete persisted history.

- [ ] **Step 5: Run all transport/history tests**

Run: `bun test packages/remote-control-server/src/__tests__/event-bus.test.ts packages/remote-control-server/src/__tests__/sse-writer.test.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/ws-handler.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/remote-control-server/src/transport \
  packages/remote-control-server/src/routes/web/sessions.ts \
  packages/remote-control-server/src/types/api.ts \
  packages/remote-control-server/src/__tests__
git commit -m "feat: stream durable RCS history by cursor"
```

---

### Task 5: Pure Web event reducer

**Files:**
- Create: `packages/remote-control-server/web/src/lib/session-event-reducer.ts`
- Create: `packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts`
- Modify: `packages/remote-control-server/web/src/types/index.ts`
- Modify: `packages/remote-control-server/web/src/lib/types.ts`

**Interfaces:**
- Produces: `createSessionEventState()` and `reduceSessionEvent(state, event)`.
- Produces: `SessionEventState { entries, seenEventIds, seenMessageKeys, highWaterSeq }`.

- [ ] **Step 1: Write failing reducer tests**

```ts
test('folds outbound and inbound user echo per UUID without dropping unmatched users', () => {
  const events = [
    event(1, 'user', 'outbound', 'A', 'user-a'),
    event(2, 'user', 'inbound', 'A', 'user-a'),
    event(3, 'user', 'inbound', 'A', 'user-a'),
    event(4, 'user', 'outbound', 'B', 'user-b'),
  ]
  const state = events.reduce(reduceSessionEvent, createSessionEventState())
  expect(state.entries.filter(e => e.type === 'user_message').map(e => e.content))
    .toEqual(['A', 'B'])
})

test('keeps identical text with distinct UUIDs', () => {
  const state = [
    event(1, 'user', 'outbound', 'same', 'user-a'),
    event(2, 'user', 'outbound', 'same', 'user-b'),
  ].reduce(reduceSessionEvent, createSessionEventState())
  expect(state.entries.filter(entry => entry.type === 'user_message')).toHaveLength(2)
})

test('ignores repeated assistant UUID and sequence', () => {
  const reply = event(1, 'assistant', 'inbound', 'answer', 'assistant-a')
  const state = [reply, reply, { ...reply, id: 'retry-event', seqNum: 2 }]
    .reduce(reduceSessionEvent, createSessionEventState())
  const assistant = state.entries.filter(entry => entry.type === 'assistant_message')
  expect(assistant).toHaveLength(1)
  expect(assistant[0]?.chunks).toEqual([{ type: 'message', text: 'answer' }])
})

test('merges legitimate assistant chunks with distinct identities', () => {
  const state = [
    event(1, 'assistant', 'inbound', 'hello ', 'assistant-chunk-1'),
    event(2, 'assistant', 'inbound', 'world', 'assistant-chunk-2'),
  ].reduce(reduceSessionEvent, createSessionEventState())
  const assistant = state.entries.at(-1)
  expect(assistant?.type).toBe('assistant_message')
  expect(assistant?.type === 'assistant_message' ? assistant.chunks : [])
    .toEqual([{ type: 'message', text: 'hello world' }])
})
```

- [ ] **Step 2: Run test and verify RED**

Run: `bun test packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts`

Expected: FAIL because the reducer does not exist.

- [ ] **Step 3: Implement identity-aware immutable reducer**

Use server event ID first, then `(direction,type,payload.uuid)` as a retry key.
User outbound/inbound matching uses the bare message UUID across directions.
Assistant retry matching retains direction/type. Tool calls use tool-call ID.
Events at or below `highWaterSeq` are ignored only after their event identity has
already been incorporated; history pages may arrive in ascending order.

Do not infer identity from text. Keep all reducer logic free of React and browser globals.

- [ ] **Step 4: Run reducer tests**

Run: `bun test packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit new isolated files**

```bash
git add packages/remote-control-server/web/src/lib/session-event-reducer.ts \
  packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts \
  packages/remote-control-server/web/src/types/index.ts \
  packages/remote-control-server/web/src/lib/types.ts
git commit -m "fix: deduplicate RCS Web session events"
```

---

### Task 6: Cancellable, single-owner Web SSE adapter

**Files:**
- Modify: `packages/remote-control-server/web/src/lib/rcs-chat-adapter.ts`
- Modify: `packages/remote-control-server/web/src/pages/SessionDetail.tsx`
- Modify: `packages/remote-control-server/web/src/api/client.ts`
- Create: `packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts`

**Interfaces:**
- Consumes: reducer from Task 5 and structured history from Task 4.
- Produces: `init(signal?: AbortSignal): Promise<void>` and idempotent `disconnect()`.

- [ ] **Step 1: Write FakeEventSource lifecycle tests**

Cover these exact cases:

- calling `connectSSE` twice leaves one active source and one event produces `X`, not `XX`;
- aborting while history is delayed leaves zero active sources after the promise resolves;
- disconnect is idempotent;
- a stale adapter cleanup cannot close a newer adapter source;
- history cursor `N` is included as `from_sequence_num=N`.

- [ ] **Step 2: Run test and verify RED**

Run: `bun test packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts`

Expected: FAIL with duplicate handler invocation or a source created after abort.

- [ ] **Step 3: Give each adapter direct EventSource ownership**

Remove the module-global SSE bus from `rcs-chat-adapter.ts`. Store
`eventSource`, `generation`, `state`, and `AbortController` per adapter.
`init` checks the caller signal/generation after bind and every history page.
`disconnect` increments generation before closing the source.

Load history through the reducer, then connect with the returned cursor. SSE
events go through the same reducer. The React setter receives `state.entries`.

- [ ] **Step 4: Make SessionDetail effect cancellation authoritative**

```ts
useEffect(() => {
  const controller = new AbortController()
  void load(controller.signal)
  return () => {
    controller.abort()
    adapter.disconnect()
  }
}, [adapter, sessionId])
```

Only consume the pending first message after successful non-aborted init.

- [ ] **Step 5: Run Web focused tests and build**

Run: `bun test packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts packages/remote-control-server/web/src/__tests__/api-client.test.ts`

Expected: PASS.

Run: `bun run --cwd packages/remote-control-server build:web`

Expected: Vite build succeeds.

- [ ] **Step 6: Preserve dirty-file ownership**

Review `git diff` for the three pre-existing dirty Web files. Do not stage their
unrelated navigation/new-shell changes. Commit only newly created test files or
exactly isolatable hunks; otherwise leave this task uncommitted for final handoff.

---

### Task 7: Backend archive, restore, delete, and archived listing

**Files:**
- Modify: `packages/remote-control-server/src/routes/web/sessions.ts`
- Modify: `packages/remote-control-server/src/services/session.ts`
- Modify: `packages/remote-control-server/src/store.ts`
- Modify: `packages/remote-control-server/src/routes/web/control.ts`
- Modify: `packages/remote-control-server/src/__tests__/routes.test.ts`
- Modify: `packages/remote-control-server/src/__tests__/services.test.ts`

**Interfaces:**
- Produces owner-only `POST archive`, `POST restore`, and `DELETE` Web routes.
- Produces `include_archived=1` list behavior.

- [ ] **Step 1: Write failing lifecycle route tests**

Test that:

- the owner can archive and still GET history;
- an archived session rejects event/control mutations with 409;
- `include_archived=1` lists it while the default list omits it;
- restore changes it to `inactive` and accepts future worker reconnection;
- non-owners receive 403 for all lifecycle operations;
- permanent delete cascades events/owners/worker and later GET returns 403/404
  according to the existing ownership-hiding convention;
- archive and restore are idempotent.

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test packages/remote-control-server/src/__tests__/routes.test.ts --test-name-pattern "archive|restore|permanent delete|include_archived"`

Expected: new Web endpoints return 404 and archived list behavior is absent.

- [ ] **Step 3: Implement lifecycle service and routes**

Separate ownership resolution from the current closed-session mutation check so
archived owners can restore/delete/read. Archive removes idle live buses but not
durable rows. Restore sets `status='inactive'`. Delete removes transient work
items, durable session cascade, cache entries, and EventBus.

Parse `include_archived` strictly as `'1'`; preserve active-only defaults.

- [ ] **Step 4: Run focused tests**

Run: `bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/remote-control-server/src/routes/web/sessions.ts \
  packages/remote-control-server/src/routes/web/control.ts \
  packages/remote-control-server/src/services/session.ts \
  packages/remote-control-server/src/store.ts \
  packages/remote-control-server/src/__tests__/routes.test.ts \
  packages/remote-control-server/src/__tests__/services.test.ts
git commit -m "feat: manage persisted RCS conversations"
```

---

### Task 8: Web archive/restore/delete controls

**Files:**
- Modify: `packages/remote-control-server/web/src/api/client.ts`
- Create: `packages/remote-control-server/web/src/components/SessionActions.tsx`
- Modify: `packages/remote-control-server/web/src/pages/ChatsPage.tsx`
- Modify: `packages/remote-control-server/web/src/pages/SessionDetail.tsx`
- Modify: `packages/remote-control-server/web/src/hooks/useWorkspaceData.ts`
- Modify: `packages/remote-control-server/web/src/App.tsx`
- Modify: `packages/remote-control-server/web/src/__tests__/api-client.test.ts`

**Interfaces:**
- Consumes: lifecycle routes from Task 7.
- Produces: `apiArchiveSession`, `apiRestoreSession`, `apiDeleteSession`.
- Produces: `SessionActions` with `session`, `onChanged`, and `onDeleted` props.

- [ ] **Step 1: Write failing API-client tests**

```ts
await client.apiArchiveSession('session-1')
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining('/web/sessions/session-1/archive'),
  expect.objectContaining({ method: 'POST' }),
)
await client.apiRestoreSession('session-1')
await client.apiDeleteSession('session-1')
expect(lastRequest.method).toBe('DELETE')
```

Also assert workspace fetch uses `include_archived=1`.

- [ ] **Step 2: Run API tests and verify RED**

Run: `bun test packages/remote-control-server/web/src/__tests__/api-client.test.ts`

Expected: FAIL because lifecycle methods do not exist.

- [ ] **Step 3: Implement API methods and reusable actions UI**

`SessionActions` renders an overflow trigger. Active sessions offer Archive and
Delete permanently; archived sessions offer Restore and Delete permanently.
Use the existing Radix dialog/dropdown components. Stop click propagation so a
row action does not open the session.

Archive/restore confirmation copy states that history is retained. Delete copy
includes the conversation title and explicitly says recovery is impossible.
Disable actions while pending and render a local error message on failure.

- [ ] **Step 4: Integrate list filters and detail navigation**

Chats page adds Active/Archived tabs and places `SessionActions` on each row.
Session detail header renders the same component. Successful mutation refreshes
workspace state; deleting the open session navigates to Chat home. Archived
sessions render history read-only with the input disabled and restore available.

- [ ] **Step 5: Run Web tests, typecheck, and build**

Run: `bun test packages/remote-control-server/web/src/__tests__/api-client.test.ts packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts`

Expected: PASS.

Run: `bunx tsc -p packages/remote-control-server/web/tsconfig.json --noEmit`

Expected: zero errors.

Run: `bun run --cwd packages/remote-control-server build:web`

Expected: Vite build succeeds.

- [ ] **Step 6: Preserve dirty-file ownership**

Inspect every overlapping Web diff and stage only new files or exact hunks. Do
not commit the user's pre-existing shell redesign as part of this task.

---

### Task 9: Documentation and production memory verification

**Files:**
- Modify: `packages/remote-control-server/README.md`
- Modify: `packages/remote-control-server/Dockerfile` only if the runtime user/path needs correction discovered by the startup test.
- Create: `packages/remote-control-server/scripts/memory-smoke.ts`
- Create: `packages/remote-control-server/src/__tests__/memory-bounds.test.ts`

**Interfaces:**
- Consumes all preceding production behavior.
- Produces a bounded repeatable memory workload and final measured report in the task handoff.

- [ ] **Step 1: Write failing structural memory tests**

Assert 10,000 small committed events do not leave 10,000 EventBus entries, large
payloads remain below the 4 MiB ring cap, and 1,000 subscribe/unsubscribe cycles
return subscriber count to zero.

- [ ] **Step 2: Run and verify RED before final memory implementation**

Run: `bun test packages/remote-control-server/src/__tests__/memory-bounds.test.ts`

Expected: FAIL against unbounded/incorrect cleanup behavior, or PASS only if the
Task 4 implementation already provides the exact contract; record which case occurred.

- [ ] **Step 3: Add a bounded production memory smoke runner**

The script starts the built server against a temporary `RCS_DB_PATH`, waits for
`/health`, samples child RSS using `ps -o rss= -p <pid>` on macOS/Linux, performs:

- 2 minutes warm idle;
- 10,000 mixed durable events;
- 500 SSE connect/disconnect cycles;
- archive/idle cooldown;

It prints CSV samples with phase, elapsed seconds, RSS KiB, durable event count,
and live-bus retained count. It always terminates the child and removes the
temporary database in `finally`.

- [ ] **Step 4: Update README**

Document `RCS_DB_PATH`, the default `./data/rcs.sqlite`, Docker volume behavior,
archive/restore/delete semantics, single-process SQLite constraint, durable
history, and how to run the memory smoke test. Replace statements that RCS is
purely in-memory.

- [ ] **Step 5: Run complete verification**

Run: `bun test packages/remote-control-server/src/__tests__ packages/remote-control-server/web/src/__tests__`

Expected: all RCS backend and Web tests pass.

Run: `bun run --cwd packages/remote-control-server typecheck`

Expected: zero errors.

Run: `bunx tsc -p packages/remote-control-server/web/tsconfig.json --noEmit`

Expected: zero errors.

Run: `bun run --cwd packages/remote-control-server build:web`

Expected: Vite build succeeds.

Run: `bun run typecheck`

Expected: repository typecheck succeeds with zero errors.

- [ ] **Step 6: Run memory study and interpret RSS correctly**

Run the new memory smoke command against the production build. Separately sample
the existing Vite dev process and browser renderer if available. Report RSS,
not VSZ. Treat a monotonic per-cycle RSS slope after cooldown as a leak even if
the absolute number is below a fixed threshold.

- [ ] **Step 7: Review final diff and commit only safe isolated files**

```bash
git diff --check
git status --short
```

Commit documentation, memory script, tests, and clean backend files if they are
not entangled with user changes. Leave overlapping Web files unstaged and list
them explicitly in the final handoff.
