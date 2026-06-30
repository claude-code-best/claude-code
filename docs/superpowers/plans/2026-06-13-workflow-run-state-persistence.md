# Workflow Run State Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 workflow 的终态 `RunProgress`（含 `returnValue`）落盘到 `.claude/workflow-runs/<runId>/state.json`，跨进程重启可恢复，供 `/workflows` 面板展示历史 run 与按 runId 取 return。

**Architecture:** host 侧新增 `persistence.ts` 模块（原子写 + 容错读 + 扫盘列表），引擎层零改动。`service.ts` 订阅 bus 的 `run_done` 事件写盘；`store.ts` 加 `hydrate()` 注入磁盘 run；面板 mount 时扫盘 hydrate；`getRun` 内存 miss 走 async fallback。三种终态（completed/failed/killed）共用 `run_done` 写盘入口，shutdown 时 kill 也走同路径，无需额外钩子。

**Tech Stack:** TypeScript strict、Bun runtime、`node:fs/promises`（mkdir/writeFile/readdir/rename）、`bun:test`、现有 `@claude-code-best/workflow-engine` 进度事件总线。

**Spec:** `docs/superpowers/specs/2026-06-13-workflow-run-state-persistence-design.md`

**Commit 规范提示:** 每个 task 末尾的 commit step 遵循项目 Conventional Commits（中文描述）。实际是否提交由执行决策——项目 CLAUDE.md 要求 commit 需用户显式确认，执行 agent 在 commit 前应问。

---

## File Structure

| 文件 | 改动 | 责任 |
|---|---|---|
| `src/workflow/persistence.ts` | 新增 | `getRunsDir()` / `writeRunState(runsDir, run)` / `readRunState(runsDir, runId)` / `listPersistedRuns(runsDir)`；原子覆盖写；容错读 |
| `src/workflow/__tests__/persistence.test.ts` | 新增 | 持久化往返、原子性、损坏容错、扫盘 |
| `src/workflow/progress/store.ts` | 改 | `ProgressStore` 类型 + 实现加 `hydrate(run)` |
| `src/workflow/__tests__/progressStore.test.ts` | 扩展 | hydrate 注入 / 已存在跳过 / 通知 listener |
| `src/workflow/ports.ts` | 改 | `${getProjectRoot()}/.claude/workflow-runs` → `getRunsDir()` |
| `src/workflow/service.ts` | 改 | `makeService(ports, store, bus)`；订阅 `run_done` 写盘；`loadPersistedRuns()`；`getRunAsync(id)` fallback；`persistedLoaded` flag |
| `src/workflow/__tests__/service.test.ts` | 扩展 | run_done 写盘断言、getRunAsync fallback、loadPersistedRuns、签名更新 |
| `src/workflow/panel/WorkflowsPanel.tsx` | 改 | mount 时 `void svc.loadPersistedRuns()` |
| `src/workflow/__tests__/WorkflowsPanel.test.tsx` | 扩展 | mount 调一次 loadPersistedRuns（spy） |

---

## Task 1: persistence.ts + 单测

**Files:**
- Create: `src/workflow/persistence.ts`
- Create: `src/workflow/__tests__/persistence.test.ts`

- [ ] **Step 1: 写失败测试（往返 + 容错）**

