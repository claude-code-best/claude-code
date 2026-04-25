# VSCode 扩展 ↔ Claude Code CLI 协议研究

> 目标：摸清 Claude Code CLI 对外暴露的 API 能力，让 VSCode 扩展能通过协议完整驱动 CLI，**不修改 `src/commands/` 中的任何命令文件**。
>
> 研究方式：只读阅读 + grep 精确定位。所有字段都给出代码位置 (`file:line`)。
>
> 生成日期：2026-04-24

---

## 0. 研究要点速览

- **启动入口**：`claude --print --input-format stream-json --output-format stream-json --verbose [--permission-mode <mode>]`
- **协议载体**：stdin / stdout，逐行 NDJSON（一行一个 JSON）
- **当前扩展 (`packages/vscode-extension/`) 已实现**：`user_message` 发送、`control_request` 所有常用 subtype、权限响应。本文件把 CLI 侧协议从零梳理一遍，列出还能再挖的能力。
- **所有 control_request subtype 定义的权威位置**：`src/entrypoints/sdk/controlSchemas.ts`（Zod schema）
- **所有 control_request subtype 的处理分派**：`src/cli/print.ts:2952-4169`（单一 `if/else` 分派表）

---

## 1. Stream JSON 协议

### 1.1 启用方式

CLI 参数定义：`src/main.tsx:1418-1443`

```bash
claude --print \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  [--permission-mode default|acceptEdits|bypassPermissions|plan|dontAsk|auto] \
  [--replay-user-messages] \                  # 回显 stdin 的 user 消息
  [--include-partial-messages] \              # 把 stream_event 也吐到 stdout
  [--permission-prompt-tool stdio] \          # 让 canUseTool 走 stdin/stdout
  [--session-id <uuid>] [--resume <uuid>] \
  [--append-system-prompt "..."] [--system-prompt "..."] \
  [--model <id>] [--agent <name>] \
  [--max-turns N] [--max-cost-usd X] [--max-thinking-tokens N] \
  [--replay-user-messages]
```

- 校验逻辑：`src/main.tsx:2808-2860`（`--input-format=stream-json` 必须 `--output-format=stream-json`，必须 `--print`）。
- 入参解析：`src/cli/structuredIO.ts:136-265` 的 `StructuredIO.read()`。
- 出口：`src/cli/structuredIO.ts:471-473` 的 `StructuredIO.write()`（走 `writeToStdout` + NDJSON 序列化）；队列化 drain 在 `src/cli/print.ts` 的 `output.enqueue()`。
- **编码**：每条消息 JSON 后跟 `\n`；空行/`\r\n` 被忽略。

### 1.2 输入消息类型（用户 → CLI）

权威定义：`src/entrypoints/sdk/controlSchemas.ts:655-663`（`StdinMessageSchema` union）

分派位置：`src/cli/structuredIO.ts:338-469`（`processLine`）。

| type | 含义 | 关键字段 | 代码位置 |
|------|------|---------|----------|
| `user` | 用户一轮输入（文本/斜杠/bash） | `message.role: "user"`, `message.content: string \| ContentBlockParam[]`, `parent_tool_use_id: null`, `session_id`, 可选 `uuid`, `priority: "now"\|"next"\|"later"` | Schema `coreSchemas.ts:1277-1299`；消费 `print.ts:4196-4272` |
| `control_request` | 控制类请求（模型/模式/中断 等） | `request_id: string`, `request: { subtype: ... }` | Schema `controlSchemas.ts:578-584`；分派 `print.ts:2952-4169` |
| `control_response` | 回应 CLI 发出的 `control_request`（典型：`can_use_tool` 的 allow/deny） | `response: { subtype: "success"\|"error", request_id, response?, error? }` | `controlSchemas.ts:586-610`；消费 `structuredIO.ts:368-436` |
| `control_cancel_request` | 取消一个在途 control_request | `request_id` | `controlSchemas.ts:612-619` |
| `keep_alive` | 心跳（静默忽略） | — | `controlSchemas.ts:621-627`；`structuredIO.ts:349-351` |
| `update_environment_variables` | 运行时改 `process.env`（bridge 会话 token 刷新用） | `variables: Record<string,string>` | `controlSchemas.ts:629-636`；消费 `structuredIO.ts:353-367` |
| `assistant` | 历史 assistant 消息回灌（bridge 用） | 标准 AssistantMessage | `print.ts:4183-4192` |
| `system` | 历史 system 消息回灌 | 标准 SystemMessage | `print.ts:4183-4192` |

**关键：斜杠命令和 bash 命令都通过 `type: "user"` 发送**，CLI 自己识别首字符 `/` 或 `!`。见 `src/utils/processUserInput/processUserInput.ts:536-554`：

