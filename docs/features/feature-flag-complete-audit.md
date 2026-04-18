# Feature Flag 完整审计报告

> 日期: 2026-04-16
> 基线: 当前 `chore/lint-cleanup` 本地 squash 提交 `5feb4103`
> 范围: `src/`、`packages/`、`scripts/` 内的静态 `feature('FLAG_NAME')`
> 排除: `node_modules/`、`dist/`、明显的嵌套生成型 `src/**/src/**` 镜像

> 本文将源码机械扫描结果按语义内联到对应条目: feature 行追加调用数/源码证据，command/CLI/tool/env/GrowthBook/availability/hidden/non-feature gate 证据归入 `0.8 非 feature()` 与对应命令章节，不再维护单独附录文件。

## 0. 2026-04-16 再审计增量结论

本轮重新扫描 `src/`、`packages/`、`scripts/` 的 3332 个 tracked source 文件，得到以下基线:

| 项 | 数量 | 说明 |
| --- | ---: | --- |
| 静态 `feature(...)` 键 | 93 | 其中 1 个是 `scripts/verify-gates.ts` 的模板 `${check.compileFlag}`，不计入真实运行 feature。 |
| 真实运行 feature flag | 92 | 与前次矩阵一致。 |
| 静态 `feature(...)` 调用点 | 1040 | 含工具、命令、UI、API、prompt、测试辅助路径。 |
| build 默认启用 feature | 33 | `build.ts` 去除注释后统计。 |
| dev 默认启用 feature | 39 | `scripts/dev.ts` 去除注释后统计。 |
| dev-only 默认 feature | 6 | `BUDDY`、`TRANSCRIPT_CLASSIFIER`、`REACTIVE_COMPACT`、`SKILL_LEARNING`、`WEB_BROWSER_TOOL`、`CACHED_MICROCOMPACT`。 |
| `USER_TYPE` 非 feature gate | 491 处 | 内部/外部能力边界，不能由 `feature()` 矩阵覆盖。 |
| 全部 `process.env.*` runtime gate | 589 个变量 | provider、auth、telemetry、runtime、debug、platform、CI、native backend、tool/search 行为的完整环境变量面。 |
| GrowthBook dynamic config/gate keys | 93 个 | 运行时 rollout、kill-switch、远端参数，不等价于 build-time feature；含动态模板 key。 |
| `availability` 命令 gate | 9 个命令入口 | `claude-ai` / `console` 账户类型可见性控制。 |
| hidden/disabled command stubs | 20+ | 多数不是 feature-gated，但仍是用户可感知的缺失功能面。 |

### 0.1 本轮方法修正

这次审计不再只按 92 个 `feature('FLAG_NAME')` 输出结论，而是分成三层:

1. **编译期 feature layer**: `feature('FLAG_NAME')` 决定代码路径是否进入 build/dev bundle。
2. **运行期 entitlement layer**: `USER_TYPE`、OAuth/订阅、policy limits、GrowthBook、provider env、model/tool beta 支持决定功能是否真正可用。
3. **实现完整度 layer**: 即使入口和 gate 都存在，也要检查核心实现是否 no-op、只返回空结果、只做本地 shell、依赖远端不可复刻，或只是 UI/prompt 小开关。

因此，本文后续结论中的“完整实现”只表示当前代码的本地语义闭合；若同时依赖 Claude.ai、CCR、GrowthBook、GitHub webhook、native attestation、远端 settings sync，则仍会标注为“订阅/远端受限”。

### 0.2 当前最重要的缺口分层

| 等级 | 功能 | 当前判断 | 证据 |
| --- | --- | --- | --- |
| P0 | `SSH_REMOTE` | **占位**，入口完整但 session factory 直接抛 unsupported。 | `src/main.tsx:732`, `src/main.tsx:3783`, `src/main.tsx:4829`; `src/ssh/createSSHSession.ts:27-35` |
| P0 | `BASH_CLASSIFIER` | **占位**，消费链很多，但核心 classifier 恒 disabled。 | `packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1463-1576`; `src/utils/permissions/bashClassifier.ts:24-51` |
| P0 | `BYOC_ENVIRONMENT_RUNNER` | **占位/no-op**，CLI fast path 接到空函数。 | `src/entrypoints/cli.tsx:251-254`; `src/environment-runner/main.ts:3-4` |
| P0 | `SELF_HOSTED_RUNNER` | **占位/no-op**，CLI fast path 接到空函数。 | `src/entrypoints/cli.tsx:261-264`; `src/self-hosted-runner/main.ts:3-4` |
| P0 | `TERMINAL_PANEL` / `TerminalCaptureTool` | **最小/空返回**，工具存在但 capture 返回空内容。 | `src/tools.ts:122-124`; `packages/builtin-tools/src/tools/TerminalCaptureTool/TerminalCaptureTool.ts:77-78` |
| P1 | `WEB_BROWSER_TOOL` | **最小实现**，HTTP fetch/text snapshot，不是 full browser；Panel 是 stub。 | `src/tools.ts:126-128`; `packages/builtin-tools/src/tools/WebBrowserTool/WebBrowserTool.ts:43-54`; `WebBrowserPanel.ts:3` |
| P1 | `REVIEW_ARTIFACT` | **本地 MVP**，schema、permission UI、tool result 有，但不是远端 artifact review 产品面。 | `src/tools.ts:141-143`; `src/components/permissions/PermissionRequest.tsx:177`; `ReviewArtifactTool.ts:59-137` |
| P1 | `MCP_RICH_OUTPUT` | **展示层最小实现**，只影响 MCP UI rich render。 | `packages/builtin-tools/src/tools/MCPTool/UI.tsx:58`, `:167`, `:189` |
| P1 | hidden command stubs | **非 feature 缺口**，多个命令 `isEnabled:false` / `isHidden:true`。 | `src/commands/*/index.js`, 例如 `ant-trace`, `autofix-pr`, `bughunter`, `teleport`, `reset-limits` |
| P2 | `SKILL_LEARNING` / `SKILL_IMPROVEMENT` | **项目侧可用闭环**，但完整“长期 stocktake/merge/prune”属于 Codex 用户级 skill-learning-evolution，本项目侧仍是产品内 skill learning MVP。 | `src/services/skillLearning/featureCheck.ts:3-8`; `src/services/skillSearch/prefetch.ts:197-205`; `src/utils/hooks/skillImprovement.ts:190-194` |

### 0.3 非 `feature()` 功能面必须单独审计

| 功能面 | 主要 gate | 影响 |
| --- | --- | --- |
| 多 provider API | `CLAUDE_CODE_USE_OPENAI`、`CLAUDE_CODE_USE_GEMINI`、`CLAUDE_CODE_USE_GROK`、`CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_VERTEX`、`CLAUDE_CODE_USE_FOUNDRY` | 完整 API 能力取决于 provider env 与模型适配；不是 feature flag。见 `src/utils/model/providers.ts`。 |
| 内部/外部能力差异 | `process.env.USER_TYPE === 'ant'` | `ConfigTool`、`TungstenTool`、REPLTool、internal commands、undercover、telemetry/debug 多处只对 ant build 开。 |
| Claude.ai / Console 可见性 | command `availability` | `/voice`、`/usage`、`/upgrade`、`/desktop`、`/web-setup`、`/install-slack-app` 等受账号类型限制。 |
| policy limits | `isPolicyAllowed(...)` | remote sessions、remote control、feedback 等可以被组织策略关闭；API 失败时大多 fail open。 |
| GrowthBook | `getFeatureValue_CACHED_MAY_BE_STALE(...)` / `checkGate_CACHED_OR_BLOCKING(...)` | `tengu_*` 运行时 gate 决定 KAIROS、Bridge、ToolSearch、Voice、Terminal panel 等是否真正激活。 |
| Tool Search | `ENABLE_TOOL_SEARCH`、model supports `tool_reference`、provider/base URL | 大工具池是否延迟加载，不由 `feature()` 直接决定。 |
| hidden command stubs | `isEnabled: () => false` / `isHidden: true` | 不在 92 feature 里，但会让“命令功能面”显得缺失。 |
| native/platform | OS、Bun WebView、native packages、audio/computer-use backend | 功能可用性取决于平台，不是 feature flag。 |

### 0.4 订阅/远端可实现 vs 自建替代

| 功能族 | 有订阅/远端时 | 无订阅/远端时的自建替代 |
| --- | --- | --- |
| Remote Control / Bridge | `BRIDGE_MODE` + claude.ai subscription + full-scope OAuth + `tengu_ccr_bridge` 可走官方 CCR。`bridgeEnabled.ts` 明确检查订阅、profile scope、organization UUID。 | self-hosted bridge 已有路径，`isSelfHostedBridge()` 可绕过官方 GrowthBook/订阅 gate。 |
| KAIROS / assistant / brief / channels | 有 Claude.ai、GrowthBook、远端 session/channel 服务时可实现官方语义。 | 本地只能保留 UI、prompt、tool、bridge fallback；不能伪造官方 assistant/channel 后端。 |
| settings sync | OAuth + `CLAUDE_AI_INFERENCE_SCOPE` + `/api/claude_code/user_settings` 可同步。 | 可做本地 import/export、文件同步、RCS 内部同步替代。 |
| policy limits | Console API key eligible；OAuth Team/Enterprise/C4E eligible。 | 外部 provider/custom base URL不调用 policy endpoint，只能本地 policy/config 替代。 |
| BYOC/self-hosted runner | 官方 worker service 协议不可见。 | 可用现有 bridge/job/daemon/RCS work-dispatch 模式自建 register/poll/heartbeat skeleton。 |
| SSH remote | 不依赖官方远端。 | 可直接自建，现有 `SSHSession` / `SSHSessionManager` 接口足够反推。 |
| Bash classifier | Anthropic 内部 classifier 不可见。 | 可用本地规则、tree-sitter bash、read-only validator、permission fixtures 实现保守替代。 |
| Full browser | 官方可能有 Chrome/CCR 浏览器环境。 | 已有 WebBrowser lite + Chrome MCP；可用 Playwright/Chrome MCP/Bun WebView 自建 full runtime。 |

### 0.5 当前可以直接反推实现的清单

| 功能 | 反推依据 | 建议恢复方式 |
| --- | --- | --- |
| `SSH_REMOTE` | `main.tsx` 已有 CLI 参数、pending state、REPL handoff；`createSSHSession.ts` 定义完整接口。 | 先实现 local subprocess-backed `createLocalSSHSession()`，再接真实 `ssh` subprocess 和 stderr ring buffer。 |
| `BASH_CLASSIFIER` | `bashPermissions.ts` 已完整消费 deny/ask/allow classifier 结果；`bashClassifier.ts` 类型稳定。 | 先实现 prompt rule parser + conservative local classifier，不追求等价 Anthropic 内部模型。 |
| `BYOC_ENVIRONMENT_RUNNER` | entrypoint 注释写明 headless runner；daemon/job/bridge/RCS 已有 state、heartbeat、dispatch 模式。 | 先禁止 no-op 成功，补参数校验、register/poll/heartbeat skeleton。 |
| `SELF_HOSTED_RUNNER` | entrypoint 注释写明 register/poll/heartbeat；RCS server 已有自托管控制面。 | 从 RCS dispatch 抽 adapter，补本地可测协议。 |
| `TERMINAL_PANEL` | keybinding/tool/schema 已接线，缺 terminal runtime provider。 | 先接当前 foreground terminal snapshot，再扩展 panel id/runtime。 |
| `WEB_BROWSER_TOOL` | Tool 已可 fetch；Panel 是空；Chrome MCP 可提供 full browser 能力。 | 保持 lite tool 命名清晰；full browser 另接 Chrome MCP/Playwright/Bun WebView。 |
| `REVIEW_ARTIFACT` | Tool schema + permission UI + result render 已有。 | 先做本地 artifact renderer/line annotation surface，不等远端 schema。 |

### 0.6 本轮 skill 自学习/进化验证结果

本轮按 `skill-learning-evolution` controller 流程执行: 先推荐并加载 `feature-flag-implementation-auditor`，再把业务审计新增要求归属到该 task skill，而不是写入 controller。当前 Codex 侧用户级 learning/evolution 机制已经具备推荐、加载、observation、instinct、task skill refinement、promotion、maintenance、merge/prune、search 回流验证等闭环。

| 项 | 当前结果 |
| --- | --- |
| `feature-flag-implementation-auditor` 推荐 | `decision: load`, confidence 1。 |
| controller / task skill 归属 | `skill-learning-evolution` 作为 controller；Feature Flag 审计要求归入 `feature-flag-implementation-auditor`。 |
| observation / instinct | 已记录 prompt、tool observation、Stop 结果，并生成 project-scoped instinct。 |
| task skill 进阶 | 已将“每个 feature/非 feature gate 的具体功能、子命令、CLI/tool 入口、证据路径”等要求写入 `feature-flag-implementation-auditor` 的 learned refinements。 |
| 长期维护 | 已具备 `stocktake`、`continuous_learning_maintenance`、`learning_scheduler`、`skill_merge_prune`、`promote/prune/import/export`。 |
| observer 行为 | 已具备 PreToolUse/PostToolUse observation、observer loop、observer manager、session guardian、模型 observer 命令路径、fail-closed sentinel。 |
| 回流验证 | 生成或晋升后的 skill 会通过 `refresh_skill_index.js` / recommender 验证 discoverable。 |

验证证据来自 `C:\Users\12180\.codex\skills\skill-learning-evolution\scripts\validate_codex_skill_runtime.js`，其中覆盖:

