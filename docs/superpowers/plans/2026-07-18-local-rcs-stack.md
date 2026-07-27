# Local RCS Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a single foreground command that safely starts and stops the local RCS server, Bridge Worker, and optional Vite server without manual transport-key synchronization.

**Architecture:** Add a small Bun supervisor under `scripts/rcs-stack/`: a pure configuration module, an injectable lifecycle module, and a thin executable entrypoint. Keep RCS and Bridge as independent child processes; the parent owns only the PIDs it spawns, waits for `/health`, prefixes logs, and tears the stack down on signal or critical child failure.

**Tech Stack:** Bun 1.3+, TypeScript strict mode, `bun:test`, existing RCS Hono server and CLI Bridge fast path.

## Global Constraints

- `rcs:local` is foreground-only and Ctrl-C must stop all children started by that invocation.
- Default local bind address is `127.0.0.1`; production package defaults are not changed.
- Missing `RCS_API_KEYS` generates a 32-byte base64url secret per invocation; logs never print it.
- Explicit comma-separated `RCS_API_KEYS` are preserved and the first trimmed non-empty key is used by the Worker.
- `rcs:local` builds Web only when `web/dist/index.html` is absent; `rcs:dev` starts Vite.
- Existing unrelated dirty-worktree changes must be preserved.
- Files already dirty at task start are never whole-file staged by this plan; clean task-owned files may be committed separately.
- Production code must not use `as any`; `bun run typecheck` must report zero errors.

---

## File Map

- `scripts/rcs-stack/config.ts`: pure mode, URL, command, key, and environment resolution.
- `scripts/rcs-stack/supervisor.ts`: child process lifecycle, health wait, log forwarding, and cleanup.
- `scripts/rcs-stack/main.ts`: executable dependency wiring and signal exit behavior.
- `scripts/rcs-stack/__tests__/config.test.ts`: key/host/mode/build decision tests.
- `scripts/rcs-stack/__tests__/supervisor.test.ts`: fake-process ordering and cleanup tests.
- `scripts/rcs.ts`: standalone local server defaults and corrected startup copy.
- `package.json`: public `rcs:*` scripts.
- `src/commands/remoteControlServer/index.ts`: primary `/remote-control-worker` name and compatibility aliases.
- `src/commands/remoteControlServer/remoteControlServer.tsx`: Worker terminology in UI copy.
- `src/commands/remoteControlServer/__tests__/command.test.ts`: command metadata regression.
- `README.md`, `packages/remote-control-server/README.md`, `docs/features/remote-control-self-hosting.md`: quick start and key-boundary documentation.

### Task 1: Resolve local stack configuration

**Files:**
- Create: `scripts/rcs-stack/config.ts`
- Test: `scripts/rcs-stack/__tests__/config.test.ts`

**Interfaces:**
- Produces: `resolveStackConfig(mode: StackMode, env: NodeJS.ProcessEnv, randomSecret?: () => string): StackConfig`.
- Produces: `needsProductionWebBuild(mode: StackMode, distExists: boolean): boolean`.
- `StackConfig` contains `mode`, `host`, `port`, `healthUrl`, `webUrl`, `rcsEnv`, `workerEnv`, and `apiKeyCount`.

- [ ] **Step 1: Write failing configuration tests**

```ts
import { describe, expect, test } from 'bun:test'
import { needsProductionWebBuild, resolveStackConfig } from '../config'

describe('resolveStackConfig', () => {
  test('generates and shares a secret without exposing it as metadata', () => {
    const config = resolveStackConfig('local', {}, () => 'generated-secret')
    expect(config.host).toBe('127.0.0.1')
    expect(config.rcsEnv.RCS_API_KEYS).toBe('generated-secret')
    expect(config.workerEnv.CLAUDE_BRIDGE_OAUTH_TOKEN).toBe('generated-secret')
    expect(config.apiKeyCount).toBe(1)
  })

  test('preserves multiple keys and selects the first non-empty worker key', () => {
    const config = resolveStackConfig('local', {
      RCS_API_KEYS: ' first , second ',
      CLAUDE_BRIDGE_OAUTH_TOKEN: 'stale',
    })
    expect(config.rcsEnv.RCS_API_KEYS).toBe('first,second')
    expect(config.workerEnv.CLAUDE_BRIDGE_OAUTH_TOKEN).toBe('first')
    expect(config.apiKeyCount).toBe(2)
  })

  test('rejects an explicitly empty key list', () => {
    expect(() => resolveStackConfig('local', { RCS_API_KEYS: ' , ' })).toThrow(
      'RCS_API_KEYS must contain at least one non-empty key',
    )
  })
})

test('production Web build is only needed for local mode with no dist', () => {
  expect(needsProductionWebBuild('local', false)).toBe(true)
  expect(needsProductionWebBuild('local', true)).toBe(false)
  expect(needsProductionWebBuild('dev', false)).toBe(false)
})
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `bun test scripts/rcs-stack/__tests__/config.test.ts`

Expected: FAIL because `../config` does not exist.

- [ ] **Step 3: Implement the pure resolver**

Implement `StackMode = 'local' | 'dev'`, normalize the port from `RCS_PORT || '3000'`, use `RCS_HOST || '127.0.0.1'`, derive the Worker base URL with loopback when host is `0.0.0.0`, and create the secret with `randomBytes(32).toString('base64url')`. Construct child environments without mutating `process.env`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun test scripts/rcs-stack/__tests__/config.test.ts`