Create `src/workflow/__tests__/persistence.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { mkdtemp, rm, readFile, readdir, writeFile as fsWriteFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeRunState, readRunState, listPersistedRuns } from '../persistence.js'
import type { RunProgress } from '../progress/store.js'

function makeRun(over: Partial<RunProgress> = {}): RunProgress {
  return {
    runId: 'r1',
    workflowName: 'w',
    status: 'completed',
    phases: [],
    declaredPhases: [],
    currentPhase: null,
    agents: [],
    agentCount: 0,
    startedAt: 1000,
    updatedAt: 2000,
    ...over,
  } as RunProgress
}

test('writeRunState → readRunState 往返一致（returnValue 为对象）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const run = makeRun({ returnValue: { confirmedCount: 2, items: ['a', 'b'] } })
    await writeRunState(dir, run)
    const got = await readRunState(dir, 'r1')
    expect(got).not.toBeNull()
    expect(got!.runId).toBe('r1')
    expect(got!.returnValue).toEqual({ confirmedCount: 2, items: ['a', 'b'] })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readRunState 缺文件 → null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const got = await readRunState(dir, 'never-exists')
    expect(got).toBeNull()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readRunState 损坏 JSON → null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const target = join(dir, 'rX', 'state.json')
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(dir, 'rX'), { recursive: true })
    await fsWriteFile(target, '{not valid json', 'utf-8')
    const got = await readRunState(dir, 'rX')
    expect(got).toBeNull()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readRunState schemaVersion 不符 → null', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(dir, 'rX'), { recursive: true })
    await fsWriteFile(
      join(dir, 'rX', 'state.json'),
      JSON.stringify({ schemaVersion: 999, run: makeRun({ runId: 'rX' }) }),
      'utf-8',
    )
    const got = await readRunState(dir, 'rX')
    expect(got).toBeNull()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeRunState 原子写：成功后无 tmp 残留', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'rAtom' }))
    const sub = await readdir(join(dir, 'rAtom'))
    expect(sub).toContain('state.json')
    expect(sub).not.toContain('state.json.tmp')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('listPersistedRuns 扫多子目录、跳过无 state.json 的目录、按 updatedAt 降序', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const { mkdir } = await import('node:fs/promises')
    // 三个有效 run + 一个只有 journal 没 state.json 的半残目录
    await writeRunState(dir, makeRun({ runId: 'old', updatedAt: 1000 }))
    await writeRunState(dir, makeRun({ runId: 'mid', updatedAt: 2000 }))
    await writeRunState(dir, makeRun({ runId: 'new', updatedAt: 3000 }))
    await mkdir(join(dir, 'half-broken'), { recursive: true })

    const runs = await listPersistedRuns(dir)
    expect(runs.map(r => r.runId)).toEqual(['new', 'mid', 'old'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('listPersistedRuns 扫到损坏 state.json → 跳过该单个，继续扫其余', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    const { mkdir } = await import('node:fs/promises')
    await writeRunState(dir, makeRun({ runId: 'good' }))
    await mkdir(join(dir, 'bad'), { recursive: true })
    await fsWriteFile(join(dir, 'bad', 'state.json'), 'corrupt', 'utf-8')

    const runs = await listPersistedRuns(dir)
    expect(runs.map(r => r.runId)).toEqual(['good'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeRunState 不抛 returnValue 为 null/字符串/数组', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-'))
  try {
    await writeRunState(dir, makeRun({ runId: 'n', returnValue: null }))
    await writeRunState(dir, makeRun({ runId: 's', returnValue: 'text' }))
    await writeRunState(dir, makeRun({ runId: 'a', returnValue: [1, 2, 3] }))
    expect((await readRunState(dir, 'n'))!.returnValue).toBeNull()
    expect((await readRunState(dir, 's'))!.returnValue).toBe('text')
    expect((await readRunState(dir, 'a'))!.returnValue).toEqual([1, 2, 3])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/workflow/__tests__/persistence.test.ts`
Expected: FAIL — `Cannot find module '../persistence.js'`

- [ ] **Step 3: 实现 persistence.ts**

Create `src/workflow/persistence.ts`:

