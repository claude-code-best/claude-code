# `/workflows` 面板重设计：顶 tab + 左 phase 侧栏 + 右 agent 列表

> 状态：草案（待用户 review → writing-plans 产出实施计划）
> 日期：2026-06-13
> 关联：上一期整体设计 `docs/superpowers/specs/2026-06-13-workflow-tui-ultracode-design.md`（其 §9 双栏面板已实现，本 spec 取代该 §9 的面板部分）

---

## 1. 背景与现状

上一期整体设计已落地：`WorkflowService` 门面、`claude-code` AgentAdapter、进度 bus+store、引擎 `agentId` 关联、`/ultracode` skill 全部实现完成。`/workflows` 面板按旧 spec §9 实现为**双栏**：

- `src/workflow/panel/WorkflowsPanel.tsx`：左栏 `WorkflowList`（扁平 run 列表）+ 右栏 `WorkflowDetail`（phase 横条 + 扁平 agent 列表）。
- 键位 `j/k` 在左栏选 run，选中即聚焦、右栏随之切换。

**问题**：监控「单个 run 内多 phase / 多 agent」时，左右是「run 列表 vs 单 run 详情」——切换 run 与查看 agent 共用一对键位；phase 仅一行横条，无法按 phase 筛选 agent；多个 run 间切换要上下翻列表。

本 spec 把面板**原地重写**为三区焦点模型：**顶部 run tab + 左 phase 筛选侧栏 + 右 agent 列表**，贴合「聚焦一个 run → 按 phase 收窄 → 看 agent 状态」的实际监控动线。

## 2. 目标与非目标

**目标**

1. 顶 tab 按 **run**（同名脚本多次跑会多个 tab，标签附 runId 短码消歧如 `review-changes#a3f`）。
2. 左 phase 侧栏：合并 `meta` 声明 phase（pending `○`）与 store phase（running `●` / done `✓`）+ 一个固定 `All` 项；选中即决定右栏筛选。
3. 右 agent 列表：按选中 phase 过滤（`All` 则全显）；状态用颜色 + 文字标记（`object` / `text` / `dead`）。
4. 焦点轮转键位：`Tab`/`Shift+Tab` 切 run、`←/→` 切 phases↔agents、`↑/↓` 列内移动、`x` kill / `r` resume / `q`/`Esc` quit。
5. 视觉极简：无内框，左右栏中间**一条竖线**；选中/光标行用**底色条**（`backgroundColor`，非反白）；聚焦列标题橙粗、非聚焦灰。
6. 显示 **pending phase**（meta 声明但未启动）。

**非目标**

- 不改引擎包（`run_started` 已携带 `meta.phases`，见 §3）。
- 不动 `service`/`registry`/`backends`/`ports`/`wiring`/Workflow 工具/`/ultracode`。
- 不做 per-agent 操作 UI（仅 run 级 `kill`/`resume`）。
- 不改 `BackgroundTasksDialog`（Shift+Down）跳转协议。
- 不做 agent 输出详情抽屉（留未来）。

## 3. 关键发现：零引擎改动

`ProgressEvent.run_started` **已携带** `meta: WorkflowMeta | null`（`packages/workflow-engine/src/types.ts:60-66`，emit 点 `engine/runWorkflow.ts:72-77`），且 `WorkflowMeta.phases` 已是 `Array<{ title: string; detail?: string }>`（`types.ts:22-27`）。

→ pending phase 所需数据全在事件流里。面板只需让 store 在 `run_started` 时落地 `declaredPhases`，再与 store 的 `run.phases`（running/done）合并即可。**不触碰引擎包**。

## 4. 数据模型变更（`src/workflow/progress/store.ts`）

- `RunProgress` 新增字段：

  ```ts
  declaredPhases: string[]   // 来自 run_started.meta.phases[].title；无 meta → []
  ```

- reducer `run_started` 分支补一行（当前第 74-77 行只用 `event.workflowName`，忽略 `event.meta`）：

  ```ts
  case 'run_started':
    p.workflowName = event.workflowName
    p.status = 'running'
    p.declaredPhases = event.meta?.phases?.map(ph => ph.title) ?? []
    break
  ```

- `ensure()` 初始化 `declaredPhases: []`。
- 其余 reducer 分支、`AgentProgress`、快照排序逻辑不变。

