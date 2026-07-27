# Runtime Recovery and Chat Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the latest leased local Claude Code bridge return to the active environment list after reconnecting and verify that the same bridge registers the explicit capabilities required for isolated Chat sessions.

**Architecture:** Keep one stable logical environment per account/device/workspace/worker type. The lease middleware remains the fencing boundary; only after authentication and current-lease validation does a poll refresh both the timestamp and active status. Chat remains fail-closed and uses the existing explicit bridge capabilities and product-aware sandbox runtime.

**Tech Stack:** TypeScript, Bun, Hono, SQLite, Axios, Bun test.

## Global Constraints

- Preserve stable `environment_id` values and existing lease epochs.
- Never infer Chat support from `worker_type` on the server.
- A superseded lease must return `409 lease_superseded` before any liveness mutation.
- Chat sessions must continue to require `chat: true` and `chat_sandbox: true`.
- Chat child processes must continue to force sandbox mode and fail if unavailable.
- Preserve all unrelated uncommitted workspace changes.
- ACP and env-less/v2 identity semantics remain unchanged.

## File Map

- `packages/remote-control-server/src/services/environment.ts`: owns environment liveness updates and active-state restoration.
- `packages/remote-control-server/src/routes/v1/environments.work.ts`: preserves middleware order before calling the liveness service.
- `packages/remote-control-server/src/__tests__/routes.test.ts`: proves current-lease recovery and stale-lease fencing through the real Hono route stack.
- `src/bridge/bridgeApi.ts`: existing explicit Claude Code, Chat, and Chat sandbox capability advertisement.
- `src/bridge/__tests__/bridgeApi.test.ts`: existing bridge registration payload and lease propagation contract.
- `packages/remote-control-server/src/services/product-session.ts`: existing fail-closed Chat runtime selection.
- `packages/remote-control-server/src/__tests__/routes.test.ts`: existing Chat selection and product-session route coverage.

---

### Task 1: Restore Active Status on a Current-Lease Poll

**Files:**
- Modify: `packages/remote-control-server/src/__tests__/routes.test.ts`
- Modify: `packages/remote-control-server/src/services/environment.ts:189`
- Verify unchanged middleware order: `packages/remote-control-server/src/routes/v1/environments.work.ts:18-27`

**Interfaces:**
- Consumes: `environmentLeaseAuth(c, next)` and `storeUpdateEnvironment(id, patch)`.
- Produces: `updatePollTime(envId: string): void`, which atomically refreshes `lastPollAt` and restores `status: 'active'` after route authentication and lease fencing.

- [ ] **Step 1: Add the failing current-lease recovery route test**

Add `storeUpdateEnvironment` to the imports from `../store`, then add this test inside `describe('V1 Environment Routes')`:

```ts
test('a poll from the current lease restores an offline environment', async () => {
  const registered = await resJson(
    await app.request('/v1/environments/bridge', {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: 'device-recovery',
        workspace_key: 'wrk-recovery',
        connection_id: 'connection-current',
        worker_type: 'claude_code',
      }),
    }),
  )
  storeUpdateEnvironment(registered.environment_id, { status: 'offline' })

  const poll = await app.request(
    `/v1/environments/${registered.environment_id}/work/poll`,
    {
      headers: {
        ...AUTH_HEADERS,
        'X-Bridge-Lease': registered.lease_token,
      },
    },
  )

  expect(poll.status).toBe(204)
  expect(storeGetEnvironment(registered.environment_id)?.status).toBe(
    'active',
  )
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test packages/remote-control-server/src/__tests__/routes.test.ts -t "a poll from the current lease restores an offline environment"
```

Expected: FAIL because the response is `204` but the stored status remains `offline`.

- [ ] **Step 3: Add the stale-lease non-mutation assertion**

In the existing test `new registration fences every environment route used by the old lease`, set the environment offline before `oldPoll`, and assert that the rejected old poll leaves it offline:

```ts
storeUpdateEnvironment(first.environment_id, { status: 'offline' })

const oldPoll = await app.request(
  `/v1/environments/${first.environment_id}/work/poll`,
  {
    headers: { ...AUTH_HEADERS, 'X-Bridge-Lease': first.lease_token },
  },
)
expect(oldPoll.status).toBe(409)
expect(storeGetEnvironment(first.environment_id)?.status).toBe('offline')
```

Before the existing current-delete assertion, use the second lease to poll and assert recovery:

```ts
const currentPoll = await app.request(
  `/v1/environments/${second.environment_id}/work/poll`,
  {
    headers: { ...AUTH_HEADERS, 'X-Bridge-Lease': second.lease_token },
  },
)
expect(currentPoll.status).toBe(204)
expect(storeGetEnvironment(second.environment_id)?.status).toBe('active')
```

- [ ] **Step 4: Implement the minimal liveness update**

Change `updatePollTime` to:

```ts
export function updatePollTime(envId: string) {
  storeUpdateEnvironment(envId, {
    status: 'active',
    lastPollAt: new Date(),
  })
}
```

Do not move this call before `environmentLeaseAuth`; the route middleware order is the security boundary.

- [ ] **Step 5: Run focused route tests and verify GREEN**

Run:

```bash
bun test packages/remote-control-server/src/__tests__/routes.test.ts -t "current lease|new registration fences"
```

Expected: both recovery and fencing tests PASS.

- [ ] **Step 6: Run environment service and disconnect-monitor regressions**

Run:

```bash
bun test packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/disconnect-monitor.test.ts
```

Expected: PASS with no failures.

---

### Task 2: Verify the Explicit Chat Capability Contract

**Files:**
- Verify: `src/bridge/bridgeApi.ts:147-216`
- Verify: `src/bridge/__tests__/bridgeApi.test.ts`
- Verify: `packages/remote-control-server/src/services/product-session.ts:187-218`
- Verify: `packages/remote-control-server/src/__tests__/routes.test.ts`

**Interfaces:**
- Consumes: `BridgeConfig.workerType`, `BridgeConfig.capabilities`, and environment registration `capabilities`.
- Produces: a registration payload containing `claude_code: true`, `chat: true`, and `chat_sandbox: true` for Claude Code workers; Chat selection still requires the latter two flags explicitly.

- [ ] **Step 1: Run the bridge payload contract test**

Run:

```bash
bun test src/bridge/__tests__/bridgeApi.test.ts -t "registers stable identity fields and attaches the returned lease"
```

Expected: PASS and the assertion confirms all three capabilities plus `X-Bridge-Lease` propagation. If it fails, change only the capability assembly in `registerBridgeEnvironment`; do not add server-side inference.

- [ ] **Step 2: Run the Chat fail-closed and selection tests**

Run:

```bash
bun test packages/remote-control-server/src/__tests__/routes.test.ts -t "requires Chat sandbox capability|assigns Chat runtime storage"
```

Expected: PASS; Code-only environments are rejected and explicitly capable environments receive Chat work.

- [ ] **Step 3: Inspect the diff boundary**

Run:

```bash
git diff -- packages/remote-control-server/src/services/environment.ts packages/remote-control-server/src/__tests__/routes.test.ts src/bridge/bridgeApi.ts src/bridge/__tests__/bridgeApi.test.ts
```

Expected: the new implementation delta is limited to liveness recovery and its tests; existing explicit capability changes remain intact.

---

### Task 3: Verify the Integrated Code and Chat Runtime

**Files:**
- No source edits expected.
- Runtime state: `data/rcs.sqlite` and local RCS/bridge processes.

**Interfaces:**
- Consumes: `bun run rcs`, `bun run dev remote-control`, `/health`, `/web/environments`, `/web/chat/sessions`, and `/web/code/sessions`.
- Produces: one active stable environment with explicit Chat capabilities that can accept both product session types.

- [ ] **Step 1: Run the full relevant automated suite**

Run:

```bash
bun test packages/remote-control-server/src/__tests__/routes.test.ts packages/remote-control-server/src/__tests__/services.test.ts packages/remote-control-server/src/__tests__/disconnect-monitor.test.ts src/bridge/__tests__/bridgeApi.test.ts src/bridge/__tests__/productRuntime.test.ts src/bridge/__tests__/transportPolicy.test.ts
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run type checking**

Run:

```bash
bun run typecheck
```

Expected: exit code `0` with no TypeScript errors.

- [ ] **Step 3: Restart RCS with the explicit local key**

Stop the current RCS process, then run from the repository root:

```bash
RCS_SINGLE_USER=1 RCS_API_KEYS=test-my-key bun run rcs
```

Expected startup output includes port `3000`, single-user mode `ON`, and one configured API key.

- [ ] **Step 4: Restart the bridge so it republishes capabilities**

Stop the current bridge process, then run from the repository root:

```bash
CLAUDE_BRIDGE_BASE_URL=http://localhost:3000 \
CLAUDE_BRIDGE_OAUTH_TOKEN=test-my-key \
bun run dev remote-control
```

Expected: registration succeeds, the stable environment ID is reused, and polling begins without `401` or `lease_superseded` errors.

- [ ] **Step 5: Verify the live environment response and persisted capability state**

Run:

```bash
curl -sS 'http://localhost:3000/web/environments?uuid=single-user'
sqlite3 -header -column data/rcs.sqlite "select id,status,worker_type,capabilities_json,lease_epoch from environments order by updated_at_ms desc limit 1;"
```

Expected: the HTTP response contains one active stable environment, and SQLite shows `worker_type=claude_code`, `status=active`, and capability JSON containing `claude_code`, `chat`, and `chat_sandbox` set to `true`.

- [ ] **Step 6: Verify Chat and Code session creation through RCS**

Create a Chat session:

```bash
curl -sS -X POST 'http://localhost:3000/web/chat/sessions?uuid=single-user' \
  -H 'Content-Type: application/json' \
  --data '{"title":"Runtime verification chat"}'
```

Expected: HTTP JSON contains `product: "chat"`, the active environment ID, and a data directory under `~/.real-agentc/chat-sessions/`.

Create a Code session using the active environment ID and repository path:

```bash
ENV_ID=$(sqlite3 data/rcs.sqlite "select id from environments where status='active' and worker_type='claude_code' order by updated_at_ms desc limit 1;")
curl -sS -X POST 'http://localhost:3000/web/code/sessions?uuid=single-user' \
  -H 'Content-Type: application/json' \
  --data "{\"environment_id\":\"${ENV_ID}\",\"requested_directory\":\"/Users/xiej/LocalDoc/Real_Agentc/Real-Agentic\",\"title\":\"Runtime verification code\"}"
```

Expected: HTTP JSON contains `product: "code"`, the same environment ID, and the canonical repository directory.

- [ ] **Step 7: Review final workspace changes**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; all unrelated pre-existing modifications remain preserved.
