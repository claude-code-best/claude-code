# Workflow 集成层重写 + `/workflows` 面板 + `/ultracode` skill 设计

> 状态：草案（待 writing-plans 据此产出实施计划）
> 日期：2026-06-13
> 关联：上一期引擎重建计划 `docs/superpowers/plans/2026-06-12-workflow-engine.md`、spec `docs/superpowers/specs/2026-06-12-workflow-engine-design.md`

---

## 1. 背景与现状

引擎包 `packages/workflow-engine/`（`@claude-code-best/workflow-engine`）已重建完成：`runWorkflow`、hooks（`agent`/`parallel`/`pipeline`/`phase`/`log`/`workflow`）、journal 确定性 resume、budget、concurrency、structuredOutput、`AgentAdapter` + `AgentAdapterRegistry`（commit `c2253dcb`）、端口契约（`WorkflowPorts`）与自包含工具描述符（`createWorkflowTool`），单测覆盖 99.65%。

`src/` 侧的集成层（`src/workflow/`）虽已接上引擎，但**没有用上引擎的全部能力**，且 TUI/命令层是占位质量：

- `src/workflow/adapter.ts`：硬编码单一 `WORKFLOW_AGENT`（不查 `AgentAdapterRegistry`，也没接真实 agent 注册表）；`taskRegistrar.pendingAction` 恒返回 `null`（skip/retry 未接线）；`permissionGate.isAborted` 恒 `false`；`budgetTotal` 恒 `null`；末尾有 `_AppStateUsed` 这类抑制未用导入的补丁。
- `src/workflow/progressStore.ts`：`agent_done` 把"最后一个 running 的 agent"标完成——并发下会标错（真竞态）。
- `/workflows`：`local` 命令，返回**纯文本**清单，不是监控面板——本设计将其原地重写为全屏面板。
- `/ultracode`：**不存在**。

本设计把 `src/workflow/` 集成层**全量重写**，使其真正用上引擎能力，并交付全屏监控+控制面板与 ultracode 启动 skill。

## 2. 目标与非目标

**目标**

1. 全量重写 `src/workflow/` 集成层（引擎包为地基，不动其核心）。
2. 后端为单一 `claude-code` `AgentAdapter`，但**深度接入会话体系**：provider/model/agentType/tools/telemetry 全从活的 `AppState` 解析。
3. 把 `/workflows` **原地重写**为全屏**双栏**面板：左栏=各 workflow 的阶段树（光标移动），右栏=聚焦 workflow 的 agent 运行状况 + 基础信息；监控 + 控制（启动命名/resume/kill/展开）。
4. 新增 `/ultracode` **纯知识 prompt skill**：把 workflow 编排工作法注入上下文，零运行时副作用。
5. 旧 `/workflows` 文本命令重写为面板；接线点切换到新 wiring，外部 `Tool`/命令接口不变。

**非目标**

- 不改引擎包核心逻辑（唯一例外：给进度事件加 `agentId`，见 §5）。
- 不实现多 provider adapter（v1 单后端；Registry 留扩展点但不预填路由规则）。
- 不做 per-agent skip/retry 的 UI 接线（引擎 seam 保留，见 §12）。
- 不翻转 `ultracode` 运行时行为开关（纯知识 skill）。
- 不做跨进程持久化的进度恢复（live runs 留内存；resume 走 journal）。

## 3. 范围与迁移清单

**新建**

| 路径 | 职责 |
|---|---|
| `src/workflow/service.ts` | `WorkflowService` 单例门面 |
| `src/workflow/registry.ts` | 建 `AgentAdapterRegistry`，注册单一 `claude-code` adapter |
| `src/workflow/backends/claudeCodeBackend.ts` | 深度集成的 `AgentAdapter`（runAgent 委托 + 体系解析） |
| `src/workflow/backends/types.ts` | 后端/host 解析类型 |
| `src/workflow/ports.ts` | 组装 `WorkflowPorts`（registry + 任务生命周期 + journal + progress bus） |
| `src/workflow/progress/bus.ts` | 类型化发布/订阅事件总线 |
| `src/workflow/progress/store.ts` | reducer：`ProgressEvent` → `RunProgress[]`（按 `agentId` 关联） |
| `src/workflow/panel/WorkflowsPanel.tsx` | 双栏全屏面板（local-jsx） |
| `src/workflow/panel/WorkflowList.tsx` / `WorkflowDetail.tsx` / `useWorkflowKeyboard.ts` | 左栏 workflow 扁平列表 / 右栏 phase 条+agent 列表 / 键位 |
| `src/skills/bundled/ultracode/SKILL.md` | `/ultracode` 知识 skill |

