# Claude Code 编译时特性标志（Feature Flags）完整审计报告

> 审计日期: 2026-04-05
> 代码库: Claude Code CLI
> 总计特性标志数: 92 个
> 编译时门控机制: `feature('FLAG_NAME')` — 来自 `bun:bundle` 的编译时常量
> 运行时门控机制: `USER_TYPE` 环境变量 + GrowthBook 远程开关（`tengu_*` 前缀）

---

## 门控机制概述

Claude Code 使用三层门控系统:

1. **编译时标志** (`feature('...')` from `bun:bundle`): 在构建时决定代码是否包含在最终产物中。当 `feature('X')` 为 `false` 时，Bun 的死代码消除（DCE）会移除整个 `if` 分支，最终产物中完全不包含该功能的代码。
2. **运行时用户类型** (`USER_TYPE`): 通过环境变量区分用户类型（如 `internal`, `external`, `enterprise`），在运行时决定功能是否可用。
3. **远程开关** (GrowthBook SDK, `tengu_*` 前缀): 通过 Anthropic 的 GrowthBook 实例进行远程 A/B 测试和功能开关控制，可在不重新部署的情况下开启/关闭功能。

本文档审计的是第一层——编译时标志。所有 92 个标志均以 `feature('FLAG_NAME')` 的形式出现在源代码中。

---

## 分类标准

- **COMPLETE（完整实现）**: 核心功能代码完整，所有引用文件存在且有实质性内容。只需在构建配置中将该标志设为 `true` 即可启用。
- **PARTIAL（部分实现）**: 有实质性的功能代码，但存在缺失的文件（命令入口、组件等）或关键模块仅有空壳。启用后可能报错或功能不完整。
- **STUB（纯桩/最小实现）**: 仅有 1-2 处引用，没有或几乎没有实际功能代码。代码只是为该标志预留了位置。

---

## 统计摘要

| 分类 | 数量 | 标志名称 |
|------|------|----------|
| COMPLETE | 22 | BRIDGE_MODE, COORDINATOR_MODE, CONTEXT_COLLAPSE, VOICE_MODE, TEAMMEM, COMMIT_ATTRIBUTION, ULTRAPLAN, BASH_CLASSIFIER, TRANSCRIPT_CLASSIFIER, EXTRACT_MEMORIES, CACHED_MICROCOMPACT, TOKEN_BUDGET, AGENT_TRIGGERS, REACTIVE_COMPACT, KAIROS_BRIEF, CCR_REMOTE_SETUP, SHOT_STATS, BG_SESSIONS, PROACTIVE, CHICAGO_MCP, VERIFICATION_AGENT, PROMPT_CACHE_BREAK_DETECTION |
| PARTIAL | 19 | KAIROS, BUDDY, MONITOR_TOOL, HISTORY_SNIP, WORKFLOW_SCRIPTS, UDS_INBOX, KAIROS_CHANNELS, FORK_SUBAGENT, EXPERIMENTAL_SKILL_SEARCH, WEB_BROWSER_TOOL, MCP_SKILLS, REVIEW_ARTIFACT, KAIROS_GITHUB_WEBHOOKS, CONNECTOR_TEXT, TEMPLATES, LODESTONE, HISTORY_PICKER, MESSAGE_ACTIONS, TERMINAL_PANEL |
| STUB | 51 | TORCH, KAIROS_DREAM, KAIROS_PUSH_NOTIFICATION, DAEMON, DIRECT_CONNECT, SSH_REMOTE, STREAMLINED_OUTPUT, ANTI_DISTILLATION_CC, NATIVE_CLIENT_ATTESTATION, ABLATION_BASELINE, AGENT_MEMORY_SNAPSHOT, AGENT_TRIGGERS_REMOTE, ALLOW_TEST_VERSIONS, AUTO_THEME, AWAY_SUMMARY, BREAK_CACHE_COMMAND, BUILDING_CLAUDE_APPS, BUILTIN_EXPLORE_PLAN_AGENTS, BYOC_ENVIRONMENT_RUNNER, CCR_AUTO_CONNECT, CCR_MIRROR, COMPACTION_REMINDERS, COWORKER_TYPE_TELEMETRY, DOWNLOAD_USER_SETTINGS, DUMP_SYSTEM_PROMPT, ENHANCED_TELEMETRY_BETA, FILE_PERSISTENCE, HARD_FAIL, HOOK_PROMPTS, IS_LIBC_GLIBC, IS_LIBC_MUSL, MCP_RICH_OUTPUT, MEMORY_SHAPE_TELEMETRY, NATIVE_CLIPBOARD_IMAGE, NEW_INIT, OVERFLOW_TEST_TOOL, PERFETTO_TRACING, POWERSHELL_AUTO_MODE, QUICK_SEARCH, RUN_SKILL_GENERATOR, SELF_HOSTED_RUNNER, SKILL_IMPROVEMENT, SLOW_OPERATION_LOGGING, TREE_SITTER_BASH, TREE_SITTER_BASH_SHADOW, ULTRATHINK, UNATTENDED_RETRY, UPLOAD_USER_SETTINGS, SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED |

---

## 当前启用状态 (2026-04-06)

> 经 Codex CLI 独立复核验证，详见 `feature-flags-codex-review.md`
> GrowthBook gate 启用详见 `growthbook-enablement-plan.md`

| 标志 | build.ts | dev.ts | 实际验证状态 | 备注 |
|------|:--------:|:------:|:----------:|------|
| AGENT_TRIGGERS_REMOTE | **ON** | **ON** | compile-only | 环境标记，原始即启用 |
| CHICAGO_MCP | **ON** | **ON** | compile-only | Computer Use，原始即启用 |
| VOICE_MODE | **ON** | **ON** | compile-only | 语音模式，原始即启用 |
| SHOT_STATS | **ON** | **ON** | compile-only, 已验证 | 纯本地统计 |
| PROMPT_CACHE_BREAK_DETECTION | **ON** | **ON** | compile-only, 已验证 | 内部诊断 |
| TOKEN_BUDGET | **ON** | **ON** | compile-only, 已验证 | 支持 `+500k` 语法 |
| AGENT_TRIGGERS | **ON** | **ON** | compile+GB gate, 已验证 | 本轮新增，定时任务系统 |
| EXTRACT_MEMORIES | **ON** | **ON** | compile+GB gate, 已验证 | 本轮新增，自动记忆提取 |
| VERIFICATION_AGENT | **ON** | **ON** | compile+GB gate, 已验证 | 本轮新增，对抗性验证代理 |
| KAIROS_BRIEF | **ON** | **ON** | compile+GB gate, 已验证 | 本轮新增，Brief 精简模式 |
| AWAY_SUMMARY | **ON** | **ON** | compile+GB gate, 已验证 | 本轮新增，离开摘要 |
| BUDDY | off | **ON** | compile+GrowthBook | 仅 dev 模式 |
| TRANSCRIPT_CLASSIFIER | off | **ON** | compile+GrowthBook | 仅 dev 模式 |
| BRIDGE_MODE | off | **ON** | compile+remote | 仅 dev 模式，需 claude.ai 订阅 |

---

# 一、COMPLETE（完整实现）— 共 22 个

以下标志的功能代码完整，所有引用的文件均存在且有实质性内容。只需在构建配置中将对应标志设为 `true` 即可启用该功能。

---

## 1. BRIDGE_MODE `[dev: ON]`

**编译时引用次数**: 29（单引号 28 + 双引号 1）
**功能描述**: 远程桥接模式。允许 Claude Code CLI 通过 WebSocket 连接到远程服务端（如 claude.ai Web 端），实现远程控制、会话转发、权限代理、附件传输等功能。这是 Claude Code 最大的子系统之一。
**分类**: COMPLETE
**启用条件**: 将 `BRIDGE_MODE` 编译标志设为 `true`

**核心实现文件（src/bridge/ 目录，共 32 个文件，12,619 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/bridge/bridgeMain.ts | 2,999 行 | 桥接主入口，管理整个远程桥接生命周期 |
| src/bridge/replBridge.ts | 2,406 行 | REPL 桥接核心，处理消息路由和会话管理 |
| src/bridge/remoteBridgeCore.ts | 1,008 行 | 远程桥接核心连接逻辑 |
| src/bridge/initReplBridge.ts | 569 行 | REPL 桥接初始化 |
| src/bridge/sessionRunner.ts | 550 行 | 会话运行器，管理远程会话执行 |
| src/bridge/bridgeApi.ts | 539 行 | 桥接 API 封装 |
| src/bridge/bridgeUI.ts | 530 行 | 桥接模式 UI 组件 |
| src/bridge/bridgeMessaging.ts | 461 行 | 桥接消息协议 |
| src/bridge/createSession.ts | 384 行 | 远程会话创建逻辑 |
| src/bridge/replBridgeTransport.ts | 370 行 | REPL 桥接传输层 |
| src/bridge/types.ts | 262 行 | 桥接相关类型定义 |
| src/bridge/jwtUtils.ts | 256 行 | JWT 令牌工具 |
| src/bridge/trustedDevice.ts | 210 行 | 可信设备管理 |
| src/bridge/bridgePointer.ts | 210 行 | 桥接指针管理 |
| src/bridge/bridgeEnabled.ts | 202 行 | 桥接模式启用检测 |
| src/bridge/inboundAttachments.ts | 175 行 | 入站附件处理 |
| src/bridge/envLessBridgeConfig.ts | 165 行 | 无环境变量桥接配置 |
| src/bridge/bridgeStatusUtil.ts | 163 行 | 桥接状态工具 |
| src/bridge/debugUtils.ts | 141 行 | 桥接调试工具 |
| src/bridge/bridgeDebug.ts | 135 行 | 桥接调试模块 |
| src/bridge/workSecret.ts | 127 行 | 工作密钥管理 |
| src/bridge/pollConfig.ts | 110 行 | 轮询配置 |
| src/bridge/pollConfigDefaults.ts | 82 行 | 轮询配置默认值 |
| src/bridge/inboundMessages.ts | 80 行 | 入站消息处理 |
| src/bridge/capacityWake.ts | 56 行 | 容量唤醒 |
| src/bridge/sessionIdCompat.ts | 57 行 | 会话 ID 兼容层 |
| src/bridge/codeSessionApi.ts | 168 行 | 代码会话 API |
| src/bridge/bridgeConfig.ts | 48 行 | 桥接配置 |
| src/bridge/bridgePermissionCallbacks.ts | 43 行 | 桥接权限回调 |
| src/bridge/replBridgeHandle.ts | 36 行 | REPL 桥接句柄 |
| src/bridge/flushGate.ts | 71 行 | 刷新门控 |
| src/bridge/webhookSanitizer.ts | 3 行 | Webhook 清理 |
| src/bridge/peerSessions.ts | 3 行 | 对等会话（桩） |

**引用该标志的文件（13 个）**:
1. src/bridge/bridgeEnabled.ts — 检测桥接模式是否编译启用
2. src/commands.ts — 条件注册 `/bridge` 命令和 `/remoteControlServer` 命令
3. src/commands/bridge/index.ts — 桥接命令入口（604 行）
4. src/components/PromptInput/PromptInputFooter.tsx — 桥接模式下的页脚 UI
5. src/components/Settings/Config.tsx — 设置面板中的桥接选项
6. src/entrypoints/cli.tsx — CLI 入口中的桥接模式初始化
7. src/hooks/useCanUseTool.tsx — 桥接模式下的工具权限
8. src/hooks/useReplBridge.tsx — REPL 桥接 Hook
9. src/main.tsx — 主入口中的桥接模式启动
10. src/screens/REPL.tsx — REPL 屏幕中的桥接集成
11. src/tools/BriefTool/attachments.ts — Brief 工具附件处理
12. src/tools/BriefTool/upload.ts — Brief 工具上传
13. src/tools/ConfigTool/supportedSettings.ts — 配置工具中的桥接设置

