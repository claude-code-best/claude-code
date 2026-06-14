# WORKFLOW_SCRIPTS — 确定性多 agent 工作流编排

> Feature Flag：`FEATURE_WORKFLOW_SCRIPTS=1`
> 引擎包：[`@claude-code-best/workflow-engine`](../../packages/workflow-engine/)（确定性 JS 脚本编排，零核心层运行时依赖）
> 集成层：[`src/workflow/`](../../src/workflow/)

## 一、功能概述

WORKFLOW_SCRIPTS 让 Claude Code 用**确定性 JavaScript 脚本**编排多个子 agent：可分解/并行、多视角置信、规模超单上下文、可 resume/可审计。

- **编排原语**：`agent` / `parallel` / `pipeline` / `phase` / `log` / `workflow`（见引擎包）。
- **确定性**：脚本在受限沙箱内执行，禁用 `Date.now()` / `Math.random()` / 无参 `new Date()`，保证 journal 可重放。
- **深度后端**：单一 `claude-code` AgentAdapter 接入当前会话体系（provider / model / agentType / 工具），workflow 内的 `agent()` 调用真实子 agent。
- **监控面板**：`/workflows` 双栏实时面板（见 §六）。
- **编排手册**：`/ultracode` 注入编排工作法（见 §七）。

> 历史说明：早期版本为 YAML/JSON DSL + 全 Stub 实现（`WorkflowDetailDialog` 等），已全量重写为引擎驱动的 JS 方案。

## 二、实现架构

```
   .claude/workflows/<name>.ts        Workflow 工具（name/script/scriptPath/args/resumeFromRunId）
            │                                       │
            ▼                                       ▼
   namedWorkflowCommands.ts              src/workflow/wiring.ts (createWorkflowToolCore)
   （/<name> 命令发现）                              │
                                                   ▼
                                      WorkflowService（门面：launch/kill/subscribe/listRuns/listNamed）
                                                   │
                                  ┌────────────────┼─────────────────┐
                                  ▼                ▼                 ▼
                          ports.ts            registry.ts        progress/
                       （端口聚合）      （AgentAdapterRegistry）  bus + store
                                  │                │
                                  ▼                ▼
                      hostHandle.ts        backends/claudeCodeBackend.ts
                     （不透明 host）       （深度读会话体系，跑真实 agent）
                                  │
                                  ▼
                  @claude-code-best/workflow-engine
                  （runWorkflow / hooks / journal / budget / 并发信号量）
```

### 2.1 模块清单

| 层 | 文件 | 职责 |
|----|------|------|
| 引擎 | `packages/workflow-engine/src/` | 确定性脚本沙箱 + hooks + journal + budget + 信号量；导出 `createWorkflowTool` |
| 工具装配 | `src/workflow/wiring.ts` | `createWorkflowToolCore()` —— 用 `WorkflowService.ports` 组装 `Workflow` 工具 |
| 服务门面 | `src/workflow/service.ts` | `WorkflowService` 单例：`launch` / `kill` / `subscribe` / `listRuns` / `listNamed` / `getWorkflowService()` |
| 端口 | `src/workflow/ports.ts` | `createWorkflowPorts()` 聚合所有端口（agentRunner/registry/progress/task/journal/permission/logger/hostFactory） |
| 后端注册 | `src/workflow/registry.ts` | `buildRegistry()` 注册 `claude-code` 后端并设为默认 |
| 深度后端 | `src/workflow/backends/claudeCodeBackend.ts` | AgentAdapter：按 `agentType`/`model` 解析会话体系，跑真实子 agent，结构化输出 |
| Host 句柄 | `src/workflow/hostHandle.ts` | `buildHostBundle()` 不透明包装 `toolUseContext`/`canUseTool`/`parentMessage` |
| 进度总线 | `src/workflow/progress/bus.ts` | 基于 Set 的进度事件发射 |
| 进度状态 | `src/workflow/progress/store.ts` | reducer：按 `agentId` 精确关联 `agent_done`（修并发竞态） |
| 监控面板 | `src/workflow/panel/*.tsx` | `/workflows` 双栏 UI（见 §六） |
| 命名命令 | `src/workflow/namedWorkflowCommands.ts` | 扫描 `.claude/workflows/` 生成 `/<name>` 命令 |
| 权限请求 | `src/workflow/WorkflowPermissionRequest.tsx` | workflow 启动权限 UI |

