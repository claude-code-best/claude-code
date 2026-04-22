# Bug: cachedMicrocompact 缓存编辑实现存在 5 个问题

## 背景

分支 `chore/lint-cleanup` 将 `src/services/compact/cachedMicrocompact.ts` 从全 stub（no-op）改为真实实现。该模块负责 Cached Microcompact（缓存编辑）功能：在对话过程中，通过 API 的 `cache_edits` 机制删除旧的 tool result，避免重新发送完整 prompt 前缀，从而节省 token 和成本。

当前因问题 3 和问题 4 的阻断，这些 Bug 在运行时不会触发。但一旦启用 feature flag，问题 1 会立即暴露。

---

## 问题 1：`deletedRefs` 从未被填充（关键 Bug）

### 严重级别：CRITICAL

### 问题描述

`getToolResultsToDelete()` 返回待删除的 tool ID 列表，但**既不在函数内部，也不在调用方 `cachedMicrocompactPath()` 中**将这些 ID 添加到 `state.deletedRefs`。

### 涉及文件

| 文件 | 行号 | 角色 |
|------|------|------|
| `src/services/compact/cachedMicrocompact.ts` | 87-93 | `getToolResultsToDelete` — 返回待删除 ID，但不更新 `deletedRefs` |
| `src/services/compact/microCompact.ts` | 332-339 | `cachedMicrocompactPath` — 调用 `getToolResultsToDelete` 后不更新 `deletedRefs` |
| `src/services/compact/__tests__/cachedMicrocompact.test.ts` | 78-92 | 测试用例**手动**填充 `deletedRefs`，掩盖了生产代码中的缺失 |

### 当前代码

`cachedMicrocompact.ts:87-93`：
```typescript
export function getToolResultsToDelete(state: CachedMCState): string[] {
  const { triggerThreshold, keepRecent } = getCachedMCConfig()
  const active = state.toolOrder.filter(id => !state.deletedRefs.has(id))
  if (active.length <= triggerThreshold) return []
  const toDelete = active.slice(0, active.length - keepRecent)
  return toDelete
  // ← 缺失：没有将 toDelete 添加到 state.deletedRefs
}
```

`microCompact.ts:332-339`（调用方）：
```typescript
const toolsToDelete = mod.getToolResultsToDelete(state)
if (toolsToDelete.length > 0) {
  const cacheEdits = mod.createCacheEditsBlock(state, toolsToDelete)
  if (cacheEdits) {
    pendingCacheEdits = cacheEdits
  }
  // ← 缺失：没有将 toolsToDelete 标记为已删除
}
```

### 后果

1. **重复删除**：每次 API 调用都会重复返回相同的 tool ID 进行删除
2. **统计失真**：`activeToolCount` 计算为 `state.toolOrder.length - state.deletedRefs.size`，但 `deletedRefs.size` 永远为 0
3. **API 浪费**：重复的 `cache_edits` 请求增加请求体大小

### 测试文件如何掩盖此问题

`__tests__/cachedMicrocompact.test.ts:78-92`：
```typescript
test('already deleted tools are not suggested again', () => {
  // ... 注册 12 个 tool
  const first = getToolResultsToDelete(state)
  // 测试手动模拟删除——生产代码中没有等价操作
  for (const id of first) {
    state.deletedRefs.add(id)  // ← 只在测试中手动做了
  }
  const second = getToolResultsToDelete(state)
  // 验证不会重复建议——但前提是 deletedRefs 被正确填充
})
```

### 修复方案

**方案 A（推荐）：在 `getToolResultsToDelete` 内部标记**

`cachedMicrocompact.ts`：
```typescript
export function getToolResultsToDelete(state: CachedMCState): string[] {
  const { triggerThreshold, keepRecent } = getCachedMCConfig()
  const active = state.toolOrder.filter(id => !state.deletedRefs.has(id))
  if (active.length <= triggerThreshold) return []
  const toDelete = active.slice(0, active.length - keepRecent)
  // 标记为已删除，防止下次重复返回
  for (const id of toDelete) {
    state.deletedRefs.add(id)
  }
  return toDelete
}
```

**方案 B：在调用方标记**

`microCompact.ts` 的 `cachedMicrocompactPath` 中：
```typescript
const toolsToDelete = mod.getToolResultsToDelete(state)
if (toolsToDelete.length > 0) {
  // 标记已删除
  for (const id of toolsToDelete) {
    state.deletedRefs.add(id)
  }
  const cacheEdits = mod.createCacheEditsBlock(state, toolsToDelete)
  // ...
}
```

**推荐方案 A**：将副作用收敛在模块内部，调用方不需要关心内部状态管理。

### 测试修复

现有测试的手动 `deletedRefs.add` 应该被删除，改为验证 `getToolResultsToDelete` 自动填充：

