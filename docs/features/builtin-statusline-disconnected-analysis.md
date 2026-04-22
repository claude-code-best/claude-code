# BuiltinStatusLine 断连分析报告

## 概述

内置额度状态行组件 `BuiltinStatusLine` 在当前分支 `chore/lint-cleanup` 上不显示。该组件能够直接在终端底部渲染模型名称、Context 用量百分比、速率限制 bucket 进度条、余额（Balance）和累计花费（Cost），无需任何外部脚本配置。

当前状态：**组件已升级到新的 `providerUsage` 类型系统，但未被接入渲染树，处于孤岛状态。**

---

## 时间线

### 1. PR #89 (commit `913702d9`) — 功能正常

- 创建 `BuiltinStatusLine.tsx` 组件
- `StatusLine.tsx` 中 `import { BuiltinStatusLine }` 并在 `StatusLineInner` 中直接渲染 `<BuiltinStatusLine />`
- `statusLineShouldDisplay()` 返回 `return true`（无条件显示）
- 文件数：仅修改 `BuiltinStatusLine.tsx` + `StatusLine.tsx`

### 2. commit `5b1a52b8`（"更新大量 tsx 原始文件"）— 上游覆盖

- 合入上游 Anthropic 官方代码，`StatusLine.tsx` 被完整替换为外部命令版本
- `import { BuiltinStatusLine }` 被移除
- `statusLineShouldDisplay()` 变为 `return settings?.statusLine !== undefined`
- `StatusLineInner` 变为调用 `executeStatusLineCommand()` 的外部脚本执行逻辑
- `BuiltinStatusLine.tsx` 文件保留，但无人引用

### 3. commit `7b9287b1`（当前分支 `chore/lint-cleanup`）— 升级组件但未恢复接线

- 升级 `BuiltinStatusLine.tsx` 的 props 接口：`rateLimits: { five_hour?, seven_day? }` → `buckets: ProviderUsageBucket[]` + `balance?: ProviderBalance`
- 新建完整的 `providerUsage` 服务层（11 个文件，+704 行）
- **未修改 `StatusLine.tsx`**（git diff main...HEAD 为空）
- 结果：组件升级完成，数据源就绪，但渲染入口仍然缺失

---

## 当前状态对比

### StatusLine.tsx（当前 — 外部命令版本）

**文件**: `src/components/StatusLine.tsx`

**`statusLineShouldDisplay` (行 59-64):**
```typescript
export function statusLineShouldDisplay(settings: ReadonlySettings): boolean {
  if (feature('KAIROS') && getKairosActive()) return false
  return settings?.statusLine !== undefined  // ← 需要 settings 配置
}
```

**`StatusLineInner` 渲染逻辑 (行 273-278):**
```typescript
const text = await executeStatusLineCommand(  // ← 调用外部 shell 命令
  statusInput,
  controller.signal,
  undefined,
  logResult,
)
```

**渲染输出 (行 397-407):**
```tsx
<Box paddingX={paddingX} gap={2}>
  {statusLineText ? (
    <Text dimColor wrap="truncate">
      <Ansi>{statusLineText}</Ansi>  // ← 渲染外部命令的 stdout
    </Text>
  ) : isFullscreenEnvEnabled() ? (
    <Text> </Text>
  ) : null}
</Box>
```

**关键依赖**: 需要 `~/.claude/settings.json` 中配置 `statusLine: { type: "command", command: "..." }`

### StatusLine.tsx（PR #89 — 内置版本，能正常工作）

**`statusLineShouldDisplay` (行 17-20):**
```typescript
export function statusLineShouldDisplay(settings: ReadonlySettings): boolean {
  if (feature('KAIROS') && getKairosActive()) return false;
  return true;  // ← 无条件显示
}
```

**import (行 15):**
```typescript
import { BuiltinStatusLine } from './BuiltinStatusLine.js';
```

**`StatusLineInner` 渲染 (行 50-58):**
```tsx
return (
  <BuiltinStatusLine
    modelName={modelDisplay}
    contextUsedPct={contextPercentages.used}
    usedTokens={usedTokens}
    contextWindowSize={contextWindowSize}
    totalCostUsd={totalCost}
    rateLimits={rawUtil}
  />
);
```

### BuiltinStatusLine.tsx（当前 — 已升级但未接入）

**文件**: `src/components/BuiltinStatusLine.tsx`

