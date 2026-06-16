# Ripgrep System Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `getRipgrepConfig()` automatically fall back to system `rg` on `PATH` when the builtin/bundled ripgrep is missing (e.g. on Android/Termux), and surface the fallback via `/doctor` plus a one-time startup warning.

**Architecture:** Add an `existsSync` check on the builtin rg path before returning it. If missing, query `findExecutable('rg', [])`; if found, use system rg with a new human-readable `note` field on `RipgrepConfig` / `getRipgrepStatus()`. Consumers (`/doctor`, startup) read `note` and render it. No new modes — `mode` stays `'system' | 'builtin' | 'embedded'`; `note` carries the fallback narrative.

**Tech Stack:** TypeScript, Bun runtime, `bun:test`, Biome, lodash `memoize`.

**Spec:** `docs/superpowers/specs/2026-06-15-ripgrep-system-fallback-design.md`

---

## File Structure

- **Modify** `src/utils/ripgrep.ts` — extend `RipgrepConfig` type with `note?`; extend internal `ripgrepStatus` singleton with `note?`; extend `getRipgrepStatus()` return type with `note?`; rewrite the `builtin` branch of `getRipgrepConfig()` to add `existsSync` + system-rg fallback; sync `note` into the singleton inside `testRipgrepOnFirstUse`.
- **Create** `src/utils/__tests__/ripgrepConfig.test.ts` — five-branch decision coverage for `getRipgrepConfig()`.
- **Modify** `src/utils/doctorDiagnostic.ts` — propagate `note` from `getRipgrepStatus()` into the diagnostic object.
- **Modify** `src/screens/Doctor.tsx` — render `note` in the `Search:` line.
- **Modify** `src/entrypoints/init.ts` — emit a one-time stderr warning when `note` is set.

Each file has a single clear responsibility and changes stay inside that file's existing role.

---

## Task 1: Extend types with optional `note` field (no behavior change)

**Files:**
- Modify: `src/utils/ripgrep.ts:22-27` (type), `:29-63` (function — minimal shape only), `:523-527` (singleton), `:533-544` (public getter)

This task only adds the optional field everywhere it's needed and populates it with `undefined` for existing branches. Behavior stays identical. Task 2 fills in the real values.

- [ ] **Step 1: Extend `RipgrepConfig` type**

File: `src/utils/ripgrep.ts`, replace lines 22-27.

```ts
type RipgrepConfig = {
  mode: 'system' | 'builtin' | 'embedded'
  command: string
  args: string[]
  argv0?: string
  note?: string
}
```

- [ ] **Step 2: Extend the `ripgrepStatus` singleton shape**

File: `src/utils/ripgrep.ts`, replace lines 522-527.

```ts
// Singleton to store ripgrep availability status
let ripgrepStatus: {
  working: boolean
  lastTested: number
  config: RipgrepConfig
  note?: string
} | null = null
```

- [ ] **Step 3: Extend `getRipgrepStatus()` return type**

File: `src/utils/ripgrep.ts`, replace lines 533-544.

```ts
/**
 * Get ripgrep status and configuration info
 * Returns current configuration immediately, with working status if available
 */
export function getRipgrepStatus(): {
  mode: 'system' | 'builtin' | 'embedded'
  path: string
  working: boolean | null // null if not yet tested
  note?: string
} {
  const config = getRipgrepConfig()
  return {
    mode: config.mode,
    path: config.command,
    working: ripgrepStatus?.working ?? null,
    note: ripgrepStatus?.note ?? config.note,
  }
}
```

- [ ] **Step 4: Verify typecheck**

Run: `bunx tsc --noEmit`
Expected: 0 errors. (All `note` fields are optional; existing code is unaffected.)

- [ ] **Step 5: Commit**

```bash
git add src/utils/ripgrep.ts
git commit -m "refactor: add optional note field to RipgrepConfig and getRipgrepStatus"
```

---

## Task 2: Implement fallback decision in `getRipgrepConfig()` (TDD)

**Files:**
- Modify: `src/utils/ripgrep.ts:1-20` (imports), `:56-63` (builtin branch)
- Test: `src/utils/__tests__/ripgrepConfig.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/utils/__tests__/ripgrepConfig.test.ts` with this exact content:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

