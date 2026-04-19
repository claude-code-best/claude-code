# MCP_SKILLS — MCP 技能发现

> Feature Flag: `FEATURE_MCP_SKILLS=1`
> 实现状态：功能性实现（config 门控筛选器完整，核心 fetcher 为 stub）
> 引用数：9

## 一、功能概述

MCP_SKILLS 将 MCP 服务器暴露的资源（`skill://` URI 方案）发现并转换为可调用的技能命令。MCP 服务器可以同时提供 tools、prompts 和 resources；启用此 feature 后，带有 `skill://` URI 的资源被识别为技能。

### 核心特性

- **自动发现**：MCP 服务器连接时自动获取 `skill://` 资源
- **命令转换**：将 MCP 资源转换为 `prompt` 类型的 Command 对象
- **实时刷新**：prompts/resources 列表变化时重新获取技能
- **缓存一致性**：连接关闭时清除技能缓存

## 二、实现架构

### 2.1 数据流

```
MCP Server 连接
      │
      ▼
client.ts: connectToServer / setupMcpClientConnections
  ├── fetchToolsForClient     (MCP tools)
  ├── fetchCommandsForClient   (MCP prompts → Command 对象)
  ├── fetchMcpSkillsForClient  (MCP skill:// 资源 → Command 对象) [MCP_SKILLS]
  └── fetchResourcesForClient  (MCP resources)
      │
      ▼
commands = [...mcpPrompts, ...mcpSkills]
      │
      ▼
AppState.mcp.commands 更新
      │
      ▼
getMcpSkillCommands() 过滤 → SkillTool 调用
```

### 2.2 技能筛选

文件：`src/commands.ts:604-616`

`getMcpSkillCommands(mcpCommands)` 过滤条件：

```ts
cmd.type === 'prompt'                  // 必须是 prompt 类型
cmd.loadedFrom === 'mcp'               // 必须来自 MCP 服务器
!cmd.disableModelInvocation            // 必须可由模型调用
feature('MCP_SKILLS')                  // feature flag 必须开启
```

### 2.3 条件加载

文件：`src/services/mcp/client.ts:129-133`

`fetchMcpSkillsForClient` 通过 `require()` 条件加载，feature flag 关闭时不加载任何模块：

```ts
const fetchMcpSkillsForClient = feature('MCP_SKILLS')
  ? require('../../skills/mcpSkills.js').fetchMcpSkillsForClient
  : null
```

### 2.4 缓存管理

技能获取函数维护 `.cache`（Map），在以下时机清除：

| 事件 | 行为 |
|------|------|
| 连接关闭 | 清除该 client 的技能缓存 |
| `disconnectMcpServer()` | 清除技能缓存 |
| `prompts/list_changed` 通知 | 刷新 prompts + 并行获取技能 |
| `resources/list_changed` 通知 | 刷新 resources + prompts + 技能 |

### 2.5 集成点

| 文件 | 行 | 说明 |
|------|------|------|
| `src/commands.ts` | 604-616, 620-633 | 命令过滤和 SkillTool 命令收集 |
| `src/services/mcp/client.ts` | 129-133, 1394, 1672, 2176 | 技能获取、缓存清除、连接时获取 |
| `src/services/mcp/useManageMCPConnections.ts` | 22-26, 682-740 | 实时刷新（prompts/resources 变化） |

## 三、关键设计决策

1. **Feature gate 隔离**：`feature('MCP_SKILLS')` 守护条件 `require()` 和所有调用点。关闭时无模块加载、无获取操作
2. **资源到技能映射**：技能从 MCP 服务器的 `skill://` URI 资源中发现。`fetchMcpSkillsForClient` 负责转换（当前为 stub）
3. **循环依赖避免**：`mcpSkillBuilders.ts` 作为依赖图叶节点，避免 `client.ts ↔ mcpSkills.ts ↔ loadSkillsDir.ts` 循环
4. **服务器能力检查**：技能获取还需要 MCP 服务器支持 resources (`!!client.capabilities?.resources`)

## 四、使用方式

```bash
# 启用 feature
FEATURE_MCP_SKILLS=1 bun run dev

# 前提条件：
# 1. 配置了支持 skill:// 资源的 MCP 服务器
# 2. MCP 服务器声明了 resources 能力
```

## 五、需要补全的内容

| 文件 | 状态 | 需要实现 |
|------|------|---------|
| `src/skills/mcpSkills.ts` | Stub | `fetchMcpSkillsForClient()` — 从 MCP 资源列表中筛选 `skill://` URI 并转换为 Command 对象 |
| `src/skills/mcpSkillBuilders.ts` | Stub | 技能构建器注册（避免循环依赖） |

## 六、文件索引

| 文件 | 职责 |
|------|------|
| `src/commands.ts:547-608` | 技能命令过滤 |
| `src/services/mcp/client.ts:117-2358` | 技能获取 + 缓存管理 |
| `src/services/mcp/useManageMCPConnections.ts` | 实时刷新 |
| `src/skills/mcpSkills.ts` | 核心转换逻辑（stub） |
