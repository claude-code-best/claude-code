# VSCode Extension — Claude Code UI 完整度缺口审计

**审计日期**: 2026-04-24
**审计对象**: `packages/vscode-extension/` (commit on branch `feat/vscode-extension`)
**参考基线**:
- 终端 CLI REPL (`src/screens/REPL.tsx`, `src/keybindings/defaultBindings.ts`)
- RCS Web UI (`packages/remote-control-server/web/`)
- SDK 控制协议 (`src/entrypoints/sdk/controlSchemas.ts`, `src/entrypoints/sdk/coreSchemas.ts`)

---

## 概览打分

| 维度 | 状态 | 得分 |
|------|------|------|
| CLI 启动与连接 | ✅ 完整 | 9/10 |
| stdout 消息解析 | ⚠️ 部分 | 5/10 |
| control_request 发送通道 | ✅ 覆盖齐全 | 8/10 |
| 模型切换 | ⚠️ 硬编码 | 5/10 |
| 模式切换 UI | ❌ 仅 settings.json | 2/10 |
| 斜杠命令 | ⚠️ 大部分占位 | 4/10 |
| 权限审批 | ⚠️ 缺少建议/按工具过滤/计数 | 5/10 |
| 键盘快捷键 | ❌ 仅 Enter/Esc | 2/10 |
| 状态栏 | ⚠️ 无模式显示 | 6/10 |
| 转录/历史 | ❌ 仅存结构,无 UI | 1/10 |
| VSCode 集成 | ⚠️ 基础选区/文件,无 @ 引用 | 4/10 |
| 图片/附件 | ❌ 完全缺失 | 0/10 |
| Plan/Todos 可视化 | ❌ 完全缺失 | 0/10 |
| MCP 可视化 | ⚠️ 仅纯文本 | 3/10 |
| 上下文用量详情 | ⚠️ 仅百分比,无分类 | 3/10 |

---

## ✅ 已实现 (+ 质量评估)

### 1. CLI 进程启动 (质量: 优)

**文件**: `src/CLIProcess.ts:71-151`, `resolveCLIPath` (L153-214)

- 使用标准 `--print --output-format stream-json --input-format stream-json --verbose` 启动(符合 stdioServer/stdin 协议)。
- `resolveCLIPath` 优先使用 `bun run src/entrypoints/cli.tsx`(源码模式),后备 `dist/cli.js`、`dist/cli-node.js`、PATH 中的 `ccb`。
- 跨平台 `findBun` (L216-238) 在 Windows 下处理 `bun.exe`。
- 指数退避重启 (L404-422, 最多 5 次)。
- permissionMode 作为 `--permission-mode` 参数传入 (L106-108)。

**小缺口**:
- 未传入 `--dangerously-skip-permissions` 的 opt-in 绕路。
- 未传入 `--session-id`、`--resume`、`--continue`(无法恢复历史会话)。
- 未传入 `--append-system-prompt`、`--agents` 等初始化旗标(当前只能靠 `sendInitialize({})` 空体)。

### 2. control_request 通道 (质量: 优)

**文件**: `src/CLIProcess.ts:284-363`

- `sendControlResponse(requestId, approved, extra)` 正确封装 success/error 信封 (L284-311)。
- `sendControlRequest(subtype, payload)` 通用封装,调用方可自定义 subtype (L317-328)。
- 已封装的控制调用: `sendInitialize`、`sendSetModel`、`sendGetSettings`、`sendMcpStatus`、`sendGetContextUsage`、`sendSetPermissionMode`、`sendSetMaxThinkingTokens`、`sendInterrupt`。

**小缺口**:
- 未实现 `rewind_files`、`cancel_async_message`、`mcp_reconnect`、`mcp_toggle`、`stop_task`、`reload_plugins`(仅在 `/agents` 中使用一次)、`hook_callback`、`elicitation`、`mcp_set_servers`、`apply_flag_settings`。完整 SDK 协议有 21 个 subtype,当前覆盖 8 个。

### 3. 流式 stream_event 解析 (质量: 良)

**文件**: `webview/lib/messageParser.ts:95-174`

- 正确处理 `message_start`、`content_block_start`、`content_block_delta`、`content_block_stop`、`message_stop`。
- 支持 `text_delta`、`thinking_delta`、`input_json_delta` 三种增量类型。
- 多 block index 用 `Map<number, StreamBlock>` 维护(L16-19)。

**小缺口**: `input_json_delta` 只做字符串累加,没有 best-effort 部分 JSON 解析,工具输入预览不友好。

### 4. 权限审批 UI (质量: 良)

**文件**: `webview/components/PermissionCard.tsx`, `App.tsx:358-372`