```ts
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getProjectRoot } from '../bootstrap/state.js'
import { logForDebugging } from '../utils/debug.js'
import type { RunProgress } from './progress/store.js'

/** state.json 当前 schema 版本；升级时引入迁移链。 */
const SCHEMA_VERSION = 1
const STATE_FILE = 'state.json'
const STATE_TMP = 'state.json.tmp'

/**
 * runsDir 统一来源：与 ports.ts journalStore 同根（${projectRoot}/.claude/workflow-runs）。
 * 提取为函数：消除 ports.ts 与持久化逻辑的路径拼接重复，进入 worktree/子目录时保持同根。
 */
export function getRunsDir(): string {
  return join(getProjectRoot(), '.claude', 'workflow-runs')
}

type StateFile = {
  schemaVersion: number
  run: RunProgress
}

/**
 * 原子覆盖写终态 RunProgress 到 <runsDir>/<runId>/state.json。
 * 原子性：writeFile(tmp) → rename(tmp, target)，rename 原子；最坏留 tmp，下次写覆盖。
 * 失败 best-effort：IO 异常只 log warn，不抛（workflow 已成功，持久化失败只意味着重启后取不到）。
 */
export async function writeRunState(
  runsDir: string,
  run: RunProgress,
): Promise<void> {
  const dir = join(runsDir, run.runId)
  const target = join(dir, STATE_FILE)
  const tmp = join(dir, STATE_TMP)
  const payload: StateFile = { schemaVersion: SCHEMA_VERSION, run }
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(tmp, JSON.stringify(payload), 'utf-8')
    await rename(tmp, target)
  } catch (e) {
    logForDebugging(
      `[workflow warn] writeRunState failed for ${run.runId}: ${(e as Error).message}`,
    )
  }
}

/**
 * 读 <runsDir>/<runId>/state.json，容错：
 * - 文件不存在 → null（调用方按 miss 处理）
 * - JSON 解析失败 / schema 结构不符 / schemaVersion 不符 → null（log warn，不崩）
 */
export async function readRunState(
  runsDir: string,
  runId: string,
): Promise<RunProgress | null> {
  const target = join(runsDir, runId, STATE_FILE)
  let raw: string
  try {
    raw = await readFile(target, 'utf-8')
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StateFile>
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null
    const run = parsed.run
    if (!run || typeof run !== 'object') return null
    if (typeof run.runId !== 'string') return null
    if (typeof run.status !== 'string') return null
    return run as RunProgress
  } catch (e) {
    logForDebugging(
      `[workflow warn] readRunState parse failed for ${runId}: ${(e as Error).message}`,
    )
    return null
  }
}

/**
 * 扫描 runsDir 下所有子目录，读取每个 state.json，返回非空 RunProgress 列表。
 * - runsDir 不存在 → 空数组
 * - 某子目录无 state.json（半残 run）→ 跳过
 * - 某子目录 state.json 损坏 → 跳过该单个，继续扫其余
 * - 按 updatedAt 降序（与 store.list() 排序一致）
 */
export async function listPersistedRuns(
  runsDir: string,
): Promise<RunProgress[]> {
  let entries: string[]
  try {
    entries = await readdir(runsDir)
  } catch {
    return []
  }
  const runs: RunProgress[] = []
  for (const name of entries) {
    const run = await readRunState(runsDir, name)
    if (run) runs.push(run)
  }
  return runs.sort((a, b) => b.updatedAt - a.updatedAt)
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/workflow/__tests__/persistence.test.ts`
Expected: PASS — 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/workflow/persistence.ts src/workflow/__tests__/persistence.test.ts
git commit -m "feat(workflow): 添加 run state 持久化模块（原子写 + 容错读）"
```

---

## Task 2: store.hydrate + 单测

**Files:**
- Modify: `src/workflow/progress/store.ts`
- Modify: `src/workflow/__tests__/progressStore.test.ts`

- [ ] **Step 1: 写失败测试**

Append to `src/workflow/__tests__/progressStore.test.ts`:

```ts
test('hydrate 注入新 run → get 命中 + list 含该项 + 通知 listener', () => {
  const { store } = newStore()
  let notified = 0
  store.subscribe(() => notified++)

  const historical: RunProgress = {
    runId: 'hist-1',
    workflowName: 'old-job',
    status: 'completed',
    phases: [],
    declaredPhases: [],
    currentPhase: null,
    agents: [],
    agentCount: 5,
    returnValue: { summary: 'past' },
    startedAt: 1,
    updatedAt: 2,
  }
  store.hydrate(historical)

  expect(store.get('hist-1')).toBe(historical)
  expect(store.list().map(r => r.runId)).toContain('hist-1')
  expect(notified).toBeGreaterThan(0)
})

test('hydrate 已存在的 runId → 跳过（内存优先，不被磁盘覆盖）', () => {
  const { bus, store } = newStore()
  bus.emit({ type: 'run_started', runId: 'r1', workflowName: 'live', meta: null })

  const stale: RunProgress = {
    runId: 'r1',
    workflowName: 'STALE-SHOULD-NOT-WIN',
    status: 'completed',
    phases: [],
    declaredPhases: [],
    currentPhase: null,
    agents: [],
    agentCount: 0,
    startedAt: 1,
    updatedAt: 2,
  }
  store.hydrate(stale)

  const got = store.get('r1')!
  expect(got.workflowName).toBe('live')
  expect(got.status).toBe('running')
})
```

同时在文件顶部 import 添加 `RunProgress` 类型（如尚未导入）：

```ts
import type { RunProgress } from '../progress/store.js'
```

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/workflow/__tests__/progressStore.test.ts`
Expected: FAIL — `store.hydrate is not a function`

- [ ] **Step 3: 实现 hydrate**

Modify `src/workflow/progress/store.ts`:

在 `ProgressStore` type 加 `hydrate` 成员（在 `get` 之后）：

```ts
export type ProgressStore = {
  apply(event: ProgressEvent): void
  list(): RunProgress[]
  get(runId: string): RunProgress | undefined
  /** 直接注入磁盘读出的 run（绕过 bus）；已存在的 runId 跳过——内存优先。 */
  hydrate(run: RunProgress): void
  /** 供 useSyncExternalStore：返回稳定引用，无变更时同一数组。 */
  subscribe(listener: () => void): () => void
  getSnapshot(): RunProgress[]
}
```

在 `createProgressStoreFromBus` 返回对象里加 `hydrate`（在 `get` 之后）：

```ts
    get: id => byId.get(id),
    hydrate(run) {
      if (byId.has(run.runId)) return
      byId.set(run.runId, run)
      notify()
    },
    subscribe: fn => {
```

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/workflow/__tests__/progressStore.test.ts`
Expected: PASS — 所有现有 + 2 个新测试

- [ ] **Step 5: Commit**

```bash
git add src/workflow/progress/store.ts src/workflow/__tests__/progressStore.test.ts
git commit -m "feat(workflow): store 添加 hydrate 用于注入磁盘历史 run"
```

---

## Task 3: ports.ts 引用 getRunsDir（消除重复拼接）

**Files:**
- Modify: `src/workflow/ports.ts:72`

无测试改动——这是路径来源重构，行为不变（`ports.test.ts` 现有断言覆盖 `journalStore` 创建，路径仍是同一处）。

- [ ] **Step 1: 替换 runsDir 拼接**

Modify `src/workflow/ports.ts`:

import 添加（在现有 `@claude-code-best/workflow-engine` import 之前或之后）：

```ts
import { getRunsDir } from './persistence.js'
```

把第 72 行：

```ts
  const runsDir = `${getProjectRoot()}/.claude/workflow-runs`
