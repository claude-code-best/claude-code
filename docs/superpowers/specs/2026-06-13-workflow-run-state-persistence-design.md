# Workflow Run State Persistence — Design

**Date**: 2026-06-13
**Status**: Approved (brainstorming), pending implementation plan
**Related**: `2026-06-12-workflow-engine-design.md`, `2026-06-13-workflow-panel-redesign.md`

## 问题陈述

Workflow 脚本的 `return` 值和终态 `RunProgress`（status / agents / phases / returnValue / error）只活在 `ProgressStore`（`src/workflow/progress/store.ts`）的内存 Map 里。一旦 Claude Code 进程关闭/重启，全部丢失。

已落盘的 `.claude/workflow-runs/<runId>/journal.jsonl` 只记录每个 `agent()` 调用的结构化结果，**不**包含脚本顶层 `return` 值，也无法重建 `/workflows` 面板需要的 `RunProgress` 摘要。重启后面板为空，对话 agent 也无法按 runId 取回 return 值。

## 目标

- **(a) 重启后按 runId 取 return** — 对话 agent 在新进程里能拿到已完成 run 的 `returnValue` 与 `error`。
- **(b) 面板跨重启展示历史** — `/workflows` 面板重启后能列出历史 run 及其状态/agents/phases/耗时。

## 非目标

- **(c) 跨进程 resume 明确排除** — 不重建 abort controller、agent binding、未完成 phase 的中间态。当前 resume 机制（同进程内 journal replay）保持不变；跨进程续跑是独立大特性，不在本 spec 范围。
- **自动清理** — `.claude/workflow-runs/` 持续累积，依赖项目 `.gitignore` 与用户手动清理。生命周期管理是后续特性。

## 架构

新增一个 host 侧持久化模块 + 三处接入点。**引擎层 `@claude-code-best/workflow-engine` 零改动**——持久化是 host 侧关注，不污染引擎接口。

### 组件

| 文件 | 改动 | 职责 |
|---|---|---|
| `src/workflow/persistence.ts` | 新增 | `writeRunState` / `readRunState` / `listPersistedRuns`；原子覆盖写（tmp + rename）；`getRunsDir()` 统一 runsDir 来源 |
| `src/workflow/progress/store.ts` | 改 | 新增 `hydrate(run: RunProgress): void` —— 绕过 bus 直接注入磁盘 run（用于 `loadPersistedRuns`） |
| `src/workflow/service.ts` | 改 | 订阅 bus `run_done` → `writeRunState`；`getRun(id)` 内存 miss → `readRunState` fallback；新增 `loadPersistedRuns(): Promise<void>` |
| `src/workflow/panel/WorkflowsPanel.tsx` | 改 | mount 时调一次 `svc.loadPersistedRuns()`（flag 在 service 单例内部守护，panel 无脑调，重复调用是 no-op） |
| `src/workflow/ports.ts` | 改 | `${getProjectRoot()}/.claude/workflow-runs` 提取为 `getRunsDir()` 共享（消除重复拼接，与 persistence.ts 同源） |

## 数据流

### 写入（终态触发，单一入口覆盖 A+ 所有终态）

```
engine runWorkflow
  └─ progressEmitter.emit({type:'run_done', status, returnValue, error})
     └─ bus.emit
        ├─ store.apply(event)            [store 先订阅，内存 RunProgress 已更新]
        └─ service 订阅 listener          [后订阅，store.get(runId) 拿到最新快照]
           └─ writeRunState(runsDir, runId, snapshot)
              └─ writeFile(state.json.tmp) → rename(state.json)   [原子]
```

**订阅顺序**：bus 是 `Set<listener>`，注册顺序 = 触发顺序。`createProgressStoreFromBus(bus)` 在 service 创建之前先订阅 store；service 后订阅。因此 service 的 `run_done` listener 执行时，`store.get(event.runId)` 已是 apply 后的最新值，直接序列化写盘即可。

**为什么不需要单独的 shutdown 钩子**：`taskRegistrar.kill` → `abortController.abort()` → `runWorkflow` 看到 signal → 发 `run_done killed` → 走同一个订阅。`service.shutdown()` 显式 kill running run 时同样触发 `run_done`。三种终态（completed / failed / killed）共用一个写盘入口。

