# ccb vs @anthropic-ai/claude-agent-sdk 协议对齐 Gap Matrix

- **SDK version**：0.2.141
- **生成日期**：2026-06-13
- **契约源头**：`node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.141+68a1e3a0c4588df3/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`

## 表 A — CLI flag 对齐（41 项）

| Flag | ccb 实现 | 状态 | 备注 |
|---|---|---|---|
| `--add-dir` | `src/main.tsx:1393` | ✅ | `.option('--add-dir <directories...>')` |
| `--agent` | `src/main.tsx:1377` | ✅ | `.option('--agent <agent>')` |
| `--allow-dangerously-skip-permissions` | `src/main.tsx:1218` | ✅ | — |
| `--assistant` | `src/main.tsx:4564` | ✅ | `addOption(new Option('--assistant').hideHelp())` |
| `--betas` | `src/main.tsx:1378` | ✅ | `.option('--betas <betas...>')` |
| `--channels` | `src/main.tsx:4567-4571` | ✅ | `addOption(new Option('--channels <servers...>').hideHelp())` |
| `--continue` | `src/main.tsx:1310` | ✅ | `.option('-c, --continue')` |
| `--debug` | `src/main.tsx:1149` | ✅ | `.option('-d, --debug [filter]')` |
| `--debug-file` | `src/main.tsx:1160` | ✅ | `new Option('--debug-file <path>')` |
| `--debug-to-stderr` | `src/main.tsx:1158` | ✅ | `new Option('--debug-to-stderr').argParser(Boolean).hideHelp()` |
| `--effort` | `src/main.tsx:1366` | ✅ | `new Option('--effort <level>')` |
| `--fallback-model` | `src/main.tsx:1380` | ✅ | `new Option('--fallback-model <model>')` |
| `--fork-session` | `src/main.tsx:1317` | ✅ | `.option('--fork-session')` |
| `--hard-fail` | `src/main.tsx:4624` | ✅ | `addOption(new Option('--hard-fail').hideHelp())` |
| `--include-hook-events` | `src/main.tsx:1192` | ✅ | — |
| `--include-partial-messages` | `src/main.tsx:1197` | ✅ | — |
| `--input-format` | `src/main.tsx:1203-1205` | ✅ | `.choices(['text', 'stream-json'])` |
| `--json-schema` | `src/main.tsx:1186` | ✅ | `new Option('--json-schema <schema>')` |
| `--managed-settings` | `src/main.tsx:1457-1462` | ✅ | T6 — inline JSON 或文件路径；最高优先级 policy tier（> managed-settings.json / MDM / HKCU） |
| `--max-budget-usd` | `src/main.tsx:1245` | ✅ | — |
| `--max-thinking-tokens` | `src/main.tsx:1230` | ✅ | deprecated 别名，新 `--thinking` |
| `--max-turns` | `src/main.tsx:1238` | ✅ | — |
| `--mcp-config` | `src/main.tsx:1284` | ✅ | `.option('--mcp-config <configs...>')` |
| `--model` | `src/main.tsx:1362` | ✅ | `.option('--model <model>')` |
| `--no-session-persistence` | `src/main.tsx:1343` | ✅ | — |
| `--output-format` | `src/main.tsx:1180-1182` | ✅ | `.choices(['text', 'json', 'stream-json'])` |
| `--permission-mode` | `src/main.tsx:1306` | ✅ | `new Option('--permission-mode <mode>')` |
| `--permission-prompt-tool` | `src/main.tsx:1286` | ✅ | — |
| `--plugin-dir` | `src/main.tsx:1413-1417` | ✅ | 单值 + collect accumulator |
| `--porcelain` | `src/main.tsx:1460` | ✅ | T7 — boolean, hideHelp；stream-json 已机器友好 |
| `--resume` | `src/main.tsx:1312` | ✅ | `.option('-r, --resume [value]')` |
| `--resume-session-at` | `src/main.tsx:1348` | ✅ | — |
| `--session-id` | `src/main.tsx:1400` | ✅ | `.option('--session-id <uuid>')` |
| `--session-mirror` | `src/main.tsx:1255` | ✅ | T8 — boolean, hideHelp；镜像在 SDK 侧 |
| `--strict-mcp-config` | `src/main.tsx:1396-1399` | ✅ | — |
| `--task-budget` | `src/main.tsx:1256` | ✅ | `new Option('--task-budget <tokens>')` |
| `--thinking` | `src/main.tsx:1223` | ✅ | `new Option('--thinking <mode>')` |
| `--thinking-display` | `src/main.tsx:1286-1290` | ✅ | T9 — `.choices(['summarized', 'omitted'])`；透传到 `src/services/api/claude.ts` thinking 参数 |
| `--tools` | `src/main.tsx:1277` | ✅ | `.option('--tools <tools...>')` |
| `--verbose` | `src/main.tsx:1164` | ✅ | — |
| `-p/--print` | `src/main.tsx:1166` | ✅ | `.option('-p, --print')` |

