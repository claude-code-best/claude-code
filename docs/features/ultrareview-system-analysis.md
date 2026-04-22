# Ultra Review 系统完整分析

## 1. 概述

Ultra Review（内部代号 `tengu_review`）是 Claude Code 的**云端代码审查**功能。用户通过 `/ultrareview` 斜杠命令发起，系统将当前仓库（PR 或 branch diff）传送到 CCR（Claude Code on the web）远程环境，在云端运行 "bughunter" 编排器（一个多 agent 舰队）来查找、验证和去重 bug，最终将审查结果通过 task-notification 管道注入回本地会话。

整个过程约 10–20 分钟，完全在云端异步执行，本地 CLI 通过轮询获取进度和结果。

---

## 2. 文件清单

### 2.1 核心文件（8 个）

| 文件路径 | 行数 | 职责 |
|----------|------|------|
| `src/commands/review.ts` | 57 | 入口文件，注册 `/review`（本地）和 `/ultrareview`（云端）两个 Command |
| `src/commands/review/ultrareviewEnabled.ts` | 14 | GrowthBook 运行时门控函数 |
| `src/commands/review/ultrareviewCommand.tsx` | 74 | `/ultrareview` 命令的 `call` 处理器，管理计费门控和对话框流程 |
| `src/commands/review/reviewRemote.ts` | 320 | 核心引擎：计费检查 + PR/Branch 两种模式的远程会话创建 |
| `src/commands/review/UltrareviewOverageDialog.tsx` | 56 | Ink 超额计费确认对话框组件 |
| `src/services/api/ultrareviewQuota.ts` | 38 | 配额查询 API 客户端（`/v1/ultrareview/quota`） |
| `src/utils/ultraplan/keyword.ts` (101–112 行) | 12 | 输入框 rainbow 关键词检测（复用 ultraplan 的关键词框架） |
| `src/components/tasks/RemoteSessionProgress.tsx` | 183 | 远程审查会话的进度展示组件（◇/◆ + rainbow text + 计数） |

### 2.2 深度关联文件

| 文件路径 | 与 Ultra Review 的关系 |
|----------|----------------------|
| `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx` | 远程任务框架：任务注册、轮询引擎、日志解析、进度提取、通知生发 |
| `src/components/tasks/RemoteSessionDetailDialog.tsx` | 远程会话详情对话框（含 "Stop ultrareview" 交互） |
| `src/utils/teleport.tsx` | `teleportToRemote()` — 将仓库传送到 CCR 环境的传输层 |
| `src/services/api/usage.ts` | `fetchUtilization()` — Extra Usage 余额查询 |
| `src/components/PromptInput/PromptInput.tsx` | 输入框中 "ultrareview" 关键词的 rainbow 高亮和提示通知 |
| `src/constants/figures.ts` (26–29) | 状态图标：◇ DIAMOND_OPEN（运行中）、◆ DIAMOND_FILLED（已完成/失败） |
| `src/constants/xml.ts` (44–49) | XML 标签常量：`remote-review`、`remote-review-progress` |
| `src/commands.ts` (41, 352) | 命令注册表：导入并注册 `ultrareview` 命令 |
| `src/commands/bughunter/index.js` | **Stub** — `/bughunter` 本地命令（`isEnabled: () => false`） |

---

## 3. 架构详解

### 3.1 命令注册

```
src/commands.ts
  ├── import review, { ultrareview } from './commands/review.js'
  └── allCommands = [ ..., review, ultrareview, ... ]
```

`review.ts` 导出两个 Command 对象：

- **`review`**（type: `'prompt'`）— 纯本地审查。向 Claude 发送 prompt 让模型调用 `gh pr diff` 做本地代码审查。
- **`ultrareview`**（type: `'local-jsx'`）— 云端审查。`isEnabled()` 由 GrowthBook 门控，`load()` 懒加载 `ultrareviewCommand.tsx`。

```typescript
// review.ts
const ultrareview: Command = {
  type: 'local-jsx',
  name: 'ultrareview',
  description: `~10–20 min · Finds and verifies bugs in your branch. Runs in Claude Code on the web.`,
  isEnabled: () => isUltrareviewEnabled(),
  load: () => import('./review/ultrareviewCommand.js'),
}
```

