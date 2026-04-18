# `/mcp` 斜杠命令路由机制

本文档描述用户在 REPL 交互模式下输入 `/mcp` 时，命令如何被解析、查找、分发，以及如何通过 React 状态机渲染交互式子项界面。

## 架构概览

```
用户输入 /mcp [args]
    │
    ▼
┌─────────────────────────────────┐
│  第一层：斜杠命令解析            │
│  slashCommandParsing.ts         │
│  parseSlashCommand()            │
│  → commandName + args 拆分      │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  第二层：命令查找与加载          │
│  commands.ts → findCommand()    │
│  commands/mcp/index.ts          │
│  → 懒加载 mcp.tsx 模块          │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  第三层：命令处理器分发          │
│  commands/mcp/mcp.tsx → call()  │
│  → 根据 args 决定渲染哪个组件   │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  第四层：交互式 UI 状态机        │
│  MCPSettings → viewState 切换   │
│  MCPListPanel → 列表导航        │
│  MCPStdioServerMenu /           │
│  MCPRemoteServerMenu → 操作菜单 │
└─────────────────────────────────┘
```

## 第一层：斜杠命令解析

**文件**: `src/utils/slashCommandParsing.ts`

`parseSlashCommand()` 负责将用户的原始输入拆分为命令名和参数：

```typescript
parseSlashCommand('/mcp')
// → { commandName: 'mcp', args: '', isMcp: false }

parseSlashCommand('/mcp enable sorftime')
// → { commandName: 'mcp', args: 'enable sorftime', isMcp: false }

parseSlashCommand('/mcp:tool (MCP) arg1')
// → { commandName: 'mcp:tool (MCP)', args: 'arg1', isMcp: true }
```

解析规则：
- 取 `/` 后的第一个词作为 `commandName`
- 剩余部分整体作为 `args` 字符串
- 如果第二个词是 `(MCP)`，则拼入 `commandName` 并标记 `isMcp: true`
- 解析器**不处理子命令层级**，子命令路由由各命令处理器自行实现

## 第二层：命令查找与加载

### 命令注册

**文件**: `src/commands/mcp/index.ts`

```typescript
const mcp = {
  type: 'local-jsx',                    // 本地 JSX 组件命令，不经过 AI
  name: 'mcp',
  description: 'Manage MCP servers',
  immediate: true,                       // 直接执行，不需要 AI 处理
  argumentHint: '[enable|disable [server-name]]',
  load: () => import('./mcp.js'),        // 懒加载处理器
} satisfies Command
```

### 命令查找

**文件**: `src/commands.ts`

`findCommand()` 在全局 `COMMANDS` 列表中按 `name` 或 `aliases` 精确匹配：

```typescript
export function findCommand(commandName: string, commands: Command[]): Command | undefined {
  return commands.find(
    _ => _.name === commandName ||
         getCommandName(_) === commandName ||
         _.aliases?.includes(commandName),
  );
}
```

全局命令列表由 `COMMANDS()` 函数（memoized）构建，`mcp` 是其中之一。

### 命令执行入口

**文件**: `src/utils/processUserInput/processSlashCommand.tsx`

`processSlashCommand` 调用 `findCommand` 找到命令后：
1. 对 `local-jsx` 类型命令，调用 `load()` 懒加载模块
2. 调用模块导出的 `call(onDone, context, args)` 函数
3. 返回的 React 节点由 Ink 渲染到终端

## 第三层：命令处理器分发

**文件**: `src/commands/mcp/mcp.tsx`

`call()` 函数根据 `args` 参数手动路由到不同的子功能：

```typescript
export async function call(onDone, _context, args?: string): Promise<React.ReactNode> {
  if (args) {
    const parts = args.trim().split(/\s+/);

    // /mcp no-redirect → 绕过 ant 用户重定向，直接显示 MCP 设置
    if (parts[0] === 'no-redirect') {
      return <MCPSettings onComplete={onDone} />;
    }

    // /mcp reconnect <server-name> → 重连指定服务器
    if (parts[0] === 'reconnect' && parts[1]) {
      return <MCPReconnect serverName={parts.slice(1).join(' ')} onComplete={onDone} />;
    }

    // /mcp enable [server-name|all] → 启用服务器
    // /mcp disable [server-name|all] → 禁用服务器
    if (parts[0] === 'enable' || parts[0] === 'disable') {
      return <MCPToggle
        action={parts[0]}
        target={parts.length > 1 ? parts.slice(1).join(' ') : 'all'}
        onComplete={onDone}
      />;
    }
  }

  // /mcp (无参数) → ant 用户重定向到 /plugins，其他用户显示 MCPSettings
  if (process.env.USER_TYPE === 'ant') {
    return <PluginSettings onComplete={onDone} args="manage" showMcpRedirectMessage />;
  }
  return <MCPSettings onComplete={onDone} />;
}
```

### 子命令映射表

| 输入 | 路由目标 | 说明 |
|------|---------|------|
| `/mcp` | `<MCPSettings>` | 交互式服务器管理 UI |
| `/mcp no-redirect` | `<MCPSettings>` | 绕过 ant 重定向 |
| `/mcp reconnect <name>` | `<MCPReconnect>` | 重连指定服务器 |
| `/mcp enable [name]` | `<MCPToggle action="enable">` | 启用服务器（默认 all） |
| `/mcp disable [name]` | `<MCPToggle action="disable">` | 禁用服务器（默认 all） |

### MCPToggle 组件

`MCPToggle` 是一个无 UI 的效果组件（返回 `null`），通过 `useEffect` 执行一次性操作：

1. 从 `appState.mcp.clients` 中筛选目标服务器（排除 `ide`）
2. 调用 `toggleMcpServer(name)` 切换启用状态
3. 通过 `onComplete` 回调返回结果消息