**重写（整体替换，非打补丁）**

- `src/workflow/adapter.ts` → 拆解进 `backends/`+`ports.ts`+`registry.ts`
- `src/workflow/wiring.ts` → 薄包装，走 `service`
- `src/workflow/progressStore.ts` → 拆进 `progress/{bus,store}.ts`
- `src/workflow/hostHandle.ts` → 清理（保留不透明 bundle 语义）
- `src/workflow/namedWorkflowCommands.ts` → 重写（扫 `.claude/workflows/` → `/<name>`）
- `src/commands/workflows/index.ts` → 原地重写：`local` 文本命令 → `local-jsx` 面板入口（命令名仍为 `workflows`）

**改接线点（接口不变，换实现来源）**

`src/tools.ts`、`src/commands.ts`、`src/tasks.ts`、`src/constants/tools.ts`、`src/utils/permissions/classifierDecision.ts`、`src/components/permissions/PermissionRequest.tsx`、`src/components/tasks/BackgroundTasksDialog.tsx`（workflow 详情入口改为打开 `/workflows <runId>`）。

**删除**

- `src/components/tasks/WorkflowDetailDialog.tsx`（详情视图被 `/workflows` 右栏 `WorkflowDetail` 取代；逻辑并入，`BackgroundTasksDialog` 改为跳转 `/workflows`）。

**引擎微调**

- `packages/workflow-engine/src/types.ts`、`src/engine/hooks.ts`：`agent_started`/`agent_done` 加 `agentId: number`（见 §5）。

## 4. 架构总览

```
src/workflow/
├─ service.ts                  # launch/resume/kill/listRuns/getRun/subscribe/listNamed
├─ registry.ts                 # AgentAdapterRegistry（单一 claude-code adapter，default 路由）
├─ hostHandle.ts               # 不透明 host bundle（toolUseContext/canUseTool/parentMessage/agentId）
├─ ports.ts                    # WorkflowPorts = { hostFactory, agentRunner(registry), progressEmitter(bus+store), taskRegistrar, journalStore, permissionGate, logger }
├─ backends/
│   ├─ claudeCodeBackend.ts    # AgentAdapter：深度解析 + runAgent 委托
│   └─ types.ts
├─ progress/
│   ├─ bus.ts                  # emit→多订阅者（store / 面板 / 遥测）
│   └─ store.ts                # RunProgress[] reducer（agentId 关联）
├─ panel/
│   ├─ WorkflowsPanel.tsx      # 双栏，useSyncExternalStore 订阅 store
│   ├─ WorkflowList.tsx        # 左栏：扁平 workflow 列表（名字+状态+当前 phase+计数）
│   ├─ WorkflowDetail.tsx      # 右栏：聚焦 workflow 的 phase 横条 + 扁平 agent 列表
│   └─ useWorkflowKeyboard.ts
├─ wiring.ts                   # createWorkflowToolCore(): buildTool(引擎描述符)
└─ namedWorkflowCommands.ts    # 扫描→/<name>
```

**依赖方向**：`panel` 与 `wiring`（工具）只依赖 `service`；`service` 依赖 `registry`+`ports`+`progress`+引擎；`backends` 依赖 `hostHandle`+核心 `runAgent`。引擎包零 `src/*` 导入不变。

## 5. 引擎微调：进度事件加 `agentId`

当前 `agent_started`/`agent_done` 只带 `label`/`phase`，reducer 只能 LIFO 猜匹配。改为：

```ts
// packages/workflow-engine/src/types.ts（变体加字段）
| { type: 'agent_started'; runId: string; agentId: number; label?: string; phase?: string }
| { type: 'agent_done';   runId: string; agentId: number; label?: string; phase?: string; result: AgentRunResult }
```