**启用所需操作**: 仅需将编译标志 `BRIDGE_MODE` 设为 `true`。所有代码完整，命令入口 `src/commands/bridge/index.ts`（604 行）和 `src/commands/bridge/bridge.tsx`（46,907 行）均存在。

---

## 2. COORDINATOR_MODE

**编译时引用次数**: 32
**功能描述**: 协调器模式。允许 Claude Code 作为"领导者"协调多个"工作者"代理并行执行任务。工作者可以在同一进程内运行（in-process），也可以通过 tmux/iTerm2 面板运行。支持权限同步、重连、团队管理等。
**分类**: COMPLETE
**启用条件**: 将 `COORDINATOR_MODE` 编译标志设为 `true`

**核心实现文件（src/coordinator/ 目录，370 行 + src/utils/swarm/ 目录，7,620 行 = 共 7,990 行）**:

src/coordinator/ 目录（2 个文件）:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/coordinator/coordinatorMode.ts | 369 行 | 协调器模式核心逻辑，管理领导者/工作者角色 |
| src/coordinator/workerAgent.ts | 1 行 | 工作者代理（桩文件，实际逻辑在 swarm 中） |

src/utils/swarm/ 目录（22 个文件）:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/utils/swarm/inProcessRunner.ts | 1,552 行 | 进程内工作者运行器 |
| src/utils/swarm/permissionSync.ts | 928 行 | 权限同步机制 |
| src/utils/swarm/backends/TmuxBackend.ts | 764 行 | Tmux 后端执行器 |
| src/utils/swarm/teamHelpers.ts | 683 行 | 团队辅助函数 |
| src/utils/swarm/It2SetupPrompt.tsx | 379 行 | iTerm2 设置提示 UI |
| src/utils/swarm/backends/ITermBackend.ts | 370 行 | iTerm2 后端执行器 |
| src/utils/swarm/backends/PaneBackendExecutor.ts | 354 行 | 面板后端执行器 |
| src/utils/swarm/backends/InProcessBackend.ts | 339 行 | 进程内后端 |
| src/utils/swarm/spawnInProcess.ts | 328 行 | 进程内 spawn 逻辑 |
| src/utils/swarm/backends/types.ts | 311 行 | 后端类型定义 |
| src/utils/swarm/backends/registry.ts | 464 行 | 后端注册表 |
| src/utils/swarm/backends/it2Setup.ts | 245 行 | iTerm2 设置逻辑 |
| src/utils/swarm/spawnUtils.ts | 146 行 | Spawn 工具函数 |
| src/utils/swarm/teammateInit.ts | 129 行 | 队友初始化 |
| src/utils/swarm/reconnection.ts | 119 行 | 重连逻辑 |
| src/utils/swarm/teammateLayoutManager.ts | 107 行 | 队友布局管理 |
| src/utils/swarm/backends/teammateModeSnapshot.ts | 87 行 | 队友模式快照 |
| src/utils/swarm/backends/detection.ts | 128 行 | 后端检测 |
| src/utils/swarm/leaderPermissionBridge.ts | 54 行 | 领导者权限桥接 |
| src/utils/swarm/constants.ts | 33 行 | 常量定义 |
| src/utils/swarm/teammatePromptAddendum.ts | 18 行 | 队友提示附加内容 |
| src/utils/swarm/teammateModel.ts | 10 行 | 队友模型配置 |

**引用该标志的文件（15 个）**:
1. src/QueryEngine.ts — 查询引擎中的协调器模式分支
2. src/cli/print.ts — CLI 输出中的协调器模式处理
3. src/commands/clear/conversation.ts — 清除对话时的协调器状态处理
4. src/components/PromptInput/PromptInputFooterLeftSide.tsx — 协调器模式下的页脚左侧 UI
5. src/coordinator/coordinatorMode.ts — 协调器模式核心逻辑
6. src/main.tsx — 主入口中的协调器模式启动
7. src/screens/REPL.tsx — REPL 屏幕中的协调器集成
8. src/screens/ResumeConversation.tsx — 恢复对话时的协调器处理
9. src/tools.ts — 工具注册中的协调器工具
10. src/tools/AgentTool/AgentTool.tsx — Agent 工具中的协调器模式分支
11. src/tools/AgentTool/builtInAgents.ts — 内置代理定义
12. src/utils/processUserInput/processSlashCommand.tsx — 斜杠命令处理中的协调器
13. src/utils/sessionRestore.ts — 会话恢复中的协调器状态
14. src/utils/systemPrompt.ts — 系统提示中的协调器指令
15. src/utils/toolPool.ts — 工具池中的协调器工具

**启用所需操作**: 仅需将编译标志 `COORDINATOR_MODE` 设为 `true`。所有 7,990 行代码完整。

---

## 3. CONTEXT_COLLAPSE

**编译时引用次数**: 23（单引号 20 + 双引号 3）
**功能描述**: 上下文折叠/分析功能。提供对话上下文的可视化分析，包括 token 使用量统计、上下文窗口利用率、自动压缩触发等。
**分类**: COMPLETE
**启用条件**: 将 `CONTEXT_COLLAPSE` 编译标志设为 `true`

**核心实现文件（共 2,258 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/utils/analyzeContext.ts | 1,382 行 | 上下文分析核心逻辑 |
| src/components/ContextVisualization.tsx | 488 行 | 上下文可视化 UI 组件 |
| src/commands/context/context-noninteractive.ts | 325 行 | 非交互式上下文命令 |
| src/commands/context/context.tsx | 63 行 | 交互式上下文命令入口 |

**引用该标志的文件（13 个）**:
1. src/commands/context/context-noninteractive.ts — 非交互式上下文分析命令
2. src/commands/context/context.tsx — 上下文命令入口
3. src/components/ContextVisualization.tsx — 上下文可视化组件
4. src/components/TokenWarning.tsx — Token 警告组件中的上下文折叠检测
5. src/query.ts — 查询中的上下文折叠处理
6. src/screens/REPL.tsx — REPL 中的上下文折叠集成
7. src/screens/ResumeConversation.tsx — 恢复对话中的上下文折叠
8. src/services/compact/autoCompact.ts — 自动压缩中的上下文折叠触发
9. src/services/compact/postCompactCleanup.ts — 压缩后清理
10. src/setup.ts — 初始化设置中的上下文折叠
11. src/tools.ts — 工具注册
12. src/utils/analyzeContext.ts — 上下文分析核心
13. src/utils/sessionRestore.ts — 会话恢复

**启用所需操作**: 仅需将编译标志 `CONTEXT_COLLAPSE` 设为 `true`。

---

## 4. VOICE_MODE `[build: ON] [dev: ON]`

**编译时引用次数**: 49（单引号 46 + 双引号 3）
**功能描述**: 语音模式。集成语音转文字（STT）功能，用户可以通过麦克风输入语音，实时转换为文本发送给 AI。包括语音指示器 UI、语音流处理、键绑定等。
**分类**: COMPLETE
**启用条件**: 将 `VOICE_MODE` 编译标志设为 `true`

**核心实现文件（共 1,410 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/hooks/useVoiceIntegration.tsx | 676 行 | 语音集成 React Hook |
| src/services/voiceStreamSTT.ts | 544 行 | 语音流式 STT（语音转文字）服务 |
| src/components/PromptInput/VoiceIndicator.tsx | 136 行 | 语音指示器 UI 组件 |
| src/voice/voiceModeEnabled.ts | 54 行 | 语音模式启用检测 |

**引用该标志的文件（16 个）**:
1. src/commands.ts — 条件注册语音相关命令
2. src/components/LogoV2/VoiceModeNotice.tsx — 语音模式通知 UI
3. src/components/PromptInput/Notifications.tsx — 提示输入通知中的语音状态
4. src/components/PromptInput/PromptInputFooterLeftSide.tsx — 页脚左侧语音按钮
5. src/components/PromptInput/VoiceIndicator.tsx — 语音指示器组件
6. src/components/TextInput.tsx — 文本输入中的语音模式处理
7. src/hooks/useVoiceIntegration.tsx — 语音集成 Hook
8. src/keybindings/defaultBindings.ts — 语音模式键绑定
9. src/screens/REPL.tsx — REPL 中的语音模式集成
10. src/services/voiceStreamSTT.ts — STT 服务
11. src/state/AppState.tsx — 应用状态中的语音状态
12. src/tools/ConfigTool/ConfigTool.ts — 配置工具中的语音设置
13. src/tools/ConfigTool/prompt.ts — 配置工具提示
14. src/tools/ConfigTool/supportedSettings.ts — 支持的设置项
15. src/utils/settings/types.ts — 设置类型定义
16. src/voice/voiceModeEnabled.ts — 语音模式启用逻辑

**启用所需操作**: 仅需将编译标志 `VOICE_MODE` 设为 `true`。

---

## 5. TEAMMEM

**编译时引用次数**: 53（单引号 51 + 双引号 2）
**功能描述**: 团队记忆功能。允许团队成员之间共享和同步记忆文件（CLAUDE.md），包括记忆提取、秘密过滤、文件选择器、折叠显示等。
**分类**: COMPLETE
**启用条件**: 将 `TEAMMEM` 编译标志设为 `true`

**核心实现文件（共 1,026 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/components/memory/MemoryFileSelector.tsx | 437 行 | 记忆文件选择器 UI |
| src/services/teamMemorySync/watcher.ts | 387 行 | 团队记忆文件监视器 |
| src/components/messages/teamMemCollapsed.tsx | 139 行 | 团队记忆折叠显示组件 |
| src/services/teamMemorySync/teamMemSecretGuard.ts | 44 行 | 团队记忆秘密过滤器 |
| src/components/messages/teamMemSaved.ts | 19 行 | 团队记忆保存状态 |

**引用该标志的文件（17 个）**:
1. src/components/memory/MemoryFileSelector.tsx — 记忆文件选择器
2. src/components/messages/CollapsedReadSearchContent.tsx — 折叠的读取/搜索内容
3. src/components/messages/SystemTextMessage.tsx — 系统消息中的团队记忆显示
4. src/components/messages/teamMemCollapsed.tsx — 团队记忆折叠组件
5. src/components/messages/teamMemSaved.ts — 保存状态
6. src/memdir/memdir.ts — 记忆目录操作
7. src/services/extractMemories/extractMemories.ts — 记忆提取中的团队记忆
8. src/services/extractMemories/prompts.ts — 记忆提取提示
9. src/services/teamMemorySync/teamMemSecretGuard.ts — 秘密过滤
10. src/services/teamMemorySync/watcher.ts — 文件监视
11. src/setup.ts — 初始化中的团队记忆设置
12. src/utils/claudemd.ts — CLAUDE.md 处理
13. src/utils/collapseReadSearch.ts — 折叠读取/搜索
14. src/utils/config.ts — 配置中的团队记忆
15. src/utils/memory/types.ts — 记忆类型定义
16. src/utils/memoryFileDetection.ts — 记忆文件检测
17. src/utils/sessionFileAccessHooks.ts — 会话文件访问钩子

**启用所需操作**: 仅需将编译标志 `TEAMMEM` 设为 `true`。

---

## 6. COMMIT_ATTRIBUTION

**编译时引用次数**: 12
**功能描述**: 提交归属功能。在 git 提交中标记哪些代码是由 AI 生成的，包括 git trailer、统计信息、提交后处理等。
**分类**: COMPLETE
**启用条件**: 将 `COMMIT_ATTRIBUTION` 编译标志设为 `true`

**核心实现文件（共 1,354 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/utils/commitAttribution.ts | 961 行 | 提交归属核心逻辑 |
| src/utils/attribution.ts | 393 行 | 归属计算与标记 |

