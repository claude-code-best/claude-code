# VSCode 扩展 — 项目内同类 UI 实现研究报告

研究对象：项目内已有的 Claude Code CLI 表现层实现。目标是把可复用的协议/组件/连接模式抽象出来给 `packages/vscode-extension/` 参考。

本次只读研究，覆盖：

- `packages/remote-control-server/` — 自托管 Web 控制台（React 19 + Vite + Radix UI）
- `packages/acp-link/` — ACP 代理 WebSocket 桥（把 Claude Code 的 stdio ACP agent 暴露成 WS）
- `src/services/acp/` — Claude Code 进程里真正跑 ACP 协议的 agent 实现
- `src/bridge/` — `claude remote-control` 命令：轮询 Anthropic 官方 bridge API

## 结论先行：推荐 VSCode 扩展用 ACP 协议对接 CLI

**推荐用 ACP**（Agent Client Protocol via stdio），复用 `src/services/acp/` 的现成 agent + 搬运 `packages/remote-control-server/web/src/acp/` 的 `ACPClient` / 协议类型到扩展侧 WebView（或 extension 主进程）。

三句话理由：

1. **协议已经为 GUI 设计过**：session/update、tool_call/tool_call_update、permission_request、available_commands_update、plan、current_mode_update、usage_update — 这些事件对应的 UI 渲染代码 RCS Web 已经写好了，**TypeScript 可直接移植到 webview**。
2. **Claude Code 官方 CLI 带 `claude acp` 子命令**：直接 `spawn('claude', ['acp'])` 就是一个 stdio NDJSON 的 AcpAgent，`extension.ts` 拿 child process 的 stdin/stdout 通过 `@agentclientprotocol/sdk` 的 `ClientSideConnection` 就能对接（`packages/acp-link/src/server.ts` 行 248-286 是现成范例）。
3. **比 Bridge/Stream-JSON 都轻**：Stream-JSON (`-p --output-format stream-json`) 是单向输出流，没有权限交互、没有 `session/update` 的结构化 tool_call 模型、没有 model/mode 切换；Bridge 是 Anthropic 官方云端轮询协议，需要 OAuth、JWT、`environments-2025-11-01` beta header，对本地 VSCode 扩展毫无意义。

备选方案（仅当 ACP 在某场景受限时）：把 VSCode 当 RCS 的另一个 Web Client，通过 WS 连 `/acp/ws`；但这额外引入一个服务进程，不建议作为首选。

---

## RCS Web UI 功能对标表