`makeHooks`（`engine/hooks.ts`）维护引擎内递增计数器（非脚本沙箱内，可用普通计数器，不受 Date/Math 禁令影响），在 `agent()` 内为每次调用分配 `agentId`，同时盖戳 `agent_started` 与 `agent_done`。`pipeline`/`parallel` 内并发调用各自独立 id，reducer 按 id 精确落位。补 `hooks.test.ts`：并发 agent 的 started/done id 配对回归。

## 6. WorkflowService

```ts
type HostContext = { handle: HostHandle; cwd: string; budgetTotal: number | null; toolUseId?: string }

type WorkflowService = {
  launch(opts: {
    source: { script: string } | { name: string } | { scriptPath: string }
    args?: unknown
    hostContext: HostContext        // 调用方构造（工具/面板各自）
    description?: string
    resumeFromRunId?: string
  }): Promise<{ runId: string }>    // 立即返回，后台 detached
  resume(runId: string, hostContext: HostContext): Promise<void>
  kill(runId: string): void          // AbortController.abort() → WorkflowAbortedError → killed
  listRuns(): RunProgress[]
  getRun(runId: string): RunProgress | undefined
  subscribe(listener: () => void): () => void   // 供 useSyncExternalStore
  listNamed(): Promise<string[]>                 // 委托 namedWorkflows
}
```

**数据流**：`launch` → 解析脚本源 → `parseScript` 快速校验 → 注册 `LocalWorkflowTask`（拿 runId + AbortSignal）→ `progress.bus.emit(run_started)` → `runWorkflow({ ports, host, signal, runId, ... })` detached → 引擎经 hooks 发 `ProgressEvent` → `ports.progressEmitter.emit` 同时喂 `bus`（订阅者）与 `store`（reducer）→ 面板 `useSyncExternalStore` 重渲染。

**host context 来源（关键解耦）**：service 不自造 host，由调用方传 `HostContext`：

- **工具路径**：`wiring.ts` 的 `call` 用引擎 `ports.hostFactory({ context, canUseTool, parentMessage })` 构造（沿用现状）。
- **面板路径**：`/workflows` 是 local-jsx，回调拿 `ToolUseContext`；面板用它 + 会话 `canUseTool`（按当前权限模式）构造 host，使面板启动的 workflow 子 agent 享有与主会话一致的工具池与权限。

单例：`service`、`ports`、`registry`、`bus`、`store` 全进程共享，保证工具与面板同源（修掉旧"每实例一套 adapter/bindings"的隐患）。

## 7. 后端深度集成（depth B：单一 adapter，深度读体系）

`claudeCodeBackend.ts` 实现引擎 `AgentAdapter` 接口，`run(params, ctx)` 内**主动从活会话体系解析**，再委托核心 `runAgent`：

```ts
// backends/claudeCodeBackend.ts（签名级草图）
export const claudeCodeBackend: AgentAdapter = {
  id: 'claude-code',
  capabilities: { structuredOutput: true, modelOverride: true },
  async run(params: AgentRunParams, ctx: AgentAdapterContext): Promise<AgentRunResult> {
    const { toolUseContext, canUseTool } = unwrapHostBundle(ctx.host)
    const appState = toolUseContext.getAppState()

    // 1) agentType → 真实 agent 注册表（不再硬编码 WORKFLOW_AGENT）
    const agentDef = resolveAgentDefinition(params.agentType, toolUseContext)  // activeAgents 命中；WORKFLOW_AGENT 兜底

    // 2) model → provider 模型映射
    const resolvedModel = params.model ? mapWorkflowModel(params.model, appState) : undefined

    // 3) 工具池（活权限上下文）
    const tools = assembleToolPool(workerPermissionContext(appState, agentDef), appState.mcp.tools)

    // 4) schema → StructuredOutput 指令；prompt 组装
    // 5) runAgent({ agentDefinition, promptMessages, toolUseContext, canUseTool,
    //               isAsync: true, availableTools: tools, override: { agentId, model: resolvedModel } })
    // 6) finalizeAgentTool → 取 outputTokens / 文本 / 结构化对象 → AgentRunResult
    //    失败 → { kind: 'dead' }
  },
}
```