```text
OK controller keeps task refinements on the loaded task skill
OK PreToolUse/PostToolUse observer records project-scoped observations
OK observer-loop can use model observer command path
OK observer-loop fails closed with sentinel on confirmation prompt
OK negative feedback lowers or caps instinct confidence
OK continuous-learning-v2 synthesizes related instincts into one skill
OK refresh-skill-index writes discoverability report
OK skill-merge-prune merges duplicate content and archives duplicate
```
### 0.7 Feature Flag 逐项功能与入口说明

这张表补齐“每个 feature 到底做什么、有没有用户子命令/CLI入口/工具入口”。`无直接入口` 表示它只影响内部 UI、prompt、服务、hook、telemetry 或工具行为，不会单独出现在 slash command/CLI subcommand 中。

| Feature | 具体功能 | 用户入口 / 子命令 / 工具入口 | 运行边界与当前状态 | 调用数 | 源码证据 |
| --- | --- | --- | --- | ---: | --- |
| `ABLATION_BASELINE` | 启动时把一组能力降到 L0 baseline，用于评测/消融实验。 | CLI 启动环境变量 `CLAUDE_CODE_ABLATION_BASELINE`；无 slash command。 | 只在 `src/entrypoints/cli.tsx` 早期设置 env，完整但诊断向。 | 1 | src/entrypoints/cli.tsx:52 |
| `AGENT_MEMORY_SNAPSHOT` | 在 agent/subagent 场景保存或携带 memory snapshot，减少上下文丢失。 | Agent/Task 内部链路；无直接子命令。 | MVP，功能面窄，可继续补冲突、过期、恢复策略。 | 2 | packages/builtin-tools/src/tools/AgentTool/loadAgentsDir.ts:348; src/main.tsx:2777 |
| `AGENT_TRIGGERS` | 本地定时/触发型 agent 任务能力。 | Cron tools: `CronCreateTool`、`CronDeleteTool`、`CronListTool`；相关 scheduled task/loop skill。 | 本地链路可用。 | 3 | packages/builtin-tools/src/tools/ScheduleCronTool/prompt.ts:13; src/screens/REPL.tsx:347; src/screens/REPL.tsx:4905 |
| `AGENT_TRIGGERS_REMOTE` | 远程触发 agent/task。 | `RemoteTriggerTool`。 | 完整实现；官方远程事件环境受订阅/OAuth/policy/GrowthBook 运行条件限制；本地调用审计已实现。 | 2 | src/skills/bundled/index.ts:48; src/tools.ts:39 |
| `ALLOW_TEST_VERSIONS` | 安装器/更新器允许测试版本。 | 更新/安装流程内部；无直接子命令。 | 小型完整开关。 | 2 | src/utils/nativeInstaller/download.ts:124; src/utils/nativeInstaller/download.ts:495 |
| `AUTO_THEME` | 自动主题选择和 theme provider 行为。 | `/theme`、theme settings/picker。 | 完整实现。 | 3 | packages/@ant/ink/src/theme/ThemeProvider.tsx:91; packages/builtin-tools/src/tools/ConfigTool/supportedSettings.ts:34; src/components/ThemePicker.tsx:73 |
| `AWAY_SUMMARY` | 用户离开/恢复时生成 away summary。 | REPL/session hook；无直接子命令。 | 完整实现，可继续优化摘要质量。 | 3 | src/hooks/useAwaySummary.ts:52; src/hooks/useAwaySummary.ts:132; src/screens/REPL.tsx:1495 |
| `BASH_CLASSIFIER` | 用 classifier 对 Bash 权限请求进行 deny/ask/allow 语义判定。 | BashTool 权限流、permission UI；无独立子命令。 | 核心 `bashClassifier.ts` 是 stub，当前是占位但可本地规则反推。 | 49 | packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:84; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:631; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1429; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1576; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1645; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1760; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1960; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:2027 |
| `BG_SESSIONS` | 后台会话、进程状态、日志、attach/kill。 | CLI: `--bg`/`--background`、`ps`、`logs`、`attach`、`kill`；slash: `/daemon`。 | 完整实现，旧 CLI 入口映射到 `daemon`。 | 16 | src/commands.ts:116; src/commands/daemon/index.ts:11; src/commands/exit/exit.tsx:21; src/entrypoints/cli.tsx:184; src/entrypoints/cli.tsx:198; src/entrypoints/cli.tsx:211; src/main.tsx:1524; src/query.ts:125 |
| `BREAK_CACHE_COMMAND` | 调试 prompt cache break / context cache。 | `/clear` 或 cache/debug 相关内部命令路径。 | 小型诊断开关。 | 2 | src/context.ts:131; src/context.ts:143 |
| `BRIDGE_MODE` | Remote Control / Bridge，本机作为远程控制 bridge environment。 | CLI: `remote-control`、`rc`、`remote`、`sync`、`bridge`；slash: `/remote-control`、`/rc`。 | 完整实现；本地/self-hosted 可用；官方 CCR 需 claude.ai 订阅、full-scope OAuth、GrowthBook、policy。 | 33 | packages/builtin-tools/src/tools/BriefTool/attachments.ts:4; packages/builtin-tools/src/tools/BriefTool/attachments.ts:88; packages/builtin-tools/src/tools/BriefTool/upload.ts:99; packages/builtin-tools/src/tools/ConfigTool/supportedSettings.ts:153; packages/builtin-tools/src/tools/PushNotificationTool/PushNotificationTool.ts:84; src/bridge/bridgeEnabled.ts:26; src/bridge/bridgeEnabled.ts:32; src/bridge/bridgeEnabled.ts:38 |
| `BUDDY` | coding companion / buddy UI、prompt、通知。 | slash: `/buddy`。 | 可用但依赖 companion 状态，仍可优化。 | 18 | src/buddy/CompanionSprite.tsx:108; src/buddy/CompanionSprite.tsx:155; src/buddy/CompanionSprite.tsx:278; src/buddy/prompt.ts:18; src/buddy/useBuddyNotification.tsx:41; src/buddy/useBuddyNotification.tsx:55; src/commands.ts:153; src/components/PromptInput/PromptInput.tsx:343 |
| `BUILDING_CLAUDE_APPS` | 注册/暴露 Claude apps 相关 bundled skill/docs。 | Skill/command surface；无核心 runtime 子命令。 | 文档型/skill 型最小实现。 | 1 | src/skills/bundled/index.ts:56 |
| `BUILTIN_EXPLORE_PLAN_AGENTS` | 内置 explore/plan 类 agent 定义开关。 | AgentTool 内置 agent 类型；无 slash command。 | 完整小型 gate。 | 1 | packages/builtin-tools/src/tools/AgentTool/builtInAgents.ts:14 |
| `BYOC_ENVIRONMENT_RUNNER` | BYOC headless environment runner。 | CLI: `environment-runner`。 | 入口接到 `environmentRunnerMain()`，当前函数 no-op，占位。 | 1 | src/entrypoints/cli.tsx:251 |
| `CACHED_MICROCOMPACT` | cache_edits / microcompact，优化 compact 后缓存复用。 | compact/API 内部；无直接子命令。 | 主链路存在，可继续硬化 provider/cache fallback。 | 13 | src/constants/prompts.ts:67; src/constants/prompts.ts:797; src/query.ts:471; src/query.ts:936; src/services/api/claude.ts:1210; src/services/api/claude.ts:1497; src/services/api/claude.ts:2913; src/services/api/claude.ts:3069 |
| `CCR_AUTO_CONNECT` | CCR 自动连接默认值。 | Remote Control 启动流程；无直接子命令。 | 完整实现，远端/GrowthBook 运行条件。 | 3 | src/bridge/bridgeEnabled.ts:199; src/utils/config.ts:39; src/utils/config.ts:1099 |
| `CCR_MIRROR` | CCR mirror/outbound-only session mirror。 | Remote Control/bridge 内部；无直接子命令。 | 完整实现，远端运行条件；可做 self-hosted fallback。 | 4 | src/bridge/bridgeEnabled.ts:211; src/bridge/remoteBridgeCore.ts:748; src/bridge/remoteBridgeCore.ts:764; src/main.tsx:3476 |
| `CCR_REMOTE_SETUP` | Claude Code on web / remote setup。 | slash: `/web-setup`。 | `availability: ['claude-ai']`，依赖 Claude web/GitHub 上传服务。 | 1 | src/commands.ts:98 |
| `CHICAGO_MCP` | computer-use MCP server 与 native computer-use 工具。 | CLI: `--computer-use-mcp`；MCP tools。 | 可用，但完整度受 OS/native backend 影响。 | 16 | src/entrypoints/cli.tsx:112; src/main.tsx:1926; src/main.tsx:2060; src/query.ts:1102; src/query.ts:1562; src/query/stopHooks.ts:174; src/services/analytics/metadata.ts:130; src/services/mcp/client.ts:244 |
| `COMMIT_ATTRIBUTION` | commit attribution、trailers、session/worktree 归因。 | Git/commit flow 内部；无直接子命令。 | 完整实现。 | 12 | src/cli/print.ts:817; src/cli/print.ts:2965; src/cli/print.ts:4261; src/commands/clear/caches.ts:105; src/screens/REPL.tsx:4086; src/services/compact/postCompactCleanup.ts:71; src/setup.ts:345; src/utils/attribution.ts:383 |
| `COMPACTION_REMINDERS` | context compact 提醒。 | REPL/compact UI 内部。 | 小型完整开关。 | 1 | src/utils/attachments.ts:940 |
| `CONNECTOR_TEXT` | connector text block 处理、API logging、message render、signature stripping。 | API/message pipeline；无直接子命令。 | 完整实现。 | 7 | src/components/Message.tsx:384; src/services/api/claude.ts:656; src/services/api/claude.ts:2137; src/services/api/claude.ts:2200; src/services/api/logging.ts:666; src/utils/messages.ts:3156; src/utils/messages.ts:5280 |
| `CONTEXT_COLLAPSE` | 上下文折叠、可视化、inspect、auto/post compact。 | `/context`、`CtxInspectTool`、compact/session restore。 | 主链路完整，可优化恢复一致性。 | 23 | src/commands/context/context-noninteractive.ts:50; src/commands/context/context-noninteractive.ts:113; src/commands/context/context.tsx:20; src/components/ContextVisualization.tsx:22; src/components/TokenWarning.tsx:23; src/components/TokenWarning.tsx:97; src/components/TokenWarning.tsx:114; src/query.ts:18 |
| `COORDINATOR_MODE` | coordinator mode，多 agent/tool pool/prompt/session mode。 | slash: `/coordinator`；env `CLAUDE_CODE_COORDINATOR_MODE`；AgentTool/SendMessageTool。 | 完整实现，部分行为还受 env 双重门控。 | 34 | packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:369; packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:808; packages/builtin-tools/src/tools/AgentTool/builtInAgents.ts:35; src/QueryEngine.ts:121; src/cli/print.ts:369; src/cli/print.ts:5083; src/cli/print.ts:5132; src/cli/print.ts:5288 |
| `COWORKER_TYPE_TELEMETRY` | coworker 类型 telemetry。 | telemetry 内部。 | 外部只能降级为本地 log/sink。 | 2 | src/services/analytics/metadata.ts:603; src/services/analytics/metadata.ts:845 |
| `DAEMON` | daemon supervisor、worker registry、session manager。 | CLI: `daemon`、`--daemon-worker=<kind>`；slash: `/daemon`、`/remote-control-server` 组合路径。 | 完整实现。 | 6 | src/commands.ts:78; src/commands.ts:116; src/commands/daemon/index.ts:10; src/commands/remoteControlServer/index.ts:6; src/entrypoints/cli.tsx:124; src/entrypoints/cli.tsx:184 |
| `DIRECT_CONNECT` | direct connect server/open URL。 | CLI: `server`、`open <cc-url>`。 | 完整实现。 | 5 | src/main.tsx:705; src/main.tsx:771; src/main.tsx:3738; src/main.tsx:4742; src/main.tsx:4860 |
| `DOWNLOAD_USER_SETTINGS` | 从远端下载 settings/memory。 | `/reload-plugins` CCR 路径、headless startup；无普通 slash command。 | 需 OAuth + Claude.ai settings sync API；可自建本地同步替代。 | 5 | src/cli/print.ts:519; src/cli/print.ts:1726; src/cli/print.ts:3205; src/commands/reload-plugins/reload-plugins.ts:25; src/services/settingsSync/index.ts:160 |
| `DUMP_SYSTEM_PROMPT` | 输出 system prompt。 | CLI: `--dump-system-prompt`。 | 诊断/评测完整开关。 | 1 | src/entrypoints/cli.tsx:89 |
| `ENHANCED_TELEMETRY_BETA` | 增强 telemetry/session tracing。 | telemetry 内部。 | 外部受 analytics schema 限制。 | 2 | src/utils/telemetry/sessionTracing.ts:9; src/utils/telemetry/sessionTracing.ts:127 |
| `EXPERIMENTAL_SKILL_SEARCH` | skill discovery、turn-zero/turn-N prefetch、DiscoverSkillsTool、skill auto-load、cache clear。 | `/skills`、`DiscoverSkillsTool`、`SkillTool` remote skill path、query attachment。 | 主链路可用，搜索质量可继续优化。 | 23 | packages/builtin-tools/src/tools/SkillTool/SkillTool.ts:105; packages/builtin-tools/src/tools/SkillTool/SkillTool.ts:108; packages/builtin-tools/src/tools/SkillTool/SkillTool.ts:140; packages/builtin-tools/src/tools/SkillTool/SkillTool.ts:379; packages/builtin-tools/src/tools/SkillTool/SkillTool.ts:494; packages/builtin-tools/src/tools/SkillTool/SkillTool.ts:607; packages/builtin-tools/src/tools/SkillTool/SkillTool.ts:663; packages/builtin-tools/src/tools/SkillTool/SkillTool.ts:967 |
| `EXTRACT_MEMORIES` | 从对话中提取 memories/instincts。 | stop hooks/background housekeeping；无直接子命令。 | 完整实现，质量依赖提取策略。 | 7 | src/cli/print.ts:382; src/cli/print.ts:975; src/memdir/paths.ts:65; src/query/stopHooks.ts:42; src/query/stopHooks.ts:149; src/utils/backgroundHousekeeping.ts:7; src/utils/backgroundHousekeeping.ts:34 |
| `FILE_PERSISTENCE` | file persistence path 与 CLI output 集成。 | print/headless/file history 内部。 | 完整小型开关。 | 3 | src/cli/print.ts:2163; src/cli/print.ts:2329; src/utils/filePersistence/filePersistence.ts:280 |
| `FORK_SUBAGENT` | fork 当前会话到 subagent。 | slash: `/fork`；`branch` alias 行为；AgentTool fork path。 | 完整实现。 | 7 | packages/builtin-tools/src/tools/AgentTool/forkSubagent.ts:33; packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts:76; src/commands.ts:148; src/commands/branch/index.ts:8; src/commands/fork/fork.tsx:14; src/components/messages/UserTextMessage.tsx:128; src/components/messages/UserTextMessage.tsx:129 |
| `HARD_FAIL` | hard fail 调试/错误策略。 | logging/main 内部。 | 诊断向完整开关。 | 2 | src/main.tsx:4634; src/utils/log.ts:160 |
| `HISTORY_PICKER` | prompt input 历史搜索/选择。 | PromptInput UI；无 slash command。 | 完整实现。 | 4 | src/components/PromptInput/PromptInput.tsx:1939; src/components/PromptInput/PromptInput.tsx:1946; src/components/PromptInput/PromptInput.tsx:2447; src/hooks/useHistorySearch.ts:239 |
| `HISTORY_SNIP` | snip 旧消息/历史片段，配合 compact。 | slash: `/force-snip`；`SnipTool`。 | 完整实现。 | 17 | src/QueryEngine.ts:128; src/QueryEngine.ts:131; src/QueryEngine.ts:1328; src/commands.ts:90; src/components/Message.tsx:200; src/query.ts:122; src/query.ts:449; src/services/compact/snipCompact.ts:29 |
| `HOOK_PROMPTS` | hook prompt context 注入。 | hooks/prompt 内部。 | 小型完整开关。 | 1 | src/screens/REPL.tsx:2918 |
| `IS_LIBC_GLIBC` | Linux libc glibc 平台标记。 | build/platform 内部。 | 完整小型 gate。 | 1 | src/utils/envDynamic.ts:54 |
| `IS_LIBC_MUSL` | Linux libc musl 平台标记。 | build/platform 内部。 | 完整小型 gate。 | 1 | src/utils/envDynamic.ts:53 |
| `KAIROS` | assistant/proactive/remote assistant/channel/file/push 组合能力的核心 gate。 | slash: `/assistant`、`/brief`、`/proactive`；tools: `SleepTool`、`SendUserFileTool`、`PushNotificationTool`；CLI `assistant [sessionId]`。 | 本地链路多，官方语义依赖 Claude.ai、GrowthBook、远端 assistant/channel。 | 163 | packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:138; packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:243; packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:823; packages/builtin-tools/src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx:232; packages/builtin-tools/src/tools/BashTool/BashTool.tsx:1278; packages/builtin-tools/src/tools/BriefTool/BriefTool.ts:91; packages/builtin-tools/src/tools/BriefTool/BriefTool.ts:131; packages/builtin-tools/src/tools/ConfigTool/supportedSettings.ts:164 |
| `KAIROS_BRIEF` | Brief 模式/摘要/用户消息工具。 | slash: `/brief`; `BriefTool`; `SendUserMessage` 类 brief flow。 | 远端/服务语义受限，本地可用部分较完整。 | 39 | packages/builtin-tools/src/tools/BriefTool/BriefTool.ts:91; packages/builtin-tools/src/tools/BriefTool/BriefTool.ts:131; packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts:10; packages/builtin-tools/src/tools/ToolSearchTool/prompt.ts:89; src/commands.ts:68; src/commands/brief.ts:52; src/components/Messages.tsx:102; src/components/PromptInput/Notifications.tsx:237 |
| `KAIROS_CHANNELS` | Kairos channel / 多渠道消息。 | AskUserQuestion/channel 相关 path；无单独命令。 | 远端/channel 服务受限。 | 21 | packages/builtin-tools/src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx:232; packages/builtin-tools/src/tools/EnterPlanModeTool/EnterPlanModeTool.ts:61; packages/builtin-tools/src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts:172; src/cli/print.ts:1689; src/cli/print.ts:4836; src/cli/print.ts:4951; src/components/LogoV2/ChannelsNotice.tsx:2; src/components/LogoV2/LogoV2.tsx:55 |
| `KAIROS_GITHUB_WEBHOOKS` | GitHub webhook/PR 订阅。 | slash: `/subscribe-pr`; `SubscribePRTool`。 | 事件源/远端服务受限。 | 5 | src/bridge/webhookSanitizer.ts:4; src/commands.ts:108; src/components/messages/UserTextMessage.tsx:87; src/hooks/useReplBridge.tsx:209; src/tools.ts:56 |
| `KAIROS_PUSH_NOTIFICATION` | Push notification。 | `PushNotificationTool`；settings。 | 依赖官方推送服务，可本地/bridge 降级。 | 4 | packages/builtin-tools/src/tools/ConfigTool/supportedSettings.ts:164; src/components/Settings/Config.tsx:713; src/components/Settings/Config.tsx:728; src/tools.ts:52 |
| `LAN_PIPES` | LAN pipe / UDS pipe 扩展。 | slash: `/pipes`；attach/send/pipe 状态链路。 | 完整实现。 | 11 | packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:73; packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:598; packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:675; packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:812; src/commands/attach/attach.ts:43; src/commands/pipes/pipes.ts:174; src/hooks/usePipeIpc.ts:110; src/hooks/usePipeIpc.ts:309 |
| `LODESTONE` | Lodestone remote/protocol 相关能力。 | main/remote 内部；无直接子命令。 | 协议/远端体验受限。 | 6 | src/interactiveHelpers.tsx:214; src/main.tsx:805; src/main.tsx:4464; src/utils/backgroundHousekeeping.ts:10; src/utils/backgroundHousekeeping.ts:39; src/utils/settings/types.ts:821 |
| `MCP_RICH_OUTPUT` | MCP tool result 富展示。 | `MCPTool` UI。 | 展示层最小实现。 | 3 | packages/builtin-tools/src/tools/MCPTool/UI.tsx:58; packages/builtin-tools/src/tools/MCPTool/UI.tsx:167; packages/builtin-tools/src/tools/MCPTool/UI.tsx:189 |
| `MCP_SKILLS` | 将 MCP prompt commands 纳入 skills。 | `/mcp`、`/skills`、`SkillTool` skill index。 | 完整实现。 | 9 | src/commands.ts:609; src/services/mcp/client.ts:132; src/services/mcp/client.ts:1405; src/services/mcp/client.ts:1684; src/services/mcp/client.ts:2188; src/services/mcp/client.ts:2362; src/services/mcp/useManageMCPConnections.ts:22; src/services/mcp/useManageMCPConnections.ts:684 |
| `MEMORY_SHAPE_TELEMETRY` | memory shape telemetry。 | telemetry 内部。 | 外部 analytics 受限。 | 3 | src/memdir/findRelevantMemories.ts:66; src/utils/sessionFileAccessHooks.ts:38; src/utils/sessionFileAccessHooks.ts:213 |
| `MESSAGE_ACTIONS` | 消息级 action/keybinding。 | Message UI/keybindings。 | 完整实现。 | 5 | src/keybindings/defaultBindings.ts:88; src/keybindings/defaultBindings.ts:278; src/screens/REPL.tsx:841; src/screens/REPL.tsx:5559; src/screens/REPL.tsx:6178 |
| `MONITOR_TOOL` | 监控后台 shell/task 状态。 | slash: `/monitor`; `MonitorTool`。 | 完整实现。 | 15 | packages/builtin-tools/src/tools/AgentTool/runAgent.ts:876; packages/builtin-tools/src/tools/BashTool/BashTool.tsx:740; packages/builtin-tools/src/tools/BashTool/prompt.ts:312; packages/builtin-tools/src/tools/BashTool/prompt.ts:320; packages/builtin-tools/src/tools/PowerShellTool/PowerShellTool.tsx:501; src/commands.ts:84; src/commands/monitor.ts:25; src/components/permissions/PermissionRequest.tsx:59 |
| `NATIVE_CLIENT_ATTESTATION` | native client attestation。 | API/native stack 内部。 | 官方环境不可外部等价复刻，只能 no-op/提示降级。 | 1 | src/constants/system.ts:82 |
| `NATIVE_CLIPBOARD_IMAGE` | 原生剪贴板图片粘贴。 | PromptInput paste/image flow。 | 小型完整 gate，平台依赖。 | 2 | src/utils/imagePaste.ts:101; src/utils/imagePaste.ts:134 |
| `NEW_INIT` | 新版 init 流程。 | `/init`。 | 完整实现。 | 2 | src/commands/init.ts:231; src/commands/init.ts:247 |
| `OVERFLOW_TEST_TOOL` | overflow 测试/诊断工具。 | `OverflowTestTool`。 | 测试/诊断向最小实现。 | 2 | src/tools.ts:114; src/utils/permissions/classifierDecision.ts:32 |
| `PERFETTO_TRACING` | Perfetto trace 采集/写入。 | tracing env/internal。 | 诊断向完整实现。 | 1 | src/utils/telemetry/perfettoTracing.ts:260 |
| `PIPE_IPC` | pipe IPC transport。 | IPC/pipe 内部。 | 完整小型 gate。 | 1 | src/utils/pipeTransport.ts:599 |
| `POOR` | poor mode，低资源/约束模式。 | slash: `/poor`。 | 完整实现。 | 4 | src/commands.ts:158; src/components/Settings/Config.tsx:425; src/query/stopHooks.ts:137; src/services/SessionMemory/sessionMemory.ts:285 |
| `POWERSHELL_AUTO_MODE` | PowerShell auto/yolo 权限模式。 | `PowerShellTool` permission flow。 | 完整实现。 | 2 | src/utils/permissions/permissions.ts:573; src/utils/permissions/yoloClassifier.ts:501 |
| `PROACTIVE` | 主动模式/proactive sleep/task 行为。 | slash: `/proactive`; `SleepTool`。 | 主链路可用，需减少误触发。 | 41 | packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:138; packages/builtin-tools/src/tools/SleepTool/SleepTool.ts:72; packages/builtin-tools/src/tools/SleepTool/SleepTool.ts:106; src/cli/print.ts:373; src/cli/print.ts:547; src/cli/print.ts:1852; src/cli/print.ts:2556; src/cli/print.ts:4017 |
| `PROMPT_CACHE_BREAK_DETECTION` | prompt cache break 检测。 | API/compact/cache diagnostics。 | 完整实现。 | 9 | packages/builtin-tools/src/tools/AgentTool/runAgent.ts:851; src/commands/compact/compact.ts:68; src/services/api/claude.ts:1525; src/services/api/claude.ts:2458; src/services/compact/autoCompact.ts:302; src/services/compact/compact.ts:704; src/services/compact/compact.ts:1053; src/services/compact/microCompact.ts:362 |
| `QUICK_SEARCH` | PromptInput quick search。 | PromptInput UI。 | 完整实现。 | 5 | src/components/PromptInput/PromptInput.tsx:1914; src/components/PromptInput/PromptInput.tsx:1918; src/components/PromptInput/PromptInput.tsx:1928; src/components/PromptInput/PromptInput.tsx:2434; src/keybindings/defaultBindings.ts:52 |
| `REACTIVE_COMPACT` | API 413/prompt-too-long 后自动 compact 重试。 | compact/API 内部。 | 可用，需更多失败恢复测试。 | 6 | src/commands/compact/compact.ts:36; src/components/TokenWarning.tsx:92; src/query.ts:15; src/services/compact/autoCompact.ts:195; src/services/compact/reactiveCompact.ts:24; src/utils/analyzeContext.ts:1132 |
| `REVIEW_ARTIFACT` | artifact review tool/schema/UI。 | `ReviewArtifactTool`；permission UI；bundled review skill。 | 本地 MVP，远端 artifact 产品面不完整。 | 5 | src/components/permissions/PermissionRequest.tsx:35; src/components/permissions/PermissionRequest.tsx:41; src/components/permissions/PermissionRequest.tsx:177; src/skills/bundled/index.ts:42; src/tools.ts:141 |
| `RUN_SKILL_GENERATOR` | 运行 skill generator bundled skill。 | bundled skill command；无核心 runtime 子命令。 | 文档/skill 入口最小实现。 | 1 | src/skills/bundled/index.ts:65 |
| `SELF_HOSTED_RUNNER` | self-hosted runner register/poll/heartbeat。 | CLI: `self-hosted-runner`。 | 入口接 no-op，占位。 | 1 | src/entrypoints/cli.tsx:261 |
| `SHOT_STATS` | shot/session stats、stats cache、UI 分布统计。 | stats UI/commands 内部。 | 完整实现。 | 10 | src/components/Stats.tsx:298; src/components/Stats.tsx:942; src/utils/stats.ts:131; src/utils/stats.ts:214; src/utils/stats.ts:364; src/utils/stats.ts:610; src/utils/stats.ts:829; src/utils/statsCache.ts:172 |
| `SKILL_IMPROVEMENT` | 对已调用 skill 做后采样改进建议/用户确认式改写。 | skill improvement hook；AppState suggestion UI。 | 已并入 `SKILL_LEARNING` gate，可用但应加强质量评审。 | 1 | src/utils/hooks/skillImprovement.ts:194 |
| `SKILL_LEARNING` | observation、instinct、gap/draft/promote、skill generator。 | slash: `/skill-learning`; skill search prefetch gap learning。 | 项目侧闭环可用；长期全局 stocktake 是 Codex 侧元技能职责。 | 1 | src/services/skillLearning/featureCheck.ts:8 |
| `SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED` | auto-update 禁用时跳过检测。 | update/installer 内部。 | 完整小型 gate。 | 1 | src/components/AutoUpdaterWrapper.tsx:35 |
| `SLOW_OPERATION_LOGGING` | 慢操作日志。 | diagnostics/logging。 | 完整小型 gate。 | 1 | src/utils/slowOperations.ts:158 |
| `SSH_REMOTE` | SSH remote REPL/session。 | CLI: `ssh <host> [dir]`。 | 入口完整，session factory stub。 | 4 | src/main.tsx:732; src/main.tsx:856; src/main.tsx:3783; src/main.tsx:4829 |
| `STREAMLINED_OUTPUT` | CLI/headless 输出精简。 | print/headless output 内部。 | 完整小型 gate。 | 1 | src/cli/print.ts:865 |
| `TEAMMEM` | team memory extraction/sync/watchers/CLAUDE.md integration。 | Agent/team memory 内部；无单独 slash。 | 主链路存在，可优化 secret/dedupe/conflict。 | 53 | src/components/memory/MemoryFileSelector.tsx:27; src/components/memory/MemoryFileSelector.tsx:155; src/components/messages/CollapsedReadSearchContent.tsx:22; src/components/messages/CollapsedReadSearchContent.tsx:127; src/components/messages/CollapsedReadSearchContent.tsx:482; src/components/messages/SystemTextMessage.tsx:15; src/components/messages/SystemTextMessage.tsx:350; src/components/messages/teamMemCollapsed.tsx:8 |
| `TEMPLATES` | template jobs。 | CLI: `job <subcommand>`、兼容 `new/list/reply`; slash: `/job`。 | 完整实现。 | 9 | src/commands.ts:119; src/commands/job/index.ts:10; src/entrypoints/cli.tsx:229; src/entrypoints/cli.tsx:240; src/query.ts:69; src/query/stopHooks.ts:45; src/query/stopHooks.ts:109; src/utils/markdownConfigLoader.ts:35 |
| `TERMINAL_PANEL` | terminal panel UI 与 terminal capture。 | keybinding `meta+j`; `TerminalCaptureTool`。 | 工具返回空内容，当前是最小/空实现。 | 5 | src/components/PromptInput/PromptInputHelpMenu.tsx:39; src/hooks/useGlobalKeybindings.tsx:212; src/keybindings/defaultBindings.ts:60; src/tools.ts:122; src/utils/permissions/classifierDecision.ts:27 |
| `TOKEN_BUDGET` | token budget tracker/attachments/spinner warning。 | query/REPL UI 内部。 | 完整实现。 | 9 | src/components/PromptInput/PromptInput.tsx:626; src/components/Spinner.tsx:316; src/constants/prompts.ts:513; src/query.ts:328; src/query.ts:1377; src/screens/REPL.tsx:2501; src/screens/REPL.tsx:3504; src/screens/REPL.tsx:3592 |
| `TORCH` | 内部 debug command reserved。 | slash: `/torch` hidden。 | 只输出保留文案，占位。 | 1 | src/commands.ts:114 |
| `TRANSCRIPT_CLASSIFIER` | auto mode、transcript classifier、permission/yolo metadata。 | CLI: `auto-mode` subcommands；login/permissions/AgentTool/BashTool 相关路径。 | 主链路非 stub，可优化误判。 | 111 | packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:1306; packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:1644; packages/builtin-tools/src/tools/AgentTool/agentToolUtils.ts:405; packages/builtin-tools/src/tools/AgentTool/agentToolUtils.ts:608; packages/builtin-tools/src/tools/AgentTool/runAgent.ts:432; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1467; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1505; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1862 |
| `TREE_SITTER_BASH` | tree-sitter bash parse gate。 | Bash permissions/parser 内部。 | 完整实现。 | 3 | src/utils/bash/parser.ts:51; src/utils/bash/parser.ts:65; src/utils/bash/parser.ts:108 |
| `TREE_SITTER_BASH_SHADOW` | bash parser shadow mode。 | Bash permissions diagnostics。 | 完整实现。 | 5 | packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1683; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1690; packages/builtin-tools/src/tools/BashTool/bashPermissions.ts:1707; src/utils/bash/parser.ts:51; src/utils/bash/parser.ts:108 |
| `UDS_INBOX` | UDS inbox / peer messaging / pipe registry。 | slash: `/peers` `/who`、`/attach`、`/detach`、`/send`、`/pipes`、`/pipe-status`、`/history` `/hist`、`/claim-main`; tools: `ListPeersTool`, `SendMessageTool`。 | 完整实现。 | 41 | packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:72; packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:586; packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:641; packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:668; packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:699; packages/builtin-tools/src/tools/SendMessageTool/SendMessageTool.ts:756; packages/builtin-tools/src/tools/SendMessageTool/prompt.ts:6; packages/builtin-tools/src/tools/SendMessageTool/prompt.ts:10 |
| `ULTRAPLAN` | ultraplan planning mode。 | slash: `/ultraplan`; prompt input/permission routing。 | 完整实现。 | 10 | src/commands.ts:111; src/components/PromptInput/PromptInput.tsx:601; src/components/PromptInput/PromptInput.tsx:806; src/components/PromptInput/PromptInput.tsx:884; src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx:184; src/screens/REPL.tsx:2387; src/screens/REPL.tsx:2390; src/screens/REPL.tsx:6012 |
| `ULTRATHINK` | ultrathink keyword/thinking token behavior。 | prompt keyword gate；无 slash command。 | 简单但完整。 | 1 | src/utils/thinking.ts:21 |
| `UNATTENDED_RETRY` | API unattended retry。 | API retry internal。 | 完整小型 gate。 | 1 | src/services/api/withRetry.ts:101 |
| `UPLOAD_USER_SETTINGS` | 上传本地 settings/memory 到远端。 | startup/preAction background upload；无 slash。 | 需 OAuth + settings sync API。 | 2 | src/main.tsx:1123; src/services/settingsSync/index.ts:63 |
| `VERIFICATION_AGENT` | 内置 verification agent / plan verification。 | built-in agent、TaskUpdate/TodoWrite、`VerifyPlanExecutionTool` env path。 | 完整实现。 | 4 | packages/builtin-tools/src/tools/AgentTool/builtInAgents.ts:65; packages/builtin-tools/src/tools/TaskUpdateTool/TaskUpdateTool.ts:335; packages/builtin-tools/src/tools/TodoWriteTool/TodoWriteTool.ts:78; src/constants/prompts.ts:377 |
| `VOICE_MODE` | 语音输入 / push-to-talk / STT。 | slash: `/voice`; voice settings/keybindings/REPL integration。 | 主链路完整，需 OAuth/音频/native backend。 | 48 | packages/builtin-tools/src/tools/ConfigTool/ConfigTool.ts:113; packages/builtin-tools/src/tools/ConfigTool/ConfigTool.ts:116; packages/builtin-tools/src/tools/ConfigTool/ConfigTool.ts:233; packages/builtin-tools/src/tools/ConfigTool/ConfigTool.ts:348; packages/builtin-tools/src/tools/ConfigTool/prompt.ts:24; packages/builtin-tools/src/tools/ConfigTool/supportedSettings.ts:144; src/commands.ts:81; src/components/LogoV2/VoiceModeNotice.tsx:16 |
| `WEB_BROWSER_TOOL` | HTTP browser-lite fetch/navigate/text snapshot。 | `WebBrowserTool`; main Chrome hint。 | 不是 full browser；Panel stub。 | 2 | src/main.tsx:2017; src/tools.ts:126 |
| `WORKFLOW_SCRIPTS` | workflow scripts 与本地 workflow runner。 | slash: `/workflows`; `WorkflowTool`; generated workflow commands。 | 已支持 start/status/list/advance/cancel，状态写 `.claude/workflow-runs`；步骤动作仍由 agent 按返回提示执行。 | 10 | src/commands.ts:93; src/commands.ts:460; src/components/permissions/PermissionRequest.tsx:47; src/components/permissions/PermissionRequest.tsx:53; src/components/tasks/BackgroundTasksDialog.tsx:110; src/components/tasks/BackgroundTasksDialog.tsx:113; src/constants/tools.ts:45; src/tasks.ts:9 |