**汇总：** 41 ✅（所有 SDK 推送的 CLI flag 全部对齐）

## 表 B — SDK Options 字段接通（60 项）

数据源：`sdk.d.ts:1155-1807` 的 `Options` 联合类型 + `sdk.mjs` 中 init control message 字段构造。

### B.1 SDK 侧消费（subprocess spawn 之前）— 不需要 ccb 接通

| Option 字段 | 类型 | 状态 | 备注 |
|---|---|---|---|
| `pathToClaudeCodeExecutable` | `string` | N/A | SDK 用此定位 ccb 二进制；ccb 自身不消费 |
| `executable` | `'bun'\|'deno'\|'node'` | N/A | SDK spawn 时选择 JS runtime |
| `executableArgs` | `string[]` | N/A | SDK spawn 时附加到 runtime 之前 |
| `env` | `Record<string,string>` | N/A | SDK spawn 时合并到 subprocess env |
| `cwd` | `string` | N/A | SDK spawn 时作为 subprocess cwd |
| `stderr` | `(data:string)=>void` | N/A | SDK 监听 subprocess stderr 回调 |
| `abortController` | `AbortController` | N/A | SDK abort 时向 subprocess 发 SIGTERM |
| `spawnClaudeCodeProcess` | `(opts)=>SpawnedProcess` | N/A | SDK 自定义 spawn 函数；不传给 ccb |

### B.2 通过 CLI flag 接通 — 已 ✅