### 2.2 注册点

| 位置 | 内容 |
|------|------|
| `src/tools.ts:152-153,254` | `createWorkflowToolCore()` 动态加载并注册 `Workflow` 工具（feature-gated） |
| `src/commands.ts:95-97,392` | `/workflows` 命令（local-jsx，加载 `panelCall.js`） |
| `src/skills/bundled/ultracode.ts` + `index.ts` | `/ultracode` 知识 skill（`registerBundledSkill`） |

## 三、编排原语

workflow 脚本内可用的钩子（语义详见引擎包 `engine/hooks.ts`）：

| 原语 | 语义 |
|------|------|
| `agent(prompt, opts?)` | 派发一个子 agent；返回最终文本，或（带 `opts.schema`）结构化对象。opts：`model` / `agentType` / `label` / `phase` / `schema` |
| `parallel([() => …])` | 并发跑 thunk 数组，**barrier**（等全部完成）；单项抛错 → 该项 `null`，其余保留 |
| `pipeline(items, s1, s2, …)` | 每个 item 链式过各 stage；**item 间无 barrier**，stage 内顺序；单 item 某 stage 抛错 → 该 item `null` |
| `phase(title)` | 标记阶段（面板按此分组展示） |
| `log(msg)` | 进度日志（面板展示，无状态变更） |
| `workflow(name \| { scriptPath }, args?)` | 嵌套一层子 workflow（仅允许一层） |

**硬限**：单次 `parallel`/`pipeline` ≤ `MAX_ITEMS_PER_CALL`（4096）；单 workflow 总 agent ≤ `MAX_TOTAL_AGENTS`（1000）；并发 cap 默认 = `DEFAULT_MAX_CONCURRENCY`（3），可经 Workflow 工具的 `maxConcurrency` 入参覆盖，绝对上限 `MAX_CONCURRENCY_CAP`（16）。

## 四、编写 workflow

脚本置于 `.claude/workflows/<name>.js|.mjs`（也接受 `.ts`，但**引擎不转译 TS**，含类型注解会报语法错——推荐 `.js`/`.mjs`），自动成为 `/<name>` 命令。

```js
// .claude/workflows/review-changes.js
export const meta = {
  name: 'review-changes',
  description: '按维度审查改动并对抗式验证',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}

const DIMENSIONS = [
  { key: 'bugs', prompt: '找正确性 bug' },
  { key: 'perf', prompt: '找性能问题' },
]

const results = await pipeline(
  DIMENSIONS,
  d => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review' }),
  review => parallel(
    (review.findings || []).map(f => () =>
      agent(`对抗式验证：${f.title}`, { phase: 'Verify' })
    )
  )
)
return results.flat().filter(Boolean)
```

**脚本执行约束**（引擎执行模型，违反直接报错）：

脚本是 `new AsyncFunction` 的**函数体**，不是 ESM 模块：

- **禁 `import`**：`agent`/`parallel`/`pipeline`/`phase`/`log`/`workflow` 与 `args`/`budget` 是注入的形参，直接用。
- **禁 TS 语法**：不要类型注解（`x: number`）、`interface`、`enum`、`as`、泛型。引擎不转译，即便文件是 `.ts` 也会原样报语法错。
- **只允许一处 `export const meta = {...}`**（引擎正则提取剥离）；不要 `export` 其他、不要 `export default`。
- **顶层 `return` 返回结果**。

**确定性约束**（违反则 resume 失效）：
- 禁 `Date.now()` / `Math.random()` / 无参 `new Date()`（沙箱强制抛错）。需时间戳/随机种子经 `args` 传入。
- `export const meta = { ... }` 必须是**纯字面量**（无变量、函数调用、模板插值）——加载期求值，否则抛 `ScriptError`。

## 五、Workflow 工具

模型通过 `Workflow` 工具启动 workflow（input schema 见引擎包 `tool/schema.ts`）：

| 字段 | 说明 |
|------|------|
| `script` | 内联脚本字符串 |
| `name` | 命名 workflow 名（对应 `.claude/workflows/<name>`） |
| `scriptPath` | 脚本文件路径 |
| `args` | 透传给脚本的 `args`（任意 JSON 值） |
| `resumeFromRunId` | 从既有 runId 重放（已完成 `agent()` 秒回，发散点后现场重跑） |

