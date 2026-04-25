# VSCode Extension — Phase 1 详细实施计划

## 目标

在 VS Code 侧边栏中与 Claude 对话。spawn CLI 进程，通过已有的 SDK 控制协议 (`--print --output-format stream-json`) 通信，WebView 渲染流式响应。

## 核心发现：不需要新协议

CLI 已有完整的 SDK 控制协议（`StdoutMessage` 12 种变体 + `StdinMessage` 5 种变体），通过 `--print` + `--output-format stream-json` 激活。VSCode 扩展直接复用这套协议，**零协议设计工作**。

### 可直接复用的模块清单

| 模块 | 文件 | 复用方式 |
|------|------|----------|
| SDK 控制协议 | `src/entrypoints/sdk/controlTypes.ts` + `controlSchemas.ts` + `coreSchemas.ts` | 导入类型定义 |
| 结构化 IO | `src/cli/structuredIO.ts` (863行) | CLI 端已就绪，扩展只需解析输出 |
| 状态 Store | `src/state/store.ts` (34行) | WebView 直接复制使用 |
| 消息类型 | `src/types/message.ts` + `@ant/model-provider` 类型 | 30+ 纯数据类型 |
| 工具/权限类型 | `src/Tool.ts` + `src/types/permissions.ts` | 纯接口定义 |
| IDE lockfile 发现 | `src/utils/ide.ts` (LockfileJsonContent/IdeLockfileInfo/DetectedIDEInfo) | 扩展写 lockfile，CLI 自动发现 |
| 认证共享 | `src/utils/auth.ts` + `src/utils/config.ts` | 读 `~/.claude/config.json` 同一份凭据 |
| 主题 token | `packages/@ant/ink/src/theme/theme-types.ts` (~80 个语义 token) | 转换为 CSS variables |
| MCP Server 模式 | `packages/@ant/claude-for-chrome-mcp/src/mcpServer.ts` | 照搬结构 |
| Markdown 配置 | `src/utils/markdown.ts` 的 `configureMarked()` | WebView 用 `marked.parse()` |

---

## 分步实施

### Step 0: 包骨架搭建

**文件**: `packages/vscode-extension/`

```
packages/vscode-extension/
├── package.json              # VS Code extension manifest + devDeps
├── tsconfig.json             # 独立 tsconfig，不继承主项目
├── esbuild.config.ts         # 两个 entry: extension + webview
├── .vscodeignore
├── resources/
│   └── icon.svg              # Activity Bar 图标
├── src/
│   └── (后续 step 创建)
└── webview/
    └── (后续 step 创建)
```

**package.json 关键配置**:
```jsonc
{
  "name": "claude-code-best-vscode",
  "displayName": "Claude Code Best",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "claude-code",
        "title": "Claude Code",
        "icon": "resources/icon.svg"
      }]
    },
    "views": {
      "claude-code": [{
        "type": "webview",
        "id": "claude-code.chat",
        "name": "Chat"
      }]
    },
    "commands": [
      { "command": "claude-code.newChat", "title": "New Chat", "category": "Claude Code" }
    ],
    "keybindings": [
      { "command": "claude-code.focus", "key": "ctrl+escape", "mac": "cmd+escape" }
    ],
    "configuration": {
      "title": "Claude Code Best",
      "properties": {
        "claudeCode.cliPath": {
          "type": "string",
          "default": "ccb",
          "description": "Path to the Claude Code CLI binary"
        }
      }
    }
  }
}
```

**esbuild 配置** (两个 bundle):
1. `src/extension.ts` → `dist/extension.js` (Node.js，VS Code host)
2. `webview/index.tsx` → `dist/webview.js` (浏览器，WebView)

**构建命令**:
```bash
cd packages/vscode-extension && bun run build   # 打包
cd packages/vscode-extension && bun run dev     # watch 模式
cd packages/vscode-extension && bun run package # 生成 .vsix
```

**验收**: `bun run build` 产出 `dist/extension.js` + `dist/webview.js`，无错误。

---

### Step 1: Extension Host — 入口与生命周期

**新建文件**:
- `src/extension.ts` — activate/deactivate
- `src/CLIProcess.ts` — spawn CLI 进程 + NDJSON 解析
- `src/ChatViewProvider.ts` — WebView provider