| 功能 | RCS 实现方式 | 代码位置（绝对路径） | VSCode 扩展可复用吗？ |
|------|-----------|-------------------|----|
| **启动 CLI 会话** | UI 发 `{type:"connect"}` → acp-link `spawn(AGENT_COMMAND, AGENT_ARGS, {stdio:["pipe","pipe","inherit"]})` → `acp.ClientSideConnection(createClient, ndJsonStream(input,output))` → `connection.initialize({protocolVersion, clientInfo, clientCapabilities:{fs:{readTextFile:true,writeTextFile:true}}})` | `E:\Source_code\Claude-code-bast\packages\acp-link\src\server.ts:223-322` `handleConnect()` | 可直接复用 spawn + ndJsonStream 模板。扩展端把 `AGENT_COMMAND` 换成 `"claude"`、`AGENT_ARGS` 换成 `["acp"]` |
| **创建 session** | UI 发 `{type:"new_session", payload:{cwd, permissionMode}}` → acp-link 把 `permissionMode` 塞进 `_meta` 再 `connection.newSession({cwd, mcpServers:[], _meta:{permissionMode}})` → 返回 `{sessionId, models, modes, configOptions}` | `E:\Source_code\Claude-code-bast\packages\acp-link\src\server.ts:324-357` `handleNewSession()` | 直接复用。注意 `permissionMode` 必须放在 `_meta`，AcpAgent 会从 `params._meta.permissionMode` 取 |
| **模型切换** | UI 调 `client.setSessionModel(modelId)` → 发 `{type:"set_session_model", payload:{modelId}}` → acp-link `connection.unstable_setSessionModel({sessionId, modelId})` → agent 端 `session.queryEngine.setModel(modelId)` → 广播 `model_changed` 事件 | 前端: `packages\remote-control-server\web\src\acp\client.ts:600-605` `setSessionModel()` 后端桥: `packages\acp-link\src\server.ts:552-581` `handleSetSessionModel()` Agent: `src\services\acp\agent.ts:380-391` `unstable_setSessionModel()` | 可直接复用。`modelState` 在 `session_created`/`session_loaded`/`session_resumed` payload 里一次性返回，无需轮询；`useModels` hook 本身也可以照抄 |
| **权限模式切换** | UI 改本地 state（持久化到 `localStorage["acp_permission_mode"]`）→ 下一次 `new_session` 时通过 `_meta.permissionMode` 传给 agent。**切换已有 session 的 mode** 走 `conn.setSessionMode({sessionId, modeId})` 或 `conn.setSessionConfigOption({sessionId, configId:"mode", value})`；agent 收到后 `applySessionMode()` 同步 `modes.currentModeId` 和 `appState.toolPermissionContext.mode`，并回推 `session/update {sessionUpdate:"current_mode_update", currentModeId}` | 前端选择器: `packages\remote-control-server\web\components\ChatInterface.tsx:69-128` `PermissionModeSelector` Agent 同步: `src\services\acp\agent.ts:674-688` `applySessionMode()` ExitPlanMode 特殊流: `src\services\acp\permissions.ts:157-243` `handleExitPlanMode()` | 6 种 mode 枚举 (`default`/`acceptEdits`/`bypassPermissions`/`plan`/`dontAsk`/`auto`) 是 Claude Code 内部定义，直接复用枚举+选择器 UI 即可；bypassPermissions 可用性由 `!IS_ROOT \|\| IS_SANDBOX` 决定 |
| **处理 permission_request** | Agent 端 `createAcpCanUseTool()` 构造 `PermissionOption[]`（Always Allow / Allow / Reject，ExitPlanMode 特殊：bypass/auto/acceptEdits/default/plan）→ `conn.requestPermission({sessionId, toolCall, options})` → acp-link 端 `createClient().requestPermission()` 产生 `requestId`，发 `{type:"permission_request", payload:{requestId, sessionId, options, toolCall}}` 给 UI，Promise 挂起等待 → UI 发 `{type:"permission_response", payload:{requestId, outcome:{outcome:"selected",optionId} \| {outcome:"cancelled"}}}` → acp-link `handlePermissionResponse` 通过 `requestId` 查 `pendingPermissions` 并 resolve Promise → agent 端 optionId 映射回 `{behavior:"allow",updatedInput}` 或 `{behavior:"deny",message}` | 前端: `packages\remote-control-server\web\components\ChatInterface.tsx:200-251` `handlePermissionRequest()` + `632-667` `handlePermissionResponse()` 后端桥: `packages\acp-link\src\server.ts:148-211` `createClient().requestPermission` / `handlePermissionResponse` Agent 映射: `src\services\acp\permissions.ts:40-155` `createAcpCanUseTool()` | 核心协议完全可用。**ACP 的 `requestPermission` 是 JSON-RPC request**（有返回值），SDK 自动处理 requestId 匹配；复用 SDK 后扩展端不需要手动管理 `pendingPermissions` Map |
| **斜杠命令菜单** | Agent 启动 session 时 `sendAvailableCommandsUpdate()` 从 `session.commands`（`getCommands(cwd)` 加载）过滤出 `cmd.type==="prompt" && !cmd.isHidden && cmd.userInvocable!==false`，格式化成 `{name, description, input?:{hint}}` → 发 `session/update {sessionUpdate:"available_commands_update", availableCommands}` → UI 的 `useCommands` hook 订阅 `setAvailableCommandsChangedHandler`，ChatInput 检测到 `/` 前缀打开 `CommandMenu` floating panel（ArrowUp/ArrowDown/Enter 键盘导航 + 前缀过滤） | 推送: `src\services\acp\agent.ts:727-750` `sendAvailableCommandsUpdate()` Client hook: `packages\remote-control-server\web\src\hooks\useCommands.ts` CommandMenu UI: `packages\remote-control-server\web\components\chat\CommandMenu.tsx` ChatInput 联动: `packages\remote-control-server\web\components\chat\ChatInput.tsx:98-149` | CommandMenu 组件约 140 行，纯 React + Tailwind，移植到 webview 要替换图标库（lucide）和样式 tokens，其他直接可用 |
| **消息流渲染** | ACP 统一语义事件 → ChatInterface flat `ThreadEntry[]` 列表（类似 Zed 的 `Vec<AgentThreadEntry>`），事件处理器根据 last-entry 是否同类进行 append/upsert：`agent_message_chunk` → 续写最近 AssistantMessage 的 `chunks[last].text`；`agent_thought_chunk` → 追加 `{type:"thought",text}`；`tool_call` → 新建 `ToolCallEntry` 或 upsert 已存在；`tool_call_update` → 按 toolCallId 合并 status/content；`plan` → 替换整个 PlanDisplayEntry | 核心: `packages\remote-control-server\web\components\ChatInterface.tsx:253-493` `handleSessionUpdate()` 类型定义: `packages\remote-control-server\web\src\lib\types.ts`（ThreadEntry 联合类型） | React reducer 模式可直接复用；只要 ACP 协议不变，webview 端把状态容器换成 zustand/jotai 就行 |
| **SSE/WebSocket 消息协议** | RCS 实际上有**两套独立协议**：(1) **Web 客户端 ↔ RCS**：`GET /web/sessions/:id/events` SSE 流（`text/event-stream`），`POST /web/sessions/.../events`/`/control`/`/interrupt`（REST），`storeBindSession` 把 session 绑定 uuid。(2) **RCS ↔ acp-link ↔ Agent**：`/acp/ws` NDJSON WebSocket，消息类型见 `ProxyMessage`/`ProxyResponse` 并集；acp-link 端 `relay-handler` 订阅 `getAcpEventBus(channelGroupId).subscribe(...)` 转发 `direction:"inbound"` 的事件给前端，前端发的 `outbound` 事件通过 `sendToAgentWs()` 转发到 agent 的 WS | Web↔RCS SSE: `packages\remote-control-server\src\routes\web\sessions.ts:98-116` + `packages\remote-control-server\web\src\api\sse.ts` Web↔RCS REST: `packages\remote-control-server\src\routes\web\control.ts` ACP WS: `packages\remote-control-server\src\transport\acp-ws-handler.ts` 中继: `packages\remote-control-server\src\transport\acp-relay-handler.ts` | **VSCode 扩展不需要 SSE**；走 ACP stdio 直接就是 NDJSON 双向流。ProxyMessage/ProxyResponse 的 union 类型定义（`packages\remote-control-server\web\src\acp\types.ts`）可**全文复制**到扩展 types 文件，只是把 WebSocket 层换成 stdio |