## 第四层：交互式 UI 状态机

### MCPSettings — 视图控制器

**文件**: `src/components/mcp/MCPSettings.tsx`

`MCPSettings` 是整个交互式界面的控制器，用 React state 驱动一个 5 状态的视图状态机：

```typescript
type MCPViewState =
  | { type: 'list'; defaultTab?: string }
  | { type: 'server-menu'; server: ServerInfo }
  | { type: 'server-tools'; server: ServerInfo }
  | { type: 'server-tool-detail'; server: ServerInfo; toolIndex: number }
  | { type: 'agent-server-menu'; agentServer: AgentMcpServerInfo }
```

状态转换图：

```
list ──(选中普通服务器)──→ server-menu ──(查看工具)──→ server-tools ──(选中工具)──→ server-tool-detail
  │                          │                           │                              │
  │                          └──(Esc/返回)──→ list       └──(返回)──→ server-menu       └──(返回)──→ server-tools
  │
  └──(选中 Agent 服务器)──→ agent-server-menu
                              │
                              └──(Esc/返回)──→ list
```

### MCPSettings 数据准备

组件启动时：
1. 从 `appState.mcp.clients` 获取所有 MCP 客户端，过滤掉 `ide` 类型
2. 按传输类型（stdio/sse/http/claudeai-proxy）分类
3. 对远程服务器检查 OAuth 认证状态
4. 从 `appState.agentDefinitions` 提取 Agent 专属 MCP 服务器
5. 若无任何服务器，直接调用 `onComplete` 显示提示信息

### MCPListPanel — 服务器列表

**文件**: `src/components/mcp/MCPListPanel.tsx`

这是用户看到的"子项选择"界面，负责：

**分组与排序**：
```
Project MCPs    (.mcp.json)      ← scope: project
Local MCPs      (settings.local.json)  ← scope: local
User MCPs       (settings.json)  ← scope: user
Enterprise MCPs                  ← scope: enterprise
claude.ai                       ← type: claudeai-proxy
Agent MCPs                      ← 来自 agent 定义
Built-in MCPs   (always available) ← scope: dynamic
```

**状态图标**：

| 状态 | 图标 | 文字 |
|------|------|------|
| `connected` | ✓ (绿色) | connected |
| `disabled` | ○ (灰色) | disabled |
| `pending` | ○ (灰色) | connecting… / reconnecting (n/m)… |
| `needs-auth` | △ (黄色) | needs authentication |
| `failed` | ✗ (红色) | failed |

**键盘交互**：
- `↑↓` — 在扁平列表中上下移动光标（`selectedIndex`）
- `Enter` — 选中当前项，触发 `onSelectServer(server)` → `setViewState({ type: 'server-menu', server })`
- `Esc` — 退出，调用 `onComplete('MCP dialog dismissed')`

### 子菜单组件

选中某个服务器后，根据传输类型渲染不同的操作菜单：

| 传输类型 | 组件 | 可用操作 |
|---------|------|---------|
| `stdio` | `MCPStdioServerMenu` | 启用/禁用、重连、查看工具、删除 |
| `sse` / `http` | `MCPRemoteServerMenu` | 认证、启用/禁用、重连、查看工具、删除 |
| Agent | `MCPAgentServerMenu` | 查看 Agent 配置信息 |

## 与 CLI 模式的对比

REPL 斜杠命令和 CLI 参数模式对 `mcp` 子命令的处理方式完全不同：

| 维度 | REPL `/mcp` | CLI `claude mcp` |
|------|------------|-----------------|
| 定义位置 | `commands/mcp/index.ts` + `mcp.tsx` | `main.tsx:4677-4757` (Commander.js) |
| 子命令路由 | `call()` 内手动 `args.split()` | Commander.js `.command()` 链式注册 |
| 子命令集合 | enable, disable, reconnect, no-redirect | serve, add, remove, list, get, add-json, add-from-claude-desktop, reset-project-choices |
| 交互方式 | Ink React 组件（键盘导航） | 一次性执行并退出 |
| 处理器 | React 组件 (`MCPSettings`, `MCPToggle`) | async handler 函数 (`cli/handlers/mcp.tsx`) |

两套子命令几乎没有重叠——REPL 侧重运行时交互（启用/禁用/浏览），CLI 侧重配置管理（添加/删除/列出）。

## 关键文件索引

| 文件 | 职责 |
|------|------|
| `src/utils/slashCommandParsing.ts` | 斜杠命令输入解析 |
| `src/utils/processUserInput/processSlashCommand.tsx` | 斜杠命令执行入口 |
| `src/commands.ts` | 全局命令注册与查找 (`findCommand`) |
| `src/commands/mcp/index.ts` | `/mcp` 命令定义（type, name, load） |
| `src/commands/mcp/mcp.tsx` | `/mcp` 处理器，args 分发 + MCPToggle 组件 |
| `src/components/mcp/MCPSettings.tsx` | 交互式 UI 状态机控制器 |
| `src/components/mcp/MCPListPanel.tsx` | 服务器列表与键盘导航 |
| `src/components/mcp/MCPStdioServerMenu.tsx` | stdio 服务器操作菜单 |
| `src/components/mcp/MCPRemoteServerMenu.tsx` | 远程服务器操作菜单 |
| `src/components/mcp/MCPAgentServerMenu.tsx` | Agent MCP 服务器菜单 |
| `src/components/mcp/MCPToolListView.tsx` | 工具列表视图 |
| `src/components/mcp/MCPToolDetailView.tsx` | 工具详情视图 |
| `src/main.tsx:4677-4757` | CLI 模式 `claude mcp` 子命令注册 |
| `src/cli/handlers/mcp.tsx` | CLI 模式 handler 实现 |