```

改为：

```ts
  const runsDir = getRunsDir()
```

- [ ] **Step 2: 运行 ports 测试验证未破坏**

Run: `bun test src/workflow/__tests__/ports.test.ts`
Expected: PASS — 现有断言全通过（`journalStore` 仍用同一 runsDir）

- [ ] **Step 3: 类型检查（确保 import 正确）**

Run: `bunx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/workflow/ports.ts
git commit -m "refactor(workflow): ports 引用 getRunsDir 消除路径拼接重复"
```

---

## Task 4: service 订阅 run_done 写盘

**Files:**
- Modify: `src/workflow/service.ts`
- Modify: `src/workflow/__tests__/service.test.ts`

- [ ] **Step 1: 写失败测试（run_done → 写盘）**

在 `src/workflow/__tests__/service.test.ts` 顶部 import 添加：

```ts
import { readRunState } from '../persistence.js'
```

文件末尾追加测试（复用现有 `fakePorts` helper；它已返回 bus、store、ports）：

```ts
test('run_done completed → 写盘 state.json，returnValue 一致', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  const origGetRunsDir = await import('../persistence.js').then(m => m.getRunsDir)
  // 通过 monkey-patch getRunsDir 让真实 writeRunState 写到 tmpdir
  const persistence = await import('../persistence.js')
  ;(persistence as any).getRunsDir = () => dir
  try {
    const { ports, store } = fakePorts()
    const bus = createProgressBus()
    const storeFromBus = createProgressStoreFromBus(bus)
    // 重新构造：让 service 用我们的 bus（fakePorts 内部也有 bus 但未暴露）
    const svc = makeService(ports, storeFromBus, bus)

    bus.emit({ type: 'run_started', runId: 'rW', workflowName: 'w', meta: null })
    bus.emit({
      type: 'run_done',
      runId: 'rW',
      status: 'completed',
      returnValue: { ok: true, n: 3 },
    })

    // 写盘是 async（订阅里 await writeRunState）；让 microtask 跑完
    await new Promise(r => setTimeout(r, 50))

    const got = await readRunState(dir, 'rW')
    expect(got).not.toBeNull()
    expect(got!.status).toBe('completed')
    expect(got!.returnValue).toEqual({ ok: true, n: 3 })
  } finally {
    ;(persistence as any).getRunsDir = origGetRunsDir
    await rm(dir, { recursive: true, force: true })
  }
})

test('run_done failed → 写盘 status=failed + error 字段', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  const persistence = await import('../persistence.js')
  const orig = persistence.getRunsDir
  ;(persistence as any).getRunsDir = () => dir
  try {
    const { ports } = fakePorts()
    const bus = createProgressBus()
    const store = createProgressStoreFromBus(bus)
    makeService(ports, store, bus)

    bus.emit({ type: 'run_started', runId: 'rF', workflowName: 'w', meta: null })
    bus.emit({
      type: 'run_done',
      runId: 'rF',
      status: 'failed',
      error: 'boom',
    })
    await new Promise(r => setTimeout(r, 50))

    const got = await readRunState(dir, 'rF')
    expect(got).not.toBeNull()
    expect(got!.status).toBe('failed')
    expect(got!.error).toBe('boom')
  } finally {
    ;(persistence as any).getRunsDir = orig
    await rm(dir, { recursive: true, force: true })
  }
})

test('run_done killed → 写盘 status=killed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  const persistence = await import('../persistence.js')
  const orig = persistence.getRunsDir
  ;(persistence as any).getRunsDir = () => dir
  try {
    const { ports } = fakePorts()
    const bus = createProgressBus()
    const store = createProgressStoreFromBus(bus)
    makeService(ports, store, bus)

    bus.emit({ type: 'run_started', runId: 'rK', workflowName: 'w', meta: null })
    bus.emit({ type: 'run_done', runId: 'rK', status: 'killed' })
    await new Promise(r => setTimeout(r, 50))

    const got = await readRunState(dir, 'rK')
    expect(got?.status).toBe('killed')
  } finally {
    ;(persistence as any).getRunsDir = orig
    await rm(dir, { recursive: true, force: true })
  }
})