| Option 字段 | 对应 flag | ccb 入口 | 内部接通点 | 状态 |
|---|---|---|---|---|
| `additionalDirectories` | `--add-dir` | `src/main.tsx:1393` | `src/utils/permissions/permissionSetup.ts` | ✅ |
| `agent` | `--agent` | `src/main.tsx:1377` | `main.tsx:1403`+`print.ts:4610` | ✅ |
| `allowDangerouslySkipPermissions` | `--allow-dangerously-skip-permissions` | `src/main.tsx:1218` | `permissionSetup.ts` | ✅ |
| `betas` | `--betas` | `src/main.tsx:1378` | `src/services/api/claude.ts` betas 数组 | ✅ |
| `continue` | `--continue`/`-c` | `src/main.tsx:1310` | `print.ts:702` resume 流 | ✅ |
| `debug` | `--debug`/`-d` | `src/main.tsx:1149` | `src/utils/log.ts`/`debug.ts` | ✅ |
| `debugFile` | `--debug-file` | `src/main.tsx:1160` | `debug.ts` sink | ✅ |
| `disallowedTools` | `--disallowedTools`/`--disallowed-tools` | `src/main.tsx:1281` | `agentToolFilter.ts`+`tools.ts` | ✅ |
| `effort` | `--effort` | `src/main.tsx:1366` | `src/services/api/claude.ts:1666,1841` | ✅ |
| `fallbackModel` | `--fallback-model` | `src/main.tsx:1380` | `claude.ts` fallback 流 | ✅ |
| `forkSession` | `--fork-session` | `src/main.tsx:1317` | `print.ts:487,704` | ✅ |
| `includeHookEvents` | `--include-hook-events` | `src/main.tsx:1192` | `streamlinedTransform.ts` | ✅ |
| `includePartialMessages` | `--include-partial-messages` | `src/main.tsx:1197` | `streamlinedTransform.ts` | ✅ |
| `jsonSchema` (outputFormat) | `--json-schema` | `src/main.tsx:1186` | `claude.ts:1820` output_config | ✅ |
| `maxBudgetUsd` | `--max-budget-usd` | `src/main.tsx:1245` | `claude.ts` budget guard | ✅ |
| `maxThinkingTokens` (deprecated) | `--max-thinking-tokens` | `src/main.tsx:1230` | `thinking.ts` | ✅ |
| `maxTurns` | `--max-turns` | `src/main.tsx:1238` | `QueryEngine.ts` | ✅ |
| `mcpServers` | `--mcp-config` | `src/main.tsx:1284` | `src/services/mcp/` | ✅ |
| `model` | `--model` | `src/main.tsx:1362` | `bootstrap/state.ts` | ✅ |
| `outputFormat` | `--json-schema` | `src/main.tsx:1186` | `claude.ts:1662,1820` | ✅ |
| `permissionMode` | `--permission-mode` | `src/main.tsx:1306` | `permissionSetup.ts` | ✅ |
| `permissionPromptToolName` | `--permission-prompt-tool` | `src/main.tsx:1286` | `permissions/` MCP 桥接 | ✅ |
| `plugins` | `--plugin-dir` | `src/main.tsx:1413` | `src/utils/plugins/installedPluginsManager.ts` | ✅ |
| `persistSession` | `--no-session-persistence` | `src/main.tsx:1343` | `conversationRecovery.ts` | ✅ |
| `resume` | `--resume`/`-r` | `src/main.tsx:1312` | `print.ts:702,788` | ✅ |
| `resumeSessionAt` | `--resume-session-at` | `src/main.tsx:1348` | `print.ts:469,580,703` | ✅ |
| `sessionId` | `--session-id` | `src/main.tsx:1400` | `bootstrap/state.ts` | ✅ |
| `settings` | `--settings` | `src/main.tsx:1390` | `src/utils/settings/settings.ts` flagSettings 层 | ✅ |
| `settingSources` | `--setting-sources` | `src/main.tsx:1406` | `settings.ts` source 过滤 | ✅ |
| `strictMcpConfig` | `--strict-mcp-config` | `src/main.tsx:1396` | `src/services/mcp/` validation | ✅ |
| `taskBudget` | `--task-budget` | `src/main.tsx:1256` | `claude.ts:463-486` (含 `task-budgets-2026-03-13` beta header) | ✅ |
| `thinking` | `--thinking` | `src/main.tsx:1223` | `thinking.ts:11` ThinkingConfig | ✅ |
| `tools` | `--tools` | `src/main.tsx:1277` | `tools.ts`+`agentToolFilter.ts` | ✅ |

### B.3 通过 stdin control message（initialize）接通

数据源：`sdk.mjs` 中 `subtype:"initialize"` 消息构造 + `src/entrypoints/sdk/controlSchemas.ts:57-128` 接收 schema + `src/cli/print.ts:4558-4747` handler。