- 正确捕获 `control_request` + `subtype: can_use_tool` (messageParser.ts:291-312)。
- 显示 `displayName`/`description`/截断的 toolInput JSON (PermissionCard.tsx:37-39)。
- Approve/Deny 回传 `control_response` 带 `behavior: "allow"` 或 `error: "User denied permission"` (CLIProcess.ts:284-311)。
- 支持多个 pending 权限队列 (App.tsx:142-167)。
- 支持 `control_cancel_request` 主动取消 (messageParser.ts:314-320)。

### 5. 编辑器桥接 (质量: 良)

**文件**: `src/EditorBridge.ts`

- `getSelectedTextWithContext` 获取选区 + 行号 + 语言 ID。
- `getActiveFileContext` 获取当前文件全文。
- `insertAtCursor`、`copyToClipboard`、`openFile(path, line)`。
- `applyDiff` 做了最小实现:只提取 `+` 行插入(不是真正的 3-way merge)。

### 6. 斜杠命令菜单 UI (质量: 良)

**文件**: `webview/components/SlashCommandMenu.tsx`, `webview/hooks/useSlashCommands.ts`

- 弹出式菜单,支持 ArrowUp/Down/Tab/Enter/Esc (useSlashCommands.ts:38-64)。
- 动态命令通过 `initialize` 响应注入 (messageParser.ts:358-400),与内置列表合并 (slashCommands.ts:45-57)。
- `BUILTIN_SLASH_COMMANDS` 有 23 条(slashCommands.ts:3-27)。

### 7. 增量状态栏 (质量: 中)

**文件**: `src/StatusBarManager.ts`, `webview/components/StatusBar.tsx`

- VSCode 原生状态栏显示连接状态图标 + token 计数 + cost。
- Webview 内部也有独立状态栏。
- 基于 `result` 消息的 `usage` 自动更新。

---

## ⚠️ 部分实现 (说明缺什么)

### 8. 非流式 assistant/user 消息解析 (中优先级)

**文件**: `webview/lib/messageParser.ts:176-218`

**缺失**:
- **完全未处理 `type: "user"` 消息**(入站 `tool_result` 载体)。CLI 在 `--print --stream-json` 模式下,每次工具调用后会回发 `{type:"user", message:{role:"user", content:[{type:"tool_result",...}]}}` 来关闭 tool_use cycle。当前 parser 会完全忽略,导致工具执行结果永远不显示。
- **未处理 stream-only 消息类型**:`SDKStreamlinedTextMessageSchema`、`SDKStreamlinedToolUseSummaryMessageSchema`、`SDKPostTurnSummaryMessageSchema`(coreSchemas.ts:1861)。
- **未处理 `keep_alive`、`control_cancel_request`(外部取消)**。
- **未处理 `SDKStatus: "compacting"`** — 压缩中状态不会显示给用户。
- **未处理 `rate_limit_info` / SDKRateLimitInfoSchema**(coreSchemas.ts:1309)— 速率限制信息丢失。

**需改文件**:
- `packages/vscode-extension/webview/lib/messageParser.ts` — 新增 case `"user"`(提取 `tool_result`,匹配到对应 tool_use_id 的 ToolCallCard,设置 `toolStatus: "done"`、注入 result content 到 ToolCallCard body)。
- `packages/vscode-extension/webview/lib/types.ts` — `ParsedMessage` 增加 `toolUseId?: string`、`toolResult?: {content, isError}`。
- `packages/vscode-extension/webview/components/ToolCallCard.tsx` — 展示 result payload。

**策略**: 两端 (CLI 端无变化,仅 webview parser 重构)
**优先级**: **P0** — 这是导致工具执行看起来"卡住"的核心 bug。

---

### 9. 模型切换(质量: 中)

**文件**: `webview/lib/models.ts`, `webview/components/ModelPicker.tsx`

- `MODELS` 硬编码 5 个条目 (models.ts:3-30),但运行时从 `initialize` 响应拿到的 `sessionModels` 会覆盖 (ModelPicker.tsx:33)。
- `set_model` 通过 `sendSetModel(modelId)` 正确发送。

**缺失**:
- **effort/thinking 档位不可见不可调**:CLI 的 `applied.effort` 支持 `low/medium/high/xhigh/max`(controlSchemas.ts:510),UI 只做 tokens 数字输入(`/think <tokens>`)不显示档位。
- **Fast Mode 开关**:`FastModeStateSchema` 存在 (initialize 响应字段 `fast_mode_state`),UI 无切换按钮。
- **硬编码清单已过时**:列表里没有 `haiku-4-6`、`sonnet-4-7` 等未来型号,应完全依赖 `sessionModels`,保留 hardcode 仅作 fallback。
- **ModelPicker 下拉无上下文窗口提示**:只显示 `200k` 类 label,但不显示 "1M context (beta)" 等能力标记。

