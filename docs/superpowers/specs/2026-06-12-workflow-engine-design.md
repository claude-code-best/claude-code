# Workflow Engine — 重建设计

- 日期：2026-06-12
- 状态：已通过 brainstorming，待 writing-plans
- 范围：把被掏空的「清单推进」版 WorkflowTool 重建为**完整忠实的确定性 JS 脚本编排引擎**，并**独立成包**，解除与核心层的深度依赖。

## 1. 背景与现状

当前 `packages/builtin-tools/src/tools/WorkflowTool/WorkflowTool.ts` 是个被阉割的版本：把 `.claude/workflows/` 里的 `.md`/`.yaml` 解析成清单，靠模型手动调用 `advance` 推进，**没有任何子 agent 编排能力**。

真正的 Workflow 能力是一个**确定性 JS 脚本编排引擎**：后台执行脚本，提供 `agent()`/`parallel()`/`pipeline()`/`phase()`/`log()` 钩子，真正 spawn 子 agent，支持 schema 校验、并发上限、journaling/resume、token budget、进度流。

### 可复用的现有基础设施

- `src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts`：完整的后台任务生命周期（register/complete/fail/kill/skip/retry/orphan 清理）。**完好，复用**。
- `packages/builtin-tools/src/tools/AgentTool/runAgent.ts`：子 agent 执行核心（async generator，接收 `agentDefinition`+`promptMessages`+`toolUseContext`+`canUseTool`，运行完整 query 循环）。**作为 `agent()` 钩子后端**。
- `assembleToolPool`（`src/tools.ts`）：构建子 agent 工具池。
- `finalizeAgentTool` / `extractTextContent`（`agentToolUtils.ts`）：抽取 agent 最终消息 + usage。
- `WorkflowPermissionRequest.tsx`：权限 UI（核心侧 React，复用）。
- `tools.ts` 已用 `WORKFLOW_SCRIPTS` feature flag 接好注册位；`constants/tools.ts` 的 `CORE_TOOLS` 在 flag 开启时含 `workflow`。

## 2. 关键决策（brainstorming 结论）

1. **范围**：完整忠实引擎——全部钩子 + schema 结构化输出 + 并发上限（16/1000/4096）+ journaling/resume + token budget + worktree 隔离 + named-workflow 加载 + 进度流到 `/workflows`。
2. **包边界**：**严格端口适配（依赖倒置）**。`packages/workflow-engine/` 零 `src/*` / `builtin-tools` 运行时导入；只声明端口接口；核心侧提供一个 adapter 模块实现这些接口；`tools.ts` 装配时注入。
3. **文件模型**：`.claude/workflows/<name>.ts|.js|.mjs` 脚本文件 → 命名 workflow（`Workflow` 工具 `name` 参数解析到它）+ 生成 `/<name>` 斜杠命令；`/workflows` 变为实时进度查看器。**删除** 现有 `.md`/`.yaml` 清单逻辑。
4. **执行路径**：**async 函数包装 + 信号量 + 注入端口**（方案 A）。进程内 async 模型，与 `runAgent` 的 async generator 天然契合，端口可 mock 测试。不用 `vm` 沙箱或 worker 进程。

## 3. 架构与依赖方向

```
┌─────────────────────────────────────────────────────────────┐
│  packages/workflow-engine/   ← 新包，零 src/* 运行时导入     │
│  声明端口（接口），持有引擎/钩子/并发/journal/budget/schema │
│  + 自包含的 WorkflowTool 描述符（zod schema/desc/prompt）    │
└──────────────▲──────────────────────────▲───────────────────┘
               │ 实现（implements）        │ 注入（DI）
┌──────────────┴──────────────────────────┴───────────────────┐
│  src/workflow/  ← 核心侧薄层                                 │
│  adapter.ts: 用 runAgent/assembleToolPool/LocalWorkflowTask │
│              /AppState 实现端口                              │
│  wiring.ts:   createWorkflowTool(adapter) → 适配为 Tool      │
│              注册到 tools.ts（WORKFLOW_SCRIPTS flag 之后）   │
└─────────────────────────────────────────────────────────────┘
```

包**不认识** `buildTool` / `toolUseContext` / `runAgent` / `Message` 类型。仅通过端口接口与不透明 host 句柄对话。

### 端口契约（包内 `ports.ts`）

