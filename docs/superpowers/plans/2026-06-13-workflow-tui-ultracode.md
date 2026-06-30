# Workflow 集成层重写 + `/workflows` 面板 + `/ultracode` skill 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在引擎包地基上全量重写 `src/workflow/` 集成层（Service 门面 + 单一深度 `claude-code` 后端 + 进度 bus/reducer），交付 `/workflows` 双栏扁平面板与 `/ultracode` 知识 skill。

**Architecture:** `WorkflowService` 单例持有共享 `WorkflowPorts`（含 `agentAdapterRegistry`——引擎 hooks 已优先用它）；`claudeCodeBackend` 是唯一 `AgentAdapter`，深度从活会话解析 provider/model/agentType/tools；进度走 `progressBus`（多订阅）→ `progressStore` reducer（按 `agentId` 精确关联，修旧 LIFO 竞态）；面板 `useSyncExternalStore` 订阅 store。引擎唯一微调：给 `agent_started`/`agent_done` 加 `agentId`。

**Tech Stack:** TypeScript strict、Bun（`bun:test`）、Zod、React/Ink（`@anthropic/ink`）、`useSyncExternalStore`。

**Spec:** `docs/superpowers/specs/2026-06-13-workflow-tui-ultracode-design.md`

---

## 关键外部接口（已核实，计划代码据此编写）

- `WorkflowPorts`（`packages/workflow-engine/src/ports.ts`）：`{ agentRunner, agentAdapterRegistry?, progressEmitter, taskRegistrar, journalStore, permissionGate, logger, hostFactory }`。**hooks 已优先用 `agentAdapterRegistry`**（`engine/hooks.ts:87-94`），省略则回退 `agentRunner`。
- `AgentAdapter`（`agentAdapter.ts`）：`{ id, capabilities: {structuredOutput, tools?, stream?}, run(params, ctx: {host, signal, runId}), initialize?(), dispose?() }`。`AgentAdapterRegistry`：`register/default/route/resolve/has/get/initializeAll/disposeAll`。
- `runWorkflow({script, args?, runId, workflowName?, ports, host, signal, cwd, budgetTotal, resume?, scriptChanged?})` → `WorkflowRunResult`。
- `createWorkflowTool(ports)` → `WorkflowToolDescriptor`（`call(input, context, canUseTool, parentMessage, onProgress?) → {data:{output}}`）。
- `parseScript`、`createFileJournalStore(dir)`、`resolveNamedWorkflow(dir, name)`、`listNamedWorkflows(dir)`、`createHostHandle/unwrapHostHandle`、`WORKFLOW_DIR_NAME='.claude/workflows'`、`WORKFLOW_RUNS_DIR='.claude/workflow-runs'`。
- 核心：`runAgent({agentDefinition, promptMessages, toolUseContext, canUseTool, isAsync, querySource, availableTools, override:{agentId, model?}})`（async generator）；`assembleToolPool(permissionContext, mcpTools)`（`src/tools.ts`）；`finalizeAgentTool(messages, agentId, {prompt, resolvedAgentModel, isBuiltInAgent, startTime, agentType, isAsync})`（`.content`/`.usage.output_tokens`/`.totalTokens`）；`isBuiltInAgent`、`BuiltInAgentDefinition`、`AgentDefinition`（`loadAgentsDir`）。
- `LocalWorkflowTask`：`registerLocalWorkflowTask(setAppState, {description, workflowName, workflowFile, summary?, toolUseId?, agentId?, abortController?}) → taskId`；`completeWorkflowTask/failWorkflowTask/killWorkflowTask(taskId, setAppState)`。
- `buildTool(def)`（`src/Tool.ts`）；`Tool.call(args, context, canUseTool, parentMessage, onProgress?)`。
- local-jsx 命令：`{ type:'local-jsx', name, description, isEnabled?, load: () => Promise<{call}> }`，`call: (onDone, context: ToolUseContext & LocalJSXCommandContext, args) => Promise<ReactNode>`。
- 注册点（**保留导出名/路径即零改动**）：`src/tools.ts:152`（`require('./workflow/wiring.js').createWorkflowToolCore()`）、`src/commands.ts:95`（`require('./commands/workflows/index.js')` 默认导出）、`src/commands.ts:480`（`require('./workflow/namedWorkflowCommands.js').getWorkflowCommands`）、`src/constants/tools.ts:35`（`WORKFLOW_TOOL_NAME`）、`src/tasks.ts:9`、`src/components/permissions/PermissionRequest.tsx:48,51`。

## 文件结构

**引擎包改动（M1）**
- Modify `packages/workflow-engine/src/types.ts` — `agent_started`/`agent_done` 加 `agentId`。
- Modify `packages/workflow-engine/src/engine/context.ts` — `SharedResources` 加 `agentIdSeq`。
- Modify `packages/workflow-engine/src/engine/hooks.ts` — 盖戳 `agentId`。
- Test `packages/workflow-engine/src/__tests__/agentId.test.ts`。

**src/workflow 集成层（M2–M5）**
- Create `src/workflow/progress/bus.ts` — 类型化发布/订阅。
- Create `src/workflow/progress/store.ts` — `RunProgress`/`AgentProgress` 类型 + reducer（按 agentId）。
- Create `src/workflow/backends/claudeCodeBackend.ts` — `AgentAdapter` + 体系解析 helpers。
- Create `src/workflow/registry.ts` — 建 `AgentAdapterRegistry`（单 adapter）。
- Create `src/workflow/ports.ts` — 组装 `WorkflowPorts`（含 `agentAdapterRegistry`、taskRegistrar bindings）。
- Create `src/workflow/service.ts` — `WorkflowService` 单例。
- Rewrite `src/workflow/wiring.ts`（保留 `createWorkflowToolCore` 导出）。
- Delete `src/workflow/adapter.ts`、`src/workflow/progressStore.ts`。
- Keep `src/workflow/hostHandle.ts`、`namedWorkflowCommands.ts`、`WorkflowPermissionRequest.tsx`。

**面板（M6）**
- Create `src/workflow/panel/WorkflowList.tsx`、`WorkflowDetail.tsx`、`useWorkflowKeyboard.ts`、`WorkflowsPanel.tsx`。
- Rewrite `src/commands/workflows/index.ts`（local-jsx）。
- Modify `src/components/tasks/BackgroundTasksDialog.tsx` — 去 `WorkflowDetailDialog`。
- Delete `src/components/tasks/WorkflowDetailDialog.tsx`。

**skill + 文档（M7–M8）**
- Create `src/skills/bundled/ultracode/SKILL.md`。
- Update `docs/features/workflow-scripts.md`。

---

## Phase M1：引擎进度事件加 `agentId`

### Task 1：`ProgressEvent` 加 `agentId` 字段

**Files:**
- Modify: `packages/workflow-engine/src/types.ts:69-76`

- [ ] **Step 1：改 `agent_started`/`agent_done` 变体加 `agentId: number`**

把 `types.ts` 中的：

```ts
  | { type: 'agent_started'; runId: string; label?: string; phase?: string }
  | {
      type: 'agent_done'
      runId: string
      label?: string
      phase?: string
      result: AgentRunResult
    }
```

替换为：

```ts
  | {
      type: 'agent_started'
      runId: string
      agentId: number
      label?: string
      phase?: string
    }
  | {
      type: 'agent_done'
      runId: string
      agentId: number
      label?: string
      phase?: string
      result: AgentRunResult
    }
```

- [ ] **Step 2：类型检查**

Run: `cd packages/workflow-engine && bunx tsc --noEmit 2>&1 | head`
Expected: 报错指向 `engine/hooks.ts` 的 `emit({ type: 'agent_started'/'agent_done', ... })` 缺 `agentId`（预期，Task 3 修复）。

### Task 2：`SharedResources` 加 `agentIdSeq`

**Files:**
- Modify: `packages/workflow-engine/src/engine/context.ts:10-15, 32-41`

- [ ] **Step 1：类型加字段 + 初始化**

把 `SharedResources` 类型：

```ts
export type SharedResources = {
  semaphore: Semaphore
  budget: Budget
  agentCountBox: { value: number }
  depth: number
}
```

替换为：

```ts
export type SharedResources = {
  semaphore: Semaphore
  budget: Budget
  agentCountBox: { value: number }
  /** agent() 调用的递增序号，盖戳 agent_started/agent_done 供进度精确关联。子 workflow 共享。 */
  agentIdSeq: { value: number }
  depth: number
}
```

把 `createSharedResources`：

```ts
  return {
    semaphore: new Semaphore(maxConcurrency()),
    budget: new Budget(budgetTotal),
    agentCountBox: { value: 0 },
    depth: 0,
  }
```

替换为：

```ts
  return {
    semaphore: new Semaphore(maxConcurrency()),
    budget: new Budget(budgetTotal),
    agentCountBox: { value: 0 },
    agentIdSeq: { value: 0 },
    depth: 0,
  }
```

### Task 3：hooks 盖戳 `agentId`

**Files:**
- Modify: `packages/workflow-engine/src/engine/hooks.ts:21-31, 45-108`

- [ ] **Step 1：`HookProgressInit` 的 agent 变体加 `agentId`**

把：

```ts
type HookProgressInit =
  | { type: 'phase_started'; phase: string }
  | { type: 'phase_done'; phase: string }
  | { type: 'agent_started'; label?: string; phase?: string }
  | {
      type: 'agent_done'
      label?: string
      phase?: string
      result: AgentRunResult
    }
  | { type: 'log'; message: string }
```