```typescript
test('already deleted tools are not suggested again', () => {
  for (let i = 0; i < 12; i++) {
    registerToolResult(state, `tool-${i}`)
  }
  const first = getToolResultsToDelete(state)
  // 不需要手动 add — getToolResultsToDelete 应该已经标记了
  expect(first.length).toBeGreaterThan(0)
  for (const id of first) {
    expect(state.deletedRefs.has(id)).toBe(true)
  }
  const second = getToolResultsToDelete(state)
  for (const id of first) {
    expect(second).not.toContain(id)
  }
})
```

---

## 问题 2：两个同名 `getCachedMCConfig` 导出，签名冲突

### 严重级别：MEDIUM

### 问题描述

两个不同文件导出同名函数 `getCachedMCConfig`，但类型签名和用途完全不同：

| 文件 | 返回类型 | 用途 | 调用方 |
|------|----------|------|--------|
| `cachedMCConfig.ts`（stub） | `{ enabled?, systemPromptSuggestSummaries?, supportedModels?, [key: string]: unknown }` → `{}` | 系统 prompt 配置 | `prompts.ts:70` |
| `cachedMicrocompact.ts`（新实现） | `{ triggerThreshold: 10, keepRecent: 5 }` | 微压缩阈值配置 | `claude.ts:1212`、`microCompact.ts:311` |

### 后果

1. **命名混淆**：同一个名字在不同上下文意味完全不同的东西
2. **`claude.ts:1226` 读取不存在的字段**：
   ```typescript
   const config = getCachedMCConfig()  // 从 cachedMicrocompact.ts 导入
   logForDebugging(
     `... supportedModels=${jsonStringify((config as Record<string, unknown>).supportedModels)}`
     //                                   ^^^^^^^^^^^^^^^^ 新实现中不存在此字段，永远输出 undefined
   )
   ```

### 修复方案

将 `cachedMicrocompact.ts` 中的函数重命名为 `getCachedMicrocompactConfig`，或将 `cachedMCConfig.ts` 的重命名为 `getCachedMCFeatureConfig`，消除歧义。同步更新所有调用方。

---

## 问题 3：`CACHE_EDITING_BETA_HEADER` 为空字符串——当前分支已修复（三层防御）

### 严重级别：~~HIGH~~ → **已修复（INFO）**

### 原始问题

`src/constants/betas.ts:50`：
```typescript
export const CACHE_EDITING_BETA_HEADER: string = '';
```

上游（origin/main）的代码中，`cacheEditingHeaderLatched` 为 `true` 时会无条件 push 空字符串到 betas 数组，导致 API 请求中出现无效的 `anthropic-beta` header（如 `"a,b,"` 或 `"a,,b"`），触发 API 400 错误。

### 当前分支的三层修复

当前分支已包含完整的三层防御，通过 `git diff origin/main HEAD -- src/services/api/claude.ts` 可以确认：

**第 1 层：`cachedMCEnabled` 入口增加 `headerAvailable` 检查**

`claude.ts:1218-1223`（本分支新增）：
```typescript
// cachedMC requires a non-empty beta header; the CACHE_EDITING_BETA_HEADER
// constant is '' in this fork (upstream hasn't published the real value).
// Without it, cache_reference and cache_edits in the request body cause
// API 400: "tool_result.cache_reference: Extra inputs are not permitted".
const headerAvailable = !!cacheEditingBetaHeader
cachedMCEnabled = featureEnabled && modelSupported && headerAvailable
```

上游原始代码为：`cachedMCEnabled = featureEnabled && modelSupported`（无 header 检查）。

**第 2 层：latch push 增加 truthy 检查**

`claude.ts:1731-1732`（本分支新增 `cacheEditingBetaHeader &&`）：
```typescript
if (
  cacheEditingHeaderLatched &&
  cacheEditingBetaHeader &&  // ← 本分支新增：空字符串不 push
  getAPIProvider() === 'firstParty' &&
  options.querySource === 'repl_main_thread' &&
  !betasParams.includes(cacheEditingBetaHeader)
) {
  betasParams.push(cacheEditingBetaHeader)
}
```

上游原始代码缺少 `cacheEditingBetaHeader &&` 这行，导致 latch 生效时空字符串被 push。

**第 3 层：最终过滤（兜底防御）**

`claude.ts:1749-1753`（本分支新增）：
```typescript
// Filter out any empty-string beta headers before sending.
// Constants like CACHE_EDITING_BETA_HEADER or AFK_MODE_BETA_HEADER
// can be '' when their feature gate is off; an empty string in the
// betas array produces an invalid anthropic-beta header (400 error).
const filteredBetas = betasParams.filter(Boolean)
lastRequestBetas = filteredBetas
```

上游原始代码直接 `lastRequestBetas = betasParams`，无过滤。

### 测试覆盖

`src/services/api/__tests__/betaHeaders.test.ts` 包含完整的验证：