Expected: all configuration tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/rcs-stack/config.ts scripts/rcs-stack/__tests__/config.test.ts
git commit -m "feat: 添加本地 RCS 启动配置"
```

### Task 2: Supervise child lifecycle

**Files:**
- Create: `scripts/rcs-stack/supervisor.ts`
- Create: `scripts/rcs-stack/main.ts`
- Test: `scripts/rcs-stack/__tests__/supervisor.test.ts`

**Interfaces:**
- Consumes: `StackConfig`, `StackMode`, and `needsProductionWebBuild` from Task 1.
- Produces: `runStack(config: StackConfig, dependencies: StackDependencies): Promise<StackExit>`.
- `StackDependencies` injects `distExists`, `spawn`, `fetch`, `now`, and `delay` so tests never launch real services.
- `StackExit` is `{ reason: 'signal' | 'child-exit' | 'startup-failure'; exitCode: number }`.

- [ ] **Step 1: Write failing ordering and cleanup tests**

Create fake children with `exited` promises and recorded `kill(signal)` calls. Assert that:

```ts
expect(events).toEqual(['spawn:rcs', 'health:1', 'health:2', 'spawn:worker'])
expect(children.rcs.killCalls).toEqual(['SIGTERM'])
expect(children.worker.killCalls).toEqual(['SIGTERM'])
expect(result).toEqual({ reason: 'child-exit', exitCode: 7 })
```

Add separate cases proving local missing-dist runs `web-build` before RCS, dev mode starts `web-dev`, health timeout never starts Worker, and shutdown escalation only targets recorded child handles.

- [ ] **Step 2: Run the tests and verify RED**

Run: `bun test scripts/rcs-stack/__tests__/supervisor.test.ts`

Expected: FAIL because supervisor interfaces do not exist.

- [ ] **Step 3: Implement minimal lifecycle management**

Use named child specs (`web-build`, `rcs`, `worker`, `web`) and line-buffered readers that emit `[name] line`. Wait up to 15 seconds for a 2xx `/health`; watch critical `exited` promises after startup; on failure or signal send `SIGTERM`, wait a bounded grace period, then `SIGKILL` only through still-running child handles. Never scan the process table or kill by port/name.

- [ ] **Step 4: Wire the executable**

`main.ts` parses exactly `local` or `dev`, uses `Bun.file(distIndex).exists()`, `Bun.spawn`, and `fetch`, installs `SIGINT`/`SIGTERM` handlers, prints URLs and key count, and sets `process.exitCode` from `StackExit`. It must not print any environment value containing the secret.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `bun test scripts/rcs-stack/__tests__/config.test.ts scripts/rcs-stack/__tests__/supervisor.test.ts && bun run typecheck`

Expected: tests PASS and typecheck reports zero errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/rcs-stack/main.ts scripts/rcs-stack/supervisor.ts scripts/rcs-stack/__tests__/supervisor.test.ts
git commit -m "feat: 添加本地 RCS 前台编排器"
```

### Task 3: Publish package commands and standalone defaults

**Files:**
- Modify: `package.json`
- Modify: `scripts/rcs.ts`

**Interfaces:**
- Consumes: `scripts/rcs-stack/main.ts local|dev`.
- Produces: `rcs:local`, `rcs:dev`, `rcs:server`, `rcs:worker`, and compatibility `rcs` scripts.

- [ ] **Step 1: Add a failing script-manifest assertion**