### 0.8 非 `feature()` 功能逐项说明与子命令索引

这些能力不会完整出现在 `feature()` 矩阵里，但它们同样决定“用户实际能看到什么、能用什么”。

| 非 feature 功能面 | 具体功能 | 子命令 / 工具 / 入口 | 当前边界 |
| --- | --- | --- | --- |
| Provider selection | 在 firstParty、Bedrock、Vertex、Foundry、OpenAI、Gemini、Grok 间切换 API client。 | `/provider`; env `CLAUDE_CODE_USE_OPENAI/GEMINI/GROK/BEDROCK/VERTEX/FOUNDRY`; settings `modelType`。 | 不由 `feature()` 控制；provider 越多，tool beta、prompt caching、thinking、stream adapter 差异越大。 |
| Auth/account visibility | 根据 Claude.ai subscription / Console API key / 3P provider 决定命令可见性。 | `/login`、`/logout`、`/status`; `availability: ['claude-ai']` 命令包括 `/voice`、`/usage`、`/upgrade`、`/desktop`、`/web-setup`、`/install-slack-app`。 | 订阅用户可走官方 OAuth/远端；Console/3P provider 会隐藏或降级部分命令。 |
| `USER_TYPE === 'ant'` | 内部 build 专用工具、命令、telemetry/debug UI。 | `/files`、`/tag`、internal command set、`ConfigTool`、`TungstenTool`、`REPLTool`、`SuggestBackgroundPRTool`。 | 扫描约 491 处；外部版不能靠 feature flag 开启全部内部能力。 |
| Policy limits | 企业/组织策略限制 remote sessions、remote control、feedback 等。 | `isPolicyAllowed('allow_remote_sessions')`、`allow_remote_control`、`allow_product_feedback`。 | Console API key eligible；OAuth 仅 Team/Enterprise/C4E eligible；fail-open 但 essential traffic 对部分 policy fail-closed。 |
| GrowthBook rollout | 运行时动态 gate/kill switch/参数。 | `tengu_ccr_bridge`、`tengu_kairos_assistant`、`tengu_terminal_panel`、`tengu_tool_search_unsupported_models`、`tengu_amber_quartz_disabled` 等。 | build flag 打开不代表运行时可用，尤其 KAIROS/Bridge/Voice/ToolSearch。 |
| Tool Search beta | 将 MCP/deferred tools 延迟加载为 `tool_reference`，降低 tool context 成本。 | env `ENABLE_TOOL_SEARCH`; `ToolSearchTool`; `isToolSearchEnabled()`。 | 取决于模型是否支持 `tool_reference`、provider/base URL 是否支持 beta blocks。 |
| Core tool registry | 基础工具池，不完全由 feature flag 决定。 | `AgentTool`, `BashTool`, `FileReadTool`, `FileEditTool`, `FileWriteTool`, `WebFetchTool`, `WebSearchTool`, `SkillTool`, `AskUserQuestionTool`, `EnterPlanModeTool`。 | 始终是核心功能；permission deny rules、simple mode、REPL mode、provider beta 会改变最终可见工具。 |
| Task/Todo v2 | 新 TaskCreate/TaskGet/TaskUpdate/TaskList 工具组。 | `TaskCreateTool`, `TaskGetTool`, `TaskUpdateTool`, `TaskListTool`; env/settings `isTodoV2Enabled()`。 | 不是直接 `feature()`；由 task util/env/settings 决定。 |
| LSP tool | 语言服务/符号诊断工具。 | `LSPTool`; env `ENABLE_LSP_TOOL`。 | 不是 feature flag；依赖本地语言服务和项目配置。 |
| Worktree mode | 进入/退出 worktree、tmux worktree fast path。 | `EnterWorktreeTool`, `ExitWorktreeTool`; CLI `--tmux --worktree`; worktree settings/env。 | 不是 feature flag；Windows/tmux/platform 约束明显。 |
| PowerShell tool | Windows/PowerShell shell tool。 | `PowerShellTool`; `isPowerShellToolEnabled()`。 | 不是单独 feature flag；权限流部分受 `POWERSHELL_AUTO_MODE` 影响。 |
| REPL/simple mode | bare/simple tool set，隐藏原始工具或用 REPL 包裹。 | CLI `--bare`; env `CLAUDE_CODE_SIMPLE`; `REPLTool` ant-only。 | 环境/USER_TYPE gate，不在 feature 矩阵中。 |
| Dynamic skills | 从 `.claude/skills`、`.agents/skills`、plugins、MCP prompt commands 动态加载 skill/command。 | `/skills`; `SkillTool`; skill directory commands; plugin skills; MCP skills。 | 运行时文件系统和插件状态会改变能力面。 |
| Plugins/marketplace | 插件命令、插件 skill、reload plugin。 | `/plugin`, `/reload-plugins`; plugin command/skill loader。 | 当前项目有 plugin loader；实际可用插件取决于本地目录/远端同步。 |
| MCP management | 管理 MCP servers/resources/prompts。 | `/mcp`; `ListMcpResourcesTool`; `ReadMcpResourceTool`; MCP tools。 | MCP 工具数量和 schema 运行时变化；还会影响 ToolSearch 和 skill index。 |
| Remote-safe commands | Remote Control 模式下限制可执行 slash commands。 | remote-safe: `/session`, `/exit`, `/clear`, `/help`, `/theme`, `/cost`, `/usage`, `/copy`, `/feedback`, `/plan`, `/mobile` 等；bridge-safe local commands: `/compact`, `/clear`, `/cost`, `/summary`, `/release-notes`, `/files`。 | 非 feature，但决定 mobile/web bridge 下哪些命令可用。 |
| Hidden disabled stubs | 保留内部命令名但默认不可用。 | `agents-platform`, `ant-trace`, `autofix-pr`, `backfill-sessions`, `break-cache`, `bughunter`, `ctx_viz`, `debug-tool-call`, `env`, `good-claude`, `issue`, `mock-limits`, `oauth-refresh`, `onboarding`, `perf-issue`, `reset-limits`, `share`, `teleport`。 | 多数 `isEnabled:false` / `isHidden:true`，不是 feature flag，却属于功能缺口/内部保留面。 |
| Chrome integration | Claude in Chrome MCP/native host/extension notice。 | CLI `--claude-in-chrome-mcp`, `--chrome-native-host`; `/chrome`。 | 部分外部用户需要 claude.ai subscription；不是纯 feature flag。 |
| Native/platform capability | audio, clipboard image, computer-use, color diff, url handler, modifiers 等 native package。 | voice/audio backend、computer-use MCP、clipboard paste、terminal integration。 | 平台和 native package 状态决定可用性；`modifiers-napi`、`url-handler-napi` 仍需独立看。 |
| Telemetry/diagnostics | OTEL、BigQuery exporter、session tracing、Perfetto、debug logs。 | env `CLAUDE_CODE_ENABLE_TELEMETRY`, `OTEL_*`, `ENABLE_BETA_TRACING_DETAILED`, `BETA_TRACING_ENDPOINT`。 | 多数不是用户功能；外部版可本地 sink，但不能等价内部 analytics。 |
| Privacy/traffic level | 限制非必要网络流量、essential traffic。 | env/settings `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`; policy/privacy services。 | 会影响 telemetry、cron prompt、policy fail behavior、settings sync 等。 |
| Install/update commands | 安装 GitHub/Slack app、升级、版本、native installer。 | `/install-github-app`, `/install-slack-app`, `/upgrade`, `/doctor`, `/terminal-setup`, `/version` ant-only。 | 多数由 availability/env/USER_TYPE 控制，不直接属于 feature flag。 |

