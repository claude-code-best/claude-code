# TOKEN_BUDGET — Token 预算自动持续模式

> Feature Flag: `FEATURE_TOKEN_BUDGET=1`
> 实现状态：完整可用

## 一、功能概述

TOKEN_BUDGET 让用户在 prompt 中指定一个 output token 预算目标（如 `+500k`、`spend 2M tokens`），Claude 会**自动持续工作**直到达到目标，无需用户反复按回车催促继续。

适用于大型重构、批量修改、大规模代码生成等需要多轮工具调用的长任务。

## 二、用户交互

### 语法

| 格式 | 示例 | 说明 |
|------|------|------|
| 简写（开头） | `+500k` | 输入开头直接写 |
| 简写（结尾） | `帮我重构这个模块 +2m` | 输入末尾追加 |
| 完整语法 | `spend 2M tokens` 或 `use 1B tokens` | 自然语言嵌入 |

单位支持：`k`（千）、`m`（百万）、`b`（十亿），大小写不敏感。

### UI 反馈

- **输入框高亮**：输入包含预算语法时，对应文字会被高亮标记（`PromptInput.tsx` 通过 `findTokenBudgetPositions` 计算）
- **Spinner 进度**：底部 spinner 显示实时进度，格式如：
  - 未完成：`Target: 125,000 / 500,000 (25%) · ~2m 30s`
  - 已完成：`Target: 510,000 used (500,000 min ✓)`
  - 包含 ETA（基于当前 token 产出速率计算）

## 三、实现架构

### 数据流

```
用户输入 "+500k"
     │
     ▼
┌─────────────────────────┐
│  parseTokenBudget()     │  src/utils/tokenBudget.ts
│  正则解析 → 500,000     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  REPL.tsx               │  提交时调用
│  snapshotOutputTokens   │  snapshotOutputTokensForTurn(500000)
│  ForTurn(500000)        │  记录 turn 起始 token 数 + 预算
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  query.ts 主循环        │  每轮结束后检查
│  checkTokenBudget()     │  当前 output tokens vs 预算
└────────┬────────────────┘
         │
    ┌────┴─────┐
    │          │
    ▼          ▼
 continue    stop
 (未达 90%)   (已达 90% 或收益递减)
    │          │
    ▼          ▼
 注入 nudge   正常结束
 消息继续     发送完成事件
```

### 核心模块

#### 1. 解析层 — `src/utils/tokenBudget.ts`

三个正则表达式解析用户输入：

```
SHORTHAND_START_RE = /^\s*\+(\d+(?:\.\d+)?)\s*(k|m|b)\b/i   // "+500k" 在开头
SHORTHAND_END_RE   = /\s\+(\d+(?:\.\d+)?)\s*(k|m|b)\s*[.!?]?\s*$/i  // "+2m" 在结尾
VERBOSE_RE         = /\b(?:use|spend)\s+(\d+(?:\.\d+)?)\s*(k|m|b)\s*tokens?\b/i  // "spend 2M tokens"
```

- `parseTokenBudget(text)` — 提取预算数值，返回 `number | null`
- `findTokenBudgetPositions(text)` — 返回匹配位置数组，用于输入框高亮
- `getBudgetContinuationMessage(pct, turnTokens, budget)` — 生成继续消息

#### 2. 状态层 — `src/bootstrap/state.ts`

模块级单例变量追踪当前 turn 的预算状态：

```
outputTokensAtTurnStart   — 本 turn 开始时的累计 output token 数
currentTurnTokenBudget    — 本 turn 的预算目标（null 表示无预算）
budgetContinuationCount   — 本 turn 已自动续接的次数
```

关键函数：
- `getTotalOutputTokens()` — 从 `STATE.modelUsage` 汇总所有模型的 output tokens
- `getTurnOutputTokens()` — `getTotalOutputTokens() - outputTokensAtTurnStart`
- `snapshotOutputTokensForTurn(budget)` — 重置 turn 起点，设置新预算
- `getCurrentTurnTokenBudget()` — 返回当前预算

#### 3. 决策层 — `src/query/tokenBudget.ts`

`checkTokenBudget(tracker, agentId, budget, globalTurnTokens)` 做出 continue/stop 决策：