---

## 可直接复用的代码片段

### 1. 协议类型定义（强烈建议整份拷贝）

**源文件：** `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\src\acp\types.ts`（561 行）

这份文件完整定义了：

- `ProxyMessage` / `ProxyResponse` 双向消息 union
- `SessionUpdate` 所有 8 种子类型（`agent_message_chunk` / `agent_thought_chunk` / `user_message_chunk` / `tool_call` / `tool_call_update` / `plan` / `available_commands_update`）
- `ToolCallContent` = `ToolCallContentBlock` | `ToolCallDiffContent` | `ToolCallTerminalContent`
- `ContentBlock` = `TextContent` | `ImageContent` | `ResourceLinkContent`
- `PermissionRequestPayload` / `PermissionResponsePayload` / `PermissionOption` / `PermissionOptionKind`
- `PlanEntry` / `PlanEntryStatus` / `PlanEntryPriority`
- `AvailableCommand`
- `SessionModelState` / `ModelInfo`
- `AgentCapabilities` / `PromptCapabilities` / `SessionCapabilities`
- `AgentSessionInfo` / `ListSessionsResponse` / `LoadSessionRequest` / `ResumeSessionRequest`

**复用方式**：直接 copy 到 `packages/vscode-extension/src/acp/types.ts`。注意这份文件内所有字段已对齐官方 `@agentclientprotocol/sdk`，若扩展直接依赖 SDK 则可省掉重复定义，只保留 VSCode 扩展与 webview 之间 postMessage 的内部协议类型。

### 2. ACPClient 类（WebSocket 版本，stdio 版本需小改）

**源文件：** `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\src\acp\client.ts`（768 行）

核心能力：