### 3.2 门控层

#### 3.2.1 可见性门控（GrowthBook）

```typescript
// ultrareviewEnabled.ts
export function isUltrareviewEnabled(): boolean {
  const cfg = getFeatureValue_CACHED_MAY_BE_STALE<Record<string, unknown> | null>(
    'tengu_review_bughunter_config', null
  )
  return cfg?.enabled === true
}
```

- 从 GrowthBook 远程配置读取 `tengu_review_bughunter_config` feature flag
- 当 `cfg.enabled !== true` 时，`/ultrareview` 命令在 `getCommands()` 中被过滤掉，用户完全看不到
- **fork 环境问题**：GrowthBook 连接通常返回空值，导致命令永远不可见

#### 3.2.2 计费门控（OverageGate）

```typescript
// reviewRemote.ts
export type OverageGate =
  | { kind: 'proceed'; billingNote: string }
  | { kind: 'not-enabled' }
  | { kind: 'low-balance'; available: number }
  | { kind: 'needs-confirm' }
```

`checkOverageGate()` 的决策树：

```
checkOverageGate()
  │
  ├─ Team/Enterprise 订阅 → proceed（免费包含）
  │
  ├─ 并行获取 quota + utilization
  │   ├─ quota 不可用（非订阅/API 失败）→ proceed（服务端处理）
  │   ├─ reviews_remaining > 0 → proceed + billingNote（"免费第 N/M 次"）
  │   ├─ utilization 不可用 → proceed（降级容错）
  │   ├─ Extra Usage 未启用 → not-enabled
  │   ├─ 余额 < $10 → low-balance
  │   ├─ 未在本会话确认过 → needs-confirm
  │   └─ 已确认 → proceed + billingNote（"Extra Usage 计费"）
  │
  └─ 会话级确认标志 sessionOverageConfirmed（一次确认，全会话生效）
```

### 3.3 命令处理器

```typescript
// ultrareviewCommand.tsx — call() 函数
export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const gate = await checkOverageGate()

  switch (gate.kind) {
    case 'not-enabled':
      // 显示 "启用 Extra Usage" 提示
      onDone('Free ultrareviews used...', { display: 'system' })

    case 'low-balance':
      // 显示余额不足提示
      onDone(`Balance too low ($X.XX available, $10 minimum)...`)

    case 'needs-confirm':
      // 渲染 UltrareviewOverageDialog 组件
      return <UltrareviewOverageDialog
        onProceed={async (signal) => {
          await launchAndDone(args, context, onDone, billingNote, signal)
          if (!signal.aborted) confirmOverage()  // 持久化确认
        }}
        onCancel={() => onDone('Ultrareview cancelled.')}
      />

    case 'proceed':
      // 直接启动
      await launchAndDone(args, context, onDone, gate.billingNote)
  }
}
```

### 3.4 超额计费对话框

```
UltrareviewOverageDialog.tsx
  ┌──────────────────────────────────────────┐
  │  Ultrareview billing                     │
  │                                          │
  │  Your free ultrareviews for this         │
  │  organization are used. Further          │
  │  reviews bill as Extra Usage.            │
  │                                          │
  │  > Proceed with Extra Usage billing      │
  │    Cancel                                │
  └──────────────────────────────────────────┘
```

特性：
- Escape 键取消并通过 AbortController signal 中止正在进行的 launch
- launch 失败（`onProceed` reject）恢复 Select 让用户重试
- 只有非中止的成功 launch 才调用 `confirmOverage()`

### 3.5 远程会话启动（reviewRemote.ts）

`launchRemoteReview()` 是核心引擎，支持两种模式：

#### 3.5.1 PR 模式

```
用户输入: /ultrareview 123
  → args = "123", isPrNumber = true
  → detectCurrentRepositoryWithHost()
    → 必须是 github.com（其他 host 返回 null）
  → teleportToRemote({
      branchName: "refs/pull/123/head",
      environmentId: CODE_REVIEW_ENV_ID,
      environmentVariables: {
        BUGHUNTER_PR_NUMBER: "123",
        BUGHUNTER_REPOSITORY: "owner/repo",
        ...commonEnvVars
      }
    })
```