要点：

- **provider 感知**：`mapWorkflowModel` 走 `src/utils/model/` 把 `claude-haiku-*` 这类别名解析为当前 provider 的实际 model id；provider 来自 `src/utils/model/providers.ts` 的会话判定。
- **agentType → 真实注册表**：`resolveAgentDefinition` 查 `toolUseContext.options.agentDefinitions.activeAgents`，命中即用（Explore/code-reviewer 等内置 + 用户 agent）；未命中或无 `agentType` 退 `WORKFLOW_AGENT` 兜底。
- **工具池/权限**：worker 权限上下文取 agent 定义或 `acceptEdits`，`assembleToolPool` 生成。
- **遥测/token**：`finalizeAgentTool` 的 `usage.output_tokens` 喂 engine budget；`logEvent('tengu_workflow_agent', {…})` 逐 agent 计量。
- **Registry**：`registry.ts` = `new AgentAdapterRegistry().register(claudeCodeBackend).default('claude-code')`。`ports.agentRunner.runAgentToResult = (params, host) => registry.resolve(params).run(params, { host })`。v1 不预填路由规则（depth B：单 adapter，不预留多 provider 路由）。

## 8. 进度模型（bus + store + agentId 关联）

- `progress/bus.ts`：`createProgressBus()` 返回 `{ emit(event), subscribe(fn) }`。emit 广播给所有订阅者（store、面板、遥测）。替换旧"只有 in-memory Map"的单消费者模型。
- `progress/store.ts`：`RunProgress[]` reducer，沿用 `RunProgress` 形状（runId/status/phases/currentPhase/agents/logs/agentCount/returnValue/error/updatedAt）。新增 `AgentProgress.id: number`；`agent_done` 按 `event.agentId` 精确匹配 `agents[].id`（修掉旧 LIFO 竞态）。`subscribe()` 暴露给 React `useSyncExternalStore`。
- 状态为进程内（live runs）；resume 读磁盘 journal（`.claude/workflow-runs/<runId>/journal.jsonl`）。

## 9. `/workflows` 双栏面板（左列表 / 右 phase+agent）

`/workflows` 命令**原地重写**为 `local-jsx`（替换原文本命令），渲染**双栏**面板：走 `FullscreenLayout.modal` 路径（底部锚定、向上生长，`maxHeight ≈ terminalRows`，留 2 行 transcript peek，与 `/model`、`/config` 一致），`useSyncExternalStore` 订阅 `service.subscribe` 实时刷新。**左栏=扁平 workflow 列表（极简），右栏=聚焦 workflow 的 phase 横条 + 扁平 agent 列表**。无树、无嵌套。

```
Workflows · 2 running · 1 done                   q quit

▸ ● review-pipeline     Verify 2/3   8/12
  ● smoke-test          Pong         3/3
  ✓ code-audit          done         11/11

  Named: research-report · smoke

─────────────────────────────────────────────────
review-pipeline   ● running

  Phases  ✓Find ✓Review ●Verify
  ● verify:api 1.2k   · verify:db —
  ✓ find:src 3.1k    ✓ verify:auth 2.0k

j/k run · r resume · x kill · n new
```

**导航模型**：左栏是扁平 workflow 列表——每行一个 run（状态点 + 名称 + 当前 phase + `done/total` agent 计数），光标 `▸` 用 `j/k` 上下选 run，选中即聚焦、右栏随之切换。底部 NAMED 区（`service.listNamed()`，`n` 启动）。无展开/收起、无嵌套。

**组件**

- `WorkflowList.tsx`：左栏。`service.listRuns()` → 每行 `●`/`✓` 状态点 + workflow 名 + 当前 phase + agent 计数；底部 NAMED。
- `WorkflowDetail.tsx`：右栏。一行头（workflow 名 + 状态）+ **Phases 横条**（`✓`/`●`/`○` 内联）+ **扁平 agent 列表**（每项状态符 + label + token，自动换行排版，不嵌套）。终态显示 `returnValue`/`error`。
- `useWorkflowKeyboard.ts`：键位见下。