| Option 字段 | init 字段 | ccb schema | ccb handler | 状态 | 备注 |
|---|---|---|---|---|---|
| `systemPrompt` (string/array) | `systemPrompt` | ✅ `controlSchemas.ts:66` | ✅ `print.ts:4592-4594` | ✅ | |
| `systemPrompt.append` | `appendSystemPrompt` | ✅ `controlSchemas.ts:67` | ✅ `print.ts:4595-4597` | ✅ | |
| `agents` | `agents` | ✅ `controlSchemas.ts:68` | ✅ `print.ts:4603-4606` | ✅ | |
| `hooks` | `hooks` | ✅ `controlSchemas.ts:61-63` | ✅ `print.ts:4657-4674` | ✅ | |
| `jsonSchema` | `jsonSchema` | ✅ `controlSchemas.ts:65` | ✅ `print.ts:4675-4677` | ✅ | |
| `promptSuggestions` | `promptSuggestions` | ✅ `controlSchemas.ts:69` | ✅ `print.ts:3102-3107,4598-4600` | ✅ | |
| `agentProgressSummaries` | `agentProgressSummaries` | ✅ `controlSchemas.ts:70` | ✅ `print.ts:3109-3114` | ✅ | T10 — 移除 `tengu_slate_prism` flag 限制，SDK 模式下始终尊重 |
| `sdkMcpServers` | `sdkMcpServers` | ✅ `controlSchemas.ts:64` | ✅ `print.ts:3071-3083` | ✅ | |
| `title` | `title` | ✅ `controlSchemas.ts:71-76` | ✅ `print.ts:4687-4693` `saveAiGeneratedTitle` | ✅ | T10a — SDK 传入的 title 持久化为 session title，跳过 AI 生成 |
| `planModeInstructions` | `planModeInstructions` | ✅ `controlSchemas.ts:77-82` | ✅ `print.ts:4696-4698` `setSdkPlanModeInstructions` → `messages.ts:3624` `getPlanModeV2Instructions` | ✅ | T10b — `permissionMode:'plan'` 时替换 Phase 1-4 workflow body |
| `enableFileCheckpointing` | `enableFileCheckpointing` | ✅ `controlSchemas.ts:83-88` | ✅ `print.ts:4701-4703` `setSdkFileCheckpointingOptedIn` → `fileHistory.ts:65-80` gate | ✅ | T10c — SDK option 显式 opt-in；不再需要 env 变量 |
| `excludeDynamicSections` | `excludeDynamicSections` | ✅ `controlSchemas.ts:89-94` | ✅ `print.ts:4707-4709` `setSdkExcludeDynamicSections` → `queryContext.ts:82-88` systemContext→userContext 合并 | ✅ | T10f — 跨用户 prompt caching：dynamic sections 移入 user message，保留静态 cache 前缀 |
| `toolConfig` | `toolConfig` | ✅ `controlSchemas.ts:95-106` | ✅ `print.ts:4713-4716` `setQuestionPreviewFormat`（仅 `askUserQuestion.previewFormat` 子字段） | ✅ | T10h — `previewFormat: 'markdown'\|'html'` 控制 `AskUserQuestion` 选项 preview 输出格式 |
| `appendSubagentSystemPrompt` | `appendSubagentSystemPrompt` | ✅ `controlSchemas.ts:107-112` | ✅ `print.ts:4719-4721` `setSdkAppendSubagentSystemPrompt` → `AgentTool.tsx:666-667` 非 fork subagent launch path | ✅ | T10i — 每个 subagent system prompt 末尾追加；env-details 增强仍生效 |
| `forwardSubagentText` | `forwardSubagentText` | ✅ `controlSchemas.ts:113-118` | ✅ 现有 `parent_tool_use_id` 机制（`queryHelpers.ts`）已实现 subagent 消息链接 | ✅ | T10j forward-compat：SDK 0.2.141 未发布；ccb schema 接受避免升级时 schema error |
| `webSearchIsolationExemptMcpServers` | `webSearchIsolationExemptMcpServers` | ✅ `controlSchemas.ts:119-124` | N/A（底层 SDK 字段未发布） | ✅ | T10k forward-compat：SDK 0.2.141 未发布；ccb schema 接受避免升级时 schema error |

### B.4 SDK 通过 init 发送，但 ccb 未消费 — ❌

SDK 0.2.141 在 `subtype:"initialize"` 中会发送这些字段，但 ccb 当前 schema 没有声明，`handleInitializeRequest` 也没读取：

| Option 字段 | SDK 是否发送 | ccb schema 是否声明 | ccb handler 是否读取 | 修补难度 |
|---|---|---|---|---|
| `skills` | ✅ `skills:Array.isArray(...)?...:void 0` | ❌ | ❌ | M |

### B.5 通过其他机制接通 — ⚠️ / ❌

