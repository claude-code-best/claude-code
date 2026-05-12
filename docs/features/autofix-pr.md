# `/autofix-pr` 命令实现规格文档

> **状态**：规划阶段（2026-04-29），等待评审通过后进入实施。
> **Worktree**：`E:\Source_code\Claude-code-bast-autofix-pr`，分支 `feat/autofix-pr`，基于 `origin/main` 4f1649e2。
> **架构**：R（Remote-via-CCR），完整版（含 stop 子命令、单例锁、subscribePR、in-process teammate、skills 探测）。

---

## 一、背景

### 1.1 问题

本仓库（`Claude-code-bast`）是 Anthropic 官方 `@anthropic-ai/claude-code` 的反编译/重构版本。许多远程能力被 stub 化处理 —— `/autofix-pr` 是其中之一：

```js
// src/commands/autofix-pr/index.js（当前 stub）
export default { isEnabled: () => false, isHidden: true, name: 'stub' };
```

三个字段共同导致命令在斜杠菜单中完全不可见、不可调起：

| 字段 | 值 | 效果 |
|---|---|---|
| `isEnabled` | `() => false` | 注册时被判定不可用 |
| `isHidden` | `true` | 即使被列出也被过滤 |
| `name` | `'stub'` | 实际注册名是 `'stub'`，输入 `/autofix-pr` 无法匹配 |

### 1.2 用户场景

用户在 fork 仓库（`feat/autonomy-lifecycle-upstream` 分支）尝试对上游 `claude-code-best/claude-code#386` 跑 `/autofix-pr 386`，多次报 `git_repository source setup error`。根因：官方派发的远程 session 落在被 MCP 拒绝访问的仓库（`amdosion/claude-code-bast`），权限/可见性问题。

### 1.3 目标

| ID | 需求 | 验收 |
|---|---|---|
| R1 | 命令在斜杠菜单可见可调起 | 输入 `/au` 出现补全 |
| R2 | 跨仓库 PR：从本地 fork 触发对上游 PR 的修复 | `/autofix-pr 386` 不报 repo-not-allowed |
| R3 | 远端真正完成修复并 push 回 PR 分支 | PR 出现来自远端的新 commit |
| R4 | 不破坏现存其他 stub（如 `share`） | 只动 `autofix-pr` |
| R5 | TypeScript 严格模式，`bun run typecheck` 零错误 | CI 绿 |
| R6 | bridge 可触发（Remote Control 场景） | `bridgeSafe: true` 生效 |
| R7 | 支持 stop/off 子命令 | `/autofix-pr stop` 能终止当前监控 |
| R8 | 单例锁防止重复派发 | 已监控 PR 时拒绝新启动并提示 |

---

## 二、反编译调研结论（来源：`C:\Users\12180\.local\bin\claude.exe`）

`claude.exe` 是 242MB 的 Bun 原生编译产物（JS 源码 embed 在二进制内）。通过对该文件的字符串提取（`grep -aoE`）反推出完整调用链。

### 2.1 主入口函数结构

```js
async function entry(input, q, ctx) {
  const isStop = input === "stop" || input === "off"
  const args = { freeformPrompt: input }
  return main(args, q, ctx)
}

async function main(args, q, { signal, onProgress }) {
  // args 字段：{ prNumber, target, freeformPrompt, repoPath, skills }
  d("tengu_autofix_pr_started", {
    action: "start",
    has_pr_number: String(args.prNumber !== undefined),
    has_repo_path: String(args.repoPath !== undefined),
  })
  // ...
}
```

### 2.2 `teleportToRemote` 调用签名（黄金证据）