#### 3.5.2 Branch 模式

```
用户输入: /ultrareview（无参数）
  → isPrNumber = false
  → getDefaultBranch() || "main"
  → git merge-base <baseBranch> HEAD → mergeBaseSha
    ├─ 失败 → "Could not find merge-base"
    └─ 成功 → git diff --shortstat <sha>
        ├─ 无变更 → "No changes against fork point"
        └─ 有变更 → teleportToRemote({
              useBundle: true,    // 打包工作树
              environmentId: CODE_REVIEW_ENV_ID,
              environmentVariables: {
                BUGHUNTER_BASE_BRANCH: mergeBaseSha,
                ...commonEnvVars
              }
            })
            ├─ 返回 null → "Repo is too large, use PR mode"
            └─ 成功 → 注册任务
```

#### 3.5.3 Bughunter 配置参数

从 GrowthBook `tengu_review_bughunter_config` 读取，带安全上限：

| 环境变量 | 含义 | 默认值 | 上限 |
|----------|------|--------|------|
| `BUGHUNTER_DRY_RUN` | 干运行标志 | `"1"` | — |
| `BUGHUNTER_FLEET_SIZE` | agent 舰队大小 | 5 | 20 |
| `BUGHUNTER_MAX_DURATION` | 单 agent 最大运行时间（分钟） | 10 | 25 |
| `BUGHUNTER_AGENT_TIMEOUT` | 单 agent 超时（秒） | 600 | 1800 |
| `BUGHUNTER_TOTAL_WALLCLOCK` | 总运行时间上限（分钟） | 22 | 27 |
| `BUGHUNTER_DEV_BUNDLE_B64` | 开发用 bundle（可选） | — | — |

`posInt()` 辅助函数对每个参数做类型检查、正整数验证和上限约束。wallclock 上限 27 分钟留出 ~3 分钟给合成阶段，以适配 RemoteAgentTask 的 30 分钟轮询超时。

#### 3.5.4 远程环境 ID

```typescript
const CODE_REVIEW_ENV_ID = 'env_011111111111111111111113'
```

这是一个合成的 CCR 环境 ID（Go 的 `taggedid.FromUUID` 编码），不需要 per-org CCR 环境配置即可工作。

#### 3.5.5 前置条件检查

`checkRemoteAgentEligibility()` 检查 6 种前置条件：

| 前置条件 | 说明 | ultrareview 处理 |
|----------|------|-----------------|
| `not_logged_in` | 未登录 Claude.ai OAuth | 阻止启动 |
| `no_remote_environment` | 无云端环境 | **跳过**（合成 env ID 绕过） |
| `not_in_git_repo` | 不在 git 仓库中 | 阻止启动 |
| `no_git_remote` | 无 GitHub remote | 阻止启动 |
| `github_app_not_installed` | Claude GitHub App 未安装 | 阻止启动 |
| `policy_blocked` | 组织策略禁止远程会话 | 阻止启动 |

### 3.6 任务注册与轮询

#### 3.6.1 任务注册

```typescript
// reviewRemote.ts 末尾
registerRemoteAgentTask({
  remoteTaskType: 'ultrareview',  // 任务类型
  session,                        // { id, title }
  command,                        // "/ultrareview" 或 "/ultrareview 123"
  context,                        // ToolUseContext
  isRemoteReview: true,           // 启用 review 专用逻辑
})
```

`registerRemoteAgentTask()` 执行：
1. 生成 `taskId`（`generateTaskId('remote_agent')`）
2. 初始化磁盘输出文件（`initTaskOutput(taskId)`）
3. 创建 `RemoteAgentTaskState`（初始 status: `'running'`）
4. 注册到全局任务框架（`registerTask()`）
5. 持久化到 session sidecar（支持 `--resume`）
6. 启动轮询循环（`startRemoteSessionPolling()`）

#### 3.6.2 RemoteAgentTaskState（review 相关字段）