| 端口 | 职责 | 核心侧 adapter 实现 |
|---|---|---|
| `AgentRunner` | `agent()` 后端：`runAgentToResult(params, hostHandle) → AgentRunResult` | 委托 `runAgent` + `assembleToolPool`；schema 时注入 StructuredOutput 工具；`finalizeAgentTool` 抽取最终消息 + usage |
| `ProgressEmitter` | `emit(event)` 推进度事件 | 写 `LocalWorkflowTaskState.progress` + `rootSetAppState` |
| `TaskRegistrar` | 后台任务生命周期 + 读 `pendingAgentAction` | 复用 `LocalWorkflowTask` API |
| `JournalStore` | journal 读写（按 runId） | 文件 fs（`.claude/workflow-runs/<runId>/journal.jsonl`），走端口便于 mock |
| `PermissionGate` | `agent()` 前置权限/取消检查 | abort signal + `pendingAgentAction` |
| `Logger` | 调试日志 + 遥测 | `logForDebugging` / `logEvent` |

**不透明 host 句柄**：`HostHandle = { readonly __workflowHost: unique symbol }`。核心侧每次工具调用构造一个句柄（内含 `toolUseContext`/`canUseTool`/`agentId` 等），包内绝不检视，只透传给 `AgentRunner`；adapter 把它 cast 回核心上下文。包对核心类型零依赖的唯一缝隙，且是不透明的。

### 包结构

```
packages/workflow-engine/
  package.json            @claude-code-best/workflow-engine (workspace:*)
  tsconfig.json
  src/
    index.ts              公共导出
    ports.ts              端口接口 + HostHandle
    types.ts              纯类型（WorkflowInput/Run/JournalEntry/ProgressEvent/AgentRunParams…）
    tool/
      WorkflowTool.ts     createWorkflowTool(ports) → 自包含描述符
      schema.ts           输入 schema（script/name/scriptPath/args/resumeFromRunId/desc/title）
      constants.ts        WORKFLOW_TOOL_NAME 等
    engine/
      runWorkflow.ts      引擎入口：校验/包装/执行/journal/resume
      context.ts          执行上下文（端口/信号量/budget/journal/计数器/host）
      hooks.ts            agent/parallel/pipeline/phase/log/workflow 实现
      script.ts           meta 字面量提取 + async 包装 + 沙箱 shim
      concurrency.ts      Semaphore + 上限（16 / 1000 总 / 4096 每次调用）
      journal.ts          hash + 读/写 journal
      budget.ts           budget 累加器（total/spent/remaining）
      structuredOutput.ts JSON Schema → 结果校验（纯函数）
      namedWorkflows.ts   name → .claude/workflows/<name>.ts|js|mjs 解析（仅 fs）
      constants.ts        目录/上限常量
    progress/events.ts    ProgressEvent 类型 + emit 委托
    __tests__/ …
```

核心侧薄层：`src/workflow/adapter.ts` + `src/workflow/wiring.ts`；`packages/builtin-tools` 从新包 re-export 描述符。

## 4. 引擎内部

### 4.1 钩子语义

| 钩子 | 语义 | 失败行为 |
|---|---|---|
| `agent(prompt, opts?)` | 取信号量 → 查 journal（命中即返回缓存）→ 调 `AgentRunner` → 写 journal → 返回 | 终态 API 错耗尽重试 → `null`（不抛） |
| `parallel(thunks)` | **屏障**：`Promise.all` 所有 thunk（每个内部各自过信号量）；wall-clock = 最慢项 | 单项抛错/agent 错 → 该项 `null`；调用本身永不 reject |
| `pipeline(items, …stages)` | **无屏障**：每项跑 `stage1→stage2→…` 异步链，多链并发；stage 回调收 `(prevResult, originalItem, index)` | 某 stage 抛错 → 该项 `null`、跳过后续 stage |
| `phase(title)` | 开启新阶段，后续 agent/log 归入该组直到下次 `phase()` | — |
| `log(message)` | 向用户发一行旁白进度 | — |
| `workflow(nameOrRef, args?)` | 内联跑子 workflow，返回其返回值；共享并发/计数/budget；`/workflows` 显示为 `▸ name` 组 | 子 workflow 内再嵌套 → 抛错（仅一层） |

`agent` 的 `opts`：`label`、`phase`（显式分组）、`schema`（JSON Schema）、`model`、`isolation:'worktree'`、`agentType`（自定义子 agent 类型）、`allowedTools`。

- 无 schema 返回 `string`；有 schema 返回校验对象；用户 skip / agent 终态死亡 → 返回 `null`。

### 4.2 并发与上限（`concurrency.ts`）

- `Semaphore` 许可数 = `min(16, cpuCores - 2)`；`agent()` 取 1。
- 单个 workflow 生命周期**总 agent 数 ≤ 1000** → 超出抛错。
- 单次 `parallel`/`pipeline` 调用 **items ≤ 4096** → 超出抛错（显式错误，不静默截断）。

### 4.3 Journal / Resume（`journal.ts`）