#### 0.8.0 机械扫描明细说明

机械扫描明细已折叠到对应条目，不再保留大段重复附录:

| 扫描面 | 数量 | 合并位置 |
| --- | ---: | --- |
| Feature flags | 92 | `0.7 Feature Flag 逐项功能与入口说明` 的每行 `调用数` / `源码证据`。 |
| Command modules | 128 | `3.0.2 Feature-Gated Slash Commands` 与 `0.9 子命令按 Gate 汇总`。 |
| CLI entries | 20 | `3.0.3 Feature-Gated CLI Entrypoints`。 |
| Built-in tools | 69 | `0.7` 的工具入口列与 `2.2` tool registry 边界。 |
| Env gates | 589 | `2.2 非 feature() 功能边界` 按类别汇总，不逐项铺表。 |
| GrowthBook/dynamic keys | 93 | `2.2` 与 `3.0.1` 的远端/订阅/GrowthBook 边界。 |
| Availability gates | 11 | `2.2` 与 command 表。 |
| Hidden/disabled commands | 27 | `2.2` hidden stubs 与 `3.0.2`。 |
| Non-feature gate evidence | 2912 | 按 env/provider/auth/policy/tool/native/command 分类汇总。 |

完整性校验脚本结果: 92 个真实 feature、589 个 env gate、93 个 dynamic key 均无缺失。

