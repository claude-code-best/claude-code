# Plan 12 — Mock 可靠性修复

> 优先级：高 | 影响 4 个测试文件 | 预估修改 ~15 处

本计划修复测试中 mock 相关的副作用、状态泄漏和虚假测试。

---

## 12.1 `gitOperationTracking.test.ts` — 消除分析副作用

**当前问题**：`detectGitOperation` 内部调用 `logEvent()`、`getCommitCounter().increment()`、`getPrCounter().increment()`，每次测试运行都触发真实分析代码。

**修复步骤**：

1. 读取 `src/tools/shared/gitOperationTracking.ts`，确认 analytics 导入路径
2. 在测试文件顶部添加 `mock.module`：

```typescript
import { mock } from "bun:test";

mock.module("src/services/analytics/index.ts", () => ({
  logEvent: mock(() => {}),
  // 按需补充其他导出
}));
```

3. 如果 `getCommitCounter` / `getPrCounter` 来自 `src/bootstrap/state.ts`：

```typescript
mock.module("src/bootstrap/state.ts", () => ({
  getCommitCounter: mock(() => ({ increment: mock(() => {}) })),
  getPrCounter: mock(() => ({ increment: mock(() => {}) })),
  // 保留其他被测函数实际需要的导出
}));
```

4. 使用 `await import()` 模式加载被测模块
5. 运行测试验证无副作用

**风险**：`mock.module` 会替换整个模块。如果 `detectGitOperation` 还需要其他来自这些模块的导出，需在 mock 工厂中提供。

---

## 12.2 `PermissionMode.test.ts` — 修复 `isExternalPermissionMode` 虚假测试

**当前问题**：`isExternalPermissionMode` 依赖 `process.env.USER_TYPE`。非 ant 环境下所有 mode 都返回 true，测试从未覆盖 false 分支。

**修复步骤**：

1. 新增 ant 环境测试组（见 Plan 10.3 详细用例）
2. 使用 `beforeEach`/`afterEach` 管理 `process.env.USER_TYPE`

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

3. 验证新增测试确实执行 false 路径

---

## 12.3 `providers.test.ts` — 环境变量快照恢复

**当前问题**：
- `originalEnv` 声明后未使用
- `afterEach` 仅删除已知 3 个 key，如果源码新增 env var，测试间状态泄漏

**修复步骤**：

```typescript
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of Object.keys(process.env)) {
    savedEnv[key] = process.env[key];
  }
});

afterEach(() => {
  // 删除所有当前 env，恢复快照
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

> 简化方案：只保存/恢复相关 key 列表 `["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY", "ANTHROPIC_BASE_URL", "USER_TYPE"]`，但需注释说明新增 env var 时需同步更新。

---

## 12.4 `envUtils.test.ts` — 验证环境变量恢复完整性

**当前状态**：已有 `afterEach` 恢复。需审查：

1. 确认所有 `describe` 块中的 `afterEach` 都完整恢复了修改的 env var
2. 确认 `process.argv` 修改也被恢复（`getClaudeConfigHomeDir` 测试修改了 argv）
3. 新增：`afterEach` 中断言无意外 env 泄漏（可选，CI-only）

---

## 12.5 `sleep.test.ts` / `memoize.test.ts` — 时间敏感测试加固

**当前状态**：已有合理 margin。可选加固：

| 文件 | 用例 | 当前 | 加固 |
|------|------|------|------|
| `sleep.test.ts` | `resolves after timeout` | `sleep(50)`, check `>= 40ms` | 增大 margin：`sleep(50)`, check `>= 30ms` |
| `memoize.test.ts` | stale serve & refresh | TTL=1ms, wait 10ms | 增大 margin：TTL=5ms, wait 50ms |

> 仅在 CI 出现 flaky 时执行此加固。

---

## 验收标准

- [ ] `gitOperationTracking.test.ts` 无分析副作用（可通过在 mock 中增加 `expect(logEvent).toHaveBeenCalledTimes(N)` 验证）
- [ ] `PermissionMode.test.ts` 的 `isExternalPermissionMode` 覆盖 true + false 分支
- [ ] `providers.test.ts` 的 `originalEnv` 死代码已删除
- [ ] 所有修改 env 的测试文件恢复完整
- [ ] `bun test` 全部通过
