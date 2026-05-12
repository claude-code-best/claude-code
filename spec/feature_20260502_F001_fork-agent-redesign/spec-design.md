# Feature: 20260502_F001 - fork-agent-redesign

## 需求背景

当前 `FORK_SUBAGENT` feature flag 是一个"一刀切"开关，启用时同时强制三件事：

1. 所有省略 `subagent_type` 的 agent 调用隐式走 fork 路径（继承父级完整上下文和模型）
2. 所有 agent spawn 强制异步（`forceAsync` 绑定在 `isForkSubagentEnabled()` 上）
3. prompt 引导模型优先省略 `subagent_type`，导致大部分 agent 都用同等级模型（贵）

这导致探索任务被迫使用与父级相同的模型（而非 haiku），token 消耗大增。因此该 flag 在 `defines.ts` 中被注释禁用。

## 目标

- 将 fork 从隐式行为改为**显式参数触发**（`fork: true`）
- FORK_SUBAGENT flag 只控制 fork 能力的可用性，**不再影响 `forceAsync` 等其他行为**
- 模型始终继承父级（保持现有行为）
- **完全向后兼容**——不传 `fork` 参数时行为与当前（flag 关闭时）一致

## 方案设计

### Schema 变更

Agent tool 参数新增 `fork?: boolean`，仅在 `FORK_SUBAGENT` flag 启用时可见（schema 动态裁剪，复用现有的 schema memo 模式）。

```ts
// inputSchema 中新增
fork: z.boolean().optional().describe(
  'Set to true to fork from the parent conversation context. '
  'The child inherits full history, system prompt, and model. '
  'Requires FORK_SUBAGENT feature flag.'
)
```

flag 关闭时，schema 通过 `.omit({ fork: true })` 裁剪掉该字段（与当前 `run_in_background` 的裁剪方式一致）。

### 路由逻辑重构

`AgentTool.tsx` call() 中的路由从当前的隐式判断：

```ts
// 旧行为：省略 subagent_type → fork（flag 开启时）
const effectiveType = subagent_type ?? (isForkSubagentEnabled() ? undefined : GENERAL_PURPOSE_AGENT.agentType);
const isForkPath = effectiveType === undefined;
```

改为显式参数触发：

```ts
// 新行为：显式 fork 参数触发，fork 优先级高于 subagent_type
const isForkPath = input.fork === true && isForkSubagentEnabled();
const effectiveType = subagent_type ?? GENERAL_PURPOSE_AGENT.agentType;
```

#### 决策表

| `fork` | `subagent_type` | flag 开 | 结果 |
|--------|----------------|---------|------|
| `true` | 有值 | 是 | fork 路径，**忽略 subagent_type** |
| `true` | 省略 | 是 | fork 路径（继承上下文） |
| `true` | * | 否 | 忽略 fork，走 subagent_type 或 general-purpose |
| `false`/省略 | 有值 | * | 走指定 agent 类型（原有行为） |
| `false`/省略 | 省略 | * | 走 general-purpose（原有行为） |

核心原则：**`fork: true` 是最高优先级**（当 flag 开启时），但 flag 关闭时静默降级，不影响原有行为。

### 后台运行由参数决定

fork agent 是否后台运行由 `run_in_background` 参数决定，与普通 agent 一致。`forceAsync` 不再绑定 `isForkSubagentEnabled()`：

```ts
// forceAsync 不再受 isForkSubagentEnabled() 影响
const forceAsync = /* 其他条件（coordinator, assistant mode 等）*/;
```

fork agent 与普通 agent 使用相同的 `run_in_background` 参数判断逻辑：
- `run_in_background: true` → 后台异步运行
- `run_in_background: false` / 省略 → 同步阻塞运行

### prompt 调整

移除引导模型"省略 subagent_type 以触发 fork"的 prompt 文本。改为说明 `fork: true` 的适用场景：

> When you need to delegate work that benefits from full conversation context (e.g., continuing a multi-file refactor where the child needs the same system prompt and history), use `fork: true`. For most tasks, prefer specialized agent types (Explore, Plan, general-purpose).

### isForkSubagentEnabled() 精简

函数签名和行为保持不变，但调用方语义改变：从"隐式路由判断"变为"参数校验门控"。

```ts
export function isForkSubagentEnabled(): boolean {
  if (!feature('FORK_SUBAGENT')) return false;
  if (isCoordinatorMode()) return false;
  if (getIsNonInteractiveSession()) return false;
  return true;
}
```

### 不变的部分

以下保持不变，无需修改：

- `buildForkedMessages()` — fork 消息构建逻辑
- `isInForkChild()` — 递归 fork 防护
- `FORK_AGENT` — fork agent 定义（model: 'inherit', permissionMode: 'bubble'）
- `buildChildMessage()` — fork 子 agent 指令模板
- `buildWorktreeNotice()` — worktree 隔离通知

## 实现要点

1. **Schema 动态裁剪**：`inputSchema` memo 中根据 `isForkSubagentEnabled()` 决定是否 `.omit({ fork: true })`，flag 关闭时字段不存在于 schema
2. **省略 `subagent_type` 恢复原有行为**：不再隐式走 fork，恢复为 `GENERAL_PURPOSE_AGENT`
3. **`defines.ts` 注释更新**：`FORK_SUBAGENT` 保持注释状态，但描述更新为新行为（显式参数触发，不影响探索任务模型选择）
4. **递归 fork 防护**：保持现有 `isInForkChild()` + `querySource` 双重检测

### 涉及文件

| 文件 | 改动 |
|------|------|
| `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` | 新增 `fork` 参数解析，路由逻辑重构，forceAsync 解耦 |
| `packages/builtin-tools/src/tools/AgentTool/prompt.ts` | 移除隐式 fork 引导，新增 `fork: true` 使用场景说明 |
| `scripts/defines.ts` | 更新 `FORK_SUBAGENT` 注释描述 |

## 验收标准

- [ ] `fork: true` + `FORK_SUBAGENT` 启用 → 走 fork 路径，继承父级上下文和模型
- [ ] `fork: true` + `subagent_type` 有值 + flag 开 → fork 路径，忽略 subagent_type
- [ ] `fork: true` + `FORK_SUBAGENT` 关闭 → 忽略 fork，走普通 agent 路径
- [ ] 不传 `fork` 参数 → 行为与当前 flag 关闭时完全一致（走 general-purpose 或指定 subagent_type）
- [ ] `forceAsync` 不再因 `isForkSubagentEnabled()` 而全局生效
- [ ] fork 子 agent 的后台/同步行为由 `run_in_background` 参数控制，与普通 agent 一致
- [ ] `bun run precheck` 零错误通过