```ts
const session = await teleportToRemote({
  initialMessage: C,                       // 给远端的初始消息
  source: "autofix_pr",                    // ⚠️ 新字段，本仓库 teleport.tsx 没有
  branchName: N,                           // PR 头分支
  reuseOutcomeBranch: N,                   // 与 branchName 同 — 远端 push 回原分支
  title: `Autofix PR: ${owner}/${repo}#${prNumber} (${branch})`,
  useDefaultEnvironment: true,             // ⚠️ 不用 synthetic env（与 ultrareview 不同）
  signal,
  githubPr: { owner, repo, number },
  cwd: repoPath,
  onBundleFail: (msg) => { /* ... */ },
})
```

**与 `ultrareview` 的关键差异**：

| 字段 | ultrareview | autofix-pr |
|---|---|---|
| `environmentId` | `env_011111111111111111111113`（synthetic） | 不传 |
| `useDefaultEnvironment` | 不传 | `true` |
| `useBundle` | 有（branch mode） | 不传（`skipBundle` 隐含于不传 bundle） |
| `reuseOutcomeBranch` | 不传 | 传（远端 push 回原 PR 分支） |
| `githubPr` | 不传 | 必传 |
| `source` | 不传 | `"autofix_pr"` |
| `environmentVariables` | `BUGHUNTER_*` 一堆 | 不传 |

### 2.3 `registerRemoteAgentTask` 调用

```ts
registerRemoteAgentTask({
  remoteTaskType: "autofix-pr",
  session: { id: session.id, title: session.title },
  command,
  isLongRunning: true,        // poll 不消费 result，靠通知周期驱动
})
```

### 2.4 子命令解析

```
/autofix-pr <PR#>                    → 启动监控 + 派 CCR session
/autofix-pr stop                     → 停止当前监控
/autofix-pr off                      → 同 stop
/autofix-pr <freeform-prompt>        → 自由 prompt 模式（无 PR 号）
/autofix-pr <owner>/<repo>#<n>       → 跨仓库（覆盖 R2 验收）
```

### 2.5 状态模型

- **单例锁**：同一时刻只能监控一个 PR。重复启动报：`already monitoring ${repo}#${prNumber}. Run /autofix-pr stop first.`（error_code: `rc_already_monitoring_other`）
- **PR 订阅**：调 `kairos.subscribePR(owner, repo, taskId)` —— 依赖 `KAIROS_GITHUB_WEBHOOKS` feature flag（用户已订阅，可用）
- **in-process teammate**：注册后台 agent
  ```ts
  const teammate = {
    agentId,
    agentName: "autofix-pr",
    teamName: "_autofix",
    color: undefined,
    planModeRequired: false,
    parentSessionId,
  }
  ```
- **Skills 探测**：扫项目里 autofix-related skills（如 `.claude/skills/autofix-*` 或根目录 `AUTOFIX.md`），命中后拼到 prompt：`Run X and Y for custom instructions on how to autofix.`

### 2.6 Telemetry

| 事件 | 字段 |
|---|---|
| `tengu_autofix_pr_started` | `{ action, has_pr_number, has_repo_path }` |
| `tengu_autofix_pr_result` | `{ result, error_code? }` |

`result` 取值：`success_rc` / `failed` / `cancelled`

`error_code` 取值：

| code | 含义 |
|---|---|
| `rc_already_monitoring_other` | 已在监控其他 PR |
| `session_create_failed` | teleport 失败 |
| `exception` | 未捕获异常 |

### 2.7 错误返回结构

```ts
function errorResult(message: string, code: string) {
  d("tengu_autofix_pr_result", { result: "failed", error_code: code })
  return {
    kind: "error",
    message: `Autofix PR failed: ${message}`,
    code,
  }
}

function cancelledResult() {
  d("tengu_autofix_pr_result", { result: "cancelled" })
  return { kind: "cancelled" }
}
```

---

## 三、本仓库现有基础设施盘点

下表列出实现 `/autofix-pr` 时**直接复用**的现成能力（已确认完整可用）：

