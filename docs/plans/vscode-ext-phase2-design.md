# VSCode 扩展 Phase 2 设计 — ACP 协议重构

**目标**：用 ACP (Agent Client Protocol) 替换当前 stream-json 实现，闭合 P0 缺口，**完全不修改 `src/commands/`**。

参考：
- `docs/plans/vscode-ext-cli-api.md`
- `docs/plans/vscode-ext-keybindings.md`
- `docs/plans/vscode-ext-gap-analysis.md`
- `docs/plans/vscode-ext-reference-impl.md`
- `packages/acp-link/src/server.ts`（spawn + ACP 接线参考）
- `packages/remote-control-server/web/`（UI 层参考，约 50% 可复用）

---

## 架构总览

```
VSCode UI (webview, React)
      ↑↓ vscode.postMessage (Bridge Protocol, ProxyMessage/ProxyResponse 同构)
ChatViewProvider (extension host, Node.js)
      ↑↓ ACPClient → ClientSideConnection
spawn('claude', ['--acp']) (stdio, ndJsonStream)
```

## 模块清单

### Extension 端 (`packages/vscode-extension/src/`)
| 文件 | 职责 |
|---|---|
| `extension.ts` | VSCode entry，注册 commands/keybindings |
| `ChatViewProvider.ts` | webview 生命周期 + protocol bridge |
| `ACPClient.ts` (NEW) | 包装 `@agentclientprotocol/sdk` ClientSideConnection |
| `agentSpawner.ts` (NEW) | 解析 CLI 路径 + spawn `claude --acp` |
| `EditorBridge.ts` | 实现 ACP `Client.readTextFile`/`writeTextFile` + diff view + @-mention search + diagnostics |
| `StatusBarManager.ts` | VSCode 状态栏 |
| `HistoryManager.ts` | 本地缓存 sessionId 用于 resume |

### Webview 端 (`packages/vscode-extension/webview/`)
| 文件 | 职责 |
|---|---|
| `index.tsx` | React entry |
| `App.tsx` | 根组件 |
| `lib/acp/types.ts` (NEW, 移植 RCS) | ACP 类型 |
| `lib/protocol.ts` (NEW) | webview↔extension 协议 |
| `lib/threadReducer.ts` (NEW, 移植 RCS) | session_update → ThreadEntry |
| `lib/types.ts` | UI 类型（ThreadEntry/PendingPermission） |
| `hooks/useACP.ts` (NEW) | 通过 postMessage 连接到 extension |
| `hooks/useChromeStorage.ts` (NEW) | sessionId 持久化 |
| `components/ChatView.tsx` | 消息流 |
| `components/MessageBubble.tsx` | assistant 文本/思考 |
| `components/ToolCallCard.tsx` | tool_call 渲染 (含 diff) |
| `components/PlanView.tsx` (移植 RCS) | Plan 可视化 |
| `components/PermissionPanel.tsx` (移植+增强 RCS) | 权限面板 |
| `components/CommandMenu.tsx` (移植 RCS) | / 触发菜单 |
| `components/ModelPicker.tsx` | 真实模型切换 (`unstable_setSessionModel`) |
| `components/ModeSelector.tsx` (NEW) | 4 模式切换 + Shift+Tab cycling |
| `components/PromptInput.tsx` | 输入 + 图片粘贴 + @ 触发 |
| `components/StatusBar.tsx` | 模型 + 模式 + tokens + cost |

## Bridge Protocol（webview ↔ extension）

镜像 RCS `ProxyMessage`/`ProxyResponse`，仅去掉 WebSocket 相关字段。

**Webview → Extension** (`type` 前缀 `ext:`)：
- `ext:webview_ready` — webview 已就绪
- `ext:new_session` `{ permissionMode? }`
- `ext:prompt` `{ content: ContentBlock[] }`
- `ext:cancel`
- `ext:permission_response` `{ requestId, outcome }`
- `ext:set_session_model` `{ modelId }`
- `ext:set_session_mode` `{ modeId }`
- `ext:list_sessions` `{ cwd?, cursor? }`
- `ext:load_session` `{ sessionId, cwd? }`
- `ext:resume_session` `{ sessionId, cwd? }`
- `ext:open_file` `{ path, line? }`
- `ext:copy` `{ text }`
- `ext:apply_diff` `{ path, oldText, newText }`
- `ext:send_selection`
- `ext:send_file`
- `ext:find_files` `{ query, requestId }`
- `ext:get_diagnostics` `{ uri?, requestId }`
- `ext:restart_agent`

