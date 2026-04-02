# Plan 10 — 修复 WEAK 评分测试文件

> 优先级：高 | 8 个文件 | 预估新增/修改 ~60 个测试用例

本计划修复 testing-spec.md 中评定为 WEAK 的 8 个测试文件的断言缺陷和覆盖缺口。

---

## 10.1 `src/utils/__tests__/format.test.ts`

**问题**：`formatNumber`、`formatTokens`、`formatRelativeTime` 使用 `toContain` 代替精确匹配，无法检测格式回归。

### 修改清单

#### formatNumber — toContain → toBe

```typescript
// 当前（弱）
expect(formatNumber(1321)).toContain("k");
expect(formatNumber(1500000)).toContain("m");

// 修复为
expect(formatNumber(1321)).toBe("1.3k");
expect(formatNumber(1500000)).toBe("1.5m");
```

> 注意：`Intl.NumberFormat` 输出可能因 locale 不同。若 CI locale 不一致，改用 `toMatch(/^\d+(\.\d)?[km]$/)` 正则匹配。

#### formatTokens — 补精确断言

```typescript
expect(formatTokens(1000)).toBe("1k");
expect(formatTokens(1500)).toBe("1.5k");
```

#### formatRelativeTime — toContain → toBe

```typescript
// 当前（弱）
expect(formatRelativeTime(diff, now)).toContain("30");
expect(formatRelativeTime(diff, now)).toContain("ago");

// 修复为
expect(formatRelativeTime(diff, now)).toBe("30s ago");
```

#### 新增：formatDuration 进位边界

| 用例 | 输入 | 期望 |
|------|------|------|
| 59.5s 进位 | 59500ms | 至少含 `1m` |
| 59m59s 进位 | 3599000ms | 至少含 `1h` |
| sub-millisecond | 0.5ms | `"<1ms"` 或 `"0ms"` |

#### 新增：未测试函数

| 函数 | 最少用例 |
|------|---------|
| `formatRelativeTimeAgo` | 2（过去 / 未来） |
| `formatLogMetadata` | 1（基本调用不抛错） |
| `formatResetTime` | 2（有值 / null） |
| `formatResetText` | 1（基本调用） |

---

## 10.2 `src/tools/shared/__tests__/gitOperationTracking.test.ts`

**问题**：`detectGitOperation` 内部调用 `getCommitCounter()`、`getPrCounter()`、`logEvent()`，测试产生分析副作用。

### 修改清单

#### 添加 analytics mock

在文件顶部添加 `mock.module`：

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

> 需验证 `detectGitOperation` 的实际导入路径，按需调整 mock 目标。

#### 新增：缺失的 GH PR actions

| 用例 | 输入 | 期望 |
|------|------|------|
| gh pr edit | `'gh pr edit 123 --title "fix"'` | `result.pr.number === 123` |
| gh pr close | `'gh pr close 456'` | `result.pr.number === 456` |
| gh pr ready | `'gh pr ready 789'` | `result.pr.number === 789` |
| gh pr comment | `'gh pr comment 123 --body "done"'` | `result.pr.number === 123` |

#### 新增：parseGitCommitId 边界

| 用例 | 输入 | 期望 |
|------|------|------|
| 完整 40 字符 SHA | `'[abcdef0123456789abcdef0123456789abcdef01] ...'` | 返回完整 40 字符 |
| 畸形括号输出 | `'create mode 100644 file.txt'` | 返回 `null` |

---

## 10.3 `src/utils/permissions/__tests__/PermissionMode.test.ts`

**问题**：`isExternalPermissionMode` 在非 ant 环境永远返回 true，false 路径从未执行；mode 覆盖不完整。

### 修改清单

#### 补全 mode 覆盖

| 函数 | 缺失的 mode |
|------|-------------|
| `permissionModeTitle` | `bypassPermissions`, `dontAsk` |
| `permissionModeShortTitle` | `dontAsk`, `acceptEdits` |
| `getModeColor` | `dontAsk`, `acceptEdits`, `plan` |
| `permissionModeFromString` | `acceptEdits`, `bypassPermissions` |
| `toExternalPermissionMode` | `acceptEdits`, `bypassPermissions` |

#### 修复 isExternalPermissionMode

```typescript
// 当前：只测了非 ant 环境（永远 true）
// 需要新增 ant 环境测试
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

#### 新增：permissionModeSchema

| 用例 | 输入 | 期望 |
|------|------|------|
| 有效 mode | `'plan'` | `success: true` |
| 无效 mode | `'invalid'` | `success: false` |

---

## 10.4 `src/utils/permissions/__tests__/dangerousPatterns.test.ts`

**问题**：纯数据 smoke test，无行为验证。

### 修改清单

#### 新增：重复值检查

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

#### 新增：全量成员断言（用 Set 确保精确）

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

#### 新增：空字符串不匹配

```typescript
test("empty string does not match any pattern", () => {
  for (const pattern of DANGEROUS_BASH_PATTERNS) {
    expect("".startsWith(pattern)).toBe(false);
  }
});
```

---

## 10.5 `src/utils/__tests__/zodToJsonSchema.test.ts`

**问题**：object 属性仅 `toBeDefined` 未验证类型结构；optional 字段未验证 absence。

### 修改清单

#### 修复 object schema 测试

```typescript
// 当前（弱）
expect(schema.properties!.name).toBeDefined();
expect(schema.properties!.age).toBeDefined();