| 能力 | 文件 | 角色 |
|---|---|---|
| `teleportToRemote` | `src/utils/teleport.tsx:947` | 派 CCR 远端 session（缺 `source` 字段，需补） |
| `registerRemoteAgentTask` | `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx:526` | 注册 long-running 任务到 store |
| `checkRemoteAgentEligibility` | `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx:185` | 前置鉴权检查 |
| `getRemoteTaskSessionUrl` | `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx` | 生成 session 跟踪 URL |
| `formatPreconditionError` | `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx` | 错误文案格式化 |
| `REMOTE_TASK_TYPES` | `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx:103` | 已含 `'autofix-pr'` 类型 |
| `AutofixPrRemoteTaskMetadata` | `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx:112` | `{ owner, repo, prNumber }` schema |
| `RemoteSessionProgress` | `src/components/tasks/RemoteSessionProgress.tsx` | 进度面板 UI（已认 autofix-pr 类型） |
| `detectCurrentRepositoryWithHost` | `src/utils/detectRepository.ts` | 解析 owner/repo |
| `getDefaultBranch` / `gitExe` | `src/utils/git.ts` | git 工具 |
| `feature('FLAG')` | `bun:bundle` | feature flag 系统（CLAUDE.md 红线：只能在 if/三元条件位置直接调用） |

### 模板答案文件

以下三个文件已确认完整工作，是本次实现的"参考答案"：

- `src/commands/review/reviewRemote.ts`（317 行）—— **主模板**，照抄改造
- `src/commands/ultraplan.tsx`（525 行）
- `src/commands/review/ultrareviewCommand.tsx`（89 行）

---

## 四、命令对象规格

### 4.1 `Command` 类型选择

`Command` 类型定义在 `src/types/command.ts`，三态之一：`PromptCommand` / `LocalCommand` / `LocalJSXCommand`。

**选 `LocalJSXCommand`**，因为：
- 需要 spawn 远端 session 并显示进度面板
- 兄弟命令 `ultraplan` / `ultrareview` 都用 local-jsx
- 接口签名：`call(onDone, context, args) => Promise<React.ReactNode>`

### 4.2 `index.ts` 完整形状

```ts
import { feature } from 'bun:bundle'
import type { Command } from '../../types/command.js'

const autofixPr: Command = {
  type: 'local-jsx',
  name: 'autofix-pr',                          // 关键：必须是 'autofix-pr' 不是 'stub'
  description: 'Auto-fix CI failures on a pull request',
  argumentHint: '<pr-number> | stop | <owner>/<repo>#<n>',
  isEnabled: () => feature('AUTOFIX_PR'),
  isHidden: false,
  bridgeSafe: true,
  getBridgeInvocationError: (args) => {
    const trimmed = args.trim()
    if (!trimmed) return 'PR number required, e.g. /autofix-pr 386'
    if (trimmed === 'stop' || trimmed === 'off') return undefined
    if (/^\d+$/.test(trimmed)) return undefined
    if (/^[\w.-]+\/[\w.-]+#\d+$/.test(trimmed)) return undefined
    return 'Invalid args. Use /autofix-pr <pr-number> | stop | <owner>/<repo>#<n>'
  },
  load: async () => {
    const m = await import('./launchAutofixPr.js')
    return { call: m.callAutofixPr }
  },
}

export default autofixPr
```

### 4.3 参数解析规则

```
^stop$ | ^off$            → { action: 'stop' }
^\d+$                     → { action: 'start', prNumber, owner: <git>, repo: <git> }
^([\w.-]+)/([\w.-]+)#(\d+)$ → { action: 'start', prNumber, owner, repo }
其他                       → { action: 'start', freeformPrompt: <input> }
空字符串                   → 错误
```

---

## 五、文件结构