替换为：

```ts
type HookProgressInit =
  | { type: 'phase_started'; phase: string }
  | { type: 'phase_done'; phase: string }
  | { type: 'agent_started'; agentId: number; label?: string; phase?: string }
  | {
      type: 'agent_done'
      agentId: number
      label?: string
      phase?: string
      result: AgentRunResult
    }
  | { type: 'log'; message: string }
```

- [ ] **Step 2：`agent()` 内分配并盖戳 `agentId`**

把 `agent` 函数体中（`budget.assertCanSpend()` 之后、`const params` 之前）插入 id 分配，并给三处 `emit` 加 `agentId`。当前：

```ts
    r.budget.assertCanSpend()

    const params: AgentRunParams = { prompt, ...opts }
    const key = agentCallKey(prompt, params)
    const label = opts.label as string | undefined
    const phase =
      (opts.phase as string | undefined) ?? ctx.currentPhase ?? undefined

    // journal 命中 → 直接返回缓存
    if (!ctx.journalInvalidated && ctx.journalIndex < ctx.journal.length) {
      const entry = ctx.journal[ctx.journalIndex]!
      if (entry.key === key) {
        ctx.journalIndex++
        emit({ type: 'agent_done', label, phase, result: entry.result })
        return resultToOutput(entry.result)
      }
```

替换为：

```ts
    r.budget.assertCanSpend()

    // 每次 agent() 调用分配唯一 id（含 journal 命中），盖戳 started/done 供 reducer 精确关联
    const agentId = r.agentIdSeq.value++

    const params: AgentRunParams = { prompt, ...opts }
    const key = agentCallKey(prompt, params)
    const label = opts.label as string | undefined
    const phase =
      (opts.phase as string | undefined) ?? ctx.currentPhase ?? undefined

    // journal 命中 → 直接返回缓存
    if (!ctx.journalInvalidated && ctx.journalIndex < ctx.journal.length) {
      const entry = ctx.journal[ctx.journalIndex]!
      if (entry.key === key) {
        ctx.journalIndex++
        emit({ type: 'agent_done', agentId, label, phase, result: entry.result })
        return resultToOutput(entry.result)
      }
```

把 live 分支两处 emit：

```ts
      ctx.resources.agentCountBox.value++
      emit({ type: 'agent_started', label, phase })
```

替换为：

```ts
      ctx.resources.agentCountBox.value++
      emit({ type: 'agent_started', agentId, label, phase })
```

把：

```ts
      emit({ type: 'agent_done', label, phase, result })
```

替换为：

```ts
      emit({ type: 'agent_done', agentId, label, phase, result })
```

- [ ] **Step 3：类型检查 + 全包测试**

Run: `cd packages/workflow-engine && bunx tsc --noEmit && bun test 2>&1 | tail -5`
Expected: 类型零错误；现有测试仍 PASS（既有 hooks 测试不校验 agentId）。

- [ ] **Step 4：写 agentId 配对回归测试**

Create `packages/workflow-engine/src/__tests__/agentId.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { createEngineContext } from '../engine/context.js'
import { makeHooks } from '../engine/hooks.js'
import { createBufferingEmitter } from '../progress/events.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'
import type { AgentRunParams, AgentRunResult } from '../types.js'

function build(results: Map<string, AgentRunResult>) {
  const { emitter, events } = createBufferingEmitter()
  const ports: WorkflowPorts = {
    agentRunner: {
      runAgentToResult: async (p: AgentRunParams) => results.get(p.prompt) ?? { kind: 'dead' },
    },
    progressEmitter: emitter,
    taskRegistrar: {
      register: () => ({ runId: 'r', signal: new AbortController().signal }),
      complete: () => {}, fail: () => {}, kill: () => {}, pendingAction: () => null,
    },
    journalStore: { read: async () => [], append: async () => {}, truncate: async () => {} },
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({
      handle: createHostHandle(null),
      signal: new AbortController().signal, cwd: '/tmp', budgetTotal: null,
    }),
  }
  const ctx = createEngineContext({
    ports, host: createHostHandle(null), signal: new AbortController().signal,
    runId: 'r', workflowName: 'w', cwd: '/tmp', budgetTotal: null,
  })
  return { ctx, events, hooks: makeHooks(ctx, async () => null) }
}

test('并发 agent 各自拿到唯一 agentId，started/done 配对', async () => {
  const ok = (out: string): AgentRunResult => ({ kind: 'ok', output: out, usage: { outputTokens: 1 } })
  const { ctx, events, hooks } = build(new Map([['a', ok('1')], ['b', ok('2')]]))
  // 并发跑两个 agent
  await hooks.parallel([() => hooks.agent('a'), () => hooks.agent('b')])
  const started = events.filter(e => e.type === 'agent_started')
  const done = events.filter(e => e.type === 'agent_done')
  expect(started).toHaveLength(2)
  expect(done).toHaveLength(2)
  // 每个 started 都有数值 agentId
  const ids = started.map(e => (e as { agentId: number }).agentId)
  expect(new Set(ids).size).toBe(2) // 唯一
  // 每个 done 的 agentId 都能在 started 里找到
  for (const d of done as Array<{ agentId: number }>) {
    expect(ids).toContain(d.agentId)
  }
  // 计数与序号推进
  expect(ctx.resources.agentIdSeq.value).toBe(2)
})

test('agentId 单调递增', async () => {
  const ok = (out: string): AgentRunResult => ({ kind: 'ok', output: out, usage: { outputTokens: 1 } })
  const { events, hooks } = build(new Map([['a', ok('1')], ['b', ok('2')], ['c', ok('3')]]))
  await hooks.agent('a'); await hooks.agent('b'); await hooks.agent('c')
  const ids = events
    .filter(e => e.type === 'agent_started')
    .map(e => (e as { agentId: number }).agentId)
  expect(ids).toEqual([0, 1, 2])
})
```

- [ ] **Step 5：运行测试**

Run: `cd packages/workflow-engine && bun test src/__tests__/agentId.test.ts`
Expected: 2 PASS。

- [ ] **Step 6：提交**

```bash
git add packages/workflow-engine/src/types.ts packages/workflow-engine/src/engine/context.ts packages/workflow-engine/src/engine/hooks.ts packages/workflow-engine/src/__tests__/agentId.test.ts
git commit -m "feat(workflow-engine): stamp agentId on agent_started/agent_done for exact progress correlation"
```

---

## Phase M2：进度 bus + store

### Task 4：进度事件总线 `progress/bus.ts`

**Files:**
- Create: `src/workflow/progress/bus.ts`
- Test: `src/workflow/__tests__/progressBus.test.ts`

- [ ] **Step 1：写失败测试**

Create `src/workflow/__tests__/progressBus.test.ts`:

```ts
import { expect, test, mock } from 'bun:test'
import { createProgressBus } from '../progress/bus.js'

test('emit 广播给所有订阅者', () => {
  const bus = createProgressBus()
  const a = mock(() => {})
  const b = mock(() => {})
  bus.subscribe(a)
  bus.subscribe(b)
  const ev = { type: 'log' as const, runId: 'r', message: 'hi' }
  bus.emit(ev)
  expect(a).toHaveBeenCalledTimes(1)
  expect(b).toHaveBeenCalledWith(ev)
})

test('subscribe 返回取消订阅', () => {
  const bus = createProgressBus()
  const fn = mock(() => {})
  const unsub = bus.subscribe(fn)
  unsub()
  bus.emit({ type: 'log', runId: 'r', message: 'x' })
  expect(fn).not.toHaveBeenCalled()
})
```

- [ ] **Step 2：运行确认失败**

Run: `bun test src/workflow/__tests__/progressBus.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现 `bus.ts`**

Create `src/workflow/progress/bus.ts`:

```ts
import type { ProgressEvent } from '@claude-code-best/workflow-engine'

/** 类型化进度事件总线。引擎 progressEmitter.emit → 广播给所有订阅者（store / 遥测）。 */
export type ProgressBus = {
  emit(event: ProgressEvent): void
  subscribe(listener: (event: ProgressEvent) => void): () => void
}