- `connect()`/`disconnect()`/`DisconnectRequestedError`（区分"主动断开"和"真正出错"）
- `startHeartbeat()` 30 秒 ping，10 秒 pong 超时，连续 2 次丢失断开（webview ↔ host 之间不需要）
- 按事件类型分发：`session_created` → 缓存 `_modelState` / `_promptCapabilities` / `_agentCapabilities`；`session_update` 里 `available_commands_update` → 更新内部 `_availableCommands`；`model_changed` → 改 `_modelState.currentModelId`
- 订阅式 handler：`setConnectionStateHandler` / `setSessionUpdateHandler` / `setPermissionRequestHandler` / `setModelChangedHandler` / `setModelStateChangedHandler` / `setAvailableCommandsChangedHandler` / `setSessionCreatedHandler` / `setSessionLoadedHandler` / `setSessionSwitchingHandler` / `setPromptCompleteHandler` / `setErrorMessageHandler`
- 挂起请求队列：`pendingSessionList` / `pendingSessionLoad` / `pendingSessionResume`，每个都有自己的 timer，断开时统一 reject
- 能力门控：`supportsImages` / `supportsLoadSession` / `supportsResumeSession` / `supportsSessionList` / `supportsSessionHistory` / `supportsModelSelection` getter

**VSCode 扩展改造建议**：

- 把 `ws` 成员换成 `child_process.ChildProcess + ndJsonStream`，或者直接用官方 SDK 的 `ClientSideConnection` 包一层（推荐后者，它把 JSON-RPC + requestPermission 的 req/resp 配对都做了）
- `heartbeat` 去掉
- 其余订阅模型 / 请求状态机 / 能力 getter 全部保留

### 3. React Hooks —— 状态订阅

**源文件：**

- `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\src\hooks\useModels.ts`（111 行）
- `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\src\hooks\useCommands.ts`（39 行）

两者都是"事件驱动 + `localStorage` 持久化选择"的模板，直接 copy 到 webview。`useModels` 里有个关键细节：session 创建后会用 `localStorage.getItem("acp_model_id")` 自动恢复上次选择的模型。

### 4. 消息流处理器 — `handleSessionUpdate` 的 switch

**源文件：** `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\components\ChatInterface.tsx:256-493`

重点规则（Zed 风格）：

- `agent_message_chunk` / `agent_thought_chunk` / `user_message_chunk`：检查 `lastEntry?.type === "assistant_message"`，若同类 chunk 则 append 到最后一段；若换类别（thought ↔ message）则新增一段 chunk
- `tool_call` 使用 **UPSERT** 语义（先 `findToolCallIndex` 从尾向前找）
- `tool_call_update` 找不到对应 ID 时构造一条 failed 占位（跟 Zed 一致）
- `plan` 为**整份替换**，空 entries 表示清空

`findToolCallIndex` 反向扫描（`for (let i = entries.length - 1; i >= 0; i--)`）— 这是 ACP 协议规定的匹配方式，务必保留。

### 5. 权限 UI 映射

**源文件：** `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\components\ChatInterface.tsx:632-667` + `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\components\chat\PermissionPanel.tsx`

`handlePermissionResponse(requestId, optionId, optionKind)` 的关键：

```typescript
const isRejected = optionKind === "reject_once" || optionKind === "reject_always" || optionId === null;
// 对 standalone 权限请求（没有匹配 tool_call 的独立请求）批准后立即 complete
const newStatus = isRejected ? "rejected"
  : entry.toolCall.isStandalonePermission ? "complete"
  : "running";
```

`handlePermissionPanelRespond(requestId, approved)` 根据 approved 分别找 `kind:"allow_once"` 优先、回退 `"allow_always"`；拒绝同理先 `"reject_once"` 后 `"reject_always"`。

### 6. 斜杠命令 CommandMenu

**源文件：** `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\components\chat\CommandMenu.tsx`（138 行）

特性：

- `prefixMatch`（非 fuzzy）
- document-level capture-phase `keydown` 监听处理 Arrow/Enter（避免 textarea 抢焦点）
- `containerRef` 点击外部关闭
- `scrollIntoView({block:"nearest"})` 让 active 项可见

ChatInput 里检测条件是 `value.startsWith("/") && commands?.length > 0`，filter 取 `value.slice(1).split(/\s/)[0]`（第一个空格前的部分）。

### 7. RCSChatAdapter（仅 RCS Web 专用，**不推荐 VSCode 复用**）

**源文件：** `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\src\lib\rcs-chat-adapter.ts`（473 行）