- journal = 按**执行顺序**的 `{ key, result }` 列表，存 `.claude/workflow-runs/<runId>/journal.jsonl`。
- `key` = `hash(prompt + canonical(opts 去掉 label/phase 等纯展示字段))`。
- 命中：`agent()` 先算 key，与 journal 下一项 key 比对 → **匹配则返回缓存并前进**，不匹配则丢弃后续 journal、现场重跑。
- 因 JS 去掉 `Date.now`/`random` 后确定，执行顺序确定 → 自然得到「最长未变前缀命中、首个发散点之后全重跑」。
- `resumeFromRunId`：载入该 run 的 journal 重放。脚本源码 hash 一致 → 100% 命中；脚本改动 → 全重跑。脚本 hash 存入 run 记录。

### 4.4 Budget（`budget.ts`）

- `budget.total`：来自用户 `+500k` 式 turn 级 token 指令，由 **host/turn 上下文注入**（adapter 从 turn 的 token 指令读取，经 `HostHandle` 传入），**不是** 工具 input 参数。无指令则 `null`。
- `budget.spent()`：本 turn 所有 agent 输出 token 之和（`AgentRunResult.usage`，adapter 从 subagent usage 填）。
- `budget.remaining()`：`max(0, total - spent)`，无 total 则 `Infinity`。
- **硬上限**：`spent()` 达 `total` 后，`agent()` 抛错。预算是主循环与 workflow 共享池。

### 4.7 AgentRunResult 类型（`types.ts`）

`AgentRunner.runAgentToResult` 的返回，包内明确定义为联合类型：

```ts
type AgentRunResult =
  | { kind: 'ok'; output: string | object; usage: { outputTokens: number } }
  | { kind: 'skipped' }   // 用户 skip → agent() 返回 null
  | { kind: 'dead' }      // 终态 API 错耗尽重试 → agent() 返回 null
```

`output` 为 `string`（无 schema）或已校验对象（有 schema）。`agent()` 据此映射：`ok`→返回 output，`skipped`/`dead`→返回 `null`。

### 4.5 脚本包装与沙箱（`script.ts`）

1. 提取 `export const meta = { … }`——**必须是纯字面量**（无变量/插值/展开），解析为对象；缺失或非字面量 → 抛错。
2. 剥离 `export const meta` 语句。
3. 剩余 body（含顶层 `return`）包进 `async function(agent, parallel, pipeline, phase, log, workflow, args, budget, Date, Math){ <body> }`。
4. 以**抛异常的 shim** 传入 `Date`（`now()`/无参 `new Date()` 抛）、`Math`（`random()` 抛）——靠函数参数 shadow 全局，使裸 `Date.now()` 命中 shim。这是确定性保障，非密码学级沙箱（与真实引擎意图一致：阻断 resume 破坏性的非确定性）。
5. meta 的 `phases` 可用于进度预声明（可选）。

### 4.6 进度事件（`progress/events.ts`）

`ProgressEmitter.emit(event)` 类型：`run_started`、`phase_started/done`、`agent_started/done{label,phase,result摘要}`、`log`、`run_done{returnValue/status}`。adapter 写入 task 进度结构 + AppState，`/workflows` 视图消费。

## 5. 错误处理

| 场景 | 行为 |
|---|---|
| 脚本无 `meta` / `meta` 非字面量 / 语法错 | 引擎抛错 → task `failed` → 通知带错误信息 |
| `Date.now`/`Math.random`/`new Date()` | shim 抛 → 冒泡为脚本错误 → task failed |
| `agent()` 终态 API 错（重试耗尽） | 返回 `null`，**不杀** workflow |
| `parallel`/`pipeline` 单项抛错 | 该项 `null`，workflow 继续 |
| budget 耗尽 | `agent()` 抛错（脚本可 try/catch） |
| 并发/1000/4096 上限 | 抛错 |
| kill（abort） | signal 传播；`agent()` 检查 signal；workflow 停；task `killed`；通知 partial |
| 工具调用层（`call`）脚本非法 | 直接返回错误给模型（不进后台） |

## 6. 测试策略

包内全量单测，**无需真实 LLM**（mock 端口——解耦的核心收益）：

- `engine.test.ts`：mock `AgentRunner`（按 prompt 返回预设结果）端到端跑脚本，断言返回值 + 进度事件序列。
- `hooks.test.ts`：parallel 单项错→null、pipeline 无屏障顺序、agent schema 校验、skip/dead→null。
- `concurrency.test.ts`：信号量限并发、1000/4096 上限抛错。
- `journal.test.ts`：hash 稳定、resume 命中前缀、脚本变更全重跑、中途发散重跑尾部。
- `budget.test.ts`：spent 累加、触顶抛错。
- `script.test.ts`：meta 字面量提取、非字面量/语法错、shim 抛。
- `structuredOutput.test.ts`、`namedWorkflows.test.ts`。

