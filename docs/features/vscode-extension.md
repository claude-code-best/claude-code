# VS Code Extension — 完整 ACP 集成

## 概述

VSCode 扩展通过 **ACP (Agent Client Protocol)** 协议直接驱动 Claude Code CLI。
扩展启动 `claude --acp` 子进程，使用 `@agentclientprotocol/sdk` 的 `ClientSideConnection`
+ `ndJsonStream` 包裹 stdin/stdout，实现完整的双向通信。

**完全不修改 `src/commands/`** — 所有能力（模型切换、模式切换、斜杠命令、权限审批、
plan 可视化、tool call 流式更新）都通过 ACP 协议方法暴露。

## 架构

```
┌─────────────────────────────────┐
│      VS Code Extension          │
│                                 │
│  ┌───────────┐  ┌────────────┐  │
│  │ WebView   │  │ Extension  │  │
│  │ (React 19)│◄─┤ Host       │  │
│  │           │  │            │  │
│  │ ChatView  │  │ ACPClient  │  │
│  │ Plan/Tool │  │ Editor     │  │
│  │ Permission│  │ Bridge     │  │
│  │ ModeSel   │  │ History    │  │
│  └─────┬─────┘  └─────┬──────┘  │
│        │ postMessage  │         │
│        └──────┬───────┘         │
└───────────────┼─────────────────┘
                │ ndjson stdio (ACP)
        ┌───────▼─────────┐
        │ claude --acp    │
        │  (AcpAgent)     │
        └─────────────────┘
```

## 协议层

- 扩展 ↔ 子进程：JSON-RPC over stdio (ACP, `@agentclientprotocol/sdk@^0.19`)
- WebView ↔ 扩展：`vscode.postMessage` 桥协议（命名空间 `ext:*`，定义在
  `webview/lib/protocol.ts`，与 RCS Web 同构）

### ACP method 接入

| Method | 触发 |
|---|---|
| `initialize` | 扩展启动后立即调用，携带 `clientCapabilities.fs.{readTextFile,writeTextFile}` |
| `newSession` | 每次 New Chat / 启动；`{cwd, mcpServers, _meta:{permissionMode}}` |
| `prompt` | 用户提交（含图片粘贴的 `image` content blocks） |
| `cancel` | Esc / Cancel 按钮 |
| `unstable_setSessionModel` | StatusBar ModelPicker |
| `setSessionMode` | ModeSelector / Shift+Tab |
| `loadSession` / `unstable_resumeSession` | 历史会话恢复 |
| `listSessions` | "Open Session History" 命令 |

### Client 回调（agent 调到我们）

| Method | 实现 |
|---|---|
| `requestPermission` | 转发到 webview 的 PermissionPanel，等待 `permission_response` |
| `sessionUpdate` | 直接转发到 webview 的 threadReducer |
| `readTextFile` | `vscode.workspace.fs.readFile`（优先用打开文档的快照） |
| `writeTextFile` | `vscode.workspace.fs.writeFile`（进入 VSCode undo stack） |

## 模块清单

### Extension 端（Node.js）
| 文件 | 职责 |
|---|---|
| `src/extension.ts` | VSCode 入口；注册命令与快捷键 |
| `src/ChatViewProvider.ts` | webview 生命周期 + 桥协议路由 |
| `src/ACPClient.ts` | 包装 `@agentclientprotocol/sdk` ClientSideConnection |
| `src/agentSpawner.ts` | 解析 CLI 路径（dist 优先 → scripts/dev.ts → claude on PATH） |
| `src/EditorBridge.ts` | VSCode 集成（FS 读写、diff view、@-mention 搜索、诊断） |
| `src/HistoryManager.ts` | sessionId + prompt 历史持久化 |
| `src/StatusBarManager.ts` | VSCode 状态栏（模型 + 模式 + tokens） |