```
src/commands/autofix-pr/
├── index.ts                       # 命令对象（替换 index.js）
├── launchAutofixPr.ts             # 主流程
├── parseArgs.ts                   # 参数解析（独立便于测试）
├── monitorState.ts                # 单例锁
├── inProcessAgent.ts              # 后台 teammate
├── skillDetect.ts                 # 项目 skills 探测
└── __tests__/
    ├── parseArgs.test.ts
    ├── monitorState.test.ts
    ├── launchAutofixPr.test.ts
    └── index.test.ts              # bridge invocation error 测试
```

**删除**：原 `index.js`、`index.d.ts`（合并进 `index.ts`）。

**修改**：
- `scripts/defines.ts` —— 加 `AUTOFIX_PR` flag
- `scripts/dev.ts` —— dev 默认开启
- `src/utils/teleport.tsx` —— `teleportToRemote` 选项加 `source?: string` 字段并透传
- `src/commands.ts` —— **不动**（import 路径 `'./commands/autofix-pr/index.js'` 在 ESM/Bun 下会自动解析到 `.ts`）

---

## 六、模块详细规格

### 6.1 `parseArgs.ts`

```ts
export type ParsedArgs =
  | { action: 'stop' }
  | { action: 'start'; prNumber: number; owner?: string; repo?: string }
  | { action: 'freeform'; prompt: string }
  | { action: 'invalid'; reason: string }

export function parseAutofixArgs(raw: string): ParsedArgs {
  const trimmed = raw.trim()
  if (!trimmed) return { action: 'invalid', reason: 'empty' }
  if (trimmed === 'stop' || trimmed === 'off') return { action: 'stop' }
  if (/^\d+$/.test(trimmed)) {
    return { action: 'start', prNumber: parseInt(trimmed, 10) }
  }
  const cross = trimmed.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/)
  if (cross) {
    return {
      action: 'start',
      owner: cross[1],
      repo: cross[2],
      prNumber: parseInt(cross[3], 10),
    }
  }
  return { action: 'freeform', prompt: trimmed }
}
```

### 6.2 `monitorState.ts`

```ts
import type { UUID } from 'crypto'

type MonitorState = {
  taskId: UUID
  owner: string
  repo: string
  prNumber: number
  abortController: AbortController
  startedAt: number
}

let active: MonitorState | null = null

export function getActiveMonitor(): Readonly<MonitorState> | null {
  return active
}

export function setActiveMonitor(state: MonitorState): void {
  if (active) throw new Error(`Monitor already active: ${active.repo}#${active.prNumber}`)
  active = state
}

export function clearActiveMonitor(): void {
  if (active) {
    active.abortController.abort()
    active = null
  }
}

export function isMonitoring(owner: string, repo: string, prNumber: number): boolean {
  return active?.owner === owner && active?.repo === repo && active?.prNumber === prNumber
}
```

### 6.3 `inProcessAgent.ts`

仿官方 `xd9` 函数：

```ts
import { randomUUID, type UUID } from 'crypto'
import { getCurrentSessionId } from '../../bootstrap/state.js'

export type AutofixTeammate = {
  agentId: UUID
  agentName: 'autofix-pr'
  teamName: '_autofix'
  color: undefined
  planModeRequired: false
  parentSessionId: UUID
  abortController: AbortController
  taskId: UUID
}

export function createAutofixTeammate(
  initialMessage: string,
  target: string,
): AutofixTeammate {
  return {
    agentId: randomUUID(),
    agentName: 'autofix-pr',
    teamName: '_autofix',
    color: undefined,
    planModeRequired: false,
    parentSessionId: getCurrentSessionId(),
    abortController: new AbortController(),
    taskId: randomUUID(),
  }
}
```

### 6.4 `skillDetect.ts`

```ts
import { existsSync } from 'fs'
import { join } from 'path'

export function detectAutofixSkills(cwd: string): string[] {
  const candidates = [
    'AUTOFIX.md',
    '.claude/skills/autofix.md',
    '.claude/skills/autofix-pr/SKILL.md',
  ]
  return candidates.filter(rel => existsSync(join(cwd, rel)))
}