**需改文件**:
- `webview/components/ModelPicker.tsx` — 添加 effort 档位子选单。
- `webview/lib/types.ts` — `ModelInfo` 增加 `capabilities?: string[]`。
- `src/ChatViewProvider.ts` — 新增 `set_effort` 分发(目前没有 subtype,需要通过 `apply_flag_settings` 实现)。

**策略**: UI 端为主
**优先级**: **P1**

---

### 10. 权限审批(质量: 中)

**文件**: `webview/components/PermissionCard.tsx`

**缺失**:
- **忽略 `permission_suggestions` 字段**(controlSchemas.ts:112)。CLI 可以返回"允许此会话"、"允许此命令"、"添加到白名单"等建议选项;当前只有二元 allow/deny。终端 CLI 的权限弹窗是多选项的。
- **忽略 `blocked_path`、`decision_reason`**(controlSchemas.ts:113-114)— 不显示被阻挡的路径和阻挡原因。
- **忽略 `agent_id`**(controlSchemas.ts:118)— 不显示是哪个 sub-agent 触发的权限(多-agent 场景下会混乱)。
- **未按工具类型定制展示**:Edit/Write 应该用 diff 视图(RCS 有),Bash 应当语法高亮,WebFetch 应显示 URL 预览;当前全部是通用 JSON。
- **无"允许此次/永不再问/仅本会话"三档**:终端 CLI 提供的 `behavior: "allow_once" / "allow_permanent"` 等信息未利用。

**需改文件**:
- `webview/components/PermissionCard.tsx`
- `webview/lib/messageParser.ts` — 扩展 `PermissionRequest` 接口提取剩余字段。
- `webview/lib/types.ts` — `PermissionRequest` 新增 `suggestions?: PermissionUpdate[]`、`blockedPath?`、`decisionReason?`。

**策略**: UI 端为主
**优先级**: **P0** — 直接影响安全决策质量。

---

### 11. 上下文使用(质量: 中)

**文件**: `webview/components/ContextUsageBar.tsx`, `App.tsx:233-255`

**缺失**:
- `SDKControlGetContextUsageResponseSchema` (controlSchemas.ts:205-306) 返回 15+ 个字段:`gridRows`、`memoryFiles`、`mcpTools`、`deferredBuiltinTools`、`systemTools`、`systemPromptSections`、`agents`、`slashCommands`、`skills`、`messageBreakdown`、`apiUsage`、`autoCompactThreshold`、`isAutoCompactEnabled` 等。
- 当前 UI 只显示"总百分比"和几行 categories(作为 system 消息文本),完全没有可视化。
- `ContextUsageBar` 基于 `usage.input + usage.output / maxTokens` 计算,但 `maxTokens` 用的是 hardcoded model map,不是 CLI 实际返回的 `rawMaxTokens`/`maxTokens`,会在 1M context beta 场景下完全错误。
- 无 auto-compact 阈值可视化。

**需改文件**:
- `webview/components/ContextUsageBar.tsx` — 重写为完整的分类堆叠条 + 悬停明细。
- 新增 `webview/components/ContextBreakdownDialog.tsx` — 类似终端 `/context` 命令的网格视图。

**策略**: UI 端
**优先级**: **P1**

---

### 12. MCP 状态(质量: 低)

**文件**: `App.tsx:187-206`

**缺失**:
- 只渲染为 system 消息的文本列表。没有独立面板/侧栏。
- 无 reconnect/toggle/重启按钮(尽管 CLI 已支持 `mcp_reconnect`、`mcp_toggle` subtype)。
- 无每服务器的工具列表下钻。
- 无 stderr/错误详情展开。

**需改文件**:
- 新增 `webview/components/McpPanel.tsx`。
- `src/ChatViewProvider.ts` — 分发 `mcp_reconnect`/`mcp_toggle` 消息。
- `src/CLIProcess.ts` — 新增 `sendMcpReconnect(name)`、`sendMcpToggle(name, enabled)` 封装。

**策略**: 两端
**优先级**: **P2**

---

### 13. 斜杠命令(质量: 低)

**文件**: `src/ChatViewProvider.ts:186-410`

**已真实触发**: `/model`、`/config`、`/settings`、`/permissions`、`/mcp`、`/context`、`/agents`、`/clear`、`/interrupt`、`/help`、`/status`、`/think`。

**占位/错误处理**:
- `/doctor`、`/hooks`、`/status-line`、`/terminal-setup` — 直接返回"需要终端"(L364-378)。
- `/login`、`/logout` — 同上。
- `/bug` — 返回 GitHub issue 链接(L394-405)。
- `/compact` — 在 `/help` 里列出了,但 **没有实现**,用户输入会直接 fall through 到 CLI 作为普通 prompt。
- `/cost` — `/help` 列出,**未实现**。
- `/poor`、`/fast`、`/vim`、`/review`、`/memory`、`/bashes` — `/help` 列出,**未实现**。
- 动态斜杠命令(来自 plugins / reload_plugins 响应)虽然能出现在菜单中,但**它们的 arg 补全、模板、注入文案**(例如 skill-specific 的参数表单)全部没有。

