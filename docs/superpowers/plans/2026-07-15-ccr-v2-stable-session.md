# CCR v2 Stable Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Code-only CCR v2 path support durable internal events, correct delivery acknowledgements, and non-blocking multi-turn sessions.

**Architecture:** Add a versioned SQLite internal-event store and authenticated worker routes in RCS. Keep the existing CCR client protocol, but add bounded turn-boundary waiting and translate payload UUIDs to server event IDs for delivery tracking.

**Tech Stack:** Bun, TypeScript strict mode, Hono, bun:sqlite, bun:test, Axios, SSE/HTTP.

## Global Constraints

- Preserve unrelated user changes already present in the working tree.
- Production code must not use `as any`.
- `bun run typecheck` must pass with zero errors.
- Use Conventional Commits if commits are requested; do not stage unrelated files.

---

### Task 1: Add the internal-event persistence contract

**Files:**
- Modify: `packages/remote-control-server/src/persistence/schema.ts`
- Modify: `packages/remote-control-server/src/persistence/types.ts`
- Modify: `packages/remote-control-server/src/persistence/database.ts`
- Test: `packages/remote-control-server/src/__tests__/persistence.test.ts`

**Interfaces:**
- Produce `PersistedInternalEvent`, `PersistedInternalEventInput`, and page/list methods on `RcsDatabase`.
- Preserve payload JSON as structured objects and expose `event_id`, `event_type`, `event_metadata`, `is_compaction`, `created_at`, and optional `agent_id` to the route layer.

- [ ] Write a failing persistence test for batch insert, duplicate event IDs, foreground listing, and `agentId` filtering.
- [ ] Run `bun test packages/remote-control-server/src/__tests__/persistence.test.ts` and confirm the new test fails because the table/methods do not exist.
- [ ] Add the next schema migration with `session_internal_events`, a `(session_id, created_at_ms, event_id)` index, and an agent filtering index.
- [ ] Implement transactional insert-or-ignore semantics and cursor-based listing with deterministic `(created_at_ms, event_id)` ordering.
- [ ] Run the persistence test and confirm it passes.

### Task 2: Add authenticated RCS internal-event routes

**Files:**
- Modify: `packages/remote-control-server/src/routes/v2/worker-events.ts`
- Modify: `packages/remote-control-server/src/index.ts` only if route extraction is required by existing structure
- Test: `packages/remote-control-server/src/__tests__/routes.test.ts`

**Interfaces:**
- Add `POST /v1/code/sessions/:id/worker/internal-events` with `{ worker_epoch, events }`.
- Add `GET /v1/code/sessions/:id/worker/internal-events?cursor=&subagents=` returning `{ data, next_cursor? }`.

- [ ] Add failing route tests for successful batch write, idempotent retry, wrong epoch rejection, foreground listing, and `subagents=true` listing.
- [ ] Run the focused route tests and confirm the new cases fail with 404 or missing persistence behavior.
- [ ] Implement request validation, session lookup, `isCurrentWorkerEpoch`, `sessionIngressAuth`, and persistence delegation.
- [ ] Implement opaque cursor encoding/decoding using the persisted ordering key; reject malformed cursors with 400.
- [ ] Run the focused route tests and confirm all new cases pass.

### Task 3: Fix CCR delivery identity and bounded internal flush

**Files:**
- Modify: `src/cli/transports/SSETransport.ts`
- Modify: `src/cli/transports/ccrClient.ts`
- Modify: `src/cli/remoteIO.ts` or `src/cli/print.ts` only where the existing lifecycle hook requires it
- Test: `src/cli/transports/__tests__/SSETransport.test.ts` or the repository’s existing transport test location
- Test: `src/cli/transports/__tests__/ccrClient.test.ts` or the repository’s existing CCR test location

**Interfaces:**
- Map `payload.uuid` to the server `event_id` for durable worker commands.
- Preserve `CCRClient.reportDelivery(payloadUuid, status)` as the lifecycle-facing API.
- Add a finite flush wait used by `RemoteIO.flushInternalEvents()`; a timeout must resolve the turn-boundary wait and emit a diagnostic without closing the worker.

- [ ] Add failing tests proving lifecycle ACK posts the server event ID rather than payload UUID.
- [ ] Add a failing test proving a never-resolving internal uploader cannot keep `flushInternalEvents()` pending forever.
- [ ] Run the focused client tests and confirm both cases fail before implementation.
- [ ] Register the server-ID mapping before forwarding SSE payload data to `StructuredIO`, with a bounded map eviction policy.
- [ ] Implement the timeout path with a named constant and diagnostic event; successful flush remains fully awaited.
- [ ] Run the focused client tests and confirm both cases pass.

### Task 4: Add the two-turn Code regression test

**Files:**
- Modify: `packages/remote-control-server/src/__tests__/routes.test.ts` or the existing integration test fixture that can exercise worker events
- Modify: `src/cli/transports/__tests__/ccrClient.test.ts` if an end-to-end worker stub is needed

**Interfaces:**
- Exercise: outbound user event → worker SSE delivery → assistant/result upload → internal-event flush → idle state → second outbound user event.

- [ ] Write the failing regression test that reproduces the first-turn `result` followed by a second user event while status remains `running`.
- [ ] Run only the regression test and confirm it fails against the pre-fix behavior.
- [ ] Connect the already-tested persistence, route, flush, and ACK behavior without adding a second protocol.
- [ ] Run the regression test and confirm the second turn produces assistant/result and idle.

### Task 5: Verify the complete change

**Files:**
- No production files unless verification reveals a defect.

- [ ] Run all focused persistence, route, SSE, CCR, and existing bridge tests together.
- [ ] Run `bun run typecheck`.
- [ ] Run `git diff --check`.
- [ ] Review `git diff` and `git status --short` to confirm only CCR/RCS files and the new design/plan docs are included.