#### 1.1 `src/extension.ts`

```typescript
import * as vscode from 'vscode'
import { ChatViewProvider } from './ChatViewProvider'

export function activate(context: vscode.ExtensionContext) {
  const provider = new ChatViewProvider(context.extensionUri, context)

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('claude-code.chat', provider),
    vscode.commands.registerCommand('claude-code.newChat', () => provider.newChat()),
  )
}

export function deactivate() {}
```

#### 1.2 `src/CLIProcess.ts`

核心：spawn `ccb --print --output-format stream-json --input-format stream-json`，解析 stdout 的 NDJSON 行。

```typescript
import { spawn, type ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import type { StdoutMessage, StdinMessage } from './types/sdk'

export class CLIProcess extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer = ''

  constructor(
    private cliPath: string,
    private cwd: string,
  ) { super() }

  start(): void {
    this.process = spawn(this.cliPath, [
      '--print',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
    ], {
      cwd: this.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8')
      this.drainBuffer()
    })

    this.process.stderr!.on('data', (chunk: Buffer) => {
      this.emit('stderr', chunk.toString('utf-8'))
    })

    this.process.on('exit', (code) => {
      this.emit('exit', code)
      this.process = null
    })
  }

  send(message: StdinMessage): void {
    if (!this.process?.stdin?.writable) return
    this.process.stdin.write(JSON.stringify(message) + '\n')
  }

  interrupt(): void {
    this.send({ type: 'user_input', inputMode: 'interrupt' } as StdinMessage)
  }

  kill(): void {
    this.process?.kill('SIGTERM')
  }

  private drainBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg: StdoutMessage = JSON.parse(line)
        this.emit('message', msg)
      } catch {
        this.emit('stderr', line)
      }
    }
  }
}
```

**关键**: 复用 CLI 已有的 `--print --output-format stream-json` 路径，不需要新的 `--ipc-mode`。CLI 端 `print.ts` → `StructuredIO` 已完整处理所有消息流。

#### 1.3 `src/ChatViewProvider.ts`

```typescript
import * as vscode from 'vscode'
import { CLIProcess } from './CLIProcess'

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView
  private cli?: CLIProcess

  constructor(
    private extensionUri: vscode.Uri,
    private context: vscode.ExtensionContext,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')],
    }
    view.webview.html = this.getHtml(view.webview)

    // WebView → Extension Host
    view.webview.onDidReceiveMessage((msg) => this.handleWebViewMessage(msg))

    // 自动启动 CLI
    this.startCLI()
  }

  newChat(): void {
    this.cli?.kill()
    this.startCLI()
    this.postToWebView({ type: 'clear' })
  }

  private startCLI(): void {
    const config = vscode.workspace.getConfiguration('claudeCode')
    const cliPath = config.get<string>('cliPath', 'ccb')
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()

    this.cli = new CLIProcess(cliPath, cwd)

    // CLI → WebView 转发
    this.cli.on('message', (msg) => this.postToWebView(msg))
    this.cli.on('stderr', (text) => this.postToWebView({ type: 'log', text }))
    this.cli.on('exit', (code) => this.postToWebView({ type: 'disconnected', code }))

    this.cli.start()
  }

  private handleWebViewMessage(msg: { type: string; [k: string]: unknown }): void {
    switch (msg.type) {
      case 'user_input':
        this.cli?.send({
          type: 'user_input',
          // 将 WebView 的用户输入转为 StdinMessage 格式
          ...msg,
        } as any)
        break
      case 'interrupt':
        this.cli?.interrupt()
        break
    }
  }

  private postToWebView(msg: unknown): void {
    this.view?.webview.postMessage(msg)
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js')
    )
    const nonce = getNonce()
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Claude Code</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
```

**验收**: F5 启动 Extension Development Host，Activity Bar 出现图标，点击打开侧边栏。

---

### Step 2: WebView — React 聊天界面