export function formatSkillsHint(skills: string[]): string {
  if (skills.length === 0) return ''
  return ` Run ${skills.join(' and ')} for custom instructions on how to autofix.`
}
```

### 6.5 `launchAutofixPr.ts`

主流程伪代码（约 250 行）：

```ts
import type { LocalJSXCommandCall } from '../../types/command.js'
import { parseAutofixArgs } from './parseArgs.js'
import { getActiveMonitor, setActiveMonitor, clearActiveMonitor, isMonitoring } from './monitorState.js'
import { createAutofixTeammate } from './inProcessAgent.js'
import { detectAutofixSkills, formatSkillsHint } from './skillDetect.js'
import { teleportToRemote } from '../../utils/teleport.js'
import { checkRemoteAgentEligibility, registerRemoteAgentTask, getRemoteTaskSessionUrl } from '../../tasks/RemoteAgentTask/RemoteAgentTask.js'
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js'
import { logEvent } from '../../services/analytics/index.js'

export const callAutofixPr: LocalJSXCommandCall = async (onDone, context, args) => {
  const parsed = parseAutofixArgs(args)

  // 1. stop 子命令
  if (parsed.action === 'stop') {
    const m = getActiveMonitor()
    if (!m) {
      onDone('No active autofix monitor.', { display: 'system' })
      return null
    }
    clearActiveMonitor()
    onDone(`Stopped monitoring ${m.repo}#${m.prNumber}.`, { display: 'system' })
    return null
  }

  // 2. invalid
  if (parsed.action === 'invalid') {
    return errorView(`Invalid args: ${parsed.reason}`)
  }

  // 3. freeform — 暂不支持，提示用户
  if (parsed.action === 'freeform') {
    return errorView('Freeform prompt mode not yet supported. Use /autofix-pr <pr-number>.')
  }

  // 4. start
  logEvent('tengu_autofix_pr_started', {
    action: 'start',
    has_pr_number: 'true',
    has_repo_path: String(!!process.cwd()),
  })

  // 4.1 解析 owner/repo
  let owner = parsed.owner
  let repo = parsed.repo
  if (!owner || !repo) {
    const detected = await detectCurrentRepositoryWithHost()
    if (!detected || detected.host !== 'github.com') {
      return errorResult('Cannot detect GitHub repo from current directory.', 'session_create_failed')
    }
    owner = detected.owner
    repo = detected.name
  }

  // 4.2 单例锁
  if (isMonitoring(owner, repo, parsed.prNumber)) {
    return errorResult(`already monitoring ${repo}#${parsed.prNumber} in background`, 'success_rc')
  }
  if (getActiveMonitor()) {
    const m = getActiveMonitor()!
    return errorResult(
      `already monitoring ${m.repo}#${m.prNumber}. Run /autofix-pr stop first.`,
      'rc_already_monitoring_other',
    )
  }

  // 4.3 资格检查
  const eligibility = await checkRemoteAgentEligibility()
  if (!eligibility.eligible) {
    return errorResult('Remote agent not available.', 'session_create_failed')
  }

  // 4.4 探测 skills
  const skills = detectAutofixSkills(process.cwd())
  const skillsHint = formatSkillsHint(skills)

  // 4.5 拼初始消息
  const target = `${owner}/${repo}#${parsed.prNumber}`
  const branchName = `refs/pull/${parsed.prNumber}/head`
  const initialMessage = `Auto-fix failing CI checks on PR #${parsed.prNumber} in ${owner}/${repo}.${skillsHint}`

  // 4.6 创建 in-process teammate
  const teammate = createAutofixTeammate(initialMessage, target)

  // 4.7 调 teleport
  let bundleFailMsg: string | undefined
  const session = await teleportToRemote({
    initialMessage,
    source: 'autofix_pr',
    branchName,
    reuseOutcomeBranch: branchName,
    title: `Autofix PR: ${target} (${branchName})`,
    useDefaultEnvironment: true,
    signal: teammate.abortController.signal,
    githubPr: { owner, repo, number: parsed.prNumber },
    cwd: process.cwd(),
    onBundleFail: (msg) => { bundleFailMsg = msg },
  })

  if (!session) {
    return errorResult(bundleFailMsg ?? 'remote session creation failed.', 'session_create_failed')
  }

  // 4.8 注册任务到 store
  registerRemoteAgentTask({
    remoteTaskType: 'autofix-pr',
    session,
    command: `/autofix-pr ${parsed.prNumber}`,
    context,
  })

  // 4.9 设置单例锁
  setActiveMonitor({
    taskId: teammate.taskId,
    owner,
    repo,
    prNumber: parsed.prNumber,
    abortController: teammate.abortController,
    startedAt: Date.now(),
  })

  // 4.10 PR webhooks 订阅（feature-gated）
  if (feature('KAIROS_GITHUB_WEBHOOKS')) {
    await kairosSubscribePR(owner, repo, teammate.taskId).catch(() => {/* non-fatal */})
  }

  // 4.11 返回 JSX 进度面板
  const sessionUrl = getRemoteTaskSessionUrl(session.id)
  logEvent('tengu_autofix_pr_launched', { target })
  onDone(
    `Autofix launched for ${target}. Track: ${sessionUrl}`,
    { display: 'system' },
  )
  return null  // 进度面板由 RemoteAgentTask 自动渲染
}