**Props 接口 (行 8-16):**
```typescript
type BuiltinStatusLineProps = {
  modelName: string;
  contextUsedPct: number;
  usedTokens: number;
  contextWindowSize: number;
  totalCostUsd: number;
  buckets: ProviderUsageBucket[];    // ← 新接口（原为 rateLimits）
  balance?: ProviderBalance;          // ← 新增
};
```

**渲染内容 (行 80-131):**
- 行 82: 模型名称
- 行 84-87: Context 用量百分比 + token 计数
- 行 89-112: buckets 循环渲染（进度条 + 百分比 + 重置倒计时）
- 行 114-120: Balance 余额显示
- 行 124-129: Cost 花费显示

**导出 (行 134):**
```typescript
export const BuiltinStatusLine = React.memo(BuiltinStatusLineInner);
```

**被引用情况**: 无任何文件 import 此组件（grep `import.*BuiltinStatusLine` 返回 0 结果）

---

## 断连的精确位置

### 断点 1: `statusLineShouldDisplay` 条件变化

| 版本 | 代码 | 行为 |
|------|------|------|
| PR #89 (`913702d9`) | `return true` | 无条件显示 |
| 当前 (`StatusLine.tsx:63`) | `return settings?.statusLine !== undefined` | 需要 settings.json 中配置 `statusLine` 字段 |

**文件**: `src/components/StatusLine.tsx` 行 63

### 断点 2: `BuiltinStatusLine` import 被移除

| 版本 | 代码 |
|------|------|
| PR #89 行 15 | `import { BuiltinStatusLine } from './BuiltinStatusLine.js';` |
| 当前 | 无此 import（`StatusLine.tsx` 全文不含 `BuiltinStatusLine`） |

**文件**: `src/components/StatusLine.tsx`（缺失 import）

### 断点 3: 渲染逻辑被替换

| 版本 | 渲染方式 |
|------|---------|
| PR #89 行 50-58 | `<BuiltinStatusLine modelName={...} contextUsedPct={...} ... />` |
| 当前行 273-278 | `executeStatusLineCommand(statusInput, controller.signal, ...)` |

**文件**: `src/components/StatusLine.tsx` 行 273（当前）vs PR #89 行 50

### 调用链（当前）

```
PromptInputFooter.tsx:165
  └─ statusLineShouldDisplay(settings) → settings?.statusLine !== undefined → false（无配置）
     └─ <StatusLine /> 不渲染
        └─ BuiltinStatusLine 永远不可见
```

### 调用链（PR #89，正常工作）

```
PromptInputFooter.tsx:165
  └─ statusLineShouldDisplay(settings) → true
     └─ <StatusLine />
        └─ <BuiltinStatusLine modelName={...} buckets={...} balance={...} />
           └─ 直接渲染额度信息
```

---

## 数据源状态（已就绪）

当前分支在 commit `7b9287b1` 中新建了完整的 `providerUsage` 服务层，作为 `BuiltinStatusLine` 的数据源：

| 文件 | 行数 | 功能 |
|------|------|------|
| `src/services/providerUsage/types.ts` (行 1-41) | 41 | `ProviderUsageBucket`、`ProviderBalance`、`ProviderUsage` 类型定义 |
| `src/services/providerUsage/store.ts` (行 1-69) | 69 | 单例 store：`getProviderUsage()`、`updateProviderBuckets()`、`setProviderBalance()`、`subscribeProviderUsage()` |
| `src/services/providerUsage/adapters/anthropic.ts` | 40 | Anthropic 响应头解析 → buckets |
| `src/services/providerUsage/adapters/openai.ts` | 97 | OpenAI 响应头解析 → buckets |
| `src/services/providerUsage/adapters/bedrock.ts` | 38 | AWS Bedrock 适配器 |
| `src/services/providerUsage/balance/generic.ts` | 118 | 通用余额轮询器 |
| `src/services/providerUsage/balance/deepseek.ts` | 85 | DeepSeek 余额轮询 |
| `src/services/providerUsage/balance/poller.ts` | 78 | 余额轮询框架 |
| `src/services/providerUsage/balance/types.ts` | 9 | 余额轮询类型 |
| `src/services/providerUsage/__tests__/providerUsage.test.ts` | 120 | 单元测试 |
| `src/services/claudeAiLimits.ts` (行 15-16) | +12 | 新增 `anthropicAdapter` import + `updateProviderBuckets` 调用 |