这个是 RCS 自己的 legacy 协议（SSE + bridge 事件 `user`/`assistant`/`tool_use`/`tool_result`/`control_request`）→ ThreadEntry 的转换。**VSCode 走 ACP，不经过这层**。但里面的 `handleEvent` 可以作为 tool_use 内嵌在 assistant message 时的拆分参考。

---

## ACP 协议能力映射

ACP (Agent Client Protocol) 是 Zed/Claude Code/多个 AI 终端共用的协议。相关规范：
- SDK: `@agentclientprotocol/sdk`
- Claude Code 的 agent 实现：`E:\Source_code\Claude-code-bast\src\services\acp\agent.ts`（~800 行）
- Claude Code 的 SDK→ACP bridge：`E:\Source_code\Claude-code-bast\src\services\acp\bridge.ts`（1257 行，核心翻译层）

### AcpAgent 实现的方法（全部可被 VSCode 扩展作为 client 调用）

| ACP 方法 | Claude Code 映射 | 实现位置 |
|---------|-----------------|--------|
| `initialize` | 返回 `{protocolVersion:1, agentInfo, agentCapabilities}`。声明 `promptCapabilities:{image:true, embeddedContext:true}`, `mcpCapabilities:{http:true, sse:true}`, `loadSession:true`, `sessionCapabilities:{fork:{}, list:{}, resume:{}, close:{}}`, `_meta.claudeCode.promptQueueing:true` | `agent.ts:104-148` |
| `authenticate` | no-op，返回 `{}` | `agent.ts:152-155` |
| `newSession` | 调 `createSession(params)` → 设 cwd、`enableConfigs()`、`setOriginalCwd(cwd)`、`process.chdir(cwd)`、构建 `QueryEngine` 并挂 `canUseTool:createAcpCanUseTool(...)` | `agent.ts:159-161` + `441-590` |
| `loadSession` | 读 `~/.claude/projects/.../*.jsonl` 还原消息，构建 session 后调 `replayHistoryMessages()` 把历史重放成 session/update | `agent.ts:177-183` + `592-664` |
| `unstable_resumeSession` | 类似 load 但不 replay | `agent.ts:165-173` |
| `listSessions` | 调 `listSessionsImpl({dir, limit:100})` → 映射为 `{sessionId, cwd, title, updatedAt}` | `agent.ts:187-205` |
| `unstable_forkSession` | 基于 `createSession` 复制一份 | `agent.ts:209-223` |
| `unstable_closeSession` | 调 `cancel({sessionId})` 然后 `sessions.delete(sessionId)` | `agent.ts:227-236` |
| `prompt` | 调 `QueryEngine.submitMessage(text)` → `forwardSessionUpdates(sessionId, sdkMessages, conn, ...)` 把 SDK 的 `assistant`/`stream_event`/`tool_result`/`result` 转成 ACP `session/update` | `agent.ts:240-342` |
| `cancel` | `session.cancelled=true` + `queryEngine.interrupt()` + 清空 pendingMessages 队列 | `agent.ts:346-361` |
| `setSessionMode` | `applySessionMode(sessionId, modeId)` → 同步 `modes.currentModeId` + `appState.toolPermissionContext.mode` | `agent.ts:365-376` |
| `unstable_setSessionModel` | `session.queryEngine.setModel(modelId)` | `agent.ts:380-391` |
| `setSessionConfigOption` | 统一入口处理 `mode`/`model`，回推 `config_option_update` | `agent.ts:395-437` |

### session/update 事件的 8 种子类型（`SessionUpdate` union）

在 `src/services/acp/bridge.ts` 里从 `SDKMessage` 产生：

| sessionUpdate 类型 | 来源 | 说明 |
|---|---|---|
| `agent_message_chunk` | `stream_event: content_block_delta` text_delta / `assistant` 完整消息 | 最常见，助手输出 |
| `agent_thought_chunk` | `stream_event: thinking_delta` | 思考链 |
| `user_message_chunk` | replay 时的 user 消息 | 加载历史用 |
| `tool_call` | `content_block_start: tool_use` 首次出现 | 工具调用开始，附 `toolCallId` / `title` / `kind` / `status:"pending"` / `rawInput` / `content`（含 diff/terminal） |
| `tool_call_update` | 重复 `tool_use` 或 `tool_result` | 更新 status（pending → completed/failed），附 `rawOutput` |
| `plan` | `TodoWrite` 工具调用被特殊拦截 | 整份 `PlanEntry[]`（content/status/priority） |
| `available_commands_update` | `sendAvailableCommandsUpdate` 主动推送 | slash 命令清单 |
| `usage_update` | `result` 消息 | `{used, size, cost}` token 用量 |
| `current_mode_update` | 用户或 ExitPlanMode 切换 mode 时 | 通知 UI 同步 |