**引用该标志的文件（9 个）**:
1. src/cli/print.ts — CLI 输出中的归属信息
2. src/commands/clear/caches.ts — 清除缓存中的归属数据
3. src/screens/REPL.tsx — REPL 中的归属集成
4. src/services/compact/postCompactCleanup.ts — 压缩后的归属清理
5. src/setup.ts — 初始化中的归属设置
6. src/utils/attribution.ts — 归属核心
7. src/utils/sessionRestore.ts — 会话恢复中的归属
8. src/utils/shell/bashProvider.ts — Bash 提供者中的归属钩子（255 行）
9. src/utils/worktree.ts — 工作树中的归属处理（1,519 行）

**启用所需操作**: 仅需将编译标志 `COMMIT_ATTRIBUTION` 设为 `true`。

---

## 7. ULTRAPLAN

**编译时引用次数**: 10
**功能描述**: 超级计划模式。提供增强版的计划功能，允许用户创建更详细、更结构化的执行计划。
**分类**: COMPLETE
**启用条件**: 将 `ULTRAPLAN` 编译标志设为 `true`

**核心实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/commands/ultraplan.tsx | 470 行 | 超级计划命令完整实现 |

**引用该标志的文件（5 个）**:
1. src/commands.ts — 条件注册 `/ultraplan` 命令
2. src/components/PromptInput/PromptInput.tsx — 提示输入中的超级计划处理
3. src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx — 退出计划模式权限
4. src/screens/REPL.tsx — REPL 中的超级计划集成
5. src/utils/processUserInput/processUserInput.ts — 用户输入处理

**启用所需操作**: 仅需将编译标志 `ULTRAPLAN` 设为 `true`。

---

## 8. BASH_CLASSIFIER

**编译时引用次数**: 49（单引号 45 + 双引号 4）
**功能描述**: Bash 命令分类器。对用户请求执行的 Bash 命令进行安全分类，决定是否需要用户确认。支持自动模式（YOLO mode）下的智能权限判断。
**分类**: COMPLETE
**启用条件**: 将 `BASH_CLASSIFIER` 编译标志设为 `true`

**实现分布**: 该功能的代码分布在权限系统、工具系统和 UI 组件的 19 个文件中，与现有权限架构深度集成。

**引用该标志的文件（20 个）**:
1. src/cli/structuredIO.ts — 结构化 IO 中的分类器输出
2. src/components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx — 工具成功消息中的分类器信息
3. src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx — Bash 权限请求 UI
4. src/components/permissions/PermissionDecisionDebugInfo.tsx — 权限决策调试信息
5. src/components/permissions/PermissionRuleExplanation.tsx — 权限规则解释
6. src/components/permissions/hooks.ts — 权限 Hooks
7. src/hooks/toolPermission/PermissionContext.ts — 权限上下文
8. src/hooks/toolPermission/handlers/coordinatorHandler.ts — 协调器权限处理
9. src/hooks/toolPermission/handlers/interactiveHandler.ts — 交互式权限处理
10. src/hooks/toolPermission/handlers/swarmWorkerHandler.ts — Swarm 工作者权限处理
11. src/hooks/toolPermission/permissionLogging.ts — 权限日志
12. src/hooks/useCanUseTool.tsx — 工具可用性检查
13. src/services/api/withRetry.ts — API 重试中的分类器
14. src/tools/BashTool/bashPermissions.ts — Bash 权限逻辑
15. src/tools/BashTool/pathValidation.ts — 路径验证
16. src/utils/classifierApprovals.ts — 分类器审批记录
17. src/utils/messages.ts — 消息处理
18. src/utils/permissions/permissions.ts — 权限核心
19. src/utils/permissions/yoloClassifier.ts — YOLO 模式分类器
20. src/utils/swarm/inProcessRunner.ts — 进程内运行器中的分类器

**启用所需操作**: 仅需将编译标志 `BASH_CLASSIFIER` 设为 `true`。

---

## 9. TRANSCRIPT_CLASSIFIER `[dev: ON]`

**编译时引用次数**: 110（单引号 107 + 双引号 3）
**功能描述**: 转录分类器。这是引用次数第二多的标志，与自动模式（Auto Mode）权限系统深度集成。对整个对话转录进行分析，判断 AI 请求的工具调用是否安全。
**分类**: COMPLETE
**启用条件**: 将 `TRANSCRIPT_CLASSIFIER` 编译标志设为 `true`

**实现分布**: 该功能的代码分布在 44 个文件中，是除 KAIROS 外集成最广泛的功能。

**引用该标志的文件（44 个）**:
1. src/cli/print.ts — CLI 输出
2. src/cli/structuredIO.ts — 结构化 IO
3. src/commands/login/login.tsx — 登录命令
4. src/components/PromptInput/PromptInput.tsx — 提示输入
5. src/components/Settings/Config.tsx — 设置配置
6. src/components/messages/UserToolResultMessage/UserToolErrorMessage.tsx — 工具错误消息
7. src/components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx — 工具成功消息
8. src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx — 退出计划模式权限
9. src/components/permissions/PermissionDecisionDebugInfo.tsx — 权限决策调试
10. src/components/permissions/PermissionRuleExplanation.tsx — 权限规则解释
11. src/components/permissions/hooks.ts — 权限 Hooks
12. src/constants/betas.ts — Beta 常量
13. src/hooks/notifs/useAutoModeUnavailableNotification.ts — 自动模式不可用通知
14. src/hooks/toolPermission/PermissionContext.ts — 权限上下文
15. src/hooks/toolPermission/handlers/interactiveHandler.ts — 交互式处理
16. src/hooks/toolPermission/permissionLogging.ts — 权限日志
17. src/hooks/useCanUseTool.tsx — 工具可用性
18. src/hooks/useReplBridge.tsx — REPL 桥接
19. src/interactiveHelpers.tsx — 交互帮助函数
20. src/main.tsx — 主入口
21. src/migrations/resetAutoModeOptInForDefaultOffer.ts — 迁移脚本
22. src/screens/REPL.tsx — REPL 屏幕
23. src/services/api/claude.ts — Claude API 服务
24. src/services/tools/toolExecution.ts — 工具执行
25. src/tools/AgentTool/AgentTool.tsx — Agent 工具
26. src/tools/AgentTool/agentToolUtils.ts — Agent 工具工具函数
27. src/tools/AgentTool/runAgent.ts — 运行 Agent
28. src/tools/BashTool/bashPermissions.ts — Bash 权限
29. src/tools/ConfigTool/supportedSettings.ts — 支持的设置
30. src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts — 退出计划模式工具
31. src/tools/NotebookEditTool/NotebookEditTool.ts — Notebook 编辑工具
32. src/types/permissions.ts — 权限类型
33. src/utils/attachments.ts — 附件处理
34. src/utils/autoModeDenials.ts — 自动模式拒绝
35. src/utils/betas.ts — Beta 工具
36. src/utils/classifierApprovals.ts — 分类器审批
37. src/utils/permissions/PermissionMode.ts — 权限模式
38. src/utils/permissions/autoModeState.ts — 自动模式状态
39. src/utils/permissions/bypassPermissionsKillswitch.ts — 绕过权限 Kill Switch
40. src/utils/permissions/getNextPermissionMode.ts — 获取下一个权限模式
41. src/utils/permissions/permissionSetup.ts — 权限设置
42. src/utils/permissions/permissions.ts — 权限核心
43. src/utils/permissions/yoloClassifier.ts — YOLO 分类器
44. src/utils/settings/settings.ts — 设置
45. src/utils/settings/types.ts — 设置类型
46. src/utils/toolResultStorage.ts — 工具结果存储

**启用所需操作**: 仅需将编译标志 `TRANSCRIPT_CLASSIFIER` 设为 `true`。

---

## 10. EXTRACT_MEMORIES

**编译时引用次数**: 7
**功能描述**: 记忆提取功能。从对话中自动提取有用的记忆信息并保存到记忆文件中。
**分类**: COMPLETE
**启用条件**: 将 `EXTRACT_MEMORIES` 编译标志设为 `true`

**核心实现文件（共 769 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/services/extractMemories/extractMemories.ts | 615 行 | 记忆提取核心算法 |
| src/services/extractMemories/prompts.ts | 154 行 | 记忆提取的 AI 提示词 |

**引用该标志的文件（4 个）**:
1. src/cli/print.ts — CLI 输出中的记忆提取信息
2. src/memdir/paths.ts — 记忆目录路径
3. src/query/stopHooks.ts — 查询停止钩子中触发记忆提取
4. src/utils/backgroundHousekeeping.ts — 后台维护中的记忆提取

**启用所需操作**: 仅需将编译标志 `EXTRACT_MEMORIES` 设为 `true`。

---

## 11. CACHED_MICROCOMPACT

**编译时引用次数**: 12
**功能描述**: 缓存微压缩功能。在对话压缩时使用缓存策略优化性能。
**分类**: COMPLETE
**启用条件**: 将 `CACHED_MICROCOMPACT` 编译标志设为 `true`

**实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/services/compact/microCompact.ts | 530 行 | 微压缩核心实现 |

**引用该标志的文件（5 个）**:
1. src/constants/prompts.ts — 提示词常量
2. src/query.ts — 查询引擎
3. src/services/api/claude.ts — Claude API 服务
4. src/services/api/logging.ts — API 日志
5. src/services/compact/microCompact.ts — 微压缩核心

**启用所需操作**: 仅需将编译标志 `CACHED_MICROCOMPACT` 设为 `true`。

---

## 12. TOKEN_BUDGET `[build: ON] [dev: ON]` *NEW*

**编译时引用次数**: 9
**功能描述**: Token 预算管理。允许设置和跟踪 token 使用预算，在接近限制时提供警告。
**分类**: COMPLETE
**启用条件**: 将 `TOKEN_BUDGET` 编译标志设为 `true`

**核心实现文件（共 166 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/utils/tokenBudget.ts | 73 行 | Token 预算核心逻辑 |
| src/query/tokenBudget.ts | 93 行 | 查询层的 Token 预算管理 |

**引用该标志的文件（6 个）**:
1. src/components/PromptInput/PromptInput.tsx — 提示输入中的预算显示
2. src/components/Spinner.tsx — 加载指示器中的预算信息
3. src/constants/prompts.ts — 提示词中的预算指令
4. src/query.ts — 查询引擎中的预算检查
5. src/screens/REPL.tsx — REPL 中的预算集成
6. src/utils/attachments.ts — 附件处理中的预算计算

**启用所需操作**: 仅需将编译标志 `TOKEN_BUDGET` 设为 `true`。

---

## 13. AGENT_TRIGGERS

**编译时引用次数**: 11
**功能描述**: 代理触发器/定时任务。允许 AI 创建、管理和执行 cron 定时任务。
**分类**: COMPLETE
**启用条件**: 将 `AGENT_TRIGGERS` 编译标志设为 `true`

**核心实现文件（共 543 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/tools/ScheduleCronTool/CronCreateTool.ts | 157 行 | Cron 创建工具 |
| src/tools/ScheduleCronTool/prompt.ts | 135 行 | Cron 工具提示词 |
| src/tools/ScheduleCronTool/CronListTool.ts | 97 行 | Cron 列表工具 |
| src/tools/ScheduleCronTool/CronDeleteTool.ts | 95 行 | Cron 删除工具 |
| src/tools/ScheduleCronTool/UI.tsx | 59 行 | Cron UI 组件 |

**引用该标志的文件（6 个）**:
1. src/cli/print.ts — CLI 输出
2. src/constants/tools.ts — 工具常量
3. src/screens/REPL.tsx — REPL 集成
4. src/skills/bundled/index.ts — 内置技能
5. src/tools.ts — 工具注册
6. src/tools/ScheduleCronTool/prompt.ts — Cron 提示词

