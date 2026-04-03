# Plan 10 — Fix WEAK-Rated Test Files

> Priority: High | 8 files | Estimated ~60 new/modified test cases

This plan fixes assertion defects and coverage gaps in the 8 test files rated as WEAK in testing-spec.md.

---

## 10.1 `src/utils/__tests__/format.test.ts`

**Issue**: `formatNumber`, `formatTokens`, `formatRelativeTime` use `toContain` instead of exact matching, unable to detect formatting regressions.

### Modification Checklist

#### formatNumber — toContain → toBe

```typescript
// Current (weak)
expect(formatNumber(1321)).toContain("k");
expect(formatNumber(1500000)).toContain("m");

// Fix to
expect(formatNumber(1321)).toBe("1.3k");
expect(formatNumber(1500000)).toBe("1.5m");
```

> Note: `Intl.NumberFormat` output may vary by locale. If CI locale is inconsistent, use regex matching instead: `toMatch(/^\d+(\.\d)?[km]$/)`.

#### formatTokens — Add exact assertions

```typescript
expect(formatTokens(1000)).toBe("1k");
expect(formatTokens(1500)).toBe("1.5k");
```

#### formatRelativeTime — toContain → toBe

```typescript
// Current (weak)
expect(formatRelativeTime(diff, now)).toContain("30");
expect(formatRelativeTime(diff, now)).toContain("ago");

// Fix to
expect(formatRelativeTime(diff, now)).toBe("30s ago");
```

#### New: formatDuration rounding boundary

| Case | Input | Expected |
|------|-------|----------|
| 59.5s rounding | 59500ms | Contains at least `1m` |
| 59m59s rounding | 3599000ms | Contains at least `1h` |
| sub-millisecond | 0.5ms | `"<1ms"` or `"0ms"` |

#### New: Untested functions

| Function | Minimum cases |
|----------|--------------|
| `formatRelativeTimeAgo` | 2 (past / future) |
| `formatLogMetadata` | 1 (basic call does not throw) |
| `formatResetTime` | 2 (with value / null) |
| `formatResetText` | 1 (basic call) |

---

## 10.2 `src/tools/shared/__tests__/gitOperationTracking.test.ts`

**Issue**: `detectGitOperation` internally calls `getCommitCounter()`, `getPrCounter()`, `logEvent()`, causing analytics side effects in tests.

### Modification Checklist

#### Add analytics mock

Add `mock.module` at the top of the file:

```typescript
import { mock, afterAll, afterEach, beforeEach } from "bun:test";

mock.module("src/services/analytics/index.ts", () => ({
  logEvent: mock(() => {}),
}));

mock.module("src/bootstrap/state.ts", () => ({
  getCommitCounter: mock(() => ({ increment: mock(() => {}) })),
  getPrCounter: mock(() => ({ increment: mock(() => {}) })),
}));
```

> Verify the actual import paths used by `detectGitOperation` and adjust mock targets as needed.

#### New: Missing GH PR actions

| Case | Input | Expected |
|------|-------|----------|
| gh pr edit | `'gh pr edit 123 --title "fix"'` | `result.pr.number === 123` |
| gh pr close | `'gh pr close 456'` | `result.pr.number === 456` |
| gh pr ready | `'gh pr ready 789'` | `result.pr.number === 789` |
| gh pr comment | `'gh pr comment 123 --body "done"'` | `result.pr.number === 123` |

#### New: parseGitCommitId edge cases

| Case | Input | Expected |
|------|-------|----------|
| Full 40-char SHA | `'[abcdef0123456789abcdef0123456789abcdef01] ...'` | Returns full 40 characters |
| Malformed bracket output | `'create mode 100644 file.txt'` | Returns `null` |

---

## 10.3 `src/utils/permissions/__tests__/PermissionMode.test.ts`

**Issue**: `isExternalPermissionMode` always returns true in non-ant environments, so the false path is never exercised; mode coverage is incomplete.

### Modification Checklist

#### Complete mode coverage

