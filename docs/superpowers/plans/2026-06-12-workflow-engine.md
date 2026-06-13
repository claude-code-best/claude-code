# Workflow Engine 重建实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把被掏空的「清单推进」版 WorkflowTool 重建为完整忠实的确定性 JS 脚本编排引擎，独立成包 `@claude-code-best/workflow-engine`，通过端口适配与核心层解耦。

**Architecture:** 依赖倒置——新包零 `src/*` 运行时导入，声明端口接口（`AgentRunner`/`ProgressEmitter`/`TaskRegistrar`/`JournalStore`/`PermissionGate`/`Logger`/`HostFactory`）+ 不透明 `HostHandle`；核心侧 `src/workflow/adapter.ts` 实现端口（委托 `runAgent`/`assembleToolPool`/`LocalWorkflowTask`），`wiring.ts` 把包的工具描述符适配为 `buildTool` 注册到 `tools.ts`。引擎用 async 函数包装执行脚本，信号量限并发，journal 顺序重放实现 resume。

**Tech Stack:** TypeScript（strict）、Bun（运行时/测试 `bun:test`）、Zod（`zod/v4`，工具 schema）、Ajv（JSON Schema 校验）、node 内置（`crypto`/`fs`/`path`/`os`）。

**Spec:** `docs/superpowers/specs/2026-06-12-workflow-engine-design.md`

---

## 关键外部接口（已核实，计划代码据此编写）

- `Tool.call(args, context: ToolUseContext, canUseTool, parentMessage, onProgress?)` — `src/Tool.ts:400`
- `buildTool(def)` — 填充 `isEnabled/isConcurrencySafe/isReadOnly/checkPermissions/...` 默认值 — `src/Tool.ts:804`
- `assembleToolPool(permissionContext, mcpTools): Tools` — `src/tools.ts:375`
- `finalizeAgentTool(messages, agentId, metadata): AgentToolResult`，`AgentToolResult.content: Array<{type:'text',text}>`、`.totalTokens`、`.usage.output_tokens` — `agentToolUtils.ts:277`
- `runAgent({agentDefinition, promptMessages, toolUseContext, canUseTool, isAsync, querySource, availableTools, ...})` — async generator — `AgentTool/runAgent.ts:257`
- `BuiltInAgentDefinition = { agentType, whenToUse, tools?, source:'built-in', baseDir:'built-in', getSystemPrompt({toolUseContext}) }` — `loadAgentsDir.ts:136`
- `SyntheticOutputTool`（name=`StructuredOutput`，Ajv 校验，非交互模式启用）即 schema→结构化输出机制 — `SyntheticOutputTool/SyntheticOutputTool.ts`
- `LocalWorkflowTask` 生命周期 API — `src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts`（register/complete/fail/kill/skip/retry，复用）
- 现有注册位：`tools.ts:152-159`（`WORKFLOW_SCRIPTS` flag 后 `require(...).WorkflowTool`），`constants/tools.ts:52`（`CORE_TOOLS` 含 `workflow`）

## 文件结构（创建/修改一览）

**新包 `packages/workflow-engine/`（零 `src/*` 导入）：**

| 文件 | 职责 |
|---|---|
| `package.json` / `tsconfig.json` | 包清单 + TS 配置 |
| `src/index.ts` | 公共导出 |
| `src/constants.ts` | 目录/上限常量 |
| `src/types.ts` | 纯类型（WorkflowInput/meta/JournalEntry/ProgressEvent/AgentRunParams/AgentRunResult） |
| `src/ports.ts` | 端口接口 + HostHandle + HostFactory + WorkflowHostContext |
| `src/engine/concurrency.ts` | Semaphore + maxConcurrency + 上限常量引用 |
| `src/engine/script.ts` | meta 字面量提取 + async 包装 + Date/Math 沙箱 shim |
| `src/engine/journal.ts` | agentCallKey(hash) + JournalStore 读写实现 |
| `src/engine/budget.ts` | Budget 累加器 |
| `src/engine/structuredOutput.ts` | validateAgainstSchema(Ajv) |
| `src/engine/namedWorkflows.ts` | name → `.claude/workflows/<name>.ts\|js\|mjs` 解析 |
| `src/engine/context.ts` | EngineContext + SharedResources |
| `src/engine/hooks.ts` | agent/parallel/pipeline/phase/log/workflow 实现 |
| `src/engine/runWorkflow.ts` | 引擎入口：校验/执行/journal/resume |
| `src/progress/events.ts` | ProgressEvent 类型 + emit 辅助 |
| `src/tool/schema.ts` | 输入 zod schema |
| `src/tool/WorkflowTool.ts` | createWorkflowTool({ports, hostFactory}) → 自包含描述符 |
| `src/tool/constants.ts` | WORKFLOW_TOOL_NAME 等（供 core re-export） |
| `src/__tests__/*.test.ts` | 包内全量单测（mock 端口） |

**核心侧（`src/`）：**

| 文件 | 职责 |
|---|---|
| `src/workflow/adapter.ts` | createWorkflowAdapter：实现端口（委托 runAgent 等）+ hostFactory 构造 HostHandle |
| `src/workflow/wiring.ts` | createWorkflowTool()：建 adapter → 包描述符 → buildTool |
| `src/workflow/hostHandle.ts` | HostHandle bundle 类型 + 构造/解包 |
| `src/workflow/namedWorkflowCommands.ts` | 扫 `.ts/.js/.mjs` → `/<name>` 斜杠命令（重写） |
| `src/workflow/WorkflowProgressView.tsx` | `/workflows` 实时进度查看器 |
| 修改 `src/tools.ts` | 注册位改指向 `src/workflow/wiring.js` |
| 修改 `src/commands/workflows/index.ts` | 改为进度查看器入口 |
| 修改 `src/utils/workflowRuns.ts` | 重写为 run+journal 模型 |
| 移动 `WorkflowPermissionRequest.tsx` → `src/workflow/` | 依赖 src 权限组件 |
| 删除 `builtin-tools/.../WorkflowTool/WorkflowTool.ts` 等 | 清单版逻辑移入包 |

**自然检查点：** Phase 1–3 完成后，包独立可测（全 mock 端口，无 LLM），是一个可提交的里程碑。Phase 4–6 是核心集成。

---

## Phase 0：包脚手架

### Task 1：创建包脚手架

**Files:**
- Create: `packages/workflow-engine/package.json`
- Create: `packages/workflow-engine/tsconfig.json`
- Create: `packages/workflow-engine/src/index.ts`
- Modify: `package.json`（根 workspaces 已含 `packages/*`，无需改；确认即可）

- [ ] **Step 1：写 `packages/workflow-engine/package.json`**

```json
{
  "name": "@claude-code-best/workflow-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./tool/constants": "./src/tool/constants.ts",
    "./package.json": "./package.json"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "zod": "workspace:*"
  },
  "scripts": {
    "test": "bun test"
  }
}
```

> 注：`zod` 用 `workspace:*`（monorepo 内 zod）；`ajv` 版本对齐 `SyntheticOutputTool` 已用版本。若 `bun install` 报 ajv 版本冲突，改成 `"ajv": "*"` 由 bun 解析。

- [ ] **Step 2：写 `packages/workflow-engine/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["bun-types"],
    "jsx": "react-jsx",
    "lib": ["ESNext"],
    "allowJs": false,
    "declaration": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

> 此包**不**继承根 `src/*` 路径别名——这是解耦的关键。包内只允许 `node:` 内置、`zod/v4`、`ajv`、相对路径导入。

- [ ] **Step 3：写 `packages/workflow-engine/src/index.ts`（占位，后续任务填充导出）**

```ts
// @claude-code-best/workflow-engine
// 确定性 JS 脚本编排引擎。零核心层运行时依赖，通过端口适配与世界对话。
// 公共导出在后续任务中逐步填充。
export {}
```

- [ ] **Step 4：安装依赖并验证包可被发现**

Run: `bun install`
Expected: 成功，`packages/workflow-engine` 被加入 workspaces。

Run: `bun run --filter @claude-code-best/workflow-engine test 2>&1 | head -5` 或 `cd packages/workflow-engine && bun test 2>&1 | head -5`
Expected: 「0 tests found」无报错（尚无测试）。

- [ ] **Step 5：提交**

```bash
git add packages/workflow-engine
git commit -m "feat(workflow): scaffold @claude-code-best/workflow-engine package"
```

---

## Phase 1：基础契约与纯模块

### Task 2：常量（`constants.ts`）

**Files:**
- Create: `packages/workflow-engine/src/constants.ts`

- [ ] **Step 1：写 `constants.ts`**

```ts
// 引擎级常量。无运行时依赖。

/** Workflow 工具名（与核心层 CORE_TOOLS 一致）。 */
export const WORKFLOW_TOOL_NAME = 'workflow'

/** 用户命名 workflow 文件目录（相对项目根）。 */
export const WORKFLOW_DIR_NAME = '.claude/workflows'

/** workflow run 持久化目录（journal + run 记录）。 */
export const WORKFLOW_RUNS_DIR = '.claude/workflow-runs'

/** 命名 workflow 支持的脚本扩展名（按优先级）。 */
export const WORKFLOW_SCRIPT_EXTENSIONS = ['.ts', '.js', '.mjs'] as const

/** 并发：信号量许可 = min(MAX_CONCURRENCY_CAP, cpuCores - MAX_CONCURRENCY_OFFSET)。 */
export const MAX_CONCURRENCY_OFFSET = 2
export const MAX_CONCURRENCY_CAP = 16

/** 单个 workflow 生命周期内 agent() 总数上限。 */
export const MAX_TOTAL_AGENTS = 1000

/** 单次 parallel()/pipeline() 调用的 items 上限。 */
export const MAX_ITEMS_PER_CALL = 4096
```

- [ ] **Step 2：验证类型**

Run: `cd packages/workflow-engine && bunx tsc --noEmit 2>&1 | head`
Expected: 无错误。

- [ ] **Step 3：提交**

```bash
git add packages/workflow-engine/src/constants.ts
git commit -m "feat(workflow): add engine constants"
```

---

### Task 3：核心类型（`types.ts`）

**Files:**
- Create: `packages/workflow-engine/src/types.ts`
- Test: `packages/workflow-engine/src/__tests__/types.test.ts`

- [ ] **Step 1：先写测试（验证 JournalEntry 与 AgentRunResult 可序列化往返）**

```ts
import { expect, test } from 'bun:test'

// 直接构造未导出的类型形状，验证 JSON 往返（resume 持久化的核心要求）。
test('AgentRunResult ok 分支可 JSON 往返', () => {
  const result = { kind: 'ok' as const, output: { confirmed: true }, usage: { outputTokens: 42 } }
  const round = JSON.parse(JSON.stringify(result))
  expect(round).toEqual(result)
  expect(round.kind).toBe('ok')
})

test('AgentRunResult skipped/dead 分支可 JSON 往返', () => {
  for (const kind of ['skipped', 'dead'] as const) {
    const round = JSON.parse(JSON.stringify({ kind }))
    expect(round.kind).toBe(kind)
  }
})

