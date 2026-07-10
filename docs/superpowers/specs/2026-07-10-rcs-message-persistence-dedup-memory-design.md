# RCS Message Reliability, Persistence, and Memory Design

## Context

The Remote Control Server (RCS) currently keeps sessions, ownership, and the
entire event history in process-local maps. Restarting RCS removes every
conversation. The Web UI also has two independent duplicate-message paths:

1. `RCSChatAdapter` can retain more than one SSE listener across reconnects or
   asynchronous React effect cleanup, so one event is consumed multiple times.
2. Worker and legacy ingress clients retry HTTP batches, but RCS does not use
   the stable upstream message UUID as an idempotency key. A request whose
   response is lost can therefore be committed and broadcast again.

The current event bus retains up to 5,000 full normalized events per session,
including duplicated `raw` payloads, and bus registries remain resident for
inactive sessions. This can make memory scale with lifetime message volume.

## Goals

- Display each logical user or assistant message exactly once while preserving
  legitimate repeated text and streaming updates.
- Persist conversations across RCS restarts without loading full histories into
  memory.
- Preserve session ownership across restarts.
- Keep archived conversations readable until the user explicitly deletes them.
- Add Web UI controls for archive, restore, and permanent deletion.
- Bound live-event memory and measure RCS, Vite, and browser memory separately.
- Preserve the existing V1/V2 worker, ACP, compatibility-ID, and Web API flows.

## Non-goals

- Running multiple RCS replicas against one database. Live fan-out remains
  process-local, so the supported deployment is one RCS process per database.
- Exactly-once execution of outbound worker commands. This change provides
  idempotent event ingestion and display, not a durable distributed command
  queue.
- Persisting live sockets, timers, or subscribers.
- Persisting transient environment/work-item state unless it is required to
  read an existing conversation. Reconnecting workers re-register normally.
- Content-hash deduplication. Identical text with different UUIDs remains two
  legitimate messages.

## Architecture

SQLite becomes the source of truth for sessions, owners, worker snapshots, and
session events. RCS uses Bun's built-in `bun:sqlite`; no external database
package or service is added.

The in-process EventBus becomes a fan-out layer for committed live events. It
does not own durable history. An event is first committed transactionally and
is only then published to subscribers. History and reconnect catch-up query the
database by per-session sequence number.

The storage boundary exposes synchronous repository methods so existing RCS
service APIs do not require a broad asynchronous rewrite. Production uses the
SQLite repository. Tests can create isolated temporary or in-memory databases.

The database path is configurable with `RCS_DB_PATH`. The default is
`./data/rcs.sqlite`, resolved from the RCS process working directory. This maps
to the existing `/app/data` Docker volume in production and to a repository
`data/` directory under the documented local start command. Parent directories
are created before opening the database. A corrupt or unwritable configured
database fails startup visibly rather than silently falling back to empty
memory.

## Database schema

### `sessions`

- `id TEXT PRIMARY KEY`
- `environment_id TEXT NULL`
- `title TEXT NULL`
- `status TEXT NOT NULL`
- `source TEXT NOT NULL`
- `permission_mode TEXT NULL`
- `worker_epoch INTEGER NOT NULL DEFAULT 0`
- `username TEXT NULL`
- `last_seq INTEGER NOT NULL DEFAULT 0`
- `archived_at_ms INTEGER NULL`
- `created_at_ms INTEGER NOT NULL`
- `updated_at_ms INTEGER NOT NULL`

`last_seq` never decreases, including after retention or deletion of old event
rows.

### `session_owners`

- `session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE`
- `owner_uuid TEXT NOT NULL`
- `created_at_ms INTEGER NOT NULL`
- primary key: `(session_id, owner_uuid)`

Persisting ownership is mandatory. Otherwise a restored conversation would look
orphaned and could be claimed by a different browser UUID.

### `session_events`

- `session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE`
- `seq_num INTEGER NOT NULL`
- `id TEXT NOT NULL UNIQUE`
- `type TEXT NOT NULL`
- `direction TEXT NOT NULL`
- `payload_json TEXT NOT NULL`
- `source_event_id TEXT NULL`
- `dedupe_scope TEXT NULL`
- `created_at_ms INTEGER NOT NULL`
- primary key: `(session_id, seq_num)`
- partial unique key: `(session_id, dedupe_scope, source_event_id)` when both
  dedupe fields are non-null

`dedupe_scope` includes producer, direction, and event type. Inbound user echo
and outbound user input therefore remain distinct protocol events even when
they share a UUID; the presentation reducer folds them into one visible user
message.

No key is synthesized when the producer supplies no stable identity. Streaming
events use their stable upstream event UUID when present; different streaming
events are never deduplicated by content.