### tool_use → ToolInfo 的映射（bridge.ts:58-235）

`toolInfoFromToolUse(toolUse, supportsTerminalOutput, cwd)` 把内部 tool 名字翻译成人类可读 title 和 ACP `ToolKind`：

- `Agent`/`Task` → `think`
- `Bash` → `execute`（附 `terminalId` 或 description）
- `Read` → `read`（title 带显示路径 + offset/limit）
- `Write` → `edit`（附 diff: `{oldText:null, newText}`）
- `Edit` → `edit`（附 diff: `{oldText, newText}`）
- `Glob`/`Grep` → `search`
- `WebFetch`/`WebSearch` → `fetch`
- `TodoWrite` → `think`（但单独处理走 `plan` update）
- `ExitPlanMode` → `switch_mode`
- 其他 → `other`

**webview 端实际渲染 tool_call 时需要这份映射决定 UI**。VSCode 扩展如果只想做极简版，直接用 `title` + `status` + 第一个 `ToolCallContent` 的 diff 区就够了。

### 权限处理流水线（createAcpCanUseTool）

**源文件：** `E:\Source_code\Claude-code-bast\src\services\acp\permissions.ts`（250 行）

调用顺序（一定要复用这个流水线，不要简化）：

1. `tool.name === 'ExitPlanMode'` → 走 `handleExitPlanMode` 特殊多选项（5 个 option），用户选的 `optionId` 如果是 `acceptEdits`/`default`/`auto`/`bypassPermissions` 之一，调 `onModeChange(optionId)` 同步 session mode 并发 `current_mode_update` notification。
2. 有 `forceDecision` → 直接用（coordinator/swarm worker 场景）
3. `hasPermissionsToUseTool()` 跑完整流水线：deny 规则 → allow 规则 → tool 特定检查 → `bypassPermissions`/`dontAsk`/`acceptEdits` 模式 → `auto` 模式的 model classifier
4. 流水线返回 `behavior:'ask'` → 回落到 `conn.requestPermission({sessionId, toolCall, options})`，options 固定 3 个：`Always Allow`/`Allow`/`Reject`
5. 用户 `cancelled` → 返回 `{behavior:'deny', message:'Permission request cancelled by client'}`

**bypassPermissions 可用性判断**（每次渲染 modes 时用到）：
```typescript
const ALLOW_BYPASS = !IS_ROOT || !!process.env.IS_SANDBOX
```

### 权限模式透传（feedback 提过的 applySessionMode）

完整链路：

1. **客户端端**：扩展启动 new_session 时在 `_meta.permissionMode` 里带 mode（也可从 `process.env.ACP_PERMISSION_MODE` 读）
2. **acp-link 端**：`handleNewSession` 读 `params.permissionMode || DEFAULT_PERMISSION_MODE`，拼成 `_meta:{permissionMode}` 传给 `connection.newSession`
3. **agent 端**：`createSession` 从 `params._meta.permissionMode` 取（行 463-468，带 console.log），fallback 到 `settings.json` 的 `permissions.defaultMode`，再 `resolvePermissionMode` 归一化
4. **运行时切换**：`applySessionMode()` 同时改两处 —— `session.modes.currentModeId` 和 `session.appState.toolPermissionContext.mode`，后者是 `hasPermissionsToUseTool` 读取的唯一来源

**警告**：不要只改 `session.modes`，会导致 permission pipeline 还按旧 mode 走。

---

## Bridge API 能力集（`src/bridge/`）

这是 Anthropic 官方云端 bridge 协议，**与 VSCode 本地扩展无关**，仅列出作对照。

**源文件：** `E:\Source_code\Claude-code-bast\src\bridge\bridgeApi.ts`（~800 行），`bridgeMain.ts`（2991 行）

### 必备 header

