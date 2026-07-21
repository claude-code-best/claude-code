# RCS Streaming Messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show model text incrementally in RCS Web while keeping partial snapshots transient and the final assistant event authoritative and durable.

**Architecture:** Enable SDK partial output in Bridge children, share the existing 100ms full-so-far accumulator across CCR v2 and legacy writers, and route snapshots through the RCS live channel. Normalize live stream events to `partial_assistant`; Web reducers replace provisional text by API message ID and reconcile it with the final durable assistant.

**Tech Stack:** Bun/TypeScript, CCR HTTP+SSE transport, Hono RCS routes, React Web adapters, `bun:test`.

## Global Constraints

- Model API streaming remains always on and is not gated by a new feature.
- Only `text_delta` is rendered live in the first version.
- Partial snapshots are at-most-once live events and never written to SQLite.
- Final `assistant` remains durable, authoritative for content/usage/tools, and repairs disconnects.
- Snapshot replacement must never duplicate or regress displayed text.
- Preserve current dirty changes in `src/bridge/bridgeMain.ts`, `src/cli/print.ts`, RCS persistence, `event-delivery-policy.ts`, `ws-handler.ts`, and Web pages; edit overlapping files surgically.
- Files already dirty at task start are never whole-file staged by this plan; clean task-owned files may be committed separately.
- Production code must not use `as any`; strict typecheck remains zero-error.

---

## File Map

- `src/bridge/sessionRunner.ts`, `src/bridge/__tests__/sessionRunnerModel.test.ts`: request SDK partial messages.
- `src/cli/transports/streamEventAccumulator.ts`: shared full-so-far snapshot state.
- `src/cli/transports/__tests__/streamEventAccumulator.test.ts`: message/scope/block snapshot tests.
- `src/cli/transports/ccrClient.ts`, `HybridTransport.ts`, `SSETransport.ts`: live routing.
- `src/cli/transports/__tests__/ccrClient.test.ts`, `SSETransport.test.ts`: delivery policy regressions.
- `packages/remote-control-server/src/transport/partial-assistant.ts`: normalize supported stream snapshots.
- `packages/remote-control-server/src/routes/v2/worker-events.ts`: accept/publish transient stream events.
- `packages/remote-control-server/src/transport/ws-handler.ts`: legacy live normalization without reverting existing edits.
- `packages/remote-control-server/src/__tests__/routes.test.ts`, `ws-handler.test.ts`: route/legacy coverage and no-persistence assertion.
- `packages/remote-control-server/web/src/lib/types.ts`, `session-event-reducer.ts`: provisional assistant state and reconciliation.
- `packages/remote-control-server/web/src/lib/rcs-chat-adapter.ts`, `rcs-transport.ts`: consume `live_event` SSE frames.
- `packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts`, `rcs-chat-adapter.test.ts`: replacement and adapter tests.

### Task 1: Enable partial SDK output for RCS sessions

**Files:**
- Modify: `src/bridge/sessionRunner.ts`
- Modify: `src/bridge/__tests__/sessionRunnerModel.test.ts`

- [ ] **Step 1: Write a failing child-argument test**

Capture the CLI launch arguments from `createSessionSpawner` and assert:

```ts
expect(launch.args).toContain('--include-partial-messages')
expect(launch.args).toContain('--output-format')
expect(launch.args).toContain('stream-json')
```

- [ ] **Step 2: Verify RED**

Run: `bun test src/bridge/__tests__/sessionRunnerModel.test.ts`

Expected: FAIL because partial messages are not requested.

- [ ] **Step 3: Add the single launch flag**