**Extension → Webview**：
- `ext:status` `{ connected, agentInfo?, capabilities? }`
- `ext:session_created` `{ sessionId, promptCapabilities?, models?, modes? }`
- `ext:session_update` `{ sessionId, update: SessionUpdate }`
- `ext:prompt_complete` `{ stopReason }`
- `ext:permission_request` `{ requestId, sessionId, options, toolCall }`
- `ext:model_changed` `{ modelId }`
- `ext:mode_changed` `{ modeId }`
- `ext:session_list` `ListSessionsResponse`
- `ext:session_loaded` `{ sessionId, ... }`
- `ext:session_resumed` `{ sessionId, ... }`
- `ext:error` `{ message }`
- `ext:find_files_result` `{ requestId, files }`
- `ext:diagnostics_result` `{ requestId, items }`
- `ext:inject_text` `{ text }`
- `ext:cwd` `{ cwd }`

## ACP 关键映射

| ACP method | 触发 | 协议位置 |
|---|---|---|
| `initialize` | extension 启动后立即调用 | `clientCapabilities.fs.{readTextFile,writeTextFile}=true`，`clientInfo={name:"vscode-ccb", version:"0.3"}` |
| `newSession` | webview `ext:new_session` | `{cwd, mcpServers:[], _meta:{permissionMode}}` |
| `prompt` | webview `ext:prompt` | content blocks |
| `cancel` | webview `ext:cancel` | |
| `unstable_setSessionModel` | `ext:set_session_model` | |
| `setSessionMode` | `ext:set_session_mode` | spec method, ACP 0.19 |
| `loadSession` | `ext:load_session` | history replay |
| `unstable_resumeSession` | `ext:resume_session` | no replay |
| `listSessions` | `ext:list_sessions` | |

Client 端实现：
- `requestPermission` → 转发 `ext:permission_request`，等待 `ext:permission_response`
- `sessionUpdate` → 转发 `ext:session_update`
- `readTextFile` → `vscode.workspace.fs.readFile`
- `writeTextFile` → `vscode.workspace.fs.writeFile`（进入 VSCode undo stack）
- `createTerminal` → 暂不实现（可降级为 stub）

## 快捷键体系（package.json + webview）

VSCode keybindings (package.json contributes.keybindings)：
- `ctrl+escape` → `ccb.focus`
- `escape` (focus in chat) → `ccb.cancel`
- `ctrl+shift+n` → `ccb.newChat`
- `ctrl+shift+l` (editor selection) → `ccb.sendSelection`
- `ctrl+shift+m` → `ccb.cycleMode`（手动循环模式，Shift+Tab 替代）

Webview 内部 (PromptInput key handler)：
- `Shift+Tab` → 循环 default→acceptEdits→plan→bypassPermissions
- `Esc` → cancel ongoing
- `Esc Esc` (1s 内) → fork 上一条用户消息（stub）
- `Up`/`Down` (空输入时) → 历史 prompt 导航
- `Ctrl+R` → 历史搜索
- `Ctrl+L` → 清屏
- `Ctrl+C` (空输入双击) → 退出（提示返回 IDE）
- `Tab` → 接受当前 / 补全
- `/` 触发 → CommandMenu
- `@` 触发 → 文件搜索菜单
- `Ctrl+T` → 切换 thinking 显示
- `Ctrl+V` 含图片 → 自动作为 image content 入队

## 实现顺序（自顶向下）

1. **Phase A: 协议层**
   - 移植 `lib/acp/types.ts`
   - 写 `lib/protocol.ts`
   - 写 `src/ACPClient.ts` + `src/agentSpawner.ts`
   - 重写 `src/ChatViewProvider.ts`
2. **Phase B: 状态层**
   - 写 `lib/threadReducer.ts`
   - 写 `hooks/useACP.ts`
3. **Phase C: 核心组件**
   - 移植 `PlanView`/`PermissionPanel`/`CommandMenu`
   - 重写 `MessageBubble`/`ToolCallCard`
   - 重写 `App.tsx`/`PromptInput.tsx`
4. **Phase D: 状态栏 + 模式切换**
   - 写 `ModeSelector`
   - 重写 `ModelPicker` + `StatusBar`
   - 接入 Shift+Tab
5. **Phase E: VSCode 集成**
   - `EditorBridge` 实现 readTextFile/writeTextFile + diff view
   - `find_files` (`vscode.workspace.findFiles`)
   - `get_diagnostics` (`vscode.languages.getDiagnostics`)
6. **Phase F: 多模态 + 历史**
   - 图片粘贴
   - resume/load session
   - up/down prompt history
7. **Phase G: 验证 + 打包**

## 兼容性边界

- ACP feature flag (`ACP`) 在 build.ts 默认启用 → 已就绪
- Claude CLI 启动方式：`claude --acp` (`cli.tsx:135-141`)
- ACP SDK 版本：`@agentclientprotocol/sdk@^0.19.0`
- Permission mode 透传：`newSession({_meta:{permissionMode}})`

## 兜底/降级

- 若 agent 不返回 `models` → 隐藏 ModelPicker
- 若不支持 `setSessionMode` → 隐藏 ModeSelector，降级为 settings.json 改 + restart
- 若不支持 `resume_session` → 用本地 HistoryManager 仅记元数据，restart 时新建 session
- 若 readTextFile capability 关闭 → fallback 到 stub