**继续条件**：
- 不在子 agent 中（`agentId` 为空）
- 预算存在且 > 0
- 当前 token 未达预算的 **90%**
- 非收益递减（连续 3 轮 nudge 后，每轮新增 < 500 tokens）

**停止条件**：
- 达到预算 90%
- 收益递减（模型已经"做不动了"）
- 子 agent 模式下直接跳过

**收益递减检测**：`continuationCount >= 3` 且最近两次 nudge 的 delta 都 < 500 tokens。

#### 4. 主循环集成 — `src/query.ts`

```
query() 函数内：
  1. 创建 budgetTracker = createBudgetTracker()
  2. 进入 while 循环
  3. 每轮结束后调用 checkTokenBudget()
  4. decision.action === 'continue' 时：
     - 注入 meta user message（nudge）
     - continue 回到循环顶部
  5. decision.action === 'stop' 时：
     - 记录完成事件（含 diminishingReturns 标记）
     - 正常返回
```

#### 5. UI 层

| 文件 | 职责 |
|------|------|
| `components/PromptInput/PromptInput.tsx:534` | 输入框中高亮预算语法 |
| `components/Spinner.tsx:319-338` | spinner 显示进度百分比 + ETA |
| `screens/REPL.tsx:2897` | 提交时解析预算并快照 |
| `screens/REPL.tsx:2138` | 用户取消时清除预算 |
| `screens/REPL.tsx:2963` | turn 结束时捕获预算信息用于显示 |

#### 6. 系统提示 — `src/constants/prompts.ts:538-551`

注入 `token_budget` section：

> "When the user specifies a token target (e.g., '+500k', 'spend 2M tokens', 'use 1B tokens'), your output token count will be shown each turn. Keep working until you approach the target — plan your work to fill it productively. The target is a hard minimum, not a suggestion. If you stop early, the system will automatically continue you."

注意：这段 prompt **无条件缓存**（不随预算开关变化），因为 "When the user specifies..." 的措辞在没有预算时是空操作。

#### 7. API 附件 — `src/utils/attachments.ts:3830-3845`

每轮 API 调用附带 `output_token_usage` attachment：

```json
{
  "type": "output_token_usage",
  "turn": 125000,     // 本 turn 产出
  "session": 350000,  // 会话总产出
  "budget": 500000    // 预算目标
}
```

让模型能看到自己的进度。

## 四、关键设计决策

1. **90% 阈值而非 100%**：在 `COMPLETION_THRESHOLD = 0.9` 处停止，避免最后一轮 nudge 产生远超预算的 token
2. **收益递减保护**：连续 3 轮 nudge 后如果每轮产出 < 500 tokens，判定模型已无实质进展，提前终止
3. **子 agent 豁免**：AgentTool 内部的子任务不做预算检查，避免子任务重复触发续接
4. **无条件缓存系统提示**：预算 prompt 始终注入（不随预算变化 toggle），避免每次切换预算导致 ~20K token 的 cache miss
5. **用户取消清预算**：按 Escape 取消时调用 `snapshotOutputTokensForTurn(null)`，防止残留预算触发续接

## 五、使用方式

```bash
# 启用 feature
FEATURE_TOKEN_BUDGET=1 bun run dev

# 在 prompt 中使用
> +500k 重构所有测试文件
> spend 2M tokens 把这个项目从 JS 迁移到 TS
> 帮我写完整的 CRUD 模块 +1m
```

## 六、文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/utils/tokenBudget.ts` | 73 | 正则解析 + 位置查找 + 续接消息生成 |
| `src/query/tokenBudget.ts` | 93 | 预算追踪器 + continue/stop 决策 |
| `src/bootstrap/state.ts:724-743` | 20 | turn 级 token 快照状态 |
| `src/constants/prompts.ts:538-551` | 14 | 系统提示注入 |
| `src/utils/attachments.ts:3830-3844` | 17 | API attachment 附加 |
| `src/query.ts:280,1311-1358` | 48 | 主循环集成 |
| `src/screens/REPL.tsx:2897,2963,2138` | 20 | REPL 提交/完成/取消处理 |
| `src/components/Spinner.tsx:319-338` | 20 | 进度条 UI |
| `src/components/PromptInput/PromptInput.tsx:534` | 1 | 输入高亮 |