Place `--include-partial-messages` next to the existing verbose stream-json output arguments; do not alter provider selection or print logic.

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test src/bridge/__tests__/sessionRunnerModel.test.ts`

Expected: PASS.

```bash
git add src/bridge/sessionRunner.ts src/bridge/__tests__/sessionRunnerModel.test.ts
git commit -m "feat: 启用 RCS 部分消息输出"
```

### Task 2: Share full-so-far stream snapshots

**Files:**
- Create: `src/cli/transports/streamEventAccumulator.ts`
- Create: `src/cli/transports/__tests__/streamEventAccumulator.test.ts`
- Modify: `src/cli/transports/ccrClient.ts`
- Modify: `src/cli/transports/HybridTransport.ts`

**Interfaces:**
- Produces `createStreamAccumulator(): StreamAccumulatorState`.
- Produces `accumulateStreamEvents(buffer: SDKPartialAssistantMessage[], state: StreamAccumulatorState): EventPayload[]`.
- Each coalesced text snapshot includes `message_id`, `snapshot: true`, `event.index`, and full accumulated `event.delta.text`.
- Produces `clearStreamAccumulatorForMessage(state, assistant): void`.

- [ ] **Step 1: Move and extend accumulator tests first**

Test message-start scope mapping, two deltas becoming one full `hello` snapshot, accumulation across flushes becoming `hello world`, independent block indexes, non-text passthrough, and final assistant cleanup. Assert:

```ts
expect(snapshot).toMatchObject({
  type: 'stream_event',
  message_id: 'msg-1',
  snapshot: true,
  event: {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'hello world' },
  },
})
```

- [ ] **Step 2: Verify RED**

Run: `bun test src/cli/transports/__tests__/streamEventAccumulator.test.ts`

Expected: FAIL because shared module and metadata do not exist.

- [ ] **Step 3: Extract implementation and adopt it in both writers**

Remove accumulator definitions from `ccrClient.ts`, import the shared module, and add equivalent state/buffer cleanup to `HybridTransport`. A complete assistant flushes buffered snapshots in order and clears its message scope. Preserve existing bounded queues and close semantics.

- [ ] **Step 4: Verify GREEN**

Run: `bun test src/cli/transports/__tests__/streamEventAccumulator.test.ts src/cli/transports/__tests__/ccrClient.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/transports/streamEventAccumulator.ts src/cli/transports/__tests__/streamEventAccumulator.test.ts src/cli/transports/ccrClient.ts src/cli/transports/HybridTransport.ts
git commit -m "refactor: 共享流式文本快照累加器"
```

### Task 3: Route stream snapshots through the live channel

**Files:**
- Modify: `src/cli/transports/ccrClient.ts`
- Modify: `src/cli/transports/SSETransport.ts`
- Modify: `src/cli/transports/__tests__/ccrClient.test.ts`
- Modify: `src/cli/transports/__tests__/SSETransport.test.ts`

- [ ] **Step 1: Write failing delivery-policy tests**

```ts
expect(buildCCRWorkerEventRequest({ type: 'stream_event', uuid: 'partial-1' })).toMatchObject({
  delivery: 'live',
  path: '/worker/live-events',
})
expect(getSSEPostMaxAttempts({ type: 'stream_event' })).toBe(1)
expect(getSSEPostMaxAttempts({ type: 'assistant' })).toBeGreaterThan(1)
```

Add a CCR flush test proving buffered stream snapshots POST to `/worker/live-events` and never enter the durable batch uploader.

- [ ] **Step 2: Verify RED**

Run: `bun test src/cli/transports/__tests__/ccrClient.test.ts src/cli/transports/__tests__/SSETransport.test.ts`

Expected: stream events still report durable/retrying behavior.

- [ ] **Step 3: Implement one-shot batched live delivery**

Add `stream_event` to the shared live type policy in both transports. When the CCR 100ms buffer flushes, POST `{ worker_epoch, events: [{ event_id, type, payload }] }` once to `/worker/live-events`; log/drop failures and retain final assistant durable delivery. Terminal behavior remains unchanged.

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test src/cli/transports/__tests__/ccrClient.test.ts src/cli/transports/__tests__/SSETransport.test.ts`

Expected: PASS.

```bash
git add src/cli/transports/ccrClient.ts src/cli/transports/SSETransport.ts src/cli/transports/__tests__/ccrClient.test.ts src/cli/transports/__tests__/SSETransport.test.ts
git commit -m "feat: 通过 live 通道投递流式快照"
```

### Task 4: Normalize transient partial assistants in RCS

**Files:**
- Create: `packages/remote-control-server/src/transport/partial-assistant.ts`
- Modify: `packages/remote-control-server/src/routes/v2/worker-events.ts`
- Modify: `packages/remote-control-server/src/transport/ws-handler.ts`
- Modify: `packages/remote-control-server/src/__tests__/routes.test.ts`
- Modify: `packages/remote-control-server/src/__tests__/ws-handler.test.ts`

**Interfaces:**
- Produces `toPartialAssistant(payload: Record<string, unknown>): Record<string, unknown> | null`.
- Output is `{ message_id, block_index, content, parent_tool_use_id, snapshot: true }` only for a valid text-delta snapshot.

- [ ] **Step 1: Write failing normalization and route tests**

Assert valid conversion, rejection of thinking/tool deltas, `/worker/live-events` acceptance of `stream_event`, published Web type `partial_assistant`, and unchanged persistence row count before/after the live POST. Add the same normalized event assertion for legacy `ingestBridgeMessage`.

- [ ] **Step 2: Verify RED**

Run: `bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/ws-handler.test.ts`

Expected: stream_event live request is rejected or not normalized.

- [ ] **Step 3: Implement canonical normalization**