| Option 字段 | 接通状态 | 备注 |
|---|---|---|
| `canUseTool` | ✅ | 经由 SDK → `--permission-prompt-tool` 或 control_request `can_use_tool` 子类型；ccb 在 `print.ts:834` `getCanUseToolFn` 接住，permission pipeline 在 `src/utils/permissions/` |
| `onElicitation` | ✅ | 经由 SDK → ccb 在 `src/services/mcp/client.ts` 完整 elicitation 流；hook fallback |
| `sandbox` | ✅ | T10g — bubblewrap 集成完整（`@anthropic-ai/sandbox-runtime`，`src/utils/sandbox/`）；`sandboxTypes.ts` 接受完整 `SandboxSettings`（含 `network.deniedDomains` / `network.allowMachLookup`），`sandbox-adapter.ts:218-225` 合并到 sandbox config |
| `enableFileCheckpointing` | ✅ | T10c — 见 B.3；SDK option 显式 opt-in，不再需要 env 变量 |
| `toolConfig` | ✅ | T10h — 见 B.3；`askUserQuestion.previewFormat` 子字段已接通 |
| `managedSettings` | ✅ | T6 — CLI flag `--managed-settings`（表 A）+ settings 加载层 policy tier 已透传 |
| `sessionStore` | ❌ | `@alpha`，spec 非目标 |
| `sessionStoreFlush` | ❌ | `@alpha`，spec 非目标 |
| `loadTimeoutMs` | ❌ | `@alpha`，spec 非目标 |
| `extraArgs` | ✅ | SDK 通过 `MG=B2(...)` 通用 push 机制传任意 `--flag`，ccb Commander 默认接受（除 unknown option 外） |

### B.6 汇总

- **SDK 侧消费**：8 项 N/A
- **CLI flag 接通 ✅**：33 项（T6 `--managed-settings` / T9 `--thinking-display` 加入后全部对齐）
- **stdin init 接通 ✅**：15 项（含 T10 接入的 `title` / `planModeInstructions` / `enableFileCheckpointing` / `excludeDynamicSections` / `toolConfig` / `appendSubagentSystemPrompt` / `forwardSubagentText` / `webSearchIsolationExemptMcpServers` / `agentProgressSummaries` 去 flag）
- **stdin init 未消费 ❌**：1 项（`skills`，P1-M 待修）
- **其他机制 ✅**：5 项（`canUseTool` / `onElicitation` / `sandbox` / `enableFileCheckpointing` / `extraArgs`）
- **其他未接通 ❌**：3 项（`sessionStore` / `sessionStoreFlush` / `loadTimeoutMs` — `@alpha`，spec 非目标）

## 表 C — SDK 消息类型对齐

数据源：`sdk.d.ts:3133` 的 `SDKMessage` 联合（30 子类型）+ `sdk.d.ts:5495` 的 `StdoutMessage` 扩展（7 子类型）。ccb 端 emit/consume 点位：`src/QueryEngine.ts` / `src/cli/print.ts` / `src/utils/sdkEventQueue.ts` / `src/utils/streamlinedTransform.ts`。

### C.1 SDKMessage 核心类型（ccb → SDK 方向，必须正确 emit）