**需改文件**:
- `src/ChatViewProvider.ts` — 把 `/compact` 路由到 `sendControlRequest("compact")`(需检查 CLI 是否有该 subtype,目前 SDK schema 中无;可改为发送 `/compact` 作为 user_input 由 CLI 的斜杠命令路由器处理)。
- `/cost` 同样应作为 user_input 透传到 CLI(CLI 内部有处理)。
- 把 "not supported" 占位改为 "fallback 到 user_input 透传"—— CLI 收到 `/compact` 等命令时有自己的处理逻辑。

**策略**: CLI 端(透传)+ UI 端(文档化支持列表)
**优先级**: **P0** — `/compact` 对长对话必不可少。

---

### 14. 快捷键(质量: 低)

**文件**: `webview/components/PromptInput.tsx:51-77`, `package.json:63-86`

**已支持**:
- Enter 发送、Shift+Enter 换行、Esc 中断(同一菜单可关闭菜单)。
- VSCode 原生快捷键:Ctrl+Escape focus、Ctrl+Shift+N new chat、Ctrl+Shift+L 发送选区。

**缺失**:
终端 CLI 默认绑定(`src/keybindings/defaultBindings.ts`)有下列关键项在 VSCode 扩展中完全缺失:

| 快捷键 | 终端 CLI 动作 | VSCode 扩展状态 |
|--------|---------------|----------------|
| `Shift+Tab` | cycleMode(default/plan/acceptEdits/bypass) | ❌ 缺失 — 极其高频 |
| `Esc Esc` 双击 | 回滚到上一 user message + rewind 文件 | ❌ 缺失 |
| `Ctrl+R` | history:search | ❌ 缺失 |
| `Ctrl+O` | toggleTranscript / verbose | ❌ 缺失 |
| `Ctrl+T` | toggleTodos | ❌ 缺失 |
| `Ctrl+G` / `Ctrl+X Ctrl+E` | externalEditor(大段输入) | ❌ 缺失 |
| `Ctrl+S` | chat:stash(暂存当前草稿) | ❌ 缺失 |
| `Ctrl+_` / `Ctrl+Shift+-` | undo(回滚到上轮) | ❌ 缺失 |
| `Up / Down` | history:previous/next | ❌ 缺失 — prompt 历史导航 |
| `Alt+V` (Win) / `Ctrl+V` | imagePaste | ❌ 缺失(图片功能整体不存在) |
| `Meta+P` | modelPicker | ⚠️ 有 UI 但无快捷键 |
| `Meta+O` | fastMode toggle | ❌ 缺失 |
| `Meta+T` | thinking toggle | ❌ 缺失 |
| `Ctrl+X Ctrl+K` | killAgents | ❌ 缺失 |

**需改文件**:
- `webview/components/PromptInput.tsx` — 扩展 `handleKeyDown` 处理上述组合键。
- `packages/vscode-extension/package.json` — `contributes.keybindings` 注册。
- `src/ChatViewProvider.ts` — 新增对应消息分发。
- 新增 `webview/hooks/usePromptHistory.ts` — Up/Down 浏览历史 prompt。

**策略**: 两端
**优先级**: **P0**(Shift+Tab)、**P1**(Up/Down/Ctrl+R/Esc Esc)、**P2**(其他)

---

### 15. 状态栏模式显示(质量: 中)

**文件**: `src/StatusBarManager.ts`, `webview/components/StatusBar.tsx`

**缺失**:
- 状态栏没有显示当前 **permissionMode**(default / plan / acceptEdits / bypassPermissions)。虽然可以通过 settings.json 配置,但运行时改变(Shift+Tab 切换或 `/permissions xxx` 命令)后用户完全看不到当前模式。
- 没有显示 **effort 档位**(low/medium/high/xhigh/max)。
- 没有显示 **fast mode 状态**。
- 没有显示 **session_id**(用于恢复会话)。

**需改文件**:
- `webview/components/StatusBar.tsx` — 新增 mode badge、effort badge。
- `App.tsx` — 订阅 settings 变更,更新 mode state。

**策略**: UI 端
**优先级**: **P0**

---

### 16. 会话历史(质量: 极低)

**文件**: `src/HistoryManager.ts`, `ChatViewProvider.ts:164-182`

**已实现**:
- `HistoryManager` 结构完整(getAll/add/get/remove/clear/getRecent)。
- `ChatViewProvider` 转发 `get_history` / `save_history` 消息。