### 0.9 子命令按 Gate 汇总

| Gate 类型 | 子命令 / CLI 入口 |
| --- | --- |
| `BRIDGE_MODE` | CLI `remote-control` / `rc` / `remote` / `sync` / `bridge`; slash `/remote-control` `/rc`; with `DAEMON` exposes `/remote-control-server`。 |
| `DAEMON` / `BG_SESSIONS` | CLI `daemon`, `--daemon-worker=<kind>`, `--bg`, `ps`, `logs`, `attach`, `kill`; slash `/daemon`。 |
| `TEMPLATES` | CLI `job`, legacy `new/list/reply`; slash `/job`。 |
| `UDS_INBOX` | slash `/peers` `/who` `/attach` `/detach` `/send` `/pipes` `/pipe-status` `/history` `/hist` `/claim-main`; tools `ListPeersTool`, `SendMessageTool`。 |
| `KAIROS` family | slash `/assistant`, `/brief`, `/proactive`, `/subscribe-pr`; CLI `assistant [sessionId]`; tools `SleepTool`, `BriefTool`, `SendUserFileTool`, `PushNotificationTool`, `SubscribePRTool`。 |
| `VOICE_MODE` | slash `/voice`。 |
| `MONITOR_TOOL` | slash `/monitor`; `MonitorTool`。 |
| `COORDINATOR_MODE` | slash `/coordinator`; coordinator tool pool/session mode。 |
| `HISTORY_SNIP` | slash `/force-snip`; `SnipTool`。 |
| `WORKFLOW_SCRIPTS` | slash `/workflows`; dynamic workflow commands; `WorkflowTool`。 |
| `CCR_REMOTE_SETUP` | slash `/web-setup`。 |
| `ULTRAPLAN` | slash `/ultraplan`。 |
| `TORCH` | hidden slash `/torch`。 |
| `FORK_SUBAGENT` | slash `/fork`; `branch` alias behavior。 |
| `BUDDY` | slash `/buddy`。 |
| `POOR` | slash `/poor`。 |
| `SKILL_LEARNING` | slash `/skill-learning`。 |
| `CHICAGO_MCP` | CLI `--computer-use-mcp`。 |
| `DUMP_SYSTEM_PROMPT` | CLI `--dump-system-prompt`。 |
| `BYOC_ENVIRONMENT_RUNNER` | CLI `environment-runner`。 |
| `SELF_HOSTED_RUNNER` | CLI `self-hosted-runner`。 |
| `SSH_REMOTE` | CLI `ssh <host> [dir]`。 |
| `DIRECT_CONNECT` | CLI `server`, `open <cc-url>`。 |
| non-feature availability | slash `/voice`, `/usage`, `/upgrade`, `/desktop`, `/web-setup`, `/install-slack-app` require `claude-ai`; `/install-github-app`, `/fast` allow `claude-ai` or `console`。 |
| non-feature provider/env | slash `/provider`; env-gated OpenAI/Gemini/Grok/Bedrock/Vertex/Foundry provider selection。 |

### 0.10 完整性核对口径

本文不再维护独立 generated 附录，也不在文末重复堆放机械扫描表。完整性口径如下:

| 校验项 | 结果 |
| --- | --- |
| 真实 feature flags | 92 / missing 0 |
| process.env runtime gates | 589 / 已按 provider、auth、telemetry、runtime、debug、platform、CI、native、tool/search 类别归纳；不逐项铺表 |
| GrowthBook/dynamic keys | 93 / 已按 Bridge、KAIROS、ToolSearch、Terminal、Telemetry、Voice、Settings Sync 等类别归纳；不逐项铺表 |
| command modules | 128 / 已归类 |
| CLI entries | 20 / 已归类 |
| built-in tools | 69 / 已归类 |
| availability gates | 11 / 已归类 |
| hidden/disabled commands | 27 / 已归类 |
| non-feature gate evidence | 2912 / 已分类汇总 |

原则: 每个 feature 的具体功能、入口、状态和源码证据只在 `0.7` 维护一份；非 `feature()` 的 env/dynamic key 不逐项展开为 600+ 行清单，而按功能边界归纳，避免重复堆表。

## 1. 总览结论

本轮扫描识别到 **92 个真实静态 feature flag**。另有 `scripts/verify-gates.ts` 内的动态模板 `${check.compileFlag}`，不计入运行时 flag。

重要限制: `feature('FLAG_NAME')` 不是本项目唯一的功能边界。还有大量能力由环境变量、`USER_TYPE === 'ant'`、`availability`、provider env、policy、GrowthBook dynamic config、MCP/plugin/skill 目录和 tool registry 控制。只看 92 个 feature flag 会漏判这些功能面。

当前项目不是“整体大量 stub”的状态。更准确的状态是：

- 主干交互、工具、bridge、daemon、job、context、skill search、skill learning 等多数能力已经形成可运行链路。
- 明确占位/不可用的 feature 很少，但都很关键：`SSH_REMOTE`、`BYOC_ENVIRONMENT_RUNNER`、`SELF_HOSTED_RUNNER`、`BASH_CLASSIFIER`、`TORCH`。
- 若追求 Anthropic 内部同等能力，有些 feature 无法只靠当前代码完整复刻，因为依赖远端服务、内部 classifier、native attestation 或未公开 API。
- 可通过现有文件、参数、调用链逆向补全的 feature 很明确，优先级高于重新设计。

## 2. 分类口径

| 分类 | 含义 |
| --- | --- |
| 占位 | 入口存在，但核心实现是 no-op、恒 false、直接抛 unsupported，或只显示占位文案。 |
| 最小实现 | 有可运行行为，但只覆盖最窄语义，和 flag 名称暗示的完整能力不一致。 |
| 完整实现 | 当前代码已能支撑该 feature 的主要产品语义。 |
| 可优化 | 已可用，但需要硬化、覆盖边界、降低误判、提高性能或完善文档。 |
| 外部受限 | 代码可接线，但完整复刻依赖 Anthropic/Claude.ai/GitHub/remote service/native 平台能力。 |
| 可逆向补全 | 现有接口、参数、调用链足够明确，可从下游调用反推上游实现。 |

这些分类不是互斥标签。例如 `BASH_CLASSIFIER` 同时是“占位”和“可逆向补全”，但不能完整复刻内部 classifier。

## 2.1 证据等级

为了避免把“静态标签扫描”误当成完整理解，本文按证据等级标注结论强度。

| 等级 | 含义 | 示例 |
| --- | --- | --- |
| A | 已读入口、核心实现、UI/命令或测试，调用链闭合。 | `SKILL_LEARNING`、`BG_SESSIONS`、`TEMPLATES`、`BRIDGE_MODE` |
| B | 已读入口和核心实现，缺少真实远端或交互验证。 | `WEB_BROWSER_TOOL`、`REVIEW_ARTIFACT`、`AGENT_MEMORY_SNAPSHOT` |
| C | 静态调用链明确，但远端服务或内部模型决定最终能力。 | `KAIROS*`、`settingsSync`、`policyLimits` |
| D | 只确认入口和占位实现，未进入真实业务链。 | `BYOC_ENVIRONMENT_RUNNER`、`SELF_HOSTED_RUNNER`、`TORCH` |

本文仍不是“运行每个 feature 的全量验收报告”。它是面向恢复规划的源码级审计，结论以读到的调用链、实现文件、命令入口和已有测试为依据。

## 2.2 非 `feature()` 功能边界

这些能力不完全受 `feature('...')` 控制，但会显著影响“项目有哪些功能、哪些可用、哪些受限”。

| 边界类型 | 代表入口 | 作用 | 证据/影响 |
| --- | --- | --- | --- |
| 环境变量 gate | `CLAUDE_CODE_USE_OPENAI`、`CLAUDE_CODE_USE_GEMINI`、`CLAUDE_CODE_USE_GROK`、`CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_VERTEX`、`CLAUDE_CODE_USE_FOUNDRY` | 多 provider API 兼容层。 | 不是 feature flag；由 provider env 决定。`src/commands/provider.ts` 会设置/清理这些 env。 |
| 认证/订阅 gate | `availability: ['claude-ai']`、`availability: ['console']`、`isClaudeAISubscriber()` | 控制 `/voice`、`/usage`、`/upgrade`、`/desktop`、`/web-setup` 等命令。 | 即使没有 `feature()`，也会因订阅/API key 类型不同而显示/隐藏。 |
| `USER_TYPE === 'ant'` | `/files`、`/tag`、internal commands、额外 telemetry/debug UI | 内部用户专用能力。 | 扫描到约 499 个 `USER_TYPE` 相关位置；这些不是 feature flag。 |
| policy gate | `isPolicyAllowed('allow_remote_sessions')`、`allow_remote_control`、`allow_product_feedback` | 企业策略控制 remote sessions、remote control、feedback。 | 不属于 feature flag；远端 policy 和缓存决定结果。 |
| GrowthBook dynamic config | `getFeatureValue_CACHED_MAY_BE_STALE('tengu_*')` | 远端 rollout/kill switch/参数。 | 扫描到大量 `tengu_*` gates；很多功能是否可用由这些远端配置决定。 |
| tool registry | `src/tools.ts`、`packages/builtin-tools/src/tools/*` | 决定模型可调用工具。 | 一些工具无 feature flag，但仍是核心功能，如 FileRead/FileEdit/Bash/WebFetch/WebSearch/SkillTool。 |
| plugin / skill dirs | `src/skills/loadSkillsDir.ts`、plugin loader、MCP skill builders | 动态技能和插件能力。 | 运行时文件系统内容会改变可用功能，不一定体现在源码 flag 中。 |
| hidden command stubs | `reset-limits`、internal commands 等 | 有入口但隐藏或 disabled。 | 部分命令没有 feature flag，但仍是占位/内部保留能力。 |
| native package capability | `modifiers-napi`、`url-handler-napi`、computer-use packages | 平台能力依赖 OS/backend。 | 功能可用性取决于平台和 native 实现，不只取决于 feature flag。 |