核心侧最小冒烟：adapter 用 `runAgent` 真接线的重 mock 测试；wiring 注册测试。重量级逻辑都在包内。可选：`tests/integration/` 加一个 workflow tool-chain 集成测试（feature-gated）。

## 7. 核心侧实现

### 7.1 adapter（`src/workflow/adapter.ts`）

`createWorkflowAdapter()` 返回端口实现：

- **AgentRunner.runAgentToResult(params, hostHandle)**：cast 句柄→`{toolUseContext, canUseTool, assistantMessage}`；按 `params.agentType` 从 registry 解析 agentDefinition（缺省=通用 workflow 子 agent）；`assembleToolPool`；有 schema→注入 StructuredOutput 工具+系统指令；调 `runAgent` 收消息→`finalizeAgentTool` 抽 text+usage；schema→解析校验返回对象；处理 `pendingAgentAction`(skip)→`null`、终态死亡→`null`；返回 `{kind:'ok', text/object, usage}`。
- **ProgressEmitter**：写 `LocalWorkflowTaskState.progress` + `rootSetAppState`。
- **TaskRegistrar**：复用现有 `registerLocalWorkflowTask/complete/fail/kill` + 读 `pendingAgentAction`。
- **JournalStore / Logger / PermissionGate**：fs / `logForDebugging`+`logEvent` / abort+pendingAction。

### 7.2 wiring（`src/workflow/wiring.ts`）

- `createWorkflowTool()`：建 adapter → 调包的 `createWorkflowTool(adapter)` 得描述符 → 包成 `buildTool` 兼容 `Tool` 返回。
- `tools.ts`：`const WorkflowTool = feature('WORKFLOW_SCRIPTS') ? require('./workflow/wiring.js').createWorkflowTool() : null`（替换现有清单版）。

`call` 流程：校验脚本（inline/file/named 解析）→ meta 校验失败直接返错给模型 → 持久化脚本 + 算 hash → resume 则载入 run+journal → 注册后台 task → **立即返回 `{runId, scriptPath}`** → 脱离执行引擎、流进度 → 完成时 complete + 通知（返回值/错误）。

## 8. 现有文件迁移

| 文件 | 处理 |
|---|---|
| `builtin-tools/.../WorkflowTool/WorkflowTool.ts`（清单版） | 删除，逻辑移入新包 |
| `constants.ts`（WORKFLOW_TOOL_NAME） | 移入包 `tool/constants.ts`，core 侧 re-export |
| `WorkflowPermissionRequest.tsx`（React UI） | 移到 `src/workflow/`（依赖 src 权限组件，属核心侧） |
| `createWorkflowCommand.ts`（.md/.yaml 扫描） | 改为扫 `.ts/.js/.mjs` → 生成 `/<name>` 命令，调用时以脚本启动引擎 |
| `bundled/index.ts`（no-op） | 保留为包的 bundled-workflow 扩展点 |
| `src/utils/workflowRuns.ts`（清单记录） | 重写为 run+journal 模型（或并入包 JournalStore） |
| `src/commands/workflows/index.ts` | 改为**实时进度查看器**，复用 `WorkflowDetailDialog.tsx` |
| `src/tasks.ts` LocalWorkflowTask 门控 | 保持不变 |
| `constants/tools.ts` CORE_TOOLS 含 `workflow` | 保持 |

## 9. 工作分解（writing-plans 将细化）

1. 新建包 `packages/workflow-engine/`（package.json/tsconfig/类型/端口/常量）。
2. 引擎核心：script 包装、concurrency、journal、budget、structuredOutput、namedWorkflows。
3. 钩子实现 + runWorkflow 编排 + 进度事件。
4. 自包含工具描述符（schema/desc/prompt/result 映射）。
5. 包内全量单测。
6. 核心侧 adapter + wiring + 句柄构造。
7. 迁移现有文件、改 `/workflows` 为进度查看器、改 named-workflow 命令。
8. `bun run precheck` 零错误；手动 dev 冒烟。

## 10. 非目标 / 风险

- **非密码学沙箱**：函数参数 shadow 全局 `Date`/`Math`，`globalThis.Date` 仍可达。可接受——目标是阻断 resume 破坏性的非确定性，不是隔离恶意代码。若未来需强隔离再上 `vm`/worker（方案 B/C）。
- **resume 正确性依赖确定性执行**：用户脚本若绕过 shim 用 `globalThis.Date` 制造非确定性，resume 可能命中错缓存。属可接受的边界，文档提示。
- **预算共享语义**：`budget.spent()` 与主循环的 token 计数共享，需 adapter 正确上报 subagent usage；若 provider 不报 usage 则 budget 降级为 `Infinity`。
- **StructuredOutput 工具**：核心侧需存在/实现一个按 JSON Schema 强制结构化输出的子 agent 工具（注入 + 解析）。若当前无现成实现，wiring 阶段补一个最小版本。