test('makeService 现有调用兼容（签名加 bus 参数后，旧测试 fakePorts 路径仍可构造）', async () => {
  // 烟雾测试：确保 makeService(ports, store, bus) 能正常返回 service 对象
  const { ports } = fakePorts()
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const svc = makeService(ports, store, bus)
  expect(typeof svc.getRun).toBe('function')
  expect(typeof svc.listRuns).toBe('function')
})
```

**同时**：现有 `service.test.ts` 里所有 `makeService(ports, store)` 调用都要改成 `makeService(ports, store, bus)`——bus 从 fakePorts 拿不到（未暴露），需要在 fakePorts 返回值里加 `bus`，或每个测试自己 createProgressBus。最小改动：让 fakePorts 返回 bus。

Modify `fakePorts` 返回类型与 return 对象（在 `ports`、`store`、`killed`、`calls` 之外加 `bus`）：

```ts
function fakePorts(opts = {}) {
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  // ...（其余不变）
  return { ports, store, bus, killed, calls }
}
```

然后把所有现有测试里的 `const { ports, store } = fakePorts()` 改成 `const { ports, store, bus } = fakePorts()`，并把 `makeService(ports, store)` 改成 `makeService(ports, store, bus)`。

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/workflow/__tests__/service.test.ts`
Expected: FAIL — `makeService` 参数数量不符 / `bus.subscribe` 找不到 / readRunState 拿不到值

- [ ] **Step 3: 实现 service 订阅**

Modify `src/workflow/service.ts`:

import 添加（顶部）：

```ts
import { writeRunState, getRunsDir } from './persistence.js'
import type { ProgressBus } from './progress/bus.js'
```

`makeService` 签名改为接收 bus：

```ts
export function makeService(
  ports: WorkflowPorts,
  store: ProgressStore,
  bus: ProgressBus,
): WorkflowService {
```

在 `makeService` 函数体开头（`const buildHost = ...` 之前）加订阅：

```ts
  // 订阅 run_done：写终态快照到磁盘（覆盖 completed/failed/killed 三态）。
  // store 先于本订阅注册到 bus，故 listener 执行时 store.get(runId) 已是 apply 后的终态。
  // 注意：getRunsDir() 在 listener 内调用（运行时解析），便于测试 monkey-patch。
  bus.subscribe(event => {
    if (event.type !== 'run_done') return
    const run = store.get(event.runId)
    if (!run) return
    void writeRunState(getRunsDir(), run)
  })
```

更新 `getWorkflowService()` 单例创建处（第 73 行附近）：

```ts
export function getWorkflowService(): WorkflowService {
  if (cached) return cached
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  const service = makeService(ports, store, bus)
  installWorkflowNotifications(service)
  cached = service
  return cached
}
```

（`createProgressBus` import 在 service.ts 顶部应已存在；若未 import 则补 `import { createProgressBus } from './progress/bus.js'`。）

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/workflow/__tests__/service.test.ts`
Expected: PASS — 现有 + 4 个新测试

- [ ] **Step 5: Commit**

```bash
git add src/workflow/service.ts src/workflow/__tests__/service.test.ts
git commit -m "feat(workflow): service 订阅 run_done 写终态快照到磁盘"
```

---

## Task 5: service 的 loadPersistedRuns + getRunAsync fallback

**Files:**
- Modify: `src/workflow/service.ts`
- Modify: `src/workflow/__tests__/service.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/workflow/__tests__/service.test.ts` import 添加（若尚未）：

```ts
import { writeRunState, readRunState, listPersistedRuns } from '../persistence.js'
```

文件末尾追加：

```ts
test('loadPersistedRuns 扫盘 hydrate 历史 run；已有内存 run 不被覆盖', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  const persistence = await import('../persistence.js')
  const orig = persistence.getRunsDir
  ;(persistence as any).getRunsDir = () => dir
  try {
    // 磁盘先有两个历史 run
    const historicalA: RunProgress = {
      runId: 'hA', workflowName: 'old-A', status: 'completed',
      phases: [], declaredPhases: [], currentPhase: null,
      agents: [], agentCount: 1, returnValue: 'a',
      startedAt: 10, updatedAt: 20,
    } as RunProgress
    const historicalB: RunProgress = {
      runId: 'hB', workflowName: 'old-B', status: 'failed',
      phases: [], declaredPhases: [], currentPhase: null,
      agents: [], agentCount: 2, error: 'x',
      startedAt: 30, updatedAt: 40,
    } as RunProgress
    await writeRunState(dir, historicalA)
    await writeRunState(dir, historicalB)

    const { ports, bus } = fakePorts()
    const store = createProgressStoreFromBus(bus)
    // 内存先有一个本次会话 run
    bus.emit({ type: 'run_started', runId: 'live', workflowName: 'live-w', meta: null })
    const svc = makeService(ports, store, bus)

    await svc.loadPersistedRuns()

    const ids = svc.listRuns().map(r => r.runId)
    expect(ids).toContain('hA')
    expect(ids).toContain('hB')
    expect(ids).toContain('live')
    // 内存优先：live 仍是 running（不被磁盘覆盖；磁盘里没有 live 也不会注入 STALE）
    expect(svc.getRun('live')!.status).toBe('running')
    expect(svc.getRun('hA')!.returnValue).toBe('a')
  } finally {
    ;(persistence as any).getRunsDir = orig
    await rm(dir, { recursive: true, force: true })
  }
})

