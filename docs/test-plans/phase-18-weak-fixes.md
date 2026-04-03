# Phase 18 -- WEAK Fixes + ACCEPTABLE Hardening

> Created: 2026-04-02
> Estimated: +30 tests / 4 files (modifying existing)
> Goal: Fix all WEAK-rated test files and eliminate systemic issues

---

## 18.1 `src/utils/__tests__/format.test.ts` -- Assertion Precision (+5 tests)

**Problem**: `formatNumber`/`formatTokens`/`formatRelativeTime` use `toContain`
**Fix**: Change to `toBe` for exact matching

```diff
- expect(formatNumber(1500000)).toContain("1.5")
+ expect(formatNumber(1500000)).toBe("1.5m")
```

New tests:

| Test Case | Verification |
|---------|--------|
| formatNumber -- 0 | `"0"` |
| formatNumber -- billions | `"1.5b"` |
| formatTokens -- thousands | Exact match |
| formatRelativeTime -- hours ago | Exact match |
| formatRelativeTime -- days ago | Exact match |

---

---

## 18.2 `src/utils/__tests__/envValidation.test.ts` -- Bug Confirmation (+3 tests)

**Problem**: `value=1, lowerBound=100` returns `status: "valid"` -- function name implies lower bound checking
**Plan**: First read source code to confirm the semantic relationship between `defaultValue` and `lowerBound`, then:
- If it is a source code bug -> mark with a comment in the test, do not modify source code
- If it is by design -> update test description to clarify semantics

New tests:

| Test Case | Verification |
|---------|--------|
| parseFloat truncation | `"50.9"` -> 50 |
| whitespace handling | `" 500 "` -> 500 |
| very large number | Overflow handling |

---

---

## 18.3 `src/utils/permissions/__tests__/PermissionMode.test.ts` -- False Path (+8 tests)

**Problem**: `isExternalPermissionMode` false path never executed
**Fix**: Cover true/false expectations for all 5 modes

| Test Case | Verification |
|---------|--------|
| isExternalPermissionMode -- plan | false |
| isExternalPermissionMode -- auto | false |
| isExternalPermissionMode -- default | false |
| permissionModeFromString -- all modes | Full coverage of all 5 modes |
| permissionModeFromString -- invalid | Default value |
| permissionModeFromString -- case insensitive | Case sensitivity |
| isPermissionMode -- valid strings | true |
| isPermissionMode -- invalid strings | false |

---

## 18.4 `src/tools/shared/__tests__/gitOperationTracking.test.ts` -- Mock Analytics (+4 tests)

**Problem**: Analytics dependency not mocked, tests produce side effects
**Fix**: Add `mock.module("src/services/analytics/...", ...)`

New tests:

| Test Case | Verification |
|---------|--------|
| parseGitCommitId -- all GH PR actions | Cover all 6 actions |
| detectGitOperation -- no analytics call | Mock verification |
| detectGitCommitId -- various formats | SHA / short SHA / HEAD |
| git operation tracking -- edge cases | Empty input, malformed input |

---

## Exclusion List

The following modules are **excluded from testing** for justified reasons:

| Module | Lines | Exclusion Reason |
|------|------|---------|
| `query.ts` | 1732 | Core loop, 40+ dependencies, requires full integration environment |
| `QueryEngine.ts` | 1320 | Orchestrator, 30+ dependencies |
| `utils/hooks.ts` | 5121 | 51 exports, spawns child processes |
| `utils/config.ts` | 1817 | File system + lockfile + global state |
| `utils/auth.ts` | 2002 | Multi-provider authentication, platform-specific |
| `utils/fileHistory.ts` | 1115 | Heavy I/O file backup |
| `utils/sessionRestore.ts` | 551 | State restoration involves multiple subsystems |
| `utils/ripgrep.ts` | 679 | Spawns child processes |
| `utils/yaml.ts` | 15 | Two-line wrapper |
| `utils/lockfile.ts` | 43 | Trivial wrapper |
| `screens/` / `components/` | -- | Ink rendering test environment required |
| `bridge/` / `remote/` / `ssh/` | -- | Network layer |
| `daemon/` / `server/` | -- | Process management |

---

## Expected Outcomes

| Metric | After Phase 16 | After Phase 17 | After Phase 18 |
|------|-----------|-----------|-----------|
| Test count | ~1417 | ~1567 | ~1597 |
| File count | 76 | 87 | 91 |
| WEAK files | 6 | 4 | **0** |