```ts
// 伪代码
if (inputString.startsWith('/') && !effectiveSkipSlash) {
  const { processSlashCommand } = await import('./processSlashCommand.js')
  return processSlashCommand(inputString, ..., context, ...)
}
```

`effectiveSkipSlash` 由 `user` 消息里的 `skipSlashCommands` 字段控制（bridge 回灌历史才会用，普通扩展**不要**设），见 `src/bridge/inboundMessages.ts` 和 `print.ts:4068`。

`SDKUserMessage` 最小样板（扩展已在用，位置 `packages/vscode-extension/src/CLIProcess.ts:272-282`）：

```json
{
  "type": "user",
  "message": { "role": "user", "content": [{"type":"text","text":"hello"}] },
  "parent_tool_use_id": null,
  "session_id": ""
}
```

说明：
- `content` 支持 `string` 或 Anthropic `ContentBlockParam[]`（可带图片）。
- `session_id` 空字符串 CLI 会用自己的 sessionId 填，不影响功能。
- `uuid` 可选；填了 CLI 会做去重（`print.ts:4206-4245`）。
- `priority`（`"now"|"next"|"later"`）用于消息队列排序，一般省略。

### 1.3 输出消息类型（CLI → 用户）

权威定义：`src/entrypoints/sdk/controlSchemas.ts:642-653`（`StdoutMessageSchema` union）+ `coreSchemas.ts:1858-1872`（`SDKMessageSchema`）

| type | subtype | 含义 | 关键字段 | 代码位置 |
|------|---------|------|----------|----------|
| `system` | `init` | 会话启动 | `tools[]`, `mcp_servers[]`, `model`, `permissionMode`, `slash_commands[]`, `skills[]`, `agents[]?`, `plugins[]`, `output_style`, `cwd`, `apiKeySource`, `claude_code_version`, `session_id` | Schema `coreSchemas.ts:1461-1498` |
| `system` | `compact_boundary` | 压缩分界标记 | `compact_metadata: { trigger: "manual"\|"auto", pre_tokens, preserved_segment? }` | `coreSchemas.ts:1510-1535` |
| `system` | `status` / `task_notification` / `task_started` / `task_progress` / `bridge_state` / `post_turn_summary` / `session_state_changed` / `hook_started` / `hook_progress` / `hook_response` / `elicitation_complete` / `files_persisted` / `error_during_execution` | 各类运行时状态 | 字段因 subtype 而异；都带 `uuid` + `session_id` | `print.ts:643-2509`（搜 `subtype:` 可看） |
| `assistant` | — | 模型输出一条消息 | `message: APIAssistantMessage`（标准 Anthropic 格式，含 `content: Array<TextBlock\|ToolUseBlock\|ThinkingBlock>`, `usage`), `parent_tool_use_id`, `uuid`, `session_id`, `error?` | `coreSchemas.ts:1351-1360` |
| `user` | — | 回灌或 replay 的用户消息（仅 `--replay-user-messages` 时） | 同输入 `user`，多 `isReplay: true` | `coreSchemas.ts:1301-1307` |
| `stream_event` | — | 模型流式事件（仅 `--include-partial-messages`） | `event: RawMessageStreamEvent`（Anthropic SSE delta） | `coreSchemas.ts:1500-1508` |
| `streamlined_text` | — | 精简 text（某些内部模式替换 assistant） | `text`, `uuid`, `session_id` | `coreSchemas.ts:1373-1386` |
| `streamlined_tool_use_summary` | — | 精简 tool use 聚合 | `tool_summary`, `uuid`, `session_id` | `coreSchemas.ts:1388-1401` |
| `result` | `success` | 一轮回答结束，成功 | `duration_ms`, `duration_api_ms`, `num_turns`, `result: string`, `stop_reason`, `total_cost_usd`, `usage`, `modelUsage`, `permission_denials[]` | `coreSchemas.ts:1411-1430` |
| `result` | `error_during_execution` / `error_max_turns` / `error_max_budget_usd` / `error_max_structured_output_retries` | 一轮失败 | 同上 + `errors: string[]` | `coreSchemas.ts:1432-1455` |
| `rate_limit_event` | — | 速率限制变更推送 | `rate_limit_info: { status, resetsAt, rateLimitType, utilization, ... }` | `coreSchemas.ts:1362-1371` |
| `control_request` | `can_use_tool` / `elicitation` / `mcp_message` / `hook_callback` | CLI 反向发给用户等待回应 | `request_id`, `request.subtype`, `request.*` | `controlSchemas.ts:106-122`（can_use_tool）等 |
| `control_response` | `success`/`error` | CLI 回给用户自己发过的 control_request | `response.request_id`, `response.response?` | 同上 |
| `control_cancel_request` | — | CLI 反向取消已发的 control_request | `request_id` | `structuredIO.ts:297-299, 498-500` |
| `keep_alive` | — | 心跳 | — | 仅双向兼容 |