**新建文件**:
```
webview/
├── index.tsx           # React 入口
├── App.tsx             # 主组件
├── store.ts            # 从 src/state/store.ts 复制（34行）
├── theme.ts            # 从 Ink theme 转换的 CSS variables
├── styles.css          # 全局样式
├── hooks/
│   ├── useCLI.ts       # 接收 CLI 消息
│   └── useVSCodeAPI.ts # VS Code WebView API 封装
└── components/
    ├── MessageList.tsx  # 消息列表
    ├── MessageBubble.tsx # 单条消息
    ├── PromptInput.tsx  # 输入框
    └── StatusBar.tsx    # 状态栏
```

#### 2.1 状态 Store

直接复制 `src/state/store.ts`（34行），加上 WebView 特化的状态类型：

```typescript
// 从 src/state/store.ts 复制，零改动
export { createStore, type Store } from './store-core'

// WebView 状态
export interface ChatState {
  messages: RenderedMessage[]
  status: 'idle' | 'connecting' | 'thinking' | 'streaming' | 'tool_executing' | 'disconnected'
  tokenUsage: { input: number; output: number; cache: number }
  model: string
}

export type RenderedMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string       // 渲染后的 HTML
  timestamp: number
  toolCalls?: ToolCallInfo[]
  isStreaming?: boolean
}

export type ToolCallInfo = {
  id: string
  name: string
  status: 'running' | 'done' | 'error'
  summary?: string
}
```

#### 2.2 `useCLI` Hook

```typescript
import { useEffect, useRef, useCallback } from 'react'

const vscode = acquireVsCodeApi()

export function useCLI(onMessage: (msg: any) => void) {
  const callbackRef = useRef(onMessage)
  callbackRef.current = onMessage

  useEffect(() => {
    const handler = (event: MessageEvent) => callbackRef.current(event.data)
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const send = useCallback((text: string) => {
    vscode.postMessage({ type: 'user_input', content: text })
  }, [])

  const interrupt = useCallback(() => {
    vscode.postMessage({ type: 'interrupt' })
  }, [])

  return { send, interrupt }
}
```

#### 2.3 消息解析

将 `StdoutMessage` 映射到 `RenderedMessage`。核心消息类型处理：

| StdoutMessage.type | 处理方式 |
|---|---|
| `assistant` (SDKMessage subtype) | 追加/更新助手消息，`marked.parse()` 渲染 |
| `result` | 标记消息完成，更新 token 用量 |
| `tool_use` / `tool_result` | 创建 ToolCallInfo，展示工具名+摘要 |
| `control_request` (can_use_tool) | Phase 2 处理（Phase 1 使用 `--permission-mode acceptEdits`） |
| `session_state` | 更新 status |

#### 2.4 Markdown 渲染

复用 `configureMarked()` 配置，在 WebView 中直接调用 `marked.parse()`：

```typescript
import { marked } from 'marked'

// 复用 src/utils/markdown.ts 的配置
marked.use({
  breaks: true,
  gfm: true,
  extensions: [/* 从 configureMarked() 复制 */]
})

export function renderMarkdown(text: string): string {
  return marked.parse(text) as string
}
```

#### 2.5 主题

从 `packages/@ant/ink/src/theme/theme-types.ts` 的 ~80 个 token 提取 CSS variables：

```css
:root {
  /* 从 getTheme('dark') 机械转换 */
  --theme-claude: rgb(215, 119, 87);
  --theme-success: rgb(76, 175, 80);
  --theme-error: rgb(244, 67, 54);
  --theme-warning: rgb(255, 152, 0);
  --theme-diff-added: rgb(76, 175, 80);
  --theme-diff-removed: rgb(244, 67, 54);
  /* ... */

  /* VS Code 原生变量融合 */
  --vscode-font-family: var(--vscode-editor-font-family);
  --vscode-bg: var(--vscode-editor-background);
  --vscode-fg: var(--vscode-editor-foreground);
}
```

**验收**: 输入消息，CLI stdout 返回流式响应，WebView 实时渲染 Markdown。

---

### Step 3: 状态栏与连接管理

**新建文件**:
- `src/StatusBarManager.ts` — VS Code 状态栏集成