**总计**: 11 文件，+704 行。数据从 API 响应头 → adapter 解析 → store 存储 → 可供 UI 消费的完整管道已就绪。

旧数据源 `getRawUtilization()`（`claudeAiLimits.ts:162`）仍然存在，返回 `{ five_hour?, seven_day? }` 格式，当前 `StatusLine.tsx:96` 仍在使用它构建 `buildStatusLineCommandInput` 的 `rate_limits` 字段。

---

## 修复方案

需要修改 **1 个文件**: `src/components/StatusLine.tsx`

### 修改 1: 恢复 `statusLineShouldDisplay` 为无条件显示（或 fallback 到内置）

**当前** (`StatusLine.tsx:59-64`):
```typescript
export function statusLineShouldDisplay(settings: ReadonlySettings): boolean {
  if (feature('KAIROS') && getKairosActive()) return false
  return settings?.statusLine !== undefined
}
```

**修复为**:
```typescript
export function statusLineShouldDisplay(settings: ReadonlySettings): boolean {
  if (feature('KAIROS') && getKairosActive()) return false
  return true  // 内置 StatusLine 始终可用，不需要 settings 配置
}
```

### 修改 2: 恢复 `BuiltinStatusLine` import

在 `StatusLine.tsx` 顶部添加:
```typescript
import { BuiltinStatusLine } from './BuiltinStatusLine.js'
```

### 修改 3: 添加 providerUsage store 的数据连接

添加 import:
```typescript
import { getProviderUsage } from '../services/providerUsage/store.js'
```

### 修改 4: `StatusLineInner` 渲染逻辑 — 无外部命令时 fallback 到内置

在 `StatusLineInner` 中（约行 185-408），当 `settings?.statusLine` 未配置时，直接渲染 `<BuiltinStatusLine />`，否则保留外部命令逻辑。

**推荐方案**: 将 `StatusLineInner` 改为双模式：

```typescript
function StatusLineInner({ messagesRef, lastAssistantMessageId, vimMode }: Props): React.ReactNode {
  const settings = useSettings()

  // 如果配置了外部命令，走外部命令渲染路径（保留现有逻辑）
  if (settings?.statusLine) {
    return <ExternalStatusLine messagesRef={messagesRef} lastAssistantMessageId={lastAssistantMessageId} vimMode={vimMode} />
  }

  // 否则使用内置 BuiltinStatusLine
  return <BuiltinStatusLineWrapper messagesRef={messagesRef} lastAssistantMessageId={lastAssistantMessageId} />
}
```

其中 `BuiltinStatusLineWrapper` 需要:
- 从 `useMainLoopModel()` 获取模型名
- 从 `getCurrentUsage()` + `getContextWindowForModel()` 计算 context 百分比
- 从 `getProviderUsage()` 获取 `buckets` 和 `balance`
- 从 `getTotalCost()` 获取花费
- 传入 `<BuiltinStatusLine />` 的 props

---

## 相关文件索引

| 文件路径 | 角色 |
|---------|------|
| `src/components/BuiltinStatusLine.tsx` | 内置状态行组件（已升级，未接入） |
| `src/components/StatusLine.tsx` | 状态行入口（当前为外部命令版本，需修改） |
| `src/components/PromptInput/PromptInputFooter.tsx:28-30,165` | 渲染入口（import StatusLine + 条件渲染） |
| `src/services/providerUsage/types.ts` | `ProviderUsageBucket`、`ProviderBalance` 类型定义 |
| `src/services/providerUsage/store.ts` | `getProviderUsage()` 数据存储 |
| `src/services/providerUsage/adapters/anthropic.ts` | Anthropic 响应头 → buckets 适配器 |
| `src/services/providerUsage/adapters/openai.ts` | OpenAI 响应头 → buckets 适配器 |
| `src/services/providerUsage/adapters/bedrock.ts` | Bedrock 适配器 |
| `src/services/providerUsage/balance/generic.ts` | 通用余额轮询 |
| `src/services/providerUsage/balance/deepseek.ts` | DeepSeek 余额轮询 |
| `src/services/providerUsage/balance/poller.ts` | 轮询框架 |
| `src/services/claudeAiLimits.ts:15-16,162-164` | `getRawUtilization()`（旧数据源）+ `updateProviderBuckets`（新数据管道） |