function errorResult(message: string, code: string) {
  logEvent('tengu_autofix_pr_result', { result: 'failed', error_code: code })
  // ... 渲染错误 JSX
}
```

> **注意**：`feature('KAIROS_GITHUB_WEBHOOKS')` 必须直接放在 if 条件位置，不能赋值给变量（CLAUDE.md 红线）。

### 6.6 `teleport.tsx` 补 `source` 字段

```diff
 export async function teleportToRemote(options: {
   initialMessage: string | null
   branchName?: string
   title?: string
   description?: string
+  /**
+   * Identifies which command/flow originated this teleport. CCR backend
+   * uses this for routing/billing/observability. Known values: 'autofix_pr',
+   * 'ultrareview', 'ultraplan'. Pass-through field — not interpreted client-side.
+   */
+  source?: string
   model?: string
   permissionMode?: PermissionMode
   // ...
 })
```

并在内部构造 request 时透传到 session_context（具体字段名按现有 review/ultraplan 调用结构对齐）。

---

## 七、Feature Flag

### 7.1 新增 flag

`scripts/defines.ts` 已有的 flag 集合中加 `AUTOFIX_PR`。

### 7.2 启用矩阵

| 环境 | 是否默认开启 | 说明 |
|---|---|---|
| dev (`bun run dev`) | 是 | `scripts/dev.ts` 加进默认列表 |
| build (production `bun run build`) | 否 | 灰度上线，需要 `FEATURE_AUTOFIX_PR=1` 显式开启 |
| 测试 | 按需 | 测试文件通过 mock `bun:bundle` 控制 |

### 7.3 与官方上游同步策略

如果上游某天恢复官方实现，本仓库的本地实现优先（项目即 fork）：
1. 保留 `AUTOFIX_PR` flag 名
2. 保留 `RemoteTaskType` 字段不动
3. 冲突时合并：吸收上游的 `source` 字段值变更、env var 变更，保留我们的本地 launcher 函数

---

## 八、测试计划

### 8.1 测试文件

| 文件 | 覆盖目标 | 测试用例数 |
|---|---|---|
| `parseArgs.test.ts` | 参数解析全分支 | ~10 |
| `monitorState.test.ts` | 单例锁正确性 | ~6 |
| `launchAutofixPr.test.ts` | 主流程 happy path + 失败路径 | ~12 |
| `index.test.ts` | bridge invocation error 校验 | ~5 |

### 8.2 关键断言

`launchAutofixPr.test.ts`：

```ts
test('start with PR number teleports with correct args', async () => {
  // mock teleportToRemote, registerRemoteAgentTask, detectCurrentRepositoryWithHost
  await callAutofixPr(onDone, context, '386')
  expect(teleportMock).toHaveBeenCalledWith(expect.objectContaining({
    source: 'autofix_pr',
    useDefaultEnvironment: true,
    githubPr: { owner: 'amDosion', repo: 'claude-code-bast', number: 386 },
    branchName: 'refs/pull/386/head',
    reuseOutcomeBranch: 'refs/pull/386/head',
  }))
  expect(registerMock).toHaveBeenCalledWith(expect.objectContaining({
    remoteTaskType: 'autofix-pr',
  }))
})