```typescript
import * as vscode from 'vscode'

export class StatusBarManager {
  private item: vscode.StatusBarItem

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
    this.item.command = 'claude-code.focus'
    this.update('idle')
    this.item.show()
  }

  update(state: 'idle' | 'connecting' | 'thinking' | 'streaming' | 'disconnected'): void {
    const icons: Record<string, string> = {
      idle: '$(circle-outline)',
      connecting: '$(loading~spin)',
      thinking: '$(loading~spin)',
      streaming: '$(pulse)',
      disconnected: '$(circle-slash)',
    }
    this.item.text = `${icons[state]} Claude Code`
  }

  dispose(): void { this.item.dispose() }
}
```

**进程重启逻辑**（在 `ChatViewProvider` 中）:

```typescript
this.cli.on('exit', (code) => {
  if (code !== 0) {
    // 非正常退出，3 秒后自动重启
    setTimeout(() => this.startCLI(), 3000)
  }
})
```

**验收**: 状态栏显示连接状态图标，CLI 崩溃后自动重启。

---

### Step 4: 测试与本地安装

**新建文件**:
- `packages/vscode-extension/src/__tests__/CLIProcess.test.ts`
- `packages/vscode-extension/src/__tests__/messageParser.test.ts`
- `packages/vscode-extension/scripts/install-local.sh` — 本地安装脚本
- `packages/vscode-extension/scripts/install-local.ps1` — Windows 安装脚本

#### 测试覆盖

1. **CLIProcess**: spawn mock → NDJSON 解析 → 消息事件触发
2. **消息解析**: StdoutMessage → RenderedMessage 映射
3. **Store**: 状态更新不可变性

#### 本地安装（不发布，symlink 方式）

VS Code 从 `~/.vscode/extensions/` 自动加载扩展。我们通过 symlink 将构建产物链接到该目录，实现"build 一次，VS Code 自动加载"。

**目标路径**: `~/.vscode/extensions/claude-code-best-vscode/`

**Windows 安装脚本** (`scripts/install-local.ps1`):
```powershell
# 构建
bun run build

# 创建 symlink（需要管理员权限或开发者模式）
$ExtDir = "$env:USERPROFILE\.vscode\extensions\claude-code-best-vscode"
$SourceDir = (Resolve-Path "..").Path  # packages/vscode-extension/

# 清理旧链接
if (Test-Path $ExtDir) { Remove-Item $ExtDir -Force -Recurse }

# 创建目录 junction（不需要管理员权限）
New-Item -ItemType Junction -Path $ExtDir -Target $SourceDir

Write-Host "Installed: $ExtDir -> $SourceDir"
Write-Host "Restart VS Code to load the extension."
```

**Bash 安装脚本** (`scripts/install-local.sh`):
```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
bun run build

EXT_DIR="$HOME/.vscode/extensions/claude-code-best-vscode"
SOURCE_DIR="$(pwd)"

# 清理旧链接
rm -rf "$EXT_DIR"

# 创建 symlink
ln -sf "$SOURCE_DIR" "$EXT_DIR"

echo "Installed: $EXT_DIR -> $SOURCE_DIR"
echo "Restart VS Code to load the extension."
```

#### 目录结构要求

symlink 后 VS Code 从 `~/.vscode/extensions/claude-code-best-vscode/` 读取，该目录必须包含：

```
claude-code-best-vscode/          # = packages/vscode-extension/
├── package.json                  # VS Code extension manifest（必须在根）
├── dist/
│   ├── extension.js              # Extension Host 入口（package.json main 指向这里）
│   └── webview.js                # WebView bundle
└── resources/
    └── icon.svg
```

VS Code 通过 `package.json` 中的 `main` 字段找到入口，`contributes` 注册命令/视图。**不需要 .vsix 打包**。

#### 开发流程

```bash
# 首次安装
cd packages/vscode-extension
bun install
bun run build
./scripts/install-local.sh        # 或 PowerShell: .\scripts\install-local.ps1

# 日常开发
bun run dev                       # watch 模式，自动 rebuild
# symlink 指向源目录，rebuild 后直接生效
# VS Code 中 Ctrl+Shift+P → "Developer: Reload Window" 热重载

# F5 调试（不需要 symlink）
# 在 VS Code 中打开 packages/vscode-extension/
# F5 启动 Extension Development Host
```

#### package.json scripts