**键位**：`j/k` 选 run · `r` resume 聚焦 workflow（读 journal）· `x` kill · `n` 选命名 workflow 启动 · `q`/`esc` 经 `onDone()` 关闭。空 run 时左栏聚焦 NAMED，右栏给"新建脚本到 `.claude/workflows/`"提示。

**颜色（Impeccable 体系）**：running = Claude Orange `#D77757` 动态点；done = 绿；failed = 红；killed = 灰；底栏键位 `subtle`。

**与 `WorkflowDetailDialog.tsx` 的关系**：该旧组件删除，详情逻辑并入右栏 `WorkflowDetail`；`BackgroundTasksDialog`（Shift+Down）保留为后台任务总览，其 workflow 详情跳转改为打开 `/workflows <runId>`，面板以该 run 为初始聚焦。

**命令注册**：`src/commands/workflows/index.ts` 导出 `local-jsx` 命令（`load: () => import('../../workflow/panel/WorkflowsPanel.js')`），在 `src/commands.ts` 经 `feature('WORKFLOW_SCRIPTS')` 条件注册（替换原文本 `workflowsCmd`）。

## 10. Workflow 工具 wiring

`wiring.ts` 仍薄：`createWorkflowToolCore(): Tool = buildTool(引擎描述符)`，描述符 = `createWorkflowTool(service.ports)`。保持 `Tool` 接口（name/inputSchema/isEnabled/isReadOnly/description/prompt/call/renderToolUseMessage/mapToolResultToToolResultBlockParam）。**关键变化**：描述符不再各自 `createWorkflowAdapter()`，统一走 `service` 单例。工具 `call` 返回 `run_id` + 提示"用 /workflows 查看实时进度"。工具仍在 `CORE_TOOLS`/`ALL_AGENT_DISALLOWED_TOOLS`，权限分类、`WorkflowPermissionRequest` 接新 wiring。

## 11. `/ultracode` skill

`src/skills/bundled/ultracode/SKILL.md`，`type: prompt`、`user-invocable: true`（自动成 `/ultracode`）。内容 = 蒸馏后的 workflow 编排 playbook：

- **frontmatter**：`name: ultracode`、`description: 进入多 agent workflow 编排模式：何时用、编排原语、质量模式、确定性约束、后端路由、resume/budget、文件与命令`、`user-invocable: true`。
- **何时用 workflow**：可分解/并行、需多视角置信、规模超单上下文、需 resume/审计；何时**不**用（琐碎单文件、单次问答）。
- **编排原语速查**：`agent`/`parallel`/`pipeline`/`phase`/`log`/`workflow` 语义与陷阱（pipeline 默认无 barrier、parallel 单项抛错→null、budget 硬上限、并发 cap、`MAX_TOTAL_AGENTS=1000`/`MAX_ITEMS_PER_CALL=4096`）。
- **质量模式库**（每种给最小可运行片段）：adversarial-verify（多数票 refute）、perspective-diverse verify、judge panel、loop-until-dry、multi-modal sweep、completeness critic。
- **确定性约束**：脚本内禁 `Date.now()`/`Math.random()`（经 `args` 传时间戳/种子）；`meta` 必须纯字面量。
- **后端路由**：`AgentAdapterRegistry` 按 model/agentType 路由；v1 默认 `claude-code`，深度读会话 provider/model/agent 体系。
- **resume/budget**：`resumeFromRunId` 重放 journal；`budget.total` 硬顶（默认无限）。
- **文件与命令**：`.claude/workflows/`、`.claude/workflow-runs/<runId>/journal.jsonl`、`/workflows` 面板、`/<name>` 命名命令。

调用即注入上下文，**不改主循环、零运行时副作用**。

## 12. 错误处理 / 权限 / 生命周期 / 并发 / budget / skip-retry

