# Provider Command Worker Wakeup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve timed-out provider/model environment commands as pending work so lazy Worker startup can resume them without creating an artificial conversation.

**Architecture:** Provider command kinds are identified by a shared helper. The persistence layer gains a single-command requeue operation. The environment command runner requeues only provider commands on timeout and keeps existing fail-fast behavior for ordinary commands.

**Tech Stack:** Bun, TypeScript strict mode, Bun SQLite, `bun:test`.

## Global Constraints

- Do not modify or discard unrelated existing working-tree changes.
- Production TypeScript must not use `as any`.
- Preserve operation-id idempotency for provider mutations.
- `bun run typecheck` must pass with zero errors.
- Use Conventional Commits for any commit created by this task.

---

### Task 1: Add single-command provider requeue persistence

**Files:**
- Modify: `packages/remote-control-server/src/persistence/database.ts:955-969`
- Test: `packages/remote-control-server/src/__tests__/persistence.test.ts` near the environment-command lifecycle tests

**Interfaces:**
- Produces `RcsDatabase.requeueEnvironmentCommand(id: string, now: number): boolean`.

- [x] **Step 1: Write the failing test**

Add a test beside the existing environment-command lifecycle assertions:

```ts
test('requeues one dispatched environment command for a later worker', () => {
  database.createEnvironmentCommand({
    id: 'cmd-requeue',
    environmentId: 'env-1',
    ownerId: 'owner-1',
    kind: 'get_provider_catalog',
    payload: {},
    state: 'pending',
    result: null,
    error: null,
    attemptCount: 0,
    createdAt: 10,
    updatedAt: 10,
  })

  expect(database.markEnvironmentCommandDispatched('cmd-requeue', 20)).toBe(true)
  expect(database.requeueEnvironmentCommand('cmd-requeue', 30)).toBe(true)
  expect(database.getEnvironmentCommand('cmd-requeue')).toMatchObject({
    state: 'pending',
    attemptCount: 1,
    updatedAt: 30,
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test packages/remote-control-server/src/__tests__/persistence.test.ts
```

Expected: FAIL because `requeueEnvironmentCommand` does not exist.

- [x] **Step 3: Write the minimal implementation**

Add this method next to `requeueDispatchedEnvironmentCommands()`:

```ts
requeueEnvironmentCommand(id: string, now: number): boolean {
  const result = this.database
    .query<unknown, { id: string; now: number }>(
      `UPDATE environment_commands
       SET state = 'pending',
           attempt_count = attempt_count + 1,
           updated_at_ms = $now
       WHERE id = $id AND state = 'dispatched'`,
    )
    .run({ id, now })
  return result.changes > 0
}
```

- [x] **Step 4: Run the test to verify it passes**

Run the same focused persistence test and expect the test file to pass.

- [x] **Step 5: Commit**

```bash
git add packages/remote-control-server/src/persistence/database.ts packages/remote-control-server/src/__tests__/persistence.test.ts
git commit -m "fix: requeue timed out environment commands"
```

### Task 2: Preserve provider commands on timeout

**Files:**
- Modify: `packages/remote-control-server/src/services/environment-command.ts:1-20,155-175`
- Test: `packages/remote-control-server/src/__tests__/work-dispatch.test.ts:596-625`

**Interfaces:**
- Produces `isProviderEnvironmentCommandKind(kind: EnvironmentCommandKind): boolean`.
- Consumes `RcsDatabase.requeueEnvironmentCommand()` from Task 1.

- [x] **Step 1: Write the failing regression test**

Add this test after the existing ordinary timeout test:

```ts
test('keeps a timed-out provider command pending for the next worker', async () => {
  await expect(
    runEnvironmentCommand(
      {
        environmentId: envId,
        ownerId: 'owner-1',
        kind: 'get_provider_catalog',
        payload: {},
      },
      10,
    ),
  ).rejects.toThrow(/timed out/i)

  const pending = getPersistence()
    .listPendingEnvironmentCommands(envId)
    .find(command => command.kind === 'get_provider_catalog')
  expect(pending).toMatchObject({ state: 'pending' })
  expect((await pollWork(envId, 1))?.id).toBe(pending?.id)
})
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test packages/remote-control-server/src/__tests__/work-dispatch.test.ts
```

Expected: FAIL because the timeout path currently marks the provider command `failed`.

- [x] **Step 3: Write the minimal implementation**

Export a provider-kind helper based on the existing provider command set:

```ts
export function isProviderEnvironmentCommandKind(
  kind: EnvironmentCommandKind,
): boolean {
  return PROVIDER_COMMAND_KINDS.has(kind)
}
```

Import `notifyWorkAvailable` and update the timeout branch:

```ts
const current = getPersistence().getEnvironmentCommand(command.id)
if (isProviderEnvironmentCommandKind(command.kind)) {
  if (current?.state === 'dispatched') {
    getPersistence().requeueEnvironmentCommand(command.id, Date.now())
  }
  notifyWorkAvailable(command.environmentId)
} else {
  getPersistence().completeEnvironmentCommand(
    command.id,
    null,
    `Environment command timed out after ${timeoutMs}ms`,
    Date.now(),
  )
}
throw new Error(`Environment command timed out after ${timeoutMs}ms`)
```

Keep the current ordinary timeout test unchanged so cleanup commands still fail and are not left pending.

- [x] **Step 4: Run the focused tests to verify they pass**

```bash
bun test packages/remote-control-server/src/__tests__/work-dispatch.test.ts packages/remote-control-server/src/__tests__/persistence.test.ts
```

Expected: all tests in both files pass, including both timeout semantics.

- [x] **Step 5: Commit**

```bash
git add packages/remote-control-server/src/services/environment-command.ts packages/remote-control-server/src/__tests__/work-dispatch.test.ts
git commit -m "fix: keep provider commands available for lazy workers"
```

### Task 3: Verify the integrated behavior

**Files:**
- No new source files.

- [x] **Step 1: Run provider and dispatch regression tests**

```bash
bun test packages/remote-control-server/src/__tests__/work-dispatch.test.ts packages/remote-control-server/src/__tests__/persistence.test.ts packages/remote-control-server/src/__tests__/provider-catalog.test.ts packages/remote-control-server/web/src/__tests__/provider-catalog-model.test.ts
```

- [x] **Step 2: Run package and repository typechecks**

```bash
bun run --cwd packages/remote-control-server typecheck
bun run typecheck
```

- [x] **Step 3: Run the full project verification**

```bash
bun run test:all
```

- [x] **Step 4: Review the diff for scope safety**

Run:

```bash
git diff --check
git status --short
```

Confirm only the intended implementation/test changes plus the already-existing user changes are present; do not stage or revert unrelated files.

> `bun run test:all` is not defined in this checkout, so the repository-wide fallback `bun test` was used. The implementation files were not staged or committed because they share files with pre-existing user changes.