因此，后续完整审计应分两层:

1. Feature flag 层: 当前 92 个 `feature('...')`。
2. 非 feature 功能面层: env/provider/auth/policy/plugin/tool/native/USER_TYPE。

本文后续矩阵仍以 feature flag 为主，但结论会明确标出这些非 feature 边界。

## 3. 关键分组

### 3.0 实现路径视角

这张表回答“怎么实现”的问题，而不是只回答“现在有没有代码”。

| 实现路径 | Feature | 结论 |
| --- | --- | --- |
| 可自建替代 | `SSH_REMOTE` | 可基于现有 `main.tsx` SSH 入口、`SSHSession` 接口和 `SSHSessionManager` 反推实现；不依赖 Anthropic 远端。 |
| 可自建替代 | `BASH_CLASSIFIER` | 内部 classifier 不可见，但可用本地规则、bash AST、PowerShell/Bash 安全测试样例实现保守替代。 |
| 可自建替代 | `WEB_BROWSER_TOOL` | browser-lite 已有；可自建 full runtime，路线是 Bun WebView/Chrome MCP/Playwright 类 backend + Panel。 |
| 可自建替代 | `REVIEW_ARTIFACT` | 远端 schema 不稳定，但本地 artifact review renderer、line annotation UI、tool result surface 可自建。 |
| 可自建替代 | `BYOC_ENVIRONMENT_RUNNER` / `SELF_HOSTED_RUNNER` | 真实远端协议不可见，但可用 bridge/job/remote-control-server 的 work-dispatch 代码自建 skeleton。 |
| 可自建替代 | `TERMINAL_PANEL` / `MCP_RICH_OUTPUT` | 主要是 UI/展示层，可从现有 Tool/Panel/permission/result 调用链补。 |
| 订阅/远端可实现 | `BRIDGE_MODE` | 代码注释明确 Remote Control 需要 claude.ai subscription 和 full-scope OAuth；self-hosted bridge 可绕过官方订阅 gate。 |
| 订阅/远端可实现 | `CCR_REMOTE_SETUP` | `web-setup` command 声明 `availability: ['claude-ai']`，且依赖 GitHub token 上传到 Claude web。 |
| 订阅/远端可实现 | `KAIROS` / `KAIROS_BRIEF` / `KAIROS_CHANNELS` | 本地 UI/tool/prompt 链路存在，但 assistant/web/channel 语义依赖 Claude.ai OAuth、GrowthBook 和远端会话/频道能力。 |
| 订阅/远端可实现 | `KAIROS_GITHUB_WEBHOOKS` / `KAIROS_PUSH_NOTIFICATION` | 本地有 webhook sanitizer、SubscribePRTool、PushNotificationTool；事件源/推送服务依赖远端。 |
| 订阅/远端可实现 | `DOWNLOAD_USER_SETTINGS` / `UPLOAD_USER_SETTINGS` | settings sync 依赖 OAuth 和 `/api/claude_code/user_settings` 远端接口；可做本地 import/export fallback。 |
| 订阅/远端可实现 | `policyLimits` 相关 remote restrictions | Console API key 用户可 eligible；OAuth 仅 Team/Enterprise/C4E 订阅用户 eligible。 |
| 只能降级 | `NATIVE_CLIENT_ATTESTATION` | 依赖官方 native HTTP stack 替换 `cch=00000` attestation token，外部版无法等价复刻。 |
| 只能降级 | telemetry-only flags | `COWORKER_TYPE_TELEMETRY`、`MEMORY_SHAPE_TELEMETRY`、`ENHANCED_TELEMETRY_BETA` 依赖内部 analytics schema；外部版只能本地 log/sink。 |

订阅/远端类不是“无法使用”。更准确的判断是：

- 有 claude.ai 订阅、full-scope OAuth、对应 GrowthBook gate、组织 policy 允许时，可以实现官方远端路径。
- 没有这些条件时，可以自建替代的只有本地 runner、self-hosted bridge、本地 UI 或本地同步；不能假装拥有官方远端能力。

### 3.0.1 订阅/授权调用链证据

| 能力 | 调用链证据 | 结论 |
| --- | --- | --- |
| Remote Control | `src/bridge/bridgeEnabled.ts` 注释说明 Remote Control requires claude.ai subscription；`getBridgeDisabledReason()` 会检查 `isClaudeAISubscriber()`、profile scope、organization UUID、GrowthBook gate。 | 订阅用户可通过官方远端实现；self-hosted bridge 可绕过订阅 gate。 |
| Web setup | `src/commands/remote-setup/index.ts` 使用 `availability: ['claude-ai']`，并检查 `allow_remote_sessions` policy。 | Claude.ai 用户路径，不是 Console/API-key 通用路径。 |
| Policy limits | `src/services/policyLimits/index.ts` 注释说明 Console API key 用户 eligible；OAuth 只有 Team/Enterprise eligible。 | 企业/团队策略能力依赖服务端 policy endpoint。 |
| Settings sync | `src/services/settingsSync/index.ts` 要求 firstParty OAuth 和 `CLAUDE_AI_INFERENCE_SCOPE`，调用 `/api/claude_code/user_settings`。 | OAuth/Claude.ai 服务路径；可自建文件同步替代。 |
| KAIROS assistant | `src/assistant/gate.ts` 需要 `feature('KAIROS')` 和 `tengu_kairos_assistant` GrowthBook gate。 | 本地链路不等于官方 assistant 能力，远端 gate 决定可用性。 |
| Claude in Chrome | `src/hooks/useChromeExtensionNotification.tsx` 明确外部用户需要 claude.ai subscription。 | 订阅 + Chrome extension 路径；非订阅可用普通 WebFetch/WebBrowser 替代。 |

## 3.0.2 Feature-Gated Slash Commands

这些是用户在 REPL 中通过 `/command` 直接感知到的 feature-gated 命令。来源主要是 `src/commands.ts` 和各 command `index.ts`。

| Slash command | Feature gate | 作用 | 当前状态 | 证据 | 命令模块证据 |
| --- | --- | --- | --- | --- | --- |
| `/proactive` | `PROACTIVE` 或 `KAIROS` | 启用/关闭主动工作模式。 | 可用，可优化策略。 | `src/commands.ts:64`, `src/commands.ts:368` | src/commands/proactive.ts:17 |
| `/brief` | `KAIROS` 或 `KAIROS_BRIEF` | Kairos/Brief 摘要相关命令。 | 远端受限。 | `src/commands.ts:68`, `src/commands.ts:370` | src/commands/brief.ts:49 |
| `/assistant` | `KAIROS` | 打开/接入 Kairos assistant panel。 | 远端受限。 | `src/commands.ts:71`, `src/commands/assistant/index.ts:6-9` | src/commands/assistant/index.ts:6 |
| `/remote-control` `/rc` | `BRIDGE_MODE` | 将本地终端连接到 remote-control session。 | 可用；官方路径需订阅/OAuth，self-hosted 可替代。 | `src/commands.ts:74`, `src/commands/bridge/index.ts:14-20` | src/commands/bridge/index.ts:14 |
| `/remote-control-server` `/rcs` | `DAEMON` + `BRIDGE_MODE` | 管理/启动自托管 remote control server。 | 可用。 | `src/commands.ts:77-79`, `src/commands/remoteControlServer/index.ts:5-20` | src/commands/remoteControlServer/index.ts:14 |
| `/voice` | `VOICE_MODE` | 开关 voice mode。 | 可用，可优化 native/audio 后端。 | `src/commands.ts:81`, `src/commands/voice/index.ts:9-13` | src/commands/voice/index.ts:9 |
| `/monitor` | `MONITOR_TOOL` | 查看/控制后台 shell/task 监控。 | 可用。 | `src/commands.ts:84`, `src/commands.ts:368` | src/commands/monitor.ts:22 |
| `/coordinator` | `COORDINATOR_MODE` | 开关/管理 coordinator mode。 | 可用。 | `src/commands.ts:87`, `src/commands.ts:369` | src/commands/coordinator.ts:18 |
| `/force-snip` | `HISTORY_SNIP` | 强制 history snip。 | 可用。 | `src/commands.ts:90`, `src/commands.ts:399` | src/commands/force-snip.ts:52 |
| `/workflows` | `WORKFLOW_SCRIPTS` | 列出 workflow scripts；`WorkflowTool` 负责 start/status/list/advance/cancel。 | 可用；本地 runner 和 `.claude/workflow-runs` 持久化已实现。 | `src/commands.ts:93`, `src/commands/workflows/index.ts:22-23` | src/commands/workflows/index.ts:22 |
| `/web-setup` | `CCR_REMOTE_SETUP` | 设置 Claude Code on web / GitHub 连接。 | 订阅/远端受限。 | `src/commands.ts:98`, `src/commands/remote-setup/index.ts:7-14` | src/commands/remote-setup/index.ts:7 |
| `/subscribe-pr` | `KAIROS_GITHUB_WEBHOOKS` | 订阅 PR webhook/远端事件。 | 订阅/远端受限。 | `src/commands.ts:108` | src/commands/subscribe-pr.ts:165 |
| `/ultraplan` | `ULTRAPLAN` | 进入/触发 ultraplan 规划增强。 | 可用。 | `src/commands.ts:111`, `src/commands.ts:395` | src/commands/ultraplan.tsx:532 |
| `/torch` | `TORCH` | 内部 debug 占位命令。 | 占位。 | `src/commands.ts:114`, `src/commands/torch.ts:4-18` | src/commands/torch.ts:14 |
| `/daemon` | `DAEMON` 或 `BG_SESSIONS` | 管理后台会话与 daemon。 | 可用。 | `src/commands.ts:115-119`, `src/commands/daemon/index.ts:6-11` | src/commands/daemon/index.ts:6 |
| `/job` | `TEMPLATES` | 管理 template jobs。 | 可用。 | `src/commands.ts:119`, `src/commands/job/index.ts:6-10` | src/commands/job/index.ts:6 |
| `/peers` `/who` | `UDS_INBOX` | 列出 connected peers。 | 可用。 | `src/commands.ts:122`, `src/commands/peers/index.ts:5-7` | src/commands/peers/index.ts:5 |
| `/attach` | `UDS_INBOX` | 附加到 sub CLI。 | 可用。 | `src/commands.ts:127`, `src/commands/attach/index.ts:5-6` | src/commands/attach/index.ts:5 |
| `/detach` | `UDS_INBOX` | 从 sub CLI 断开。 | 可用。 | `src/commands.ts:130`, `src/commands/detach/index.ts:5-6` | src/commands/detach/index.ts:5 |
| `/send` | `UDS_INBOX` | 向 connected sub CLI 发消息。 | 可用。 | `src/commands.ts:133`, `src/commands/send/index.ts:5-6` | src/commands/send/index.ts:5 |
| `/pipes` | `UDS_INBOX` | 查看 pipe registry / pipe selector。 | 可用。 | `src/commands.ts:136`, `src/commands/pipes/index.ts:5-6` | src/commands/pipes/index.ts:5 |
| `/pipe-status` | `UDS_INBOX` | 显示 pipe connection 状态。 | 可用。 | `src/commands.ts:139`, `src/commands/pipe-status/index.ts:5-6` | src/commands/pipe-status/index.ts:5 |
| `/history` `/hist` | `UDS_INBOX` | 查看 connected sub CLI 的 session history。 | 可用。 | `src/commands.ts:142`, `src/commands/history/index.ts:5-7` | src/commands/history/index.ts:5 |
| `/claim-main` | `UDS_INBOX` | 声明/接管 main session。 | 可用。 | `src/commands.ts:145`, `src/commands/claim-main/index.ts:5-6` | src/commands/claim-main/index.ts:5 |
| `/fork` | `FORK_SUBAGENT` | 将当前会话 fork 到新 sub-agent。 | 可用。 | `src/commands.ts:148`, `src/commands/fork/index.ts:5-6` | src/commands/fork/index.ts:5 |
| `/buddy` | `BUDDY` | 管理 coding companion。 | 可优化。 | `src/commands.ts:153`, `src/commands/buddy/index.ts:6-10` | src/commands/buddy/index.ts:6 |
| `/poor` | `POOR` | poor mode 设置。 | 可用。 | `src/commands.ts:158`, `src/commands/poor/index.ts:5-6` | src/commands/poor/index.ts:5 |
| `/skill-learning` | `SKILL_LEARNING` via `isSkillLearningEnabled()` | 管理 learned instincts / generated skills。 | 已实现。 | `src/commands.ts:183`, `src/commands.ts:400-401`, `src/commands/skill-learning/index.ts:6-11` | src/commands/skill-learning/index.ts:6 |

非 feature-gated 但与审计高度相关的命令：