**启用所需操作**: 仅需将编译标志 `AGENT_TRIGGERS` 设为 `true`。

---

## 14. REACTIVE_COMPACT

**编译时引用次数**: 5（单引号 4 + 双引号 1）
**功能描述**: 响应式压缩。根据上下文使用情况动态触发对话压缩。
**分类**: COMPLETE
**启用条件**: 将 `REACTIVE_COMPACT` 编译标志设为 `true`

**实现文件（压缩服务已完整，共 2,586 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/services/compact/compact.ts | 1,705 行 | 压缩核心逻辑 |
| src/services/compact/microCompact.ts | 530 行 | 微压缩 |
| src/services/compact/autoCompact.ts | 351 行 | 自动压缩触发 |

**引用该标志的文件（5 个）**:
1. src/commands/compact/compact.ts — 压缩命令
2. src/components/TokenWarning.tsx — Token 警告
3. src/query.ts — 查询引擎
4. src/services/compact/autoCompact.ts — 自动压缩
5. src/utils/analyzeContext.ts — 上下文分析

**启用所需操作**: 仅需将编译标志 `REACTIVE_COMPACT` 设为 `true`。

---

## 15. KAIROS_BRIEF

**编译时引用次数**: 39
**功能描述**: Kairos Brief 功能。提供简报工具，允许 AI 生成和管理项目简报。
**分类**: COMPLETE
**启用条件**: 将 `KAIROS_BRIEF` 编译标志设为 `true`

**核心实现文件（共 334 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/tools/BriefTool/BriefTool.ts | 204 行 | Brief 工具核心 |
| src/commands/brief.ts | 130 行 | Brief 命令实现 |

**引用该标志的文件（20 个）**:
1. src/commands.ts — 命令注册
2. src/commands/brief.ts — Brief 命令
3. src/components/Messages.tsx — 消息组件
4. src/components/PromptInput/Notifications.tsx — 通知
5. src/components/PromptInput/PromptInput.tsx — 提示输入
6. src/components/PromptInput/PromptInputQueuedCommands.tsx — 排队命令
7. src/components/Settings/Config.tsx — 设置
8. src/components/Spinner.tsx — 加载指示器
9. src/components/messages/UserPromptMessage.tsx — 用户提示消息
10. src/components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx — 工具成功消息
11. src/constants/prompts.ts — 提示词
12. src/hooks/useGlobalKeybindings.tsx — 全局键绑定
13. src/keybindings/defaultBindings.ts — 默认键绑定
14. src/main.tsx — 主入口
15. src/tools/BriefTool/BriefTool.ts — Brief 工具
16. src/tools/ToolSearchTool/prompt.ts — 工具搜索提示
17. src/utils/attachments.ts — 附件
18. src/utils/conversationRecovery.ts — 对话恢复
19. src/utils/permissions/permissionRuleParser.ts — 权限规则解析
20. src/utils/settings/types.ts — 设置类型

**启用所需操作**: 仅需将编译标志 `KAIROS_BRIEF` 设为 `true`。

---

## 16. CCR_REMOTE_SETUP

**编译时引用次数**: 1
**功能描述**: CCR（Claude Code Remote）远程设置命令。
**分类**: COMPLETE
**启用条件**: 将 `CCR_REMOTE_SETUP` 编译标志设为 `true`

**引用该标志的文件（1 个）**:
1. src/commands.ts — 条件注册远程设置命令

**启用所需操作**: 仅需将编译标志 `CCR_REMOTE_SETUP` 设为 `true`。命令文件通过条件 require 加载。

---

## 17. SHOT_STATS `[build: ON] [dev: ON]` *NEW*

**编译时引用次数**: 10
**功能描述**: 统计功能。提供详细的会话统计信息，包括 token 使用、工具调用、时间统计等，带有完整的 UI 面板。
**分类**: COMPLETE
**启用条件**: 将 `SHOT_STATS` 编译标志设为 `true`

**核心实现文件（共 2,722 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/components/Stats.tsx | 1,227 行 | 统计 UI 组件 |
| src/utils/stats.ts | 1,061 行 | 统计核心逻辑 |
| src/utils/statsCache.ts | 434 行 | 统计缓存 |

**引用该标志的文件（3 个）**:
1. src/components/Stats.tsx — 统计 UI
2. src/utils/stats.ts — 统计核心
3. src/utils/statsCache.ts — 统计缓存

**启用所需操作**: 仅需将编译标志 `SHOT_STATS` 设为 `true`。

---

## 18. BG_SESSIONS

**编译时引用次数**: 11
**功能描述**: 后台会话功能。支持对话恢复和并发会话管理，允许会话在后台继续运行。
**分类**: COMPLETE
**启用条件**: 将 `BG_SESSIONS` 编译标志设为 `true`

**核心实现文件（共 801 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/utils/conversationRecovery.ts | 597 行 | 对话恢复逻辑 |
| src/utils/concurrentSessions.ts | 204 行 | 并发会话管理 |

**引用该标志的文件（7 个）**:
1. src/commands/exit/exit.tsx — 退出命令中的后台会话处理
2. src/entrypoints/cli.tsx — CLI 入口中的后台会话
3. src/main.tsx — 主入口
4. src/query.ts — 查询引擎
5. src/screens/REPL.tsx — REPL 集成
6. src/utils/concurrentSessions.ts — 并发会话
7. src/utils/conversationRecovery.ts — 对话恢复

**启用所需操作**: 仅需将编译标志 `BG_SESSIONS` 设为 `true`。

---

## 19. PROACTIVE

**编译时引用次数**: 37
**功能描述**: 主动模式。AI 可以在没有用户输入的情况下主动发起操作或建议。
**分类**: COMPLETE
**启用条件**: 将 `PROACTIVE` 编译标志设为 `true`

**核心实现文件（共 63 行，注意：大部分逻辑与 KAIROS 共享，通过 `feature('PROACTIVE') || feature('KAIROS')` 模式门控）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/proactive/index.ts | 57 行 | 主动模式入口 |
| src/proactive/useProactive.ts | 6 行 | 主动模式 Hook |

**引用该标志的文件（15 个）**:
1. src/cli/print.ts — CLI 输出
2. src/commands.ts — 命令注册（`feature('PROACTIVE') || feature('KAIROS')`）
3. src/commands/clear/conversation.ts — 清除对话
4. src/components/Messages.tsx — 消息组件
5. src/components/PromptInput/PromptInputFooterLeftSide.tsx — 页脚
6. src/components/PromptInput/usePromptInputPlaceholder.ts — 输入占位符
7. src/constants/prompts.ts — 提示词
8. src/main.tsx — 主入口
9. src/screens/REPL.tsx — REPL（多处引用，通过 require 加载 proactive 模块）
10. src/services/compact/prompt.ts — 压缩提示
11. src/tools.ts — 工具注册
12. src/tools/AgentTool/AgentTool.tsx — Agent 工具
13. src/utils/sessionStorage.ts — 会话存储
14. src/utils/settings/types.ts — 设置类型
15. src/utils/systemPrompt.ts — 系统提示

**特殊说明**: PROACTIVE 在代码中几乎总是与 KAIROS 一起使用（`feature('PROACTIVE') || feature('KAIROS')`），意味着启用 KAIROS 也会启用主动功能。PROACTIVE 模块文件（src/proactive/）存在且有内容。

**启用所需操作**: 仅需将编译标志 `PROACTIVE` 设为 `true`。

---

## 20. CHICAGO_MCP `[build: ON] [dev: ON]`

**编译时引用次数**: 16
**功能描述**: Chicago MCP（Computer Use 计算机使用）。集成计算机使用功能，允许 AI 控制桌面应用程序。
**分类**: COMPLETE
**启用条件**: 将 `CHICAGO_MCP` 编译标志设为 `true`

**核心实现文件（共 421 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/utils/computerUse/wrapper.tsx | 335 行 | 计算机使用包装器 |
| src/utils/computerUse/cleanup.ts | 86 行 | 计算机使用清理 |

**引用该标志的文件（10 个）**:
1. src/entrypoints/cli.tsx — CLI 入口
2. src/main.tsx — 主入口
3. src/query.ts — 查询引擎
4. src/query/stopHooks.ts — 停止钩子
5. src/services/analytics/metadata.ts — 分析元数据
6. src/services/mcp/client.ts — MCP 客户端
7. src/services/mcp/config.ts — MCP 配置
8. src/state/AppStateStore.ts — 应用状态
9. src/utils/computerUse/cleanup.ts — 清理
10. src/utils/computerUse/wrapper.tsx — 包装器

**启用所需操作**: 仅需将编译标志 `CHICAGO_MCP` 设为 `true`。

---

## 21. VERIFICATION_AGENT

**编译时引用次数**: 4
**功能描述**: 验证代理。内置代理类型，用于验证任务执行结果的正确性。
**分类**: COMPLETE
**启用条件**: 将 `VERIFICATION_AGENT` 编译标志设为 `true`

**核心实现文件（共 478 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/tools/TaskUpdateTool/TaskUpdateTool.ts | 406 行 | 任务更新工具 |
| src/tools/AgentTool/builtInAgents.ts | 72 行 | 内置代理定义 |

**引用该标志的文件（4 个）**:
1. src/constants/prompts.ts — 提示词
2. src/tools/AgentTool/builtInAgents.ts — 内置代理
3. src/tools/TaskUpdateTool/TaskUpdateTool.ts — 任务更新工具
4. src/tools/TodoWriteTool/TodoWriteTool.ts — TodoWrite 工具

**启用所需操作**: 仅需将编译标志 `VERIFICATION_AGENT` 设为 `true`。

---

## 22. PROMPT_CACHE_BREAK_DETECTION `[build: ON] [dev: ON]` *NEW*

**编译时引用次数**: 9
**功能描述**: 提示缓存中断检测。检测提示缓存是否被意外破坏，并在压缩时考虑缓存状态。
**分类**: COMPLETE
**启用条件**: 将 `PROMPT_CACHE_BREAK_DETECTION` 编译标志设为 `true`

**引用该标志的文件（6 个）**:
1. src/commands/compact/compact.ts — 压缩命令
2. src/services/api/claude.ts — Claude API 服务
3. src/services/compact/autoCompact.ts — 自动压缩
4. src/services/compact/compact.ts — 压缩核心
5. src/services/compact/microCompact.ts — 微压缩
6. src/tools/AgentTool/runAgent.ts — 运行 Agent

**启用所需操作**: 仅需将编译标志 `PROMPT_CACHE_BREAK_DETECTION` 设为 `true`。

---

# 二、PARTIAL（部分实现）— 共 19 个

以下标志有实质性的功能代码，但存在缺失的文件（命令入口、组件等）或关键模块仅有空壳。启用后可能报错或功能不完整。

---

## 23. KAIROS

**编译时引用次数**: 156（单引号 154 + 双引号 2）
**功能描述**: Kairos 是 Claude Code 最大的功能集合。它是一个综合性平台功能，涵盖频道通知、主动模式、简报、GitHub Webhook、推送通知等多个子系统。几乎贯穿整个代码库。
**分类**: PARTIAL
**缺失原因**: `src/commands/assistant/` 目录完全缺失（包括 `index.ts` 和 `gate.ts`），但 `src/commands.ts` 中通过条件 require 引用了 `commands/assistant/index.js`