### 读取① — 面板跨重启展示

```
CLI 重启 → 用户 /workflows → WorkflowsPanel mount
  └─ useEffect: svc.loadPersistedRuns()   [service 内部 persistedLoaded flag 守护，仅一次实际扫盘]
     └─ listPersistedRuns(runsDir)         [扫所有子目录的 state.json]
        └─ store.hydrate(run)              [已存在的 runId 跳过，内存优先]
```

**`persistedLoaded` flag 归属**：放在 `WorkflowService` 单例上（`makeService` 闭包变量），不是 panel 模块级。理由：service 是进程单例，flag 跟随单例生命周期最稳；panel 可能多次 mount/unmount，flag 在 service 上可避免重复扫盘。panel `useEffect` 无脑调 `loadPersistedRuns()`，service 内部判断"已加载过则立即返回 resolved Promise"。

### 读取② — agent 按 runId 取 return

```
service.getRun(id)
  ├─ store.get(id) 命中 → 返回（本次会话的 run）
  └─ miss → readRunState(runsDir, id) → 返回（历史 run，不注入内存）
```

**不注入内存的取舍**：历史 run 进入内存会污染本次会话的 store / 面板列表语义（"内存 = 本次会话产生的 run"这条不变量要保留）。代价是同会话内反复查同一历史 run 会反复读盘——可接受（查询频率低，文件小）。

## state.json 格式

包一层 `schemaVersion` 留 migration 空间，payload 是终态 `RunProgress` 全字段：

```json
{
  "schemaVersion": 1,
  "run": {
    "runId": "w12tp1rrk",
    "workflowName": "audit-agent-system-vs-ultracode",
    "status": "completed",
    "phases": [
      {"title": "Review", "status": "done"},
      {"title": "Verify", "status": "done"}
    ],
    "declaredPhases": ["Review", "Verify"],
    "currentPhase": null,
    "agents": [
      {
        "id": 1,
        "label": "review:hooks",
        "phase": "Review",
        "status": "done",
        "outputShape": "object",
        "tokenCount": 12345,
        "toolCount": 3,
        "model": "claude-sonnet-4-6"
      }
    ],
    "agentCount": 11,
    "returnValue": {"dimensionsAudited": 9, "confirmedCount": 2, "confirmed": []},
    "startedAt": 1718277600000,
    "updatedAt": 1718278000000,
    "description": "Audit workflow engine against ultracode skill spec"
  }
}
```

### 字段决策

- `agents[]` 写完整 `AgentProgress`（含 `label` / `phase` / `status` / `tokenCount` / `toolCount` / `model` / `outputShape` / `resultKind`），**不含 agent 实际 output 内容**——output 已在 `journal.jsonl`，避免冗余。
- 失败 run 的 `error` 字段直接进 `run.error`（`RunProgress` 已有该字段）。
- `returnValue?: unknown` 原样序列化，**不截断**。用户对自己的 return 大小负责（脚本若 return 整个数据库 dump，磁盘占用自负）。

## 错误处理

| 场景 | 行为 |
|---|---|
| `writeRunState` IO 失败（磁盘满 / 权限） | `logForDebugging('[workflow warn] ...')` 吞掉，**不阻断 workflow 完成**——workflow 本身已成功，持久化失败只意味着重启后取不到，可接受 |
| `readRunState` 文件不存在 | 返回 `null`，调用方按 miss 处理 |
| `readRunState` JSON 解析失败 | 返回 `null`，log warn，当 miss（不崩） |
| `readRunState` schema 结构不匹配（缺字段/类型错） | 返回 `null`，log warn，当 miss |
| `schemaVersion` 未来不匹配 | 当前是 `1`，无迁移链，任何非 1 的版本 → 返回 `null` 当 miss（向前兼容兜底）。未来升级版本时再引入迁移函数链 |
| 原子写中途崩溃 | `writeFile(state.json.tmp)` + `rename(tmp, state.json)`，rename 原子；最坏留下 `.tmp` 文件，下次写覆盖 |
| `loadPersistedRuns` 扫到子目录无 `state.json`（只有 journal） | 跳过，不报错（半残 run） |
| `loadPersistedRuns` 扫到某 `state.json` 损坏 | 跳过该单个文件，继续扫其余（一个坏文件不阻塞整体加载） |

