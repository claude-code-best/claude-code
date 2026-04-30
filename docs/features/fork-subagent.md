# FORK_SUBAGENT — 上下文继承子 Agent

> Feature Flag: `FEATURE_FORK_SUBAGENT=1`
> 实现状态：完整可用
> 引用数：4

## 一、功能概述

FORK_SUBAGENT 让 AgentTool 生成"fork 子 agent"，继承父级完整对话上下文。子 agent 看到父级的所有历史消息、工具集和系统提示，并且与父级共享 API 请求前缀以最大化 prompt cache 命中率。

### 核心优势

- **Prompt Cache 最大化**：多个并行 fork 共享相同的 API 请求前缀，只有最后的 directive 文本块不同
- **上下文完整性**：子 agent 继承父级的完整对话历史（包括 thinking config）
- **权限冒泡**：子 agent 的权限提示上浮到父级终端显示
- **Worktree 隔离**：支持 git worktree 隔离，子 agent 在独立分支工作

## 二、用户交互

### 触发方式

当 `FORK_SUBAGENT` 启用时，AgentTool 调用不指定 `subagent_type` 时自动走 fork 路径：

```
// Fork 路径（继承上下文）
Agent({ prompt: "修复这个 bug" })  // 无 subagent_type

// 普通 agent 路径（全新上下文）
Agent({ subagent_type: "general-purpose", prompt: "..." })
```

### /fork 命令

注册了 `/fork` 斜杠命令（当前为 stub）。当 FORK_SUBAGENT 开启时，`/branch` 命令失去 `fork` 别名，避免冲突。

## 三、实现架构

### 3.1 门控与互斥

文件：`packages/builtin-tools/src/tools/AgentTool/forkSubagent.ts:32-39`

```ts
export function isForkSubagentEnabled(): boolean {
  if (feature('FORK_SUBAGENT')) {
    if (isCoordinatorMode()) return false   // Coordinator 有自己的委派模型
    if (getIsNonInteractiveSession()) return false  // pipe/SDK 模式禁用
    return true
  }
  return false
}
```

### 3.2 FORK_AGENT 定义

```ts
export const FORK_AGENT = {
  agentType: 'fork',
  tools: ['*'],              // 通配符：使用父级完整工具集
  maxTurns: 200,
  model: 'inherit',          // 继承父级模型
  permissionMode: 'bubble',  // 权限冒泡到父级终端
  getSystemPrompt: () => '', // 不使用：直接传递父级已渲染 prompt
}
```

### 3.3 核心调用流程

```
AgentTool.call({ prompt, name })
      │
      ▼
isForkSubagentEnabled() && !subagent_type?
      │
      ├── No → 普通 agent 路径
      │
      └── Yes → Fork 路径
            │
            ▼
      递归防护检查
      ├── querySource === 'agent:builtin:fork' → 拒绝
      └── isInForkChild(messages) → 拒绝
            │
            ▼
      获取父级 system prompt
      ├── toolUseContext.renderedSystemPrompt（首选）
      └── buildEffectiveSystemPrompt（回退）
            │
            ▼
      buildForkedMessages(prompt, assistantMessage)
      ├── 克隆父级 assistant 消息
      ├── 生成占位符 tool_result
      └── 附加 directive 文本块
            │
            ▼
      [可选] buildWorktreeNotice()
            │
            ▼
      runAgent({
        useExactTools: true,
        override.systemPrompt: 父级,
        forkContextMessages: 父级消息,
        availableTools: 父级工具,
      })
```

### 3.4 消息构建：buildForkedMessages

文件：`packages/builtin-tools/src/tools/AgentTool/forkSubagent.ts:107-169`

构建的消息结构：

```
[
  ...history (filterIncompleteToolCalls),  // 父级完整历史
  assistant(所有 tool_use 块),              // 父级当前 turn 的 assistant 消息
  user(
    占位符 tool_result × N +               // 相同占位符文本
    <fork-boilerplate> directive           // 每个 fork 不同
  )
]
```

