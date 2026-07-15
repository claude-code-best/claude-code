# Bridge Reconnect Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove false self-hosted bridge reconnect cycles while preserving recovery from real RCS outages.

**Architecture:** Give the client long-poll request sufficient timeout margin, make command completion idempotent across retries, gate reconnect UI behind a small failure threshold, and replace RCS's repeated SQLite scan with a race-safe environment work signal. Durable stores remain authoritative.

**Tech Stack:** Bun, TypeScript, Hono, Axios, bun:test, SQLite.

## Global Constraints

- Preserve Code CCR v2 SSE and heartbeat semantics.
- Preserve `RCS_POLL_TIMEOUT`; use 30 seconds only for the bridge HTTP client timeout.
- Do not overwrite an already-terminal environment command.
- Do not modify unrelated dirty-worktree changes.

---

### Task 1: Poll timeout and old-server command compatibility

**Files:**
- Modify: `src/bridge/bridgeApi.ts`
- Test: `src/bridge/__tests__/bridgeApi.test.ts`

**Interfaces:**
- Produces: `BRIDGE_WORK_POLL_TIMEOUT_MS = 30_000` used by `pollForWork`.
- Produces: duplicate-completion 409 handling scoped to the exact server error.

- [ ] Add tests that inspect Axios poll timeout and accept an `environment command is already complete` 409.
- [ ] Run `bun test src/bridge/__tests__/bridgeApi.test.ts` and confirm both new tests fail.
- [ ] Set the poll request timeout to 30 seconds and return successfully for the exact idempotent completion conflict.
- [ ] Re-run the bridge API tests and confirm they pass.

### Task 2: Idempotent server completion

**Files:**
- Modify: `packages/remote-control-server/src/services/environment-command.ts`
- Test: `packages/remote-control-server/src/__tests__/routes.test.ts`

**Interfaces:**
- `completeEnvironmentCommand(input)` returns the stored terminal command when the conditional database update reports no change.
- The first terminal result remains authoritative.

- [ ] Add a route test that submits two results for one command, expects two 200 responses, and verifies the first result remains stored.
- [ ] Run the named route test and confirm the second response is currently 409.
- [ ] Return the stored command when completion already won instead of throwing.
- [ ] Re-run the named route test and surrounding environment route tests.

### Task 3: Event-driven RCS work wakeup

**Files:**
- Create: `packages/remote-control-server/src/services/work-signal.ts`
- Modify: `packages/remote-control-server/src/services/work-dispatch.ts`
- Modify: `packages/remote-control-server/src/services/environment-command.ts`
- Test: `packages/remote-control-server/src/__tests__/work-dispatch.test.ts`

**Interfaces:**
- Produces: `getWorkSignalGeneration(environmentId): number`.
- Produces: `notifyWorkAvailable(environmentId): void`.
- Produces: `waitForWorkSignal(environmentId, generation, timeoutMs): Promise<void>`.

- [ ] Add a test that starts `pollWork`, creates work shortly afterward, and requires wakeup well below the old 500 ms scan interval.
- [ ] Run the named test and confirm it fails by timing out or exceeding the latency assertion.
- [ ] Implement generation-based waiters with timeout cleanup.
- [ ] Notify after new session work, new environment commands, and reconnect requeue.
- [ ] Change `pollWork` to immediate lookup plus signal wait until deadline.
- [ ] Re-run all work-dispatch tests.

### Task 4: Reconnect display grace

**Files:**
- Create: `src/bridge/reconnectDisplayPolicy.ts`
- Modify: `src/bridge/bridgeMain.ts`
- Test: `src/bridge/__tests__/reconnectDisplayPolicy.test.ts`

**Interfaces:**
- Produces: `shouldSurfaceReconnect(consecutiveFailures: number): boolean`.
- Threshold: two consecutive failures.

- [ ] Add policy tests for failure counts one, two, and higher.
- [ ] Run the policy test and confirm the missing module/function failure.
- [ ] Implement the pure threshold helper.
- [ ] Track failure count and visible reconnect state in the bridge poll loop.
- [ ] Emit `logReconnected` only after reconnect state was visible.
- [ ] Re-run bridge policy and bridge API tests.

### Task 5: Legacy WebSocket keepalive

**Files:**
- Create: `src/cli/transports/webSocketKeepalivePolicy.ts`
- Modify: `src/cli/transports/WebSocketTransport.ts`
- Test: `src/cli/transports/__tests__/webSocketKeepalivePolicy.test.ts`

**Interfaces:**
- Produces: `getWebSocketKeepaliveIntervalMs(isRemote: boolean): number`.
- Remote legacy WebSocket interval: 20 seconds; non-remote interval: 120 seconds.

- [ ] Add policy tests for remote and non-remote intervals.
- [ ] Run the policy test and confirm the missing module/function failure.
- [ ] Implement the interval policy and remove the remote-mode early return.
- [ ] Re-run the policy and RCS WebSocket handler tests.

### Task 6: Verification

**Files:**
- Verify all files above plus existing CCR regression coverage.

- [ ] Run `bun test src/bridge/__tests__/bridgeApi.test.ts src/bridge/__tests__/reconnectDisplayPolicy.test.ts packages/remote-control-server/src/__tests__/work-signal.test.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/ws-handler.test.ts src/cli/transports/__tests__/webSocketKeepalivePolicy.test.ts src/cli/transports/__tests__/ccrClient.test.ts src/cli/transports/__tests__/SSETransport.test.ts`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun run lint`.
- [ ] Run `git diff --check`.
- [ ] Run `bun run build`.
- [ ] Review the final diff and report any unrelated pre-existing full-suite failures separately.