| 测试 | 验证点 |
|------|--------|
| `known potentially-empty constants are identified` | 确认 `CACHE_EDITING_BETA_HEADER === ''`，Boolean 检查为 false |
| `truthy check correctly gates empty beta headers` | 模拟 truthy 检查阻止空 header push |
| `simulates full header pipeline with all fixes` | 模拟三层防御完整管道，验证空 header 不泄漏 |
| `simulates the bug scenario WITHOUT fix` | 重现修复前 bug：空字符串被 push → `toString()` 产生无效逗号 |
| `useBetas flag correctly handles empty-after-filter` | 验证全部 betas 为空时 filter 后不发送 |

### 当前状态

**此问题已完全修复，无需额外操作。** 当 Anthropic 公开 cache editing 的 beta header 值后，只需更新 `betas.ts:50` 的常量值即可，三层防御逻辑无需改动。

---

## 问题 4：Feature Flag 未注册（当前为死代码）

### 严重级别：INFO

### 问题描述

`CACHED_MICROCOMPACT` 不在 `build.ts` 或 `scripts/defines.ts` 的 feature 列表中。

当前 build 默认 features（19 个）：
```
BUDDY, TRANSCRIPT_CLASSIFIER, BRIDGE_MODE, AGENT_TRIGGERS_REMOTE,
CHICAGO_MCP, VOICE_MODE, SHOT_STATS, PROMPT_CACHE_BREAK_DETECTION,
TOKEN_BUDGET, AGENT_TRIGGERS, ULTRATHINK, BUILTIN_EXPLORE_PLAN_AGENTS,
LODESTONE, EXTRACT_MEMORIES, VERIFICATION_AGENT, KAIROS_BRIEF,
AWAY_SUMMARY, ULTRAPLAN, DAEMON
```

`CACHED_MICROCOMPACT` 不在其中。`feature('CACHED_MICROCOMPACT')` 在构建和 dev 模式下都返回 `false`。

### 后果

`cachedMicrocompact.ts` 的所有真实实现是不可达代码。`cachedMicrocompactPath` 永远不会被执行。

### 修复方案

这是设计选择而非 Bug。当问题 1 和问题 3 修复后，可以将 `CACHED_MICROCOMPACT` 添加到 build defines 的 P1 或 P2 列表中启用。

---

## 问题 5：`isModelSupportedForCacheEditing` 正则过于宽泛

### 严重级别：LOW

### 问题描述

`cachedMicrocompact.ts:34`：
```typescript
export function isModelSupportedForCacheEditing(model: string): boolean {
  return /claude-[a-z]+-4[-\d]/.test(model)
}
```

该正则匹配任何 Claude 4.x 模型，包括 `claude-haiku-4-5`。但 cache editing 是 API 层面的特殊功能，可能只有 Opus/Sonnet 支持，Haiku 未必支持。

### 后果

如果 Haiku 不支持 cache editing，在 Haiku 模型下启用此功能会导致 API 错误。

### 修复方案

根据 API 文档精确限定支持的模型：
```typescript
export function isModelSupportedForCacheEditing(model: string): boolean {
  return /claude-(opus|sonnet)-4[-\d]/.test(model)
}
```

或者在上游明确支持的模型列表可用后，改为白名单匹配。

---

## 修复优先级

| 优先级 | 问题 | 状态 | 原因 |
|--------|------|------|------|
| P0 | 问题 1：`deletedRefs` 未填充 | **待修复** | 启用后立即导致重复删除的逻辑 Bug |
| ~~P1~~ | ~~问题 3：beta header 为空~~ | **已修复** ✓ | 当前分支已包含三层防御 + 测试覆盖 |
| P2 | 问题 2：同名函数冲突 | **待修复** | 增加维护混淆风险 |
| P3 | 问题 4：feature flag 未注册 | **设计选择** | 问题 1 修复后可按需启用 |
| P3 | 问题 5：正则过宽 | **待确认** | 低风险，待 API 文档确认 |

## 验证步骤

### 问题 1 修复后验证

```bash
# 运行现有测试（应该在修复 getToolResultsToDelete 后仍然通过）
bun test src/services/compact/__tests__/cachedMicrocompact.test.ts

# 新增测试验证：getToolResultsToDelete 自动填充 deletedRefs
# 1. 注册 12 个 tool
# 2. 调用 getToolResultsToDelete → 返回 7 个
# 3. 验证 state.deletedRefs.size === 7
# 4. 再次调用 getToolResultsToDelete → 返回 0（因为 active 只剩 5 个，低于阈值 10）
```

### 问题 3 修复后验证

```bash
# 设置环境变量启用缓存编辑
FEATURE_CACHED_MICROCOMPACT=1 CLAUDE_CACHED_MICROCOMPACT=1 bun run dev

# 观察 debug 日志中的 Cached MC gate 输出
# 确认 headerAvailable=true（需要 beta header 有值）
# 确认 cachedMCEnabled=true
```

### 全流程验证

```bash
# 完整测试
bun test src/services/compact/__tests__/cachedMicrocompact.test.ts
bun run typecheck
bun run test:all
```