**关键特性**：
- 所有消息都是 JSON 一行，UTF-8，结尾 `\n`。
- stdout 上不会出现 TTY ANSI，因为 `--print` 已强制非交互。
- stderr 上仍有普通调试日志，扩展已把这个当 "stderr" 事件消费（`CLIProcess.ts:131-133`）。

---

## 2. Control Request 完整清单

权威处理位置：`src/cli/print.ts:2952-4169`。下表把 schema 里所有 subtype + print.ts 里额外识别的 subtype 全列出来。

| subtype | 入参 | 出参 (成功 response) | 处理位置 | Schema 位置 |
|---------|------|----------------------|----------|-------------|
| `initialize` | `hooks?`, `sdkMcpServers?`, `systemPrompt?`, `appendSystemPrompt?`, `agents?: Record<name,AgentDefinition>`, `promptSuggestions?`, `agentProgressSummaries?`, `jsonSchema?` | `{ commands: SlashCommand[], agents: AgentInfo[], output_style, available_output_styles[], models: ModelInfo[], account: AccountInfo, pid?, fast_mode_state? }` | `print.ts:2995-3049` (handler at `print.ts:4485-4816`) | `controlSchemas.ts:57-95` |
| `interrupt` | — | `{}` | `print.ts:2963-2981` | `controlSchemas.ts:97-103` |
| `set_model` | `model?: string`（空/`"default"` = 回退默认模型） | `{}` | `print.ts:3065-3076` | `controlSchemas.ts:137-144` |
| `set_permission_mode` | `mode: "default"\|"acceptEdits"\|"bypassPermissions"\|"plan"\|"dontAsk"\|"auto"`, `ultraplan?: boolean` | `{}` | `print.ts:3050-3064` | `controlSchemas.ts:124-135` |
| `set_max_thinking_tokens` | `max_thinking_tokens: number\|null`（0 禁用，null 恢复默认） | `{}` | `print.ts:3077-3088` | `controlSchemas.ts:146-155` |
| `mcp_status` | — | `{ mcpServers: McpServerStatus[] }` | `print.ts:3089-3092` | `controlSchemas.ts:157-173` |
| `mcp_message` | `server_name: string`, `message: JSONRPCMessage` | `{}` | `print.ts:3111-3128` | `controlSchemas.ts:374-382` |
| `mcp_set_servers` | `servers: Record<name, McpServerConfigForProcessTransport>` | `{ added: string[], removed: string[], errors: Record<name,string> }` | `print.ts:3189-3201` | `controlSchemas.ts:384-403` |
| `mcp_reconnect` | `serverName: string` | `{}` | `print.ts:3271-3343` | `controlSchemas.ts:435-442` |
| `mcp_toggle` | `serverName: string`, `enabled: boolean` | `{}` | `print.ts:3344-3434` | `controlSchemas.ts:444-452` |
| `reload_plugins` | — | `{ commands: SlashCommand[], agents: AgentInfo[], plugins: { name,path,source? }[], mcpServers: McpServerStatus[], error_count: number }` | `print.ts:3202-3270` | `controlSchemas.ts:405-433` |
| `get_context_usage` | — | 大对象：`{ categories[], totalTokens, maxTokens, percentage, gridRows[][], model, memoryFiles[], mcpTools[], deferredBuiltinTools?, systemTools?, systemPromptSections?, agents[], slashCommands?, skills?, isAutoCompactEnabled, messageBreakdown?, apiUsage, ... }` | `print.ts:3093-3110` | `controlSchemas.ts:175-306` |
| `get_settings` | — | `{ effective: object, sources: [{source,settings}], applied: { model, effort } }` | `print.ts:3896-3911` | `controlSchemas.ts:475-520` |
| `apply_flag_settings` | `settings: Record<string,unknown>`（`null` = 删除该键） | `{}` | `print.ts:3839-3895` | `controlSchemas.ts:464-473` |
| `rewind_files` | `user_message_id: UUID`, `dry_run?: boolean` | `{ canRewind, error?, filesChanged[]?, insertions?, deletions? }` | `print.ts:3129-3144` | `controlSchemas.ts:308-328` |
| `cancel_async_message` | `message_uuid: string` | `{ cancelled: boolean }` | `print.ts:3145-3150` | `controlSchemas.ts:330-349` |
| `seed_read_state` | `path: string`, `mtime: number` | `{}` | `print.ts:3151-3188` | `controlSchemas.ts:351-361` |
| `hook_callback` | `callback_id: string`, `input: HookInput`, `tool_use_id?` | hookJSONOutput | CLI 发给宿主的方向，宿主处理 | `controlSchemas.ts:363-372` |
| `stop_task` | `task_id: string` | `{}` | `print.ts:3912-3922` | `controlSchemas.ts:455-462` |
| `elicitation` | `mcp_server_name`, `message`, `mode?: "form"\|"url"`, `url?`, `elicitation_id?`, `requested_schema?` | `{ action: "accept"\|"decline"\|"cancel", content? }` | CLI 发给宿主的方向，宿主处理 | `controlSchemas.ts:522-545` |
| `can_use_tool` | `tool_name`, `input`, `tool_use_id`, `permission_suggestions?`, `blocked_path?`, `decision_reason?`, `title?`, `display_name?`, `agent_id?`, `description?` | `PermissionPromptToolResult`（`{ behavior: "allow"\|"deny", updatedInput?, message?, ... }`） | CLI 发出（`structuredIO.ts:592-612`），宿主在 stdin 回 `control_response` | `controlSchemas.ts:106-122` |
| `end_session` | `reason?: string` | `{}`（随后 CLI 关闭 stdin 循环，开始 drain） | `print.ts:2982-2994` | ⚠ schema 未列，代码识别 |
| `channel_enable` | `serverName: string` | — | `print.ts:3435-3447` | ⚠ schema 未列 |
| `mcp_authenticate` | `serverName: string` | OAuth 流 | `print.ts:3448-...` | ⚠ schema 未列 |
| `mcp_oauth_callback_url` | — | — | `print.ts:3603-...` | ⚠ schema 未列 |
| `mcp_clear_auth` | `serverName: string` | `{}` | `print.ts:3791-3838` | ⚠ schema 未列 |
| `claude_authenticate` | — | OAuth 流 | `print.ts:3655-...` | ⚠ schema 未列 |
| `claude_oauth_callback` / `claude_oauth_wait_for_completion` | — | — | `print.ts:3752-3790` | ⚠ schema 未列 |
| `generate_session_title` | `description: string`, `persist: boolean` | `{ title: string\|null }` | `print.ts:3923-3955`（fire-and-forget） | ⚠ schema 未列 |
| `side_question` | `question: string` | `{ response: string }` | `print.ts:3956-4015` | ⚠ schema 未列 |
| `set_proactive` | `enabled: boolean` | `{}`（需 `PROACTIVE` 或 `KAIROS` feature） | `print.ts:4016-4032` | ⚠ schema 未列 |
| `remote_control` | `enabled: boolean` | `{ session_url, connect_url, environment_id }` | `print.ts:4033-4161` | ⚠ schema 未列 |