```typescript
const BETA_HEADER = 'environments-2025-11-01'
headers = {
  Authorization: `Bearer ${accessToken}`,
  'anthropic-version': '2023-06-01',
  'anthropic-beta': 'environments-2025-11-01',
  'x-environment-runner-version': runnerVersion,
  'X-Trusted-Device-Token': trustedDeviceToken  // 可选
}
```

### 端点（BridgeApiClient 接口）

| 端点 | 用途 |
|---|---|
| `POST /v1/environments/bridge` | 注册 bridge environment，返回 `{environment_id, environment_secret}`。body: `{machine_name, directory, branch, git_repo_url, max_sessions, metadata:{worker_type}, environment_id?(resume)}` |
| `GET /v1/environments/{environmentId}/work/poll` | 长轮询领取 work item，返回 `WorkResponse` 或 null |
| `POST /v1/environments/{environmentId}/work/{workId}/ack` | ack work item |
| `POST /v1/environments/{environmentId}/work/{workId}/stop` | 停止 work (force 布尔) |
| `DELETE /v1/environments/bridge/{environmentId}` | 注销 environment |
| `POST /v1/sessions/{sessionId}/archive` | 归档 session |
| `POST /v1/environments/{environmentId}/bridge/reconnect` | 重连 |
| `POST /v1/environments/{environmentId}/work/{workId}/heartbeat` | session 心跳 |

### JWT 认证

- `accessToken` 从 OAuth 拿（`getAccessToken()` 回调）
- 401 → `withOAuthRetry` 调 `onAuth401(staleAccessToken)` 尝试刷新，成功则重试一次
- 最终 401 抛 `BridgeFatalError`（不可重试）
- worker_jwt 由 RCS 自托管版签发（`generateWorkerJwt(sessionId, expiresIn)`），参见 `packages\remote-control-server\src\routes\v2\code-sessions.ts:17-34`

### 会话生命周期

1. `register` → 拿 `environment_id` + `environment_secret`
2. `poll` 循环，拿到 work 后 `decodeWorkSecret(work.secret)` 得到 `claude_code_args`/`mcp_config`/`api_base_url`
3. 用 `sessionRunner` / `sessionSpawner` 起 session 子进程，spawnMode: `single-session` / `worktree` / `same-dir`
4. 运行期通过 `heartbeatWork` 续期
5. 完成后 `ack` / `stopWork`
6. exit 时 `deregisterEnvironment`

**VSCode 扩展不走这条链路**，本地 ACP stdio 即可。

---

## 推荐 VSCode 扩展架构

### 协议层：ACP via stdio

```
┌─────────────────────────┐                      ┌──────────────────────────┐
│ VSCode Extension Host   │                      │  claude CLI child proc   │
│ (Node.js, extension.ts) │  stdio NDJSON (ACP)  │  (spawned as `claude     │
│                         ├◄────────────────────►┤   acp`)                  │
│  ClientSideConnection   │                      │  AgentSideConnection      │
│    @acp/sdk             │                      │    → AcpAgent             │
│                         │                      │    → QueryEngine          │
└─────────────────────────┘                      └──────────────────────────┘
         ▲
         │ postMessage API (vscode.WebviewPanel)
         ▼
┌─────────────────────────┐
│ VSCode Webview (React)  │
│  - ChatView             │
│  - ChatInput + CommandMenu
│  - PermissionPanel      │
│  - ModelSelectorPopover │
│  - PlanDisplay          │
└─────────────────────────┘
```

### 为什么是 ACP（不是 Stream-JSON 也不是 Bridge）

**Stream-JSON (`-p --output-format stream-json`) 不够用：**

- 单向输出，用户输入得靠另一条机制
- 没有 `permission_request` 的请求/响应配对（ACP 用 JSON-RPC request，Stream-JSON 只有 `control_request` 事件，没有协议保证 request_id 配对）
- 没有 `available_commands_update`，扩展只能自己解析 `~/.claude/commands/` 和 `.claude/commands/`（脆弱）
- 没有结构化 `tool_call` + `tool_call_update` 的 UPSERT 模型，需要自己从 `assistant` / `tool_result` 事件推断

**Bridge 不适用：**

- 需要 claude.ai 订阅（`BRIDGE_LOGIN_INSTRUCTION` "Remote Control is only available with claude.ai subscriptions"）
- 需要 OAuth + trusted device token + JWT 签发
- 是云端长轮询模型，本地扩展跑这套是浪费

**ACP 胜在：**