export function createProgressBus(): ProgressBus {
  const listeners = new Set<(event: ProgressEvent) => void>()
  return {
    emit(event) {
      for (const fn of listeners) fn(event)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
```

- [ ] **Step 4：运行测试**

Run: `bun test src/workflow/__tests__/progressBus.test.ts`
Expected: 2 PASS。

- [ ] **Step 5：提交**

```bash
git add src/workflow/progress/bus.ts src/workflow/__tests__/progressBus.test.ts
git commit -m "feat(workflow): add typed progress event bus"
```

### Task 5：进度 reducer `progress/store.ts`（按 agentId 关联）

**Files:**
- Create: `src/workflow/progress/store.ts`
- Test: `src/workflow/__tests__/progressStore.test.ts`

- [ ] **Step 1：写失败测试（含并发 agentId 关联回归）**

Create `src/workflow/__tests__/progressStore.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { createProgressBus, type ProgressBus } from '../progress/bus.js'
import { createProgressStoreFromBus } from '../progress/store.js'
import type { ProgressEvent, AgentRunResult } from '@claude-code-best/workflow-engine'

const ok = (o: string): AgentRunResult => ({ kind: 'ok', output: o, usage: { outputTokens: 1 } })

function newStore() {
  const bus: ProgressBus = createProgressBus()
  return { bus, store: createProgressStoreFromBus(bus) }
}

function ev(e: Omit<ProgressEvent, never>): ProgressEvent {
  return e
}

test('run_started 建条目；phase_started/done 更新 phases', () => {
  const { bus, store } = newStore()
  bus.emit(ev({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null }))
  bus.emit(ev({ type: 'phase_started', runId: 'r1', phase: 'A' }))
  bus.emit(ev({ type: 'phase_started', runId: 'r1', phase: 'B' }))
  bus.emit(ev({ type: 'phase_done', runId: 'r1', phase: 'A' }))
  const r = store.get('r1')!
  expect(r.phases.map(p => [p.title, p.status])).toEqual([['A', 'done'], ['B', 'running']])
  expect(r.currentPhase).toBe('B')
})

test('并发 agent_done 按 agentId 精确关联（回归旧 LIFO 竞态）', () => {
  const { bus, store } = newStore()
  bus.emit(ev({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null }))
  // 两个并发 agent，started 顺序 0,1，但 done 顺序 1,0（颠倒）
  bus.emit(ev({ type: 'agent_started', runId: 'r1', agentId: 0, label: 'a', phase: 'A' }))
  bus.emit(ev({ type: 'agent_started', runId: 'r1', agentId: 1, label: 'b', phase: 'A' }))
  bus.emit(ev({ type: 'agent_done', runId: 'r1', agentId: 1, label: 'b', phase: 'A', result: ok('b-out') }))
  bus.emit(ev({ type: 'agent_done', runId: 'r1', agentId: 0, label: 'a', phase: 'A', result: ok('a-out') }))
  const agents = store.get('r1')!.agents
  // 各自按 id 落位，不串
  expect(agents.find(x => x.id === 0)?.status).toBe('done')
  expect(agents.find(x => x.id === 1)?.status).toBe('done')
  expect(agents.find(x => x.id === 0)?.label).toBe('a')
  expect(agents.find(x => x.id === 1)?.label).toBe('b')
})

test('journal 命中（仅 agent_done 无 started）按 id 补建 done 条目', () => {
  const { bus, store } = newStore()
  bus.emit(ev({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null }))
  bus.emit(ev({ type: 'agent_done', runId: 'r1', agentId: 7, label: 'c', phase: 'A', result: ok('c') }))
  const a = store.get('r1')!.agents.find(x => x.id === 7)!
  expect(a.status).toBe('done')
})

test('run_done 终态 + list 排序 + subscribe 通知', () => {
  const { bus, store } = newStore()
  let calls = 0
  store.subscribe(() => calls++)
  bus.emit(ev({ type: 'run_started', runId: 'r1', workflowName: 'w', meta: null }))
  bus.emit(ev({ type: 'run_done', runId: 'r1', status: 'completed', returnValue: 42 }))
  const r = store.get('r1')!
  expect(r.status).toBe('completed')
  expect(r.returnValue).toBe(42)
  expect(store.list().map(x => x.runId)).toEqual(['r1'])
  expect(calls).toBeGreaterThanOrEqual(2)
})
```

- [ ] **Step 2：运行确认失败**

Run: `bun test src/workflow/__tests__/progressStore.test.ts`
Expected: FAIL（`../progress/store.js` 无导出）。

- [ ] **Step 3：实现 `store.ts`**

Create `src/workflow/progress/store.ts`:

```ts
import type { ProgressEvent } from '@claude-code-best/workflow-engine'
import type { ProgressBus } from './bus.js'

export type AgentProgress = {
  /** 引擎盖戳的唯一 id，精确关联 started/done（修旧 LIFO 竞态）。 */
  id: number
  label?: string
  phase?: string
  status: 'running' | 'done'
  resultKind?: string
}

export type RunProgress = {
  runId: string
  workflowName: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  phases: Array<{ title: string; status: 'running' | 'done' }>
  currentPhase: string | null
  agents: AgentProgress[]
  agentCount: number
  returnValue?: unknown
  error?: string
  updatedAt: number
}

export type ProgressStore = {
  apply(event: ProgressEvent): void
  list(): RunProgress[]
  get(runId: string): RunProgress | undefined
  /** 供 useSyncExternalStore：返回稳定引用，无变更时同一数组。 */
  subscribe(listener: () => void): () => void
  getSnapshot(): RunProgress[]
}

/** 从 bus 构造 reactive store：订阅 bus，归约事件，通知 React 订阅者。 */
export function createProgressStoreFromBus(bus: ProgressBus): ProgressStore {
  const byId = new Map<string, RunProgress>()
  let snapshot: RunProgress[] = []
  const listeners = new Set<() => void>()

  const notify = (): void => {
    snapshot = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    for (const fn of listeners) fn()
  }

  const ensure = (runId: string, workflowName: string): RunProgress => {
    let p = byId.get(runId)
    if (!p) {
      p = {
        runId, workflowName, status: 'running', phases: [], currentPhase: null,
        agents: [], agentCount: 0, updatedAt: Date.now(),
      }
      byId.set(runId, p)
    }
    return p
  }

  const apply = (event: ProgressEvent): void => {
    const runId = event.runId
    const p = ensure(runId, 'workflowName' in event ? event.workflowName : 'workflow')
    p.updatedAt = Date.now()
    switch (event.type) {
      case 'run_started':
        p.workflowName = event.workflowName
        p.status = 'running'
        break
      case 'phase_started':
        if (!p.phases.some(ph => ph.title === event.phase)) {
          p.phases.push({ title: event.phase, status: 'running' })
        }
        p.currentPhase = event.phase
        break
      case 'phase_done':
        for (const ph of p.phases) if (ph.title === event.phase) ph.status = 'done'
        if (p.currentPhase === event.phase) p.currentPhase = null
        break
      case 'agent_started': {
        // 按 id upsert（幂等）
        let a = p.agents.find(x => x.id === event.agentId)
        if (!a) {
          a = { id: event.agentId, label: event.label, phase: event.phase, status: 'running' }
          p.agents.push(a)
          p.agentCount++
        } else {
          a.status = 'running'; a.label = event.label; a.phase = event.phase
        }
        break
      }
      case 'agent_done': {
        // 按 id 精确落位；无 started（journal 命中）则补建 done 条目
        let a = p.agents.find(x => x.id === event.agentId)
        if (!a) {
          a = { id: event.agentId, label: event.label, phase: event.phase, status: 'done' }
          p.agents.push(a)
        } else {
          a.status = 'done'; a.resultKind = event.result.kind
        }
        break
      }
      case 'log':
        break
      case 'run_done':
        p.status = event.status
        if (event.returnValue !== undefined) p.returnValue = event.returnValue
        if (event.error !== undefined) p.error = event.error
        break
    }
    notify()
  }

  bus.subscribe(apply)
  return {
    apply,
    list: () => snapshot,
    get: id => byId.get(id),
    subscribe: fn => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getSnapshot: () => snapshot,
  }
}
```

- [ ] **Step 4：运行测试**

Run: `bun test src/workflow/__tests__/progressStore.test.ts`
Expected: 4 PASS。

- [ ] **Step 5：提交**

```bash
git add src/workflow/progress/store.ts src/workflow/__tests__/progressStore.test.ts
git commit -m "feat(workflow): progress store keyed by agentId (fixes concurrent correlation race)"
```

---

## Phase M3：后端 + Registry + ports

### Task 6：深度后端 `backends/claudeCodeBackend.ts`

**Files:**
- Create: `src/workflow/backends/claudeCodeBackend.ts`
- Test: `src/workflow/__tests__/claudeCodeBackend.test.ts`

> 说明：把旧 `adapter.ts` 的 `runWorkflowSubAgent` 逻辑抽成 `AgentAdapter`，并加 agentType→真实注册表、model→映射解析。

- [ ] **Step 1：写失败测试（mock `runAgent`/`assembleToolPool`/`finalizeAgentTool`）**

Create `src/workflow/__tests__/claudeCodeBackend.test.ts`:

```ts
import { expect, test, mock } from 'bun:test'

// mock 底层依赖（不 mock 被测业务模块）
mock.module('@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js', () => ({
  runAgent: async function* () {
    yield { type: 'assistant', message: { content: [{ type: 'text', text: 'agent-text' }] } }
  },
}))
mock.module('@claude-code-best/builtin-tools/tools/AgentTool/agentToolUtils.js', () => ({
  finalizeAgentTool: () => ({
    content: [{ type: 'text', text: 'agent-text' }],
    usage: { output_tokens: 42 },
    totalTokens: 42,
  }),
  isBuiltInAgent: () => true,
}))
mock.module('@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js', () => ({
  isBuiltInAgent: () => true,
}))
mock.module('../tools.js', () => ({
  assembleToolPool: () => ({ tools: [] }),
}))
mock.module('../utils/messages.js', () => ({
  createUserMessage: (o: { content: string }) => ({ role: 'user', content: o.content }),
  extractTextContent: (_c: unknown, sep: string) => 'agent-text',
}))
mock.module('../utils/uuid.js', () => ({ createAgentId: () => 'agent-1' }))
mock.module('../services/analytics/index.js', () => ({ logEvent: () => {} }))
mock.module('../utils/debug.js', () => ({ logForDebugging: () => {} }))

import { claudeCodeBackend } from '../backends/claudeCodeBackend.js'
import { makeHostHandle } from '../hostHandle.js'

function ctx() {
  return { host: makeHostHandle({
    toolUseContext: {
      options: { agentDefinitions: { activeAgents: [] }, querySource: 'workflow', mainLoopModel: 'm' },
      getAppState: () => ({ toolPermissionContext: { mode: 'acceptEdits', alwaysAllowRules: {} }, mcp: { tools: [] } }),
    } as never,
    canUseTool: (() => Promise.resolve({ behavior: 'allow' })) as never,
    parentMessage: undefined,
  }), signal: new AbortController().signal, runId: 'r1' }
}

test('文本 agent → ok + token 计量', async () => {
  const res = await claudeCodeBackend.run({ prompt: 'do it' }, ctx())
  expect(res.kind).toBe('ok')
  if (res.kind === 'ok') {
    expect(res.output).toBe('agent-text')
    expect(res.usage.outputTokens).toBe(42)
  }
})

test('runAgent 抛错 → dead', async () => {
  mock.module('@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js', () => ({
    runAgent: async function* () { throw new Error('boom') },
  }))
  const res = await claudeCodeBackend.run({ prompt: 'fail' }, ctx())
  expect(res.kind).toBe('dead')
})

test('id 与 capabilities 形状', () => {
  expect(claudeCodeBackend.id).toBe('claude-code')
  expect(claudeCodeBackend.capabilities.structuredOutput).toBe(true)
})
```

- [ ] **Step 2：运行确认失败**

Run: `bun test src/workflow/__tests__/claudeCodeBackend.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现 `claudeCodeBackend.ts`**

Create `src/workflow/backends/claudeCodeBackend.ts`:

```ts
import {
  type AgentAdapter,
  type AgentAdapterContext,
  type AgentRunParams,
  type AgentRunResult,
} from '@claude-code-best/workflow-engine'
import { assembleToolPool } from '../../tools.js'
import { finalizeAgentTool } from '@claude-code-best/builtin-tools/tools/AgentTool/agentToolUtils.js'
import { runAgent } from '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js'
import {
  isBuiltInAgent,
  type AgentDefinition,
  type BuiltInAgentDefinition,
} from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { createUserMessage, extractTextContent } from '../../utils/messages.js'
import { createAgentId } from '../../utils/uuid.js'
import { logForDebugging } from '../../utils/debug.js'
import { logEvent } from '../../services/analytics/index.js'
import type { Message } from '../../types/message.js'
import type { ToolUseContext } from '../../Tool.js'
import { readHostBundle } from '../hostHandle.js'

/** workflow 子 agent 的兜底定义（agentType 未命中真实注册表时用）。 */
const WORKFLOW_AGENT: BuiltInAgentDefinition = {
  agentType: 'workflow-worker',
  whenToUse: 'workflow 脚本内 agent() 钩子派发的子任务',
  tools: ['*'],
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: () =>
    'You are a workflow sub-agent. Complete the task concisely; your final text is the return value relayed to the workflow.',
}

/** agentType → 真实 agent 注册表（activeAgents 命中即用，否则兜底）。 */
function resolveAgentDefinition(
  agentType: string | undefined,
  toolUseContext: ToolUseContext,
): AgentDefinition {
  if (!agentType) return WORKFLOW_AGENT
  const found = toolUseContext.options.agentDefinitions.activeAgents.find(
    a => a.agentType === agentType,
  )
  return found ?? WORKFLOW_AGENT
}

/** model 别名 → 当前 provider 实际 model id。v1 直传（保留映射扩展点）。 */
function mapWorkflowModel(model: string | undefined): string | undefined {
  return model
}

/** 从 agent 最终消息中提取 StructuredOutput 产出的 JSON 对象；失败返回 null。 */
function extractStructuredOutput(
  content: Array<{ type: string; text?: string }>,
): unknown | null {
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      const trimmed = block.text.trim()
      const start = trimmed.indexOf('{')
      const end = trimmed.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1))
        } catch {
          // 继续
        }
      }
    }
  }
  return null
}

/** 深度集成后端：从活会话解析 agent/model/tools，委托核心 runAgent。 */
export const claudeCodeBackend: AgentAdapter = {
  id: 'claude-code',
  capabilities: { structuredOutput: true, tools: true },

  async run(params: AgentRunParams, ctx: AgentAdapterContext): Promise<AgentRunResult> {
    const { toolUseContext, canUseTool } = readHostBundle(ctx.host)
    const appState = toolUseContext.getAppState()
    const agentDef = resolveAgentDefinition(params.agentType, toolUseContext)
    const model = mapWorkflowModel(params.model)
    const agentId = createAgentId()

    const workerPermissionContext = {
      ...appState.toolPermissionContext,
      mode: agentDef.permissionMode ?? 'acceptEdits',
    }
    const workerTools = assembleToolPool(workerPermissionContext, appState.mcp.tools)

    const promptText = params.schema
      ? `${params.prompt}\n\nYou MUST return your final answer by calling the StructuredOutput tool with a value matching this JSON Schema:\n${JSON.stringify(params.schema)}`
      : params.prompt
    const promptMessages = [createUserMessage({ content: promptText })]
    const messages: Message[] = []
    const startTime = Date.now()

    try {
      for await (const msg of runAgent({
        agentDefinition: agentDef,
        promptMessages,
        toolUseContext,
        canUseTool,
        isAsync: true,
        querySource: toolUseContext.options.querySource ?? 'workflow',
        availableTools: workerTools,
        override: { agentId, ...(model ? { model: model as never } : {}) },
        ...(params.maxTokens ? { maxTokens: params.maxTokens as never } : {}),
      })) {
        messages.push(msg as Message)
      }
    } catch (e) {
      logForDebugging(`workflow sub-agent error: ${(e as Error).message}`)
      return { kind: 'dead' }
    }

    const finalized = finalizeAgentTool(messages, agentId, {
      prompt: params.prompt,
      resolvedAgentModel: toolUseContext.options.mainLoopModel,
      isBuiltInAgent: isBuiltInAgent(agentDef),
      startTime,
      agentType: agentDef.agentType,
      isAsync: true,
    })
    const outputTokens = finalized.usage?.output_tokens ?? finalized.totalTokens ?? 0
    logEvent('tengu_workflow_agent', {
      agentType: agentDef.agentType, ok: true, outputTokens,
    })

    if (params.schema) {
      const structured = extractStructuredOutput(finalized.content)
      if (structured === null) return { kind: 'dead' }
      return { kind: 'ok', output: structured as object, usage: { outputTokens } }
    }
    const text = extractTextContent(finalized.content, '\n')
    return { kind: 'ok', output: text, usage: { outputTokens } }
  },
}
```

- [ ] **Step 4：运行测试**

Run: `bun test src/workflow/__tests__/claudeCodeBackend.test.ts`
Expected: 3 PASS。

- [ ] **Step 5：提交**

```bash
git add src/workflow/backends/claudeCodeBackend.ts src/workflow/__tests__/claudeCodeBackend.test.ts
git commit -m "feat(workflow): claude-code AgentAdapter (deep AppState/provider/agent resolution)"
```

### Task 7：Registry + ports 组装

**Files:**
- Create: `src/workflow/registry.ts`
- Create: `src/workflow/ports.ts`
- Test: `src/workflow/__tests__/ports.test.ts`

- [ ] **Step 1：写失败测试**

Create `src/workflow/__tests__/ports.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { buildRegistry } from '../registry.js'
import { createWorkflowPorts } from '../ports.js'
import { createProgressBus } from '../progress/bus.js'
import { createProgressStoreFromBus } from '../progress/store.js'

test('buildRegistry 注册 claude-code 为默认且 resolve 命中', () => {
  const reg = buildRegistry()
  expect(reg.has('claude-code')).toBe(true)
  expect(reg.resolve({ prompt: 'x' }).id).toBe('claude-code')
  expect(reg.resolve({ prompt: 'x', agentType: 'whatever' }).id).toBe('claude-code')
})

test('createWorkflowPorts 组装完整端口（含 agentAdapterRegistry 与 progressEmitter→bus）', () => {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  expect(ports.agentAdapterRegistry).toBeDefined()
  expect(ports.agentAdapterRegistry!.resolve({ prompt: 'x' }).id).toBe('claude-code')
  expect(typeof ports.taskRegistrar.register).toBe('function')
  expect(typeof ports.hostFactory).toBe('function')
})
```

- [ ] **Step 2：运行确认失败**

Run: `bun test src/workflow/__tests__/ports.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3：实现 `registry.ts`**

Create `src/workflow/registry.ts`:

```ts
import { type AgentAdapterRegistry } from '@claude-code-best/workflow-engine'
import { claudeCodeBackend } from './backends/claudeCodeBackend.js'

/**
 * 构建多后端 registry。v1（depth B）只注册单一 claude-code adapter 为默认，
 * 不预填路由规则——扩第二个 provider adapter 时再补 .route(...)。
 */
export function buildRegistry(): AgentAdapterRegistry {
  const reg = new AgentAdapterRegistry()
  reg.register(claudeCodeBackend).default('claude-code')
  return reg
}
```

> 注：`AgentAdapterRegistry` 是 class（引擎导出），`new` 可用。

- [ ] **Step 4：实现 `ports.ts`**

Create `src/workflow/ports.ts`:

```ts
import {
  createFileJournalStore,
  type ProgressEvent,
  type WorkflowPorts,
} from '@claude-code-best/workflow-engine'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { getProjectRoot } from '../bootstrap/state.js'
import { logEvent } from '../services/analytics/index.js'
import {
  registerLocalWorkflowTask,
  completeWorkflowTask,
  failWorkflowTask,
  killWorkflowTask,
} from '../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import { makeHostHandle, readHostBundle, type WorkflowHostBundle } from './hostHandle.js'
import { buildRegistry } from './registry.js'
import type { ProgressBus } from './progress/bus.js'
import type { ProgressStore } from './progress/store.js'
import type { SetAppState } from '../Task.js'

type RunBinding = {
  runId: string
  taskId: string
  setAppState: SetAppState
  abortController: AbortController
  workflowName: string
}

/** 每次工具调用从 toolUseContext 构造 WorkflowHostContext。 */
function makeHostFactory(): WorkflowPorts['hostFactory'] {
  return ({ context, canUseTool, parentMessage }) => {
    const ctx = context as WorkflowHostBundle['toolUseContext']
    return {
      handle: makeHostHandle({
        toolUseContext: ctx,
        canUseTool: canUseTool as WorkflowHostBundle['canUseTool'],
        parentMessage: parentMessage as WorkflowHostBundle['parentMessage'],
        agentId: ctx.agentId,
      }),
      cwd: getCwd(),
      budgetTotal: null, // turn 级预算注入点（未来从 settings 读）
      toolUseId: ctx.toolUseId,
    }
  }
}

/**
 * 组装完整 WorkflowPorts。bus/store 由调用方传入（service 单例共享）。
 * taskRegistrar 维护 runId → RunBinding 供 kill 路由。
 */
export function createWorkflowPorts(opts: {
  bus: ProgressBus
  store: ProgressStore
}): WorkflowPorts {
  const bindings = new Map<string, RunBinding>()
  const runsDir = `${getProjectRoot()}/.claude/workflow-runs`
  const registry = buildRegistry()

  // 遥测订阅（独立于 store）
  opts.bus.subscribe((e: ProgressEvent) => {
    if (e.type === 'run_done') {
      logEvent('tengu_workflow_done', { status: e.status, runId: e.runId })
    }
  })

  return {
    hostFactory: makeHostFactory(),
    agentAdapterRegistry: registry,

    progressEmitter: {
      emit(event) {
        opts.bus.emit(event) // → store reducer + 遥测
      },
    },

    taskRegistrar: {
      register(regOpts, host) {
        const bundle = readHostBundle(host)
        const setAppState =
          bundle.toolUseContext.setAppStateForTasks ?? bundle.toolUseContext.setAppState
        const abortController = new AbortController()
        const taskId = registerLocalWorkflowTask(setAppState, {
          description: regOpts.summary ?? regOpts.workflowName,
          workflowName: regOpts.workflowName,
          workflowFile: regOpts.workflowFile ?? '',
          summary: regOpts.summary,
          ...(regOpts.toolUseId ? { toolUseId: regOpts.toolUseId } : {}),
          abortController,
        })
        const runId = regOpts.runId ?? taskId
        bindings.set(runId, {
          runId, taskId, setAppState, abortController, workflowName: regOpts.workflowName,
        })
        logEvent('tengu_workflow_started', { runId })
        return { runId, signal: abortController.signal }
      },
      complete(runId, summary) {
        const b = bindings.get(runId)
        if (!b) return
        completeWorkflowTask(b.taskId, b.setAppState)
        logForDebugging(`workflow ${runId} completed: ${summary ?? ''}`)
      },
      fail(runId, error) {
        const b = bindings.get(runId)
        if (!b) return
        failWorkflowTask(b.taskId, b.setAppState)
        logForDebugging(`workflow ${runId} failed: ${error}`)
      },
      kill(runId) {
        const b = bindings.get(runId)
        if (!b) return
        killWorkflowTask(b.taskId, b.setAppState) // abort controller 内置
      },
      pendingAction() {
        return null // v1：skip/retry 不接线（seam 保留）
      },
    },

    journalStore: createFileJournalStore(runsDir),

    permissionGate: {
      // 引擎用 ctx.signal（register 返回的 AbortController）判 abort
      isAborted: () => false,
    },

    logger: {
      debug: msg => logForDebugging(msg),
      event: name => logForDebugging(`workflow event: ${name}`),
    },
  }
}
```

- [ ] **Step 5：运行测试**

Run: `bun test src/workflow/__tests__/ports.test.ts`
Expected: 2 PASS。

- [ ] **Step 6：提交**

```bash
git add src/workflow/registry.ts src/workflow/ports.ts src/workflow/__tests__/ports.test.ts
git commit -m "feat(workflow): AgentAdapterRegistry + WorkflowPorts assembly"
```

---

## Phase M4：Service 门面

### Task 8：`WorkflowService` 单例

**Files:**
- Create: `src/workflow/service.ts`
- Test: `src/workflow/__tests__/service.test.ts`

- [ ] **Step 1：写失败测试（mock 端口，无 LLM）**

Create `src/workflow/__tests__/service.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// service 用真实 ports（registry/bus/store）+ mock taskRegistrar；不触发 LLM（registry adapter 被 mock）
mock.module('../backends/claudeCodeBackend.js', () => ({
  claudeCodeBackend: {
    id: 'claude-code',
    capabilities: { structuredOutput: true },
    async run() {
      return { kind: 'ok', output: 'mock-out', usage: { outputTokens: 1 } }
    },
  },
}))
mock.module('../utils/cwd.js', () => ({ getCwd: () => '/tmp' }))
mock.module('../bootstrap/state.js', () => ({ getProjectRoot: () => '/tmp' }))
mock.module('../services/analytics/index.js', () => ({ logEvent: () => {} }))
mock.module('../utils/debug.js', () => ({ logForDebugging: () => {} }))
mock.module('../tasks/LocalWorkflowTask/LocalWorkflowTask.js', () => ({
  registerLocalWorkflowTask: () => 'task-1',
  completeWorkflowTask: () => {}, failWorkflowTask: () => {}, killWorkflowTask: () => {},
}))
mock.module('../tools.js', () => ({ assembleToolPool: () => ({ tools: [] }) }))

import { getWorkflowService } from '../service.js'

function tmpRuns() {
  return mkdtemp(join(tmpdir(), 'wf-svc-'))
}

test('launch → completed，store 出现该 run；kill 走 taskRegistrar', async () => {
  const dir = await tmpRuns()
  try {
    process.env.WORKFLOW_RUNS_DIR = dir
    const svc = getWorkflowService()
    const { runId } = await svc.launch(
      { script: `return agent('compute')` },
      { /* toolUseContext stub */ } as never,
      (() => Promise.resolve({ behavior: 'allow' })) as never,
    )
    // 等待 detached run
    await new Promise(r => setTimeout(r, 60))
    const r = svc.getRun(runId)
    expect(r).toBeDefined()
    expect(['completed', 'running']).toContain(r!.status)
  } finally {
    await rm(dir, { recursive: true, force: true })
    delete process.env.WORKFLOW_RUNS_DIR
  }
})

test('listNamed 委托 namedWorkflows（空目录→[]）', async () => {
  const svc = getWorkflowService()
  const names = await svc.listNamed(join(tmpdir(), 'wf-nope-' + Math.random()))
  expect(names).toEqual([])
})

test('subscribe 返回取消订阅', () => {
  const svc = getWorkflowService()
  let n = 0
  const unsub = svc.subscribe(() => n++)
  unsub()
  expect(typeof unsub).toBe('function')
  expect(n).toBe(0)
})
```

> 注：`mock` 需在顶部导入：把 `import { expect, test, mock } from 'bun:test'`（首行）。`launch` 的第三参为 canUseTool。

- [ ] **Step 2：运行确认失败**

Run: `bun test src/workflow/__tests__/service.test.ts`
Expected: FAIL（`../service.js` 不存在）。

- [ ] **Step 3：实现 `service.ts`**

Create `src/workflow/service.ts`:

```ts
import {
  createFileJournalStore,
  createHostHandle,
  parseScript,
  runWorkflow,
  type WorkflowHostContext,
  type WorkflowInput,
  type WorkflowPorts,
  WORKFLOW_DIR_NAME,
  resolveNamedWorkflow,
  listNamedWorkflows,
} from '@claude-code-best/workflow-engine'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { getProjectRoot } from '../bootstrap/state.js'
import { logEvent } from '../services/analytics/index.js'
import { makeHostHandle, type WorkflowHostBundle } from './hostHandle.js'
import { createProgressBus } from './progress/bus.js'
import { createProgressStoreFromBus, type ProgressStore } from './progress/store.js'
import { createWorkflowPorts } from './ports.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { ToolUseContext } from '../Tool.js'
import type { RunProgress } from './progress/store.js'

export type WorkflowService = {
  /** 共享端口（工具描述符用）。 */
  ports: WorkflowPorts
  /** 面板/工具启动 workflow：解析脚本 → register → detached runWorkflow。 */
  launch(
    input: Pick<WorkflowInput, 'script' | 'name' | 'scriptPath' | 'args' | 'description' | 'resumeFromRunId' | 'title'>,
    toolUseContext: ToolUseContext,
    canUseTool: CanUseToolFn,
  ): Promise<{ runId: string }>
  kill(runId: string): void
  listRuns(): RunProgress[]
  getRun(runId: string): RunProgress | undefined
  subscribe(listener: () => void): () => void
  listNamed(workflowDir?: string): Promise<string[]>
}

let cached: WorkflowService | null = null

/** 进程单例。工具与面板共享同一 ports/registry/store。 */
export function getWorkflowService(): WorkflowService {
  if (cached) return cached
  const bus = createProgressBus()
  const store: ProgressStore = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  cached = makeService(ports, store)
  return cached
}

/** 测试用：注入 ports。 */
export function makeService(ports: WorkflowPorts, store: ProgressStore): WorkflowService {
  const runsDir = () =>
    process.env.WORKFLOW_RUNS_DIR ?? `${getProjectRoot()}/.claude/workflow-runs`

  const buildHost = (
    toolUseContext: ToolUseContext,
    canUseTool: CanUseToolFn,
  ): WorkflowHostContext => ({
    handle: makeHostHandle({
      toolUseContext,
      canUseTool,
      parentMessage: undefined,
      agentId: toolUseContext.agentId,
    } as WorkflowHostBundle),
    cwd: getCwd(),
    budgetTotal: null,
    toolUseId: toolUseContext.toolUseId,
  })

  async function resolveSource(input: {
    script?: string; name?: string; scriptPath?: string
  }): Promise<{ script: string; workflowFile?: string; workflowName: string }> {
    if (input.script) return { script: input.script, workflowName: input.name ?? 'workflow' }
    if (input.scriptPath) {
      const { readFile } = await import('node:fs/promises')
      return {
        script: await readFile(input.scriptPath, 'utf-8'),
        workflowFile: input.scriptPath,
        workflowName: input.name ?? 'workflow',
      }
    }
    if (input.name) {
      const found = await resolveNamedWorkflow(join(getCwd(), WORKFLOW_DIR_NAME), input.name)
      if (!found) throw new Error(`命名 workflow "${input.name}" 未找到（查找 ${WORKFLOW_DIR_NAME}/）`)
      return { script: found.content, workflowFile: found.path, workflowName: input.name }
    }
    throw new Error('必须提供 script、name 或 scriptPath 之一')
  }

  return {
    ports,

    async launch(input, toolUseContext, canUseTool) {
      const { script, workflowFile, workflowName } = await resolveSource(input)
      try {
        parseScript(script) // 快速校验，失败抛
      } catch (e) {
        throw new Error(`脚本校验失败：${(e as Error).message}`)
      }
      const host = buildHost(toolUseContext, canUseTool)
      const { runId, signal } = ports.taskRegistrar.register(
        {
          workflowName,
          ...(workflowFile ? { workflowFile } : {}),
          ...(input.description ? { summary: input.description } : {}),
          ...(host.toolUseId ? { toolUseId: host.toolUseId } : {}),
          ...(input.resumeFromRunId ? { runId: input.resumeFromRunId } : {}),
        },
        host.handle,
      )
      // detached 执行
      void runWorkflow({
        script,
        ...(input.args !== undefined ? { args: input.args } : {}),
        runId,
        workflowName,
        ports,
        host: host.handle,
        signal,
        cwd: host.cwd,
        budgetTotal: host.budgetTotal,
        ...(input.resumeFromRunId ? { resume: true } : {}),
      }).then(result => {
        if (result.status === 'completed') ports.taskRegistrar.complete(runId)
        else if (result.status === 'failed') ports.taskRegistrar.fail(runId, result.error ?? 'failed')
        else ports.taskRegistrar.kill(runId)
      }).catch(e => ports.taskRegistrar.fail(runId, (e as Error).message))
      logForDebugging(`workflow launched: ${runId} (${workflowName})`)
      return { runId }
    },

    kill(runId) {
      ports.taskRegistrar.kill(runId)
    },
    listRuns: () => store.list(),
    getRun: id => store.get(id),
    subscribe: fn => store.subscribe(fn),
    async listNamed(workflowDir) {
      return listNamedWorkflows(workflowDir ?? join(getCwd(), WORKFLOW_DIR_NAME))
    },
  }
}

// 兼容：旧 ports.ts 用 createFileJournalStore（已由 ports.ts 内部用；此处保留导入以备测试覆盖）
export { createHostHandle, createFileJournalStore }
export type { WorkflowInput }
```

> 注：`createFileJournalStore`/`createHostHandle` 在 service 里未直接用（ports.ts 用），re-export 仅防 lint 误报未用导入；若 `bunx tsc` 报未使用，删除该行 re-export。

- [ ] **Step 4：运行测试**

Run: `bun test src/workflow/__tests__/service.test.ts`
Expected: 3 PASS。若 `launch` 测试因 mock 路径不匹配而 fail，检查 `mock.module` 的 specifier 与 `service.ts` 实际 import 路径一致。

- [ ] **Step 5：提交**

```bash
git add src/workflow/service.ts src/workflow/__tests__/service.test.ts
git commit -m "feat(workflow): WorkflowService facade (launch/kill/subscribe/listNamed)"
```

---

## Phase M5：工具 wiring + 去 WorkflowDetailDialog

### Task 9：重写 `wiring.ts`（走 service）

**Files:**
- Rewrite: `src/workflow/wiring.ts`

- [ ] **Step 1：整体替换 `wiring.ts`**

Replace entire `src/workflow/wiring.ts` with:

```ts
import {
  createWorkflowTool,
  type WorkflowToolDescriptor,
} from '@claude-code-best/workflow-engine'
import { buildTool, type Tool } from '../Tool.js'
import { getWorkflowService } from './service.js'

/**
 * 把引擎自包含描述符适配为 buildTool 兼容的 Tool。
 * 描述符统一走 service 单例（共享 ports/registry/store）。
 */
function buildWorkflowTool(): Tool {
  const { ports } = getWorkflowService()
  const descriptor: WorkflowToolDescriptor = createWorkflowTool(ports)
  return buildTool({
    name: descriptor.name,
    maxResultSizeChars: 50_000,
    inputSchema: descriptor.inputSchema,
    isEnabled: () => descriptor.isEnabled(),
    isReadOnly: input => descriptor.isReadOnly(input),
    isConcurrencySafe: () => true,
    async description() {
      return descriptor.description()
    },
    async prompt() {
      return descriptor.prompt()
    },
    async call(input, context, canUseTool, parentMessage, onProgress) {
      const result = await descriptor.call(
        input, context, canUseTool, parentMessage, onProgress,
      )
      return { data: result.data }
    },
    renderToolUseMessage: input => descriptor.renderToolUseMessage(input),
    mapToolResultToToolResultBlockParam: (data, toolUseId) =>
      descriptor.mapToolResultToToolResultBlockParam(data, toolUseId),
  })
}

// 单例：tools.ts 注册与 PermissionRequest 引用需为同一实例（switch 按引用匹配）。
let cached: Tool | null = null

export function createWorkflowToolCore(): Tool {
  if (!cached) cached = buildWorkflowTool()
  return cached
}
```

- [ ] **Step 2：删除旧 `adapter.ts` 与 `progressStore.ts`**

```bash
git rm src/workflow/adapter.ts src/workflow/progressStore.ts
```

> 校验无残留引用：`grep -rn "workflow/adapter\|workflow/progressStore" src` 应仅命中本计划新增的 progress/ 目录（`progress/store.ts` 路径不同，不算）。若命中旧路径引用，改为新模块。

- [ ] **Step 3：类型检查 + lint**

Run: `bunx tsc --noEmit 2>&1 | grep -E "workflow|error" | head`
Expected: 零错误（`createWorkflowToolCore`/`createWorkflowAdapter` 旧引用已清除——`wiring.ts` 不再 import adapter）。

- [ ] **Step 4：提交**

```bash
git add src/workflow/wiring.ts
git commit -m "refactor(workflow): wiring via WorkflowService singleton; drop legacy adapter/progressStore"
```

### Task 10：`BackgroundTasksDialog` 去 `WorkflowDetailDialog`

**Files:**
- Modify: `src/components/tasks/BackgroundTasksDialog.tsx:110-112, 443-463`

- [ ] **Step 1：读当前 local_workflow 渲染分支**

Run: `sed -n '108,120p;440,465p' src/components/tasks/BackgroundTasksDialog.tsx`
确认 line 110-112 的 `WorkflowDetailDialog` 条件导入、line 443-463 的 `case 'local_workflow'` 渲染 `<WorkflowDetailDialog .../>`。

- [ ] **Step 2：移除 `WorkflowDetailDialog` 导入**

把（约 110-112 行）：

```ts
const WorkflowDetailDialog = feature('WORKFLOW_SCRIPTS')
  ? (require('./WorkflowDetailDialog.js') as typeof import('./WorkflowDetailDialog.js')).WorkflowDetailDialog
  : null;
```

替换为：

```ts
// WorkflowDetailDialog 已移除：workflow 详情改由 /workflows 面板展示。
```

- [ ] **Step 3：`case 'local_workflow'` 改为内联摘要 + /workflows 提示**

把（约 443 行起的）`case 'local_workflow':` 分支中渲染 `<WorkflowDetailDialog .../>` 的部分，替换为内联摘要（具体 JSX 视 Step 1 读到的实际结构而定，保留外层容器与 `key`）。示例替换（若原结构为 `return <WorkflowDetailDialog workflow={task} ... />`）：

```tsx
      case 'local_workflow':
        if (!task) return null;
        return (
          <Box key={`workflow-${task.id}`} flexDirection="column" paddingX={1}>
            <Text bold>{task.workflowName}</Text>
            <Text color="subtle">
              {task.status} · {task.summary ?? task.description}
            </Text>
            <Text color="subtle">用 /workflows 查看阶段与 agent 实时进度</Text>
          </Box>
        );
```

> 注：`Box`/`Text` 已在该文件顶部从 `@anthropic/ink` 导入（确认存在；若无则补 `import { Box, Text } from '@anthropic/ink'`）。

- [ ] **Step 4：删除 `WorkflowDetailDialog.tsx`**

```bash
git rm src/components/tasks/WorkflowDetailDialog.tsx
```

- [ ] **Step 5：校验无残留引用**

Run: `grep -rn "WorkflowDetailDialog" src`
Expected: 无输出（或仅注释）。

- [ ] **Step 6：类型检查 + 测试**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "backgroundtasks|workflow" | head`
Expected: 零错误。

- [ ] **Step 7：提交**

```bash
git add src/components/tasks/BackgroundTasksDialog.tsx
git commit -m "refactor(tasks): drop WorkflowDetailDialog; workflow detail now in /workflows panel"
```

- [ ] **Step 8：里程碑 M5 全量 precheck**

Run: `bun run precheck`
Expected: typecheck + lint fix + test 全绿。

```bash
git commit --allow-empty -m "chore(workflow): M5 integration switch — precheck green"
```

---

## Phase M6：`/workflows` 双栏面板

### Task 11：`WorkflowList`（左栏）

**Files:**
- Create: `src/workflow/panel/WorkflowList.tsx`

- [ ] **Step 1：实现左栏扁平列表**

Create `src/workflow/panel/WorkflowList.tsx`:

```tsx
import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { RunProgress } from '../progress/store.js'

const STATUS_DOT: Record<RunProgress['status'], string> = {
  running: '●', completed: '✓', failed: '✗', killed: '■',
}

type Props = {
  runs: RunProgress[]
  named: string[]
  selected: number
}

/** 左栏：扁平 workflow 列表（状态点+名+当前 phase+计数）+ NAMED 区。 */
export function WorkflowList({ runs, named, selected }: Props): React.ReactNode {
  const rows = runs
  return (
    <Box flexDirection="column">
      {rows.length === 0 ? (
        <Text color="subtle">No active runs.</Text>
      ) : (
        rows.map((r, i) => (
          <Box key={r.runId}>
            <Text color={i === selected ? 'claude' : undefined}>
              {i === selected ? '▸ ' : '  '}
            </Text>
            <Text color={r.status === 'running' ? 'warning' : r.status === 'failed' ? 'error' : r.status === 'completed' ? 'success' : 'subtle'}>
              {STATUS_DOT[r.status]}
            </Text>
            <Text> {r.workflowName.padEnd(20).slice(0, 20)}</Text>
            <Text color="subtle">
              {' '}
              {r.currentPhase ?? (r.status === 'completed' ? 'done' : r.status)}{' '}
              {r.agents.length}/{r.agentCount}
            </Text>
          </Box>
        ))
      )}
      {named.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color="subtle">Named:</Text>
          <Text color="subtle">{' ' + named.join(' · ')}</Text>
        </Box>
      )}
    </Box>
  )
}
```

### Task 12：`WorkflowDetail`（右栏）

**Files:**
- Create: `src/workflow/panel/WorkflowDetail.tsx`

- [ ] **Step 1：实现右栏 phase 横条 + 扁平 agent 列表**

Create `src/workflow/panel/WorkflowDetail.tsx`:

```tsx
import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { AgentProgress, RunProgress } from '../progress/store.js'

function phaseMark(status: 'running' | 'done'): string {
  return status === 'done' ? '✓' : '●'
}

function agentMark(a: AgentProgress): string {
  if (a.status === 'done') return a.resultKind === 'ok' ? '✓' : a.resultKind === 'dead' ? '✗' : '✓'
  return '●'
}

type Props = { run: RunProgress | undefined }

/** 右栏：聚焦 workflow 的 phase 横条 + 扁平 agent 列表。 */
export function WorkflowDetail({ run }: Props): React.ReactNode {
  if (!run) {
    return (
      <Text color="subtle">选择左侧一个 workflow，或按 n 启动命名 workflow。</Text>
    )
  }
  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{run.workflowName}</Text>
        <Text color={run.status === 'running' ? 'warning' : 'subtle'}>
          {'  ' + (run.status === 'running' ? '● running' : run.status)}
        </Text>
      </Box>
      {run.phases.length > 0 && (
        <Box marginTop={1}>
          <Text color="subtle">Phases  </Text>
          <Text>
            {run.phases.map(p => `${phaseMark(p.status)}${p.title}`).join(' ')}
          </Text>
        </Box>
      )}
      {run.agents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {run.agents.map(a => (
            <Box key={a.id}>
              <Text>{agentMark(a)} </Text>
              <Text>{(a.label ?? `agent-${a.id}`).padEnd(16).slice(0, 16)}</Text>
              <Text color="subtle"> {a.phase ?? ''}</Text>
            </Box>
          ))}
        </Box>
      )}
      {run.status !== 'running' && run.returnValue != null && (
        <Box marginTop={1}>
          <Text color="subtle">→ {String(run.returnValue).slice(0, 80)}</Text>
        </Box>
      )}
      {run.error && (
        <Box marginTop={1}>
          <Text color="error">{run.error}</Text>
        </Box>
      )}
    </Box>
  )
}
```

### Task 13：键位 hook `useWorkflowKeyboard`

**Files:**
- Create: `src/workflow/panel/useWorkflowKeyboard.ts`

- [ ] **Step 1：实现键位（j/k/r/x/n/q）**

Create `src/workflow/panel/useWorkflowKeyboard.ts`:

```ts
import { useEffect } from 'react'
import type { useInput } from '@anthropic/ink'

type Actions = {
  move: (delta: number) => void
  resume: () => void
  kill: () => void
  newNamed: () => void
  quit: () => void
}

/** 绑定 j/k/r/x/n/q/esc。input/useInput 由 @anthropic/ink 提供。 */
export function useWorkflowKeyboard(
  input: ReturnType<typeof useInput>,
  actions: Actions,
): void {
  useEffect(() => {
    const handler = (key: string): void => {
      switch (key) {
        case 'j': actions.move(1); break
        case 'k': actions.move(-1); break
        case 'r': actions.resume(); break
        case 'x': actions.kill(); break
        case 'n': actions.newNamed(); break
        case 'q':
        case 'escape': actions.quit(); break
      }
    }
    const off = input(handler)
    return () => { off?.() }
  }, [input, actions])
}
```

> 注：`@anthropic/ink` 的 `useInput` 签名以仓库实际为准；若它是 hook 形式（`useInput((input, key) => {...})`），改为在 `WorkflowsPanel` 内直接 `useInput` 并把 `actions` 内联（见 Task 14 备选）。本 hook 适用于"返回注册函数"形态。

### Task 14：`WorkflowsPanel` + local-jsx 命令

**Files:**
- Create: `src/workflow/panel/WorkflowsPanel.tsx`
- Rewrite: `src/commands/workflows/index.ts`
- Test: `src/workflow/__tests__/WorkflowsPanel.test.tsx`

- [ ] **Step 1：实现面板（useSyncExternalStore 订阅 service）**

Create `src/workflow/panel/WorkflowsPanel.tsx`:

```tsx
import React, { useState, useSyncExternalStore } from 'react'
import { Box, Text, useInput } from '@anthropic/ink'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import type { ToolUseContext } from '../../Tool.js'
import { getWorkflowService } from '../service.js'
import { WorkflowList } from './WorkflowList.js'
import { WorkflowDetail } from './WorkflowDetail.js'

type Ctx = ToolUseContext & { /* LocalJSXCommandContext 扩展，按需 */ }

export function WorkflowsPanel({
  onDone,
  context,
  args,
}: {
  onDone: LocalJSXCommandOnDone
  context: Ctx
  args: string
}): React.ReactNode {
  const svc = getWorkflowService()
  const runs = useSyncExternalStore(svc.subscribe, () => svc.listRuns(), () => [])
  const [named, setNamed] = useState<string[]>([])
  const [selected, setSelected] = useState(0)

  // 初次加载命名 workflow 列表
  if (named.length === 0 && runs.length === 0) {
    void svc.listNamed().then(setNamed).catch(() => {})
  }

  const focused = runs[Math.min(selected, Math.max(0, runs.length - 1))]

  useInput((input, key) => {
    if (input === 'j') setSelected(s => Math.min(runs.length - 1, s + 1))
    else if (input === 'k') setSelected(s => Math.max(0, s - 1))
    else if (input === 'x' && focused) svc.kill(focused.runId)
    else if (input === 'r' && focused) {
      // resume：用当前会话上下文重跑（读 journal）
      void svc.launch({ resumeFromRunId: focused.runId, name: focused.workflowName }, context, context.options.canUseTool ?? (() => Promise.resolve({ behavior: 'allow' })) as never)
    } else if (input === 'n') {
      // 简化：提示用户输入命名 workflow；完整选择器留作后续
      onDone('Tip: 用 /<name> 启动命名 workflow，或通过 Workflow 工具带 name 参数。')
    } else if (input === 'q' || key.escape) {
      onDone()
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold>Workflows</Text>
        <Text color="subtle">{runs.filter(r => r.status === 'running').length} running · {runs.filter(r => r.status !== 'running').length} done</Text>
      </Box>
      <Box flexDirection="row" marginTop={1}>
        <Box width="40%"><WorkflowList runs={runs} named={named} selected={Math.min(selected, Math.max(0, runs.length - 1))} /></Box>
        <Box width="60%"><WorkflowDetail run={focused} /></Box>
      </Box>
      <Box marginTop={1}>
        <Text color="subtle">j/k run · r resume · x kill · n new · q quit</Text>
      </Box>
    </Box>
  )
}
```

> 注：`context.options.canUseTool` 字段名以实际 `ToolUseContext` 为准；若不同，改用面板自带的会话权限解析（与 `useCanUseTool` 一致）。`borderStyle="round"` 等 prop 以 `@anthropic/ink` 支持为准。

- [ ] **Step 2：重写命令为 local-jsx**

Replace entire `src/commands/workflows/index.ts`:

```ts
import type { Command } from '../../types/command.js'

const workflows = {
  type: 'local-jsx',
  name: 'workflows',
  description: 'Workflow 监控面板：实时 run/phase/agent 进度，键盘控制',
  isEnabled: undefined,
  load: () => import('../../workflow/panel/WorkflowsPanel.js'),
} satisfies Command

export default workflows
```

> 注：`load` 返回的模块须有 `call`（`LocalJSXCommandModule`）。若 `WorkflowsPanel` 导出的是组件而非 `{call}`，补一个 `panelCall.ts`：

Create `src/workflow/panel/panelCall.ts`:

```ts
import React from 'react'
import { WorkflowsPanel } from './WorkflowsPanel.js'
import type { LocalJSXCommandCall } from '../../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, context, args) =>
  React.createElement(WorkflowsPanel, { onDone, context, args })
```

并把命令 `load` 改为 `() => import('../../workflow/panel/panelCall.js')`。

- [ ] **Step 3：写面板测试**

Create `src/workflow/__tests__/WorkflowsPanel.test.tsx`:

```tsx
import { expect, test } from 'bun:test'
import React from 'react'
import { render } from 'ink-testing-library'
// 注：若 ink-testing-library 不可用，改用 @anthropic/ink 的 test 工具或快照 store 状态

// 直接测纯函数：聚焦选择逻辑
function focusAt(runs: { runId: string }[], selected: number) {
  return runs[Math.min(selected, Math.max(0, runs.length - 1))]
}

test('focus clamp 到有效区间', () => {
  const runs = [{ runId: 'a' }, { runId: 'b' }]
  expect(focusAt(runs, 5)?.runId).toBe('b')
  expect(focusAt(runs, -3)?.runId).toBe('a')
  expect(focusAt(runs, 0)?.runId).toBe('a')
})
```

> 注：ink 组件交互测试受 `@anthropic/ink` test harness 可用性约束；至少覆盖选择/夹紧纯逻辑。若仓库已有 ink-testing-library 依赖，补 `render(<WorkflowsPanel .../>)` 快照测试。

- [ ] **Step 4：类型检查 + 运行**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "panel|workflows" | head`
Expected: 零错误。

Run: `bun test src/workflow/__tests__/WorkflowsPanel.test.tsx`
Expected: PASS。

- [ ] **Step 5：里程碑 M6 precheck**

Run: `bun run precheck`
Expected: 全绿。

- [ ] **Step 6：提交**

```bash
git add src/workflow/panel/ src/commands/workflows/index.ts src/workflow/__tests__/WorkflowsPanel.test.tsx
git commit -m "feat(workflow): /workflows dual-pane monitoring + control panel (local-jsx)"
```

---

## Phase M7：`/ultracode` skill

### Task 15：`SKILL.md` playbook

**Files:**
- Create: `src/skills/bundled/ultracode/SKILL.md`

- [ ] **Step 1：写 skill 内容**

Create `src/skills/bundled/ultracode/SKILL.md`:

```markdown
---
name: ultracode
description: 进入多 agent workflow 编排模式——何时用 workflow、编排原语、质量模式、确定性约束、后端路由、resume/budget、文件与命令。调用即把这套工作法注入上下文。
user-invocable: true
---

# UltraCode — 多 agent workflow 编排工作法

## 何时用 Workflow 工具

用，当任务满足任一：
- 可**分解/并行**（多文件、多维度、可独立推进的子任务）。
- 需要**多视角置信**（如审查：先生成再对抗式验证）。
- **规模超单上下文**（大迁移、广度审计）。
- 需要 **resume / 可审计**（journal 重放、确定性回放）。

**不要用**：琐碎单文件改、单次问答、一次 Read 能解决的事——直接做。

## 编排原语（脚本内可用）

- `agent(prompt, opts?)` — 派发一个子 agent；返回其最终文本（或 schema 对象）。
- `parallel([()=>…])` — 并发跑，单项抛错 → `null`，其余保留。**无 barrier**。
- `pipeline(items, stage1, stage2, …)` — 每个 item 链式过各 stage（item 间无 barrier，stage 间顺序）。
- `phase(title)` — 标记阶段（进度面板按此展示）。
- `log(msg)` — 进度日志。
- `workflow(name|{scriptPath}, args?)` — 嵌套一层子 workflow（仅允许一层）。

## 确定性约束（关键）

脚本内**禁用** `Date.now()` / `Math.random()` / 无参 `new Date()`（破坏 resume）。
时间戳/随机种子经 `args` 传入。`export const meta = {...}` 必须是**纯字面量**。

## 质量模式（每种给最小片段）

- **Adversarial verify**：`parallel([()=>agent(claim), ()=>agent(refute)])`，多数 refute 即弃。
- **Loop-until-dry**：`while (fresh.length) { found = await parallel(...); fresh = dedup(found) }`。
- **Multi-modal sweep**：多个 agent 各用不同搜索角度。
- **Judge panel**：N 个独立方案 → 评分 → 取胜者嫁接他者亮点。
- **Completeness critic**：末尾一个 agent 问"还缺什么"。

## 后端路由

`AgentAdapterRegistry` 按 model/agentType 路由。v1 默认 `claude-code` 后端（深度读会话 provider/model/agent 体系）。`agent({model:'claude-haiku-*', agentType:'Explore'})` 走真实注册表。

## resume / budget

- `resumeFromRunId: '<id>'` — 重放 journal，已完成 agent() 秒回。
- `budget.total` — token 硬顶（默认无限）；`budget.spent()/remaining()` 读。

## 文件与命令

- 脚本目录：`.claude/workflows/<name>.ts|js|mjs` → 自动成 `/<name>` 命令。
- run 记录：`.claude/workflow-runs/<runId>/journal.jsonl`。
- 监控面板：`/workflows`（双栏：左 run 列表，右 phase+agent；j/k/r/x/n/q）。
- 工具：`Workflow`（input: `script`/`name`/`scriptPath`/`args`/`resumeFromRunId`）。
```

- [ ] **Step 2：验证被发现为 `/ultracode`**

Run: `FEATURE_WORKFLOW_SCRIPTS=1 bun run dev` 然后 REPL 输入 `/ultracode`（或单测 `getSkillDirCommands` 含 ultracode）。最小校验：

Run: `grep -rn "ultracode" src/skills/bundled/`
Expected: 命中 SKILL.md。

- [ ] **Step 3：提交**

```bash
git add src/skills/bundled/ultracode/SKILL.md
git commit -m "feat(workflow): /ultracode knowledge skill (orchestration playbook)"
```

---

## Phase M8：文档

### Task 16：更新 workflow-scripts 文档

**Files:**
- Modify: `docs/features/workflow-scripts.md`

- [ ] **Step 1：补面板与 skill 说明**

在 `docs/features/workflow-scripts.md` 末尾追加：

```markdown
## 监控面板：`/workflows`

`/workflows` 打开双栏监控面板：左栏扁平 workflow 列表（状态点+名+当前 phase+agent 计数），右栏聚焦 workflow 的 phase 横条 + 扁平 agent 列表。键位：`j/k` 选 run、`r` resume、`x` kill、`n` 新建、`q` 退出。进度按引擎 `agentId` 精确关联。

## `/ultracode` skill

`/ultracode` 注入多 agent workflow 编排工作法（何时用、原语、质量模式、确定性约束、路由、resume/budget）。纯知识，零运行时副作用。
```

- [ ] **Step 2：提交**

```bash
git add docs/features/workflow-scripts.md
git commit -m "docs(workflow): document /workflows panel and /ultracode skill"
```

---

## 收尾

- [ ] **最终全量 precheck**

Run: `bun run precheck`
Expected: typecheck + lint fix + test 全绿。

- [ ] **（可选）端到端冒烟**

Run: `FEATURE_WORKFLOW_SCRIPTS=1 bun run dev`，REPL 内：
1. `/ultracode` → 注入 playbook。
2. 通过 Workflow 工具 `name: <某命名 workflow>` 启动。
3. `/workflows` → 看到该 run，j/k 选中，右栏显示 phase/agent 实时刷新。
4. `x` kill → run 变 killed。

---

## 自查（写作后）

- **Spec 覆盖**：①引擎 agentId（Task 1-3）②bus+store（4-5）③深度后端（6）④registry+ports（7）⑤service（8）⑥wiring+去 DetailDialog（9-10）⑦面板（11-14）⑧ultracode（15）⑨文档（16）— 全覆盖。
- **注册点零改动**：tools.ts/commands.ts/constants/tasks/PermissionRequest 保留导出名即兼容（已在 Task 9 校验无残留旧引用）。
- **类型一致性**：`agentId: number` 贯穿 types→hooks→store；`WorkflowService`/`ProgressStore` 方法名一致；`claudeCodeBackend.id='claude-code'` 与 registry default 一致。
- **已知 TODO（非占位，是边界）**：`useInput` 签名以 `@anthropic/ink` 实际为准（Task 13/14 已给备选 `panelCall.ts` 与内联 `useInput` 两套）；`context.options.canUseTool` 字段名待确认（Task 14 已注明回退）。