test('cross-repo syntax owner/repo#n parses correctly', async () => {
  await callAutofixPr(onDone, context, 'anthropics/claude-code#999')
  expect(teleportMock).toHaveBeenCalledWith(expect.objectContaining({
    githubPr: { owner: 'anthropics', repo: 'claude-code', number: 999 },
  }))
})

test('singleton lock blocks second start', async () => {
  await callAutofixPr(onDone, context, '386')
  const result = await callAutofixPr(onDone, context, '999')
  expect(extractError(result)).toMatch(/already monitoring.*386.*Run \/autofix-pr stop first/)
})

test('stop clears active monitor', async () => {
  await callAutofixPr(onDone, context, '386')
  await callAutofixPr(onDone, context, 'stop')
  expect(getActiveMonitor()).toBeNull()
})
```

### 8.3 Mock 策略

按本仓库 `tests/mocks/` 共享 mock 习惯：
- `tests/mocks/log.ts` 和 `tests/mocks/debug.ts` —— 必 mock
- `bun:bundle` —— mock `feature` 返回 `true`
- `teleportToRemote` —— 模块级 mock，断言入参
- `registerRemoteAgentTask` —— 模块级 mock，断言入参
- `detectCurrentRepositoryWithHost` —— mock 返回 `{ owner, name, host }`

### 8.4 类型检查

```bash
bun run typecheck      # 必须零错误
bun run test:all       # 必须全绿
```

---

## 九、实施步骤（11 步清单）

```
[ ] Step 1   scripts/defines.ts + scripts/dev.ts 加 AUTOFIX_PR flag
[ ] Step 2   src/utils/teleport.tsx 加 source?: string 字段（约 5 行）
[ ] Step 3   删除 src/commands/autofix-pr/{index.js, index.d.ts}
             新建 src/commands/autofix-pr/index.ts（约 50 行）
[ ] Step 4   新建 src/commands/autofix-pr/parseArgs.ts（约 30 行）
[ ] Step 5   新建 src/commands/autofix-pr/monitorState.ts（约 40 行）
[ ] Step 6   新建 src/commands/autofix-pr/inProcessAgent.ts（约 60 行）
[ ] Step 7   新建 src/commands/autofix-pr/skillDetect.ts（约 30 行）
[ ] Step 8   新建 src/commands/autofix-pr/launchAutofixPr.ts（约 250 行）
             照抄 reviewRemote.ts，按 §2.2 差异表改造
[ ] Step 9   新建四份测试文件（约 150 行）
[ ] Step 10  bun run typecheck && bun run test:all 全绿
[ ] Step 11  dev 模式手测：
              a. /autofix-pr 386 → 期望出现 RemoteSessionProgress 面板
              b. /autofix-pr stop → 期望提示已停止
              c. /autofix-pr anthropics/claude-code#999 → 期望跨仓库
              d. 第二次 /autofix-pr 386 → 期望被单例锁拒绝
