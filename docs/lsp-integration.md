# LSP Integration

Claude Code 内置了 Language Server Protocol (LSP) 集成，提供代码智能功能（跳转定义、查找引用、悬停信息、文档符号等）和被动的诊断反馈。

## 快速开始

### 1. 安装 LSP 插件

在 Claude Code REPL 中使用 `/plugin` 命令搜索并安装 LSP 插件：

```
/plugin
```

搜索 `lsp`，找到对应语言的插件（如 `typescript-lsp`），选择安装。

安装后运行 `/reload-plugins` 使插件生效。

LSP 插件安装后，后台的 LSP Server Manager 会自动加载并启动对应的语言服务器，无需手动配置。

### 2. 启用 LSP Tool

LSP Tool 需要通过环境变量显式启用，Claude 才能主动发起代码智能查询：

```bash
ENABLE_LSP_TOOL=1 bun run dev
```

不启用时，LSP 服务器仍然在后台运行并推送被动的诊断反馈（类型错误等）。

## 自动推荐

除了手动 `/plugin` 搜索安装外，Claude Code 会在编辑文件时自动检测：

1. 监听 `fileHistory.trackedFiles`，发现有新文件被编辑
2. 扫描已安装的 marketplace，找到声明支持该文件扩展名的 LSP 插件
3. 检查系统上是否已安装对应的 LSP 二进制（如 `typescript-language-server`）
4. 满足条件时弹出推荐对话框，可选择安装

```
┌───── LSP Plugin Recommendation ─────────────┐
│                                               │
│  LSP provides code intelligence like          │
│  go-to-definition and error checking          │
│                                               │
│  Plugin: typescript-lsp                       │
│  Triggered by: .ts files                     │
│                                               │
│  Would you like to install this LSP plugin?   │
│                                               │
│  > Yes, install typescript-lsp               │
│    No, not now                                │
│    Never for typescript-lsp                   │
│    Disable all LSP recommendations            │
└───────────────────────────────────────────────┘
```

- 30 秒不操作自动关闭（算作 "No"）
- 选 "Never" 不再推荐该插件
- 选 "Disable" 关闭所有 LSP 推荐
- 连续忽略 5 次后自动禁用推荐

## 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    LSP Tool                         │
│  packages/builtin-tools/src/tools/LSPTool/LSPTool.ts│
│  (Claude 可调用的工具，9 种操作)                       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              LSP Server Manager (Singleton)          │
│  src/services/lsp/manager.ts                        │
│  - initializeLspServerManager()                     │
│  - reinitializeLspServerManager()                   │
│  - shutdownLspServerManager()                       │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│           LSP Server Manager (实例)                   │
│  src/services/lsp/LSPServerManager.ts               │
│  - 管理多个 LSPServerInstance                        │
│  - 按文件扩展名路由请求                               │
│  - 文件同步 (didOpen/didChange/didSave/didClose)     │
└──────────────────────┬──────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ LSPServer    │ │ LSPServer    │ │ LSPServer    │
│ Instance     │ │ Instance     │ │ Instance     │
│ (typescript) │ │ (python)     │ │ (rust...)    │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
┌──────▼───────┐ ┌──────▼───────┐ ┌──────▼───────┐
│ LSPClient    │ │ LSPClient    │ │ LSPClient    │
│ (JSON-RPC)   │ │ (JSON-RPC)   │ │ (JSON-RPC)   │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
  子进程 (stdio)    子进程 (stdio)    子进程 (stdio)
```

### 被动诊断反馈

```
LSP Server ──publishDiagnostics──▶ passiveFeedback.ts
                                          │
                                          ▼
                                   LSPDiagnosticRegistry
                                   (去重、容量限制)
                                          │
                                          ▼
                                   Attachment System
                                   (异步注入到对话)