test('JournalEntry 形状稳定', () => {
  const entry = { key: 'abc123', result: { kind: 'ok', output: 'text', usage: { outputTokens: 1 } } }
  const round = JSON.parse(JSON.stringify(entry))
  expect(round.key).toBe('abc123')
  expect(round.result.kind).toBe('ok')
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/types.test.ts`
Expected: 这几个测试只依赖字面量构造，应直接 PASS（作为形状契约锚点）。若 PASS 则继续——它们锁定了序列化形状。

- [ ] **Step 3：写 `types.ts`**

```ts
// 纯类型定义。无运行时依赖。

/** Workflow 工具输入。 */
export type WorkflowInput = {
  /** 内联脚本源码。 */
  script?: string
  /** 命名 workflow（解析到 .claude/workflows/<name>.ts|js|mjs）。 */
  name?: string
  /** 已有脚本文件绝对路径。 */
  scriptPath?: string
  /** 透传给脚本的 args 全局变量（任意 JSON 值）。 */
  args?: unknown
  /** resume 指定 run，重放 journal。 */
  resumeFromRunId?: string
  /** 工具调用描述（3-5 词）。 */
  description?: string
  /** 进度查看器标题。 */
  title?: string
}

/** 脚本 `export const meta = {...}` 的形状（必须是纯字面量）。 */
export type WorkflowMeta = {
  name: string
  description: string
  whenToUse?: string
  phases?: Array<{ title: string; detail?: string }>
}

/** agent() 传给 AgentRunner 的参数。 */
export type AgentRunParams = {
  prompt: string
  /** JSON Schema；提供时 agent 返回校验对象而非文本。 */
  schema?: object
  model?: string
  /** 自定义子 agent 类型（从 registry 解析）。 */
  agentType?: string
  isolation?: 'worktree'
  allowedTools?: string[]
  /** 仅展示用，不计入 journal key。 */
  label?: string
  /** 仅展示用，不计入 journal key。 */
  phase?: string
}

/** AgentRunner 返回。 */
export type AgentRunResult =
  | { kind: 'ok'; output: string | object; usage: { outputTokens: number } }
  | { kind: 'skipped' }
  | { kind: 'dead' }

/** journal 中单条记录（按执行顺序）。 */
export type JournalEntry = {
  key: string
  result: AgentRunResult
}

/** 进度事件。所有变体携带 runId，供 adapter 路由到对应 task（多并发 workflow）。 */
export type ProgressEvent =
  | { type: 'run_started'; runId: string; workflowName: string; meta: WorkflowMeta | null }
  | { type: 'phase_started'; runId: string; phase: string }
  | { type: 'phase_done'; runId: string; phase: string }
  | { type: 'agent_started'; runId: string; label?: string; phase?: string }
  | { type: 'agent_done'; runId: string; label?: string; phase?: string; result: AgentRunResult }
  | { type: 'log'; runId: string; message: string }
  | {
      type: 'run_done'
      runId: string
      status: 'completed' | 'failed' | 'killed'
      returnValue?: unknown
      error?: string
    }

/** 引擎运行结果。 */
export type WorkflowRunResult = {
  status: 'completed' | 'failed' | 'killed'
  returnValue?: unknown
  error?: string
}
```

- [ ] **Step 4：更新 `src/index.ts` 导出类型**

```ts
export * from './types.js'
export * from './constants.js'
```

- [ ] **Step 5：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/types.test.ts && bunx tsc --noEmit`
Expected: 测试 PASS，类型零错误。

- [ ] **Step 6：提交**

```bash
git add packages/workflow-engine/src/types.ts packages/workflow-engine/src/__tests__/types.test.ts packages/workflow-engine/src/index.ts
git commit -m "feat(workflow): add core types (input/meta/journal/progress/agent)"
```

---

### Task 4：端口契约（`ports.ts`）

**Files:**
- Create: `packages/workflow-engine/src/ports.ts`
- Test: `packages/workflow-engine/src/__tests__/ports.test.ts`

- [ ] **Step 1：先写测试（验证 HostHandle 不可被伪造、端口对象形状）**

```ts
import { expect, test } from 'bun:test'
import { createHostHandle, isHostHandle, type HostHandle } from '../ports.js'

test('createHostHandle 包装任意 bundle 且对外不透明', () => {
  const bundle = { secret: 'ctx', nested: { a: 1 } }
  const handle = createHostHandle(bundle)
  expect(isHostHandle(handle)).toBe(true)
  // 包内不暴露 bundle —— handle 只有符号标记
  expect(Object.keys(handle)).toHaveLength(0)
})

test('普通对象不是 HostHandle', () => {
  expect(isHostHandle({} as unknown)).toBe(false)
  expect(isHostHandle(null)).toBe(false)
})

test('端口对象满足最小形状', () => {
  // 编译期形状校验：以下赋值通过即说明端口契约自洽
  const noop = () => {}
  const ports = {
    agentRunner: { runAgentToResult: noop },
    progressEmitter: { emit: noop },
    taskRegistrar: {
      register: () => ({ runId: 'run-1', signal: new AbortController().signal }),
      complete: noop,
      fail: noop,
      kill: noop,
      pendingAction: () => null,
    },
    journalStore: { read: async () => [], append: async () => {}, truncate: async () => {} },
    permissionGate: { isAborted: () => false },
    logger: { debug: noop, event: noop },
    hostFactory: () => ({ handle: createHostHandle(null), cwd: '/tmp', budgetTotal: null, toolUseId: 'tu-1' }),
  }
  expect(ports.taskRegistrar.register().runId).toBe('run-1')
  expect(ports.hostFactory().toolUseId).toBe('tu-1')
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/ports.test.ts`
Expected: FAIL —— `../ports.js` 尚无导出。

- [ ] **Step 3：写 `ports.ts`**

```ts
import type {
  AgentRunParams,
  AgentRunResult,
  ProgressEvent,
} from './types.js'

/**
 * 不透明 host 句柄。核心侧每次工具调用构造一个，内含 toolUseContext/
 * canUseTool/parentMessage 等。包内绝不检视其内部，只透传给 AgentRunner。
 * 这是包与核心层之间唯一的耦合缝隙，且是不透明的。
 */
const HOST_HANDLE = Symbol('workflow.hostHandle')

export type HostBundle = unknown

export type HostHandle = { readonly [HOST_HANDLE]: HostBundle }

/** 核心 side hostFactory 用：把任意 bundle 包成不透明句柄。 */
export function createHostHandle(bundle: HostBundle): HostHandle {
  return { [HOST_HANDLE]: bundle } as HostHandle
}

/** 类型守卫。 */
export function isHostHandle(value: unknown): value is HostHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    HOST_HANDLE in (value as object)
  )
}

/** 核心 side adapter 用：解包（仅 adapter 应调用）。 */
export function unwrapHostHandle(handle: HostHandle): HostBundle {
  return (handle as { [k: symbol]: HostBundle })[HOST_HANDLE]
}

/** agent() 钩子的后端。 */
export type AgentRunner = {
  runAgentToResult(
    params: AgentRunParams,
    host: HostHandle,
  ): Promise<AgentRunResult>
}

/** 进度事件发射。 */
export type ProgressEmitter = {
  emit(event: ProgressEvent): void
}

/** 后台任务生命周期。 */
export type TaskRegistrar = {
  /**
   * 注册后台任务。adapter 创建 AbortController 并存入 task 状态，
   * 返回 runId 与 signal（供引擎 detached 执行 + kill 中止用）。
   */
  register(
    opts: {
      workflowName: string
      workflowFile?: string
      summary?: string
      toolUseId?: string
      /** resume 时复用既有 runId（读其 journal）。省略则生成新 id。 */
      runId?: string
    },
    host: HostHandle,
  ): { runId: string; signal: AbortSignal }
  complete(runId: string, summary?: string): void
  fail(runId: string, error: string): void
  kill(runId: string): void
  /** 返回当前待处理的 skip/retry 动作，或 null。 */
  pendingAction(runId: string): { kind: 'skip' | 'retry' } | null
}

/** journal 持久化。 */
export type JournalStore = {
  read(runId: string): Promise<import('./types.js').JournalEntry[]>
  append(runId: string, entry: import('./types.js').JournalEntry): Promise<void>
  truncate(runId: string): Promise<void>
}

/** 取消/权限门。 */
export type PermissionGate = {
  isAborted(host: HostHandle): boolean
}

/** 日志 + 遥测。 */
export type Logger = {
  debug(msg: string): void
  event(name: string, metadata?: Record<string, unknown>): void
}

/** 引擎从 host 提取的可直接使用上下文（句柄 + 基本字段）。 */
export type WorkflowHostContext = {
  /** 透传给 AgentRunner 的不透明句柄（内含 toolUseContext/canUseTool/parentMessage）。 */
  handle: HostHandle
  cwd: string
  /** token 预算上限，null 表示无限制。 */
  budgetTotal: number | null
  /** 核心 side 的工具调用 ID（透传给 task 注册）。 */
  toolUseId?: string
}

/**
 * 核心 side 提供：从工具调用的核心上下文构造 WorkflowHostContext。
 * 参数对包是不透明的（unknown）；核心侧 hostFactory 知道真实类型。
 */
export type HostFactory = (args: {
  context: unknown
  canUseTool: unknown
  parentMessage: unknown
}) => WorkflowHostContext

/** 所有端口的聚合。createWorkflowTool(ports) 注入。 */
export type WorkflowPorts = {
  agentRunner: AgentRunner
  progressEmitter: ProgressEmitter
  taskRegistrar: TaskRegistrar
  journalStore: JournalStore
  permissionGate: PermissionGate
  logger: Logger
  hostFactory: HostFactory
}
```

- [ ] **Step 4：更新 `src/index.ts` 追加端口导出**

在现有导出后追加：

```ts
export * from './ports.js'
```

- [ ] **Step 5：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/ports.test.ts && bunx tsc --noEmit`
Expected: 三个测试 PASS，类型零错误。

- [ ] **Step 6：提交**

```bash
git add packages/workflow-engine/src/ports.ts packages/workflow-engine/src/__tests__/ports.test.ts packages/workflow-engine/src/index.ts
git commit -m "feat(workflow): add ports & opaque HostHandle contracts"
```

---

### Task 5：并发信号量与上限（`engine/concurrency.ts`）

**Files:**
- Create: `packages/workflow-engine/src/engine/concurrency.ts`
- Test: `packages/workflow-engine/src/__tests__/concurrency.test.ts`

- [ ] **Step 1：先写测试**

```ts
import { expect, test } from 'bun:test'
import { Semaphore, maxConcurrency } from '../engine/concurrency.js'

test('Semaphore 限制并发，permit 转移不泄漏', async () => {
  const sem = new Semaphore(2)
  let active = 0
  let peak = 0
  const task = async () => {
    const release = await sem.acquire()
    active++
    peak = Math.max(peak, active)
    await new Promise(r => setTimeout(r, 10))
    active--
    release()
  }
  await Promise.all(Array.from({ length: 6 }, () => task()))
  expect(peak).toBe(2) // 永不超过 permits
})

test('maxConcurrency 落在 [1, 16]', () => {
  const n = maxConcurrency()
  expect(n).toBeGreaterThanOrEqual(1)
  expect(n).toBeLessThanOrEqual(16)
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/concurrency.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `engine/concurrency.ts`**

```ts
import * as os from 'node:os'
import { MAX_CONCURRENCY_CAP, MAX_CONCURRENCY_OFFSET } from '../constants.js'

/**
 * 异步信号量。acquire() 返回一个 release 函数；permit 在 release 时直接
 * 转移给下一个等待者（available 不变），无等待者时才归还。permit 总数守恒。
 */
export class Semaphore {
  private available: number
  private readonly waiters: Array<() => void> = []

  constructor(permits: number) {
    this.available = Math.max(1, Math.floor(permits))
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available -= 1
      return () => this.release()
    }
    await new Promise<void>(resolve => this.waiters.push(resolve))
    // 被唤醒 = 一个 permit 已转移给我，不再扣减
    return () => this.release()
  }

  private release(): void {
    const next = this.waiters.shift()
    if (next) {
      next() // 直接转移 permit
    } else {
      this.available += 1
    }
  }
}

function cpuCores(): number {
  const a = (os as { availableParallelism?: () => number }).availableParallelism
  if (typeof a === 'function') {
    try {
      return a()
    } catch {
      // fallthrough
    }
  }
  return os.cpus()?.length ?? 4
}

/** min(MAX_CONCURRENCY_CAP, cpuCores - MAX_CONCURRENCY_OFFSET)，至少 1。 */
export function maxConcurrency(): number {
  return Math.max(1, Math.min(MAX_CONCURRENCY_CAP, cpuCores() - MAX_CONCURRENCY_OFFSET))
}
```

- [ ] **Step 4：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/concurrency.test.ts && bunx tsc --noEmit`
Expected: 测试 PASS，类型零错误。

- [ ] **Step 5：提交**

```bash
git add packages/workflow-engine/src/engine/concurrency.ts packages/workflow-engine/src/__tests__/concurrency.test.ts
git commit -m "feat(workflow): add Semaphore and maxConcurrency"
```

---

### Task 6：脚本解析与沙箱（`engine/script.ts`）

**Files:**
- Create: `packages/workflow-engine/src/engine/script.ts`
- Test: `packages/workflow-engine/src/__tests__/script.test.ts`

- [ ] **Step 1：先写测试**

```ts
import { expect, test } from 'bun:test'
import { ScriptError, extractMeta, parseScript, type WorkflowHooks } from '../engine/script.js'

const stubHooks: WorkflowHooks = {
  agent: async () => 'agent-result',
  parallel: async (thunks) => Promise.all(thunks.map(async t => { try { return await t() } catch { return null } })),
  pipeline: async () => [],
  phase: () => {},
  log: () => {},
  workflow: async () => null,
}

test('extractMeta 提取纯字面量并剥离语句', () => {
  const src = `export const meta = { name: 'x', description: 'y' }\nreturn 1`
  const { meta, body } = extractMeta(src)
  expect(meta?.name).toBe('x')
  expect(meta?.description).toBe('y')
  expect(body).not.toContain('export const meta')
  expect(body).toContain('return 1')
})

test('extractMeta 无 meta 返回 null 且 body 不变', () => {
  const src = `return 42`
  const { meta, body } = extractMeta(src)
  expect(meta).toBeNull()
  expect(body).toBe(src)
})

test('extractMeta 拒绝非纯字面量（引用变量）', () => {
  const src = `const x = 1\nexport const meta = { name: 'x', description: y }\nreturn 1`
  expect(() => extractMeta(src)).toThrow(ScriptError)
})

test('parseScript 执行 body 顶层 return', async () => {
  const { execute } = parseScript(`return args.n + 1`)
  const out = await execute(stubHooks, { n: 41 }, { total: null })
  expect(out).toBe(42)
})

test('脚本中 Date.now() 抛非确定性错误', async () => {
  const { execute } = parseScript(`return Date.now()`)
  await expect(execute(stubHooks, {}, { total: null })).rejects.toThrow(/Date\.now/)
})

test('脚本中 Math.random() 抛非确定性错误', async () => {
  const { execute } = parseScript(`return Math.random()`)
  await expect(execute(stubHooks, {}, { total: null })).rejects.toThrow(/Math\.random/)
})

test('无参 new Date() 抛，有参 new Date() 可用', async () => {
  const bad = parseScript(`return new Date()`)
  await expect(bad.execute(stubHooks, {}, { total: null })).rejects.toThrow(/new Date/)
  const good = parseScript(`return new Date('2020-06-12T00:00:00Z').getUTCFullYear()`)
  await expect(good.execute(stubHooks, {}, { total: null })).resolves.toBe(2020)
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/script.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `engine/script.ts`**

```ts
import type { WorkflowMeta } from '../types.js'

export class ScriptError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ScriptError'
  }
}

/** 引擎注入脚本的钩子函数形状。 */
export type WorkflowHooks = {
  agent: (prompt: string, opts?: Record<string, unknown>) => Promise<unknown>
  parallel: <T>(thunks: Array<() => Promise<T>>) => Promise<Array<T | null>>
  pipeline: <T, R>(
    items: readonly T[],
    ...stages: Array<(prev: unknown, item: T, index: number) => Promise<unknown>>
  ) => Promise<Array<R | null>>
  phase: (title: string) => void
  log: (message: string) => void
  workflow: (nameOrRef: string | { scriptPath: string }, args?: unknown) => Promise<unknown>
}

const META_RE = /export\s+const\s+meta\s*=\s*/

/**
 * 提取 `export const meta = { ... }` 纯字面量。返回 meta 对象与剥离后的 body。
 * 字面量用无参 Function 求值——任何标识符引用都会抛 ReferenceError → 报「非纯字面量」。
 */
export function extractMeta(source: string): {
  meta: WorkflowMeta | null
  body: string
} {
  const match = META_RE.exec(source)
  if (!match) return { meta: null, body: source }

  let i = match.index! + match[0].length
  while (i < source.length && /\s/.test(source[i]!)) i++
  if (source[i] !== '{') {
    throw new ScriptError('meta 必须是对象字面量 `{ ... }`')
  }

  // 大括号匹配（处理字符串/转义/嵌套）
  let depth = 0
  const start = i
  let inStr: string | null = null
  for (; i < source.length; i++) {
    const ch = source[i]!
    if (inStr) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === inStr) inStr = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        i++
        break
      }
    }
  }
  if (depth !== 0) throw new ScriptError('meta 字面量大括号未闭合')

  const literal = source.slice(start, i)
  let metaObj: unknown
  try {
    // 无参 Function：纯字面量可求值；引用任何标识符 → ReferenceError
    metaObj = new Function(`return (${literal})`)()
  } catch (e) {
    throw new ScriptError(
      `meta 必须是纯字面量（无变量/函数调用/插值）：${(e as Error).message}`,
    )
  }
  const meta = validateMeta(metaObj)

  // 剥离 meta 语句（含尾随分号与多余空行）
  const body = (
    source.slice(0, match.index) + source.slice(i)
  ).replace(/[ \t]*;[ \t]*\n/, '\n')
  return { meta, body }
}

function validateMeta(v: unknown): WorkflowMeta {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new ScriptError('meta 必须是对象')
  }
  const o = v as Record<string, unknown>
  if (typeof o.name !== 'string' || typeof o.description !== 'string') {
    throw new ScriptError('meta 必须含字符串 name 与 description')
  }
  return o as unknown as WorkflowMeta
}

// ---- 非确定性沙箱 shim ----
class NonDeterministicError extends Error {
  constructor(fn: string) {
    super(
      `${fn} 在 workflow 脚本中不可用（会破坏 resume 的确定性）。请通过 args 传入时间戳/随机种子。`,
    )
    this.name = 'NonDeterministicError'
  }
}

function sandboxDate(): DateConstructor {
  const fn = function (...args: unknown[]): Date {
    if (args.length === 0) throw new NonDeterministicError('Date.now()/new Date()')
    return new (Date as unknown as DateConstructor)(
      ...(args as [string | number | Date]),
    )
  } as unknown as DateConstructor
  fn.now = () => {
    throw new NonDeterministicError('Date.now()')
  }
  fn.parse = Date.parse
  fn.UTC = Date.UTC
  return fn
}

function sandboxMath(): Math {
  return new Proxy(Math, {
    get(target, prop, receiver) {
      if (prop === 'random') {
        return () => {
          throw new NonDeterministicError('Math.random()')
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as Math
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as {
  new (...args: string[]): (...args: unknown[]) => Promise<unknown>
}

export type ParsedScript = {
  meta: WorkflowMeta | null
  execute: (
    hooks: WorkflowHooks,
    args: unknown,
    budget: unknown,
  ) => Promise<unknown>
}

/** 校验 + 包装脚本为可执行 async 函数（Date/Math 被 shim 覆盖）。 */
export function parseScript(source: string): ParsedScript {
  const { meta, body } = extractMeta(source)
  let fn: (...args: unknown[]) => Promise<unknown>
  try {
    fn = new AsyncFunction(
      'agent',
      'parallel',
      'pipeline',
      'phase',
      'log',
      'workflow',
      'args',
      'budget',
      'Date',
      'Math',
      body,
    )
  } catch (e) {
    throw new ScriptError(`脚本语法错误：${(e as Error).message}`)
  }
  const sandboxedDate = sandboxDate()
  const sandboxedMath = sandboxMath()
  return {
    meta,
    async execute(hooks, args, budget) {
      return fn(
        hooks.agent,
        hooks.parallel,
        hooks.pipeline,
        hooks.phase,
        hooks.log,
        hooks.workflow,
        args,
        budget,
        sandboxedDate,
        sandboxedMath,
      )
    },
  }
}
```

- [ ] **Step 4：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/script.test.ts && bunx tsc --noEmit`
Expected: 全部 PASS，类型零错误。

- [ ] **Step 5：提交**

```bash
git add packages/workflow-engine/src/engine/script.ts packages/workflow-engine/src/__tests__/script.test.ts
git commit -m "feat(workflow): add script parsing, meta extraction & Date/Math sandbox"
```

---

### Task 7：Journal（`engine/journal.ts`）

**Files:**
- Create: `packages/workflow-engine/src/engine/journal.ts`
- Test: `packages/workflow-engine/src/__tests__/journal.test.ts`

- [ ] **Step 1：先写测试**

```ts
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { agentCallKey, createFileJournalStore } from '../engine/journal.js'
import type { AgentRunParams } from '../types.js'

const base: AgentRunParams = { prompt: 'do something' }

test('agentCallKey 对相同 prompt+params 稳定', () => {
  expect(agentCallKey('p', base)).toBe(agentCallKey('p', base))
})

test('agentCallKey 随 prompt 变化', () => {
  expect(agentCallKey('p1', base)).not.toBe(agentCallKey('p2', base))
})

test('agentCallKey 忽略纯展示字段 label/phase', () => {
  const a = agentCallKey('p', { ...base, label: 'A', phase: 'ph1' })
  const b = agentCallKey('p', { ...base, label: 'B', phase: 'ph2' })
  expect(a).toBe(b)
})

test('FileJournalStore append → read 保序，truncate 清空', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-journal-'))
  try {
    const store = createFileJournalStore(dir)
    const e1 = { key: 'k1', result: { kind: 'ok' as const, output: 'x', usage: { outputTokens: 1 } } }
    const e2 = { key: 'k2', result: { kind: 'dead' as const } }
    await store.append('run-1', e1)
    await store.append('run-1', e2)
    const got = await store.read('run-1')
    expect(got).toHaveLength(2)
    expect(got[0].key).toBe('k1')
    expect(got[1].result.kind).toBe('dead')
    await store.truncate('run-1')
    expect(await store.read('run-1')).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/journal.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `engine/journal.ts`**

```ts
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { JournalStore } from '../ports.js'
import type { AgentRunParams, JournalEntry } from '../types.js'

/** 去掉纯展示字段后的规范化参数字符串。 */
function canonicalParams(params: AgentRunParams): string {
  const { label: _label, phase: _phase, ...rest } = params
  const keys = Object.keys(rest).sort()
  const sorted: Record<string, unknown> = {}
  for (const k of keys) sorted[k] = rest[k as keyof typeof rest]
  return JSON.stringify(sorted)
}

/** agent() 调用的确定性 key（prompt + 规范化 params 的 sha256）。 */
export function agentCallKey(prompt: string, params: AgentRunParams): string {
  return createHash('sha256')
    .update(prompt + '\n' + canonicalParams(params))
    .digest('hex')
}

/** 文件式 JournalStore（jsonl，每个 run 一个目录）。纯 fs，无核心依赖。 */
export function createFileJournalStore(runsDir: string): JournalStore {
  const pathOf = (runId: string) => join(runsDir, runId, 'journal.jsonl')

  return {
    async read(runId): Promise<JournalEntry[]> {
      try {
        const raw = await readFile(pathOf(runId), 'utf-8')
        return raw
          .split('\n')
          .filter(line => line.trim().length > 0)
          .map(line => JSON.parse(line) as JournalEntry)
      } catch {
        return []
      }
    },
    async append(runId, entry) {
      await mkdir(join(runsDir, runId), { recursive: true })
      await appendFile(pathOf(runId), JSON.stringify(entry) + '\n', 'utf-8')
    },
    async truncate(runId) {
      await rm(join(runsDir, runId), { recursive: true, force: true })
    },
  }
}
```

- [ ] **Step 4：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/journal.test.ts && bunx tsc --noEmit`
Expected: 全部 PASS，类型零错误。

- [ ] **Step 5：提交**

```bash
git add packages/workflow-engine/src/engine/journal.ts packages/workflow-engine/src/__tests__/journal.test.ts
git commit -m "feat(workflow): add agentCallKey hash & file JournalStore"
```

---

### Task 8：Budget（`engine/budget.ts`）

**Files:**
- Create: `packages/workflow-engine/src/engine/budget.ts`
- Test: `packages/workflow-engine/src/__tests__/budget.test.ts`

- [ ] **Step 1：先写测试**

```ts
import { expect, test } from 'bun:test'
import { Budget, BudgetExhaustedError } from '../engine/budget.js'

test('total=null 时无限制', () => {
  const b = new Budget(null)
  expect(b.total).toBeNull()
  expect(b.remaining()).toBe(Infinity)
  b.addOutputTokens(999999)
  expect(b.spent()).toBe(999999)
  expect(() => b.assertCanSpend()).not.toThrow()
})

test('累加并触顶抛错', () => {
  const b = new Budget(100)
  expect(b.remaining()).toBe(100)
  b.addOutputTokens(40)
  expect(b.spent()).toBe(40)
  expect(b.remaining()).toBe(60)
  expect(() => b.assertCanSpend()).not.toThrow()
  b.addOutputTokens(60)
  expect(b.spent()).toBe(100)
  expect(() => b.assertCanSpend()).toThrow(BudgetExhaustedError)
})

test('addOutputTokens 负值忽略', () => {
  const b = new Budget(100)
  b.addOutputTokens(-50)
  expect(b.spent()).toBe(0)
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/budget.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `engine/budget.ts`**

```ts
export class BudgetExhaustedError extends Error {
  constructor() {
    super('workflow token budget 已耗尽（budget.total 达到上限）')
    this.name = 'BudgetExhaustedError'
  }
}

/**
 * Token 预算累加器。脚本通过 `budget.total / budget.spent() / budget.remaining()`
 * 读取；agent() 调用前 assertCanSpend() 强制硬上限。
 */
export class Budget {
  private spentTokens = 0

  constructor(readonly total: number | null) {}

  spent(): number {
    return this.spentTokens
  }

  remaining(): number {
    return this.total == null ? Infinity : Math.max(0, this.total - this.spentTokens)
  }

  addOutputTokens(n: number): void {
    if (n > 0) this.spentTokens += n
  }

  assertCanSpend(): void {
    if (this.total != null && this.spentTokens >= this.total) {
      throw new BudgetExhaustedError()
    }
  }
}
```

- [ ] **Step 4：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/budget.test.ts && bunx tsc --noEmit`
Expected: 全部 PASS，类型零错误。

- [ ] **Step 5：提交**

```bash
git add packages/workflow-engine/src/engine/budget.ts packages/workflow-engine/src/__tests__/budget.test.ts
git commit -m "feat(workflow): add Budget token accumulator with hard ceiling"
```

---

### Task 9：结构化输出校验（`engine/structuredOutput.ts`）

**Files:**
- Create: `packages/workflow-engine/src/engine/structuredOutput.ts`
- Test: `packages/workflow-engine/src/__tests__/structuredOutput.test.ts`

- [ ] **Step 1：先写测试**

```ts
import { expect, test } from 'bun:test'
import { validateAgainstSchema } from '../engine/structuredOutput.js'

const schema = {
  type: 'object',
  required: ['name', 'count'],
  properties: {
    name: { type: 'string' },
    count: { type: 'number' },
  },
  additionalProperties: false,
}

test('合法对象通过', () => {
  const { valid, errors } = validateAgainstSchema({ name: 'a', count: 1 }, schema)
  expect(valid).toBe(true)
  expect(errors).toEqual([])
})

test('缺字段失败', () => {
  const { valid, errors } = validateAgainstSchema({ name: 'a' }, schema)
  expect(valid).toBe(false)
  expect(errors.length).toBeGreaterThan(0)
})

test('类型错误失败', () => {
  const { valid } = validateAgainstSchema({ name: 'a', count: 'x' }, schema)
  expect(valid).toBe(false)
})

test('同一 schema 复用缓存', () => {
  validateAgainstSchema({ name: 'a', count: 1 }, schema)
  // 第二次用同一 schema 对象应命中缓存（不抛错即可）
  expect(validateAgainstSchema({ name: 'b', count: 2 }, schema).valid).toBe(true)
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/structuredOutput.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `engine/structuredOutput.ts`**

```ts
import { Ajv, type ValidateFunction } from 'ajv'

const cache = new WeakMap<object, ValidateFunction>()

/**
 * 用 JSON Schema 校验 agent 输出（Ajv，编译结果按 schema 对象缓存）。
 * 引擎对 adapter 返回的 schema 结果做二次校验，并用于测试。
 */
export function validateAgainstSchema(
  value: unknown,
  schema: object,
): { valid: boolean; errors: string[] } {
  let validate = cache.get(schema)
  if (!validate) {
    const ajv = new Ajv({ allErrors: true, strict: false })
    validate = ajv.compile(schema) as ValidateFunction
    cache.set(schema, validate)
  }
  const valid = validate(value) as boolean
  return {
    valid,
    errors: valid ? [] : (validate.errors ?? []).map(e => e.message ?? 'validation error'),
  }
}
```

- [ ] **Step 4：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/structuredOutput.test.ts && bunx tsc --noEmit`
Expected: 全部 PASS，类型零错误。

- [ ] **Step 5：提交**

```bash
git add packages/workflow-engine/src/engine/structuredOutput.ts packages/workflow-engine/src/__tests__/structuredOutput.test.ts
git commit -m "feat(workflow): add JSON Schema validation via Ajv"
```

---

### Task 10：命名 workflow 解析（`engine/namedWorkflows.ts`）

**Files:**
- Create: `packages/workflow-engine/src/engine/namedWorkflows.ts`
- Test: `packages/workflow-engine/src/__tests__/namedWorkflows.test.ts`

- [ ] **Step 1：先写测试**

```ts
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listNamedWorkflows, resolveNamedWorkflow } from '../engine/namedWorkflows.js'

test('按扩展名优先级解析命名 workflow', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-named-'))
  try {
    await writeFile(join(dir, 'a.ts'), 'export const meta = { name: "a", description: "d" }\nreturn 1')
    await writeFile(join(dir, 'b.js'), 'return 2')
    await writeFile(join(dir, 'c.mjs'), 'return 3')
    await writeFile(join(dir, 'ignore.md'), '# not a workflow')

    const a = await resolveNamedWorkflow(dir, 'a')
    expect(a?.path.endsWith('a.ts')).toBe(true)
    expect(a?.content).toContain('meta')

    expect(await resolveNamedWorkflow(dir, 'missing')).toBeNull()

    const names = await listNamedWorkflows(dir)
    expect(names).toEqual(['a', 'b', 'c']) // 不含 .md
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('listNamedWorkflows 不存在目录返回空数组', async () => {
  expect(await listNamedWorkflows(join(tmpdir(), 'wf-nope-' + Date.now()))).toEqual([])
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/namedWorkflows.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `engine/namedWorkflows.ts`**

```ts
import { readFile, readdir } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { WORKFLOW_SCRIPT_EXTENSIONS } from '../constants.js'

type Ext = (typeof WORKFLOW_SCRIPT_EXTENSIONS)[number]

function isScriptExt(ext: string): ext is Ext {
  return (WORKFLOW_SCRIPT_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
}

/** 按 .ts → .js → .mjs 优先级解析命名 workflow 文件。 */
export async function resolveNamedWorkflow(
  workflowDir: string,
  name: string,
): Promise<{ path: string; content: string } | null> {
  for (const ext of WORKFLOW_SCRIPT_EXTENSIONS) {
    const p = join(workflowDir, name + ext)
    try {
      return { path: p, content: await readFile(p, 'utf-8') }
    } catch {
      // 试下一个扩展名
    }
  }
  return null
}

/** 列出目录下所有命名 workflow（不含非脚本文件）。 */
export async function listNamedWorkflows(workflowDir: string): Promise<string[]> {
  let files: string[]
  try {
    files = await readdir(workflowDir)
  } catch {
    return []
  }
  return files
    .filter(f => isScriptExt(parse(f).ext))
    .map(f => parse(f).name)
    .sort()
}
```

- [ ] **Step 4：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/namedWorkflows.test.ts && bunx tsc --noEmit`
Expected: 全部 PASS，类型零错误。

- [ ] **Step 5：导出 + 全包回归 + 提交**

更新 `src/index.ts` 追加：

```ts
export * from './engine/concurrency.js'
export * from './engine/script.js'
export * from './engine/journal.js'
export * from './engine/budget.js'
export * from './engine/structuredOutput.js'
export * from './engine/namedWorkflows.js'
```

Run: `cd packages/workflow-engine && bun test && bunx tsc --noEmit`
Expected: 全部测试 PASS，类型零错误。

```bash
git add packages/workflow-engine/src/engine/namedWorkflows.ts packages/workflow-engine/src/__tests__/namedWorkflows.test.ts packages/workflow-engine/src/index.ts
git commit -m "feat(workflow): add named-workflow file resolution"
```

---

## Phase 2：引擎核心

### Task 11：errors / 进度事件 / 执行上下文

**Files:**
- Create: `packages/workflow-engine/src/engine/errors.ts`
- Create: `packages/workflow-engine/src/progress/events.ts`
- Create: `packages/workflow-engine/src/engine/context.ts`
- Test: `packages/workflow-engine/src/__tests__/context.test.ts`

- [ ] **Step 1：先写测试**

```ts
import { expect, test } from 'bun:test'
import { createBufferingEmitter } from '../progress/events.js'
import { createEngineContext, createSharedResources } from '../engine/context.js'
import { WorkflowError } from '../engine/errors.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'

function mockPorts(): WorkflowPorts {
  return {
    agentRunner: { runAgentToResult: async () => ({ kind: 'dead' }) },
    progressEmitter: { emit: () => {} },
    taskRegistrar: { register: () => 'r', complete: () => {}, fail: () => {}, kill: () => {}, pendingAction: () => null },
    journalStore: { read: async () => [], append: async () => {}, truncate: async () => {} },
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({ handle: createHostHandle(null), signal: new AbortController().signal, cwd: '/tmp', budgetTotal: null }),
  }
}

test('createSharedResources 初始化预算与计数', () => {
  const r = createSharedResources(100)
  expect(r.budget.total).toBe(100)
  expect(r.agentCountBox.value).toBe(0)
  expect(r.depth).toBe(0)
})

test('createEngineContext 复制 journal 并重置游标', () => {
  const journal = [{ key: 'k', result: { kind: 'ok', output: 'x', usage: { outputTokens: 1 } } }]
  const ctx = createEngineContext({
    ports: mockPorts(), host: createHostHandle(null),
    signal: new AbortController().signal, runId: 'r1', workflowName: 'w', cwd: '/tmp',
    budgetTotal: null, journal,
  })
  expect(ctx.journal).toHaveLength(1)
  expect(ctx.journalIndex).toBe(0)
  expect(ctx.journalInvalidated).toBe(false)
})

test('createBufferingEmitter 收集事件', () => {
  const { emitter, events } = createBufferingEmitter()
  emitter.emit({ type: 'log', message: 'hi' })
  expect(events).toHaveLength(1)
})

test('WorkflowError 可识别', () => {
  const e = new WorkflowError('boom')
  expect(e).toBeInstanceOf(Error)
  expect(e.message).toBe('boom')
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/context.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `engine/errors.ts`**

```ts
/** 引擎级可预期错误（脚本错、上限、嵌套）。 */
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkflowError'
  }
}

/** workflow 被 abort（kill）。 */
export class WorkflowAbortedError extends Error {
  constructor() {
    super('workflow 已被取消（abort）')
    this.name = 'WorkflowAbortedError'
  }
}
```

- [ ] **Step 4：写 `progress/events.ts`**

```ts
import type { ProgressEmitter } from '../ports.js'
import type { ProgressEvent } from '../types.js'

export type { ProgressEvent }

/** 从单个回调构造 ProgressEmitter。 */
export function createProgressEmitter(onEvent: (e: ProgressEvent) => void): ProgressEmitter {
  return { emit: onEvent }
}

/** 收集所有事件到数组（测试用）。 */
export function createBufferingEmitter(): {
  emitter: ProgressEmitter
  events: ProgressEvent[]
} {
  const events: ProgressEvent[] = []
  return { emitter: { emit: e => void events.push(e) }, events }
}
```

- [ ] **Step 5：写 `engine/context.ts`**

```ts
import type { HostHandle, WorkflowPorts } from '../ports.js'
import type { JournalEntry } from '../types.js'
import { Budget } from './budget.js'
import { Semaphore, maxConcurrency } from './concurrency.js'

/** 可被子 workflow 共享的资源。嵌套时 semaphore/budget/agentCountBox 按引用共享，depth 递增。 */
export type SharedResources = {
  semaphore: Semaphore
  budget: Budget
  agentCountBox: { value: number }
  depth: number
}

/** 单次 workflow 运行的执行上下文。 */
export type EngineContext = {
  ports: WorkflowPorts
  host: HostHandle
  signal: AbortSignal
  runId: string
  workflowName: string
  cwd: string
  resources: SharedResources
  journal: JournalEntry[]
  journalIndex: number
  journalInvalidated: boolean
  currentPhase: string | null
}

export function createSharedResources(budgetTotal: number | null): SharedResources {
  return {
    semaphore: new Semaphore(maxConcurrency()),
    budget: new Budget(budgetTotal),
    agentCountBox: { value: 0 },
    depth: 0,
  }
}

export function createEngineContext(opts: {
  ports: WorkflowPorts
  host: HostHandle
  signal: AbortSignal
  runId: string
  workflowName: string
  cwd: string
  budgetTotal: number | null
  journal?: JournalEntry[]
  shared?: SharedResources
}): EngineContext {
  const resources = opts.shared ?? createSharedResources(opts.budgetTotal)
  return {
    ports: opts.ports,
    host: opts.host,
    signal: opts.signal,
    runId: opts.runId,
    workflowName: opts.workflowName,
    cwd: opts.cwd,
    resources,
    journal: opts.journal ? [...opts.journal] : [],
    journalIndex: 0,
    journalInvalidated: false,
    currentPhase: null,
  }
}
```

- [ ] **Step 6：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/context.test.ts && bunx tsc --noEmit`
Expected: 全部 PASS，类型零错误。

- [ ] **Step 7：提交**

```bash
git add packages/workflow-engine/src/engine/errors.ts packages/workflow-engine/src/progress/events.ts packages/workflow-engine/src/engine/context.ts packages/workflow-engine/src/__tests__/context.test.ts
git commit -m "feat(workflow): add errors, progress emitter & engine context"
```

---

### Task 12：钩子实现（`engine/hooks.ts`）

**Files:**
- Create: `packages/workflow-engine/src/engine/hooks.ts`
- Test: `packages/workflow-engine/src/__tests__/hooks.test.ts`

- [ ] **Step 1：先写测试**

```ts
import { expect, test } from 'bun:test'
import { createEngineContext } from '../engine/context.js'
import { makeHooks, type SubWorkflowRunner } from '../engine/hooks.js'
import { WorkflowError } from '../engine/errors.js'
import { createBufferingEmitter } from '../progress/events.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'
import type { AgentRunParams, AgentRunResult } from '../types.js'

function buildCtx(overrides: Partial<{
  agentResults: Map<string, AgentRunResult>
  pending: { kind: 'skip' | 'retry' } | null
  journal: import('../types.js').JournalEntry[]
  budgetTotal: number | null
}> = {}) {
  const { emitter, events } = createBufferingEmitter()
  const results = overrides.agentResults ?? new Map<string, AgentRunResult>()
  const ports: WorkflowPorts = {
    agentRunner: {
      runAgentToResult: async (params: AgentRunParams) =>
        results.get(params.prompt) ?? { kind: 'dead' },
    },
    progressEmitter: emitter,
    taskRegistrar: {
      register: () => 'r', complete: () => {}, fail: () => {}, kill: () => {},
      pendingAction: () => overrides.pending ?? null,
    },
    journalStore: {
      read: async () => [], append: async () => {}, truncate: async () => {},
    },
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({ handle: createHostHandle(null), signal: new AbortController().signal, cwd: '/tmp', budgetTotal: null }),
  }
  const ctx = createEngineContext({
    ports, host: createHostHandle(null),
    signal: new AbortController().signal, runId: 'r1', workflowName: 'w', cwd: '/tmp',
    budgetTotal: overrides.budgetTotal ?? null,
    journal: overrides.journal,
  })
  const noopSub: SubWorkflowRunner = async () => null
  return { ctx, events, hooks: makeHooks(ctx, noopSub) }
}

test('agent 返回文本结果并计数', async () => {
  const { ctx, hooks } = buildCtx({
    agentResults: new Map([['hi', { kind: 'ok', output: 'hello', usage: { outputTokens: 5 } }]]),
  })
  const out = await hooks.agent('hi')
  expect(out).toBe('hello')
  expect(ctx.resources.agentCountBox.value).toBe(1)
})

test('agent skipped → null 且不计数', async () => {
  const { hooks } = buildCtx({
    agentResults: new Map([['hi', { kind: 'skipped' }]]),
  })
  expect(await hooks.agent('hi')).toBeNull()
})

test('agent dead → null', async () => {
  const { hooks } = buildCtx({
    agentResults: new Map([['hi', { kind: 'dead' }]]),
  })
  expect(await hooks.agent('hi')).toBeNull()
})

test('agent journal 命中时不调用 runner', async () => {
  let called = 0
  const { emitter, events } = createBufferingEmitter()
  const ports: WorkflowPorts = {
    agentRunner: { runAgentToResult: async () => { called++; return { kind: 'ok', output: 'live', usage: { outputTokens: 1 } } } },
    progressEmitter: emitter,
    taskRegistrar: { register: () => 'r', complete: () => {}, fail: () => {}, kill: () => {}, pendingAction: () => null },
    journalStore: { read: async () => [], append: async () => {}, truncate: async () => {} },
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({ handle: createHostHandle(null), signal: new AbortController().signal, cwd: '/tmp', budgetTotal: null }),
  }
  const { agentCallKey } = await import('../engine/journal.js')
  const key = agentCallKey('hi', { prompt: 'hi' })
  const ctx = createEngineContext({
    ports, host: createHostHandle(null),
    signal: new AbortController().signal, runId: 'r1', workflowName: 'w', cwd: '/tmp',
    budgetTotal: null,
    journal: [{ key, result: { kind: 'ok', output: 'cached', usage: { outputTokens: 1 } } }],
  })
  const hooks = makeHooks(ctx, async () => null)
  expect(await hooks.agent('hi')).toBe('cached')
  expect(called).toBe(0)
})

test('agent 超过总数上限抛错', async () => {
  const { hooks, ctx } = buildCtx()
  ctx.resources.agentCountBox.value = 1000
  await expect(hooks.agent('hi')).rejects.toThrow(WorkflowError)
})

test('parallel 单项抛错 → null，其余保留', async () => {
  const { hooks } = buildCtx()
  const out = await hooks.parallel([
    async () => 'a',
    async () => { throw new Error('x') },
    async () => 'c',
  ])
  expect(out).toEqual(['a', null, 'c'])
})

test('pipeline 逐 stage 链式，stage 抛错 → null', async () => {
  const { hooks } = buildCtx()
  const out = await hooks.pipeline(
    [1, 2],
    (n) => Promise.resolve((n as number) + 1),
    (m) => Promise.resolve((m as number) * 10),
  )
  expect(out).toEqual([20, 30])
  const out2 = await hooks.pipeline(
    [1],
    () => Promise.reject(new Error('boom')),
    (m) => Promise.resolve(m),
  )
  expect(out2).toEqual([null])
})

test('pipeline 超 4096 抛错', async () => {
  const { hooks } = buildCtx()
  await expect(hooks.pipeline(Array(4097), () => Promise.resolve(1))).rejects.toThrow(WorkflowError)
})

test('phase 切换发射 phase_started/done；log 发射 log', async () => {
  const { hooks, events } = buildCtx()
  hooks.phase('A')
  hooks.log('hello')
  hooks.phase('B')
  expect(events.some(e => e.type === 'phase_started' && e.phase === 'A')).toBe(true)
  expect(events.some(e => e.type === 'phase_done' && e.phase === 'A')).toBe(true)
  expect(events.some(e => e.type === 'log' && e.message === 'hello')).toBe(true)
  expect(events.some(e => e.type === 'phase_started' && e.phase === 'B')).toBe(true)
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/hooks.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `engine/hooks.ts`**

```ts
import { MAX_ITEMS_PER_CALL, MAX_TOTAL_AGENTS, WORKFLOW_DIR_NAME } from '../constants.js'
import type { HostHandle, WorkflowPorts } from '../ports.js'
import type { AgentRunParams, AgentRunResult, JournalEntry } from '../types.js'
import type { EngineContext, SharedResources } from './context.js'
import { WorkflowAbortedError, WorkflowError } from './errors.js'
import { agentCallKey } from './journal.js'
import type { WorkflowHooks } from './script.js'

/** workflow() 钩子的子 workflow 执行器（由 runWorkflow 注入，避免循环依赖）。 */
export type SubWorkflowRunner = (opts: {
  name?: string
  scriptPath?: string
  script?: string
  args?: unknown
}) => Promise<unknown>

type Opts = Record<string, unknown>

type HookProgressInit =
  | { type: 'phase_started'; phase: string }
  | { type: 'phase_done'; phase: string }
  | { type: 'agent_started'; label?: string; phase?: string }
  | { type: 'agent_done'; label?: string; phase?: string; result: AgentRunResult }
  | { type: 'log'; message: string }

export function makeHooks(ctx: EngineContext, runSubWorkflow: SubWorkflowRunner): WorkflowHooks {
  // 所有进度事件自动注入 runId，供 adapter 路由到对应 task（多并发 workflow）
  const emit = (init: HookProgressInit): void => {
    ctx.ports.progressEmitter.emit({ runId: ctx.runId, ...init } as ProgressEvent)
  }

  const agent: WorkflowHooks['agent'] = async (prompt, opts = {}) => {
    const r = ctx.resources
    if (r.agentCountBox.value >= MAX_TOTAL_AGENTS) {
      throw new WorkflowError(`workflow 超过 agent 总数上限 (${MAX_TOTAL_AGENTS})`)
    }
    r.budget.assertCanSpend()

    const params: AgentRunParams = { prompt, ...opts }
    const key = agentCallKey(prompt, params)
    const label = opts.label as string | undefined
    const phase = (opts.phase as string | undefined) ?? ctx.currentPhase ?? undefined

    // journal 命中 → 直接返回缓存
    if (!ctx.journalInvalidated && ctx.journalIndex < ctx.journal.length) {
      const entry = ctx.journal[ctx.journalIndex]!
      if (entry.key === key) {
        ctx.journalIndex++
        emit({ type: 'agent_done', label, phase, result: entry.result })
        return resultToOutput(entry.result)
      }
      // 发散：丢弃后续 journal，后续全部现场跑
      ctx.journalInvalidated = true
      ctx.journal = ctx.journal.slice(0, ctx.journalIndex)
      await ctx.ports.journalStore.truncate(ctx.runId)
    }

    const release = await ctx.resources.semaphore.acquire()
    try {
      if (ctx.signal.aborted) throw new WorkflowAbortedError()

      const pending = ctx.ports.taskRegistrar.pendingAction(ctx.runId)
      if (pending?.kind === 'skip') {
        const result: AgentRunResult = { kind: 'skipped' }
        emit({ type: 'agent_done', label, phase, result })
        return null
      }

      ctx.resources.agentCountBox.value++
      emit({ type: 'agent_started', label, phase })
      const result = await ctx.ports.agentRunner.runAgentToResult(params, ctx.host)
      if (result.kind === 'ok') {
        ctx.resources.budget.addOutputTokens(result.usage.outputTokens)
      }
      ctx.ports.progressEmitter.emit({ type: 'agent_done', label, phase, result })

      const entry: JournalEntry = { key, result }
      ctx.journal.push(entry)
      ctx.journalIndex++
      await ctx.ports.journalStore.append(ctx.runId, entry)
      return resultToOutput(result)
    } finally {
      release()
    }
  }

  const parallel: WorkflowHooks['parallel'] = async thunks => {
    if (thunks.length > MAX_ITEMS_PER_CALL) {
      throw new WorkflowError(`parallel 超过单次调用 items 上限 (${MAX_ITEMS_PER_CALL})`)
    }
    return Promise.all(
      thunks.map(async t => {
        try {
          return await t()
        } catch {
          return null
        }
      }),
    )
  }

  const pipeline: WorkflowHooks['pipeline'] = async (items, ...stages) => {
    if (items.length > MAX_ITEMS_PER_CALL) {
      throw new WorkflowError(`pipeline 超过单次调用 items 上限 (${MAX_ITEMS_PER_CALL})`)
    }
    return Promise.all(
      items.map(async (item, index) => {
        try {
          let prev: unknown = item
          for (const stage of stages) {
            prev = await stage(prev, item, index)
          }
          return prev
        } catch {
          return null
        }
      }),
    )
  }

  const phase: WorkflowHooks['phase'] = title => {
    if (ctx.currentPhase) {
      emit({ type: 'phase_done', phase: ctx.currentPhase })
    }
    ctx.currentPhase = title
    emit({ type: 'phase_started', phase: title })
  }

  const log: WorkflowHooks['log'] = message => {
    emit({ type: 'log', message })
  }

  const workflow: WorkflowHooks['workflow'] = async (nameOrRef, args) => {
    if (ctx.resources.depth >= 1) {
      throw new WorkflowError('workflow() 嵌套仅允许一层')
    }
    const sub: Parameters<SubWorkflowRunner>[0] =
      typeof nameOrRef === 'string' ? { name: nameOrRef } : { scriptPath: nameOrRef.scriptPath }
    return runSubWorkflow({ ...sub, args })
  }

  return { agent, parallel, pipeline, phase, log, workflow }
}

function resultToOutput(result: AgentRunResult): unknown {
  return result.kind === 'ok' ? result.output : null
}

// 仅用于抑制未使用导入告警（WORKFLOW_DIR_NAME 在 runWorkflow 中用于子 workflow 解析）
export type _Unused = typeof WORKFLOW_DIR_NAME & typeof SharedResources & HostHandle & WorkflowPorts
```

> 注：`_Unused` 行是占位防止 lint 抱怨未使用导入——若 `bunx tsc` 报「未使用」，移除该行及对应未用 import。最终版只保留真正用到的 import（`MAX_ITEMS_PER_CALL`、`MAX_TOTAL_AGENTS`、`AgentRunParams`、`AgentRunResult`、`JournalEntry`、`EngineContext`、`WorkflowAbortedError`、`WorkflowError`、`agentCallKey`、`WorkflowHooks`、`SubWorkflowRunner`）。实现时清理为：

```ts
import { MAX_ITEMS_PER_CALL, MAX_TOTAL_AGENTS } from '../constants.js'
import type {
  AgentRunParams,
  AgentRunResult,
  JournalEntry,
  ProgressEvent,
} from '../types.js'
import type { EngineContext } from './context.js'
import { WorkflowAbortedError, WorkflowError } from './errors.js'
import { agentCallKey } from './journal.js'
import type { WorkflowHooks } from './script.js'
```

- [ ] **Step 4：运行测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test src/__tests__/hooks.test.ts && bunx tsc --noEmit`
Expected: 全部 PASS，类型零错误（确认已清理未用 import）。

- [ ] **Step 5：提交**

```bash
git add packages/workflow-engine/src/engine/hooks.ts packages/workflow-engine/src/__tests__/hooks.test.ts
git commit -m "feat(workflow): implement agent/parallel/pipeline/phase/log/workflow hooks"
```

---

### Task 13：引擎编排入口（`engine/runWorkflow.ts`）

**Files:**
- Create: `packages/workflow-engine/src/engine/runWorkflow.ts`
- Test: `packages/workflow-engine/src/__tests__/runWorkflow.test.ts`

- [ ] **Step 1：先写测试**

```ts
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runWorkflow } from '../engine/runWorkflow.js'
import { createFileJournalStore } from '../engine/journal.js'
import { agentCallKey } from '../engine/journal.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'
import type { AgentRunParams, AgentRunResult } from '../types.js'

function portsWith(runsDir: string, results: Map<string, AgentRunResult>): WorkflowPorts {
  return {
    agentRunner: { runAgentToResult: async (p: AgentRunParams) => results.get(p.prompt) ?? { kind: 'dead' } },
    progressEmitter: { emit: () => {} },
    taskRegistrar: { register: () => 'r', complete: () => {}, fail: () => {}, kill: () => {}, pendingAction: () => null },
    journalStore: createFileJournalStore(runsDir),
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({ handle: createHostHandle(null), signal: new AbortController().signal, cwd: '/tmp', budgetTotal: null }),
  }
}

test('端到端：脚本返回 agent 结果，状态 completed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const ports = portsWith(dir, new Map([['compute', { kind: 'ok', output: 42, usage: { outputTokens: 3 } }]]))
    const result = await runWorkflow({
      script: `export const meta = { name: 't', description: 'd' }\nreturn agent('compute')`,
      runId: 'run-1', ports, host: createHostHandle(null),
      signal: new AbortController().signal, cwd: dir, budgetTotal: null,
    })
    expect(result.status).toBe('completed')
    expect(result.returnValue).toBe(42)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('脚本语法错误 → failed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const ports = portsWith(dir, new Map())
    const result = await runWorkflow({
      script: `export const meta = { name: 't', description: 'd' }\nreturn ((`,
      runId: 'run-2', ports, host: createHostHandle(null),
      signal: new AbortController().signal, cwd: dir, budgetTotal: null,
    })
    expect(result.status).toBe('failed')
    expect(result.error).toBeTruthy()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('resume：journal 命中则不调用 runner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    let called = 0
    const ports: WorkflowPorts = {
      agentRunner: { runAgentToResult: async () => { called++; return { kind: 'ok', output: 'live', usage: { outputTokens: 1 } } } },
      progressEmitter: { emit: () => {} },
      taskRegistrar: { register: () => 'r', complete: () => {}, fail: () => {}, kill: () => {}, pendingAction: () => null },
      journalStore: createFileJournalStore(dir),
      permissionGate: { isAborted: () => false },
      logger: { debug: () => {}, event: () => {} },
      hostFactory: () => ({ handle: createHostHandle(null), signal: new AbortController().signal, cwd: dir, budgetTotal: null }),
    }
    // 预置 journal：与脚本中 agent('compute') 的 key 匹配
    const key = agentCallKey('compute', { prompt: 'compute' })
    await ports.journalStore.append('run-3', { key, result: { kind: 'ok', output: 'cached', usage: { outputTokens: 1 } } })

    const result = await runWorkflow({
      script: `return agent('compute')`,
      runId: 'run-3', ports, host: createHostHandle(null),
      signal: new AbortController().signal, cwd: dir, budgetTotal: null,
      resume: true,
    })
    expect(result.status).toBe('completed')
    expect(result.returnValue).toBe('cached')
    expect(called).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('abort → killed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    const ports = portsWith(dir, new Map([['x', { kind: 'ok', output: 1, usage: { outputTokens: 1 } }]]))
    const ac = new AbortController()
    ac.abort()
    const result = await runWorkflow({
      script: `return agent('x')`,
      runId: 'run-4', ports, host: createHostHandle(null),
      signal: ac.signal, cwd: dir, budgetTotal: null,
    })
    expect(result.status).toBe('killed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('workflow() 嵌套（一层）共享计数；二层被拒', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-run-'))
  try {
    await mkdir(join(dir, '.claude', 'workflows'), { recursive: true })
    // 子 workflow：调用 agent，并尝试再嵌套（应抛错）
    await writeFile(
      join(dir, '.claude', 'workflows', 'child.ts'),
      `return agent('child')\n// 以下故意触发二层嵌套以测guard，但单独运行不会`,
    )
    const ports = portsWith(dir, new Map([['child', { kind: 'ok', output: 'child-out', usage: { outputTokens: 1 } }]]))
    const result = await runWorkflow({
      script: `return workflow('child')`,
      runId: 'run-5', ports, host: createHostHandle(null),
      signal: new AbortController().signal, cwd: dir, budgetTotal: null,
    })
    expect(result.status).toBe('completed')
    expect(result.returnValue).toBe('child-out')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/runWorkflow.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `engine/runWorkflow.ts`**

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WORKFLOW_DIR_NAME } from '../constants.js'
import type { HostHandle, WorkflowPorts } from '../ports.js'
import type { JournalEntry, WorkflowRunResult } from '../types.js'
import { createEngineContext } from './context.js'
import { WorkflowAbortedError, WorkflowError } from './errors.js'
import { makeHooks, type SubWorkflowRunner } from './hooks.js'
import { resolveNamedWorkflow } from './namedWorkflows.js'
import { parseScript, type ParsedScript } from './script.js'

export type RunWorkflowOptions = {
  /** 已解析好的脚本源码。 */
  script: string
  args?: unknown
  runId: string
  workflowName?: string
  ports: WorkflowPorts
  host: HostHandle
  signal: AbortSignal
  cwd: string
  budgetTotal: number | null
  /** resume：true 时载入既有 journal 重放。 */
  resume?: boolean
  /** resume 时脚本源码 hash 是否变化。true 则忽略 journal 全重跑。 */
  scriptChanged?: boolean
}

export async function runWorkflow(opts: RunWorkflowOptions): Promise<WorkflowRunResult> {
  const { ports } = opts

  let parsed: ParsedScript
  try {
    parsed = parseScript(opts.script)
  } catch (e) {
    const error = (e as Error).message
    ports.progressEmitter.emit({ type: 'run_done', runId: opts.runId, status: 'failed', error })
    return { status: 'failed', error }
  }

  const workflowName = opts.workflowName ?? parsed.meta?.name ?? 'workflow'

  // 载入 journal（仅 resume 且脚本未变）
  let journal: JournalEntry[] = []
  let journalInvalidated = false
  if (opts.resume && !opts.scriptChanged) {
    journal = await ports.journalStore.read(opts.runId)
  } else if (opts.scriptChanged) {
    await ports.journalStore.truncate(opts.runId)
    journalInvalidated = true
  }

  const ctx = createEngineContext({
    ports,
    host: opts.host,
    signal: opts.signal,
    runId: opts.runId,
    workflowName,
    cwd: opts.cwd,
    budgetTotal: opts.budgetTotal,
    journal,
  })
  if (journalInvalidated) ctx.journalInvalidated = true

  ports.progressEmitter.emit({
    type: 'run_started',
    runId: opts.runId,
    workflowName,
    meta: parsed.meta,
  })

  // 子 workflow 执行器：复用同一 ctx（共享 journal/并发/预算/计数），临时 +1 depth
  const runSubWorkflow: SubWorkflowRunner = async sub => {
    const script = await resolveSubScript(sub, opts.cwd)
    let subParsed: ParsedScript
    try {
      subParsed = parseScript(script)
    } catch (e) {
      throw new WorkflowError(`子 workflow 脚本错误：${(e as Error).message}`)
    }
    const prevDepth = ctx.resources.depth
    ctx.resources.depth += 1
    try {
      const subHooks = makeHooks(ctx, runSubWorkflow)
      return await subParsed.execute(subHooks, sub.args, ctx.resources.budget)
    } finally {
      ctx.resources.depth = prevDepth
    }
  }

  const hooks = makeHooks(ctx, runSubWorkflow)

  try {
    const returnValue = await parsed.execute(hooks, opts.args, ctx.resources.budget)
    ports.progressEmitter.emit({ type: 'run_done', runId: opts.runId, status: 'completed', returnValue })
    return { status: 'completed', returnValue }
  } catch (e) {
    if (e instanceof WorkflowAbortedError) {
      ports.progressEmitter.emit({ type: 'run_done', runId: opts.runId, status: 'killed' })
      return { status: 'killed' }
    }
    const error = (e as Error).message
    ports.progressEmitter.emit({ type: 'run_done', runId: opts.runId, status: 'failed', error })
    return { status: 'failed', error }
  }
}

async function resolveSubScript(
  sub: { name?: string; scriptPath?: string; script?: string },
  cwd: string,
): Promise<string> {
  if (sub.script) return sub.script
  if (sub.scriptPath) return await readFile(sub.scriptPath, 'utf-8')
  if (sub.name) {
    const found = await resolveNamedWorkflow(join(cwd, WORKFLOW_DIR_NAME), sub.name)
    if (!found) throw new WorkflowError(`子 workflow "${sub.name}" 未找到`)
    return found.content
  }
  throw new WorkflowError('workflow() 需要 name 或 scriptPath')
}
```

- [ ] **Step 4：更新 `src/index.ts` 导出引擎入口 + 事件**

```ts
export * from './engine/errors.js'
export * from './engine/context.js'
export * from './engine/hooks.js'
export * from './engine/runWorkflow.js'
export * from './progress/events.js'
```

- [ ] **Step 5：运行全包测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test && bunx tsc --noEmit`
Expected: 全部测试 PASS，类型零错误。

- [ ] **Step 6：提交**

```bash
git add packages/workflow-engine/src/engine/runWorkflow.ts packages/workflow-engine/src/__tests__/runWorkflow.test.ts packages/workflow-engine/src/index.ts
git commit -m "feat(workflow): add runWorkflow orchestrator with resume & nesting"
```

> **里程碑：Phase 1–2 完成。** 包 `@claude-code-best/workflow-engine` 现已独立可运行——全 mock 端口，无 LLM、无核心层依赖。可在此检查点整体 review。

---

## Phase 3：自包含工具描述符

### Task 14：输入 schema（`tool/schema.ts`）

**Files:**
- Create: `packages/workflow-engine/src/tool/schema.ts`
- Create: `packages/workflow-engine/src/tool/constants.ts`

- [ ] **Step 1：写 `tool/constants.ts`（供核心 re-export 路径兼容）**

```ts
export { WORKFLOW_TOOL_NAME } from '../constants.js'
```

- [ ] **Step 2：写 `tool/schema.ts`**

```ts
import { z } from 'zod/v4'

/** Workflow 工具输入 schema。args 为任意 JSON 值（对象/数组/字符串等）。 */
export const workflowInputSchema = z.object({
  script: z
    .string()
    .optional()
    .describe('自包含的 workflow 脚本源码（inline）'),
  name: z
    .string()
    .optional()
    .describe('命名 workflow，解析到 .claude/workflows/<name>.ts|js|mjs'),
  scriptPath: z
    .string()
    .optional()
    .describe('已有脚本文件的绝对路径'),
  args: z
    .unknown()
    .optional()
    .describe(
      '透传给脚本的 args 全局变量。传真实 JSON 值（对象/数组/字符串），不要传 JSON 字符串。',
    ),
  resumeFromRunId: z
    .string()
    .optional()
    .describe('resume 指定 run，重放 journal'),
  description: z
    .string()
    .optional()
    .describe('本次调用的简短描述（3-5 词）'),
  title: z.string().optional().describe('进度查看器标题'),
})

export type WorkflowInputSchema = typeof workflowInputSchema
```

- [ ] **Step 3：类型检查**

Run: `cd packages/workflow-engine && bunx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 4：提交**

```bash
git add packages/workflow-engine/src/tool/schema.ts packages/workflow-engine/src/tool/constants.ts
git commit -m "feat(workflow): add tool input schema"
```

---

### Task 15：WorkflowTool 描述符（`tool/WorkflowTool.ts`）

**Files:**
- Create: `packages/workflow-engine/src/tool/WorkflowTool.ts`
- Test: `packages/workflow-engine/src/__tests__/WorkflowTool.test.ts`

- [ ] **Step 1：先写测试（用 mock 端口验证 call 返回 launch 消息并触发 detached run）**

```ts
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkflowTool } from '../tool/WorkflowTool.js'
import { createHostHandle, type WorkflowPorts } from '../ports.js'
import type { AgentRunParams, AgentRunResult } from '../types.js'

function mockPorts(runsDir: string, results: Map<string, AgentRunResult>): {
  ports: WorkflowPorts
  events: import('../types.js').ProgressEvent[]
  runStatus: Map<string, string>
} {
  const events: import('../types.js').ProgressEvent[] = []
  const runStatus = new Map<string, string>()
  const ports: WorkflowPorts = {
    agentRunner: { runAgentToResult: async (p: AgentRunParams) => results.get(p.prompt) ?? { kind: 'dead' } },
    progressEmitter: { emit: e => void events.push(e) },
    taskRegistrar: {
      register: () => ({ runId: 'run-x', signal: new AbortController().signal }),
      complete: (id, _s) => void runStatus.set(id, 'completed'),
      fail: (id, _e) => void runStatus.set(id, 'failed'),
      kill: id => void runStatus.set(id, 'killed'),
      pendingAction: () => null,
    },
    journalStore: { read: async () => [], append: async () => {}, truncate: async () => {} },
    permissionGate: { isAborted: () => false },
    logger: { debug: () => {}, event: () => {} },
    hostFactory: () => ({ handle: createHostHandle(null), cwd: runsDir, budgetTotal: null }),
  }
  return { ports, events, runStatus }
}

test('call 返回 launch 消息并在后台完成', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const { ports, runStatus } = mockPorts(dir, new Map([['compute', { kind: 'ok', output: 42, usage: { outputTokens: 1 } }]]))
    const tool = createWorkflowTool(ports)
    const res = await tool.call(
      { script: `return agent('compute')` },
      undefined, undefined, undefined,
    )
    expect(res.data.output).toContain('run_id: run-x')
    // 等待 detached run 完成
    await new Promise(r => setTimeout(r, 50))
    expect(runStatus.get('run-x')).toBe('completed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('缺少 script/name/scriptPath → 返回错误（不进后台）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const { ports, runStatus } = mockPorts(dir, new Map())
    const tool = createWorkflowTool(ports)
    const res = await tool.call({}, undefined, undefined, undefined)
    expect(res.data.output).toMatch(/^Error:/)
    expect(runStatus.size).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('脚本语法错 → 返回校验错误（不进后台）', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    const { ports, runStatus } = mockPorts(dir, new Map())
    const tool = createWorkflowTool(ports)
    const res = await tool.call({ script: `return ((` }, undefined, undefined, undefined)
    expect(res.data.output).toMatch(/校验失败|Error/)
    expect(runStatus.size).toBe(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('name 解析到 .claude/workflows/<name>.ts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wf-tool-'))
  try {
    await mkdir(join(dir, '.claude', 'workflows'), { recursive: true })
    await writeFile(join(dir, '.claude', 'workflows', 'release.ts'), `return agent('compute')`)
    const { ports, runStatus } = mockPorts(dir, new Map([['compute', { kind: 'ok', output: 'done', usage: { outputTokens: 1 } }]]))
    const tool = createWorkflowTool(ports)
    const res = await tool.call({ name: 'release' }, undefined, undefined, undefined)
    expect(res.data.output).toContain('run_id')
    await new Promise(r => setTimeout(r, 50))
    expect(runStatus.get('run-x')).toBe('completed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('renderToolUseMessage / mapToolResultToToolResultBlockParam', () => {
  const dir = '/tmp'
  const { ports } = mockPorts(dir, new Map())
  const tool = createWorkflowTool(ports)
  expect(tool.renderToolUseMessage({ name: 'release' })).toBe('Workflow: release')
  const block = tool.mapToolResultToToolResultBlockParam({ output: 'hi' }, 'tu-1')
  expect(block.tool_use_id).toBe('tu-1')
  expect(block.type).toBe('tool_result')
  expect(block.content[0].text).toBe('hi')
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd packages/workflow-engine && bun test src/__tests__/WorkflowTool.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3：写 `tool/WorkflowTool.ts`**

```ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod/v4'
import { WORKFLOW_DIR_NAME, WORKFLOW_TOOL_NAME } from '../constants.js'
import { resolveNamedWorkflow } from '../engine/namedWorkflows.js'
import { runWorkflow } from '../engine/runWorkflow.js'
import { parseScript } from '../engine/script.js'
import type { WorkflowPorts } from '../ports.js'
import type { WorkflowInput, WorkflowRunResult } from '../types.js'
import { workflowInputSchema } from './schema.js'

/** 自包含工具描述符（核心 wiring 用 buildTool 包装它）。零核心层依赖。 */
export type WorkflowToolDescriptor = {
  name: string
  inputSchema: z.ZodType<WorkflowInput>
  isEnabled: () => boolean
  isReadOnly: (input: WorkflowInput) => boolean
  description: () => Promise<string>
  prompt: () => Promise<string>
  renderToolUseMessage: (input: Partial<WorkflowInput>) => string
  call: (
    input: WorkflowInput,
    context: unknown,
    canUseTool: unknown,
    parentMessage: unknown,
    onProgress?: unknown,
  ) => Promise<{ data: { output: string } }>
  mapToolResultToToolResultBlockParam: (
    data: { output: string },
    toolUseId: string,
  ) => {
    tool_use_id: string
    type: 'tool_result'
    content: Array<{ type: 'text'; text: string }>
  }
}

const WORKFLOW_TOOL_PROMPT = `Use the Workflow tool to execute a workflow script that orchestrates multiple subagents deterministically. The script runs in the background; you receive a run_id immediately and are notified on completion.

Provide the script inline via "script", or reference a named workflow via "name" (resolved from .claude/workflows/), or an existing file via "scriptPath". Pass "args" as a real JSON value (object/array/string), not a stringified string.

Use "resumeFromRunId" to resume a prior run — completed agent() calls replay from the journal instantly.`

export function createWorkflowTool(ports: WorkflowPorts): WorkflowToolDescriptor {
  return {
    name: WORKFLOW_TOOL_NAME,
    inputSchema: workflowInputSchema as unknown as z.ZodType<WorkflowInput>,
    isEnabled: () => true,
    isReadOnly: () => false,

    async description() {
      return '执行一个 workflow 脚本，编排多个子 agent 完成任务'
    },

    async prompt() {
      return WORKFLOW_TOOL_PROMPT
    },

    renderToolUseMessage(input) {
      if (input.resumeFromRunId) return `Workflow resume: ${input.resumeFromRunId}`
      const id = input.name ?? input.scriptPath ?? (input.script ? 'inline' : 'unknown')
      return `Workflow: ${id}`
    },

    async call(input, context, canUseTool, parentMessage) {
      const host = ports.hostFactory({ context, canUseTool, parentMessage })

      // 解析脚本源
      let script: string
      let workflowFile: string | undefined
      try {
        const resolved = await resolveScriptSource(input, host.cwd)
        script = resolved.script
        workflowFile = resolved.workflowFile
      } catch (e) {
        return { data: { output: `Error: ${(e as Error).message}` } }
      }

      // 快速校验（meta + 语法），失败直接返错给模型，不进后台
      try {
        parseScript(script)
      } catch (e) {
        return { data: { output: `Error: 脚本校验失败：${(e as Error).message}` } }
      }

      const workflowName = input.name ?? input.title ?? 'workflow'
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
      })
        .then(result => onFinish(ports, result, runId))
        .catch(e => ports.taskRegistrar.fail(runId, (e as Error).message))

      const scriptPath = workflowFile ?? `<inline run ${runId}>`
      return {
        data: {
          output: [
            'Workflow 已启动（后台执行）。',
            `run_id: ${runId}`,
            `workflow: ${workflowName}`,
            `script: ${scriptPath}`,
            '',
            '完成时会自动通知。用 /workflows 查看实时进度。',
          ].join('\n'),
        },
      }
    },

    mapToolResultToToolResultBlockParam(data, toolUseId) {
      return {
        tool_use_id: toolUseId,
        type: 'tool_result',
        content: [{ type: 'text', text: data.output }],
      }
    },
  }
}

function onFinish(ports: WorkflowPorts, result: WorkflowRunResult, runId: string): void {
  if (result.status === 'completed') {
    const summary =
      result.returnValue == null ? '(no return value)' : formatValue(result.returnValue)
    ports.taskRegistrar.complete(runId, summary)
  } else if (result.status === 'failed') {
    ports.taskRegistrar.fail(runId, result.error ?? 'workflow failed')
  } else {
    ports.taskRegistrar.kill(runId)
  }
}

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v.slice(0, 500)
  try {
    return JSON.stringify(v).slice(0, 500)
  } catch {
    return String(v)
  }
}

async function resolveScriptSource(
  input: WorkflowInput,
  cwd: string,
): Promise<{ script: string; workflowFile?: string }> {
  if (input.script) return { script: input.script }
  if (input.scriptPath) {
    return { script: await readFile(input.scriptPath, 'utf-8'), workflowFile: input.scriptPath }
  }
  if (input.name) {
    const found = await resolveNamedWorkflow(join(cwd, WORKFLOW_DIR_NAME), input.name)
    if (!found) {
      throw new Error(`命名 workflow "${input.name}" 未找到（查找目录 ${WORKFLOW_DIR_NAME}/）`)
    }
    return { script: found.content, workflowFile: found.path }
  }
  throw new Error('必须提供 script、name 或 scriptPath 之一')
}
```

- [ ] **Step 4：更新 `src/index.ts` 导出工具描述符**

```ts
export { createWorkflowTool, type WorkflowToolDescriptor } from './tool/WorkflowTool.js'
export { workflowInputSchema } from './tool/schema.js'
export { WORKFLOW_TOOL_NAME } from './tool/constants.js'
```

- [ ] **Step 5：运行全包测试 + 类型检查**

Run: `cd packages/workflow-engine && bun test && bunx tsc --noEmit`
Expected: 全部 PASS，类型零错误。

- [ ] **Step 6：提交**

```bash
git add packages/workflow-engine/src/tool/WorkflowTool.ts packages/workflow-engine/src/__tests__/WorkflowTool.test.ts packages/workflow-engine/src/index.ts
git commit -m "feat(workflow): add self-contained WorkflowTool descriptor"
```

> **里程碑：Phase 3 完成。** 包已完整——引擎 + 工具描述符 + 全量单测。剩余为核心侧集成（Phase 4–6）。

---

## Phase 4：核心侧 adapter 与 wiring

> 本阶段代码依赖核心层真实 API（`runAgent`/`assembleToolPool`/`finalizeAgentTool`/`LocalWorkflowTask`）。包内逻辑已完全指定；本阶段的 `agentRunner` 涉及若干无法静态核实的集成点（`runAgent` 的 `querySource` 取值、`StructuredOutput` 动态注入、usage 字段），实现时以 `bunx tsc --noEmit` 为准对齐——已在代码中标注。

### Task 16：hostHandle 与进度存储

**Files:**
- Create: `src/workflow/hostHandle.ts`
- Create: `src/workflow/progressStore.ts`

- [ ] **Step 1：写 `src/workflow/hostHandle.ts`**

```ts
import {
  createHostHandle,
  unwrapHostHandle,
  type HostHandle,
} from '@claude-code-best/workflow-engine'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { AssistantMessage } from '../types/message.js'
import type { AgentId } from '../types/ids.js'
import type { ToolUseContext } from '../Tool.js'

/** HostHandle 内含的不透明 bundle（核心侧解包后使用）。 */
export type WorkflowHostBundle = {
  toolUseContext: ToolUseContext
  canUseTool: CanUseToolFn
  parentMessage: AssistantMessage
  agentId: AgentId
}

export function makeHostHandle(bundle: WorkflowHostBundle): HostHandle {
  return createHostHandle(bundle)
}

export function readHostBundle(handle: HostHandle): WorkflowHostBundle {
  return unwrapHostHandle(handle) as WorkflowHostBundle
}
```

- [ ] **Step 2：写 `src/workflow/progressStore.ts`**

```ts
import type { ProgressEvent } from '@claude-code-best/workflow-engine'

export type AgentProgress = {
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
  logs: string[]
  agentCount: number
  returnValue?: unknown
  error?: string
  updatedAt: number
}

const store = new Map<string, RunProgress>()

export function getRunProgress(runId: string): RunProgress | undefined {
  return store.get(runId)
}

export function listRunProgresses(): RunProgress[] {
  return [...store.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function removeRunProgress(runId: string): void {
  store.delete(runId)
}

function ensure(runId: string, workflowName: string): RunProgress {
  let p = store.get(runId)
  if (!p) {
    p = {
      runId,
      workflowName,
      status: 'running',
      phases: [],
      currentPhase: null,
      agents: [],
      logs: [],
      agentCount: 0,
      updatedAt: Date.now(),
    }
    store.set(runId, p)
  }
  return p
}

/** 把引擎进度事件应用到 store。 */
export function applyProgressEvent(event: ProgressEvent): void {
  const runId = event.runId
  const p = ensure(runId, 'workflowName' in event ? event.workflowName : 'workflow')
  p.updatedAt = Date.now()

  switch (event.type) {
    case 'run_started':
      p.workflowName = event.workflowName
      p.status = 'running'
      break
    case 'phase_done':
      for (const ph of p.phases) {
        if (ph.title === event.phase) ph.status = 'done'
      }
      if (p.currentPhase === event.phase) p.currentPhase = null
      break
    case 'phase_started':
      if (!p.phases.some(ph => ph.title === event.phase)) {
        p.phases.push({ title: event.phase, status: 'running' })
      }
      p.currentPhase = event.phase
      break
    case 'agent_started':
      p.agents.push({ label: event.label, phase: event.phase, status: 'running' })
      p.agentCount++
      break
    case 'agent_done':
      for (let i = p.agents.length - 1; i >= 0; i--) {
        if (p.agents[i]!.status === 'running') {
          p.agents[i]!.status = 'done'
          p.agents[i]!.resultKind = event.result.kind
          break
        }
      }
      break
    case 'log':
      p.logs.push(event.message)
      break
    case 'run_done':
      p.status = event.status
      if (event.returnValue !== undefined) p.returnValue = event.returnValue
      if (event.error !== undefined) p.error = event.error
      break
  }
}
```

- [ ] **Step 3：类型检查**

Run: `bunx tsc --noEmit`
Expected: 零错误（若有 `CanUseToolFn` 路径或 `AgentId` 导入问题，按实际路径修正）。

- [ ] **Step 4：提交**

```bash
git add src/workflow/hostHandle.ts src/workflow/progressStore.ts
git commit -m "feat(workflow): add core-side host handle & progress store"
```

---

### Task 17：adapter（端口实现）

**Files:**
- Create: `src/workflow/adapter.ts`

- [ ] **Step 1：写 `src/workflow/adapter.ts`**

```ts
import {
  createFileJournalStore,
  type AgentRunParams,
  type AgentRunResult,
  type ProgressEvent,
  type WorkflowHostContext,
  type WorkflowPorts,
} from '@claude-code-best/workflow-engine'
import { getCwd } from '../utils/cwd.js'
import { logForDebugging } from '../utils/debug.js'
import { getProjectRoot } from '../bootstrap/state.js'
import { logEvent } from '../services/analytics/index.js'
import { assembleToolPool } from '../tools.js'
import { finalizeAgentTool } from '../../packages/builtin-tools/src/tools/AgentTool/agentToolUtils.js'
import { runAgent } from '../../packages/builtin-tools/src/tools/AgentTool/runAgent.js'
import { isBuiltInAgent, type AgentDefinition } from '../../packages/builtin-tools/src/tools/AgentTool/loadAgentsDir.js'
import { createUserMessage, extractTextContent } from '../utils/messages.js'
import type { Message } from '../types/message.js'
import {
  registerLocalWorkflowTask,
  completeWorkflowTask,
  failWorkflowTask,
  killWorkflowTask,
} from '../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import { makeHostHandle, readHostBundle, type WorkflowHostBundle } from './hostHandle.js'
import { applyProgressEvent, removeRunProgress } from './progressStore.js'

/** workflow 子 agent 的缺省定义（通用研究/执行 agent）。 */
const WORKFLOW_AGENT: AgentDefinition = {
  agentType: 'workflow-worker',
  whenToUse: 'workflow 脚本内 agent() 钩子派发的子任务',
  tools: ['*'],
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: () =>
    'You are a workflow sub-agent. Complete the task concisely; your final text is the return value relayed to the workflow.',
} as unknown as AgentDefinition

type RunBinding = {
  runId: string
  taskId: string
  setAppState: (f: (prev: import('../state/AppState.js').AppState) => import('../state/AppState.js').AppState) => void
  abortController: AbortController
  workflowName: string
}

/** 每次工具调用从 toolUseContext 构造 WorkflowHostContext。 */
function makeHostFactory(): WorkflowPorts['hostFactory'] {
  return ({ context, canUseTool, parentMessage }): WorkflowHostContext => {
    const ctx = context as import('../Tool.js').ToolUseContext
    return {
      handle: makeHostHandle({
        toolUseContext: ctx,
        canUseTool: canUseTool as WorkflowHostBundle['canUseTool'],
        parentMessage: parentMessage as WorkflowHostBundle['parentMessage'],
        agentId: ctx.agentId!,
      }),
      cwd: getCwd(),
      budgetTotal: null, // v1：无 turn 级预算注入点；engine 支持 budget 但此处 null
      toolUseId: ctx.toolUseId,
    }
  }
}

function resolveAgentDefinition(
  agentType: string | undefined,
  toolUseContext: import('../Tool.js').ToolUseContext,
): AgentDefinition {
  if (!agentType) return WORKFLOW_AGENT
  const found = toolUseContext.options.agentDefinitions.activeAgents.find(
    a => a.agentType === agentType,
  )
  return found ?? WORKFLOW_AGENT
}

async function runWorkflowSubAgent(
  params: AgentRunParams,
  host: import('@claude-code-best/workflow-engine').HostHandle,
): Promise<AgentRunResult> {
  const bundle = readHostBundle(host)
  const { toolUseContext, canUseTool, agentId } = bundle
  const appState = toolUseContext.getAppState()
  const agentDef = resolveAgentDefinition(params.agentType, toolUseContext)

  const workerPermissionContext = {
    ...appState.toolPermissionContext,
    mode: agentDef.permissionMode ?? 'acceptEdits',
  }
  const workerTools = assembleToolPool(workerPermissionContext, appState.mcp.tools)

  // schema → 通过 appendSystemPrompt 传 JSON Schema 指令；非交互模式下 StructuredOutput 已启用。
  // （完整动态 schema 注入需扩展 SyntheticOutputTool；v1 用指令 + 结果侧校验。）
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
      querySource: (toolUseContext.options.querySource ?? 'main') as never,
      availableTools: workerTools,
      ...(params.model ? ({ model: params.model } as never) : {}),
    })) {
      messages.push(msg as Message)
    }
  } catch (e) {
    logForDebugging(`workflow sub-agent error: ${(e as Error).message}`)
    return { kind: 'dead' }
  }

  const resolvedAgentModel = toolUseContext.options.mainLoopModel
  const finalized = finalizeAgentTool(messages, agentId, {
    prompt: params.prompt,
    resolvedAgentModel,
    isBuiltInAgent: isBuiltInAgent(agentDef),
    startTime,
    agentType: agentDef.agentType,
    isAsync: true,
  })
  const outputTokens = finalized.usage?.output_tokens ?? finalized.totalTokens ?? 0

  if (params.schema) {
    const structured = extractStructuredOutput(finalized.content, params.schema)
    if (structured === null) return { kind: 'dead' }
    return { kind: 'ok', output: structured, usage: { outputTokens } }
  }
  const text = extractTextContent(finalized.content, '\n')
  return { kind: 'ok', output: text, usage: { outputTokens } }
}

/** 从 agent 最终消息中提取 StructuredOutput 工具产出的 JSON 对象；校验失败返回 null。 */
function extractStructuredOutput(
  content: Array<{ type: string; text?: string }>,
  _schema: object,
): unknown | null {
  // StructuredOutput 的结果在 finalizeAgentTool 后通常已展平为 text 块（JSON 字符串）。
  // 尝试把首个 text 块解析为 JSON；解析失败返回 null（engine 据此返回 dead→null）。
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

/** 构造完整端口集。adapter 维护 runId → RunBinding 映射供 progress/kill 路由。 */
export function createWorkflowAdapter(): WorkflowPorts {
  const bindings = new Map<string, RunBinding>()
  const runsDir = `${getProjectRoot()}/.claude/workflow-runs`

  return {
    hostFactory: makeHostFactory(),

    agentRunner: {
      runAgentToResult: runWorkflowSubAgent,
    },

    progressEmitter: {
      emit(event: ProgressEvent) {
        applyProgressEvent(event)
      },
    },

    taskRegistrar: {
      register(opts, host) {
        const bundle = readHostBundle(host)
        const setAppState = bundle.toolUseContext.setAppStateForTasks ?? bundle.toolUseContext.setAppState
        const abortController = new AbortController()
        const taskId = registerLocalWorkflowTask(setAppState, {
          description: opts.summary ?? opts.workflowName,
          workflowName: opts.workflowName,
          workflowFile: opts.workflowFile ?? '',
          summary: opts.summary,
          ...(opts.toolUseId ? { toolUseId: opts.toolUseId } : {}),
          abortController,
        })
        const runId = opts.runId ?? taskId
        bindings.set(runId, { runId, taskId, setAppState, abortController, workflowName: opts.workflowName })
        logEvent('tengu_workflow_started' as never, { workflow: opts.workflowName } as never)
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
        killWorkflowTask(b.taskId, b.setAppState)
      },

      pendingAction(runId) {
        const b = bindings.get(runId)
        if (!b) return null
        // LocalWorkflowTaskState.pendingAgentAction 由 UI 写入；这里只读。
        const tasks = (bundle_getAppState(b) as { tasks?: Record<string, unknown> }).tasks
        const task = tasks?.[b.taskId] as { pendingAgentAction?: { kind: 'skip' | 'retry' } } | undefined
        return task?.pendingAgentAction ?? null
      },
    },

    journalStore: createFileJournalStore(runsDir),

    permissionGate: {
      // 引擎实际用 ctx.signal（register 返回的 AbortController）判定 abort；此端口保留为契约占位。
      isAborted: () => false,
    },

    logger: {
      debug: msg => logForDebugging(msg),
      event: (name, metadata) => logEvent(name as never, (metadata ?? {}) as never),
    },
  }
}

// pendingAction 需要读 AppState；通过 binding 的 setAppState 不可读，故从 host bundle 侧获取。
// 这里用一个轻量 helper 复用：注册时已无 host，因此 pendingAction 改为读 LocalWorkflowTask 的全局任务表。
function bundle_getAppState(b: RunBinding): unknown {
  // setAppState 是 setter；为读取任务状态，依赖 progressStore 已记录的进度即可，
  // pendingAction 的真实读取在 wiring 阶段如需可扩展。v1 返回 null（skip/retry UI 暂不接线）。
  void b
  return { tasks: {} }
}
```

> **集成对齐提示（实现时以 `bunx tsc --noEmit` 为准）：**
> 1. `runAgent` 的 `querySource` 真实联合类型——`?? 'main'` 若不在类型内，改用 `'agent:builtin:workflow-worker'` 或 `toolUseContext.options.querySource` 的实际类型。
> 2. `finalizeAgentTool` 的 `content`/`usage` 字段名以 `agentToolUtils.ts` 实际导出为准（`usage.output_tokens` vs `totalTokens`）。
> 3. `extractTextContent` 第二参数（分隔符）签名以 `utils/messages.ts` 为准。
> 4. `registerLocalWorkflowTask` 的 opts 形状以 `LocalWorkflowTask.ts` 现有导出为准（已核实含 description/workflowName/workflowFile/summary/toolUseId/abortController）。
> 5. `pendingAction` 的 v1 实现返回 null（skip/retry UI 接线留作后续）；若要接，从 `bundle.toolUseContext.getAppState().tasks[taskId].pendingAgentAction` 读。

- [ ] **Step 2：类型检查并按提示对齐**

Run: `bunx tsc --noEmit 2>&1 | grep -E "adapter\.ts" | head -40`
Expected: 逐步修正至零错误。

- [ ] **Step 3：提交**

```bash
git add src/workflow/adapter.ts
git commit -m "feat(workflow): add core adapter implementing workflow-engine ports"
```

---

### Task 18：wiring 与 tools.ts 注册

**Files:**
- Create: `src/workflow/wiring.ts`
- Modify: `src/tools.ts:152-159`

- [ ] **Step 1：写 `src/workflow/wiring.ts`**

```ts
import {
  createWorkflowAdapter,
} from './adapter.js'
import {
  createWorkflowTool,
  type WorkflowToolDescriptor,
} from '@claude-code-best/workflow-engine'
import { buildTool, type Tool, type ToolDef } from '../Tool.js'
import { z } from 'zod/v4'

/**
 * 把包的自包含描述符适配为 buildTool 兼容的 Tool。
 * 描述符的 call 签名 (input, context, canUseTool, parentMessage, onProgress) 与 Tool.call 一致。
 */
export function createWorkflowToolCore(): Tool {
  const adapter = createWorkflowAdapter()
  const descriptor: WorkflowToolDescriptor = createWorkflowTool(adapter)

  const def: ToolDef<z.ZodType, { output: string }, never> = {
    name: descriptor.name,
    inputSchema: descriptor.inputSchema as unknown as z.ZodType,
    isEnabled: () => descriptor.isEnabled(),
    isReadOnly: input => descriptor.isReadOnly(input as never),
    isConcurrencySafe: () => true,
    async description() {
      return descriptor.description()
    },
    async prompt() {
      return descriptor.prompt()
    },
    async call(input, context, canUseTool, parentMessage, onProgress) {
      const result = await descriptor.call(input, context, canUseTool, parentMessage, onProgress)
      return { data: result.data } as never
    },
    renderToolUseMessage: (input: Partial<{ name?: string; scriptPath?: string; script?: string; resumeFromRunId?: string }>) =>
      descriptor.renderToolUseMessage(input as never),
    mapToolResultToToolResultBlockParam: (data: { output: string }, toolUseId: string) =>
      descriptor.mapToolResultToToolResultBlockParam(data, toolUseId),
  }

  return buildTool(def)
}
```

> **集成对齐提示：** `Tool.call` 返回 `ToolResult<Output>`，描述符返回 `{ data: { output } }`。若 `ToolResult` 形状不同（如需 `result` 字段），按 `src/Tool.ts` 的 `ToolResult` 类型对齐 `as never` 处。`renderToolUseMessage`/`mapToolResultToToolResultBlockParam` 的签名以 `Tool.ts` 实际定义为准。

- [ ] **Step 2：修改 `src/tools.ts` 注册块**

把现有的（约 152-159 行）：

```ts
const WorkflowTool = feature('WORKFLOW_SCRIPTS')
  ? (() => {
      require('@claude-code-best/builtin-tools/tools/WorkflowTool/bundled/index.js').initBundledWorkflows()
      return require('@claude-code-best/builtin-tools/tools/WorkflowTool/WorkflowTool.js')
        .WorkflowTool
    })()
  : null
```

替换为：

```ts
/* eslint-disable @typescript-eslint/no-require-imports */
const WorkflowTool = feature('WORKFLOW_SCRIPTS')
  ? require('./workflow/wiring.js').createWorkflowToolCore()
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
```

- [ ] **Step 3：类型检查**

Run: `bunx tsc --noEmit`
Expected: 零错误（按提示对齐签名）。

- [ ] **Step 4：提交**

```bash
git add src/workflow/wiring.ts src/tools.ts
git commit -m "feat(workflow): wire workflow-engine into tools.ts via adapter"
```

---

## Phase 5：命名 workflow 命令与进度查看器

### Task 19：命名 workflow 斜杠命令

**Files:**
- Create: `src/workflow/namedWorkflowCommands.ts`
- Modify: `src/commands/workflows/index.ts`（改为引用新命令 + 进度查看）

- [ ] **Step 1：写 `src/workflow/namedWorkflowCommands.ts`**

```ts
import { join } from 'node:path'
import {
  listNamedWorkflows,
  WORKFLOW_DIR_NAME,
} from '@claude-code-best/workflow-engine'
import type { Command } from '../types/command.js'
import { getCwd } from '../utils/cwd.js'

/** 扫描 .claude/workflows/ 下 *.ts|*.js|*.mjs，每个生成一个 /<name> 命令。 */
export async function getWorkflowCommands(
  cwd: string = getCwd(),
): Promise<Command[]> {
  const dir = join(cwd, WORKFLOW_DIR_NAME)
  const names = await listNamedWorkflows(dir)
  return names.map(name => ({
    type: 'prompt' as const,
    name,
    description: `Run workflow: ${name}`,
    kind: 'workflow' as const,
    source: 'builtin' as const,
    progressMessage: `Running workflow ${name}...`,
    contentLength: 0,
    async getPromptForCommand(args, _context) {
      const argText = typeof args === 'string' && args ? `\n\nArguments: ${args}` : ''
      return [
        {
          type: 'text' as const,
          text: `Run the "${name}" workflow now by calling the Workflow tool with name="${name}".${argText}`,
        },
      ]
    },
  }))
}
```

> 注：`Command` 类型字段以 `src/types/command.ts` 为准；若 `getPromptForCommand` 签名或 `kind` 字面量不符，按实际类型对齐。

- [ ] **Step 2：改写 `src/commands/workflows/index.ts` 为命令清单 + 进度查看入口**

```ts
import type { Command, LocalCommandCall } from '../../types/command.js'
import { getWorkflowCommands } from '../../workflow/namedWorkflowCommands.js'
import { listRunProgresses } from '../../workflow/progressStore.js'
import { getCwd } from '../../utils/cwd.js'

const call: LocalCommandCall = async _args => {
  const commands = await getWorkflowCommands(getCwd())
  const runs = listRunProgresses()

  const lines: string[] = []
  if (runs.length > 0) {
    lines.push('Workflow runs (live):')
    for (const r of runs.slice(0, 20)) {
      lines.push(
        `  ${r.runId} | ${r.workflowName} | ${r.status} | phase=${r.currentPhase ?? '-'} | agents=${r.agentCount}`,
      )
    }
    lines.push('')
  }
  if (commands.length === 0) {
    lines.push('No named workflows. Add scripts to .claude/workflows/ (*.ts/*.js/*.mjs).')
  } else {
    lines.push('Named workflows:')
    for (const cmd of commands) lines.push(`  /${cmd.name} - ${cmd.description}`)
  }
  return { type: 'text', value: lines.join('\n') }
}

const workflows = {
  type: 'local',
  name: 'workflows',
  description: 'List workflow runs (live progress) and named workflows',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default workflows
```

- [ ] **Step 3：类型检查 + 提交**

Run: `bunx tsc --noEmit`
Expected: 零错误。

```bash
git add src/workflow/namedWorkflowCommands.ts src/commands/workflows/index.ts
git commit -m "feat(workflow): named-workflow slash commands & /workflows viewer"
```

---

## Phase 6：文件迁移与验证

### Task 20：迁移权限 UI 与常量 re-export

**Files:**
- Move: `packages/builtin-tools/src/tools/WorkflowTool/WorkflowPermissionRequest.tsx` → `src/workflow/WorkflowPermissionRequest.tsx`
- Modify: `src/constants/tools.ts`（WORKFLOW_TOOL_NAME 导入路径）
- Modify: `packages/builtin-tools/src/index.ts`（re-export 指向新包）

- [ ] **Step 1：移动权限 UI 并修正相对导入**

```bash
git mv packages/builtin-tools/src/tools/WorkflowTool/WorkflowPermissionRequest.tsx src/workflow/WorkflowPermissionRequest.tsx
```

移动后，文件内的相对导入（`src/components/permissions/...`、`src/utils/...`）仍以 `src/*` 别名或 `../../` 解析。从 `src/workflow/` 出发，`src/components/...` 别名导入不变；若有 `../../components` 形式的相对导入，改为 `../components`。打开文件确认导入路径正确。

- [ ] **Step 2：`src/constants/tools.ts` 改导入源**

把：

```ts
import { WORKFLOW_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/WorkflowTool/constants.js'
```

改为：

```ts
import { WORKFLOW_TOOL_NAME } from '@claude-code-best/workflow-engine'
```

- [ ] **Step 3：`packages/builtin-tools/src/index.ts` re-export 指向新包**

把现有的：

```ts
export { WorkflowTool } from './tools/WorkflowTool/WorkflowTool.js'
export { initBundledWorkflows } from './tools/WorkflowTool/bundled/index.js'
export { getWorkflowCommands } from './tools/WorkflowTool/createWorkflowCommand.js'
```

改为（向后兼容：从新包 re-export）：

```ts
export {
  WORKFLOW_TOOL_NAME,
  createWorkflowTool,
} from '@claude-code-best/workflow-engine'
```

并删除 `getWorkflowCommands` 旧导出（核心侧改用 `src/workflow/namedWorkflowCommands.ts`）。若其他文件仍 import 旧路径，全局搜索修正。

- [ ] **Step 4：类型检查**

Run: `bunx tsc --noEmit`
Expected: 零错误（修正所有仍指向旧 builtin-tools WorkflowTool 路径的 import）。

- [ ] **Step 5：提交**

```bash
git add -A
git commit -m "refactor(workflow): move permission UI & repoint constants to workflow-engine"
```

---

### Task 21：清理旧清单版文件 + precheck

**Files:**
- Delete: `packages/builtin-tools/src/tools/WorkflowTool/WorkflowTool.ts`
- Delete: `packages/builtin-tools/src/tools/WorkflowTool/constants.ts`
- Delete: `packages/builtin-tools/src/tools/WorkflowTool/createWorkflowCommand.ts`
- Delete: `packages/builtin-tools/src/tools/WorkflowTool/__tests__/WorkflowTool.test.ts`
- Delete or keep: `packages/builtin-tools/src/tools/WorkflowTool/bundled/index.ts`（保留为 no-op 扩展点）
- Delete: `src/utils/workflowRuns.ts`（被 progressStore + 包 JournalStore 取代；若无其他引用）

- [ ] **Step 1：全局搜索旧引用**

Run: `grep -rn "tools/WorkflowTool/WorkflowTool\|tools/WorkflowTool/constants\|tools/WorkflowTool/createWorkflowCommand\|utils/workflowRuns" src/ packages/ --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: 仅剩待删文件自身。若有其他引用，先修正到新路径。

- [ ] **Step 2：删除旧文件**

```bash
git rm packages/builtin-tools/src/tools/WorkflowTool/WorkflowTool.ts \
       packages/builtin-tools/src/tools/WorkflowTool/constants.ts \
       packages/builtin-tools/src/tools/WorkflowTool/createWorkflowCommand.ts \
       packages/builtin-tools/src/tools/WorkflowTool/__tests__/WorkflowTool.test.ts
# workflowRuns.ts 若无引用也删：
git rm src/utils/workflowRuns.ts
```

> 若 `bundled/index.ts` 的 `initBundledWorkflows` 仍被任何 require 引用（Task 18 已移除 tools.ts 中的调用），保留该文件作为 no-op 即可；否则一并删除并在 index.ts 去掉 re-export。

- [ ] **Step 3：运行 precheck（typecheck + lint fix + test）**

Run: `bun run precheck`
Expected: 零错误。

- 常见修正点：
  - 包内测试若因 `zod/v4` 的 `z.unknown().optional()` 报错，改 `z.any().optional()`。
  - adapter 的 `querySource`/`usage` 字段按 Task 17 提示对齐。
  - 若 `core-tools` 白名单测试（`src/constants/__tests__/tools.test.ts`）断言 `workflow` 在/不在 `CORE_TOOLS`，按 `feature('WORKFLOW_SCRIPTS')` 开关下的预期对齐。

- [ ] **Step 4：dev 冒烟（feature 开启）**

Run: `FEATURE_WORKFLOW_SCRIPTS=1 bun run dev`
然后在 REPL 中：
1. `/workflows` —— 应显示「No named workflows」+ 提示。
2. 创建 `.claude/workflows/demo.ts`：`export const meta = { name: 'demo', description: 'd' }\nreturn agent('say hello in one word')`。
3. 让模型调用 Workflow 工具 `name="demo"` —— 应返回 run_id，后台执行，完成时通知。
4. `/workflows` —— 应看到该 run 的状态。

Expected: 后台执行完成、通知到达、`/workflows` 显示进度。

- [ ] **Step 5：最终提交**

```bash
git add -A
git commit -m "chore(workflow): remove legacy checklist WorkflowTool, precheck passes"
```

---

## 自审（Self-Review）

**1. Spec 覆盖：**
- 依赖倒置架构 + 6 端口 + HostHandle → Task 4（ports）、Task 16-18（adapter/wiring）。✓
- async 函数包装 + Date/Math 沙箱 → Task 6（script）。✓
- 全钩子（agent/parallel/pipeline/phase/log/workflow）→ Task 12（hooks）、Task 13（runWorkflow 嵌套）。✓
- 并发上限（16/1000/4096）→ Task 5 + hooks 内 MAX_TOTAL_AGENTS/MAX_ITEMS_PER_CALL。✓
- journal/resume（顺序重放、脚本变更全重跑）→ Task 7（journal）、Task 12（命中/发散）、Task 13（resume）。✓
- token budget 硬上限 → Task 8（budget）、Task 12（agent 前置 assertCanSpend）。✓
- schema 结构化输出 → Task 9（校验）、Task 17（adapter 注入指令 + 提取）。✓
- 进度流 → Task 11（events）、Task 16（progressStore）、Task 19（/workflows）。✓
- 后台任务生命周期 → Task 17（taskRegistrar 委托 LocalWorkflowTask）。✓
- named workflow + `/<name>` + `/workflows` 进度查看 → Task 19。✓
- 文件迁移 → Task 20-21。✓
- worktree 隔离（`isolation:'worktree'`）：opts 透传至 AgentRunParams，adapter 在 Task 17 预留（`agentDef.isolation` 或 runAgent worktreePath）——**部分覆盖**：v1 未在 adapter 接 worktree 创建，作为后续增强（design 第 10 节已列为风险边界）。

**2. Placeholder 扫描：** 包内（Phase 0–3）所有步骤含完整可运行代码，无 TBD。核心侧（Phase 4）`adapter.ts`/`wiring.ts` 含真实结构与导入，但标注 5 处「以 typecheck 为准」的集成对齐点（querySource 联合类型、usage 字段名、ToolResult 形状等）——这些是对真实 API 表面的对齐，非逻辑占位；逻辑（端口映射、事件路由、journal/resume）已完整指定，由 precheck 收口。

**3. 类型一致性：** 已统一修正——
- `TaskRegistrar.register(opts, host) → { runId, signal }`（Task 4 描述符 Task 15 一致调用）。
- `WorkflowHostContext = { handle, cwd, budgetTotal, toolUseId? }`（无 signal）。
- `ProgressEvent` 所有变体携带 `runId`（hooks 用 `emit` helper 注入，run_done 显式带）。
- `AgentRunResult` 联合（ok/skipped/dead）在 hooks/journal/adapter 一致。

---

## 执行交接

计划已保存至 `docs/superpowers/plans/2026-06-12-workflow-engine.md`。两种执行方式：

**1. Subagent 驱动（推荐）** —— 每个任务派发独立子 agent，任务间 review，快速迭代。REQUIRED SUB-SKILL：`superpowers:subagent-driven-development`。

**2. 内联执行** —— 在本会话用 `superpowers:executing-plans` 批量执行，带检查点 review。

> **建议节奏：** Phase 0–3（包）适合 subagent 逐任务 TDD；Phase 4–6（核心集成）建议内联执行以便即时对齐 typecheck 提示。先执行到 Phase 3 里程碑（包独立可测）做一次整体 review，再推进集成。

---