| Slash command | 作用 | 备注 |
| --- | --- | --- |
| `/summary` | 生成并展示 session summary。 | 当前已是显式可用命令，不再是隐藏 stub。 | src/commands/summary/index.ts:71 |
| `/skills` | 列出可用 skills。 | 与 `EXPERIMENTAL_SKILL_SEARCH` / `SKILL_LEARNING` 配合使用。 | src/commands/skills/index.ts:5 |
| `/context` | 展示 context usage。 | 与 `CONTEXT_COLLAPSE` 相关，但基础命令存在。 | src/commands/context/index.ts:5 |
| `/mcp` | 管理 MCP servers。 | `MCP_SKILLS` 会影响 MCP prompt-as-skill 行为。 | src/commands/mcp/index.ts:5 |
| `/provider` | 切换 OpenAI/Gemini/Grok/Bedrock/Vertex/Foundry 等 provider env。 | 这是 env-gated 能力，不由 `feature('...')` 控制。 | src/commands/provider.ts:165 |
| `/login` `/logout` `/status` | 认证状态和账户信息。 | 影响订阅/远端能力，但不是 feature flag。 | src/commands/login/index.ts:8; src/commands/logout/index.ts:6; src/commands/status/index.ts:5 |
| `/plugin` `/reload-plugins` | 插件和 marketplace 管理。 | 动态改变可用 commands/tools/skills。 | src/commands/plugin/index.tsx:5; src/commands/reload-plugins/index.ts:9 |
| `/memory` | 编辑 Claude memory files。 | 影响系统上下文，不依赖 feature flag。 | src/commands/memory/index.ts:5 |
| `/permissions` | 管理 allow/deny tool permission rules。 | 影响 Bash/Skill/MCP 等工具执行。 | src/commands/permissions/index.ts:5 |
| `/install-github-app` | 安装 Claude GitHub Actions。 | `availability: ['claude-ai','console']`，不是 feature flag。 | src/commands/install-github-app/index.ts:6 |

命令审计注意点:

- `src/commands.ts` 条件导入决定一些命令是否进入 command list；各 command 自身可能没有 `feature()`。
- `isEnabled()` / `isHidden` / `availability` / `USER_TYPE` 也能隐藏命令。
- 所以“有哪些功能”不能只从 `feature()` 得出，必须同时读 `commands.ts`、command index、provider/auth/policy gates。

## 3.0.3 Feature-Gated CLI Entrypoints

这些不是 slash command，而是进程启动时的 CLI 子命令或 fast path。

| CLI input | Feature gate | 作用 | 当前状态 | 证据 | CLI源码证据 |
| --- | --- | --- | --- | --- | --- |
| `--dump-system-prompt` | `DUMP_SYSTEM_PROMPT` | 输出渲染后的 system prompt。 | 可用。 | `src/entrypoints/cli.tsx:89` | src/entrypoints/cli.tsx |
| `--computer-use-mcp` | `CHICAGO_MCP` | 启动 computer-use MCP server。 | 可用，可硬化 native backend。 | `src/entrypoints/cli.tsx:112` | src/entrypoints/cli.tsx |
| `--daemon-worker` | `DAEMON` | daemon supervisor 启动 worker fast path。 | 可用。 | `src/entrypoints/cli.tsx:124` | src/entrypoints/cli.tsx |
| `remote-control` / `rc` / `remote` / `sync` / `bridge` | `BRIDGE_MODE` | 启动 remote control bridge。 | 可用；订阅/OAuth/远端 gate 或 self-hosted。 | `src/entrypoints/cli.tsx:136-177` | src/entrypoints/cli.tsx |
| `daemon` | `DAEMON` 或 `BG_SESSIONS` | 统一 daemon/session 管理入口。 | 可用。 | `src/entrypoints/cli.tsx:184` | src/entrypoints/cli.tsx |
| `--bg` / `--background` | `BG_SESSIONS` | 启动后台会话。 | 可用。 | `src/entrypoints/cli.tsx:198` | src/entrypoints/cli.tsx |
| `ps` / `logs` / `attach` / `kill` | `BG_SESSIONS` | 旧兼容入口，映射到 daemon 子命令。 | 可用，deprecated。 | `src/entrypoints/cli.tsx:211` | src/entrypoints/cli.tsx |
| `job` | `TEMPLATES` | template jobs CLI 入口。 | 可用。 | `src/entrypoints/cli.tsx:229` | src/entrypoints/cli.tsx |
| `new` / `list` / `reply` | `TEMPLATES` | 旧兼容入口，映射到 job。 | 可用，deprecated。 | `src/entrypoints/cli.tsx:240` | src/entrypoints/cli.tsx |
| `environment-runner` | `BYOC_ENVIRONMENT_RUNNER` | BYOC headless runner。 | 占位/no-op。 | `src/entrypoints/cli.tsx:251`, `src/environment-runner/main.ts` | src/entrypoints/cli.tsx |
| `self-hosted-runner` | `SELF_HOSTED_RUNNER` | self-hosted runner register/poll/heartbeat 目标。 | 占位/no-op。 | `src/entrypoints/cli.tsx:261`, `src/self-hosted-runner/main.ts` | src/entrypoints/cli.tsx |
| `ssh <host> [dir]` | `SSH_REMOTE` | 远程 SSH REPL session。 | 占位，session factory stub。 | `src/main.tsx:4829-4831`, `src/ssh/createSSHSession.ts` | src/main.tsx |
| `server` / `open <cc-url>` | `DIRECT_CONNECT` | direct connect server/open URL。 | 可用。 | `src/main.tsx:4742`, `src/main.tsx:4860` | src/main.tsx |
| `assistant [sessionId]` | `KAIROS` | attach REPL 到 running bridge session。 | 远端受限。 | `src/main.tsx:5197-5201` | src/main.tsx |
| `auto-mode` 子命令 | `TRANSCRIPT_CLASSIFIER` | inspect auto mode classifier 配置。 | 可用，可优化策略。 | `src/main.tsx:5140-5165` | src/main.tsx |
| `/autonomy` panel + `autonomy status [--deep]` / `runs` / `flows` / `flow ...` | non-feature slash/CLI | inspect local autonomy runs/flows/deep health surfaces and manage flow detail/cancel/resume。 | 可用；无参数 `/autonomy` 是 local-jsx 独立面板，基础子项覆盖 deep status 全部主要 section；命令面板参数、usage、CLI 子命令描述集中在 `autonomyCommandSpec`；CLI `flow resume` 会打印可执行 prompt。 | `src/commands/autonomy.ts`, `src/commands/autonomyPanel.tsx`, `src/main.tsx:5162`, `src/cli/handlers/autonomy.ts`, `src/utils/autonomyCommandSpec.ts` | src/main.tsx |

## 3.0.4 功能族调用链完整性判断

这一节按“功能族”总结，而不是按单个 flag 切碎。

| 功能族 | 相关 flags | 调用链完整性 | 用户可见入口 | 主要缺口 |
| --- | --- | --- | --- | --- |
| Skill 生态 | `EXPERIMENTAL_SKILL_SEARCH`, `SKILL_LEARNING`, `SKILL_IMPROVEMENT`, `MCP_SKILLS`, `RUN_SKILL_GENERATOR` | 高。搜索、自动加载、gap/draft、自动 evolve、用户确认式改写已形成项目侧闭环。 | `/skills`, `/skill-learning`, `SkillTool`, `DiscoverSkillsTool` | remote skill market lifecycle、quality scoring、真实 session id。 |
| 远程控制/Bridge | `BRIDGE_MODE`, `CCR_*`, `KAIROS*` | 高。Remote Control/CCR 调用链完整，本地 bridge/RCS 链路强；官方路径依赖订阅/OAuth/GrowthBook/policy。 | `/remote-control`, `/remote-control-server`, CLI `remote-control`, `/session` | 主要是订阅路径、自托管路径、policy/token 错误提示分流和长连接压测。 |
| 终端通讯/Pipes | `UDS_INBOX`, `LAN_PIPES`, `PIPE_IPC` | 高。UDS/named pipe、LAN TCP、registry、attach/detach/send/history、SendMessageTool 地址路由均已接线。 | `/pipes`, `/pipe-status`, `/attach`, `/detach`, `/send`, `/history`, `SendMessageTool` | 跨机器 TCP 安全确认、LAN 发现稳定性、真实多终端 smoke。 |
| 后台/Daemon/Jobs | `DAEMON`, `BG_SESSIONS`, `TEMPLATES` | 高。daemon/bg/job 命令、state、tests 已在。 | `/daemon`, `/job`, CLI `daemon`, `job`, `--bg` | 跨平台长期稳定性与恢复测试。 |
| 权限/分类 | `BASH_CLASSIFIER`, `TRANSCRIPT_CLASSIFIER`, `POWERSHELL_AUTO_MODE`, `TREE_SITTER_BASH*` | 中。Transcript/PowerShell/tree-sitter 链在；Bash classifier 核心空。 | permission UI、auto mode、Bash/PowerShell tool | `BASH_CLASSIFIER` 需要自建本地替代。 |
| 浏览/外部信息 | `WEB_BROWSER_TOOL`, WebFetch/WebSearch 相关无 flag 部分 | 中。WebFetch/WebSearch 可用；WebBrowser 是 lite。 | `WebBrowserTool`, `WebFetchTool`, `WebSearchTool` | full browser runtime / panel / JS/click/type/scroll。 |
| Context/Compact | `CONTEXT_COLLAPSE`, `REACTIVE_COMPACT`, `CACHED_MICROCOMPACT`, `HISTORY_SNIP`, `TOKEN_BUDGET` | 高。主链路存在。 | `/context`, `/compact`, Token UI | 复杂边界、模型兼容、恢复一致性。 |
| Voice/Native | `VOICE_MODE`, `CHICAGO_MCP`, `NATIVE_CLIPBOARD_IMAGE`, `NATIVE_CLIENT_ATTESTATION` | 中。UI 和入口多，native 后端差异大。 | `/voice`, `--computer-use-mcp`, paste image | attestation 只能降级；computer-use 后端需平台硬化。 |
| Telemetry/Sync/Policy | `UPLOAD_USER_SETTINGS`, `DOWNLOAD_USER_SETTINGS`, telemetry flags, policy limits | 中。客户端链路在，远端决定效果。 | `/status`, settings sync background | 远端服务和 analytics schema 受限。 |

### 3.1 明确占位

| Feature | 证据 | 当前影响 | 建议 |
| --- | --- | --- | --- |
| `SSH_REMOTE` | `src/main.tsx` 已注册 `ssh <host> [dir]`；`src/ssh/createSSHSession.ts` 仍抛 `SSH sessions are not supported in this build`。 | 打开 flag 后用户可见但不可用。 | 先实现 `createLocalSSHSession()`，再补真实 ssh/proxy/remote cwd。 |
| `BYOC_ENVIRONMENT_RUNNER` | `src/entrypoints/cli.tsx` 有 fast path；`src/environment-runner/main.ts` 只 `Promise.resolve()`。 | 命令会静默成功但不做事。 | 先补参数校验和失败输出，再补 register/poll loop。 |
| `SELF_HOSTED_RUNNER` | `src/entrypoints/cli.tsx` 有 fast path；`src/self-hosted-runner/main.ts` 只 `Promise.resolve()`。 | 与 BYOC 类似，runner 不执行。 | 从 remote worker service 注释和 bridge/job 代码反推最小协议。 |
| `BASH_CLASSIFIER` | 49 个外围调用点；`src/utils/permissions/bashClassifier.ts` 恒 disabled。 | Bash 自动审批和语义权限不可用。 | 先实现本地规则 classifier；内部模型同等能力不可复刻。 |
| `TORCH` | `src/commands/torch.ts` 输出 `No implementation is available in this build`。 | 隐藏内部 debug 命令，不影响用户主流程。 | 保留占位或删除入口；不建议优先恢复。 |

### 3.2 最小实现 / 薄壳

| Feature | 现状 | 缺口 | 是否可逆向补全 |
| --- | --- | --- | --- |
| `WEB_BROWSER_TOOL` | HTTP fetch + HTML 文本抽取；dev 默认启用。 | 无 JS、无 click/type/scroll、`WebBrowserPanel` 为 `null`。 | 可以。可从 WebFetch/WebSearch/Chrome MCP/REPL panel 反推 browser-lite 或 full browser。 |
| `REVIEW_ARTIFACT` | Tool schema、permission UI、result message 有壳。 | `call()` 只回传 annotation count；build/dev 默认注释掉，备注 API 请求无响应。 | 可以补 UI/本地 artifact surface；API 同等能力受限。 |
| `AGENT_MEMORY_SNAPSHOT` | snapshot 检查、初始化、pending update 已有。 | 只覆盖 custom agent + user memory 场景。 | 可以。已有 `agentMemorySnapshot.ts` 和 `SnapshotUpdateDialog` 调用链。 |
| `BUILDING_CLAUDE_APPS` | 注册 `claude-api` bundled skill。 | 实际是文档型 skill，不是 runtime feature。 | 不需要补 runtime。 |
| `RUN_SKILL_GENERATOR` | 注册 run-skill-generator skill。 | 入口薄，需看 skill 内容决定用途。 | 可从 bundled skill 内容继续完善。 |
| `CCR_REMOTE_SETUP` | 注册 remote setup command。 | 依赖 Claude web/GitHub token upload 服务。 | 本地流程可测；远端服务不可替代。 |
| `MCP_RICH_OUTPUT` | MCP UI 富输出开关。 | 更偏展示层，需继续做兼容矩阵。 | 可以从 MCPTool UI 数据结构补。 |
| `TERMINAL_PANEL` | TerminalCaptureTool/panel 类能力。 | 终端 UI 能力尚需交互验证。 | 可以从 Tool/Panel/permission 调用链补。 |

### 3.3 完整实现

这些 feature 当前已经有主链路，可按现有产品语义使用。仍可能需要测试/文档硬化，但不是最小实现。