**测试**（`progress/store.test.ts` 或对应测试文件）：
- `run_started` 带 `meta.phases` → `declaredPhases` 落地且顺序保留。
- `run_started` 的 `meta` 为 `null` → `declaredPhases === []`。
- 已有 `agentId` 关联、phase 切换、`run_done` 终态用例保持绿。

## 5. 面板布局（定稿 ASCII）

焦点在 PHASES（默认进入态）：

```
╭─ Workflows ──────────────────────────── 2 running · 3 done ─╮
│                                                             │
│   ● review-changes   ✓ find-bugs   ● migrate-auth           │
│   ═════════════════                  ← Tab / Shift+Tab 切   │
│                                                             │
│   PHASES              │  AGENTS · Review                    │
│                       │                                     │
│   ✓ Find     3/3      │  ● review:bugs        running       │
│ ▓▶● Review   2/5▓     │  ● review:perf        running       │
│   ○ Verify   0/2      │  ✓ review:sec         object        │
│                       │  ✗ review:api         dead          │
│   All           10    │  ✓ review:auth        text          │
│                       │                                     │
│   Tab 切 run · ←/→ 切焦点 · ↑/↓ 移动 · x kill · q quit       │
╰─────────────────────────────────────────────────────────────╯
```

按 `→` 焦点到 AGENTS（`PHASES` 标题变灰、`AGENTS` 变橙、光标行铺底色）：

```
   phases (灰)         │  AGENTS · Review (橙)
                       │
   ✓ Find     3/3      │  ● review:bugs        running
   ● Review   2/5      │  ▓● review:perf        running ▓   ← 光标行底色
   ○ Verify   0/2      │  ✓ review:sec         object
   All           10    │  ✗ review:api         dead
```

## 6. 焦点与键位状态机

**面板状态**（`WorkflowsPanel` 内 `useState`）：

| 状态 | 含义 | 默认 |
|---|---|---|
| `activeRunId` | 当前 tab 的 runId | 首个 run（无则 null） |
| `focusColumn` | `'phases'` \| `'agents'` | `'phases'`（该 run 无任何 phase 则 `'agents'`） |
| `selectedPhaseIndex` | phase 侧栏选中项（`0` = `All`） | `0` |
| `selectedAgentIndex` | agent 列表光标行 | `0` |

**键位**：

| 键 | 作用 |
|---|---|
| `Tab` / `Shift+Tab` | 切顶部 run tab（正/反）；切 tab 时重置 `selectedPhaseIndex=0`、`selectedAgentIndex=0`、`focusColumn` 回默认 |
| `←` / `→` | `phases` ↔ `agents` 焦点切换（tabs 不参与左右，由 `Tab` 管） |
| `↑` / `↓` | 当前焦点列内移动选中（phase 改筛选；agent 滚光标） |
| `x` | kill 当前 tab 的 run |
| `r` | resume 当前 tab 的 run（缺 `canUseTool` 时 `onDone` 提示用 `/<name> resume`） |
| `q` / `Esc` | 退出面板 |

**夹紧**：复用 `WorkflowsPanel` 已导出的 `clampSelected`——切 tab / 列表变动后把 `selectedPhaseIndex`、`selectedAgentIndex` 夹到有效区间。

**筛选语义**：`selectedPhaseIndex===0`（`All`）→ 右栏显示全部 agent；否则按 `phase === 选中 phase title` 过滤。

## 7. 组件拆分（`src/workflow/panel/`）

| 文件 | 动作 | 职责 |
|---|---|---|
| `WorkflowsPanel.tsx` | 重写 | 订阅 store、持焦点状态、渲染 `TabsBar` + 左右双栏、绑 `useWorkflowKeyboard`；保留导出 `clampSelected` |
| `TabsBar.tsx` | 新建 | 顶部 run tab 行（状态点 + 名 + runId 短码；当前 tab 橙色 `═══` 下划线） |
| `PhaseSidebar.tsx` | 新建 | 左 phase 列表：`All` + 合并 `declaredPhases`（pending `○`）与 `run.phases`（`●`/`✓`），每行附 `done/total` agent 计数 |
| `AgentList.tsx` | 新建 | 右 agent 列表：按选中 phase 过滤；状态色 + 行尾 `object`/`text`/`dead` 文字标记 |
| `status.ts` | 新建 | 共享状态→字符/颜色映射（`STATUS_DOT`、phase/agent mark 函数），三组件复用 |
| `useWorkflowKeyboard.ts` | 改写 | 焦点模型键位（见 §6） |
| `WorkflowList.tsx` | 删除 | run 列表职责迁入 `TabsBar` |
| `WorkflowDetail.tsx` | 删除 | phase+agent 职责拆入 `PhaseSidebar`+`AgentList` |
| `panelCall.ts` | 不变 | local-jsx 入口仍渲染 `WorkflowsPanel` |

