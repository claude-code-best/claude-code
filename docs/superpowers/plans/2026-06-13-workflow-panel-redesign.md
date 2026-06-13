# Workflow Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/workflows` 面板从双栏（左 run 列表 / 右 phase+agent）原地重写为三区焦点模型（顶 run tab + 左 phase 筛选侧栏 + 右 agent 列表），零引擎改动。

**Architecture:** `run_started` 事件已携带 `meta.phases`，store 落地 `declaredPhases` 即可显示 pending phase。面板拆成 `TabsBar` / `PhaseSidebar` / `AgentList` + 共享 `status.ts`（状态→字符/颜色）与 `selectors.ts`（合并/过滤纯函数），`WorkflowsPanel` 持焦点状态机（activeRunId / focusColumn / selectedPhaseIndex / selectedAgentIndex），`useWorkflowKeyboard` 改焦点轮转键位。

**Tech Stack:** TypeScript strict、React/`@anthropic/ink`、`bun:test`、Biome。无 ink-testing-library——测试走纯函数 + 数据契约路线（与现有 `WorkflowsPanel.test.tsx` 一致）。

---

## 项目约定（覆盖 skill 默认，执行前必读）

1. **提交规则（CLAUDE.md）**：`git commit` 仅在用户明确要求时执行。下方每个 Task 末尾的 "Commit" 步骤是**逻辑切分点**（该 task 自洽、可独立提交）——实际是否真正 `git commit` 由用户在执行时决定。默认：完成一个 Task 后**不自动 commit**，改在每个里程碑（Task 3 / Task 7）结束统一问用户。
2. **测试策略**：项目**未引入** `ink-testing-library`（grep 全 `src/` 无结果）。组件**不写渲染测试**。所有可测逻辑必须抽成**纯函数**（`status.ts` / `selectors.ts` / `routeWorkflowKey`）并 TDD；组件只保证 `tsc` + `biome` 通过。
3. **类型规范**：生产代码禁 `as any`；`.tsx` 120 行宽 + 强制分号；`.ts` 80 行宽 + 按需分号。`feature()` 仅用在 `if`/三元条件位（本计划不涉及 feature flag）。
4. **Mock 规范**：本计划涉及的 store/纯函数测试**无需 mock**（纯逻辑）。若后续集成测试需要，用共享 `tests/mocks/log.ts` / `debug.ts`，mock 底层副作用而非业务模块。
5. **每 Task 结束**：`bun run precheck` 必须零错误（typecheck + lint:fix + test）。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/workflow/progress/store.ts` | 改 | `RunProgress.declaredPhases` + `AgentProgress.outputShape`；reducer 落地 |
| `src/workflow/panel/status.ts` | 新建 | 状态→字符/颜色映射（`STATUS_DOT` 从 `WorkflowList` 迁入）+ `agentVisual` |
| `src/workflow/panel/selectors.ts` | 新建 | `mergePhases` / `filterAgentsByPhase` / `tabLabel` 纯函数 |
| `src/workflow/panel/useWorkflowKeyboard.ts` | 改写 | `routeWorkflowKey` 纯函数 + 焦点模型 handlers |
| `src/workflow/panel/TabsBar.tsx` | 新建 | 顶部 run tab 行 |
| `src/workflow/panel/PhaseSidebar.tsx` | 新建 | 左 phase 列表（含 All + pending） |
| `src/workflow/panel/AgentList.tsx` | 新建 | 右 agent 列表（按 phase 过滤） |
| `src/workflow/panel/WorkflowsPanel.tsx` | 重写 | 焦点状态机 + 组装；保留导出 `clampSelected` |
| `src/workflow/panel/WorkflowList.tsx` | 删除 | 职责迁入 `TabsBar` + `status.ts` |
| `src/workflow/panel/WorkflowDetail.tsx` | 删除 | 职责拆入 `PhaseSidebar` + `AgentList` |
| `src/workflow/__tests__/WorkflowsPanel.test.tsx` | 改 | `STATUS_DOT` import 改从 `status.js`；保留 `clampSelected` 契约 |
| `src/workflow/__tests__/progressStore.test.ts` | 改 | 加 `declaredPhases` / `outputShape` 用例 |
| `src/workflow/__tests__/status.test.ts` | 新建 | 状态映射 + `agentVisual` |
| `src/workflow/__tests__/selectors.test.ts` | 新建 | `mergePhases` / `filterAgentsByPhase` / `tabLabel` |
| `src/workflow/__tests__/useWorkflowKeyboard.test.ts` | 新建 | `routeWorkflowKey` |
| `docs/features/workflow-scripts.md` | 改 | §六 更新三区布局/键位 |

---

## Task 1: store 落地 `declaredPhases` + `outputShape`

**Files:**
- Modify: `src/workflow/progress/store.ts:4-11`（`AgentProgress`）、`store.ts:13-24`（`RunProgress`）、`store.ts:46-62`（`ensure`）、`store.ts:78-83`（`run_started`）、`store.ts:107-123`（`agent_done`）
- Test: `src/workflow/__tests__/progressStore.test.ts`

- [ ] **Step 1: 在 `progressStore.test.ts` 末尾追加失败测试**

```ts
test('run_started 落地 declaredPhases（来自 meta.phases，顺序保留）', () => {
  const { bus, store } = newStore()
  bus.emit({
    type: 'run_started',
    runId: 'r1',
    workflowName: 'w',
    meta: {
      name: 'w',
      description: 'd',
      phases: [{ title: 'Find' }, { title: 'Review' }, { title: 'Verify' }],
    },
  })
  expect(store.get('r1')!.declaredPhases).toEqual(['Find', 'Review', 'Verify'])
})