| 消息类型 | 触发条件 | ccb emit 点位 | 状态 | 备注 |
|---|---|---|---|---|
| `SDKAssistantMessage` | 每个模型回合 | `QueryEngine.ts`（query 流） | ✅ | type:'assistant' |
| `SDKUserMessage` | echo 用户输入 | `QueryEngine.ts:580,755,922` | ✅ | type:'user' |
| `SDKUserMessageReplay` | resume 历史回放 | `QueryEngine.ts`（resume 流） | ✅ | type:'user' + replay 标记 |
| `SDKResultMessage` (success) | 回合成功结束 | `QueryEngine.ts:631-632,1195-1196`; `print.ts:2938,4724,4861,4998` | ✅ | subtype:'success' |
| `SDKResultMessage` (error_max_turns) | 超过 maxTurns | `QueryEngine.ts:896-897` | ✅ | |
| `SDKResultMessage` (error_max_budget_usd) | 超过预算 | `QueryEngine.ts:1033-1034` | ✅ | |
| `SDKResultMessage` (error_during_execution) | 异常 | `QueryEngine.ts:1140-1141`; `print.ts:2540,5086` | ✅ | |
| `SDKResultMessage` (error_max_structured_output_retries) | 结构化输出重试失败 | `QueryEngine.ts:1078-1079` | ✅ | ccb 扩展（SDK 0.2.141 未在 d.ts 中列出但消费者应能容忍） |
| `SDKSystemMessage` (init) | 启动 | `utils/messages/systemInit.ts:59` | ✅ | subtype:'init' |
| `SDKSystemMessage` (status) | 状态变化 | `print.ts:1096,2269`; `commands/clear/conversation.ts:62` | ✅ | subtype:'status' |
| `SDKPartialAssistantMessage` | includePartialMessages=true | `QueryEngine.ts:852` | ✅ | type:'stream_event' |
| `SDKCompactBoundaryMessage` | 上下文压缩 | `QueryEngine.ts:611-612,974-975` | ✅ | subtype:'compact_boundary' |
| `SDKAPIRetryMessage` | API 重试 | `QueryEngine.ts:991-992` | ✅ | subtype:'api_retry' |
| `SDKStatusMessage` | 状态信息 | 已合并入 SDKSystemMessage | ✅ | |
| `SDKLocalCommandOutputMessage` | 本地 slash 命令输出 | `print.ts` slash 处理 | ✅ | |
| `SDKHookStartedMessage` | includeHookEvents=true + hook 启动 | `print.ts:648` | ✅ | subtype:'hook_started' |
| `SDKHookProgressMessage` | hook 进度 | `print.ts:658` | ✅ | subtype:'hook_progress' |
| `SDKHookResponseMessage` | hook 响应 | `print.ts:671` | ✅ | subtype:'hook_response' |
| `SDKPluginInstallMessage` | 插件安装事件 | `src/utils/plugins/` | ✅ | |
| `SDKToolProgressMessage` | 工具执行进度 | `utils/task/sdkProgress.ts:23` | ✅ | subtype:'task_progress' |
| `SDKAuthStatusMessage` | Bedrock 认证状态 | `print.ts:4733-4745` | ✅ | type:'auth_status' |
| `SDKTaskStartedMessage` | TaskCreate | `utils/task/framework.ts:106` | ✅ | |
| `SDKTaskUpdatedMessage` | TaskUpdate | `utils/sdkEventQueue.ts` | ✅ | |
| `SDKTaskProgressMessage` | Task 进度 | `utils/sdkEventQueue.ts:19`; `utils/task/sdkProgress.ts:23` | ✅ | |
| `SDKTaskNotificationMessage` | Task 通知 | `utils/sdkEventQueue.ts:43,126`; `print.ts:2131` | ✅ | |
| `SDKSessionStateChangedMessage` | session 状态变化 | `utils/sessionState.ts:220`; `utils/sdkEventQueue.ts:64` | ✅ | |
| `SDKNotificationMessage` | REPL 通知镜像 | `print.ts`（交互模式） | ⚠️ | print 模式不发；非阻塞 |
| `SDKFilesPersistedEvent` | 文件持久化 | `print.ts:2373` | ✅ | subtype:'files_persisted' |
| `SDKToolUseSummaryMessage` | streamlined 模式累积 | `streamlinedTransform.ts:171` | ⚠️ | ccb 自有 streamlined_text/tool_use_summary；SDK 标准格式待对齐 |
| `SDKMemoryRecallMessage` | memory recall | — | ❌ | ccb 未发出（P2，非 SDK 必需） |
| `SDKRateLimitEvent` | 速率限制 | `print.ts`（受 limited 路径） | ⚠️ | 部分场景发出 |
| `SDKElicitationCompleteMessage` | MCP elicitation 完成 | `print.ts:1400` | ✅ | subtype:'elicitation_complete' |
| `SDKPermissionDeniedMessage` | 工具被拒 | `permissions/` 流 | ⚠️ | deny 决策未单独发出（被合并到 tool_result） |
| `SDKPromptSuggestionMessage` | promptSuggestions=true | `print.ts:1116,2419` | ✅ | type:'prompt_suggestion' |
| `SDKMirrorErrorMessage` | sessionStore 镜像失败 | — | ❌ | @alpha，sessionStore 未接通（P2） |

### C.2 StdoutMessage 扩展（ccb → SDK 方向）