- **错误**：脚本语法/meta 错 → `parseScript` 即时返错（不进后台）；agent 抛错 → `kind:'dead'`→`null`，workflow 继续（parallel/pipeline 容错）；`WorkflowAbortedError` → `killed`；其它 → `failed`+error。终态走 `run_done` + `LocalWorkflowTask` complete/fail/kill。
- **权限**：worker 用 `assembleToolPool(workerPermissionContext, mcp.tools)`，权限模式取 agent 定义或 `acceptEdits`；面板启动的 run 用面板 `ToolUseContext` 的 `canUseTool`。`WorkflowPermissionRequest.tsx` 保留并接新 wiring。
- **生命周期/并发/budget**：复用引擎 `Semaphore`（`min(16, cores-2)`）、`MAX_TOTAL_AGENTS=1000`、`MAX_ITEMS_PER_CALL=4096`、`Budget`（默认 `null` 无限；可经 settings/env 注入 turn 级上限，留参数）。
- **skip/retry（per-agent）**：引擎 `taskRegistrar.pendingAction` seam 保留；v1 返 `null`。面板控制诉求由 kill/resume 覆盖。

## 13. 测试策略

- **引擎**：`hooks.test.ts` 加"并发 agent 的 started/done id 配对"回归。
- **集成层**（`src/workflow/__tests__/`）：
  - `service.test.ts`：launch→completed/failed/killed、resume 走 journal、kill 中止、subscribe 通知（mock 端口，无 LLM）。
  - `registry.test.ts`：默认路由命中 `claude-code`；`resolve` 对未知规则回落默认。
  - `claudeCodeBackend.test.ts`：agentType→真实定义命中/兜底；model→映射；失败→`dead`（mock `runAgent`）。
  - `progressStore.test.ts`：**并发 `agent_done` 按 `agentId` 精确关联**（回归旧竞态）、phase 切换、`run_done` 终态。
  - `WorkflowsPanel.test.tsx`（ink-testing-library）：扁平列表渲染、光标 j/k 切换聚焦 workflow、右栏 phase 条+agent 列表、键位 x/r/n、空态、订阅刷新。
- **回归**：`bun run precheck` 零错误；现有 workflow 集成测试（canonical scripts/review/loop/resume）仍绿。
- 遵循仓库 mock 规范（共享 `tests/mocks/log.ts`、`debug.ts`；mock 底层 HTTP/副作用，不 mock 业务模块；注意 `mock.module` 进程全局污染，集成测试 mock axios 而非源 API 模块）。

## 14. 里程碑与提交切分

每个里程碑结束 `bun run precheck` 必须零错误。

1. **M1 引擎微调**：`ProgressEvent.agentId` + hooks 盖戳 + 单测。
2. **M2 进度层**：`progress/bus.ts` + `store.ts`（agentId 关联）+ 测试。
3. **M3 后端 + Registry + ports + hostHandle**：`claudeCodeBackend`（深度解析）、`registry`、`ports` 组装 + 测试。
4. **M4 Service 门面**：`service.ts`（launch/resume/kill/subscribe/listNamed）+ 测试。
5. **M5 工具 wiring 切换 + 接线点更新**：`wiring.ts` 走 service；更新 tools/commands/tasks/constants/classifier/PermissionRequest/BackgroundTasksDialog。`precheck` 绿。
6. **M6 `/workflows` 面板（原地重写命令）**：panel 组件（`PhaseTree`/`AgentStatus`）+ 键位 + 把 `src/commands/workflows/` 重写为 local-jsx + 测试。
7. **M7 `/ultracode` skill**：`SKILL.md` playbook。
8. **M8 文档**：更新 `docs/features/workflow-scripts.md`，新增面板/skill 说明。

## 15. 未做 / 未来工作

- 多 provider adapter（OpenAI/Gemini/Grok/Bedrock/Vertex 等真后端 + model 路由分流）——引擎 Registry 机制本身在用（单 adapter），扩第二个 adapter 时再补 `route` 规则；本期按 depth B 不预填。
- per-agent skip/retry 的 UI 接线（引擎 seam 已在）。
- `ultracode` 运行时行为开关（默认倾向 Workflow 工具）——本期为纯知识 skill。
- 跨进程/重启的 live 进度恢复（当前内存；resume 走 journal）。
- `budgetTotal` 从 settings/env 注入 turn 级预算。