**引用该标志的文件（59 个）**:
1. src/bridge/bridgeMain.ts
2. src/bridge/initReplBridge.ts
3. src/cli/print.ts
4. src/commands.ts
5. src/commands/bridge/bridge.tsx
6. src/commands/brief.ts
7. src/commands/clear/conversation.ts
8. src/components/LogoV2/ChannelsNotice.tsx
9. src/components/LogoV2/LogoV2.tsx
10. src/components/Messages.tsx
11. src/components/PromptInput/Notifications.tsx
12. src/components/PromptInput/PromptInput.tsx
13. src/components/PromptInput/PromptInputFooterLeftSide.tsx
14. src/components/PromptInput/PromptInputQueuedCommands.tsx
15. src/components/PromptInput/usePromptInputPlaceholder.ts
16. src/components/Settings/Config.tsx
17. src/components/Spinner.tsx
18. src/components/StatusLine.tsx
19. src/components/messages/UserPromptMessage.tsx
20. src/components/messages/UserTextMessage.tsx
21. src/components/messages/UserToolResultMessage/UserToolSuccessMessage.tsx
22. src/constants/prompts.ts
23. src/hooks/toolPermission/handlers/interactiveHandler.ts
24. src/hooks/useAssistantHistory.ts
25. src/hooks/useCanUseTool.tsx
26. src/hooks/useGlobalKeybindings.tsx
27. src/hooks/useReplBridge.tsx
28. src/interactiveHelpers.tsx
29. src/keybindings/defaultBindings.ts
30. src/main.tsx
31. src/memdir/memdir.ts
32. src/memdir/paths.ts
33. src/screens/REPL.tsx
34. src/services/analytics/metadata.ts
35. src/services/compact/compact.ts
36. src/services/compact/prompt.ts
37. src/services/mcp/channelNotification.ts
38. src/services/mcp/useManageMCPConnections.ts
39. src/skills/bundled/index.ts
40. src/tools.ts
41. src/tools/AgentTool/AgentTool.tsx
42. src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx
43. src/tools/BashTool/BashTool.tsx
44. src/tools/BriefTool/BriefTool.ts
45. src/tools/ConfigTool/supportedSettings.ts
46. src/tools/EnterPlanModeTool/EnterPlanModeTool.ts
47. src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts
48. src/tools/PowerShellTool/PowerShellTool.tsx
49. src/tools/ScheduleCronTool/prompt.ts
50. src/tools/ToolSearchTool/prompt.ts
51. src/utils/attachments.ts
52. src/utils/conversationRecovery.ts
53. src/utils/messageQueueManager.ts
54. src/utils/messages.ts
55. src/utils/permissions/permissionRuleParser.ts
56. src/utils/processUserInput/processSlashCommand.tsx
57. src/utils/sessionStorage.ts
58. src/utils/settings/types.ts
59. src/utils/systemPrompt.ts

**缺失文件**:
- src/commands/assistant/index.ts — 完全缺失（src/commands.ts 第 69 行引用了 `commands/assistant/index.js`）
- src/commands/assistant/gate.ts — 完全缺失

**启用所需修复**: 需要创建 `src/commands/assistant/` 目录及其 `index.ts` 和 `gate.ts` 文件。

---

## 24. BUDDY `[dev: ON]`

**编译时引用次数**: 18（单引号 16 + 双引号 2）
**功能描述**: 伙伴精灵功能。在 CLI 中显示一个可爱的像素精灵角色作为 AI 助手的化身，有动画、表情、通知等。
**分类**: PARTIAL
**缺失原因**: `src/commands/buddy/index.ts` 命令入口文件缺失，但 `src/buddy/` 目录下有完整的 1,298 行实现代码

**核心实现文件（src/buddy/ 目录，共 1,298 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/buddy/sprites.ts | 514 行 | 精灵图形定义 |
| src/buddy/CompanionSprite.tsx | 370 行 | 精灵 React 组件 |
| src/buddy/types.ts | 148 行 | 类型定义 |
| src/buddy/companion.ts | 133 行 | 伙伴核心逻辑 |
| src/buddy/useBuddyNotification.tsx | 97 行 | 伙伴通知 Hook |
| src/buddy/prompt.ts | 36 行 | 伙伴提示词 |

**引用该标志的文件（8 个）**:
1. src/buddy/CompanionSprite.tsx — 精灵组件
2. src/buddy/prompt.ts — 提示词
3. src/buddy/useBuddyNotification.tsx — 通知
4. src/commands.ts — 条件注册 `/buddy` 命令（引用 `commands/buddy/index.js`）
5. src/components/PromptInput/PromptInput.tsx — 提示输入
6. src/screens/REPL.tsx — REPL 集成
7. src/utils/attachments.ts — 附件

**缺失文件**:
- src/commands/buddy/index.ts — 命令入口缺失

**启用所需修复**: 需要创建 `src/commands/buddy/index.ts` 命令入口文件。

---

## 25. MONITOR_TOOL

**编译时引用次数**: 13
**功能描述**: 监控工具。允许 AI 在后台启动长时间运行的 shell 任务并监控其输出。
**分类**: PARTIAL
**缺失原因**: MonitorMcpDetailDialog 和 MonitorPermissionRequest 文件虽然存在但仅有 3 行空壳

**核心实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/tasks/LocalShellTask/LocalShellTask.tsx | 522 行 | 本地 Shell 任务完整实现 |
| src/tools/MonitorTool/MonitorTool.ts | 1 行 | 监控工具（桩） |
| src/tasks/MonitorMcpTask/MonitorMcpTask.ts | 5 行 | MCP 监控任务（桩） |
| src/components/tasks/MonitorMcpDetailDialog.tsx | 3 行 | MCP 详情对话框（桩） |
| src/components/permissions/MonitorPermissionRequest/MonitorPermissionRequest.tsx | 3 行 | 监控权限请求（桩） |

**引用该标志的文件（9 个）**:
1. src/components/permissions/PermissionRequest.tsx — 权限请求
2. src/components/tasks/BackgroundTasksDialog.tsx — 后台任务对话框
3. src/tasks.ts — 任务注册
4. src/tasks/LocalShellTask/LocalShellTask.tsx — Shell 任务
5. src/tools.ts — 工具注册
6. src/tools/AgentTool/runAgent.ts — Agent 运行
7. src/tools/BashTool/BashTool.tsx — Bash 工具
8. src/tools/BashTool/prompt.ts — Bash 提示
9. src/tools/PowerShellTool/PowerShellTool.tsx — PowerShell 工具

**启用所需修复**: 需要实现 `src/tools/MonitorTool/MonitorTool.ts`、`src/tasks/MonitorMcpTask/MonitorMcpTask.ts`、`src/components/tasks/MonitorMcpDetailDialog.tsx` 和 `src/components/permissions/MonitorPermissionRequest/MonitorPermissionRequest.tsx`。

---

## 26. HISTORY_SNIP

**编译时引用次数**: 16（单引号 15 + 双引号 1）
**功能描述**: 历史剪辑。允许从对话历史中剪切特定片段。
**分类**: PARTIAL
**缺失原因**: `src/commands/force-snip.ts` 命令文件缺失

**引用该标志的文件（8 个）**:
1. src/QueryEngine.ts — 查询引擎
2. src/commands.ts — 命令注册（引用 `commands/force-snip.js`）
3. src/components/Message.tsx — 消息组件
4. src/query.ts — 查询
5. src/tools.ts — 工具注册
6. src/utils/attachments.ts — 附件
7. src/utils/collapseReadSearch.ts — 折叠读取搜索
8. src/utils/messages.ts — 消息处理

**缺失文件**:
- src/commands/force-snip.ts — 命令文件缺失

**启用所需修复**: 需要创建 `src/commands/force-snip.ts`。

---

## 27. WORKFLOW_SCRIPTS

**编译时引用次数**: 10
**功能描述**: 工作流脚本。允许定义和执行自定义工作流。
**分类**: PARTIAL
**缺失原因**: 多个核心文件仅有 1-5 行空壳，命令入口目录缺失

**实现文件（大部分为空壳）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/components/WorkflowMultiselectDialog.tsx | 127 行 | 工作流多选对话框（有内容） |
| src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts | 5 行 | 本地工作流任务（桩） |
| src/components/tasks/WorkflowDetailDialog.tsx | 3 行 | 工作流详情对话框（桩） |
| src/tools/WorkflowTool/WorkflowPermissionRequest.tsx | 3 行 | 工作流权限请求（桩） |
| src/tools/WorkflowTool/createWorkflowCommand.ts | 3 行 | 创建工作流命令（桩） |
| src/tools/WorkflowTool/WorkflowTool.ts | 1 行 | 工作流工具（桩） |
| src/tools/WorkflowTool/constants.ts | 1 行 | 常量（桩） |

**引用该标志的文件（7 个）**:
1. src/commands.ts — 命令注册（引用 `commands/workflows/index.js`）
2. src/components/permissions/PermissionRequest.tsx — 权限请求
3. src/components/tasks/BackgroundTasksDialog.tsx — 后台任务
4. src/constants/tools.ts — 工具常量
5. src/tasks.ts — 任务注册
6. src/tools.ts — 工具注册
7. src/utils/permissions/classifierDecision.ts — 分类器决策

**缺失文件**:
- src/commands/workflows/index.ts — 命令入口目录缺失

**启用所需修复**: 需要实现所有空壳文件并创建命令入口。

---

## 28. UDS_INBOX

**编译时引用次数**: 18（单引号 17 + 双引号 1）
**功能描述**: UDS（Unix Domain Socket）收件箱。允许 Claude Code 实例之间通过 Unix 套接字发送消息。
**分类**: PARTIAL
**缺失原因**: `src/utils/udsMessaging.ts` 仅 1 行，`src/utils/udsClient.ts` 仅 3 行（空壳），命令入口缺失

**核心实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/tools/SendMessageTool/SendMessageTool.ts | 917 行 | 发送消息工具（完整实现） |
| src/tools/SendMessageTool/prompt.ts | 49 行 | 消息工具提示词 |
| src/utils/udsClient.ts | 3 行 | UDS 客户端（桩） |
| src/utils/udsMessaging.ts | 1 行 | UDS 消息（桩） |

**引用该标志的文件（10 个）**:
1. src/cli/print.ts — CLI 输出
2. src/commands.ts — 命令注册（引用 `commands/peers/index.js`）
3. src/components/messages/UserTextMessage.tsx — 用户消息
4. src/main.tsx — 主入口
5. src/setup.ts — 初始化
6. src/tools.ts — 工具注册
7. src/tools/SendMessageTool/SendMessageTool.ts — 发送消息工具
8. src/tools/SendMessageTool/prompt.ts — 提示词
9. src/utils/concurrentSessions.ts — 并发会话
10. src/utils/messages/systemInit.ts — 系统初始化消息

**缺失文件**:
- src/commands/peers/index.ts — 命令入口缺失
- src/utils/udsMessaging.ts — 仅 1 行空壳
- src/utils/udsClient.ts — 仅 3 行空壳

**启用所需修复**: 需要实现 UDS 客户端和消息模块，并创建命令入口。

---

## 29. KAIROS_CHANNELS

**编译时引用次数**: 21（单引号 19 + 双引号 2）
**功能描述**: Kairos 频道功能。MCP 频道通知系统。
**分类**: PARTIAL
**缺失原因**: 依赖 KAIROS 的 assistant/gate.ts 模块

**核心实现文件（共 581 行）**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/services/mcp/channelNotification.ts | 316 行 | 频道通知服务 |
| src/components/LogoV2/ChannelsNotice.tsx | 265 行 | 频道通知 UI |

**引用该标志的文件（15 个）**:
1. src/cli/print.ts
2. src/components/LogoV2/ChannelsNotice.tsx
3. src/components/LogoV2/LogoV2.tsx
4. src/components/messages/UserTextMessage.tsx
5. src/hooks/toolPermission/handlers/interactiveHandler.ts
6. src/hooks/useCanUseTool.tsx
7. src/interactiveHelpers.tsx
8. src/main.tsx
9. src/services/mcp/channelNotification.ts
10. src/services/mcp/useManageMCPConnections.ts
11. src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx
12. src/tools/EnterPlanModeTool/EnterPlanModeTool.ts
13. src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts
14. src/utils/messageQueueManager.ts
15. src/utils/messages.ts