## 关键不变量

1. **内存 run 永远优先于磁盘 run** — `store.hydrate` 跳过已存在 runId；`getRun` 内存命中则不读盘。
2. **磁盘是纯终态快照** — 本次会话 running 中的 run 不写盘；进程在 run 终态前被 SIGKILL/断电/crash，该 run 在磁盘上缺失（连 `run_done` 都来不及发）。这是 A+ 接受的边缘情况。
3. **磁盘 run 不注入 `getRun` 路径的内存** — 只有 `loadPersistedRuns`（面板 mount）会 hydrate；`getRun` fallback 仅返回，不 hydrate。
4. **持久化失败不阻断 workflow** — 写盘是 best-effort，IO 异常只 log 不抛。
5. **引擎层零改动** — 所有持久化逻辑在 host 侧（`src/workflow/`），引擎 `@claude-code-best/workflow-engine` 接口不变。

## 测试策略

### `src/workflow/__tests__/persistence.test.ts`（新增）— 纯 fs，用 tmpdir

- `writeRunState` → `readRunState` 往返一致（含 `returnValue` 为对象 / 数组 / 字符串 / null 各形态）
- `writeRunState` 原子性：构造 tmp 残留场景，验证 `state.json` 要么完整要么不存在，无半写
- `readRunState` 损坏 JSON / 缺文件 / schemaVersion 不符 / 必需字段缺失 → 均返回 `null`
- `listPersistedRuns` 扫多子目录、跳过无 `state.json` 的目录、跳过损坏文件、按 `updatedAt` 降序返回

### `src/workflow/__tests__/store.test.ts`（扩展）

- `hydrate(run)` 注入新 runId → `get` 命中、`list` 含该项
- `hydrate(run)` 已存在 runId → 跳过（内存值不被磁盘覆盖）
- `hydrate` 后 `subscribe` listener 被通知

### `src/workflow/__tests__/service.test.ts`（新增 / 扩展）— 注入 fake bus / ports / tmpdir

- bus emit `run_done completed` + returnValue → `readRunState(runId)` 命中且 returnValue 一致
- bus emit `run_done failed` + error → state.json 写入 status=failed + error 字段
- bus emit `run_done killed` → state.json 写入 status=killed
- bus emit `run_done` 但 `writeRunState` 抛 IO 错 → service 不抛、其他订阅者（store）仍正常
- `getRun(id)` 内存命中 → 不读盘（spy 断言 readRunState 未被调）
- `getRun(id)` 内存 miss + 磁盘命中 → 返回磁盘值；再次 `getRun(id)` 仍读盘（未注入内存）
- `getRun(id)` 内存 miss + 磁盘 miss → 返回 undefined
- `loadPersistedRuns()` 扫盘后 `listRuns()` 含历史 run；已有内存 runId 不被磁盘覆盖

### `src/workflow/__tests__/WorkflowsPanel.test.tsx`（扩展）

- WorkflowsPanel mount → 调一次 `loadPersistedRuns`（spy 断言调用次数 = 1）
- 重复 mount / 重渲染 → 不重复调用（`persistedLoaded` flag 防重入）

### 回归

- `bun test src/workflow/` 全套通过
- `bun run precheck` 零错误（typecheck + lint fix + test）

## 实现顺序提示（供 writing-plans 展开）

1. `persistence.ts` + 单测（最底层，无依赖）
2. `store.ts` 加 `hydrate` + 单测
3. `ports.ts` 提取 `getRunsDir()`
4. `service.ts` 订阅 `run_done` + `getRun` fallback + `loadPersistedRuns` + 单测
5. `WorkflowsPanel.tsx` mount 触发 + 测试
6. 全量 `precheck`

## 未来工作（明确不在本 spec）

- **跨进程 resume (c)** — 需重建 agent binding / abort / 中间态，独立特性
- **生命周期管理** — 数量 cap / 时间 cap / 手动清理命令
- **return 值大小限制** — 若发现滥用，再加 schema 级 cap 与截断策略
- **schema migration 链** — 当 `schemaVersion` 升到 2 时再引入