**缺失**:
- **`HistoryEntry` 从未被 webview 主动 save**—— 搜索 `save_history` 在 webview 侧零调用位置(hooks/useCLI.ts 中 `getHistory` 能发送,但代码里从未调用,也没有 `saveHistory` 封装)。历史永远是空的。
- **UI 侧完全没有历史面板/侧栏**。RCS 有 `SessionSidebar.tsx` 按今天/昨天/更早分组,VSCode 零实现。
- **无法恢复已结束会话** — `newChat()` 直接 kill 旧 CLI 启新的,没传 `--resume <sessionId>`。
- `--session-id` / `--continue` CLI 参数未使用。

**需改文件**:
- 新增 `webview/components/HistorySidebar.tsx`。
- 新增 `webview/hooks/useHistory.ts`。
- `src/CLIProcess.ts` — `start()` 接受可选 `sessionId` 参数,传 `--resume <id>` 或 `--continue`。
- `src/ChatViewProvider.ts` — 自动在 `result` 或 streaming done 后 `save_history`。
- `webview/hooks/useCLI.ts` — 新增 `saveHistory` 封装。

**策略**: 两端
**优先级**: **P1**

---

### 17. VSCode 编辑器集成(质量: 中)

**已实现**: 右键菜单发送选区/文件、侧边栏新聊天、Ctrl+Shift+L 发送选区。

**缺失**:
- **@ 文件引用**:PromptInput 没有识别 `@filename` 的 autocomplete(RCS 虽然也没做,但终端 CLI 有)。
- **Diff/编辑审计**:当 CLI 建议的 Edit 执行后,没有自动打开 VSCode 的 diff 视图让用户审阅(虽然 `applyDiff` 有极简实现,但不主动触发)。`ExitPlanMode` 的 plan 也无 VSCode diff 预览。
- **上下文自动同步**:VSCode 活跃编辑器变化时不会通知 CLI(终端 CLI 有 `selection_changed` / `active_file_changed` IDE integration hook)。
- **`ide-mcp` / IDE integration hook**:`src/hooks/useIDEIntegration.tsx` 存在,VSCode 扩展却没有作为 IDE 端接入它(应该作为 MCP server 暴露 `getOpenTabs`、`getDiagnostics`、`applyEdits` 等工具给 CLI)。
- **诊断信息**:`mcp__ide__getDiagnostics` 是标准 IDE MCP 协议,扩展没有启动该 MCP server。
- **多编辑器 tab 追踪**。

**需改文件**:
- 新增 `src/IdeMcpServer.ts` — 在扩展进程中起一个 MCP server,CLI 通过 stdio 或 unix socket 连接。
- `src/CLIProcess.ts` — 启动时自动注册 `mcp_set_servers`,把 IDE MCP server 注入 CLI。
- `webview/components/PromptInput.tsx` — 识别 `@` 触发文件 picker(用 `vscode.workspace.findFiles`)。

**策略**: 两端(特别是 MCP server 实现)
**优先级**: **P1**

---

## ❌ 完全缺失 (需要新增)

### 18. 图片/文件附件(多模态)

**当前状态**: webview 完全没有图片/附件 UI;PromptInput 没有 paste 处理;CLIProcess 的 `sendUserMessage` 只发送纯文本 (CLIProcess.ts:272-282)。

**Anthropic API 支持**: `content` 数组可包含 `{type: "image", source: {type: "base64", media_type, data}}`。

**RCS 实现参考**: `packages/remote-control-server/web/components/chat/ChatInput.tsx:117-138` 有完整 paste/file upload/压缩/预览/删除。

**需新增文件**:
- `webview/components/ImageAttachment.tsx` — 缩略图预览 + 删除按钮。
- `webview/lib/imageUtils.ts` — paste 事件处理 + base64 编码 + 压缩(可用 `browser-image-compression`)。
- `src/CLIProcess.ts` — 修改 `sendUserMessage(text, images?)` 支持多模态 content 数组。
- `src/EditorBridge.ts` — 新增 `getImageFromClipboard()` 方法(可用 `vscode.env.clipboard.readImage()` — 注意 VSCode API 本身不直接支持,需用临时文件)。

**策略**: 两端
**优先级**: **P0** — 多模态是基础功能。

---

### 19. Plan 可视化(ExitPlanMode/Todos)

**当前状态**: 零实现。CLI 的 `ExitPlanModeV2Tool`、`TaskCreateTool`、`TaskUpdateTool`、`TaskListTool` 会产生结构化 plan 数据,但 VSCode 扩展把它们当作普通 `tool_use` 渲染。

**RCS 实现参考**: `packages/remote-control-server/web/components/chat/PlanView.tsx` (143 行)— 带进度条、状态图标、优先级徽章的完整 UI。