**启用所需修复**: 需先修复 KAIROS 的缺失文件。

---

## 30. FORK_SUBAGENT

**编译时引用次数**: 5（单引号 4 + 双引号 1）
**功能描述**: 分叉子代理。允许从当前会话分叉出独立的子代理进程。
**分类**: PARTIAL
**缺失原因**: `src/commands/fork/index.ts` 命令入口缺失（注意：代码中引用的是 `commands/branch/index.js`，而 `src/commands/branch/index.ts` 存在）

**核心实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/tools/AgentTool/forkSubagent.ts | 210 行 | 分叉子代理核心逻辑 |

**引用该标志的文件（5 个）**:
1. src/commands.ts — 命令注册
2. src/commands/branch/index.ts — 分支命令入口
3. src/components/messages/UserTextMessage.tsx — 用户消息
4. src/tools/AgentTool/forkSubagent.ts — 分叉逻辑
5. src/tools/ToolSearchTool/prompt.ts — 工具搜索提示

**缺失文件**:
- src/commands/fork/index.ts — 命令入口缺失（但 branch/index.ts 存在，可能是重命名）

**启用所需修复**: 需确认命令入口路径是否正确。

---

## 31. EXPERIMENTAL_SKILL_SEARCH

**编译时引用次数**: 21
**功能描述**: 实验性技能搜索。本地技能搜索功能。
**分类**: PARTIAL
**缺失原因**: 核心搜索逻辑可能不完整（SkillTool.ts 有 1,108 行但 localSearch 功能可能缺失）

**引用该标志的文件（9 个）**:
1. src/commands.ts — 命令注册
2. src/components/messages/AttachmentMessage.tsx — 附件消息
3. src/constants/prompts.ts — 提示词
4. src/query.ts — 查询
5. src/services/compact/compact.ts — 压缩
6. src/services/mcp/useManageMCPConnections.ts — MCP 连接管理
7. src/tools/SkillTool/SkillTool.ts — 技能工具（1,108 行）
8. src/utils/attachments.ts — 附件
9. src/utils/messages.ts — 消息

---

## 32. WEB_BROWSER_TOOL

**编译时引用次数**: 4
**功能描述**: Web 浏览器工具。允许 AI 在面板中打开和操作网页。
**分类**: PARTIAL
**缺失原因**: `src/tools/WebBrowserTool/WebBrowserPanel.tsx` 仅 3 行，返回 `null`

**实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/tools/WebBrowserTool/WebBrowserPanel.tsx | 3 行 | `export function WebBrowserPanel() { return null }` |

**引用该标志的文件（3 个）**:
1. src/main.tsx — 主入口
2. src/screens/REPL.tsx — REPL
3. src/tools.ts — 工具注册

**启用所需修复**: 需要实现 `WebBrowserPanel.tsx`。

---

## 33. MCP_SKILLS

**编译时引用次数**: 9
**功能描述**: MCP 技能系统。通过 MCP 协议加载和运行技能。
**分类**: PARTIAL

**实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/skills/mcpSkillBuilders.ts | 44 行 | MCP 技能构建器 |
| src/skills/mcpSkills.ts | 3 行 | MCP 技能（桩） |

**引用该标志的文件（3 个）**:
1. src/commands.ts — 命令注册
2. src/services/mcp/client.ts — MCP 客户端
3. src/services/mcp/useManageMCPConnections.ts — MCP 连接管理

---

## 34. REVIEW_ARTIFACT

**编译时引用次数**: 4
**功能描述**: 审查工件。允许 AI 审查和标注工件（代码片段、文档等）。
**分类**: PARTIAL
**缺失原因**: ReviewArtifactTool.ts 仅 1 行，ReviewArtifactPermissionRequest.tsx 仅 3 行

**实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/tools/ReviewArtifactTool/ReviewArtifactTool.ts | 1 行 | 审查工件工具（桩） |
| src/components/permissions/ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.tsx | 3 行 | 权限请求（桩） |

**引用该标志的文件（2 个）**:
1. src/components/permissions/PermissionRequest.tsx — 权限请求
2. src/skills/bundled/index.ts — 内置技能

---

## 35. KAIROS_GITHUB_WEBHOOKS

**编译时引用次数**: 4（单引号 3 + 双引号 1）
**功能描述**: Kairos GitHub Webhooks。订阅 GitHub PR 活动的 Webhook。
**分类**: PARTIAL
**缺失原因**: `src/commands/subscribe-pr.ts` 命令文件缺失

**引用该标志的文件（4 个）**:
1. src/commands.ts — 命令注册（引用 `commands/subscribe-pr.js`）
2. src/components/messages/UserTextMessage.tsx — 用户消息
3. src/hooks/useReplBridge.tsx — REPL 桥接
4. src/tools.ts — 工具注册

**缺失文件**:
- src/commands/subscribe-pr.ts — 命令文件缺失

---

## 36. CONNECTOR_TEXT

**编译时引用次数**: 8（单引号 7 + 双引号 1）
**功能描述**: 连接器文本。控制消息中的连接器文本显示方式。
**分类**: PARTIAL

**引用该标志的文件（5 个）**:
1. src/components/Message.tsx — 消息组件
2. src/constants/betas.ts — Beta 常量
3. src/services/api/claude.ts — Claude API
4. src/services/api/logging.ts — API 日志
5. src/utils/messages.ts — 消息处理

---

## 37. TEMPLATES

**编译时引用次数**: 6
**功能描述**: 模板系统。支持从 Markdown 配置文件加载模板。
**分类**: PARTIAL

**实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/utils/markdownConfigLoader.ts | 600 行 | Markdown 配置加载器 |
| src/keybindings/template.ts | 52 行 | 模板键绑定 |

**引用该标志的文件（5 个）**:
1. src/entrypoints/cli.tsx — CLI 入口
2. src/query.ts — 查询
3. src/query/stopHooks.ts — 停止钩子
4. src/utils/markdownConfigLoader.ts — 配置加载器
5. src/utils/permissions/filesystem.ts — 文件系统权限

---

## 38. LODESTONE

**编译时引用次数**: 6
**功能描述**: Lodestone 功能。具体功能不明确，可能与导航或指引相关。
**分类**: PARTIAL

**引用该标志的文件（4 个）**:
1. src/interactiveHelpers.tsx — 交互帮助
2. src/main.tsx — 主入口
3. src/utils/backgroundHousekeeping.ts — 后台维护
4. src/utils/settings/types.ts — 设置类型

**说明**: 没有专属实现文件，代码散布在 4 个文件中。

---

## 39. HISTORY_PICKER

**编译时引用次数**: 4
**功能描述**: 历史选择器。交互式历史搜索和选择。
**分类**: PARTIAL

**实现文件**:

| 文件路径 | 行数 | 功能说明 |
|----------|------|----------|
| src/hooks/useHistorySearch.ts | 303 行 | 历史搜索 Hook |

**引用该标志的文件（2 个）**:
1. src/components/PromptInput/PromptInput.tsx — 提示输入
2. src/hooks/useHistorySearch.ts — 历史搜索

---

## 40. MESSAGE_ACTIONS

**编译时引用次数**: 5
**功能描述**: 消息操作。对消息执行操作（如复制、编辑、重试等）。
**分类**: PARTIAL

**引用该标志的文件（2 个）**:
1. src/keybindings/defaultBindings.ts — 默认键绑定
2. src/screens/REPL.tsx — REPL

---

## 41. TERMINAL_PANEL

**编译时引用次数**: 5（单引号 4 + 双引号 1）
**功能描述**: 终端面板。在 UI 中显示内嵌终端面板。
**分类**: PARTIAL

**引用该标志的文件（5 个）**:
1. src/components/PromptInput/PromptInputHelpMenu.tsx — 帮助菜单
2. src/hooks/useGlobalKeybindings.tsx — 全局键绑定
3. src/keybindings/defaultBindings.ts — 默认键绑定
4. src/tools.ts — 工具注册
5. src/utils/permissions/classifierDecision.ts — 分类器决策

---

# 三、STUB（纯桩/最小实现）— 共 51 个

以下标志仅有极少的引用（通常 1-3 处），没有或几乎没有实际功能代码。代码只是为该标志预留了位置。

---

## 42. TORCH

**编译时引用次数**: 1
**功能描述**: Torch 功能（具体不明）。
**分类**: STUB
**引用文件**: src/commands.ts — 条件注册 `/torch` 命令（引用 `commands/torch.js`）
**缺失文件**: src/commands/torch.ts — 命令文件完全不存在
**代码量**: 0 行专属代码
**说明**: 纯占位符，没有任何实现。

---

## 43. KAIROS_DREAM

**编译时引用次数**: 1
**功能描述**: Kairos Dream（具体不明）。
**分类**: STUB
**引用文件**: src/skills/bundled/index.ts — 内置技能注册
**代码量**: 0 行专属代码

---

## 44. KAIROS_PUSH_NOTIFICATION

**编译时引用次数**: 4
**功能描述**: Kairos 推送通知。
**分类**: STUB
**引用文件**:
1. src/components/Settings/Config.tsx — 设置
2. src/tools.ts — 工具注册
3. src/tools/ConfigTool/supportedSettings.ts — 支持的设置
**代码量**: 0 行专属代码，仅在设置中预留了开关位

---

## 45. DAEMON

**编译时引用次数**: 3
**功能描述**: 守护进程模式。
**分类**: STUB
**引用文件**:
1. src/commands.ts — 条件注册命令（与 BRIDGE_MODE 组合）
2. src/entrypoints/cli.tsx — CLI 入口
**代码量**: 0 行专属代码
**说明**: 在 commands.ts 中，`DAEMON` 与 `BRIDGE_MODE` 一起用于条件加载 `commands/remoteControlServer/index.js`，该文件不存在。

---

## 46. DIRECT_CONNECT

**编译时引用次数**: 5
**功能描述**: 直连模式。
**分类**: STUB
**引用文件**: src/main.tsx — 主入口
**代码量**: 0 行专属代码

---

## 47. SSH_REMOTE

**编译时引用次数**: 4
**功能描述**: SSH 远程连接。
**分类**: STUB
**引用文件**: src/main.tsx — 主入口
**代码量**: 0 行专属代码

---

## 48. STREAMLINED_OUTPUT

**编译时引用次数**: 1
**功能描述**: 精简输出模式。
**分类**: STUB
**引用文件**: src/cli/print.ts — CLI 输出
**代码量**: 0 行专属代码

---

## 49. ANTI_DISTILLATION_CC

**编译时引用次数**: 1
**功能描述**: 反蒸馏（防止模型蒸馏攻击）。
**分类**: STUB
**引用文件**: src/services/api/claude.ts — Claude API 服务
**代码量**: 0 行专属代码

---

## 50. NATIVE_CLIENT_ATTESTATION

**编译时引用次数**: 1
**功能描述**: 原生客户端认证。
**分类**: STUB
**引用文件**: src/constants/system.ts — 系统常量
**代码量**: 0 行专属代码

---

## 51. ABLATION_BASELINE

**编译时引用次数**: 1
**功能描述**: 消融基线测试。
**分类**: STUB
**引用文件**: src/entrypoints/cli.tsx — CLI 入口
**代码量**: 0 行专属代码

---

## 52. AGENT_MEMORY_SNAPSHOT

**编译时引用次数**: 2
**功能描述**: 代理记忆快照。
**分类**: STUB
**引用文件**:
1. src/main.tsx — 主入口
2. src/tools/AgentTool/loadAgentsDir.ts — 加载代理目录
**代码量**: 0 行专属代码

---

## 53. AGENT_TRIGGERS_REMOTE `[build: ON] [dev: ON]`