| Function | Missing modes |
|----------|--------------|
| `permissionModeTitle` | `bypassPermissions`, `dontAsk` |
| `permissionModeShortTitle` | `dontAsk`, `acceptEdits` |
| `getModeColor` | `dontAsk`, `acceptEdits`, `plan` |
| `permissionModeFromString` | `acceptEdits`, `bypassPermissions` |
| `toExternalPermissionMode` | `acceptEdits`, `bypassPermissions` |

#### Fix isExternalPermissionMode

```typescript
// Current: only tests non-ant environment (always true)
// Need to add ant environment tests
describe("when USER_TYPE is 'ant'", () => {
  beforeEach(() => {
    process.env.USER_TYPE = "ant";
  });
  afterEach(() => {
    delete process.env.USER_TYPE;
  });

  test("returns false for 'auto' in ant context", () => {
    expect(isExternalPermissionMode("auto")).toBe(false);
  });

  test("returns false for 'bubble' in ant context", () => {
    expect(isExternalPermissionMode("bubble")).toBe(false);
  });

  test("returns true for non-ant modes in ant context", () => {
    expect(isExternalPermissionMode("plan")).toBe(true);
  });
});
```

#### New: permissionModeSchema

| Case | Input | Expected |
|------|-------|----------|
| Valid mode | `'plan'` | `success: true` |
| Invalid mode | `'invalid'` | `success: false` |

---

## 10.4 `src/utils/permissions/__tests__/dangerousPatterns.test.ts`

**Issue**: Pure data smoke test with no behavioral validation.

### Modification Checklist

#### New: Duplicate value check

```typescript
test("CROSS_PLATFORM_CODE_EXEC has no duplicates", () => {
  const set = new Set(CROSS_PLATFORM_CODE_EXEC);
  expect(set.size).toBe(CROSS_PLATFORM_CODE_EXEC.length);
});

test("DANGEROUS_BASH_PATTERNS has no duplicates", () => {
  const set = new Set(DANGEROUS_BASH_PATTERNS);
  expect(set.size).toBe(DANGEROUS_BASH_PATTERNS.length);
});
```

#### New: Full member assertion (using Set for exactness)

```typescript
test("CROSS_PLATFORM_CODE_EXEC contains expected interpreters", () => {
  const expected = ["node", "python", "python3", "ruby", "perl", "php",
    "bun", "deno", "npx", "tsx"];
  const set = new Set(CROSS_PLATFORM_CODE_EXEC);
  for (const entry of expected) {
    expect(set.has(entry)).toBe(true);
  }
});
```

#### New: Empty string does not match

```typescript
test("empty string does not match any pattern", () => {
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    expect("".startsWith(pattern)).toBe(false);
  }
});
```

---

## 10.5 `src/utils/__tests__/zodToJsonSchema.test.ts`

**Issue**: Object properties only use `toBeDefined` without verifying type structure; optional field absence is not validated.

### Modification Checklist

#### Fix object schema test

```typescript
// Current (weak)
expect(schema.properties!.name).toBeDefined();
expect(schema.properties!.age).toBeDefined();

// Fix to
expect(schema.properties!.name).toEqual({ type: "string" });
expect(schema.properties!.age).toEqual({ type: "number" });
```

#### Fix optional field test

```typescript
test("optional field is not in required array", () => {
  const schema = zodToJsonSchema(z.object({
    required: z.string(),
    optional: z.string().optional(),
  }));
  expect(schema.required).toEqual(["required"]);
  expect(schema.required).not.toContain("optional");
});
```

#### New: Missing schema types

| Case | Input | Expected |
|------|-------|----------|
| `z.literal("foo")` | `z.literal("foo")` | `{ const: "foo" }` |
| `z.null()` | `z.null()` | `{ type: "null" }` |
| `z.union()` | `z.union([z.string(), z.number()])` | `{ anyOf: [...] }` |
| `z.record()` | `z.record(z.string(), z.number())` | `{ type: "object", additionalProperties: { type: "number" } }` |
| `z.tuple()` | `z.tuple([z.string(), z.number()])` | `{ type: "array", items: [...], additionalItems: false }` |
| Nested object | `z.object({ a: z.object({ b: z.string() }) })` | Verify nested property structure |