```jsonc
{
  "scripts": {
    "build": "node esbuild.config.mjs",
    "dev": "node esbuild.config.mjs --watch",
    "install-local": "bash scripts/install-local.sh",
    "install-local:win": "powershell -File scripts/install-local.ps1",
    "typecheck": "tsc --noEmit"
  }
}
```

**验收**: 运行 `install-local` 脚本后重启 VS Code，Activity Bar 出现 Claude Code 图标，点击打开侧边栏，输入消息收到 CLI 响应。

---

## 构建顺序

```
Step 0 (骨架)  ─── 无依赖 ──────────────── 半天
     │
Step 1 (Host)  ─── 依赖 Step 0 ─────────── 1-2 天
     │
Step 2 (WebView) ─ 依赖 Step 1 ─────────── 2-3 天
     │
Step 3 (状态栏)  ─ 依赖 Step 1 ─────────── 半天
     │
Step 4 (测试+本地安装) ─ 依赖 Step 2+3 ──── 1 天
```

**总计: 5-7 天**

## Phase 1 简化决策

| 决策 | 说明 |
|------|------|
| 权限处理 | Phase 1 使用 `--permission-mode acceptEdits`，跳过权限弹窗 |
| 文件 diff | Phase 1 只在消息中展示文本 diff，不集成 VS Code diff editor |
| 会话管理 | Phase 1 单会话，不做历史/恢复 |
| MCP Server | Phase 1 不暴露 IDE 工具给 CLI |
| 模型切换 | Phase 1 使用 CLI 默认模型 |
| 多 IDE 兼容 | Phase 1 只测 VS Code，Cursor/Windsurf 延后 |

## 部署方式：本地 symlink（不发布）

本扩展**不发布到 VS Code Marketplace**，仅本地使用。

### 安装原理

VS Code 启动时扫描 `~/.vscode/extensions/` 下所有目录，查找含 `package.json` + `contributes` 的扩展。通过 symlink / junction 将 `packages/vscode-extension/` 链接到该目录，VS Code 即自动加载。

```
~/.vscode/extensions/
├── anthropic.claude-code-2.1.119-win32-x64/   # 官方扩展（共存）
├── claude-code-best-vscode/                    # ← symlink → packages/vscode-extension/
│   ├── package.json
│   ├── dist/extension.js
│   └── dist/webview.js
└── ...
```

### 与官方扩展共存

| 属性 | 官方扩展 | 我们的扩展 |
|------|---------|-----------|
| Extension ID | `anthropic.claude-code` | `claude-code-best.claude-code-best-vscode` |
| Activity Bar ID | `anthropic-claude-code` | `claude-code` |
| Lockfile 前缀 | `anthropic-` | `ccb-` |
| 命令前缀 | `claude-dev.` | `claude-code.` |

ID 完全不同，不会冲突。

### 更新流程

```bash
cd packages/vscode-extension
bun run build                    # rebuild
# VS Code: Ctrl+Shift+P → "Developer: Reload Window"
```

因为是 symlink，`dist/` 更新后 VS Code reload 即可生效，无需重新安装。

### Cursor / Windsurf 支持

这些 fork 的扩展目录类似：
- Cursor: `~/.cursor/extensions/`
- Windsurf: `~/.windsurf/extensions/`

安装脚本可加 `--target cursor|windsurf` 参数支持。Phase 1 先只做 VS Code。

## 风险

| 风险 | 缓解 |
|------|------|
| CLI stdout 混入非 JSON 输出 | 所有非 JSON 行归类为 stderr log |
| `--print` 模式下权限阻塞 | Phase 1 用 `--permission-mode acceptEdits` 绕过 |
| Windows 路径问题 | `CLIProcess` 用 `vscode.workspace.workspaceFolders` 获取规范路径 |
| WebView CSP 限制 | 只加载打包后的单文件 JS，不用外部资源 |
| Bun vs Node 运行时差异 | Extension Host 是 Node.js，CLI 是 Bun——已有 build 后的 `dist/cli-node.js` 兼容方案 |
| Windows symlink 权限 | 用 Directory Junction（`New-Item -ItemType Junction`）不需要管理员权限 |
| symlink 指向的源目录被移动/删除 | 安装脚本检查路径有效性，无效时报错提示重新安装 |