```

LSP 服务器会异步推送 `textDocument/publishDiagnostics` 通知，经去重和容量限制后作为 attachment 注入到 Claude 的对话上下文中。

## 核心模块

| 文件 | 职责 |
|------|------|
| `src/services/lsp/manager.ts` | 全局单例，初始化/重初始化/关闭生命周期管理 |
| `src/services/lsp/LSPServerManager.ts` | 多服务器管理，按文件扩展名路由，文件同步 |
| `src/services/lsp/LSPServerInstance.ts` | 单个 LSP 服务器实例生命周期（启动/停止/重启/健康检查） |
| `src/services/lsp/LSPClient.ts` | JSON-RPC 通信层（基于 `vscode-jsonrpc`），子进程管理 |
| `src/services/lsp/config.ts` | 从插件加载 LSP 服务器配置 |
| `src/services/lsp/LSPDiagnosticRegistry.ts` | 诊断信息注册、去重、容量限制 |
| `src/services/lsp/passiveFeedback.ts` | 注册 `publishDiagnostics` 通知处理器 |
| `packages/builtin-tools/src/tools/LSPTool/LSPTool.ts` | LSP Tool 实现（暴露给 Claude） |
| `packages/builtin-tools/src/tools/LSPTool/schemas.ts` | 输入 schema（9 种操作的 discriminated union） |
| `packages/builtin-tools/src/tools/LSPTool/formatters.ts` | 各操作结果的格式化 |
| `packages/builtin-tools/src/tools/LSPTool/prompt.ts` | Tool 描述文本 |
| `src/utils/plugins/lspPluginIntegration.ts` | 从插件加载、验证、环境变量解析、作用域管理 |

## LSP Tool 支持的操作

| 操作 | LSP Method | 说明 |
|------|-----------|------|
| `goToDefinition` | `textDocument/definition` | 跳转到符号定义 |
| `findReferences` | `textDocument/references` | 查找所有引用 |
| `hover` | `textDocument/hover` | 获取悬停信息（文档、类型） |
| `documentSymbol` | `textDocument/documentSymbol` | 获取文档内所有符号 |
| `workspaceSymbol` | `workspace/symbol` | 全工作区符号搜索 |
| `goToImplementation` | `textDocument/implementation` | 查找接口/抽象方法的实现 |
| `prepareCallHierarchy` | `textDocument/prepareCallHierarchy` | 获取位置处的调用层级项 |
| `incomingCalls` | `callHierarchy/incomingCalls` | 查找调用此函数的所有函数 |
| `outgoingCalls` | `callHierarchy/outgoingCalls` | 查找此函数调用的所有函数 |

所有操作需要 `filePath`、`line`（1-based）和 `character`（1-based）参数。

## 插件开发：LSP 服务器配置

LSP 服务器通过插件提供。插件的 `manifest.json` 中可以声明 LSP 服务器，支持三种格式：

**1. 内联配置（在 manifest 中直接定义）**

```json
{
  "lspServers": {
    "typescript": {
      "command": "typescript-language-server",
      "args": ["--stdio"],
      "extensionToLanguage": {
        ".ts": "typescript",
        ".tsx": "typescriptreact"
      }
    }
  }
}
```

**2. 引用外部 .lsp.json 文件**

```json
{
  "lspServers": "path/to/.lsp.json"
}
```

**3. 数组混合格式**

```json
{
  "lspServers": [
    "path/to/.lsp.json",
    {
      "another-server": { "command": "...", "extensionToLanguage": { "...": "..." } }
    }
  ]
}
```

也可以在插件目录下直接放置 `.lsp.json` 文件，无需在 manifest 中声明。

### LSP 服务器配置 Schema

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | string | 是 | LSP 服务器可执行命令（不含空格） |
| `args` | string[] | 否 | 命令行参数 |
| `extensionToLanguage` | Record<string, string> | 是 | 文件扩展名到语言 ID 的映射（至少一个） |
| `transport` | `"stdio"` \| `"socket"` | 否 | 通信方式，默认 `stdio` |
| `env` | Record<string, string> | 否 | 启动服务器时设置的环境变量 |
| `initializationOptions` | unknown | 否 | 传给服务器的初始化选项 |
| `settings` | unknown | 否 | 通过 `workspace/didChangeConfiguration` 传递的设置 |
| `workspaceFolder` | string | 否 | 工作区目录路径 |
| `startupTimeout` | number | 否 | 启动超时时间（毫秒） |
| `maxRestarts` | number | 否 | 最大重启次数（默认 3） |

### 环境变量替换

配置中的 `command`、`args`、`env`、`workspaceFolder` 支持：

- `${CLAUDE_PLUGIN_ROOT}` — 插件根目录
- `${CLAUDE_PLUGIN_DATA}` — 插件数据目录
- `${user_config.KEY}` — 用户在插件启用时配置的值
- `${VAR}` — 系统环境变量

## 生命周期管理

### 服务器状态机

```
stopped → starting → running
running → stopping → stopped
any     → error (失败时)
error   → starting (重试时)
```

### 崩溃恢复

- LSP 服务器崩溃时状态设为 `error`
- 下次请求时自动尝试重启（通过 `ensureServerStarted`）
- 超过 `maxRestarts`（默认 3）次后放弃

### 瞬态错误重试

- `ContentModified` 错误（LSP 错误码 -32801）会自动重试，最多 3 次
- 使用指数退避：500ms → 1000ms → 2000ms
- 常见于 rust-analyzer 等仍在索引项目的服务器

### 诊断信息容量限制

- 每个文件最多 10 条诊断
- 总计最多 30 条诊断
- 超出部分按严重性排序后截断（Error > Warning > Info > Hint）
- 跨 turn 去重：已发送过的相同诊断不会重复发送
- 文件编辑后清除该文件的已发送记录，允许新诊断通过

### 插件刷新

安装/卸载插件后使用 `/reload-plugins`，会调用 `reinitializeLspServerManager()`：
1. 异步关闭旧服务器实例
2. 重置状态为 `not-started`
3. 调用 `initializeLspServerManager()` 重新加载插件配置

## 依赖

- `vscode-jsonrpc` — JSON-RPC 通信（懒加载，仅在实际创建服务器实例时才 require）
- `vscode-languageserver-protocol` — LSP 协议类型
- `vscode-languageserver-types` — LSP 类型定义
- `lru-cache` — 诊断去重缓存