```typescript
type RemoteAgentTaskState = TaskStateBase & {
  type: 'remote_agent'
  remoteTaskType: 'ultrareview'
  sessionId: string
  command: string
  title: string
  todoList: TodoList
  log: SDKMessage[]
  pollStartedAt: number
  isRemoteReview: true            // review 专用标志
  reviewProgress?: {              // 实时进度
    stage?: 'finding' | 'verifying' | 'synthesizing'
    bugsFound: number
    bugsVerified: number
    bugsRefuted: number
  }
}
```

#### 3.6.3 轮询引擎

`startRemoteSessionPolling()` 是一个 1 秒间隔的异步轮询循环：

```
每 1 秒轮询一次:
  │
  ├─ pollRemoteSessionEvents(sessionId, lastEventId)
  │   → 获取新事件 + 会话状态
  │
  ├─ 事件增量扫描:
  │   ├─ 追加到 accumulatedLog
  │   ├─ 写入磁盘输出文件
  │   ├─ 提取 <remote-review-progress> → reviewProgress
  │   └─ 提取 <remote-review> 标签 → cachedReviewContent
  │
  ├─ 会话状态 = archived → 完成
  │
  ├─ 完成条件判断:
  │   ├─ cachedReviewContent !== null → 有审查输出
  │   ├─ stableIdle (5 次连续 idle + 有 assistant 输出 + 非 bughunter 模式)
  │   └─ reviewTimedOut (pollStartedAt + 30min)
  │
  ├─ 成功完成:
  │   → enqueueRemoteReviewNotification(reviewContent)
  │   → evictTaskOutput() + removeRemoteAgentMetadata()
  │
  └─ 失败:
      → updateTaskState(status: 'failed')
      → enqueueRemoteReviewFailureNotification(reason)
      失败原因:
        - "remote session returned an error"
        - "remote session exceeded 30 minutes"
        - "no review output — orchestrator may have exited early"
```

**Bughunter 模式 vs Prompt 模式的区别**：

| 特征 | Bughunter 模式 | Prompt 模式 |
|------|---------------|------------|
| 产出位置 | SessionStart hook 的 stdout | assistant 消息 |
| 完成信号 | `<remote-review>` 标签出现 | stableIdle（5 次连续 idle） |
| 进度来源 | `<remote-review-progress>` 心跳 | 无 |
| 判别依据 | `hook_event === 'SessionStart'` 存在 | 不存在 |

#### 3.6.4 进度数据格式

```xml
<remote-review-progress>
{"stage":"finding","bugs_found":3,"bugs_verified":1,"bugs_refuted":0}
</remote-review-progress>
```

轮询器从 `hook_progress` / `hook_response` 事件的 stdout 中提取最后一个此标签（`lastIndexOf`），解析 JSON 并映射到 `reviewProgress`。

#### 3.6.5 审查输出提取

`extractReviewFromLog()` 按优先级扫描 4 个来源：

1. **hook stdout 逐条扫描**（`hook_progress` / `hook_response` 的 `<remote-review>` 标签）
2. **assistant 消息逐条扫描**（`<remote-review>` 标签）
3. **hook stdout 拼接回退**（处理大 JSON 跨两个事件的情况）
4. **全部 assistant 文本拼接回退**（无标签时的兜底）

`extractReviewTagFromLog()` 是增量扫描变体，**不使用第 4 个回退**，避免早期 assistant 消息（如 "I'm analyzing the diff..."）误触发完成。

### 3.7 通知管道

#### 3.7.1 成功通知

```xml
<task-notification>
<task-id>{taskId}</task-id>
<task-type>remote_agent</task-type>
<status>completed</status>
<summary>Remote review completed</summary>
</task-notification>
The remote review produced the following findings:

{reviewContent}
```

- 审查内容**直接注入**消息队列（`task-notification` mode），不通过文件间接引用
- 远程会话**不归档**（保持 alive），用户可通过 claude.ai URL 随时回看
- TTL 自动清理过期会话

#### 3.7.2 失败通知