// 修复为
expect(schema.properties!.name).toEqual({ type: "string" });
expect(schema.properties!.age).toEqual({ type: "number" });
```

#### 修复 optional 字段测试

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

#### 新增：缺失的 schema 类型

| 用例 | 输入 | 期望 |
|------|------|------|
| `z.literal("foo")` | `z.literal("foo")` | `{ const: "foo" }` |
| `z.null()` | `z.null()` | `{ type: "null" }` |
| `z.union()` | `z.union([z.string(), z.number()])` | `{ anyOf: [...] }` |
| `z.record()` | `z.record(z.string(), z.number())` | `{ type: "object", additionalProperties: { type: "number" } }` |
| `z.tuple()` | `z.tuple([z.string(), z.number()])` | `{ type: "array", items: [...], additionalItems: false }` |
| 嵌套 object | `z.object({ a: z.object({ b: z.string() }) })` | 验证嵌套属性结构 |

---

## 10.6 `src/utils/__tests__/envValidation.test.ts`

**问题**：`validateBoundedIntEnvVar` lower bound=100 时 value=1 返回 `status: "valid"`，疑似源码 bug。

### 修改清单

#### 验证 lower bound 行为

```typescript
// 当前测试
test("value of 1 with lower bound 100", () => {
  const result = validateBoundedIntEnvVar("1", { defaultValue: 100, upperLimit: 1000, lowerLimit: 100 });
  // 如果源码有 bug，这里应该暴露
  expect(result.effective).toBeGreaterThanOrEqual(100);
  expect(result.status).toBe(result.effective !== 100 ? "capped" : "valid");
});
```

#### 新增边界用例

| 用例 | value | lowerLimit | 期望 |
|------|-------|------------|------|
| 低于 lower bound | `"50"` | 100 | `effective: 100, status: "capped"` |
| 等于 lower bound | `"100"` | 100 | `effective: 100, status: "valid"` |
| 浮点截断 | `"50.7"` | 100 | `effective: 100`（parseInt 截断后 cap） |
| 空白字符 | `" 500 "` | 1 | `effective: 500, status: "valid"` |
| defaultValue 为 0 | `"0"` | 0 | 需确认 `parsed <= 0` 逻辑 |

> **行动**：先确认 `validateBoundedIntEnvVar` 源码中 lower bound 的实际执行路径。如果确实不生效，需先修源码再补测试。

---

## 10.7 `src/utils/__tests__/file.test.ts`

**问题**：`addLineNumbers` 仅 `toContain`，未验证完整格式。

### 修改清单

#### 修复 addLineNumbers 断言

```typescript
// 当前（弱）
expect(result).toContain("1");
expect(result).toContain("hello");

// 修复为（需确定 isCompactLinePrefixEnabled 行为）
// 假设 compact=false，格式为 "     1→hello"
test("formats single line with tab prefix", () => {
  // 先确认环境，如果 compact 模式不确定，用正则
  expect(result).toMatch(/^\s*\d+[→\t]hello$/m);
});
```

#### 新增：stripLineNumberPrefix 边界

| 用例 | 输入 | 期望 |
|------|------|------|
| 纯数字行 | `"123"` | `""` |
| 无内容前缀 | `"→"` | `""` |
| compact 格式 `"1\thello"` | `"1\thello"` | `"hello"` |

#### 新增：pathsEqual 边界

| 用例 | a | b | 期望 |
|------|---|---|------|
| 尾部斜杠差异 | `"/a/b"` | `"/a/b/"` | `false` |
| `..` 段 | `"/a/../b"` | `"/b"` | 视实现而定 |

---

## 10.8 `src/utils/__tests__/notebook.test.ts`

**问题**：`mapNotebookCellsToToolResult` 内容检查用 `toContain`，未验证 XML 格式。

### 修改清单

#### 修复 content 断言

```typescript
// 当前（弱）
expect(result).toContain("cell-0");
expect(result).toContain("print('hello')");

// 修复为
expect(result).toContain('<cell id="cell-0">');
expect(result).toContain("</cell>");
```

#### 新增：parseCellId 边界

| 用例 | 输入 | 期望 |
|------|------|------|
| 负数 | `"cell--1"` | `null` |
| 前导零 | `"cell-007"` | `7` |
| 极大数 | `"cell-999999999"` | `999999999` |

#### 新增：mapNotebookCellsToToolResult 边界

| 用例 | 输入 | 期望 |
|------|------|------|
| 空 data 数组 | `{ cells: [] }` | 空字符串或空结果 |
| 无 cell_id | `{ cell_type: "code", source: "x" }` | fallback 到 `cell-${index}` |
| error output | `{ output_type: "error", ename: "Error", evalue: "msg" }` | 包含 error 信息 |

---

## 验收标准

- [ ] `bun test` 全部通过
- [ ] 8 个文件评分从 WEAK 提升至 ACCEPTABLE 或 GOOD
- [ ] `toContain` 仅用于警告文本等确实不确定精确值的场景
- [ ] envValidation bug 确认并修复（或确认非 bug 并更新测试）