**未知 subtype** 会走 `print.ts:4162-4168` 的 fallback：回 `{subtype:"error", error:"Unsupported control request subtype: <x>"}`，不会挂起。

**Control Response 结构**（`controlSchemas.ts:586-610`）：

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "<echoed>",
    "response": { ...subtype-specific... }
  }
}
```

错误：

```json
{
  "type": "control_response",
  "response": {
    "subtype": "error",
    "request_id": "<echoed>",
    "error": "<msg>",
    "pending_permission_requests": [...]  // 仅 initialize 已初始化时带
  }
}
```

**发送工具函数**（print.ts 侧）：`print.ts:2865-2880`（`sendControlResponseSuccess` / `sendControlResponseError`）。

---

## 3. 模型切换

### 3.1 API：`set_model` control_request

已实现，扩展端已在用（`packages/vscode-extension/src/CLIProcess.ts:334-337`，`ChatViewProvider.ts:194-217`）。

**请求**：

```json
{
  "type": "control_request",
  "request_id": "vscode_xxx",
  "request": { "subtype": "set_model", "model": "claude-sonnet-4-5" }
}
```

- `model` 可省略或传 `"default"`，表示回退到 `getDefaultMainLoopModel()` 的配置默认。
- 支持模型 alias（`"sonnet"`, `"opus"`, `"haiku"`）或完整 ID。解析发生在 `QueryEngine.submitMessage` 调 `parseUserSpecifiedModel()` 时（见 `src/services/acp/agent.ts:389` 注释）。

**行为**（`print.ts:3065-3076`）：
1. `activeUserSpecifiedModel = model`
2. `setMainLoopModelOverride(model)` — 写 session 级 override，优先级高于 settings。
3. `notifySessionMetadataChanged({ model })` — 触发 metadata 变更广播（bridge / CCR 会收到）。
4. `injectModelSwitchBreadcrumbs(requestedModel, model)` — 往 `mutableMessages` 塞一条 system 消息，让模型自己看得见切换事件。

**即时生效**：下一轮 API 调用使用新模型。当前轮不中断。

### 3.2 替代：通过 `apply_flag_settings` 也能改模型

`print.ts:3877-3893` 显示 `apply_flag_settings` 里如果带 `model` key，会走和 `set_model` 一模一样的 override 路径。好处是能同时改其他 settings（比如 `effort`、`maxOutputTokens`）。

### 3.3 可用模型列表

在 `initialize` response 的 `models: ModelInfo[]` 里返回（`controlSchemas.ts:84`），schema 见 `coreSchemas.ts:1048-1080`：

```ts
{ value, displayName, description, supportsEffort?, supportedEffortLevels?, supportsAdaptiveThinking?, supportsFastMode?, supportsAutoMode? }
```

扩展可以在收到 `initialize` success response 后缓存这个列表给 UI 做 picker。

### 3.4 VSCode 扩展侧建议

当前 `ChatViewProvider` 已经走 `set_model`，**无需改 `src/commands/`**。增强方向：
1. 扩展启动后**主动**发一次 `initialize` control_request（含空 body），拿到 `models[]` 和 `commands[]` 喂给 webview picker。
2. UI 侧 picker 改变 → 发 `set_model`。
3. 监听 `control_response` 的 `subtype: "success"` + 匹配 `request_id` 来确认切换成功。

---

## 4. 模式切换

### 4.1 API：`set_permission_mode` control_request

已实现（`CLIProcess.ts:351-353`，`ChatViewProvider.ts:226-242`）。

**请求**：

```json
{
  "type": "control_request",
  "request_id": "...",
  "request": { "subtype": "set_permission_mode", "mode": "acceptEdits" }
}
```

### 4.2 可选值

**Schema**：`src/entrypoints/sdk/coreSchemas.ts:337-349`

```ts
'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'
```

- `default` — 危险操作弹权限对话（`can_use_tool`）。
- `acceptEdits` — 自动接受文件编辑类 tool（Write/Edit/MultiEdit）。
- `bypassPermissions` — 跳过所有权限检查。需要 `isBypassPermissionsModeAvailable`（非 root，或有 `IS_SANDBOX` env），否则 UI 会拒绝选中。检测逻辑：`agent.ts:484-486`。
- `plan` — 计划模式，不真正执行 tool（除了 read-only 的）。
- `dontAsk` — 不弹框，未预先 approve 的一律 deny。
- `auto` — 分类器自动判定（需 `TRANSCRIPT_CLASSIFIER` feature；内部实验特性）。

还有两个 **internal only**（`src/types/permissions.ts:28`）：`bubble`（不对外暴露）、一个已废弃值。扩展只需要管 6 个 external。

### 4.3 行为

`print.ts:3050-3064` + `handleSetPermissionMode()`（位置见搜索）：
1. 更新 `AppState.toolPermissionContext.mode`。
2. 如果 `ultraplan: true`（内部用），额外标 `isUltraplanMode`。
3. 触发 `onChangeAppState` → metadata 变更广播。
4. 即时生效，当前轮如果还没执行 tool 也会被新模式覆盖。

### 4.4 查询当前模式

方式 A：`get_settings` control_request，response 里 `effective.permissions.defaultMode`。
方式 B：听 `system.init` 消息的 `permissionMode` 字段（`coreSchemas.ts:1478`）。
方式 C：每次 `set_permission_mode` 后自己维护。

---

## 5. 斜杠命令

### 5.1 执行方式：就是发 `type: "user"`

**关键发现**：CLI 没有单独的 `slash_command` 消息类型。所有斜杠命令都走普通 user message，CLI 的 `processUserInput` 流水线识别首字符 `/` 就调 `processSlashCommand`。

**代码路径**：
1. `src/cli/print.ts:4247-4258` — stream-json 里的 user 消息入 queue。
2. `src/utils/processUserInput/processUserInput.ts:536-554` — 识别 `/` 前缀，dispatch 到 `processSlashCommand.tsx`。
3. `src/utils/slashCommandParsing.ts:25` — `parseSlashCommand(input)` 解析 `/<cmd> <args>`。
4. `src/commands.ts` — 命令注册表（117 个左右命令，在 `src/commands/` 下）。

**消息示例**（直接和普通 user 消息一样）：

```json
{
  "type": "user",
  "message": { "role": "user", "content": [{"type":"text","text":"/compact"}] },
  "parent_tool_use_id": null,
  "session_id": ""
}
```

### 5.2 支持哪些命令？

**绝大部分支持** `--print` 模式（stream-json 就是 print 的子模式），条件是命令定义带 `supportsNonInteractive: true`。

- `compact` — ✅（`src/commands/compact/index.ts:9`）
- `clear` — ✅（大概率；需要每个命令逐查）
- `model`, `config`, `permissions`, `mcp`, `context`, `agents`, `help`, `status`, `cost`, `poor`, `fast`, `vim`, `review`, `init`, `memory`, `skills`, `tasks`, `session` — 基本都支持
- **不支持 print 模式** 的：需要交互式 UI 的（`doctor`, `hooks`, `status-line`, `terminal-setup`, `login`, `logout`, `onboarding`, `bug`）。扩展当前 `ChatViewProvider.ts:364-405` 里手动拦截了这些并给出 "在终端里跑" 的提示。

**枚举可用斜杠命令**：在 `initialize` response 的 `commands: SlashCommand[]` 字段里返回，每项是 `{ name, description, argumentHint }`（schema `coreSchemas.ts:1017-1029`）。

`print.ts:3251-3257` 的 `reload_plugins` 会返回更新后的 commands 列表；`commands.filter(cmd => cmd.userInvocable !== false)` 决定哪些对用户可见。

### 5.3 带参数的斜杠命令

正常拼进 text 里即可：`"/compact summarize only the last 20 messages"`。

### 5.4 VSCode 扩展列出可用斜杠命令的正确做法

1. 扩展启动后（CLI process ready），发 `initialize` control_request：
   ```json
   { "type":"control_request", "request_id":"init_1", "request":{"subtype":"initialize"} }
   ```
2. 解析回来的 `control_response.response.commands[]` 喂给 webview 做补全 / picker。
3. 插件改动时（用户装/卸了 plugin），可以发 `reload_plugins` 刷新。

**不要**修改 `src/commands/` 下任何文件。这一切纯协议能拿到。

### 5.5 当前扩展的缺陷

`ChatViewProvider.ts:186-410` 的 `handleSlashCommand` 把 `/model`、`/permissions`、`/compact` 等**拦截**在扩展侧自己处理。这有一个**不匹配**：扩展侧硬编码了一份命令清单，但实际 CLI 还支持更多（`/cost`, `/session`, `/memory`, `/skills`, `/tasks`...）。改进方案：

- 对「需要发 control_request 的」命令（`/model`, `/permissions`, `/mcp`, `/context`, `/think`, `/config`）：保留拦截（已对）。
- 对「标准 slash command」（`/compact`, `/clear`, `/review`, `/init`, `/memory`, `/cost`...）：**不要**拦截，直接把原文当 user 消息发给 CLI，让 CLI 自己处理。现在 `/compact` 根本没处理（`handleSlashCommand` fallthrough 到 `default: return false` → 走 `sendUserMessage`），实际上这条路已经通了。只是 `/help` 里列 `/compact` 但 `help` 消息是扩展自己生成的，没有动态查 CLI。

---

## 6. 其他重要 API

### 6.1 Interrupt / Cancel

**control_request**：
- `interrupt` — 中断当前 API 调用 + 清 suggestion queue（`print.ts:2963-2981`）。
- `end_session` — 更激进，同时 break 出 stdin 循环，CLI 准备优雅关闭（`print.ts:2982-2994`）。
- `control_cancel_request`（独立 type，不是 subtype）— 取消一个在途的 CLI→宿主的 control_request（比如一个 `can_use_tool` 等待权限响应时想换走 bridge 那条路）（`structuredIO.ts:297-299`）。

**扩展侧已有**：`CLIProcess.ts:361-379` 的 `interrupt()` 先发 `control_request.interrupt`，失败才 SIGINT 兜底。

### 6.2 Compact

**没有专门的 control_request**。要压缩直接发 user message `/compact`（斜杠命令走普通 user 消息通道）。

- 手动触发：`/compact [instructions]`（`src/commands/compact/compact.ts`）。
- 自动触发：context 达到阈值时 CLI 自己发 system.compact_boundary 事件；`get_context_usage` response 里 `isAutoCompactEnabled` 告诉你开关状态（`controlSchemas.ts:273-274`）。
- 监听结果：输出流里会出现 `{ type: "system", subtype: "compact_boundary", compact_metadata: {...} }`（`coreSchemas.ts:1510-1535`）。

### 6.3 Fork

**两个概念**：

1. **Fork session**（新建分支会话，不在当前流里）— 这是 SDK function `forkSession(sessionId, { dir?, upToMessageId?, title? })`，在 `src/entrypoints/agentSdkTypes.ts:268-273`。当前代码里这是 SDK-only，CLI 没暴露成 control_request。若扩展要 fork，目前只能：
   - (a) 用 CLI 的 `claude --resume <newId>` 外加自己复制 session JSONL；或者
   - (b) 将来加一个 `fork_session` control_request。

2. **Fork subagent**（从当前 assistant 回复 fork 出一个 subagent 并发执行）— 这是 `/fork <directive>` 斜杠命令（`src/commands/fork/fork.tsx`），需要 `FEATURE_FORK_SUBAGENT=1`。发 user 消息 `"/fork 修复 validate.ts 的空指针检查"` 即可。

**ACP 协议有**：`unstable_forkSession`（`src/services/acp/agent.ts:209-223`）。如果扩展走 ACP 路径（见 7.3）可以直接用。

### 6.4 Clear / New Session

**没有协议层的 "clear session"**。扩展当前做法（`ChatViewProvider.ts:412-419`）：**杀 CLI 进程重启**。这是正确的，因为 CLI 的 session 从 stdin/stdout 打开那一刻就绑定，没法中途清空 mutableMessages。

替代路径：
- `/clear` 斜杠命令（`src/commands/clear/`）— 清 CLI 自己看到的历史但保留 process，性能更好。
- 重启进程 —— 扩展当前的做法，更干净。

**想要完整 new session**（换 sessionId、换 cwd 等）：必须重启 CLI，传 `--session-id <newuuid>` 或不传让 CLI 自己生成。

### 6.5 Rewind (文件回滚)

`rewind_files` control_request（`print.ts:3129-3144`）：回滚从某条 user message 之后的所有文件编辑。

**入参**：`{ user_message_id: UUID, dry_run?: boolean }`

**出参**：`{ canRewind, error?, filesChanged?, insertions?, deletions? }`

扩展可以给用户一个 "undo this turn" 按钮。

### 6.6 Hook Callback

当 CLI 加载了 SDK-registered hook（initialize 里 `hooks` 字段）时，会反向发 `hook_callback` control_request 给宿主。宿主用 stdin 回 `control_response` 带 hook output。详见 `structuredIO.ts:667-694`。

对 VSCode 扩展：**暂时不需要**。用 settings.json 配置的文件系统 hooks 一样工作，不必通过 SDK hook。

### 6.7 MCP Elicitation

CLI 反向发 `elicitation` control_request（`structuredIO.ts:699-726`）要求用户输入表单/URL，扩展可以弹一个 webview input。当前扩展没实现，是个留白。

### 6.8 Session Title Generation

`generate_session_title` control_request（`print.ts:3923-3955`）让 CLI 用 Haiku 生成标题。

**入参**：`{ description: string, persist: boolean }`

**出参**：`{ title: string | null }`

扩展可以在 tab/sidebar 上显示智能标题。

### 6.9 Side Question

`side_question` control_request（`print.ts:3956-4015`）用缓存的 prompt prefix 单独问一个问题，不污染主 session。对做 "explain this selection" 很合适。

**入参**：`{ question: string }`

**出参**：`{ response: string }`

### 6.10 Remote Control（Bridge）开关

`remote_control` control_request（`print.ts:4033-4161`）。扩展一般不需要，除非要把 CLI 接到 claude.ai 的 bridge 上。

---

## 7. 不修改 `src/commands/` 的扩展实现方案

### 7.1 对象关系图

```
VSCode Extension (webview)
   ↕ vscode.webview.postMessage