```xml
<task-notification>
<task-id>{taskId}</task-id>
<task-type>remote_agent</task-type>
<status>failed</status>
<summary>Remote review failed: {reason}</summary>
</task-notification>
Remote review did not produce output ({reason}).
Tell the user to retry /ultrareview, or use /review for a local review instead.
```

### 3.8 配额 API

```typescript
// ultrareviewQuota.ts
type UltrareviewQuotaResponse = {
  reviews_used: number      // 已使用的免费次数
  reviews_limit: number     // 免费次数上限
  reviews_remaining: number // 剩余免费次数
  is_overage: boolean       // 是否已超额
}

// GET /v1/ultrareview/quota
// Headers: OAuth + x-organization-uuid
// Timeout: 5000ms
// 前置条件: isClaudeAISubscriber()
```

### 3.9 UI 层

#### 3.9.1 进度展示（RemoteSessionProgress.tsx）

Review 任务使用 `ReviewRainbowLine` 子组件，呈现三种状态：

**运行中**：
```
◇ ultrareview · finding / 3 found · 1 verified
```
- ◇ 菱形为 teal 色
- "ultrareview" 文字带 rainbow 渐变动画（每 3 帧推进一个相位）
- 计数用 `useSmoothCount` 逐帧递增（2→5 显示为 2→3→4→5）

**已完成**：
```
◆ ultrareview ready · shift+↓ to view
```

**失败**：
```
◆ ultrareview · error
```

#### 3.9.2 阶段计数格式化

```typescript
formatReviewStageCounts(stage, found, verified, refuted):
  stage='finding'      → "3 found"  或  "finding"（0 时）
  stage='verifying'    → "3 found · 1 verified"  + refuted（>0 时）
  stage='synthesizing' → "1 verified · deduping"  + refuted（>0 时）
  stage=undefined      → "3 found · 1 verified"（pre-stage 编排器）
```

#### 3.9.3 详情对话框（RemoteSessionDetailDialog.tsx）

展示完整的远程会话信息，包含：
- 标题栏：◇/◆ + "ultrareview" + 运行时间 + 状态
- 会话消息流（标准化后的 Message 组件）
- 操作菜单：
  - "Open in Claude Code on the web"（打开浏览器）
  - "Stop ultrareview"（运行中时，需二次确认）
  - "Back" / "Dismiss"

停止确认对话框：
```
┌──────────────────────────────────────────┐
│  Stop ultrareview?                       │
│                                          │
│  This archives the remote session and    │
│  stops local tracking. The review will   │
│  not complete and any findings so far    │
│  are discarded.                          │
│                                          │
│  > Stop ultrareview                      │
│    Back                                  │
└──────────────────────────────────────────┘
```

#### 3.9.4 输入框 Rainbow 高亮（PromptInput.tsx）

```typescript
// 在用户输入中检测 "ultrareview" 关键词
const ultrareviewTriggers = useMemo(
  () => isUltrareviewEnabled()
    ? findUltrareviewTriggerPositions(displayedValue)
    : [],
  [displayedValue]
)

// 对关键词应用 per-character rainbow 渐变
for (const trigger of ultrareviewTriggers) {
  // 与 ultraplan 相同的 rainbow 处理
}

// 显示提示通知
useEffect(() => {
  if (isUltrareviewEnabled() && ultrareviewTriggers.length) {
    addNotification({
      key: 'ultrareview-active',
      text: 'Run /ultrareview after Claude finishes to review these changes in the cloud',
      priority: 'immediate',
      timeoutMs: 5000,
    })
  }
}, [ultrareviewTriggers.length])
```

---