// Mock shared side-effect modules. log.ts pulls in bootstrap/state which has
// realpathSync side effects at import time. See project CLAUDE.md "Mock 使用规范".
mock.module('src/utils/log.ts', () => ({
  logError: () => {},
  logEvent: () => {},
}))
mock.module('src/utils/debug.ts', () => ({
  logForDebugging: () => {},
}))

// Overridable fakes. Defaults match the "builtin exists" happy path on the
// runner's actual platform (no process.platform override — avoids polluting
// other tests in the same Bun process, see CLAUDE.md mock contamination note).
let fakeExistsSync = (): boolean => true
let fakeWhich: string | null = '/usr/local/bin/rg'
let fakeBundled = false

mock.module('node:fs', () => ({
  existsSync: (p: string) => fakeExistsSync(p),
  realpathSync: (p: string) => p,
  constants: {},
}))
mock.module('src/utils/which.ts', () => ({
  whichSync: () => fakeWhich,
}))
mock.module('src/utils/bundledMode.ts', () => ({
  isInBundledMode: () => fakeBundled,
}))
mock.module('src/utils/envUtils.ts', () => ({
  isEnvDefinedFalsy: (v: string | undefined) =>
    v !== undefined &&
    ['0', 'false', 'no', 'off'].includes(v.toLowerCase().trim()),
  isEnvTruthy: (v: string | undefined) =>
    v !== undefined &&
    ['1', 'true', 'yes', 'on'].includes(v.toLowerCase().trim()),
}))
mock.module('src/utils/distRoot.ts', () => ({
  distRoot: '/fake/dist',
}))
mock.module('os', () => ({
  homedir: () => '/fake/home',
  tmpdir: () => '/tmp',
}))
// Disable memoize so each call re-evaluates with current fakes.
mock.module('lodash-es/memoize.js', () => ({
  default: <T extends (...args: any[]) => any>(fn: T): T => fn,
}))

const { getRipgrepConfig } = await import('../ripgrep.ts')

