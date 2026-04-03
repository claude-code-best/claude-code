# Plan 12 — Mock Reliability Fixes

> Priority: High | Affects 4 test files | Estimated ~15 modifications

This plan fixes mock-related side effects, state leaks, and false-positive tests.

---

## 12.1 `gitOperationTracking.test.ts` — Eliminate Analytics Side Effects

**Current problem**: `detectGitOperation` internally calls `logEvent()`, `getCommitCounter().increment()`, `getPrCounter().increment()`, triggering real analytics code on every test run.

**Fix steps**:

1. Read `src/tools/shared/gitOperationTracking.ts`, confirm analytics import paths
2. Add `mock.module` at the top of the test file:

```typescript
import { mock } from "bun:test";

mock.module("src/services/analytics/index.ts", () => ({
  logEvent: mock(() => {}),
  // Add other exports as needed
}));
```

3. If `getCommitCounter` / `getPrCounter` come from `src/bootstrap/state.ts`:

```typescript
mock.module("src/bootstrap/state.ts", () => ({
  getCommitCounter: mock(() => ({ increment: mock(() => {}) })),
  getPrCounter: mock(() => ({ increment: mock(() => {}) })),
  // Preserve other exports actually needed by the functions under test
}));
```

4. Use the `await import()` pattern to load the module under test
5. Run tests to verify no side effects

**Risk**: `mock.module` replaces the entire module. If `detectGitOperation` also needs other exports from these modules, they must be provided in the mock factory.

---

## 12.2 `PermissionMode.test.ts` — Fix `isExternalPermissionMode` False-Positive Tests

**Current problem**: `isExternalPermissionMode` depends on `process.env.USER_TYPE`. In non-ant environments, all modes return true, so tests never cover the false branch.

**Fix steps**:

1. Add ant environment test group (see Plan 10.3 detailed cases)
2. Use `beforeEach`/`afterEach` to manage `process.env.USER_TYPE`

```typescript
describe("when USER_TYPE is 'ant'", () => {
  const originalUserType = process.env.USER_TYPE;
  beforeEach(() => { process.env.USER_TYPE = "ant"; });
  afterEach(() => {
    if (originalUserType !== undefined) {
      process.env.USER_TYPE = originalUserType;
    } else {
      delete process.env.USER_TYPE;
    }
  });

  test("returns false for 'auto'", () => {
    expect(isExternalPermissionMode("auto")).toBe(false);
  });
  test("returns false for 'bubble'", () => {
    expect(isExternalPermissionMode("bubble")).toBe(false);
  });
  test("returns true for 'plan'", () => {
    expect(isExternalPermissionMode("plan")).toBe(true);
  });
});
```

3. Verify new tests actually execute the false path

---

## 12.3 `providers.test.ts` — Environment Variable Snapshot Restore

**Current problem**:
- `originalEnv` declared but never used
- `afterEach` only deletes 3 known keys; if the source code adds new env vars, state leaks between tests

**Fix steps**:

```typescript
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of Object.keys(process.env)) {
    savedEnv[key] = process.env[key];
  }
});

afterEach(() => {
  // Delete all current env, restore snapshot
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
});
```

> Simplified approach: Only save/restore the relevant key list `["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "ANTHROPIC_BASE_URL", "USER_TYPE"]`, but add a comment noting that new env vars need to be kept in sync.

---

## 12.4 `envUtils.test.ts` — Verify Environment Variable Restore Completeness

**Current status**: Already has `afterEach` restore. Needs review:

1. Confirm all `describe` blocks have `afterEach` that fully restores modified env vars
2. Confirm `process.argv` modifications are also restored (`getClaudeConfigHomeDir` tests modify argv)
3. Add: Assert no unexpected env leaks in `afterEach` (optional, CI-only)

---

## 12.5 `sleep.test.ts` / `memoize.test.ts` — Harden Time-Sensitive Tests

**Current status**: Already have reasonable margins. Optional hardening:

| File | Case | Current | Hardened |
|------|------|------|------|
| `sleep.test.ts` | `resolves after timeout` | `sleep(50)`, check `>= 40ms` | Increase margin: `sleep(50)`, check `>= 30ms` |
| `memoize.test.ts` | stale serve & refresh | TTL=1ms, wait 10ms | Increase margin: TTL=5ms, wait 50ms |

> Only apply this hardening if flaky in CI.

---

## Acceptance Criteria

- [ ] `gitOperationTracking.test.ts` has no analytics side effects (verifiable by adding `expect(logEvent).toHaveBeenCalledTimes(N)` in mock)
- [ ] `PermissionMode.test.ts` `isExternalPermissionMode` covers both true + false branches
- [ ] `providers.test.ts` dead code `originalEnv` removed
- [ ] All test files that modify env have complete restore
- [ ] `bun test` all passing