**CLI 协议**: `session/update plan` 消息类型(ACP 协议),以及 `update_plan` subtype。

**需新增文件**:
- `webview/components/PlanView.tsx` — 复刻 RCS 版本。
- `webview/components/TodosPanel.tsx` — 持久化 Todo 列表侧栏。
- `webview/lib/messageParser.ts` — 识别 tool_use 中 `name === "ExitPlanModeV2" / "TaskCreate" / "TaskUpdate"` 并派发特殊 action。
- `webview/lib/types.ts` — 新增 `PlanEntry`、`TodoItem` 类型。

**策略**: UI 端(CLI 输出已够用)
**优先级**: **P0** — plan/todos 是 Claude Code 的核心工作流。

---

### 20. Shift+Tab 模式循环 / PermissionMode 运行时切换

**当前状态**: permissionMode 只能通过 VSCode settings.json 配置,或 `/permissions plan` 等命令手动切换,**且需要重启 CLI 才生效**(因为是启动参数)。

**终端 CLI**: Shift+Tab 循环 default → plan → acceptEdits → bypassPermissions,热切换,不重启。

**需新增文件**:
- `webview/components/ModeBadge.tsx` — 显示当前模式,点击循环。
- `webview/components/PromptInput.tsx` — 绑定 Shift+Tab 触发循环。
- `src/ChatViewProvider.ts` — 使用 `sendSetPermissionMode` 热切换(已有方法 CLIProcess.ts:351-353)。
- `src/extension.ts` — 注册 `ccb.cycleMode` 命令。

**策略**: 两端,但 CLI 侧已就绪
**优先级**: **P0**

---

### 21. 转录/滚动/搜索/导航

**当前状态**: `MessageList.tsx` 只有自动滚动到底部(MessageList.tsx:21-41)。

**缺失**:
- **搜索**:无 Ctrl+F 搜索消息内容。
- **消息导航**:无上一条/下一条 user message 跳转(终端 CLI 的 Ctrl+Up/Down)。
- **折叠/展开长消息**:无长消息折叠。
- **时间轴/分段**:无"今天/昨天"分隔。
- **复制整条消息**:无消息级复制按钮(只有 CodeBlock 内有 Copy)。
- **重试**:无"重发此 prompt"按钮。
- **编辑 user message + fork 对话分支**:无。
- **transcript 导出**:无"复制到剪贴板 / 保存为 markdown"功能。
- **verbose 切换**:无 Ctrl+O 对应的原始 JSON 查看模式。

**需新增文件**:
- `webview/components/TranscriptSearch.tsx`。
- `webview/components/MessageActionsMenu.tsx`(悬浮在每条消息上的编辑/重试/复制/删除)。
- `webview/hooks/useMessageNavigation.ts`。

**策略**: UI 端
**优先级**: **P2**(搜索)、**P1**(编辑+重试+复制)

---

### 22. Rewind / Esc Esc 文件回滚

**当前状态**: CLI 的 `SDKControlRewindFilesRequestSchema` (controlSchemas.ts:308) 支持回滚到指定 user_message_id + dry_run 预览,VSCode 扩展**完全未实现**。

**需新增**:
- 消息编辑菜单中 "Rewind to here" 按钮。
- `webview/hooks/useCLI.ts` — 新增 `rewindFiles(userMessageId, dryRun)` 。
- `src/CLIProcess.ts` — 新增 `sendRewindFiles` 封装。
- `src/ChatViewProvider.ts` — 处理 `rewind_files` 响应(显示文件变更列表 + 二次确认)。

**策略**: 两端
**优先级**: **P1**

---

### 23. Hook 系统 / 用户自定义 hooks

**当前状态**: CLI 支持 `SDKControlInitializeRequestSchema` 接受 `hooks` 配置 (controlSchemas.ts:62)、`SDKHookCallbackRequestSchema` 回调 (L363)。VSCode 扩展的 `sendInitialize` 传空对象,**不注册任何 hook**。

**影响**:
- 无法实现 VSCode 侧的 PreToolUse/PostToolUse(比如"Edit 后自动 prettier")。
- 无法把 VSCode 的 Problems panel 作为 PostToolUse hook 反馈给 CLI。

**需新增**:
- `src/hookRegistry.ts` — 管理用户配置的 VSCode 特有 hooks。
- `src/ChatViewProvider.ts` — 在 `sendInitialize` 时传入 hooks 配置,监听 `hook_callback` 请求并响应。

**策略**: 两端
**优先级**: **P2**

---

### 24. Elicitation(MCP 用户输入请求)

**当前状态**: CLI 的 `SDKControlElicitationRequestSchema` (controlSchemas.ts:522) 用于 MCP server 反向请求用户填表单 / 打开 URL 认证。VSCode 扩展不处理 → **MCP OAuth / MCP 用户表单全部卡死**。