test('loadPersistedRuns 重复调用仅扫盘一次（persistedLoaded flag）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  const persistence = await import('../persistence.js')
  const orig = persistence.getRunsDir
  let listCalls = 0
  ;(persistence as any).getRunsDir = () => dir
  const origList = persistence.listPersistedRuns
  ;(persistence as any).listPersistedRuns = async (d: string) => {
    listCalls++
    return origList(d)
  }
  try {
    const { ports, bus } = fakePorts()
    const store = createProgressStoreFromBus(bus)
    const svc = makeService(ports, store, bus)

    await svc.loadPersistedRuns()
    await svc.loadPersistedRuns()
    await svc.loadPersistedRuns()

    expect(listCalls).toBe(1)
  } finally {
    ;(persistence as any).getRunsDir = orig
    ;(persistence as any).listPersistedRuns = origList
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunAsync 内存命中 → 不读盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  const persistence = await import('../persistence.js')
  const orig = persistence.getRunsDir
  let readCalls = 0
  ;(persistence as any).getRunsDir = () => dir
  const origRead = persistence.readRunState
  ;(persistence as any).readRunState = async (d: string, id: string) => {
    readCalls++
    return origRead(d, id)
  }
  try {
    const { ports, bus } = fakePorts()
    const store = createProgressStoreFromBus(bus)
    const svc = makeService(ports, store, bus)
    bus.emit({ type: 'run_started', runId: 'live', workflowName: 'w', meta: null })

    const got = await svc.getRunAsync('live')
    expect(got?.runId).toBe('live')
    expect(readCalls).toBe(0)
  } finally {
    ;(persistence as any).getRunsDir = orig
    ;(persistence as any).readRunState = origRead
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunAsync 内存 miss + 磁盘命中 → 返回磁盘值，且不注入内存（再次 get 仍读盘）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  const persistence = await import('../persistence.js')
  const orig = persistence.getRunsDir
  let readCalls = 0
  ;(persistence as any).getRunsDir = () => dir
  const origRead = persistence.readRunState
  ;(persistence as any).readRunState = async (d: string, id: string) => {
    readCalls++
    return origRead(d, id)
  }
  try {
    const historical: RunProgress = {
      runId: 'hist-only', workflowName: 'old', status: 'completed',
      phases: [], declaredPhases: [], currentPhase: null,
      agents: [], agentCount: 0, returnValue: { x: 1 },
      startedAt: 1, updatedAt: 2,
    } as RunProgress
    await writeRunState(dir, historical)

    const { ports, bus } = fakePorts()
    const store = createProgressStoreFromBus(bus)
    const svc = makeService(ports, store, bus)

    const got = await svc.getRunAsync('hist-only')
    expect(got?.returnValue).toEqual({ x: 1 })
    expect(readCalls).toBe(1)
    // 不注入内存：再次 get 仍读盘
    const got2 = await svc.getRunAsync('hist-only')
    expect(got2?.returnValue).toEqual({ x: 1 })
    expect(readCalls).toBe(2)
    // 内存 list 不含（未 hydrate）
    expect(svc.listRuns().map(r => r.runId)).not.toContain('hist-only')
  } finally {
    ;(persistence as any).getRunsDir = orig
    ;(persistence as any).readRunState = origRead
    await rm(dir, { recursive: true, force: true })
  }
})

test('getRunAsync 内存 miss + 磁盘 miss → undefined', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-svc-'))
  const persistence = await import('../persistence.js')
  const orig = persistence.getRunsDir
  ;(persistence as any).getRunsDir = () => dir
  try {
    const { ports, bus } = fakePorts()
    const store = createProgressStoreFromBus(bus)
    const svc = makeService(ports, store, bus)

    const got = await svc.getRunAsync('no-such-run')
    expect(got).toBeUndefined()
  } finally {
    ;(persistence as any).getRunsDir = orig
    await rm(dir, { recursive: true, force: true })
  }
})
```

顶部 import 补 `RunProgress` 类型（若尚未）：

```ts
import type { RunProgress } from '../progress/store.js'
```

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/workflow/__tests__/service.test.ts`
Expected: FAIL — `svc.loadPersistedRuns is not a function` / `svc.getRunAsync is not a function`

- [ ] **Step 3: 实现 loadPersistedRuns + getRunAsync**

Modify `src/workflow/service.ts`:

import 添加：

```ts
import { writeRunState, readRunState, listPersistedRuns, getRunsDir } from './persistence.js'
```
（替换 Task 4 里只 import `writeRunState, getRunsDir` 的那行——合并为完整 import）