**所有 fork 使用相同的占位符文本**：`"Fork started — processing in background"`。这确保多个并行 fork 的 API 请求前缀完全一致，最大化 prompt cache 命中。

### 3.5 递归防护

两层检查防止 fork 嵌套：

1. **querySource 检查**：`toolUseContext.options.querySource === 'agent:builtin:fork'`。在 `context.options` 上设置，抗自动压缩（autocompact 只重写消息不改 options）
2. **消息扫描**：`isInForkChild()` 扫描消息历史中的 `<fork-boilerplate>` 标签

### 3.6 Worktree 隔离通知

当 fork + worktree 组合时，追加通知告知子 agent：

> "你继承了父 agent 在 `{parentCwd}` 的对话上下文，但你在独立的 git worktree `{worktreeCwd}` 中操作。路径需要转换，编辑前重新读取。"

### 3.7 强制异步

当 `isForkSubagentEnabled()` 为 true 时，所有 agent 启动都强制异步。`run_in_background` 参数从 schema 中移除。统一通过 `<task-notification>` XML 消息交互。

## 四、Prompt Cache 优化

这是整个 fork 设计的核心优化目标：

| 优化点 | 实现 |
|--------|------|
| **相同 system prompt** | 直传 `renderedSystemPrompt`，避免重新渲染（GrowthBook 状态可能不一致） |
| **相同工具集** | `useExactTools: true` 直接使用父级工具，不经过 `resolveAgentTools` 过滤 |
| **相同 thinking config** | 继承父级 thinking 配置（非 fork agent 默认禁用 thinking） |
| **相同占位符结果** | 所有 fork 使用 `FORK_PLACEHOLDER_RESULT` 相同文本 |
| **ContentReplacementState 克隆** | 默认克隆父级替换状态，保持 wire prefix 一致 |

## 五、子 Agent 指令

`buildChildMessage()` 生成 `<fork-boilerplate>` 包裹的指令：

- 你是 fork worker，不是主 agent
- 禁止再次 spawn sub-agent（直接执行）
- 不要闲聊、不要元评论
- 直接使用工具
- 修改文件后要 commit，报告 commit hash
- 报告格式：`Scope:` / `Result:` / `Key files:` / `Files changed:` / `Issues:`

## 六、关键设计决策

1. **Fork ≠ 普通 agent**：fork 继承完整上下文，普通 agent 从零开始。选择依据是 `subagent_type` 是否存在
2. **renderedSystemPrompt 直传**：避免 fork 时重新调用 `getSystemPrompt()`。父级在 turn 开始时冻结 prompt 字节
3. **占位符结果共享**：多个并行 fork 使用完全相同的占位符，只有 directive 不同
4. **Coordinator 互斥**：Coordinator 模式下禁用 fork，两者有不兼容的委派模型
5. **非交互式禁用**：pipe 模式和 SDK 模式下禁用，避免不可见的 fork 嵌套

## 七、使用方式

```bash
# 启用 feature
FEATURE_FORK_SUBAGENT=1 bun run dev

# 在 REPL 中使用（不指定 subagent_type 即走 fork）
# Agent({ prompt: "研究这个模块的结构" })
# Agent({ prompt: "实现这个功能" })
```

## 八、文件索引

| 文件 | 行数 | 职责 |
|------|------|------|
| `packages/builtin-tools/src/tools/AgentTool/forkSubagent.ts` | ~210 | 核心定义 + 消息构建 + 递归防护 |
| `packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx` | — | Fork 路由 + 强制异步 |
| `packages/builtin-tools/src/tools/AgentTool/prompt.ts` | — | "When to Fork" 提示词段落 |
| `packages/builtin-tools/src/tools/AgentTool/runAgent.ts` | — | useExactTools 路径 |
| `packages/builtin-tools/src/tools/AgentTool/resumeAgent.ts` | — | Fork agent 恢复 |
| `src/constants/xml.ts` | — | XML 标签常量 |
| `src/utils/forkedAgent.ts` | — | CacheSafeParams + ContentReplacementState 克隆 |
| `src/commands/fork/index.ts` | — | /fork 命令（stub） |