## 4. 数据流全景

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           用户输入 /ultrareview [PR#]                        │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     ▼
                         ┌──────────────────────┐
                         │  ultrareviewEnabled   │
                         │  GrowthBook 门控      │
                         │  tengu_review_        │
                         │  bughunter_config     │
                         └──────────┬───────────┘
                                    │ enabled === true
                                    ▼
                     ┌───────────────────────────────┐
                     │  ultrareviewCommand.tsx        │
                     │  checkOverageGate()            │
                     └──────────┬────────────────────┘
                                │
               ┌────────────────┼────────────────┐
               │                │                │
               ▼                ▼                ▼
         ┌──────────┐   ┌──────────────┐  ┌───────────┐
         │ proceed   │   │ needs-confirm│  │ not-      │
         │           │   │              │  │ enabled / │
         │           │   │ Overage      │  │ low-      │
         │           │   │ Dialog       │  │ balance   │
         └─────┬─────┘   └──────┬───────┘  └───────────┘
               │                │                  ×
               │      用户确认   │
               ▼                ▼
        ┌──────────────────────────────┐
        │  reviewRemote.ts             │
        │  launchRemoteReview()        │
        └──────────┬───────────────────┘
                   │
        ┌──────────┼──────────┐
        │ PR 模式               │ Branch 模式
        ▼                      ▼
  ┌────────────────┐   ┌──────────────────────┐
  │ detect repo    │   │ merge-base + diff     │
  │ github.com only│   │ empty diff → 中止     │
  │                │   │ useBundle: true       │
  └───────┬────────┘   └──────────┬───────────┘
          │                       │
          └───────────┬───────────┘
                      ▼
           ┌──────────────────────┐
           │  teleportToRemote()  │
           │  → CCR 远程环境       │
           │  env_01...13         │
           │  BUGHUNTER_* 环境变量 │
           └──────────┬───────────┘
                      │
                      ▼
        ┌──────────────────────────────┐
        │  registerRemoteAgentTask()   │
        │  type: 'ultrareview'         │
        │  isRemoteReview: true        │
        └──────────┬───────────────────┘
                   │
                   ▼
     ┌────────────────────────────────────┐
     │  startRemoteSessionPolling()       │
     │  每 1 秒轮询                        │
     │                                    │
     │  ┌───────────────────────────┐     │
     │  │ pollRemoteSessionEvents() │     │
     │  │ → 增量事件 + 会话状态      │     │
     │  └───────────┬───────────────┘     │
     │              │                     │
     │     ┌────────┼────────┐            │
     │     ▼        ▼        ▼            │
     │  progress  review   timeout        │
     │  心跳解析   标签提取   30 min       │
     │                                    │
     │  finding → verifying → synth.      │
     └──────────┬─────────────────────────┘
                │ 完成
                ▼
  ┌──────────────────────────────────────┐
  │  enqueueRemoteReviewNotification()   │
  │  → task-notification 消息队列         │
  │  → 本地 Claude 模型接收并叙述结果      │
  └──────────────────────────────────────┘
```

---

## 5. 遥测事件

| 事件名 | 触发时机 |
|--------|---------|
| `tengu_review_overage_not_enabled` | 免费次数用完且 Extra Usage 未启用 |
| `tengu_review_overage_low_balance` | Extra Usage 余额 < $10 |
| `tengu_review_overage_dialog_shown` | 超额确认对话框弹出 |
| `tengu_review_remote_precondition_failed` | 前置条件检查失败（含 `precondition_errors` 字段） |
| `tengu_review_remote_teleport_failed` | teleport 传输失败（session = null） |
| `tengu_review_remote_launched` | 远程会话成功创建 |

---

## 6. 缺失与问题分析

### 6.1 Stub：`/bughunter` 命令

```javascript
// src/commands/bughunter/index.js
export default { isEnabled: () => false, isHidden: true, name: 'stub' }
```

这是 bughunter 编排器的**本地调试入口**，完全被 stub 掉。在生产环境中 bughunter 逻辑运行在 CCR 远端容器（`run_hunt.sh`），所以这个 stub 不影响 ultrareview 功能。但如果需要本地调试 bughunter 编排器，需要恢复此命令。

### 6.2 零测试覆盖

`src/commands/review/` 目录下没有 `__tests__/` 目录。以下函数完全无测试：

- `isUltrareviewEnabled()` — 门控函数
- `checkOverageGate()` — 计费决策树（4 个分支 × 多种 quota/utilization 组合）
- `launchRemoteReview()` — 核心引擎（PR/Branch 两条路径 + 多种失败场景）
- `UltrareviewOverageDialog` — React 组件（用户交互 + abort 信号 + 错误恢复）
- `fetchUltrareviewQuota()` — API 客户端
- `extractReviewFromLog()` / `extractReviewTagFromLog()` — 日志解析（4 个回退层级）
- `formatReviewStageCounts()` — 阶段格式化
- `ReviewRainbowLine` / `useSmoothCount` — 动画组件

其中 `checkOverageGate()` 和 `extractReview*FromLog()` 的分支复杂度最高，最需要测试。

### 6.3 GrowthBook 门控无本地回退

`isUltrareviewEnabled()` 完全依赖远程 GrowthBook 配置。与 ultraplan 等功能不同，没有 `LOCAL_GATE_DEFAULTS` 或环境变量覆盖。在 fork 环境中：

- GrowthBook 连接返回 `null`
- `cfg?.enabled === true` 永远为 `false`
- `/ultrareview` 命令对用户完全不可见

**修复方案**：添加环境变量回退，如 `FEATURE_ULTRAREVIEW=1` → `true`。

### 6.4 CCR 依赖

Ultra Review 整条链路依赖 Claude Code on the web（CCR）：

- `teleportToRemote()` — 需要 OAuth 认证 + CCR 会话 API
- `isClaudeAISubscriber()` — 配额查询的前提
- `pollRemoteSessionEvents()` — 需要 CCR 事件流 API
- 合成环境 ID `env_011111111111111111111113` — CCR 服务端识别

对于非 Anthropic 订阅用户或离线环境，ultrareview 不可用。`/review` 命令作为本地回退方案。

### 6.5 TODO 项

代码中存在一个未完成的 TODO：

```
// reviewRemote.ts:9
// TODO(#22051): pass useBundleMode once landed so local-only / uncommitted
// repo state is captured. The GitHub-clone path (current) only works for
// pushed branches on repos with the Claude GitHub app installed.
```

Branch 模式已经实现了 `useBundle: true`（打包工作树），但 PR 模式仍然只通过 GitHub 克隆，不能捕获本地未提交的改动。

---

## 7. 与 `/review` 的对比

| 维度 | `/review` | `/ultrareview` |
|------|-----------|---------------|
| 类型 | `prompt` | `local-jsx` |
| 执行位置 | 本地 | CCR 云端 |
| 时间 | 即时（取决于模型速度） | 10–20 分钟 |
| 机制 | 发送 prompt 让 Claude 调用 `gh pr diff` | teleport + bughunter 多 agent 舰队 |
| 门控 | 无 | GrowthBook + 计费门控 |
| 依赖 | `gh` CLI + GitHub token | OAuth + CCR + Claude GitHub App |
| 输出 | 模型直接回复 | task-notification 异步注入 |
| 适用场景 | 快速轻量审查 | 深度 bug 挖掘 + 验证 |

---

## 8. 与 `/ultraplan` 的共享基础设施

Ultra Review 大量复用了 ultraplan 建立的基础设施：

| 共享模块 | 用途 |
|----------|------|
| `teleportToRemote()` | 仓库传送到 CCR |
| `registerRemoteAgentTask()` | 远程任务注册 |
| `startRemoteSessionPolling()` | 轮询引擎 |
| `RemoteAgentTaskState` | 任务状态类型 |
| `RemoteSessionDetailDialog` | 详情对话框 |
| `findKeywordTriggerPositions()` | 输入框关键词检测 |
| `RainbowText` / `getRainbowColor()` | rainbow 渐变动画 |
| `checkRemoteAgentEligibility()` | 前置条件检查 |
| `persistRemoteAgentMetadata()` | session sidecar 持久化 |
| `restoreRemoteAgentTasks()` | `--resume` 恢复 |

差异点：
- ultrareview 使用 `isRemoteReview: true` 标志走 review 专用分支
- ultrareview 有自己的轮询完成逻辑（`<remote-review>` 标签 vs ultraplan 的 `ExitPlanMode` 扫描）
- ultrareview 有配额 + 计费门控（ultraplan 没有）
- ultrareview 有 bughunter 环境变量配置层（ultraplan 没有）