---

## 10.6 `src/utils/__tests__/envValidation.test.ts`

**Issue**: `validateBoundedIntEnvVar` with lower bound=100 returns `status: "valid"` for value=1, suspected source code bug.

### Modification Checklist

#### Verify lower bound behavior

```typescript
// Current test
test("value of 1 with lower bound 100", () => {
  const result = validateBoundedIntEnvVar("1", { defaultValue: 100, upperLimit: 1000, lowerLimit: 100 });
  // If there is a source bug, this should expose it
  expect(result.effective).toBeGreaterThanOrEqual(100);
  expect(result.status).toBe(result.effective !== 100 ? "capped" : "valid");
});
```

#### New: Boundary cases

| Case | value | lowerLimit | Expected |
|------|-------|------------|----------|
| Below lower bound | `"50"` | 100 | `effective: 100, status: "capped"` |
| Equal to lower bound | `"100"` | 100 | `effective: 100, status: "valid"` |
| Float truncation | `"50.7"` | 100 | `effective: 100` (parseInt truncates then caps) |
| Whitespace | `" 500 "` | 1 | `effective: 500, status: "valid"` |
| defaultValue is 0 | `"0"` | 0 | Need to confirm `parsed <= 0` logic |

> **Action**: First confirm the actual execution path for lower bound in `validateBoundedIntEnvVar` source code. If it truly does not take effect, fix the source first then add tests.

---

## 10.7 `src/utils/__tests__/file.test.ts`

**Issue**: `addLineNumbers` uses only `toContain`, without verifying the complete format.

### Modification Checklist

#### Fix addLineNumbers assertion

```typescript
// Current (weak)
expect(result).toContain("1");
expect(result).toContain("hello");

// Fix to (need to determine isCompactLinePrefixEnabled behavior)
// Assuming compact=false, format is "     1→hello"
test("formats single line with tab prefix", () => {
  // Check environment first; if compact mode is uncertain, use regex
  expect(result).toMatch(/^\s*\d+[→\t]hello$/m);
});
```

#### New: stripLineNumberPrefix edge cases

| Case | Input | Expected |
|------|-------|----------|
| Digits only | `"123"` | `""` |
| Empty content with prefix | `"→"` | `""` |
| Compact format `"1\thello"` | `"1\thello"` | `"hello"` |

#### New: pathsEqual edge cases

| Case | a | b | Expected |
|------|---|---|----------|
| Trailing slash difference | `"/a/b"` | `"/a/b/"` | `false` |
| `..` segments | `"/a/../b"` | `"/b"` | Depends on implementation |

---

## 10.8 `src/utils/__tests__/notebook.test.ts`

**Issue**: `mapNotebookCellsToToolResult` content checks use `toContain` without verifying XML format.

### Modification Checklist

#### Fix content assertion

```typescript
// Current (weak)
expect(result).toContain("cell-0");
expect(result).toContain("print('hello')");

// Fix to
expect(result).toContain('<cell id="cell-0">');
expect(result).toContain("</cell>");
```

#### New: parseCellId edge cases

| Case | Input | Expected |
|------|-------|----------|
| Negative number | `"cell--1"` | `null` |
| Leading zeros | `"cell-007"` | `7` |
| Very large number | `"cell-999999999"` | `999999999` |

#### New: mapNotebookCellsToToolResult edge cases

| Case | Input | Expected |
|------|-------|----------|
| Empty data array | `{ cells: [] }` | Empty string or empty result |
| No cell_id | `{ cell_type: "code", source: "x" }` | Falls back to `cell-${index}` |
| Error output | `{ output_type: "error", ename: "Error", evalue: "msg" }` | Contains error information |

---

## Acceptance Criteria

- [ ] `bun test` all passing
- [ ] All 8 files upgraded from WEAK to ACCEPTABLE or GOOD
- [ ] `toContain` is only used for warning text and other cases where exact values are genuinely uncertain
- [ ] envValidation bug confirmed and fixed (or confirmed as not a bug with tests updated accordingly)