[ ] Step 12  commit：feat: implement /autofix-pr command (replace stub)
```

预计工作量：约 600 行新增代码（含测试 150 行）。

---

## 十、风险与回退

| 风险 | 触发场景 | 回退策略 |
|---|---|---|
| `source` 字段 CCR 后端不识别 | 后端只认特定枚举 | 不传该字段，看是否能跑通；如不行回头看官方 cli.js 是否传了别的字段 |
| `subscribePR` API 在本仓库 client 不完整 | KAIROS_GITHUB_WEBHOOKS 客户端代码缺失 | 用 `.catch(() => {})` 容忍失败，订阅是 nice-to-have |
| 用户账号无 CCR 权限 | `checkRemoteAgentEligibility` 返回 false | 命令降级到错误文案，不破坏会话 |
| 远端能起 session 但不修代码 | env vars 命名错误 | 看 `getRemoteTaskSessionUrl` 给的会话页容器日志，调整 |
| PR 在 fork 仓库且 CCR 没访问权 | `git_repository source error` | 命令应在前置检查中识别并提示用户先把 PR 转到主仓 |
| 上游恢复官方实现导致冲突 | 上游 sync 时 | 项目是 fork，本地实现优先；冲突手工 merge |

### 回退命令

```bash
# 完全撤回本次实现
git checkout main
git worktree remove E:/Source_code/Claude-code-bast-autofix-pr
git branch -D feat/autofix-pr
```

`AUTOFIX_PR` flag 默认在 production 关闭，所以即使代码已合入 main，没显式 `FEATURE_AUTOFIX_PR=1` 时不会影响用户。

---

## 十一、验收清单

实施完成后逐项核对：

- [ ] R1：dev 模式下输入 `/au` 出现 `/autofix-pr` 补全
- [ ] R2：`/autofix-pr anthropics/claude-code#999` 不报 repo-not-allowed
- [ ] R3：远端 session 跑完后目标 PR 出现新 commit
- [ ] R4：其他 stub（`share` 等）依然 hidden
- [ ] R5：`bun run typecheck` 零错误
- [ ] R6：通过 RC bridge 触发 `/autofix-pr 386` 能跑通
- [ ] R7：`/autofix-pr stop` 终止当前监控
- [ ] R8：第二次 `/autofix-pr` 不同 PR 时被锁拒绝并提示

---

## 十二、附录

### 附录 A：相关文件路径速查

| 路径 | 角色 |
|---|---|
| `E:\Source_code\Claude-code-bast-autofix-pr` | 实施 worktree |
| `C:\Users\12180\.local\bin\claude.exe` | 反编译来源（242MB Bun 编译产物） |
| `C:\Users\12180\.claude\projects\E--Source-code-Claude-code-bast\memory\project_autofix_pr_implementation.md` | 内存备忘（精简版） |
| `src/commands/review/reviewRemote.ts` | 主模板 |
| `src/utils/teleport.tsx:947` | `teleportToRemote` 入口 |
| `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx:103` | `REMOTE_TASK_TYPES` |
| `src/tasks/RemoteAgentTask/RemoteAgentTask.tsx:526` | `registerRemoteAgentTask` |
| `src/types/command.ts` | `Command` 类型定义 |

### 附录 B：未决问题

| # | 问题 | 当前处理 | 后续 |
|---|---|---|---|
| Q1 | `source` 字段在 CCR backend 是否被解析 | 暂传 `'autofix_pr'`，按官方做法 | 端到端测试时观察远端日志 |
| Q2 | `subscribePR` 的 client SDK 在本仓库是否完整 | `try/catch` 容忍失败 | Step 11 手测时单独验证 |
| Q3 | freeform prompt 模式是否实现 | 暂报"not supported" | 第二期再加 |

---

## 十三、变更日志

| 日期 | 作者 | 变更 |
|---|---|---|
| 2026-04-29 | Claude Opus 4.7 | 初始规格文档创建（基于 claude.exe 反编译 + 仓库现有基础设施盘点） |