### `session_workers`

- `session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE`
- `worker_status TEXT NULL`
- `external_metadata_json TEXT NULL`
- `requires_action_details_json TEXT NULL`
- `last_heartbeat_at_ms INTEGER NULL`
- `created_at_ms INTEGER NOT NULL`
- `updated_at_ms INTEGER NOT NULL`

This preserves the last known worker and automation snapshot without treating
the worker as connected after restart.

## Migrations and startup recovery

The database opens with foreign keys enabled, WAL journaling, and a bounded busy
timeout. Schema changes run in a transaction and record a schema version.
Migrations are idempotent.

Startup does not hydrate event history into EventBus. It validates that each
session's `last_seq` is at least the maximum stored sequence. It then runs one
disconnect reconciliation immediately: stale `running`/`idle` sessions become
inactive and stale environments become disconnected. Archived sessions remain
archived.

Existing installations have no durable data to migrate. The first upgraded
start creates a new database. Current in-memory state cannot survive the
upgrade process and is not presented as migrated data.

## Event commit and idempotency

All Web, V1 ingress, V2 worker, and system event paths use one commit service.
Within a SQLite transaction it:

1. Derives `source_event_id` from the upstream event envelope, message UUID, or
   explicit idempotency key.
2. Looks up an existing row with the same session and dedupe scope.
3. If found with the same normalized payload, returns the canonical event as a
   duplicate without allocating a sequence or notifying subscribers.
4. If found with a different payload, returns an idempotency conflict and logs
   the mismatch without exposing message content.
5. Otherwise increments `sessions.last_seq`, inserts the event, and commits.
6. After commit, publishes the canonical event to the live EventBus.

V1 and V2 batch routes preserve envelope identities instead of discarding them.
A retry of a committed batch therefore succeeds idempotently.

## History and SSE handoff

The history response is extended compatibly:

```json
{
  "events": [],
  "next_cursor": 123,
  "has_more": false,
  "oldest_available_seq": 1,
  "truncated": false
}
```

The initial implementation returns a bounded page in ascending sequence order
and supports a cursor/limit query. The adapter continues fetching until it has
the requested visible history, then connects SSE with
`from_sequence_num=next_cursor`.

The Web SSE route accepts both `Last-Event-ID` and `from_sequence_num`, validates
non-negative integer cursors, and uses the greater valid cursor. Every SSE data
frame includes stable event ID, session ID, sequence, creation time, type,
direction, and payload.

This closes the history-fetch/subscribe race: events committed after the
history snapshot are replayed from `next_cursor`. Both the server and client use
strictly greater sequence semantics. A repeated frame at or below the client's
high-water mark is ignored.

This change performs no automatic durable-history retention: events remain on
disk until their session is permanently deleted. The response includes
`truncated` and `oldest_available_seq` for forward compatibility, with
`truncated=false` for existing sessions in this release.

## Web message reducer and SSE lifecycle

`RCSChatAdapter` owns its EventSource instance; a module-global mutable bus no
longer owns the active connection. Each initialization has a generation or
AbortSignal checked after every asynchronous boundary. Disconnect invalidates
the generation before closing the source, so a late history request cannot
reconnect after component cleanup.

Reconnect is idempotent: the adapter closes its previous EventSource and removes
its previous handler before opening another. Cleanup from an old adapter cannot
close a newer adapter's connection.

History and live events pass through the same identity-aware reducer:

- server event IDs and sequence numbers prevent exact replay;
- assistant retries are folded by upstream UUID;
- outbound and inbound user events are paired per UUID, not by a global
  "any inbound user exists" flag;
- optimistic user entries use the same UUID sent to the backend and reconcile
  with the committed event;
- identical text with distinct UUIDs remains distinct;
- tool calls retain their tool-call identity;
- streaming events are merged according to their protocol identity and
  snapshot/delta semantics, never according to text equality.

Already duplicated historical rows are hidden by the compatibility reducer when
they share an upstream UUID. New writes are prevented at the server boundary.

## Archive, restore, and permanent deletion

Archive is a soft state transition. It sets `status=archived` and
`archived_at_ms`, rejects new messages/control requests, closes live session
transport, and retains owners and events. Archive is idempotent.

Restore clears `archived_at_ms` and changes the session to `inactive`. It makes
the conversation visible in active/recent lists but does not pretend a worker
is connected. A new worker connection can subsequently resume normal state.

Permanent deletion is explicit and irreversible. A transaction deletes the
session and cascades events, owners, and worker snapshot; related transient work
items and the live EventBus are also removed. Late writes return not found.

The Web API gains authenticated owner-only endpoints:

- `POST /web/sessions/:id/archive`
- `POST /web/sessions/:id/restore`
- `DELETE /web/sessions/:id`

`GET /web/sessions` and `GET /web/sessions/all` keep their active-only default
for compatibility and accept `include_archived=1`. The new workspace/history
UI requests archived records and provides an Active/Archived filter. Archived
records remain searchable and open read-only.

Frontend controls appear in both the session row overflow menu and the session
detail header:

- Active session: **Archive** and **Delete permanently**.
- Archived session: **Restore** and **Delete permanently**.
- Archive/restore use a lightweight confirmation dialog that explains the
  resulting state.
- Permanent deletion uses a destructive confirmation dialog naming the
  conversation and stating that messages cannot be recovered. The confirm
  button is disabled while the request is running.
- Success removes or updates the item immediately, refreshes workspace data,
  and navigates away when the currently open session is deleted.
- Failure leaves the item visible and presents an actionable inline/toast error.
- Controls are keyboard accessible and do not trigger the row's open action.

## Memory model

SQLite retains durable history on disk. Each live EventBus keeps subscribers,
the next sequence metadata, and only a small catch-up ring. By default the ring
holds at most 256 events and at most 4 MiB of serialized payloads, evicting the
oldest event until both limits are satisfied. Database queries provide older
history.

The legacy WebSocket ingress path has no durable consumer cursor. On connect it
replays at most the same bounded window of recent outbound events rather than
the entire persisted conversation. Stable UUIDs make that replay idempotent for
the bridge. Durable exactly-once outbound command delivery remains outside this
change's scope.

Buses with no subscribers are released for inactive or archived sessions.
Session deletion always removes the bus. ACP channel-group buses receive the
same bounded buffering and lifecycle cleanup. SSE and WebSocket abort/close
paths unsubscribe handlers and clear keepalive intervals exactly once.

The normalized payload is stored once. Code avoids retaining duplicate parsed
and serialized copies outside the commit/query lifetime.

## Memory verification

Memory is measured per process, using RSS rather than macOS virtual address
space:

1. Build and start the production RCS server with an isolated temporary DB.
2. Record warm idle RSS for several minutes.
3. Publish a bounded workload containing user/assistant/tool events and several
   large payloads; sample RSS and event/database counts.
4. Repeatedly open and close SSE clients to expose listener/timer leaks.
5. Archive sessions, close clients, allow GC/idle time, and verify RSS reaches a
   plateau rather than growing linearly with every cycle.
6. Measure Vite separately in development and report browser renderer memory
   separately when browser tooling is available.

The current observed Vite process is approximately 65 MB RSS; its hundreds of
gigabytes of VSZ on macOS are reserved virtual address space, not resident
physical memory. Final results report command, Bun version, duration, workload,
RSS samples, and any remaining uncertainty.

## Error handling and observability

- Database open or migration failure aborts startup with the configured path and
  a non-sensitive error.
- Event serialization or transaction failure returns a non-success response and
  does not fan out the event.
- Idempotency conflicts return HTTP 409 and log IDs/scopes without message text.
- Invalid history/SSE cursors return HTTP 400.
- A closed/archived session returns HTTP 409 for mutation attempts.
- Database and API logs never print owner UUIDs, tokens, or full event payloads.
- Health output can indicate storage readiness without exposing filesystem paths.

## Testing strategy

Implementation follows red-green-refactor. Required tests include:

- migration on a fresh DB and repeated migration;
- close/reopen recovery of session, owner, worker snapshot, event history, and
  monotonic next sequence;
- owner isolation after restart;
- duplicate V1/V2/Web ingress requests producing one row and one notification;
- same idempotency key with different payload producing a conflict;
- history pagination and history-to-SSE handoff with an event committed in the
  boundary window;
- adapter double-connect, delayed-init cleanup, StrictMode lifecycle, repeated
  sequence, and history/live overlap;
- per-UUID user echo folding, including an outbound message with no inbound echo;
- identical content with different UUIDs remaining distinct;
- archive retains readable history, restore updates state, and hard delete
  cascades all durable data;
- owner-only lifecycle routes and frontend success/failure/confirmation states;
- bounded EventBus count/byte eviction and subscriber/interval cleanup;
- existing RCS route, transport, ACP, typecheck, build, and Web tests.

## Delivery sequence

1. Add SQLite repository, migrations, and isolated storage tests.
2. Persist sessions, owners, workers, and events; add idempotent commit service.
3. Move history/replay to cursor-based durable reads and bound EventBus memory.
4. Repair adapter lifecycle and introduce the shared history/live reducer.
5. Add archive/restore/delete APIs and frontend controls.
6. Run focused and full verification.
7. Run the bounded production memory study and report measured results.