ChatViewProvider (packages/vscode-extension/src/)
   ↕ stdin / stdout (NDJSON)
CLI Process: claude --print --input-format stream-json --output-format stream-json
   ├── Entry: src/entrypoints/cli.tsx → src/main.tsx
   ├── I/O: src/cli/structuredIO.ts (StructuredIO)
   └── Core loop: src/cli/print.ts (2952-4169 控制分派)
```

### 7.2 路径一：继续扩展现有 CLIProcess（推荐）

优点：**零** CLI 侧改动。已有代码全部可复用。

待补能力（按优先级）：
1. **主动发 `initialize`**（现有 `sendInitialize()` 已实现但 ChatViewProvider 没调）→ 拿 `commands[]`、`models[]`、`agents[]`、`account`。
2. **动态斜杠命令补全** — 用 #1 返回的 commands。
3. **动态模型 picker** — 用 #1 返回的 models。
4. **`get_context_usage` 面板** — 已 wire，webview 侧画个 grid 即可。
5. **`rewind_files` undo 按钮**。
6. **`elicitation` 响应** — 弹 webview form。
7. **`hook_callback` 响应** — 可选，一般不需要。
8. **监听 `system.compact_boundary`** — 提示 UI "已压缩"。

### 7.3 路径二：走 ACP 协议（重）

CLI 已有 `--acp` 模式（`src/entrypoints/cli.tsx:136-141`），进 `src/services/acp/` 的 `AcpAgent`。

- **优势**：ACP 有 `setSessionModel`、`setSessionMode`、`unstable_forkSession`、`unstable_resumeSession`、`listSessions` 等成熟方法。
- **劣势**：需要在扩展侧起 ACP client（`@agentclientprotocol/sdk`），多一层封装。`packages/acp-link/` 已有 WebSocket→ACP 桥可复用。

两条路可以**并存**：扩展继续用 stream-json 直连，ACP 留给 WebView 远程场景。

### 7.4 路径三：自己封装 bridge（不推荐）

改 `src/bridge/` 来加 VSCode 专用通道。违反「不改 src/」原则，不推荐。

---

## 8. 风险与注意事项

1. **`bypassPermissions` 不一定可用**。Root 用户且非 sandbox 时，CLI 会拒绝该 mode。扩展应先发 `get_settings`，看 `effective.permissions` 或者记住 `initialize` response（无此字段，需要从 `system.init` 消息的 `permissionMode` 兜底），如果 bypass 不可用就灰掉 UI 选项。
2. **`set_model` 不校验模型可用性** —— 传一个不存在的 model ID 也会成功回 `{}`，但下一轮 API 调用才爆。建议从 `initialize.models` 的 `value` 列表里选。
3. **`initialize` 只能调用一次**。重复调会回 `{subtype:"error", error:"Already initialized"}`（`print.ts:4504-4515`）。
4. **`apply_flag_settings` 里 `null` = 删除该键**（`print.ts:3854-3858`），`undefined` 被 JSON 丢弃。想清一个 setting 必须显式传 `null`。
5. **斜杠命令在 stream-json 模式里有些命令不可用**（`isHidden` / `userInvocable: false` / `supportsNonInteractive: false`）。应只展示 `initialize.commands[]` 返回的那些。
6. **`control_cancel_request`** 是**独立 type**，不是 subtype。和 `control_request.cancel_async_message` 是两回事：
   - `control_cancel_request` — 取消 CLI→宿主的在途请求。
   - `cancel_async_message` — 从 CLI 的 command queue 里摘掉还没开始处理的 user message。
7. **CLI 重启会丢失所有 override**（set_model、set_permission_mode、set_max_thinking_tokens、apply_flag_settings）。扩展若要持久化，自己记 `settings.json` 或每次启动重新 push。
8. **Bun runtime 产物自带 `import.meta.require` 补丁**，`node dist/cli.js` 也能跑。扩展当前 `CLIProcess.ts:186-213` 的路径探测已经覆盖这种情况。

---

## 9. 附录：快速查表

### 9.1 典型扩展启动序列

```jsonl
→ (spawn) claude --print --output-format stream-json --input-format stream-json --verbose
← {"type":"system","subtype":"init","session_id":"...","tools":[...],"model":"...","permissionMode":"default","slash_commands":[...],"mcp_servers":[...],...}
→ {"type":"control_request","request_id":"init_1","request":{"subtype":"initialize"}}
← {"type":"control_response","response":{"subtype":"success","request_id":"init_1","response":{"commands":[...],"agents":[...],"models":[...],"account":{...}}}}
→ {"type":"user","message":{"role":"user","content":[{"type":"text","text":"hello"}]},"parent_tool_use_id":null,"session_id":""}
← {"type":"assistant","message":{...},"uuid":"...","session_id":"..."}
← {"type":"result","subtype":"success","result":"...","usage":{...}}
```

### 9.2 关键文件绝对路径

- `E:\Source_code\Claude-code-bast\src\entrypoints\cli.tsx` — 入口，快速路径派发
- `E:\Source_code\Claude-code-bast\src\entrypoints\sdk\controlSchemas.ts` — control_request 所有 Zod schema（❗单一权威）
- `E:\Source_code\Claude-code-bast\src\entrypoints\sdk\coreSchemas.ts` — SDK 消息类型 Zod schema
- `E:\Source_code\Claude-code-bast\src\cli\print.ts` — stream-json 主循环，2952-4169 行是所有 control_request 分派（❗单一权威）
- `E:\Source_code\Claude-code-bast\src\cli\structuredIO.ts` — 读写 stdin/stdout，权限请求发送，control_response 匹配
- `E:\Source_code\Claude-code-bast\src\main.tsx:1418-1443` — `--input-format`/`--output-format` CLI flag 定义
- `E:\Source_code\Claude-code-bast\src\utils\processUserInput\processUserInput.ts:536-554` — 斜杠命令识别
- `E:\Source_code\Claude-code-bast\src\services\acp\agent.ts` — ACP Agent（替代协议路径）
- `E:\Source_code\Claude-code-bast\src\types\permissions.ts` — PermissionMode 定义
- `E:\Source_code\Claude-code-bast\packages\vscode-extension\src\CLIProcess.ts` — 扩展现有 CLI 封装（参考 / 可继续增强）
- `E:\Source_code\Claude-code-bast\packages\vscode-extension\src\ChatViewProvider.ts` — 扩展现有 webview 桥

### 9.3 Control Request 速查代码模板

```ts
// 发送并等待响应（TypeScript）
type ControlRequest = {
  type: "control_request"
  request_id: string
  request: { subtype: string; [k: string]: unknown }
}
type ControlResponse = {
  type: "control_response"
  response:
    | { subtype: "success"; request_id: string; response?: Record<string, unknown> }
    | { subtype: "error"; request_id: string; error: string; pending_permission_requests?: ControlRequest[] }
}

// 权限回应（stdin → CLI）
{
  type: "control_response",
  response: {
    subtype: "success",
    request_id: "<id from CLI's can_use_tool>",
    response: { behavior: "allow", /* or "deny" with message */ }
  }
}
```

---

**报告完**