describe('getRipgrepConfig', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    fakeExistsSync = () => true
    fakeWhich = '/usr/local/bin/rg'
    fakeBundled = false
    delete process.env.USE_BUILTIN_RIPGREP
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('USE_BUILTIN_RIPGREP=0 with system rg -> mode=system, no note', () => {
    process.env.USE_BUILTIN_RIPGREP = '0'
    const cfg = getRipgrepConfig()
    expect(cfg.mode).toBe('system')
    expect(cfg.command).toBe('rg')
    expect(cfg.note).toBeUndefined()
  })

  test('bundled mode -> mode=embedded, no note', () => {
    fakeBundled = true
    const cfg = getRipgrepConfig()
    expect(cfg.mode).toBe('embedded')
    expect(cfg.note).toBeUndefined()
  })

  test('builtin path exists -> mode=builtin, no note', () => {
    fakeExistsSync = () => true
    const cfg = getRipgrepConfig()
    expect(cfg.mode).toBe('builtin')
    expect(cfg.note).toBeUndefined()
  })

  test('builtin missing + system rg available -> mode=system, note set', () => {
    fakeExistsSync = () => false
    fakeWhich = '/usr/local/bin/rg'
    const cfg = getRipgrepConfig()
    expect(cfg.mode).toBe('system')
    expect(cfg.command).toBe('rg')
    expect(typeof cfg.note).toBe('string')
    expect(cfg.note).toContain('fallback')
    // Note contains process.platform verbatim — assert the substring shape,
    // not a specific platform, so the test is portable.
    expect(cfg.note).toMatch(/builtin rg unavailable on \w+, using system rg/)
  })

  test('builtin missing + system rg missing -> mode=builtin, note set', () => {
    fakeExistsSync = () => false
    fakeWhich = null
    const cfg = getRipgrepConfig()
    expect(cfg.mode).toBe('builtin')
    expect(typeof cfg.note).toBe('string')
    expect(cfg.note).toContain('no ripgrep available')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/utils/__tests__/ripgrepConfig.test.ts`
Expected: The fourth and fifth tests FAIL — currently `getRipgrepConfig()` returns `mode='builtin'` with no `note` when the builtin path is missing, instead of falling back to system rg.

- [ ] **Step 3: Add `existsSync` import to `ripgrep.ts`**

File: `src/utils/ripgrep.ts`, replace lines 1-2.

```ts
import type { ChildProcess, ExecFileException } from 'child_process'
import { execFile, spawn } from 'child_process'
import { existsSync } from 'fs'
```

- [ ] **Step 4: Rewrite the builtin branch with fallback logic**

File: `src/utils/ripgrep.ts`, replace lines 56-63.

```ts
  const rgRoot = path.resolve(__dirname, 'vendor', 'ripgrep')
  const command =
    process.platform === 'win32'
      ? path.resolve(rgRoot, `${process.arch}-win32`, 'rg.exe')
      : path.resolve(rgRoot, `${process.arch}-${process.platform}`, 'rg')

  // Builtin binary missing (e.g. Android/Termux, or incomplete install).
  // Fall back to system rg on PATH. If neither is available, keep the
  // (nonexistent) builtin path so upper layers still see ENOENT, but
  // surface a human-readable note so /doctor and startup can explain.
  if (!existsSync(command)) {
    const { cmd: systemPath } = findExecutable('rg', [])
    if (systemPath !== 'rg') {
      return {
        mode: 'system',
        command: 'rg',
        args: [],
        note: `fallback: builtin rg unavailable on ${process.platform}, using system rg`,
      }
    }
    return {
      mode: 'builtin',
      command,
      args: [],
      note: `no ripgrep available on ${process.platform}; install via apt/pkg/brew or set USE_BUILTIN_RIPGREP=0`,
    }
  }

  return { mode: 'builtin', command, args: [] }
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/utils/__tests__/ripgrepConfig.test.ts`
Expected: PASS (5/5).

- [ ] **Step 6: Run full precheck to ensure no regression**

Run: `bun run precheck`
Expected: 0 typecheck errors, 0 lint errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/utils/ripgrep.ts src/utils/__tests__/ripgrepConfig.test.ts
git commit -m "feat: ripgrep falls back to system rg when builtin binary missing"
```

---

## Task 3: Sync `note` into the singleton inside `testRipgrepOnFirstUse`

**Files:**
- Modify: `src/utils/ripgrep.ts:549-615`

Currently `testRipgrepOnFirstUse` writes `ripgrepStatus = { working, lastTested, config }` without `note`. The new `getRipgrepStatus()` in Task 1 already falls back to `config.note` if the singleton has none, so this task is mostly belt-and-suspenders: persist the note explicitly so consumers reading the singleton directly also see it.

- [ ] **Step 1: Update the success-path assignment**

File: `src/utils/ripgrep.ts`, replace lines 592-596.

```ts
    ripgrepStatus = {
      working,
      lastTested: Date.now(),
      config,
      note: config.note,
    }
```

- [ ] **Step 2: Update the catch-path assignment**

File: `src/utils/ripgrep.ts`, replace lines 608-612.

```ts
    ripgrepStatus = {
      working: false,
      lastTested: Date.now(),
      config,
      note: config.note,
    }
```

- [ ] **Step 3: Run precheck**

Run: `bun run precheck`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/utils/ripgrep.ts
git commit -m "refactor: persist ripgrep config.note in testRipgrepOnFirstUse singleton"
```

---

## Task 4: Propagate `note` through `/doctor`

**Files:**
- Modify: `src/utils/doctorDiagnostic.ts:588-597`
- Modify: `src/screens/Doctor.tsx:224-232`

- [ ] **Step 1: Extend the diagnostic object**

File: `src/utils/doctorDiagnostic.ts`, replace lines 588-597.

```ts
  // Get ripgrep status and configuration info
  const ripgrepStatusRaw = getRipgrepStatus()

  // Provide simple ripgrep status info
  const ripgrepStatus = {
    working: ripgrepStatusRaw.working ?? true, // Assume working if not yet tested
    mode: ripgrepStatusRaw.mode,
    systemPath:
      ripgrepStatusRaw.mode === 'system' ? ripgrepStatusRaw.path : null,
    note: ripgrepStatusRaw.note ?? null,
  }
```

- [ ] **Step 2: Render `note` in Doctor.tsx**

File: `src/screens/Doctor.tsx`, replace lines 224-232.

```tsx
        <Text>
          └ Search: {diagnostic.ripgrepStatus.working ? 'OK' : 'Not working'} (
          {diagnostic.ripgrepStatus.mode === 'embedded'
            ? 'bundled'
            : diagnostic.ripgrepStatus.mode === 'builtin'
              ? 'vendor'
              : diagnostic.ripgrepStatus.systemPath || 'system'}
          )
        </Text>
        {diagnostic.ripgrepStatus.note && (
          <Text color="warning">
            └ Note: {diagnostic.ripgrepStatus.note}
          </Text>
        )}
```

- [ ] **Step 3: Run precheck (lint + typecheck)**

Run: `bun run precheck`
Expected: 0 errors.

- [ ] **Step 4: Manual smoke check (optional)**

Run: `bun run dev -- doctor 2>&1 | grep -i search`
Expected: prints the `Search:` line; on dev machine `note` should be empty so no `Note:` line appears.

- [ ] **Step 5: Commit**

```bash
git add src/utils/doctorDiagnostic.ts src/screens/Doctor.tsx
git commit -m "feat: /doctor shows ripgrep fallback note"
```

---

## Task 5: Emit one-time startup warning from `init.ts`

**Files:**
- Modify: `src/entrypoints/init.ts:240-243`

- [ ] **Step 1: Add the warning right before `profileCheckpoint('init_function_end')`**

File: `src/entrypoints/init.ts`, replace lines 240-243.

```ts
    // Surface ripgrep fallback (e.g. Android/Termux) once per session.
    // Goes to stderr so it doesn't corrupt pipe-mode (`-p`) stdout.
    try {
      const { getRipgrepStatus } = await import('../utils/ripgrep.js')
      const status = getRipgrepStatus()
      if (status.note) {
        process.stderr.write(`[ripgrep] ${status.note}\n`)
      }
    } catch {
      // Ripgrep status is best-effort; never block init.
    }

    logForDiagnosticsNoPII('info', 'init_completed', {
      duration_ms: Date.now() - initStartTime,
    })
    profileCheckpoint('init_function_end')
```

- [ ] **Step 2: Run precheck**

Run: `bun run precheck`
Expected: 0 errors.

- [ ] **Step 3: Manual smoke check**

Simulate fallback by pointing vendor at a missing path is non-trivial; instead verify no warning fires on the dev machine (where builtin exists):
Run: `bun run dev -- --version`
Expected: `[ripgrep]` line does NOT appear on stderr.

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/init.ts
git commit -m "feat: warn on stderr when ripgrep falls back to system rg"
```

---

## Task 6: Final full precheck + verification

**Files:** None (verification only)

- [ ] **Step 1: Run full precheck**

Run: `bun run precheck`
Expected: `XXXX pass / 0 fail`, 0 typecheck errors, 0 lint errors.

- [ ] **Step 2: Verify the five-branch test still passes**

Run: `bun test src/utils/__tests__/ripgrepConfig.test.ts`
Expected: PASS (5/5).

- [ ] **Step 3: Verify decision logic via REPL sanity (optional)**

Run:
```bash
bun -e "import('./src/utils/ripgrep.ts').then(m => console.log(JSON.stringify(m.getRipgrepStatus(), null, 2)))"
```
Expected on macOS dev machine: `mode: "builtin"`, `note: undefined`.

---

## Self-Review Notes

**Spec coverage:**
- Decision chain with 5 branches → Task 2 ✓
- `note` field on `RipgrepConfig` / singleton / `getRipgrepStatus()` → Tasks 1, 3 ✓
- `/doctor` rendering → Task 4 ✓
- Startup warning → Task 5 ✓
- Tests for 5 branches → Task 2 Step 1 ✓
- Acceptance criteria 1-5 cross-checked against spec section "Acceptance Criteria"

**Placeholder scan:** None. Each step contains the exact code or command.

**Type consistency:** `note?: string` consistently used across `RipgrepConfig`, `ripgrepStatus` singleton, `getRipgrepStatus()` return, `doctorDiagnostic.ripgrepStatus.note`. In Doctor.tsx the diagnostic object's `note` is `string | null` (Task 4 Step 1 uses `?? null`), accessed with a truthy check (`{note && ...}`) which handles both `null` and `undefined`.

**Mock hygiene note:** Task 2's test mocks `node:fs`, `src/utils/which.ts`, `src/utils/bundledMode.ts`, `src/utils/envUtils.ts`, `src/utils/distRoot.ts`, `os`, and `lodash-es/memoize.js`. These are process-global mocks (Bun limitation — see project CLAUDE.md "Mock 使用规范"). The test file lives at `src/utils/__tests__/ripgrepConfig.test.ts` and there is no existing `ripgrep.test.ts` to collide with, so no contamination risk.