| Feature | 完整性说明 |
| --- | --- |
| `BRIDGE_MODE` | bridge main、session、auth、policy、remote control server、自托管 RCS 均有实现。 |
| `AGENT_TRIGGERS_REMOTE` | RemoteTriggerTool 完整覆盖 list/get/create/update/run，OAuth/org/policy headers 和本地 audit record 已接线；官方远端触发语义是订阅运行条件，不是本地占位。 |
| `CCR_AUTO_CONNECT` / `CCR_MIRROR` | Remote Control/CCR 自动连接和 mirror/outbound-only 入口、gate、runtime metadata 已接线。 |
| `DAEMON` | daemon supervisor、state、commands、tests 已有。 |
| `BG_SESSIONS` | bg engine、daemon 子命令、summary、ps/logs/attach/kill 兼容路径均已有。 |
| `TEMPLATES` | job command、state、templates、classifier、tests 已有。 |
| `WORKFLOW_SCRIPTS` | WorkflowTool 已升级为本地 runner，支持 start/status/list/advance/cancel 和 `.claude/workflow-runs` 持久化；按当前“agent 执行步骤、runner 管状态”的语义已可用。 |
| `EXPERIMENTAL_SKILL_SEARCH` | 本地 TF-IDF、turn-zero/turn-N prefetch、auto-load、gap learning、DiscoverSkillsTool、cache clear、compact 保留均已接线。 |
| `SKILL_LEARNING` | 已补齐 `SEARCH -> AUTO-LOAD -> GAP/DRAFT -> LEARN -> EVOLVE -> SEARCH` 项目侧闭环。 |
| `SKILL_IMPROVEMENT` | 已并入 skill-learning gate，可对已加载/调用 skill 做用户确认式增量改写。 |
| `CONTEXT_COLLAPSE` | ContextVisualization、CtxInspectTool、auto/post compact、session restore 形成链路。 |
| `REACTIVE_COMPACT` | 413 prompt-too-long reactive compact 路径存在。 |
| `CACHED_MICROCOMPACT` | cache_edits state、threshold、delete refs、API path 已有。 |
| `VOICE_MODE` | UI、settings、STT、keybindings、REPL integration 已接线。 |
| `CHICAGO_MCP` | computer-use MCP 快速路径、cleanup、config、wrapper 已有。 |
| `MONITOR_TOOL` | shell/background task monitoring tools 与 UI 已接线。 |
| `FORK_SUBAGENT` | fork command、AgentTool fork path、ToolSearch prompt 集成已接线。 |
| `UDS_INBOX` | SendMessage/ListPeers/pipe IPC/REPL hooks 已接线。 |
| `LAN_PIPES` | pipe IPC/LAN 相关 hook 和命令已接线。 |
| `PIPE_IPC` | UDS/named pipe transport、NDJSON framing、registry 状态和 `/autonomy status --deep` 汇总已接线。 |
| `COORDINATOR_MODE` | tool pool、system prompt、commands、session restore、AgentTool 支持存在。 |
| `PROACTIVE` | proactive command/state/useProactive/SleepTool 集成存在。 |
| `AGENT_TRIGGERS` | scheduled tasks / cron tools / loop skill 链路存在。 |
| `ULTRAPLAN` | command、prompt input、permission UI、processUserInput 路由存在。 |
| `ULTRATHINK` | thinking keyword gate 实现简单但完整。 |
| `TRANSCRIPT_CLASSIFIER` | auto mode、permission/yolo/classifier metadata 相关路径大量接线；不是 BASH_CLASSIFIER 的 stub。 |
| `TEAMMEM` | team memory extraction/sync/watchers/CLAUDE.md integration 已接线。 |
| `MCP_SKILLS` | MCP commands -> skills 过滤和 SkillTool 支持存在。 |
| `CONNECTOR_TEXT` | API logging/message rendering/signature stripping支持存在。 |
| `COMMIT_ATTRIBUTION` | attribution hooks、trailers、session restore/worktree 集成存在。 |
| `DIRECT_CONNECT` | server/open/direct connect command path 存在。 |
| `EXTRACT_MEMORIES` | background housekeeping、stopHooks、memdir paths 集成存在。 |
| `HISTORY_SNIP` | SnipTool、snipCompact、messages/attachments 集成存在。 |
| `TOKEN_BUDGET` | query budget tracker、spinner、attachments、prompt warnings存在。 |
| `SHOT_STATS` | stats/statsCache/Stats UI 分布统计存在。 |
| `PROMPT_CACHE_BREAK_DETECTION` | api/compact/cache break detection paths存在。 |
| `TREE_SITTER_BASH` | bash parser gate存在。 |
| `TREE_SITTER_BASH_SHADOW` | shadow parse path存在。 |
| `VERIFICATION_AGENT` | built-in agents、TaskUpdate/TodoWrite、prompts 集成存在。 |
| `BUILTIN_EXPLORE_PLAN_AGENTS` | builtInAgents gate存在。 |
| `POOR` | poor mode command/settings/session memory gate存在。 |
| `POWERSHELL_AUTO_MODE` | PowerShell yolo/permission gate存在。 |
| `FILE_PERSISTENCE` | filePersistence path和CLI print集成存在。 |

### 3.4 可优化但非缺口

| Feature | 可优化点 |
| --- | --- |
| `EXPERIMENTAL_SKILL_SEARCH` | 当前本地搜索是 TF-IDF；可加 embedding/LLM rerank、来源评分、远程市场 lifecycle。 |
| `SKILL_LEARNING` | 可接真实 session id、来源安全策略、自动生成 skill 的质量评审和去重。 |
| `SKILL_IMPROVEMENT` | 可减少 side-channel LLM 失败影响；支持非文件型 skill 的安全 patch 建议。 |
| `CACHED_MICROCOMPACT` | 需要更多模型兼容、cache deletion 回退、debug evidence。 |
| `CONTEXT_COLLAPSE` | 可加强 collapse 命中率、可视化、session restore consistency。 |
| `BRIDGE_MODE` | 需要长连接、断线恢复、web/mobile 兼容矩阵持续压测。 |
| `DAEMON` / `BG_SESSIONS` | 可继续补 Windows/macOS/Linux 后台行为差异测试。 |
| `TEMPLATES` | 可补模板 schema、job reply、跨会话恢复更多测试。 |
| `WORKFLOW_SCRIPTS` | 可继续补 YAML schema、失败原因、重试策略和真实 agent 执行步骤的端到端 smoke。 |
| `VOICE_MODE` | 可加强 native audio backend、权限、fallback 文案。 |
| `CHICAGO_MCP` | 可继续补 Linux/Windows computer-use backend 完整度。 |
| `TEAMMEM` | 可优化 memory dedupe、secret guard、同步冲突处理。 |
| `TRANSCRIPT_CLASSIFIER` | 可减少误拒/误批；补更多 transcript fixtures。 |
| `KAIROS` 系列 | 可按远程服务 availability 做更明确降级和错误提示。 |

### 3.5 明确无法在外部版完整复刻的能力

这些不是“代码写不出来”，而是无法仅凭当前仓库达到内部生产同等语义。

| Feature | 受限原因 | 可做的替代 |
| --- | --- | --- |
| `BASH_CLASSIFIER` | Anthropic 内部 classifier/策略模型不可见。 | 可实现本地规则/AST/deny-ask-allow classifier。 |
| `REVIEW_ARTIFACT` | build/dev 注释已指出 API schema 请求无响应，缺稳定远端契约。 | 可做本地 artifact review UI/tool result surface。 |
| `BYOC_ENVIRONMENT_RUNNER` | 需要 BYOC worker service 协议、认证和控制面。 | 可从注释/bridge/job 反推最小 register/poll loop。 |
| `SELF_HOSTED_RUNNER` | 需要 SelfHostedRunnerWorkerService 真实协议。 | 可补参数校验、heartbeat/poll skeleton 和可诊断失败。 |
| `NATIVE_CLIENT_ATTESTATION` | 依赖官方 native client attestation 环境。 | 外部版只能保留 gate/提示或实现 no-op fallback。 |
| `KAIROS_GITHUB_WEBHOOKS` | 依赖 Claude.ai/GitHub webhook 远端服务。 | 本地可保留 sanitizer/subscription UI，但不能替代远端事件源。 |
| `KAIROS_PUSH_NOTIFICATION` | 依赖官方 push notification service。 | 可保留本地/bridge 通知 fallback。 |
| `CCR_AUTO_CONNECT` / `CCR_MIRROR` | 官方路径依赖 Claude Code Remote/CCR 远端状态机。 | 当前本地调用链完整；后续是订阅路径、self-hosted bridge/RCS fallback 和错误状态分流。 |
| `DOWNLOAD_USER_SETTINGS` / `UPLOAD_USER_SETTINGS` | 依赖设置同步服务。 | 可做本地文件 import/export fallback。 |
| `COWORKER_TYPE_TELEMETRY` / `MEMORY_SHAPE_TELEMETRY` / `ENHANCED_TELEMETRY_BETA` | 内部 analytics schema 和数据面不可见。 | 可保留本地 sink 或 debug logs。 |

## 4. 可从现有代码逆向补全的重点

### 4.1 `SSH_REMOTE`

可反推依据：

- `src/main.tsx` 已定义 CLI 入口、pending SSH 参数、REPL handoff。
- `src/ssh/createSSHSession.ts` 已定义 `SSHSession`、`SSHAuthProxy`、`createManager()`、`getStderrTail()` 接口。
- `src/ssh/SSHSessionManager.ts` 定义后续 session manager 契约。

反推路线：

1. 从 `main.tsx` 调用参数确定 `createSSHSession(host, cwd, options)` 期望。
2. 实现 `createLocalSSHSession()` 用本地 subprocess 模拟，先让 REPL 跑通。
3. 实现真实 `ssh` subprocess，建立 auth proxy 和 stderr ring buffer。
4. 写 CLI flag-on/off 和 factory failure tests。

### 4.2 `BASH_CLASSIFIER`

可反推依据：

- `src/utils/permissions/bashClassifier.ts` 类型完整。
- `src/utils/permissions/yoloClassifier.ts`、`permissions.ts`、`classifierApprovals.ts`、`BashPermissionRequest.tsx` 已定义消费方式。
- Bash/PowerShell 安全测试中已有 destructive pattern 和 semantics 样例。

反推路线：

1. 实现 `extractPromptDescription()` 和 prompt rule parsing。
2. 从 deny/ask/allow rule content 生成 description lists。
3. 用 bash parser/tree-sitter 或 conservative regex 分类。
4. 返回 high/medium/low confidence 和 reason。
5. 保持内部 classifier 不可见时的本地替代语义。

### 4.3 `WEB_BROWSER_TOOL`

可反推依据：

- Tool schema、prompt、fetch implementation 已有。
- `src/main.tsx` 已按 `Bun.WebView` 能力调整 Chrome hint。
- `WebBrowserPanel.ts` 是唯一明确 UI 空洞。
- WebFetch/WebSearch/Chrome MCP 有 URL、fetch、search、browser 控制相关实现。

反推路线：

1. 决定产品语义：browser-lite 还是 full browser。
2. browser-lite: 改名/文案/Panel 文本快照，去掉视觉 screenshot 暗示。
3. full browser: 引入 session state、panel、navigate/click/type/scroll、JS runtime。
4. 与 Claude-in-Chrome MCP 明确边界。

### 4.4 `REVIEW_ARTIFACT`

可反推依据：

- `ReviewArtifactTool` schema 已定义 artifact/title/annotations/summary。
- Permission UI 已展示 annotation count/summary。
- Tool result mapping 已存在。

反推路线：

1. 先不依赖远端 API，做本地 artifact review renderer。
2. 增加 line annotation rendering 和 transcript display。
3. 保留 API schema 作为未来远端兼容层。

### 4.5 `BYOC_ENVIRONMENT_RUNNER` / `SELF_HOSTED_RUNNER`

可反推依据：

- entrypoint 注释写明 BYOC/headless runner 和 self-hosted register + poll + heartbeat。
- bridge、daemon、job、remote-control-server 中已有 session polling、state、work dispatch、heartbeat 相关模式。

反推路线：

1. 先实现参数校验和明确错误，禁止 no-op 成功。
2. 用 remote-control-server 的 work-dispatch/store 模式实现本地可测 runner skeleton。
3. 把真实远端协议留作 adapter。

### 4.6 `SKILL_LEARNING` / `SKILL_IMPROVEMENT`

当前已补齐基础闭环，但仍可继续反推：

- `skillSearch/prefetch.ts` 是输入时发现和自动加载入口。
- `skillLearning/skillGapStore.ts` 是 gap/draft/promote 入口。
- `runtimeObserver.ts` 是采样后观察、instinct、自动 evolve 入口。
- `skillImprovement.ts` 是用户确认式增量改写入口。

下一步可以从这些调用链继续反推：

1. 真实 session id。
2. remote skill market discovery。
3. generated skill quality scoring。
4. superseded skill archive/delete policy 的端到端验证。

## 5. 当前优先级建议

### 如果目标是外部版可用性

1. `SSH_REMOTE`
2. `BASH_CLASSIFIER`
3. `WEB_BROWSER_TOOL`
4. `BYOC_ENVIRONMENT_RUNNER`
5. `SELF_HOSTED_RUNNER`

### 如果目标是减少半成品感

1. `WEB_BROWSER_TOOL`
2. `REVIEW_ARTIFACT`
3. `TORCH`
4. `TERMINAL_PANEL`
5. 隐藏命令 stub 和嵌套生成型 type stub 专项

### 如果目标是继续强化 skill 生态

1. remote skill discovery/load lifecycle
2. generated skill quality scoring
3. superseded skill archive/delete E2E
4. real session id 写入 observation/gap
5. 自动加载内容预算和来源策略

## 6. 测试策略

每个待恢复 feature 至少补四类测试：

1. flag off: 入口不可见或无副作用。
2. flag on: 入口可见且核心行为不是 no-op。
3. dependency missing: 缺外部依赖时给明确错误。
4. failure path: 网络/权限/配置错误不静默成功。

可逆向补全项还应补调用链测试：

- 上游入口能调用到下游核心实现。
- 下游核心返回值能被 UI / message / tool result 正确消费。
- stub 替换后不改变 flag-off 行为。