### WebView 端（React）
| 文件 | 职责 |
|---|---|
| `webview/index.tsx` | React 入口 |
| `webview/App.tsx` | 根组件 |
| `webview/lib/acp/types.ts` | ACP 协议类型 |
| `webview/lib/protocol.ts` | webview ↔ extension 桥协议 |
| `webview/lib/types.ts` | UI thread/entry 类型 |
| `webview/lib/threadReducer.ts` | `SessionUpdate` → ThreadEntry 状态机 |
| `webview/hooks/useACP.ts` | 完整状态机 + protocol 客户端 |
| `webview/components/ChatView.tsx` | 消息流 |
| `webview/components/MessageBubble.tsx` | 用户/助手消息 + thinking |
| `webview/components/ToolCallCard.tsx` | tool call (含 diff 预览) |
| `webview/components/PlanView.tsx` | Plan 可视化 |
| `webview/components/PermissionPanel.tsx` | 权限审批面板 |
| `webview/components/CommandMenu.tsx` | 斜杠命令菜单 (动态从 ACP 拿 commands) |
| `webview/components/ModelPicker.tsx` | 模型切换 |
| `webview/components/ModeSelector.tsx` | 模式切换 |
| `webview/components/StatusBar.tsx` | webview 内状态栏 |
| `webview/components/PromptInput.tsx` | 输入 + 图片粘贴 + @ 触发 + 快捷键 |

## 完整快捷键体系

### VSCode 全局（`package.json` contributes.keybindings）
- `Ctrl+Esc` (Mac: `Cmd+Esc`) — 聚焦聊天
- `Esc` (聊天聚焦) — 取消/中断
- `Ctrl+Shift+N` — 新对话
- `Ctrl+Shift+M` — 循环权限模式
- `Ctrl+L` — 清空屏幕
- `Ctrl+R` — 搜索 prompt 历史
- `Ctrl+T` — 切换 thinking 显示
- `Ctrl+Shift+L` (编辑器有选区) — 发送选中代码

### WebView 内部（`PromptInput`）
- `Enter` — 发送
- `Shift+Enter` — 换行
- `Esc` — 取消运行中任务
- `Shift+Tab` — **循环权限模式（default → acceptEdits → plan → bypass）**
- `Tab` — 接受当前补全
- `↑` / `↓` — 在历史 prompts 间导航（首/末行时）
- `/` — 触发斜杠命令菜单
- `@` — 触发文件搜索
- `Ctrl+V` 含图片 — 自动作为 image content block 入队

## 多模态支持

- 直接粘贴图片 → 自动 base64 编码 → 作为 `ImageContent` 加入下一条 prompt
- 缩略图预览 + 删除按钮
- `promptCapabilities.image` 来自 `initialize` 响应（claude-code 默认支持）

## 启动命令

```bash
# 1) 构建 dist（可选，agentSpawner 会优先用它）
bun run build

# 2) 构建扩展（必需）
cd packages/vscode-extension
bun run build

# 3) 安装到 VSCode（创建符号链接到 ~/.vscode/extensions/）
# Windows
bun run install-local:win
# Linux/macOS
bun run install-local

# 4) 重启 VSCode → 侧边栏 "CCB" 出现
```

## 配置

| key | 默认 | 说明 |
|---|---|---|
| `ccb.cliPath` | `auto` | CLI 路径；`auto` 自动探测（dist 优先 → scripts/dev.ts → PATH） |
| `ccb.permissionMode` | `default` | 启动时默认权限模式 |
| `ccb.autoScroll` | `true` | 新消息自动滚动 |
| `ccb.showThinking` | `true` | 是否显示 extended thinking |
| `ccb.resumeLastSession` | `true` | 启动时恢复上次会话 |
| `ccb.enableFsCapabilities` | `true` | 允许 agent 通过 VSCode 读写文件（进入 undo stack） |

## 旧 stream-json 实现

之前的 stream-json 实现（仅覆盖 7/32 个 control_request、缺少 plan 可视化、缺少
图片支持、缺少 permission JSON-RPC 配对）已**完全废弃**。新 ACP 实现解决了所有
P0 缺口（参见 `docs/plans/vscode-ext-gap-analysis.md`）。