## 六、监控面板：`/workflows`

`/workflows` 打开三区焦点面板（local-jsx，全屏）：

- **顶部 tabs**：每个 run 一个 tab（状态圆点 + workflow 名 + `#runId短码`）；同名脚本多次跑会多个 tab。
- **左 phase 侧栏**：`All` + 合并 meta 声明的 phase（未启动 `○` pending 灰）与实际 phase（`●` running / `✓` done）；选中即决定右栏筛选。
- **右 agent 列表**：按选中 phase 过滤；状态色 + 行尾文字（`running` / `object` / `text` / `dead`）。

**键位**：`Tab`/`Shift+Tab` 切 run · `←`/`→` 切左右焦点列（phases ↔ agents）· `↑`/`↓` 列内移动 · `r` resume · `x` kill · `n` 新建提示 · `q`/`Esc` 退出。

**视觉**：无内框，左右一条竖线分隔；聚焦列标题橙粗；选中/光标行铺橙底（`backgroundColor`），文字色不变。

进度按引擎 `agentId` 精确关联 `agent_done`（解决并发 LIFO 竞态）。pending phase 来自 `run_started` 事件携带的 `meta.phases`，store 落地 `declaredPhases`，面板 `mergePhases` 合并。`useSyncExternalStore` 订阅 `WorkflowService`，稳定快照，无变更不重渲染。

## 七、`/ultracode` skill

`/ultracode`（`src/skills/bundled/ultracode.ts`）注入多 agent workflow 编排工作法：何时用 / 何时不用、编排原语速查、质量模式库（adversarial-verify / judge-panel / loop-until-dry / multi-modal-sweep / completeness-critic）、确定性约束、后端路由、resume/budget、文件与命令。

**纯知识 prompt skill**：零运行时副作用，不改主循环、不切换行为开关。调用即把手册注入上下文。

## 八、resume / journal / budget

- **journal**：每次 run 记录到 `.claude/workflow-runs/<runId>/journal.jsonl`。`resumeFromRunId` 重放 journal，已完成 `agent()` 秒回缓存结果。
- **budget**：`budget.total` 为 token 硬顶（默认 `null` = 无限）；`budget.spent()` / `budget.remaining()` 读实时消耗；耗尽后再发 `agent()` 抛错。
- **并发**：引擎 `Semaphore` 默认许可 3（`DEFAULT_MAX_CONCURRENCY`），可经 Workflow 工具的 `maxConcurrency` 入参 per-run 覆盖（钳到 `[1, MAX_CONCURRENCY_CAP=16]`）。
- **错误**：脚本语法/meta 错 → `parseScript` 即时返错（不进后台）；agent 抛错 → `kind:'dead'` → `null`，workflow 继续（`parallel`/`pipeline` 容错）；`WorkflowAbortedError` → `killed`。

## 九、文件索引

| 文件 | 职责 |
|------|------|
| `src/workflow/wiring.ts` | `Workflow` 工具装配（`createWorkflowToolCore`） |
| `src/workflow/service.ts` | `WorkflowService` 门面 |
| `src/workflow/ports.ts` | 端口聚合（`createWorkflowPorts`） |
| `src/workflow/registry.ts` | `AgentAdapterRegistry` + 默认后端 |
| `src/workflow/backends/claudeCodeBackend.ts` | 深度后端 AgentAdapter |
| `src/workflow/hostHandle.ts` | 不透明 host 句柄（`buildHostBundle`） |
| `src/workflow/progress/bus.ts` | 进度事件总线 |
| `src/workflow/progress/store.ts` | 进度 reducer（`agentId` 关联） |
| `src/workflow/panel/*.tsx` | `/workflows` 双栏面板 |
| `src/workflow/namedWorkflowCommands.ts` | `/<name>` 命令发现 |
| `src/workflow/WorkflowPermissionRequest.tsx` | 启动权限 UI |
| `src/skills/bundled/ultracode.ts` | `/ultracode` 知识 skill |
| `src/tools.ts:152-153,254` | 工具注册 |
| `src/commands.ts:95-97,392` | `/workflows` 命令注册 |
| `packages/workflow-engine/` | 引擎包（hooks / journal / budget / 并发） |
