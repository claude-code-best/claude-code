# Ripgrep System Fallback — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)
**Topic:** Make ripgrep gracefully degrade to system `rg` when the bundled/builtin binary is unavailable on the current platform (e.g. Android/Termux).

## Problem

`src/utils/ripgrep.ts` `getRipgrepConfig()` has three resolution branches:

1. `USE_BUILTIN_RIPGREP=0` → look up `rg` on `PATH`
2. `isInBundledMode()` → bun-internal embedded rg
3. Otherwise → `vendor/ripgrep/<arch>-<platform>/rg` (builtin)

On Android/Termux, all three fail:

- The user has not opted into system rg.
- Bun does not publish Android builds, so `isInBundledMode()` is false.
- `scripts/postinstall.cjs:81` throws `Unsupported platform: android`, so no builtin binary is ever downloaded. `vendor/ripgrep/` contains no `arm64-android` directory.

Net effect: spawn of a nonexistent path → `ENOENT` → user sees "ripgrep 缺失" with no recovery path other than manually setting `USE_BUILTIN_RIPGREP=0`. The discovery pipeline (`Grep`/`Glob` tools, file suggestions, hooks) all fail in the same way.

More generally, the same breakage occurs on any platform where the builtin binary is missing for any reason (incomplete install, custom platform, deleted vendor directory). The current code has no graceful degradation.

## Goals

- On any platform, when the builtin/bundled ripgrep is unavailable, automatically fall back to `rg` on `PATH`.
- Surface the fallback clearly to the user via `/doctor` and a one-line startup warning, so they understand why they are not on the bundled rg and what to do if the system rg is also missing.
- Do not change behavior on platforms where the builtin rg works (macOS, Linux, Windows).

## Non-Goals

- Downloading or shipping an Android-native ripgrep binary.
- Adding a REPL persistent status indicator.
- Touching `USE_BUILTIN_RIPGREP` semantics for users who already opt into system rg.
- Modifying build / `postinstall.cjs` platform mapping.

## Design

### Decision chain (`getRipgrepConfig`)

The function gains an existence check and a system-rg fallback. The order of existing branches is preserved.

```
1. USE_BUILTIN_RIPGREP=0 (user-opt)  →  system rg                       mode='system'    note=undefined
2. isInBundledMode()                 →  bun embedded rg                 mode='embedded'   note=undefined
3. Compute builtin path; existsSync(rgPath)?
   ✓ true   →  builtin rg                                            mode='builtin'    note=undefined
   ✓ false  →  findExecutable('rg', [])
       ✓ found    →  system rg (auto fallback)                        mode='system'    note='fallback: builtin rg unavailable on <platform>, using system rg'
       ✗ missing  →  keep builtin path (let upper layer ENOENT)        mode='builtin'    note='no ripgrep available on <platform>; install via apt/pkg/brew/...'
```

Rationale for the missing-system-rg branch returning the (nonexistent) builtin path: it preserves the historical spawn behavior so existing error-handling paths in `ripGrepRaw` and callers continue to see `ENOENT`. The new `note` field carries the human-readable explanation; the spawn itself still fails the same way.

`existsSync` is a single synchronous syscall; `getRipgrepConfig` is already memoized via lodash, so the cost is paid once per process.

### Status API (`getRipgrepStatus`)

```ts
type RipgrepStatus = {
  mode: 'system' | 'builtin' | 'embedded'  // unchanged
  path: string                              // unchanged
  working: boolean | null                   // unchanged
  note?: string                             // NEW — human-readable hint
}
```

The internal `ripgrepStatus` singleton also gains `note?: string`. `testRipgrepOnFirstUse` propagates the note from the active config.

The `note` value is sourced from `getRipgrepConfig()` (the source of truth), so the API remains a single read; no second lookup.

### UI — `/doctor`

`src/screens/Doctor.tsx` renders the existing `Search:` line plus the note when present. Two example outputs:

```
Search: OK (system rg fallback — builtin ripgrep unavailable on android)
Search: Not working (no ripgrep available on android — install via apt/pkg/brew)
```

`src/utils/doctorDiagnostic.ts` extends the `ripgrepStatus` object it returns to include `note`.

### UI — startup warning

A single check near the end of `src/entrypoints/init.ts` reads `getRipgrepStatus()`. If `note` is set, it writes one line to stderr:

```
[ripgrep] fallback: builtin rg unavailable on android, using system rg
```

Constraints:
- Non-blocking — does not throw or exit.
- Fires at most once per process (memoized config + idempotent init).
- Goes to stderr so it does not corrupt pipe mode (`-p`) stdout.
- No retry, no telemetry beyond existing `tengu_ripgrep_availability`.

### Testing

New test file `src/utils/__tests__/ripgrepDecision.test.ts` (or extend an existing one) covers the five branches:

1. `USE_BUILTIN_RIPGREP=0` and `rg` on PATH → `mode='system'`, `note=undefined`.
2. `isInBundledMode()` → `mode='embedded'`, `note=undefined`.
3. Builtin path exists → `mode='builtin'`, `note=undefined`.
4. Builtin path missing, `rg` on PATH → `mode='system'`, `note` set.
5. Builtin path missing, `rg` not on PATH → `mode='builtin'`, `note` set (path is the nonexistent builtin path).

Mocks: `existsSync` (via `fs` module), `findExecutable`, `isInBundledMode`, `process.env.USE_BUILTIN_RIPGREP`, `process.platform`. Follow the project's mock conventions (see `tests/mocks/`); no business-module mocking.

Existing `doctorDiagnostic` tests: extend to assert `note` is propagated; update any snapshots.

## Risks

- **Behavior preservation on supported platforms:** the `existsSync` check only changes the path when the builtin file is genuinely absent. On macOS/Linux/Windows the builtin binary always exists post-install, so the decision chain resolves to `mode='builtin'` exactly as today. Verified by the test for branch 3.
- **`note` field addition is backward-compatible:** optional field; existing consumers ignore it.
- **Memoization:** `getRipgrepConfig` is memoized for the process lifetime. If a user installs ripgrep mid-session, the fallback will not trigger until restart. Acceptable — matches existing behavior for `USE_BUILTIN_RIPGREP` changes.
- **Platform string in `note`:** uses `process.platform` directly (`'android'`, `'linux'`, `'darwin'`, `'win32'`). No translation; the message is diagnostic, not user-facing marketing copy.

## Out of Scope (YAGNI)

- Android prebuilt binary download.
- Persistent REPL status indicator.
- Build-time vendor changes.
- Telemetry beyond what `testRipgrepOnFirstUse` already emits.

## Acceptance Criteria

- On a platform where the builtin rg binary is missing and `rg` is on `PATH`, `getRipgrepStatus()` returns `mode='system'`, `path=<resolved system rg>`, `note` set to a non-empty human-readable string.
- On a platform where neither builtin nor system rg is available, `/doctor` displays `Not working` plus the install hint.
- The startup warning fires exactly once per session when `note` is set.
- All existing ripgrep tests pass unchanged on macOS/Linux dev machines.
- `bun run precheck` is green.