**需新增**:
- `webview/components/ElicitationDialog.tsx` — 动态表单渲染(基于 `requested_schema`)/ URL 跳转。
- `src/ChatViewProvider.ts` — 捕获 elicitation 请求 + 回传 action=accept/decline/cancel + content。

**策略**: 两端
**优先级**: **P1**(MCP OAuth 场景高频)

---

### 25. Agent 列表面板 + 任务状态

**当前状态**: `initialize` 响应的 `agents` 数组只存在 `state.sessionAgents` 里,**UI 从未展示**。

**需新增**:
- `webview/components/AgentsPanel.tsx` — 展示可用 agents,点击触发 `TaskCreateTool`。
- `webview/components/TaskStatusPanel.tsx` — 展示 running sub-agent 任务。

**策略**: UI 端
**优先级**: **P2**

---

### 26. 图片/diff 视图 + VSCode diff editor 集成

**当前状态**: `applyDiff` 只提取 `+` 行插入 (EditorBridge.ts:48-71),**完全不是真正的 diff apply**。

**需新增**:
- 使用 `vscode.commands.executeCommand('vscode.diff', leftUri, rightUri)` 打开真正的 diff 视图。
- 在 Edit 工具 result 中提取 before/after,自动弹 diff 让用户审阅后应用。

**策略**: VSCode 端为主
**优先级**: **P1**

---

### 27. Keep-alive / 长连接健康

**当前状态**: 扩展不发送 `{type: "keep_alive"}` 消息,CLI 也不处理。长时间 idle 的会话可能被系统级看门狗杀死。

**需新增**: `src/CLIProcess.ts` — 每 30s 发 keep_alive。

**优先级**: **P2**

---

### 28. 成本/用量累计视图

**当前状态**: 只显示最后一轮的 `result.usage`。

**缺失**:
- 整个 session 累计 token/cost。
- 按 category(input/output/cache/cache_creation)分解。
- 跨会话历史统计。

**需新增**:
- `webview/components/UsageDashboard.tsx`。
- `src/HistoryManager.ts` — 持久化累计数据。

**优先级**: **P2**

---

### 29. MCP OAuth / Login / Logout

**当前状态**: `/login`、`/logout` 斜杠命令直接拒绝(ChatViewProvider.ts:380-392),提示用户去终端。

**问题**: 用户在 VSCode 扩展中完全无法配置账号;首次安装没法开箱即用。

**需新增**:
- `webview/components/LoginPanel.tsx` — OAuth 流程(跳浏览器 + token 回填)。
- `src/ChatViewProvider.ts` — 处理 login 流程(可通过 elicitation 机制走 URL mode)。

**优先级**: **P1**

---

### 30. 通知系统

**当前状态**: 0 个通知 — 当 CLI 需要权限时(focus 在其他地方),用户毫无感知。

**需新增**:
- 使用 `vscode.window.showInformationMessage` 在以下时机触发:权限请求到达、长任务完成、错误。
- 可配置的通知开关(settings.json)。

**优先级**: **P1**

---

### 31. 配置面板(替代 settings.json)

**当前状态**: 用户只能通过 `settings.json` 改 `ccb.permissionMode`。效率低、可发现性差。

**缺失**:
- 无 Webview 内的配置面板(类似 RCS `IdentityPanel.tsx`、`TokenManagerDialog.tsx`)。
- 无 API provider 切换 UI(OpenAI/Gemini/Grok 兼容层用户不可用)。
- 无 token budget / poor mode 切换开关。

**需新增**: `webview/components/SettingsPanel.tsx`。

**优先级**: **P2**

---

## 最严重的 10 个缺口(按影响排序)