Validate `snapshot === true`, non-empty `message_id`, integer non-negative index, `content_block_delta`, `text_delta`, and string text. Add `stream_event` to the Worker live allowlist, publish only normalized `partial_assistant`, and silently skip unsupported delta kinds. In dirty `ws-handler.ts`, change only stream-event handling around `ingestBridgeMessage`; preserve all pre-existing edits.

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/ws-handler.test.ts`

Expected: PASS and live partial row count stays unchanged.

```bash
git add packages/remote-control-server/src/transport/partial-assistant.ts packages/remote-control-server/src/routes/v2/worker-events.ts packages/remote-control-server/src/__tests__/routes.test.ts
git commit -m "feat: 规范化 RCS 实时部分消息"
```

`ws-handler.ts` and `ws-handler.test.ts` were dirty at baseline. Leave them unstaged unless task-only hunks can be staged without including pre-existing edits; correctness does not depend on forcing an intermediate commit.

### Task 5: Reconcile provisional assistants in the Web reducer

**Files:**
- Modify: `packages/remote-control-server/web/src/lib/types.ts`
- Modify: `packages/remote-control-server/web/src/lib/session-event-reducer.ts`
- Modify: `packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts`

**Interfaces:**
- Adds `streamingAssistantBlocks: Record<string, Record<number, string>>` to `SessionEventState`.
- Partial event identity is `message_id`; final assistant prefers `payload.message.id` and falls back to existing UUID/event identity.

- [ ] **Step 1: Replace the old ignore test with failing reconciliation tests**

Cover first snapshot, same-block replacement, shorter snapshot ignored, two blocks in order, final authoritative replacement, usage accumulation once, and a final assistant without prior partial. Assert live events use `seqNum: -1` without changing `highWaterSeq` or durable seen sets.

- [ ] **Step 2: Verify RED**

Run: `bun test packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts`

Expected: current reducer ignores partial events.

- [ ] **Step 3: Implement immutable provisional state**

Handle `partial_assistant` before durable identity bookkeeping. Replace only when the incoming snapshot starts with the previous text and is at least as long. Rebuild one assistant entry per message ID from sorted block indexes. On final assistant, remove provisional block state and replace that entry's chunks with authoritative structured content before applying tools and usage.

- [ ] **Step 4: Verify GREEN and commit**

Run: `bun test packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts`

Expected: PASS.

```bash
git add packages/remote-control-server/web/src/lib/types.ts packages/remote-control-server/web/src/lib/session-event-reducer.ts packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts
git commit -m "feat: 在 Web 归并流式助手消息"
```

### Task 6: Consume live SSE frames in both Web adapters

**Files:**
- Modify: `packages/remote-control-server/web/src/lib/rcs-chat-adapter.ts`
- Modify: `packages/remote-control-server/web/src/lib/rcs-transport.ts`
- Modify: `packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts`

**Interfaces:**
- Produces a shared client conversion from `{ event_id, type, payload, created_at }` live frame to a transient `SessionEvent` with `direction: 'inbound'` and `seqNum: -1`.

- [ ] **Step 1: Extend FakeEventSource and write failing live-frame tests**

Store listeners by event name, emit `live_event` with a partial snapshot, assert text appears, then emit the final durable `message` frame and assert text appears exactly once. Assert reconnect starts from the last durable sequence, not the live frame.

- [ ] **Step 2: Verify RED**

Run: `bun test packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts`

Expected: live_event has no registered listener.

- [ ] **Step 3: Implement shared live conversion and subscriptions**

Add a small exported parser in `rcs-chat-adapter.ts` or a focused `live-session-event.ts` module, register both `message` and `live_event`, and use the same conversion in legacy `SSEEventBus`. Do not update `_lastSeqNum` for transient events.

- [ ] **Step 4: Verify GREEN, typecheck, and commit**

Run: `bun test packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts && bun run typecheck`

Expected: PASS and zero type errors.

```bash
git add packages/remote-control-server/web/src/lib/rcs-chat-adapter.ts packages/remote-control-server/web/src/lib/rcs-transport.ts packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts
git commit -m "feat: 消费 RCS 实时消息事件"
```

### Task 7: End-to-end verification and docs

**Files:**
- Modify: `README.md`
- Modify: `packages/remote-control-server/README.md`
- Modify: `docs/features/remote-control-self-hosting.md`

- [ ] **Step 1: Document automatic and headless streaming**

State that interactive/RCS model output streams automatically and document the exact headless form: `--print --verbose --output-format stream-json --include-partial-messages`. Explain that partials are transient and final messages are durable.

- [ ] **Step 2: Run focused transport/server/Web tests**

Run: `bun test src/bridge/__tests__/sessionRunnerModel.test.ts src/cli/transports/__tests__/streamEventAccumulator.test.ts src/cli/transports/__tests__/ccrClient.test.ts src/cli/transports/__tests__/SSETransport.test.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/ws-handler.test.ts packages/remote-control-server/web/src/__tests__/session-event-reducer.test.ts packages/remote-control-server/web/src/__tests__/rcs-chat-adapter.test.ts`

Expected: all tests PASS.

- [ ] **Step 3: Run typecheck and builds**

Run: `bun run typecheck && bun run build && bun run --cwd packages/remote-control-server build:web`

Expected: zero type errors and both builds succeed.

- [ ] **Step 4: Run repository full check without auto-writing unrelated files**

Run: `bun run typecheck && bun run lint && bun test`

Expected: typecheck, read-only Biome lint, and full test suite PASS. Formatting fixes, if required, are applied only to task-owned paths and the checks are rerun.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md packages/remote-control-server/README.md docs/features/remote-control-self-hosting.md
git commit -m "docs: 说明 RCS 流式消息行为"
```