`WorkflowService` type 加两个方法（在 `getRun` 之后）：

```ts
export type WorkflowService = {
  ports: WorkflowPorts
  launch(
    input: Pick<
      WorkflowInput,
      | 'script' | 'name' | 'scriptPath' | 'args' | 'description' | 'resumeFromRunId' | 'title'
    >,
    toolUseContext: ToolUseContext,
    canUseTool: CanUseToolFn,
  ): Promise<{ runId: string }>
  kill(runId: string): void
  shutdown(): void
  listRuns(): RunProgress[]
  getRun(runId: string): RunProgress | undefined
  /**
   * 异步按 runId 查：内存命中则返回；miss 读盘 state.json（不注入内存）。
   * 供"按 runId 取历史 return"场景；面板展示请走 loadPersistedRuns + listRuns。
   */
  getRunAsync(runId: string): Promise<RunProgress | undefined>
  /**
   * 扫盘把所有历史 run 的 state.json hydrate 进 store（已存在 runId 跳过）。
   * 进程单例内仅实际扫盘一次（persistedLoaded flag）；重复调用立即返回。
   */
  loadPersistedRuns(): Promise<void>
  subscribe(listener: () => void): () => void
  listNamed(workflowDir?: string): Promise<string[]>
}
```

在 `makeService` 函数体里（订阅 run_done 之后、`return {` 之前）加：

```ts
  let persistedLoaded = false
```

在返回对象里加（在 `getRun` 之后、`subscribe` 之前）：

```ts
    getRun: id => store.get(id),
    getRunAsync: async id => {
      const mem = store.get(id)
      if (mem) return mem
      return (await readRunState(getRunsDir(), id)) ?? undefined
    },
    async loadPersistedRuns() {
      if (persistedLoaded) return
      persistedLoaded = true
      try {
        const runs = await listPersistedRuns(getRunsDir())
        for (const run of runs) store.hydrate(run)
      } catch (e) {
        // 扫盘失败不阻断面板：log + 复位 flag 允许下次重试
        logForDebugging(
          `[workflow warn] loadPersistedRuns failed: ${(e as Error).message}`,
        )
        persistedLoaded = false
      }
    },
    subscribe: fn => store.subscribe(fn),
```

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/workflow/__tests__/service.test.ts`
Expected: PASS — Task 4 + Task 5 共 9 个新测试 + 现有全过

- [ ] **Step 5: Commit**

```bash
git add src/workflow/service.ts src/workflow/__tests__/service.test.ts
git commit -m "feat(workflow): service 添加 loadPersistedRuns 与 getRunAsync fallback"
```

---

## Task 6: WorkflowsPanel mount 触发 loadPersistedRuns

**Files:**
- Modify: `src/workflow/panel/WorkflowsPanel.tsx`
- Modify: `src/workflow/__tests__/WorkflowsPanel.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `src/workflow/__tests__/WorkflowsPanel.test.tsx` import 添加（若尚未，需要渲染 WorkflowsPanel 来 spy）：

```ts
import React from 'react'
import { render } from '@anthropic/ink'
import { WorkflowsPanel } from '../panel/WorkflowsPanel.js'
import { getWorkflowService } from '../service.js'
```

文件末尾追加（用 spy 替换 service 单例的 loadPersistedRuns，断言被调一次）：

```ts
test('WorkflowsPanel mount 触发一次 loadPersistedRuns', async () => {
  __resetWorkflowServiceForTests()
  // 强制单例创建，挂 spy
  const svc = getWorkflowService()
  let calls = 0
  const orig = svc.loadPersistedRuns.bind(svc)
  svc.loadPersistedRuns = async () => { calls++ }

  try {
    const onDone = () => {}
    const ctx = { canUseTool: undefined } as any
    const { unmount } = render(
      React.createElement(WorkflowsPanel, { onDone, context: ctx }),
    )
    // mount 后 useEffect 异步触发；等一个 tick
    await new Promise(r => setTimeout(r, 10))

    expect(calls).toBe(1)

    // 重渲染不应再次调用
    unmount()
  } finally {
    svc.loadPersistedRuns = orig
    __resetWorkflowServiceForTests()
  }
})
```

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/workflow/__tests__/WorkflowsPanel.test.tsx`
Expected: FAIL — `calls` 仍为 0（mount 没触发 loadPersistedRuns）

- [ ] **Step 3: 实现 mount 触发**

Modify `src/workflow/panel/WorkflowsPanel.tsx`:

在 `useWorkflowKeyboard(handlers)` 之后、`const running = ...` 之前，加 useEffect：

```ts
  // mount 时触发一次扫盘 hydrate 历史 run（service 内部 persistedLoaded flag 守护幂等）。
  useEffect(() => {
    void svc.loadPersistedRuns()
  }, [svc])