Extend `config.test.ts` to load root `package.json` and assert the exact script strings:

```ts
expect(pkg.scripts['rcs:local']).toBe('bun run scripts/rcs-stack/main.ts local')
expect(pkg.scripts['rcs:dev']).toBe('bun run scripts/rcs-stack/main.ts dev')
expect(pkg.scripts['rcs:server']).toBe('bun run scripts/rcs.ts')
expect(pkg.scripts['rcs:worker']).toBe('bun run dev remote-control')
expect(pkg.scripts.rcs).toBe('bun run rcs:server')
```

- [ ] **Step 2: Verify RED**

Run: `bun test scripts/rcs-stack/__tests__/config.test.ts`

Expected: FAIL on missing `rcs:*` entries.

- [ ] **Step 3: Update scripts and server copy**

Add the five scripts. In `scripts/rcs.ts`, set `RCS_HOST=127.0.0.1` only when absent, retain explicit overrides, and change copy from “development default test-key” to clearly identify standalone server mode and recommend `rcs:local` for automatic secure pairing.

- [ ] **Step 4: Verify GREEN**

Run: `bun test scripts/rcs-stack/__tests__/config.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/rcs.ts scripts/rcs-stack/__tests__/config.test.ts
git commit -m "feat: 添加 RCS 分层启动命令"
```

### Task 4: Rename the REPL Worker command compatibly

**Files:**
- Modify: `src/commands/remoteControlServer/index.ts`
- Modify: `src/commands/remoteControlServer/remoteControlServer.tsx`
- Create: `src/commands/remoteControlServer/__tests__/command.test.ts`

**Interfaces:**
- Produces command metadata `name: 'remote-control-worker'` and aliases `['remote-control-server', 'rcs']`.

- [ ] **Step 1: Write the failing metadata test**

Mock `bun:bundle` and bridge enablement, import the command, and assert:

```ts
expect(command.name).toBe('remote-control-worker')
expect(command.aliases).toEqual(['remote-control-server', 'rcs'])
expect(command.description).toContain('Bridge Worker')
```

- [ ] **Step 2: Verify RED**

Run: `bun test src/commands/remoteControlServer/__tests__/command.test.ts`

Expected: FAIL with current `remote-control-server` name.

- [ ] **Step 3: Rename copy without changing daemon behavior**

Change the primary metadata and all user-visible “Remote Control Server” strings in this component to “Remote Control Worker”; retain the old slash command as an alias and keep the underlying daemon worker logic unchanged.

- [ ] **Step 4: Verify GREEN and type safety**

Run: `bun test src/commands/remoteControlServer/__tests__/command.test.ts && bun run typecheck`

Expected: PASS and zero type errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/remoteControlServer/index.ts src/commands/remoteControlServer/remoteControlServer.tsx src/commands/remoteControlServer/__tests__/command.test.ts
git commit -m "refactor: 明确远程控制 Worker 命名"
```

Before staging, compare these paths with the baseline status captured at execution start. If any path was already dirty, leave that path unstaged and commit only newly created/previously clean task-owned paths.

### Task 5: Document and smoke-test the local stack

**Files:**
- Modify: `README.md`
- Modify: `packages/remote-control-server/README.md`
- Modify: `docs/features/remote-control-self-hosting.md`

- [ ] **Step 1: Update the documented primary path**

Replace the two-terminal/key-copy quick start with `bun run rcs:local`. Add concise tables for `rcs:dev`, `rcs:server`, and `rcs:worker`; explain transport secret versus provider key; retain a separate explicit public-deployment example.

- [ ] **Step 2: Run documentation and command smoke checks**

Run: `rg -n "rcs:local|rcs:dev|rcs:server|rcs:worker|transport secret|provider" README.md packages/remote-control-server/README.md docs/features/remote-control-self-hosting.md`

Expected: each command and the key distinction are present.

Run: `bun run scripts/rcs-stack/main.ts invalid`

Expected: exits nonzero with usage and launches no child.

- [ ] **Step 3: Run phase verification**

Run: `bun test scripts/rcs-stack/__tests__ src/commands/remoteControlServer/__tests__/command.test.ts && bun run typecheck`

Expected: all phase tests PASS and typecheck reports zero errors.

- [ ] **Step 4: Commit**

```bash
git add README.md packages/remote-control-server/README.md docs/features/remote-control-self-hosting.md
git commit -m "docs: 简化本地 RCS 启动说明"
```