test('run_started meta 为 null → declaredPhases = []', () => {
  const { bus, store } = newStore()
  bus.emit({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null })
  expect(store.get('r1')!.declaredPhases).toEqual([])
})

test('agent_done 落地 outputShape（ok·object / ok·text / dead 无）', () => {
  const { bus, store } = newStore()
  bus.emit({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null })
  bus.emit({ type: 'agent_started', runId: 'r1', agentId: 0, phase: 'A' })
  bus.emit({ type: 'agent_started', runId: 'r1', agentId: 1, phase: 'A' })
  bus.emit({ type: 'agent_started', runId: 'r1', agentId: 2, phase: 'A' })
  bus.emit({
    type: 'agent_done', runId: 'r1', agentId: 0, phase: 'A',
    result: { kind: 'ok', output: { x: 1 }, usage: { outputTokens: 1 } },
  })
  bus.emit({
    type: 'agent_done', runId: 'r1', agentId: 1, phase: 'A',
    result: { kind: 'ok', output: 'hi', usage: { outputTokens: 1 } },
  })
  bus.emit({ type: 'agent_done', runId: 'r1', agentId: 2, phase: 'A', result: { kind: 'dead' } })
  const agents = store.get('r1')!.agents
  expect(agents.find(a => a.id === 0)?.outputShape).toBe('object')
  expect(agents.find(a => a.id === 1)?.outputShape).toBe('text')
  expect(agents.find(a => a.id === 2)?.outputShape).toBeUndefined()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/workflow/__tests__/progressStore.test.ts`
Expected: 3 个新用例 FAIL（`declaredPhases` undefined / 无 `outputShape`）

- [ ] **Step 3: 改 `AgentProgress` 加 `outputShape`（store.ts:4-11）**

```ts
export type AgentProgress = {
  /** 引擎盖戳的唯一 id，精确关联 started/done（修旧 LIFO 竞态）。 */
  id: number
  label?: string
  phase?: string
  status: 'running' | 'done'
  resultKind?: string
  /** 仅 done·ok 时有意义：output 是对象→'object'，否则→'text'。dead/skipped 无。 */
  outputShape?: 'text' | 'object'
}
```

- [ ] **Step 4: 改 `RunProgress` 加 `declaredPhases`（store.ts:13-24）**

```ts
export type RunProgress = {
  runId: string
  workflowName: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  phases: Array<{ title: string; status: 'running' | 'done' }>
  /** 来自 run_started.meta.phases[].title；面板据此显示 pending(○) phase。无 meta → []。 */
  declaredPhases: string[]
  currentPhase: string | null
  agents: AgentProgress[]
  agentCount: number
  returnValue?: unknown
  error?: string
  updatedAt: number
}
```

- [ ] **Step 5: `ensure()` 初始化 `declaredPhases: []`（store.ts:46-62，在 `currentPhase: null,` 上一行加）**

```ts
        phases: [],
        declaredPhases: [],
        currentPhase: null,
```

- [ ] **Step 6: reducer `run_started` 分支落地 `declaredPhases`（store.ts:74-77）**

```ts
      case 'run_started':
        p.workflowName = event.workflowName
        p.status = 'running'
        p.declaredPhases = event.meta?.phases?.map(ph => ph.title) ?? []
        break
```

- [ ] **Step 7: reducer `agent_done` 两处落地 `outputShape`（store.ts:107-123）**

补建分支（`if (!a)` 内）加 `outputShape`：

```ts
      case 'agent_done': {
        let a = p.agents.find(x => x.id === event.agentId)
        if (!a) {
          a = {
            id: event.agentId,
            label: event.label,
            phase: event.phase,
            status: 'done',
            ...(event.result.kind === 'ok'
              ? {
                  outputShape:
                    typeof event.result.output === 'object' &&
                    event.result.output !== null
                      ? ('object' as const)
                      : ('text' as const),
                }
              : {}),
          }
          p.agents.push(a)
          p.agentCount = p.agents.length
        } else {
          a.status = 'done'
          a.resultKind = event.result.kind
          if (event.result.kind === 'ok') {
            a.outputShape =
              typeof event.result.output === 'object' &&
              event.result.output !== null
                ? 'object'
                : 'text'
          }
        }
        break
      }
```

- [ ] **Step 8: 跑测试确认通过**

Run: `bun test src/workflow/__tests__/progressStore.test.ts`
Expected: 全部 PASS（含原有用例——它们 `meta: null` → `declaredPhases: []`，不破坏）

- [ ] **Step 9: precheck**

Run: `bun run precheck`
Expected: 零错误

- [ ] **Step 10: Commit（逻辑切分点，实际提交待用户确认）**

```bash
git add src/workflow/progress/store.ts src/workflow/__tests__/progressStore.test.ts
git commit -m "feat(workflow): store 落地 declaredPhases + agent outputShape"
```

---

## Task 2: 新建 `status.ts`（状态映射 + `agentVisual`）

**Files:**
- Create: `src/workflow/panel/status.ts`
- Test: `src/workflow/__tests__/status.test.ts`

- [ ] **Step 1: 写失败测试 `status.test.ts`**

```ts
import { expect, test } from 'bun:test'
import type { AgentProgress, RunProgress } from '../progress/store.js'
import {
  STATUS_DOT,
  RUN_STATUS_COLOR,
  PHASE_MARK,
  PHASE_COLOR,
  agentVisual,
} from '../panel/status.js'

test('STATUS_DOT / RUN_STATUS_COLOR 覆盖四种 run 状态且为非空字符', () => {
  const statuses: RunProgress['status'][] = ['running', 'completed', 'failed', 'killed']
  for (const s of statuses) {
    expect(STATUS_DOT[s].length).toBeGreaterThan(0)
    expect(RUN_STATUS_COLOR[s]).toBeTruthy()
  }
  expect(STATUS_DOT.running).toBe('●')
  expect(STATUS_DOT.completed).toBe('✓')
  expect(STATUS_DOT.failed).toBe('✗')
  expect(STATUS_DOT.killed).toBe('■')
})

test('PHASE_MARK / PHASE_COLOR 覆盖 running/done/pending', () => {
  expect(PHASE_MARK.running).toBe('●')
  expect(PHASE_MARK.done).toBe('✓')
  expect(PHASE_MARK.pending).toBe('○')
  expect(PHASE_COLOR.pending).toBe('subtle')
})

test('agentVisual：running → ● warning running', () => {
  const a: AgentProgress = { id: 1, status: 'running' }
  expect(agentVisual(a)).toEqual({ mark: '●', color: 'warning', suffix: 'running' })
})

test('agentVisual：done·object → ✓ success object', () => {
  const a: AgentProgress = { id: 1, status: 'done', resultKind: 'ok', outputShape: 'object' }
  expect(agentVisual(a)).toEqual({ mark: '✓', color: 'success', suffix: 'object' })
})

test('agentVisual：done·text → ✓ success text', () => {
  const a: AgentProgress = { id: 1, status: 'done', resultKind: 'ok', outputShape: 'text' }
  expect(agentVisual(a)).toEqual({ mark: '✓', color: 'success', suffix: 'text' })
})

test('agentVisual：dead → ✗ error dead', () => {
  const a: AgentProgress = { id: 1, status: 'done', resultKind: 'dead' }
  expect(agentVisual(a)).toEqual({ mark: '✗', color: 'error', suffix: 'dead' })
})
```

- [ ] **Step 2: 跑测试确认失败（模块不存在）**

Run: `bun test src/workflow/__tests__/status.test.ts`
Expected: FAIL（无法 import `../panel/status.js`）

- [ ] **Step 3: 创建 `src/workflow/panel/status.ts`**

```ts
import type { AgentProgress, RunProgress } from '../progress/store.js'

/** run 状态 → 圆点字符（顶部 tab 用）。 */
export const STATUS_DOT: Record<RunProgress['status'], string> = {
  running: '●',
  completed: '✓',
  failed: '✗',
  killed: '■',
}

/** run 状态 → ink theme 颜色 token（沿用现有 WorkflowList 配色）。 */
export const RUN_STATUS_COLOR: Record<RunProgress['status'], string> = {
  running: 'warning',
  completed: 'success',
  failed: 'error',
  killed: 'subtle',
}

/** phase 在侧栏的合并状态（含 pending：meta 声明但未启动）。 */
export type PhaseStatus = 'running' | 'done' | 'pending'

export const PHASE_MARK: Record<PhaseStatus, string> = {
  running: '●',
  done: '✓',
  pending: '○',
}

export const PHASE_COLOR: Record<PhaseStatus, string> = {
  running: 'warning',
  done: 'success',
  pending: 'subtle',
}

/** agent 行的视觉三件套：标记字符 + 颜色 + 行尾文字后缀。 */
export type AgentVisual = { mark: string; color: string; suffix: string }

/**
 * agent 状态 → 视觉。
 * - running → ● warning
 * - done·dead → ✗ error
 * - done·ok：outputShape='object' → object；否则 text
 */
export function agentVisual(a: AgentProgress): AgentVisual {
  if (a.status === 'running') return { mark: '●', color: 'warning', suffix: 'running' }
  if (a.resultKind === 'dead') return { mark: '✗', color: 'error', suffix: 'dead' }
  return {
    mark: '✓',
    color: 'success',
    suffix: a.outputShape === 'object' ? 'object' : 'text',
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/workflow/__tests__/status.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: precheck**

Run: `bun run precheck`
Expected: 零错误

- [ ] **Step 6: Commit（逻辑切分点）**

```bash
git add src/workflow/panel/status.ts src/workflow/__tests__/status.test.ts
git commit -m "feat(workflow): 抽 panel status.ts 状态映射 + agentVisual"
```

---

## Task 3: 新建 `selectors.ts`（`mergePhases` / `filterAgentsByPhase` / `tabLabel`）

**Files:**
- Create: `src/workflow/panel/selectors.ts`
- Test: `src/workflow/__tests__/selectors.test.ts`

- [ ] **Step 1: 写失败测试 `selectors.test.ts`**

```ts
import { expect, test } from 'bun:test'
import type { AgentProgress, RunProgress } from '../progress/store.js'
import { ALL_PHASE, mergePhases, filterAgentsByPhase, tabLabel } from '../panel/selectors.js'

function run(partial: Partial<RunProgress>): RunProgress {
  return {
    runId: 'r1',
    workflowName: 'w',
    status: 'running',
    phases: [],
    declaredPhases: [],
    currentPhase: null,
    agents: [],
    agentCount: 0,
    updatedAt: 1,
    ...partial,
  }
}

test('mergePhases：声明顺序优先，实际 phase 追加未声明的，计数 done/total', () => {
  const r = run({
    declaredPhases: ['Find', 'Review', 'Verify'],
    phases: [
      { title: 'Find', status: 'done' },
      { title: 'Review', status: 'running' },
    ],
    agents: [
      { id: 1, phase: 'Find', status: 'done', resultKind: 'ok', outputShape: 'text' },
      { id: 2, phase: 'Find', status: 'done', resultKind: 'dead' },
      { id: 3, phase: 'Review', status: 'running' },
    ],
  })
  expect(mergePhases(r)).toEqual([
    { title: 'Find', status: 'done', done: 2, total: 2 },
    { title: 'Review', status: 'running', done: 0, total: 1 },
    { title: 'Verify', status: 'pending', done: 0, total: 0 },
  ])
})

test('mergePhases：实际出现但未声明的 phase 追加到末尾', () => {
  const r = run({
    declaredPhases: ['Find'],
    phases: [
      { title: 'Find', status: 'done' },
      { title: 'Adhoc', status: 'running' },
    ],
    agents: [],
  })
  expect(mergePhases(r).map(p => p.title)).toEqual(['Find', 'Adhoc'])
})

test('filterAgentsByPhase：All / undefined → 全部；指定 → 仅该 phase', () => {
  const agents: AgentProgress[] = [
    { id: 1, phase: 'A', status: 'running' },
    { id: 2, phase: 'B', status: 'done', resultKind: 'ok', outputShape: 'text' },
  ]
  expect(filterAgentsByPhase(agents, undefined)).toHaveLength(2)
  expect(filterAgentsByPhase(agents, ALL_PHASE)).toHaveLength(2)
  expect(filterAgentsByPhase(agents, 'A')).toEqual([agents[0]])
})

test('tabLabel：workflow 名 + runId 后 4 位短码', () => {
  expect(tabLabel('review-changes', 'wf_abc123def')).toBe('review-changes#3def')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/workflow/__tests__/selectors.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 创建 `src/workflow/panel/selectors.ts`**

```ts
import type { AgentProgress, RunProgress } from '../progress/store.js'
import type { PhaseStatus } from './status.js'

/** 「不筛选」固定项的 title（侧栏第一行）。 */
export const ALL_PHASE = 'All'

/** 合并后的 phase（含 pending），带该 phase 下 agent 的 done/total 计数。 */
export type MergedPhase = {
  title: string
  status: PhaseStatus
  done: number
  total: number
}

/**
 * 合并 declaredPhases（meta 声明）与 run.phases（实际 running/done）：
 * - 声明顺序优先；未在 declared 但实际出现的 phase 追加末尾。
 * - 实际无记录 → pending；否则取实际 status。
 * - done/total = 该 phase 下 done / 全部 agent 数。
 */
export function mergePhases(run: Pick<RunProgress, 'declaredPhases' | 'phases' | 'agents'>): MergedPhase[] {
  const actualByTitle = new Map(run.phases.map(p => [p.title, p]))
  const seen = new Set<string>()
  const out: MergedPhase[] = []
  const push = (title: string): void => {
    if (seen.has(title)) return
    seen.add(title)
    const actual = actualByTitle.get(title)
    const status: PhaseStatus = !actual ? 'pending' : actual.status
    const inPhase = run.agents.filter(a => a.phase === title)
    out.push({
      title,
      status,
      done: inPhase.filter(a => a.status === 'done').length,
      total: inPhase.length,
    })
  }
  for (const t of run.declaredPhases) push(t)
  for (const p of run.phases) push(p.title)
  return out
}

/**
 * 按选中 phase 筛选 agent。
 * selectedPhase 为 undefined 或 ALL_PHASE → 全部。
 */
export function filterAgentsByPhase(
  agents: AgentProgress[],
  selectedPhase: string | undefined,
): AgentProgress[] {
  if (selectedPhase === undefined || selectedPhase === ALL_PHASE) return agents
  return agents.filter(a => a.phase === selectedPhase)
}

/** tab 标签：workflow 名 + `#` + runId 末 4 位（同名 run 消歧）。 */
export function tabLabel(workflowName: string, runId: string): string {
  return `${workflowName}#${runId.slice(-4)}`
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/workflow/__tests__/selectors.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: precheck**

Run: `bun run precheck`
Expected: 零错误

- [ ] **Step 6: 里程碑检查点 —— 向用户确认是否提交 Task 1-3**

完成纯逻辑层（store + status + selectors）。按项目约定，此处询问用户是否提交，再进入组件层。

---

## Task 4: `useWorkflowKeyboard` 改焦点模型（抽 `routeWorkflowKey` 纯函数）

**Files:**
- Modify: `src/workflow/panel/useWorkflowKeyboard.ts`（整体改写）
- Test: `src/workflow/__tests__/useWorkflowKeyboard.test.ts`

- [ ] **Step 1: 写失败测试 `useWorkflowKeyboard.test.ts`**

```ts
import { expect, test } from 'bun:test'
import { routeWorkflowKey } from '../panel/useWorkflowKeyboard.js'

test('Tab → nextTab；Shift+Tab → prevTab', () => {
  expect(routeWorkflowKey('', { tab: true })).toBe('nextTab')
  expect(routeWorkflowKey('', { tab: true, shift: true })).toBe('prevTab')
})

test('q / Esc → quit', () => {
  expect(routeWorkflowKey('q', {})).toBe('quit')
  expect(routeWorkflowKey('', { escape: true })).toBe('quit')
})

test('x → kill；r → resume；n → newRun', () => {
  expect(routeWorkflowKey('x', {})).toBe('kill')
  expect(routeWorkflowKey('r', {})).toBe('resume')
  expect(routeWorkflowKey('n', {})).toBe('newRun')
})

test('←/→ 切焦点列；↑/↓ 列内移动', () => {
  expect(routeWorkflowKey('', { leftArrow: true })).toBe('focusLeft')
  expect(routeWorkflowKey('', { rightArrow: true })).toBe('focusRight')
  expect(routeWorkflowKey('', { upArrow: true })).toBe('moveUp')
  expect(routeWorkflowKey('', { downArrow: true })).toBe('moveDown')
})

test('无关输入 → null', () => {
  expect(routeWorkflowKey('z', {})).toBeNull()
  expect(routeWorkflowKey('', {})).toBeNull()
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test src/workflow/__tests__/useWorkflowKeyboard.test.ts`
Expected: FAIL（`routeWorkflowKey` 不存在）

- [ ] **Step 3: 整体改写 `src/workflow/panel/useWorkflowKeyboard.ts`**

```ts
import { useInput } from '@anthropic/ink'

/** 焦点所在列。 */
export type FocusColumn = 'phases' | 'agents'

/** useInput 的 key 对象子集（仅声明用到的字段，避免耦合 ink Key 类型）。 */
type KeyEvent = {
  tab?: boolean
  shift?: boolean
  escape?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  upArrow?: boolean
  downArrow?: boolean
}

/** 键 → 动作（纯函数，便于单测；无渲染依赖）。 */
export type WorkflowKeyAction =
  | 'nextTab'
  | 'prevTab'
  | 'focusLeft'
  | 'focusRight'
  | 'moveUp'
  | 'moveDown'
  | 'kill'
  | 'resume'
  | 'newRun'
  | 'quit'

export function routeWorkflowKey(input: string, key: KeyEvent): WorkflowKeyAction | null {
  // @anthropic/ink 的 key.tab 对 Tab 键置 true；个别环境回落到 '\t'
  if (key.tab || input === '\t') return key.shift ? 'prevTab' : 'nextTab'
  if (key.escape || input === 'q') return 'quit'
  if (input === 'x') return 'kill'
  if (input === 'r') return 'resume'
  if (input === 'n') return 'newRun'
  if (key.leftArrow) return 'focusLeft'
  if (key.rightArrow) return 'focusRight'
  if (key.upArrow) return 'moveUp'
  if (key.downArrow) return 'moveDown'
  return null
}

/** 焦点模型回调（WorkflowsPanel 注入）。 */
export type WorkflowKeyboardHandlers = {
  nextTab: () => void
  prevTab: () => void
  focusLeft: () => void
  focusRight: () => void
  moveUp: () => void
  moveDown: () => void
  killFocused: () => void
  resumeFocused: () => void
  newRun: () => void
  quit: () => void
}

/**
 * /workflows 面板键位（焦点轮转模型）：
 * - Tab / Shift+Tab：切顶部 run tab
 * - ← / →：phases ↔ agents 焦点切换
 * - ↑ / ↓：当前焦点列内移动
 * - x kill · r resume · n new · q / Esc quit
 */
export function useWorkflowKeyboard(h: WorkflowKeyboardHandlers): void {
  useInput((input, key) => {
    const action = routeWorkflowKey(input, key as KeyEvent)
    if (action === null) return
    switch (action) {
      case 'nextTab':
        h.nextTab()
        break
      case 'prevTab':
        h.prevTab()
        break
      case 'focusLeft':
        h.focusLeft()
        break
      case 'focusRight':
        h.focusRight()
        break
      case 'moveUp':
        h.moveUp()
        break
      case 'moveDown':
        h.moveDown()
        break
      case 'kill':
        h.killFocused()
        break
      case 'resume':
        h.resumeFocused()
        break
      case 'newRun':
        h.newRun()
        break
      case 'quit':
        h.quit()
        break
    }
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test src/workflow/__tests__/useWorkflowKeyboard.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: precheck**

Run: `bun run precheck`
Expected: 零错误

- [ ] **Step 6: Commit（逻辑切分点）**

```bash
git add src/workflow/panel/useWorkflowKeyboard.ts src/workflow/__tests__/useWorkflowKeyboard.test.ts
git commit -m "refactor(workflow): 键位改焦点轮转模型 + 抽 routeWorkflowKey"
```

---

## Task 5: 新建三个展示组件 `TabsBar` / `PhaseSidebar` / `AgentList`

> 这三个是无状态展示组件（props 驱动），不写渲染测试（项目无 ink-testing-library）。靠 `tsc` + `biome` 保证类型/格式。

**Files:**
- Create: `src/workflow/panel/TabsBar.tsx`
- Create: `src/workflow/panel/PhaseSidebar.tsx`
- Create: `src/workflow/panel/AgentList.tsx`

- [ ] **Step 1: 创建 `src/workflow/panel/TabsBar.tsx`**

```tsx
import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { RunProgress } from '../progress/store.js';
import { RUN_STATUS_COLOR, STATUS_DOT } from './status.js';
import { tabLabel } from './selectors.js';

/**
 * 顶部 run tab 行：每个 run 一个 tab（状态点 + 名 + #短码）。
 * 当前 tab 用橙色 ═ 下划线高亮。
 */
export function TabsBar({
  runs,
  activeRunId,
}: {
  runs: RunProgress[];
  activeRunId: string | null;
}): React.ReactNode {
  if (runs.length === 0) {
    return <Text color="subtle">(no runs)</Text>;
  }
  return (
    <Box>
      {runs.map(r => {
        const active = r.runId === activeRunId;
        const label = tabLabel(r.workflowName, r.runId);
        const underline = '═'.repeat(label.length + 2);
        return (
          <Box key={r.runId} flexDirection="column" marginRight={2}>
            <Box>
              <Text color={RUN_STATUS_COLOR[r.status]}>{STATUS_DOT[r.status]}</Text>
              <Text> </Text>
              <Text color={active ? 'claude' : undefined} bold={active}>
                {label}
              </Text>
            </Box>
            <Text color={active ? 'claude' : undefined}>{active ? underline : ''}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 2: 创建 `src/workflow/panel/PhaseSidebar.tsx`**

```tsx
import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { AgentProgress } from '../progress/store.js';
import { PHASE_COLOR, PHASE_MARK } from './status.js';
import { ALL_PHASE, type MergedPhase } from './selectors.js';

/**
 * 左 phase 侧栏：第一行 All（汇总 done/total），其后 merged phases（含 pending ○）。
 * 选中行铺橙底（文字色不变）；selectedIndex=0 表示 All。
 */
export function PhaseSidebar({
  phases,
  agents,
  selectedIndex,
}: {
  phases: MergedPhase[];
  agents: AgentProgress[];
  selectedIndex: number;
}): React.ReactNode {
  const totalAgents = agents.length;
  const doneAgents = agents.filter(a => a.status === 'done').length;
  const allRow = { title: ALL_PHASE, done: doneAgents, total: totalAgents };
  const rows = [allRow, ...phases];

  return (
    <Box flexDirection="column">
      {rows.map((row, i) => {
        const selected = i === selectedIndex;
        const isAll = i === 0;
        const mark = isAll ? ' ' : PHASE_MARK[row.status];
        const color = isAll ? undefined : PHASE_COLOR[row.status];
        const prefix = selected ? '▶' : ' ';
        return (
          <Box key={row.title}>
            <Text backgroundColor={selected ? 'claude' : undefined}>
              {prefix}
              {mark} {row.title.padEnd(10)} {row.done}/{row.total}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 3: 创建 `src/workflow/panel/AgentList.tsx`**

```tsx
import React from 'react';
import { Box, Text } from '@anthropic/ink';
import type { AgentProgress } from '../progress/store.js';
import { agentVisual } from './status.js';

const LABEL_WIDTH = 18;

/**
 * 右 agent 列表（已按选中 phase 过滤）。
 * 光标行铺橙底；每行：标记 + label + 行尾状态文字（running/object/text/dead）。
 */
export function AgentList({
  agents,
  selectedIndex,
}: {
  agents: AgentProgress[];
  selectedIndex: number;
}): React.ReactNode {
  if (agents.length === 0) {
    return <Text color="subtle">(no agents in this phase)</Text>;
  }
  return (
    <Box flexDirection="column">
      {agents.map((a, i) => {
        const v = agentVisual(a);
        const selected = i === selectedIndex;
        const label = (a.label ?? `agent-${a.id}`).slice(0, LABEL_WIDTH).padEnd(LABEL_WIDTH);
        return (
          <Box key={a.id}>
            <Text backgroundColor={selected ? 'claude' : undefined}>
              <Text color={v.color}>{v.mark}</Text> {label} <Text color="subtle">{v.suffix}</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
```

- [ ] **Step 4: 类型检查 + lint**

Run: `bun run precheck`
Expected: 零错误（三个组件未被引用，tsc 仍编译它们；无 lint 报错）

- [ ] **Step 5: Commit（逻辑切分点）**

```bash
git add src/workflow/panel/TabsBar.tsx src/workflow/panel/PhaseSidebar.tsx src/workflow/panel/AgentList.tsx
git commit -m "feat(workflow): 新增 TabsBar/PhaseSidebar/AgentList 展示组件"
```

---

## Task 6: 重写 `WorkflowsPanel` + 删旧组件 + 修测试 import

**Files:**
- Modify: `src/workflow/panel/WorkflowsPanel.tsx`（整体重写）
- Delete: `src/workflow/panel/WorkflowList.tsx`
- Delete: `src/workflow/panel/WorkflowDetail.tsx`
- Modify: `src/workflow/__tests__/WorkflowsPanel.test.tsx:4`（`STATUS_DOT` import 改源）

- [ ] **Step 1: 重写 `src/workflow/panel/WorkflowsPanel.tsx`**

```tsx
import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Box, Text } from '@anthropic/ink';
import type { LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';
import { getWorkflowService } from '../service.js';
import type { RunProgress } from '../progress/store.js';
import { AgentList } from './AgentList.js';
import { PhaseSidebar } from './PhaseSidebar.js';
import { TabsBar } from './TabsBar.js';
import {
  type FocusColumn,
  type WorkflowKeyboardHandlers,
  useWorkflowKeyboard,
} from './useWorkflowKeyboard.js';
import { ALL_PHASE, filterAgentsByPhase, mergePhases } from './selectors.js';

/**
 * 夹紧选中索引到有效区间（空列表→0；越界→末位；负/NaN→0）。
 * 抽成模块级纯函数：面板内调用 + 单测覆盖同一逻辑，避免行为漂移。
 */
export function clampSelected(selected: number, len: number): number {
  if (len === 0) return 0;
  const n = Math.trunc(selected);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(n, len - 1);
}

/**
 * /workflows 主面板：三区焦点模型（顶 tab + 左 phase 侧栏 + 右 agent 列表）。
 *
 * - useSyncExternalStore 订阅 WorkflowService（store 返回稳定快照，无变更不重渲染）。
 * - 焦点状态：activeRunId / focusColumn('phases'|'agents') / selectedPhaseIndex(0=All) / selectedAgentIndex。
 * - 键位：Tab 切 run · ←/→ 切焦点列 · ↑/↓ 列内移动 · x kill · r resume · q/Esc 退出。
 */
export function WorkflowsPanel({
  onDone,
  context,
}: {
  onDone: LocalJSXCommandOnDone;
  context: LocalJSXCommandContext;
}): React.ReactNode {
  const svc = getWorkflowService();
  const runs = useSyncExternalStore(
    svc.subscribe,
    () => svc.listRuns(),
    () => [],
  );

  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [focusColumn, setFocusColumn] = useState<FocusColumn>('phases');
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0);

  // runs 变化时：activeRunId 失效（被 kill / 首次）→ 夹紧到首个
  useEffect(() => {
    if (runs.length === 0) {
      if (activeRunId !== null) setActiveRunId(null);
      return;
    }
    if (!runs.some(r => r.runId === activeRunId)) {
      setActiveRunId(runs[0]!.runId);
    }
  }, [runs, activeRunId]);

  const focused: RunProgress | undefined = runs.find(r => r.runId === activeRunId);
  const phases = focused ? mergePhases(focused) : [];
  // 侧栏含 All 行：phases 数组前补一项 → 总行数 = phases.length + 1
  const phaseRowCount = phases.length + 1;
  const clampedPhase = clampSelected(selectedPhaseIndex, phaseRowCount);

  // 选中 phase title（0 = All = undefined）
  const selectedPhaseTitle =
    clampedPhase === 0 ? undefined : phases[clampedPhase - 1]?.title;

  const visibleAgents = focused
    ? filterAgentsByPhase(focused.agents, selectedPhaseTitle)
    : [];
  const clampedAgent = clampSelected(selectedAgentIndex, visibleAgents.length);

  const switchTab = (runId: string): void => {
    setActiveRunId(runId);
    setFocusColumn('phases');
    setSelectedPhaseIndex(0);
    setSelectedAgentIndex(0);
  };

  const nextTab = (): void => {
    if (runs.length === 0) return;
    const idx = runs.findIndex(r => r.runId === activeRunId);
    const next = runs[(idx + 1) % runs.length]!;
    switchTab(next.runId);
  };
  const prevTab = (): void => {
    if (runs.length === 0) return;
    const idx = runs.findIndex(r => r.runId === activeRunId);
    const next = runs[(idx - 1 + runs.length) % runs.length]!;
    switchTab(next.runId);
  };

  const handlers: WorkflowKeyboardHandlers = {
    nextTab,
    prevTab,
    focusLeft: () => setFocusColumn('phases'),
    focusRight: () => setFocusColumn('agents'),
    moveUp: () => {
      if (focusColumn === 'phases')
        setSelectedPhaseIndex(s => clampSelected(s - 1, phaseRowCount));
      else setSelectedAgentIndex(s => clampSelected(s - 1, visibleAgents.length));
    },
    moveDown: () => {
      if (focusColumn === 'phases')
        setSelectedPhaseIndex(s => clampSelected(s + 1, phaseRowCount));
      else setSelectedAgentIndex(s => clampSelected(s + 1, visibleAgents.length));
    },
    killFocused: () => {
      if (focused) svc.kill(focused.runId);
    },
    resumeFocused: () => {
      if (!focused) return;
      const canUseTool = context.canUseTool;
      if (!canUseTool) {
        onDone('resume 需要 canUseTool 上下文，请在主会话中用 /<name> resume 重试。');
        return;
      }
      void svc
        .launch(
          { resumeFromRunId: focused.runId, name: focused.workflowName },
          context,
          canUseTool,
        )
        .catch(e => onDone(`resume 失败：${(e as Error).message}`));
    },
    newRun: () =>
      onDone('Tip: 用 /<name> 启动命名 workflow，或通过 Workflow 工具带 name 参数。'),
    quit: () => onDone(),
  };
  useWorkflowKeyboard(handlers);

  const running = runs.filter(r => r.status === 'running').length;
  const done = runs.length - running;
  const phaseHeader = selectedPhaseTitle ?? ALL_PHASE;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold>Workflows</Text>
        <Text color="subtle">
          {running} running · {done} done
        </Text>
      </Box>

      <Box marginTop={1}>
        <TabsBar runs={runs} activeRunId={activeRunId} />
      </Box>

      <Box flexDirection="row" marginTop={1}>
        <Box width="25%" flexDirection="column">
          <Text color={focusColumn === 'phases' ? 'claude' : 'subtle'} bold>
            PHASES
          </Text>
          <PhaseSidebar
            phases={phases}
            agents={focused?.agents ?? []}
            selectedIndex={clampedPhase}
          />
        </Box>
        <Text color="subtle">│</Text>
        <Box flexGrow={1} flexDirection="column">
          <Text color={focusColumn === 'agents' ? 'claude' : 'subtle'} bold>
            AGENTS · {phaseHeader}
          </Text>
          <AgentList agents={visibleAgents} selectedIndex={clampedAgent} />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="subtle">
          Tab 切 run · ←/→ 切焦点 · ↑/↓ 移动 · x kill · r resume · q quit
        </Text>
      </Box>
    </Box>
  );
}
```

- [ ] **Step 2: 删除旧组件**

Run:
```bash
rm src/workflow/panel/WorkflowList.tsx src/workflow/panel/WorkflowDetail.tsx
```

- [ ] **Step 3: 修 `WorkflowsPanel.test.tsx` 的 import（第 2-4 行）**

把：
```ts
import type { RunProgress } from '../progress/store.js';
import { clampSelected } from '../panel/WorkflowsPanel.js';
import { STATUS_DOT } from '../panel/WorkflowList.js';
```
改为：
```ts
import type { RunProgress } from '../progress/store.js';
import { clampSelected } from '../panel/WorkflowsPanel.js';
import { STATUS_DOT } from '../panel/status.js';
```

- [ ] **Step 4: 更新 `WorkflowsPanel.test.tsx` 的 `RunProgress` 字段契约用例（第 28-47 行）**

旧用例构造 `RunProgress` 时缺 `declaredPhases`，tsc 会报错。补字段：

把第 29-38 行的 `const run: RunProgress = { ... }` 改为：
```ts
  const run: RunProgress = {
    runId: 'r1',
    workflowName: 'review',
    status: 'running',
    phases: [{ title: 'Find', status: 'done' }],
    declaredPhases: ['Find', 'Review'],
    currentPhase: 'Review',
    agents: [{ id: 1, label: 'review:api', phase: 'Review', status: 'running' }],
    agentCount: 1,
    updatedAt: 1,
  };
```

同样补第 51-61 行（completed）和第 62-72 行（failed）的 `declaredPhases: []`。

- [ ] **Step 5: precheck**

Run: `bun run precheck`
Expected: 零错误。重点核对：
- `STATUS_DOT` import 已切到 `status.js`，无悬空引用。
- `WorkflowList.tsx` / `WorkflowDetail.tsx` 删除后无残留 import（grep 已确认仅 WorkflowsPanel 与 test 引用，均已处理）。
- `clampSelected` 契约测试仍绿。

- [ ] **Step 6: Commit（逻辑切分点）**

```bash
git add -A src/workflow/panel/ src/workflow/__tests__/WorkflowsPanel.test.tsx
git commit -m "refactor(workflow): WorkflowsPanel 重写为三区焦点模型 + 删旧双栏组件"
```

---

## Task 7: 文档更新 + 全量 precheck

**Files:**
- Modify: `docs/features/workflow-scripts.md:138-148`（§六）

- [ ] **Step 1: 更新 `docs/features/workflow-scripts.md` §六**

把第 138-148 行（§六「监控面板：`/workflows`」整段）替换为：

```markdown
## 六、监控面板：`/workflows`

`/workflows` 打开三区焦点面板（local-jsx，全屏）：

- **顶部 tabs**：每个 run 一个 tab（状态圆点 + workflow 名 + `#runId短码`）；同名脚本多次跑会多个 tab。
- **左 phase 侧栏**：`All` + 合并 meta 声明的 phase（未启动 `○` pending 灰）与实际 phase（`●` running / `✓` done）；选中即决定右栏筛选。
- **右 agent 列表**：按选中 phase 过滤；状态色 + 行尾文字（`running` / `object` / `text` / `dead`）。

**键位**：`Tab`/`Shift+Tab` 切 run · `←`/`→` 切左右焦点列（phases ↔ agents）· `↑`/`↓` 列内移动 · `r` resume · `x` kill · `n` 新建提示 · `q`/`Esc` 退出。

**视觉**：无内框，左右一条竖线分隔；聚焦列标题橙粗；选中/光标行铺橙底（`backgroundColor`），文字色不变。

进度按引擎 `agentId` 精确关联 `agent_done`（解决并发 LIFO 竞态）。pending phase 来自 `run_started` 事件携带的 `meta.phases`，store 落地 `declaredPhases`，面板 `mergePhases` 合并。`useSyncExternalStore` 订阅 `WorkflowService`，稳定快照，无变更不重渲染。
```

- [ ] **Step 2: 全量 precheck**

Run: `bun run precheck`
Expected: 零错误（typecheck + lint:fix + 全量 test）

- [ ] **Step 3: 里程碑检查点 —— 向用户确认是否提交 Task 4-7**

组件层 + 文档完成。按项目约定，此处询问用户是否提交。

---

## Self-Review（计划作者已完成）

**1. Spec coverage** — 对照 spec 各节：
- §4 数据模型（declaredPhases）→ Task 1 ✓
- §4 gap 补充（outputShape，为 §8 object 标记服务）→ Task 1 ✓
- §5/§8 视觉（tab/phase/agent 状态映射 + agentVisual）→ Task 2 ✓
- §6 焦点状态机 + 筛选语义 + tabLabel → Task 3（selectors）+ Task 6（WorkflowsPanel 状态）✓
- §6 键位表 → Task 4（routeWorkflowKey + handlers）✓
- §7 组件拆分（TabsBar/PhaseSidebar/AgentList/status/selectors）→ Task 2/3/5 ✓
- §7 删 WorkflowList/WorkflowDetail + 修 test import → Task 6 ✓
- §9 测试（纯函数 TDD，无 ink-testing-library）→ Task 1-4 ✓
- §10 里程碑 M1-M4 → Task 1(M1) / 2-3(M2 纯逻辑) / 4-6(M2 组件) / 7(M3 测试+M4 文档) ✓

**2. Placeholder scan** — 无 TBD/TODO/"add error handling"/"similar to"。每个代码步给完整代码。

**3. Type consistency** —
- `MergedPhase`（selectors.ts 定义）在 PhaseSidebar.tsx 引用一致 ✓
- `AgentVisual` / `agentVisual`（status.ts）在 AgentList.tsx 引用一致 ✓
- `FocusColumn` / `WorkflowKeyboardHandlers`（useWorkflowKeyboard.ts）在 WorkflowsPanel.tsx 引用一致 ✓
- `declaredPhases` / `outputShape` 在 store.ts 定义、selectors.test/WorkflowsPanel.test 构造一致 ✓
- `ALL_PHASE` 常量在 selectors.ts 定义、PhaseSidebar/WorkflowsPanel 引用一致 ✓
- `routeWorkflowKey` 返回的 action union 与 handlers 方法名一一对应 ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-13-workflow-panel-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 Task 派一个新 subagent，Task 间做 spec/quality 两段 review，迭代快。

**2. Inline Execution** — 在本会话按 Task 顺序执行，批次推进、检查点停下 review。

两种方式都遵循项目约定：`git commit` 仅在你明确要求时执行（Task 末尾的 commit step 是逻辑切分点，默认不自动提交，里程碑末尾统一问你）。

选哪种？