| 消息类型 | ccb emit 点位 | 状态 | 备注 |
|---|---|---|---|
| `SDKPostTurnSummaryMessage` | — | ❌ | ccb 未发；非 SDK 必需（增强功能） |
| `SDKTaskSummaryMessage` | — | ❌ | ccb 未发；非 SDK 必需 |
| `SDKTranscriptMirrorMessage` | — | ❌ | @alpha，sessionStore 未接通（P2） |

### C.3 控制消息（双向）

| 消息类型 | 方向 | ccb 处理点位 | 状态 | 备注 |
|---|---|---|---|---|
| `SDKControlRequest` (initialize) | SDK→ccb | `print.ts:3068-3116,4558-4747` | ✅ | 完整 initialize handler |
| `SDKControlRequest` (interrupt) | SDK→ccb | `print.ts:3060` | ✅ | abort 流 |
| `SDKControlRequest` (can_use_tool) | SDK→ccb | `print.ts:4106`（remote_control）；`structuredIO.ts` | ✅ | permission pipeline |
| `SDKControlRequest` (set_permission_mode) | SDK→ccb | structuredIO handler | ✅ | |
| `SDKControlRequest` (set_model) | SDK→ccb | structuredIO handler | ✅ | |
| `SDKControlRequest` (set_max_thinking_tokens) | SDK→ccb | structuredIO handler | ✅ | |
| `SDKControlRequest` (mcp_status) | SDK→ccb | structuredIO handler | ✅ | |
| `SDKControlRequest` (get_context_usage) | SDK→ccb | structuredIO handler | ✅ | |
| `SDKControlResponse` (success/error) | ccb→SDK | `print.ts:2936,2950,4579,4722,4813,4825,4845,4859,4905,4996` | ✅ | 多个 handler |
| `SDKControlCancelRequest` | SDK→ccb | `print.ts:907,3025` | ✅ | |
| `SDKKeepAliveMessage` | SDK→ccb | `print.ts:918,4250` | ✅ | 静默忽略 |

### C.4 汇总

- **SDKMessage 30 子类型**：23 ✅ + 4 ⚠️ + 3 ❌
- **StdoutMessage 3 扩展**：3 ❌（全部为增强功能或 @alpha）
- **控制消息 11 类型**：11 ✅

### C.5 关键观察

1. **SDK 基本用法所需的消息类型全部 ✅**：assistant / user / result(success) / control_response 四件套完整
2. **所有 result error 子类型全部 ✅**：max_turns / max_budget_usd / during_execution 都正确发出
3. **Hook 消息链 ✅**：hook_started / hook_progress / hook_response 三件套完整（仅 includeHookEvents=true 时）
4. **Task/Session 状态消息 ✅**：Task 系列和 session_state_changed 完整
5. **缺失的 3 个 SDKMessage 子类型**（`SDKMemoryRecallMessage` / `SDKMirrorErrorMessage`）和 3 个 StdoutMessage 扩展（`SDKPostTurnSummaryMessage` / `SDKTaskSummaryMessage` / `SDKTranscriptMirrorMessage`）都不阻塞 SDK 基本用法，属增强或 @alpha 功能
6. **`SDKPermissionDeniedMessage` ⚠️**：deny 决策当前合并到 tool_result 中，未单独发出 system message。SDK 文档说"host 渲染拒绝"会用这个消息，缺它会让 SDK 消费者只能从 tool_result 推断。但 SDK 不要求必须发。

## 修补候选清单

### P0（阻塞 SDK 常见用法，必修）

- [x] **T6 — `--managed-settings` CLI flag**（表 A ✅ + 表 B `managedSettings` ✅）
  - 完成：`src/main.tsx:1454-1461` Commander option；settings 加载层在最高优先级 policy tier 透传
  - 接受 inline JSON 或文件路径

- [x] **T7 — `--porcelain` CLI flag**（表 A ✅）
  - 完成：`src/main.tsx:1465-1467` boolean, hideHelp；stream-json 输出本就是机器友好

- [x] **T8 — `--session-mirror` CLI flag**（表 A ✅）
  - 完成：`src/main.tsx:1255-1258` boolean, hideHelp；镜像逻辑在 SDK 侧