**外部接口不变**：`/workflows` 命令注册、`panelCall`、`getWorkflowService()` 订阅协议、`BackgroundTasksDialog` 跳转均不动。

## 8. 视觉规则

- **无内框**：左右两栏中间一条 `│` 竖线，仅此一条分割线；最外层保留最朴素的 round border 界定面板。
- **聚焦列**：标题 `claude` 橙粗体；非聚焦列标题 `subtle` 灰。
- **选中/光标行**：整行铺 `backgroundColor="claude"` 橙底（ASCII 用 `▓` 示意），**文字色不变**，状态点保留各自颜色。
- **状态色**（沿用现有 Ink theme token，无新增）：

  | 元素 | 状态 | 字符 | 颜色 |
  |---|---|---|---|
  | Tab (run) | running | `●` | `warning` |
  | | completed | `✓` | `success` |
  | | failed | `✗` | `error` |
  | | killed | `■` | `subtle` |
  | | 当前 | `═══` | `claude` 下划线 |
  | Phase | running | `●` | `warning` |
  | | done | `✓` | `success` |
  | | pending | `○` | `subtle` |
  | | 选中 | `▶` | `claude` + 底色 |
  | Agent | running | `●` | `warning` |
  | | done·text | `✓` | `success` + 行尾 `text` |
  | | done·object | `✓` | `success` + 行尾 `object` |
  | | dead | `✗` | `error` + 行尾 `dead` |

- **object 标记**：行尾纯文字 `object`（不用 `◆` 符号）。
- **左窄右宽**：phase 栏约 20%、agent 栏约 80%（或固定 phase 栏 ~20 字符，agent 栏吃剩余宽度）。

## 9. 测试策略

- **store**：`declaredPhases` 落地 + null meta 回归（§4）。
- **面板**（`WorkflowsPanel.test.tsx`，ink-testing-library，遵循仓库 mock 规范）：
  - 多 run → tab 渲染 + 当前 tab 下划线；`Tab`/`Shift+Tab` 切换且重置子选择。
  - `←/→` 切 `focusColumn`（标题颜色 / 光标落点）。
  - phase 侧栏选中 → 右栏 agent 按 phase 过滤；`All` 显全部。
  - pending phase（`declaredPhases` 有、store 无）显示 `○`。
  - 选中行/光标行底色条（断言对应 `<Text backgroundColor>`）。
  - `x` kill、`r` resume（mock service）、`q`/`Esc` 退出。
  - 空态（无 run）：占位文案 + `n` 提示。
  - 订阅刷新：store 变更后面板重渲染（agent 状态 running→done）。
- **回归**：`bun run precheck` 零错误；现有 workflow 集成测试（canonical scripts / review / loop / resume）保持绿。

## 10. 里程碑与提交切分

每个里程碑结束 `bun run precheck` 必须零错误。

1. **M1 store**：`RunProgress.declaredPhases` + reducer `run_started` 落地 + 测试。
2. **M2 panel 组件**：新建 `status.ts` / `TabsBar` / `PhaseSidebar` / `AgentList`；`WorkflowsPanel` 重写为焦点状态机；`useWorkflowKeyboard` 改焦点模型；删除 `WorkflowList` / `WorkflowDetail`。
3. **M3 测试**：`WorkflowsPanel.test.tsx` 全量用例 + precheck 绿。
4. **M4 文档**：`docs/features/workflow-scripts.md` §六 更新为三区布局/键位；旧 spec §六/§9 加注「面板部分已被 `2026-06-13-workflow-panel-redesign.md` 取代」。

## 11. 未做 / 未来工作

- per-agent skip/retry 的 UI 接线（引擎 seam 已在）。
- agent 详情抽屉：选中 agent 后展开其 prompt/输出/token。
- 多 run 并排对比视图。
- `declaredPhases` 与实际 `phase()` 调用不一致时的告警（如脚本声明了 phase 却没调用）。