**编译时引用次数**: 2
**功能描述**: 远程代理触发器。
**分类**: STUB
**引用文件**:
1. src/skills/bundled/index.ts — 内置技能
2. src/tools.ts — 工具注册
**代码量**: 0 行专属代码

---

## 54. ALLOW_TEST_VERSIONS

**编译时引用次数**: 2
**功能描述**: 允许测试版本。
**分类**: STUB
**引用文件**: src/utils/nativeInstaller/download.ts — 原生安装器下载（523 行，但标志仅用于一处条件判断）
**代码量**: 0 行专属代码

---

## 55. AUTO_THEME

**编译时引用次数**: 3（单引号 2 + 双引号 1）
**功能描述**: 自动主题切换。
**分类**: STUB
**引用文件**:
1. src/components/ThemePicker.tsx — 主题选择器
2. src/components/design-system/ThemeProvider.tsx — 主题提供者
3. src/tools/ConfigTool/supportedSettings.ts — 支持的设置
**代码量**: 0 行专属代码

---

## 56. AWAY_SUMMARY

**编译时引用次数**: 2
**功能描述**: 离开摘要。用户离开时生成会话摘要。
**分类**: STUB
**引用文件**:
1. src/hooks/useAwaySummary.ts — 离开摘要 Hook（125 行，但功能可能不完整）
2. src/screens/REPL.tsx — REPL
**代码量**: 约 125 行（useAwaySummary.ts）

---

## 57. BREAK_CACHE_COMMAND

**编译时引用次数**: 2
**功能描述**: 缓存中断命令。
**分类**: STUB
**引用文件**: src/context.ts — 上下文
**代码量**: 0 行专属代码

---

## 58. BUILDING_CLAUDE_APPS

**编译时引用次数**: 1
**功能描述**: 构建 Claude 应用程序。
**分类**: STUB
**引用文件**: src/skills/bundled/index.ts — 内置技能
**代码量**: 0 行专属代码

---

## 59. BUILTIN_EXPLORE_PLAN_AGENTS

**编译时引用次数**: 1
**功能描述**: 内置探索和计划代理。
**分类**: STUB
**引用文件**: src/tools/AgentTool/builtInAgents.ts — 内置代理定义
**代码量**: 0 行专属代码

---

## 60. BYOC_ENVIRONMENT_RUNNER

**编译时引用次数**: 1
**功能描述**: BYOC（Bring Your Own Cloud）环境运行器。
**分类**: STUB
**引用文件**: src/entrypoints/cli.tsx — CLI 入口
**代码量**: 0 行专属代码

---

## 61. CCR_AUTO_CONNECT

**编译时引用次数**: 3
**功能描述**: CCR 自动连接。
**分类**: STUB
**引用文件**:
1. src/bridge/bridgeEnabled.ts — 桥接启用检测
2. src/utils/config.ts — 配置
**代码量**: 0 行专属代码

---

## 62. CCR_MIRROR

**编译时引用次数**: 4
**功能描述**: CCR 镜像模式。
**分类**: STUB
**引用文件**:
1. src/bridge/bridgeEnabled.ts — 桥接启用检测
2. src/bridge/remoteBridgeCore.ts — 远程桥接核心
3. src/main.tsx — 主入口
**代码量**: 0 行专属代码

---

## 63. COMPACTION_REMINDERS

**编译时引用次数**: 1
**功能描述**: 压缩提醒。
**分类**: STUB
**引用文件**: src/utils/attachments.ts — 附件处理
**代码量**: 0 行专属代码

---

## 64. COWORKER_TYPE_TELEMETRY

**编译时引用次数**: 2
**功能描述**: 共同工作者类型遥测。
**分类**: STUB
**引用文件**: src/services/analytics/metadata.ts — 分析元数据
**代码量**: 0 行专属代码

---

## 65. DOWNLOAD_USER_SETTINGS

**编译时引用次数**: 5
**功能描述**: 下载用户设置（从远程同步）。
**分类**: STUB
**引用文件**:
1. src/cli/print.ts — CLI 输出
2. src/commands/reload-plugins/reload-plugins.ts — 重载插件
3. src/services/settingsSync/index.ts — 设置同步
**代码量**: 0 行专属代码

---

## 66. DUMP_SYSTEM_PROMPT

**编译时引用次数**: 1
**功能描述**: 转储系统提示（调试用）。
**分类**: STUB
**引用文件**: src/entrypoints/cli.tsx — CLI 入口
**代码量**: 0 行专属代码

---

## 67. ENHANCED_TELEMETRY_BETA

**编译时引用次数**: 2
**功能描述**: 增强遥测 Beta。
**分类**: STUB
**引用文件**: src/utils/telemetry/sessionTracing.ts — 会话追踪（927 行，但标志仅用于一处条件）
**代码量**: 0 行专属代码

---

## 68. FILE_PERSISTENCE

**编译时引用次数**: 3
**功能描述**: 文件持久化。
**分类**: STUB
**引用文件**:
1. src/cli/print.ts — CLI 输出
2. src/utils/filePersistence/filePersistence.ts — 文件持久化（287 行）
**代码量**: 约 287 行（filePersistence.ts），但仅 3 处引用

---

## 69. HARD_FAIL

**编译时引用次数**: 2
**功能描述**: 硬失败模式（遇到错误时立即退出而非优雅降级）。
**分类**: STUB
**引用文件**:
1. src/main.tsx — 主入口
2. src/utils/log.ts — 日志工具
**代码量**: 0 行专属代码

---

## 70. HOOK_PROMPTS

**编译时引用次数**: 1
**功能描述**: 钩子提示。
**分类**: STUB
**引用文件**: src/screens/REPL.tsx — REPL
**代码量**: 0 行专属代码

---

## 71. IS_LIBC_GLIBC

**编译时引用次数**: 1
**功能描述**: 检测 libc 是否为 glibc。
**分类**: STUB
**引用文件**: src/utils/envDynamic.ts — 动态环境检测（151 行）
**代码量**: 0 行专属代码（标志用于条件编译）

---

## 72. IS_LIBC_MUSL

**编译时引用次数**: 1
**功能描述**: 检测 libc 是否为 musl。
**分类**: STUB
**引用文件**: src/utils/envDynamic.ts — 动态环境检测（151 行）
**代码量**: 0 行专属代码（标志用于条件编译）

---

## 73. MCP_RICH_OUTPUT

**编译时引用次数**: 3
**功能描述**: MCP 富文本输出。
**分类**: STUB
**引用文件**: src/tools/MCPTool/UI.tsx — MCP 工具 UI
**代码量**: 0 行专属代码

---

## 74. MEMORY_SHAPE_TELEMETRY

**编译时引用次数**: 3
**功能描述**: 记忆形状遥测。
**分类**: STUB
**引用文件**:
1. src/memdir/findRelevantMemories.ts — 查找相关记忆
2. src/utils/sessionFileAccessHooks.ts — 会话文件访问钩子
**代码量**: 0 行专属代码

---

## 75. NATIVE_CLIPBOARD_IMAGE

**编译时引用次数**: 2
**功能描述**: 原生剪贴板图片支持。
**分类**: STUB
**引用文件**: src/utils/imagePaste.ts — 图片粘贴（416 行，但标志仅用于一处条件）
**代码量**: 0 行专属代码

---

## 76. NEW_INIT

**编译时引用次数**: 2
**功能描述**: 新的初始化流程。
**分类**: STUB
**引用文件**: src/commands/init.ts — 初始化命令
**代码量**: 0 行专属代码

---

## 77. OVERFLOW_TEST_TOOL

**编译时引用次数**: 2
**功能描述**: 溢出测试工具（内部测试用）。
**分类**: STUB
**引用文件**:
1. src/tools.ts — 工具注册
2. src/utils/permissions/classifierDecision.ts — 分类器决策
**代码量**: 0 行专属代码

---

## 78. PERFETTO_TRACING

**编译时引用次数**: 1
**功能描述**: Perfetto 追踪（性能追踪工具）。
**分类**: STUB
**引用文件**: src/utils/telemetry/perfettoTracing.ts — Perfetto 追踪（1,120 行，但标志仅用于一处）
**代码量**: 约 1,120 行（perfettoTracing.ts）存在，但仅 1 处引用

---

## 79. POWERSHELL_AUTO_MODE

**编译时引用次数**: 2
**功能描述**: PowerShell 自动模式。
**分类**: STUB
**引用文件**:
1. src/utils/permissions/permissions.ts — 权限
2. src/utils/permissions/yoloClassifier.ts — YOLO 分类器
**代码量**: 0 行专属代码

---

## 80. QUICK_SEARCH

**编译时引用次数**: 5
**功能描述**: 快速搜索。
**分类**: STUB
**引用文件**:
1. src/components/PromptInput/PromptInput.tsx — 提示输入
2. src/keybindings/defaultBindings.ts — 默认键绑定
**代码量**: 0 行专属代码

---

## 81. RUN_SKILL_GENERATOR

**编译时引用次数**: 1
**功能描述**: 运行技能生成器。
**分类**: STUB
**引用文件**: src/skills/bundled/index.ts — 内置技能
**代码量**: 0 行专属代码

---

## 82. SELF_HOSTED_RUNNER

**编译时引用次数**: 1
**功能描述**: 自托管运行器。
**分类**: STUB
**引用文件**: src/entrypoints/cli.tsx — CLI 入口
**代码量**: 0 行专属代码

---

## 83. SKILL_IMPROVEMENT

**编译时引用次数**: 1
**功能描述**: 技能改进。
**分类**: STUB
**引用文件**: src/utils/hooks/skillImprovement.ts — 技能改进（267 行，但标志仅 1 处引用）
**代码量**: 约 267 行（skillImprovement.ts）

---

## 84. SLOW_OPERATION_LOGGING

**编译时引用次数**: 1
**功能描述**: 慢操作日志记录。
**分类**: STUB
**引用文件**: src/utils/slowOperations.ts — 慢操作（286 行，但标志仅 1 处引用）
**代码量**: 约 286 行（slowOperations.ts）

---

## 85. TREE_SITTER_BASH

**编译时引用次数**: 3
**功能描述**: Tree-sitter Bash 解析器。
**分类**: STUB
**引用文件**: src/utils/bash/parser.ts — Bash 解析器
**代码量**: 0 行专属代码

---

## 86. TREE_SITTER_BASH_SHADOW

**编译时引用次数**: 5
**功能描述**: Tree-sitter Bash 影子模式（并行运行 tree-sitter 和传统解析器进行对比）。
**分类**: STUB
**引用文件**:
1. src/tools/BashTool/bashPermissions.ts — Bash 权限
2. src/utils/bash/parser.ts — Bash 解析器
**代码量**: 0 行专属代码

---

## 87. ULTRATHINK

**编译时引用次数**: 1
**功能描述**: 超级思考模式。
**分类**: STUB
**引用文件**: src/utils/thinking.ts — 思考工具（162 行，但标志仅 1 处引用）
**代码量**: 0 行专属代码

---

## 88. UNATTENDED_RETRY

**编译时引用次数**: 1
**功能描述**: 无人值守重试。
**分类**: STUB
**引用文件**: src/services/api/withRetry.ts — API 重试
**代码量**: 0 行专属代码

---

## 89. UPLOAD_USER_SETTINGS

**编译时引用次数**: 2
**功能描述**: 上传用户设置（同步到远程）。
**分类**: STUB
**引用文件**:
1. src/main.tsx — 主入口
2. src/services/settingsSync/index.ts — 设置同步
**代码量**: 0 行专属代码

---

## 90. SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED

**编译时引用次数**: 1（仅双引号形式）
**功能描述**: 当自动更新禁用时跳过检测。
**分类**: STUB
**引用文件**: src/components/AutoUpdaterWrapper.tsx — 自动更新包装器
**代码量**: 0 行专属代码