- [x] **T9 — `--thinking-display` CLI flag**（表 A ✅）
  - 完成：`src/main.tsx:1284-1289` `summarized|expanded|hidden` 选择；透传到 thinking 参数

### P1（影响具体 option，工作量 ≤ L 时修）

- [x] **T10a — `title` 字段接通**（表 B.3 ✅）
  - 完成：`controlSchemas.ts:71-76` schema + `print.ts:4687-4689` 调用 `saveAiGeneratedTitle`

- [ ] **`skills` 字段接通**（表 B.4 ❌）
  - SDK 发送 `skills: string[]` 过滤；ccb 未消费，所有 skill 都暴露给模型
  - 修补：扩展 init schema + 在 `src/utils/skills/` 加 skills filter
  - 工作量：M

- [x] **T10b — `planModeInstructions` 字段接通**（表 B.3 ✅）
  - 完成：`controlSchemas.ts:77-82` schema + `print.ts:4691-4693` setter → `messages.ts:3624` 替换 plan-mode workflow body

- [x] **T10c — `enableFileCheckpointing` SDK option 透传**（表 B.3 ✅ + 表 B.5 ✅）
  - 完成：`controlSchemas.ts:83-88` schema + `print.ts:4695-4697` setter → `fileHistory.ts:65-80` gate

- [x] **T10f — `excludeDynamicSections` 字段接通**（表 B.3 ✅）
  - 完成：`controlSchemas.ts:89-94` schema + `print.ts:4699-4701` setter → `queryContext.ts:82-88` systemContext→userContext 合并

- [x] **T10-aps — `agentProgressSummaries` 去掉 feature flag 限制**（表 B.3 ✅）
  - 完成：`print.ts:3109-3114` 移除 `tengu_slate_prism` flag check；SDK 模式下始终尊重

- [x] **T10g — `sandbox` settings 子项透传**（表 B.5 ✅）
  - 完成：`sandboxTypes.ts` 接受完整 `SandboxSettings`（含 `network.deniedDomains` / `network.allowMachLookup`）；`sandbox-adapter.ts:218-225` 合并到 sandbox config

- [x] **T10h — `toolConfig` 接通**（表 B.3 ✅ + 表 B.5 ✅）
  - 完成：`controlSchemas.ts:95-106` schema（`askUserQuestion.previewFormat` 子字段）+ `print.ts:4703-4711` `setQuestionPreviewFormat`

- [x] **T10i — `appendSubagentSystemPrompt` 字段接通**（表 B.3 ✅）
  - 完成：`controlSchemas.ts:107-112` schema + `print.ts:4713-4715` setter → `AgentTool.tsx:666-667` 非 fork subagent launch path 追加

- [x] **T10j — `forwardSubagentText` 字段接通**（表 B.3 ✅，forward-compat）
  - 完成：`controlSchemas.ts:113-118` schema 接受；底层 `parent_tool_use_id` 机制已实现
  - SDK 0.2.141 未发布此字段；ccb schema 接受避免升级时 schema error

- [x] **T10k — `webSearchIsolationExemptMcpServers` 字段接通**（表 B.3 ✅，forward-compat）
  - 完成：`controlSchemas.ts:119-124` schema 接受
  - SDK 0.2.141 未发布此字段；ccb schema 接受避免升级时 schema error

### P2（alpha / 边缘，本阶段不修）

- [ ] `sessionStore` / `sessionStoreFlush` / `loadTimeoutMs`（`@alpha`）
- [ ] `spawnClaudeCodeProcess` 自定义 spawn（SDK 侧）
- [ ] `SDKPostTurnSummaryMessage` / `SDKTaskSummaryMessage` emit（增强功能）
- [ ] `SDKTranscriptMirrorMessage` / `SDKMirrorErrorMessage` emit（@alpha，依赖 sessionStore）
- [ ] `SDKMemoryRecallMessage` emit（增强功能）
- [ ] `SDKToolUseSummaryMessage` 标准格式对齐（当前是 ccb 自有 streamlined_text）
- [ ] `SDKPermissionDeniedMessage` 单独 emit（当前合并到 tool_result）
- [ ] `SDKNotificationMessage` 在 print 模式 emit（交互功能）