1. CLI 已经实现 `claude acp` 子命令（`src/services/acp/entry.ts` 行 30-77）
2. `@agentclientprotocol/sdk` 的 `ClientSideConnection` + `ndJsonStream(stdin, stdout)` 现成
3. 所有 UI 需要的事件（session_update, permission_request, available_commands_update, model_changed, current_mode_update, plan）协议里都有
4. RCS Web 已经写好所有对应的 React 组件 ——>> **~50% 的 UI 代码可直接搬**

### 实施建议（阶段划分）

**Phase 1 — CLI 集成层**（extension 主进程）：

- `spawn('claude', ['acp'], {cwd, env, stdio:['pipe','pipe','inherit']})`（参考 `packages/acp-link/src/server.ts:251-286`）
- 用 `@agentclientprotocol/sdk` 的 `ClientSideConnection` + `ndJsonStream` 包一层
- 实现 `Client` 接口里的 `requestPermission`（转发到 webview）、`sessionUpdate`（转发到 webview）、`readTextFile` / `writeTextFile`（可接入 `vscode.workspace.fs`）
- 提供 `fs` clientCapabilities: `{readTextFile:true, writeTextFile:true}`，这样 agent 可以通过 ACP 让 VSCode 处理文件读写（符合 VSCode 原生编辑体验，避免 agent 直接写盘绕过 VSCode dirty state）

**Phase 2 — Webview UI**：

- 直接移植 `packages/remote-control-server/web/src/acp/types.ts` 类型文件
- 移植 `packages/remote-control-server/web/src/hooks/useModels.ts`、`useCommands.ts`
- 移植 `packages/remote-control-server/web/components/chat/CommandMenu.tsx`、`PlanView.tsx`、`PermissionPanel.tsx`
- 移植 `ChatInterface.tsx` 里的 `handleSessionUpdate` / `handlePermissionRequest` / `handlePermissionResponse`（Zed 风格的 flat entries 管理）
- 替换：lucide 图标 → `vscode-codicons`；Tailwind tokens → `var(--vscode-*)` CSS 变量

**Phase 3 — VSCode 原生整合**（可选）：

- `readTextFile` / `writeTextFile` capability → 接入 `vscode.workspace.openTextDocument` + `edit.replace`（让 Claude 的编辑变成 undo stack 里的 VSCode 操作）
- tool_call 的 `diff` content → 渲染成 inline decoration 或打开 `DiffEditor`
- `Bash` tool 的 terminal content → 接入 `vscode.window.createTerminal`
- `@filepath` 之类的 mention → 用 `vscode.workspace.findFiles`

### 反面教材：不要做的事

- **不要** 自己重新实现 `permission_request` 的 requestId 匹配 —— 用 SDK 自动配对
- **不要** 复制 `RCSChatAdapter` 那套 SSE → ThreadEntry 的转换（那是 RCS 专有 legacy 协议）
- **不要** 复制 `acp-link/rcs-upstream.ts` 的 RCS 注册逻辑（扩展不需要往云端注册）
- **不要** 给 session mode 加 local-only state —— 用 `setSessionMode` 让 agent 是单一真源

---

## 关键文件速查

| 用途 | 绝对路径 |
|---|---|
| ACP 协议 TS 类型（最完整） | `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\src\acp\types.ts` |
| ACP Client 类（WS 版，作模板） | `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\src\acp\client.ts` |
| useModels/useCommands hooks | `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\src\hooks\` |
| 消息流/权限/命令 UI 组件 | `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\components\chat\` |
| ChatInterface 总装 | `E:\Source_code\Claude-code-bast\packages\remote-control-server\web\components\ChatInterface.tsx` |
| CLI 端 ACP 入口 | `E:\Source_code\Claude-code-bast\src\services\acp\entry.ts` |
| AcpAgent 实现 | `E:\Source_code\Claude-code-bast\src\services\acp\agent.ts` |
| SDKMessage → SessionUpdate 翻译 | `E:\Source_code\Claude-code-bast\src\services\acp\bridge.ts` |
| Permission pipeline | `E:\Source_code\Claude-code-bast\src\services\acp\permissions.ts` |
| stdio spawn + initialize 范例 | `E:\Source_code\Claude-code-bast\packages\acp-link\src\server.ts` |
| Bridge API (对照用,不复用) | `E:\Source_code\Claude-code-bast\src\bridge\bridgeApi.ts` |