| # | 缺口 | 影响 | 优先级 | 关键文件 |
|---|------|------|--------|----------|
| 1 | **messageParser 不处理 `type: "user"` 消息(tool_result 载体)** | 每次工具调用后结果永不显示,UI 显示"工具在运行中"卡住 | **P0** | `webview/lib/messageParser.ts:176` |
| 2 | **Shift+Tab 模式循环 + 状态栏无模式显示** | 用户完全不知道当前在哪个权限模式,且无法热切换 | **P0** | `webview/components/PromptInput.tsx`, `StatusBar.tsx`, `package.json` |
| 3 | **Plan/Todos 可视化完全缺失** | ExitPlanMode + Task 工具输出全部显示为原始 JSON,工作流核心能力不可用 | **P0** | 新增 `webview/components/PlanView.tsx`、`TodosPanel.tsx` |
| 4 | **图片/附件多模态支持为零** | 用户无法粘贴截图,ChatInput、CLIProcess.sendUserMessage 全部纯文本 | **P0** | `webview/components/PromptInput.tsx`, `src/CLIProcess.ts:272` |
| 5 | **权限卡忽略 suggestions/blocked_path/decision_reason/agent_id** | 用户无法做细粒度决策(只有二元 allow/deny),多 agent 场景信息混乱 | **P0** | `webview/components/PermissionCard.tsx`, `messageParser.ts:291` |
| 6 | **/compact、/cost、/poor、/fast、/review、/memory 等斜杠命令全是占位或 fallthrough** | 长对话无法压缩,成本不可见,budget mode 不可切换 | **P0** | `src/ChatViewProvider.ts:186-410` |
| 7 | **prompt 历史 Up/Down 导航 + Ctrl+R 搜索完全缺失** | 相比终端 CLI 交互效率极低 | **P1** | 新增 `webview/hooks/usePromptHistory.ts`、`webview/components/PromptInput.tsx` |
| 8 | **会话历史 save 从未被调用,历史面板不存在** | `HistoryManager` 写了个空壳,`newChat()` 永远丢失上一会话;无法 `--resume` | **P1** | `src/ChatViewProvider.ts`, 新增 `webview/components/HistorySidebar.tsx` |
| 9 | **Rewind / Esc Esc 文件回滚完全缺失** | 误操作后无法回滚,必须手动 git reset | **P1** | 新增 `src/CLIProcess.ts` sendRewindFiles, MessageActionsMenu |
| 10 | **IDE MCP server 未集成,@ 文件引用、Problems 面板、诊断、真正 diff 视图均无** | VSCode 作为 IDE 的优势几乎被抹掉,和终端 CLI 体验无差 | **P1** | 新增 `src/IdeMcpServer.ts`, 扩展 CLI 启动流程 |

---

## 附录: 协议覆盖度对照表

| control_request subtype | CLI 支持 | VSCode 扩展支持 | 说明 |
|------------------------|---------|----------------|------|
| `initialize` | ✅ | ⚠️ 仅空请求 | 未传 hooks/agents/systemPrompt |
| `interrupt` | ✅ | ✅ | |
| `can_use_tool` | ✅ | ⚠️ 部分字段丢失 | suggestions/blocked_path/decision_reason 未解析 |
| `set_permission_mode` | ✅ | ✅ | 但无 UI 触发入口(除 /permissions 命令) |
| `set_model` | ✅ | ✅ | 但 effort 档位缺失 |
| `set_max_thinking_tokens` | ✅ | ✅ | 仅通过 /think 命令 |
| `mcp_status` | ✅ | ✅ | UI 展示弱 |
| `get_context_usage` | ✅ | ⚠️ | 仅利用 5% 字段 |
| `hook_callback` | ✅ | ❌ | |
| `mcp_message` | ✅ | ❌ | |
| `rewind_files` | ✅ | ❌ | |
| `cancel_async_message` | ✅ | ❌ | |
| `seed_read_state` | ✅ | ❌ | |
| `mcp_set_servers` | ✅ | ❌ | 阻碍了 IDE MCP server 注入 |
| `reload_plugins` | ✅ | ⚠️ | 仅 /agents 命令触发,响应处理不完整 |
| `mcp_reconnect` | ✅ | ❌ | |
| `mcp_toggle` | ✅ | ❌ | |
| `stop_task` | ✅ | ❌ | |
| `apply_flag_settings` | ✅ | ❌ | |
| `get_settings` | ✅ | ✅ | |
| `elicitation` | ✅ | ❌ | MCP OAuth 等反向输入场景失效 |

**覆盖度**: 21 个 subtype 中完整支持 5 个(24%),部分 5 个(24%),完全缺失 11 个(52%)。

---

## 建议的迭代路线图

### Sprint 1 (P0 基线修复) — 1 周
1. messageParser 处理 `type: "user"` tool_result 消息 [#1]
2. Shift+Tab 模式循环 + 状态栏 mode badge [#2]
3. Plan/Todos 可视化 [#3]
4. PermissionCard 扩展字段 [#5]
5. `/compact`、`/cost` 透传到 CLI [#6 部分]

### Sprint 2 (P0 补完) — 1 周
6. 图片粘贴 + 多模态 sendUserMessage [#4]
7. 斜杠命令 fallthrough 重构 [#6 完整]
8. prompt 历史 Up/Down 导航 [#7]

### Sprint 3 (P1 交互升级) — 2 周
9. 会话历史侧栏 + resume [#8]
10. Rewind / MessageActionsMenu [#9]
11. IDE MCP server [#10]
12. Login 流程 + 通知

### Sprint 4 (P2 增强) — 2 周
13. ContextBreakdownDialog、UsageDashboard
14. MCP 面板、AgentsPanel、TaskStatusPanel
15. 转录搜索、verbose toggle、消息编辑+fork
16. Elicitation dialog、hook 注册

---

**审计结束**