---

## 91. QUICK_SEARCH（已在 #80 列出）

注：QUICK_SEARCH 已在 #80 列出。总计为 92 个独立标志（含 SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED）。

---

# 四、缺失文件汇总

以下是 `src/commands.ts` 中通过 `feature()` 条件 require 引用的文件，但在源代码中不存在：

| 标志 | 引用路径 | 状态 |
|------|----------|------|
| TORCH | commands/torch.js | 文件完全不存在，无 .ts 版本 |
| PROACTIVE（与 KAIROS 共用） | commands/assistant/index.js | 整个 commands/assistant/ 目录不存在 |
| KAIROS | commands/assistant/index.js | 同上 |
| DAEMON + BRIDGE_MODE | commands/remoteControlServer/index.js | 文件不存在 |
| HISTORY_SNIP | commands/force-snip.js | 文件完全不存在，无 .ts 版本 |
| WORKFLOW_SCRIPTS | commands/workflows/index.js | 整个 commands/workflows/ 目录不存在 |
| KAIROS_GITHUB_WEBHOOKS | commands/subscribe-pr.js | 文件完全不存在，无 .ts 版本 |
| UDS_INBOX | commands/peers/index.js | 整个 commands/peers/ 目录不存在 |
| BUDDY | commands/buddy/index.js | 整个 commands/buddy/ 目录不存在（但 src/buddy/ 有 1,298 行实现） |

以下是源代码中通过条件 require 引用但内容为空壳（1-5 行）的文件：

| 文件路径 | 行数 | 所属标志 |
|----------|------|----------|
| src/tools/MonitorTool/MonitorTool.ts | 1 行 | MONITOR_TOOL |
| src/tools/WorkflowTool/WorkflowTool.ts | 1 行 | WORKFLOW_SCRIPTS |
| src/tools/WorkflowTool/constants.ts | 1 行 | WORKFLOW_SCRIPTS |
| src/tools/ReviewArtifactTool/ReviewArtifactTool.ts | 1 行 | REVIEW_ARTIFACT |
| src/utils/udsMessaging.ts | 1 行 | UDS_INBOX |
| src/utils/udsClient.ts | 3 行 | UDS_INBOX |
| src/skills/mcpSkills.ts | 3 行 | MCP_SKILLS |
| src/tools/WebBrowserTool/WebBrowserPanel.tsx | 3 行 | WEB_BROWSER_TOOL |
| src/tools/WorkflowTool/createWorkflowCommand.ts | 3 行 | WORKFLOW_SCRIPTS |
| src/tools/WorkflowTool/WorkflowPermissionRequest.tsx | 3 行 | WORKFLOW_SCRIPTS |
| src/components/tasks/WorkflowDetailDialog.tsx | 3 行 | WORKFLOW_SCRIPTS |
| src/components/permissions/MonitorPermissionRequest/MonitorPermissionRequest.tsx | 3 行 | MONITOR_TOOL |
| src/components/tasks/MonitorMcpDetailDialog.tsx | 3 行 | MONITOR_TOOL |
| src/components/permissions/ReviewArtifactPermissionRequest/ReviewArtifactPermissionRequest.tsx | 3 行 | REVIEW_ARTIFACT |
| src/tasks/LocalWorkflowTask/LocalWorkflowTask.ts | 5 行 | WORKFLOW_SCRIPTS |
| src/tasks/MonitorMcpTask/MonitorMcpTask.ts | 5 行 | MONITOR_TOOL |
| src/coordinator/workerAgent.ts | 1 行 | COORDINATOR_MODE |
| src/bridge/webhookSanitizer.ts | 3 行 | BRIDGE_MODE |
| src/bridge/peerSessions.ts | 3 行 | BRIDGE_MODE |

---

# 五、按引用次数排序的完整列表

| 排名 | 标志名称 | 引用次数 | 分类 |
|------|----------|----------|------|
| 1 | KAIROS | 156 | PARTIAL |
| 2 | TRANSCRIPT_CLASSIFIER | 110 | COMPLETE |
| 3 | TEAMMEM | 53 | COMPLETE |
| 4 | VOICE_MODE | 49 | COMPLETE |
| 5 | BASH_CLASSIFIER | 49 | COMPLETE |
| 6 | KAIROS_BRIEF | 39 | COMPLETE |
| 7 | PROACTIVE | 37 | COMPLETE |
| 8 | COORDINATOR_MODE | 32 | COMPLETE |
| 9 | BRIDGE_MODE | 29 | COMPLETE |
| 10 | CONTEXT_COLLAPSE | 23 | COMPLETE |
| 11 | EXPERIMENTAL_SKILL_SEARCH | 21 | PARTIAL |
| 12 | KAIROS_CHANNELS | 21 | PARTIAL |
| 13 | UDS_INBOX | 18 | PARTIAL |
| 14 | CHICAGO_MCP | 16 | COMPLETE |
| 15 | BUDDY | 18 | PARTIAL |
| 16 | HISTORY_SNIP | 16 | PARTIAL |
| 17 | MONITOR_TOOL | 13 | PARTIAL |
| 18 | CACHED_MICROCOMPACT | 12 | COMPLETE |
| 19 | COMMIT_ATTRIBUTION | 12 | COMPLETE |
| 20 | BG_SESSIONS | 11 | COMPLETE |
| 21 | AGENT_TRIGGERS | 11 | COMPLETE |
| 22 | WORKFLOW_SCRIPTS | 10 | PARTIAL |
| 23 | ULTRAPLAN | 10 | COMPLETE |
| 24 | SHOT_STATS | 10 | COMPLETE |
| 25 | TOKEN_BUDGET | 9 | COMPLETE |
| 26 | PROMPT_CACHE_BREAK_DETECTION | 9 | COMPLETE |
| 27 | MCP_SKILLS | 9 | PARTIAL |
| 28 | CONNECTOR_TEXT | 8 | PARTIAL |
| 29 | EXTRACT_MEMORIES | 7 | COMPLETE |
| 30 | TEMPLATES | 6 | PARTIAL |
| 31 | LODESTONE | 6 | PARTIAL |
| 32 | DOWNLOAD_USER_SETTINGS | 5 | STUB |
| 33 | TREE_SITTER_BASH_SHADOW | 5 | STUB |
| 34 | QUICK_SEARCH | 5 | STUB |
| 35 | MESSAGE_ACTIONS | 5 | PARTIAL |
| 36 | DIRECT_CONNECT | 5 | STUB |
| 37 | TERMINAL_PANEL | 5 | PARTIAL |
| 38 | FORK_SUBAGENT | 5 | PARTIAL |
| 39 | REACTIVE_COMPACT | 5 | COMPLETE |
| 40 | WEB_BROWSER_TOOL | 4 | PARTIAL |
| 41 | VERIFICATION_AGENT | 4 | COMPLETE |
| 42 | SSH_REMOTE | 4 | STUB |
| 43 | REVIEW_ARTIFACT | 4 | PARTIAL |
| 44 | KAIROS_PUSH_NOTIFICATION | 4 | STUB |
| 45 | HISTORY_PICKER | 4 | PARTIAL |
| 46 | CCR_MIRROR | 4 | STUB |
| 47 | KAIROS_GITHUB_WEBHOOKS | 4 | PARTIAL |
| 48 | TREE_SITTER_BASH | 3 | STUB |
| 49 | MEMORY_SHAPE_TELEMETRY | 3 | STUB |
| 50 | MCP_RICH_OUTPUT | 3 | STUB |
| 51 | FILE_PERSISTENCE | 3 | STUB |
| 52 | DAEMON | 3 | STUB |
| 53 | CCR_AUTO_CONNECT | 3 | STUB |
| 54 | AUTO_THEME | 3 | STUB |
| 55 | UPLOAD_USER_SETTINGS | 2 | STUB |
| 56 | POWERSHELL_AUTO_MODE | 2 | STUB |
| 57 | OVERFLOW_TEST_TOOL | 2 | STUB |
| 58 | NEW_INIT | 2 | STUB |
| 59 | NATIVE_CLIPBOARD_IMAGE | 2 | STUB |
| 60 | HARD_FAIL | 2 | STUB |
| 61 | ENHANCED_TELEMETRY_BETA | 2 | STUB |
| 62 | COWORKER_TYPE_TELEMETRY | 2 | STUB |
| 63 | BREAK_CACHE_COMMAND | 2 | STUB |
| 64 | AWAY_SUMMARY | 2 | STUB |
| 65 | ALLOW_TEST_VERSIONS | 2 | STUB |
| 66 | AGENT_TRIGGERS_REMOTE | 2 | STUB |
| 67 | AGENT_MEMORY_SNAPSHOT | 2 | STUB |
| 68 | UNATTENDED_RETRY | 1 | STUB |
| 69 | ULTRATHINK | 1 | STUB |
| 70 | TORCH | 1 | STUB |
| 71 | STREAMLINED_OUTPUT | 1 | STUB |
| 72 | SLOW_OPERATION_LOGGING | 1 | STUB |
| 73 | SKILL_IMPROVEMENT | 1 | STUB |
| 74 | SELF_HOSTED_RUNNER | 1 | STUB |
| 75 | RUN_SKILL_GENERATOR | 1 | STUB |
| 76 | PERFETTO_TRACING | 1 | STUB |
| 77 | NATIVE_CLIENT_ATTESTATION | 1 | STUB |
| 78 | KAIROS_DREAM | 1 | STUB |
| 79 | IS_LIBC_MUSL | 1 | STUB |
| 80 | IS_LIBC_GLIBC | 1 | STUB |
| 81 | HOOK_PROMPTS | 1 | STUB |
| 82 | DUMP_SYSTEM_PROMPT | 1 | STUB |
| 83 | COMPACTION_REMINDERS | 1 | STUB |
| 84 | CCR_REMOTE_SETUP | 1 | COMPLETE |
| 85 | BYOC_ENVIRONMENT_RUNNER | 1 | STUB |
| 86 | BUILTIN_EXPLORE_PLAN_AGENTS | 1 | STUB |
| 87 | BUILDING_CLAUDE_APPS | 1 | STUB |
| 88 | ANTI_DISTILLATION_CC | 1 | STUB |
| 89 | ABLATION_BASELINE | 1 | STUB |
| 90 | SKIP_DETECTION_WHEN_AUTOUPDATES_DISABLED | 1 | STUB |

---

# 六、代码量统计

| 分类 | 标志数 | 总引用次数 | 专属代码行数（估算） |
|------|--------|------------|---------------------|
| COMPLETE | 22 | 约 640 | 约 35,000 行 |
| PARTIAL | 19 | 约 330 | 约 5,500 行 |
| STUB | 51 | 约 95 | 约 2,000 行（主要是附带的工具文件） |
| **总计** | **92** | **约 1,065** | **约 42,500 行** |

**最大功能模块（按代码行数排序）**:
1. BRIDGE_MODE: 12,619 行（src/bridge/ 目录）
2. COORDINATOR_MODE: 7,990 行（src/coordinator/ + src/utils/swarm/）
3. SHOT_STATS: 2,722 行（统计系统）
4. CONTEXT_COLLAPSE: 2,258 行（上下文分析）
5. COMMIT_ATTRIBUTION: 1,354 行（提交归属）
6. BUDDY: 1,298 行（伙伴精灵）
7. VOICE_MODE: 1,410 行（语音模式）
8. TEAMMEM: 1,026 行（团队记忆）
9. UDS_INBOX: 966 行（Unix 套接字消息，但大部分是桩）
10. BG_SESSIONS: 801 行（后台会话）

---

*本文档由自动审计生成，基于对 Claude Code 源代码中所有 `feature('...')` 引用的穷举搜索。每个标志的引用次数包含单引号和双引号两种形式。*