```

`useEffect` 应已在顶部 import（`import React, { useEffect, useState, useSyncExternalStore } from 'react'`）—— 现状已含。

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/workflow/__tests__/WorkflowsPanel.test.tsx`
Expected: PASS — 现有 5 个 + 新增 1 个

- [ ] **Step 5: Commit**

```bash
git add src/workflow/panel/WorkflowsPanel.tsx src/workflow/__tests__/WorkflowsPanel.test.tsx
git commit -m "feat(workflow): 面板 mount 时加载历史 run 到内存"
```

---

## Task 7: 全量回归（precheck）

**Files:** 无改动，只验证。

- [ ] **Step 1: 类型检查**

Run: `bunx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: 全套 workflow 测试**

Run: `bun test src/workflow/`
Expected: 所有测试通过（含现有 65+ 与新增约 20 个）

- [ ] **Step 3: Lint 改动文件**

Run: `bunx biome check src/workflow/persistence.ts src/workflow/progress/store.ts src/workflow/ports.ts src/workflow/service.ts src/workflow/panel/WorkflowsPanel.tsx src/workflow/__tests__/persistence.test.ts src/workflow/__tests__/progressStore.test.ts src/workflow/__tests__/service.test.ts src/workflow/__tests__/WorkflowsPanel.test.tsx`
Expected: No fixes applied / 无 error

- [ ] **Step 4: 完整 precheck**

Run: `bun run precheck`
Expected: 0 errors（typecheck + lint fix + test 全通过）

- [ ] **Step 5: （可选）手工烟雾验证**

启动 `bun run dev`，跑一个会完成的 workflow（如某个简单命名 workflow），确认：
1. `.claude/workflow-runs/<runId>/state.json` 生成且含 returnValue
2. 重启 CLI 后打开 `/workflows`，能看到该历史 run
3. （若面板有详情视图）选中历史 run 能看到 agents/phases

如果手工烟雾失败，回到对应 Task 修正。

- [ ] **Step 6: 最终 commit（如有未提交的 lint 修复）**

```bash
git status
# 若有改动：
git add -p
git commit -m "chore(workflow): 持久化特性 precheck 收尾"
```

---

## Self-Review

**Spec coverage（逐节核对）:**

- ✅ 问题陈述 → 整体计划回应
- ✅ 目标 (a) 重启取 return → Task 4 写盘 + Task 5 `getRunAsync` fallback
- ✅ 目标 (b) 面板跨重启 → Task 5 `loadPersistedRuns` + Task 6 面板触发
- ✅ 非目标 (c) 跨进程 resume → 计划不涉及 abort/binding 恢复
- ✅ 架构（5 个文件改动） → Task 1-6 全覆盖
- ✅ 数据流 写入（run_done 订阅） → Task 4
- ✅ 数据流 读取① 面板 hydrate → Task 5 + Task 6
- ✅ 数据流 读取② getRun fallback → Task 5 `getRunAsync`（spec 称 getRun，实现为 async 版本以保留同步语义；已在 Task 5 注释说明）
- ✅ state.json 格式（schemaVersion=1 + RunProgress） → Task 1
- ✅ 错误处理（writeRunState best-effort / readRunState 容错 / 扫盘跳过损坏） → Task 1 实现 + 测试
- ✅ 关键不变量（内存优先 / 磁盘纯终态 / getRunAsync 不注入 / 持久化不阻断 / 引擎零改动） → Task 1/4/5 实现 + 测试断言
- ✅ 测试策略 → persistence.test / progressStore.test / service.test / WorkflowsPanel.test 全覆盖

**Placeholder scan:** 无 TBD/TODO；每个 step 含完整代码或精确命令。

**Type consistency:**
- `writeRunState(runsDir, run)` / `readRunState(runsDir, runId)` / `listPersistedRuns(runsDir)` —— 三处签名一致（runsDir 首参）
- `store.hydrate(run: RunProgress)` —— Task 2 定义、Task 5 使用，签名一致
- `makeService(ports, store, bus)` —— Task 4 改签名、Task 5 沿用
- `svc.loadPersistedRuns()` / `svc.getRunAsync(id)` —— Task 5 定义、Task 6 使用，签名一致
- `getRunsDir()` —— Task 1 定义、Task 3 ports 引用、Task 4 service 引用，统一来源

**歧义/已知偏离:**
- spec 写"`getRun` fallback"，实现为新增 `getRunAsync`（同步 getRun 保留内存语义）。理由：避免破坏现有同步调用方（WorkflowsPanel 等）；fallback 是低频路径，async 更诚实。Task 5 测试显式断言"不注入内存"。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-13-workflow-run-state-persistence.md`. Two execution options:

**1. Subagent-Driven (recommended)** — 每个 task 派 fresh subagent，task 间 review，迭代快、上下文干净
**2. Inline Execution** — 本会话内 executing-plans 批量执行 + checkpoint 审阅

Which approach?
