# Feature 探索计划书

> 生成日期：2026-04-02
> 代码库中已识别 89 个 feature flag，本文档按实现完整度和探索价值分级，制定探索优先级和路线图。
>
> **已完成**：BUDDY（✅ 2026-04-02）、TRANSCRIPT_CLASSIFIER / Auto Mode（✅ 2026-04-02）

---

## 一、总览

### 按实现状态分类

| 状态 | 数量 | 说明 |
|------|------|------|
| 已实现/可用 | 11 | 代码完整，开启 feature 后可运行（可能需要 OAuth 等外部依赖） |
| 部分实现 | 8 | 核心逻辑存在但关键模块为 stub，需要补全 |
| 纯 Stub | 15 | 所有函数/工具返回空值，需要从零实现 |
| N/A | 55+ | 内部基础设施、低引用量辅助功能，或反编译丢失过多 |

### 启用方式

所有 feature 通过环境变量启用：

```bash
# 单个 feature
FEATURE_BUDDY=1 bun run dev

# 多个 feature 组合
FEATURE_KAIROS=1 FEATURE_PROACTIVE=1 FEATURE_FORK_SUBAGENT=1 bun run dev
```

---

## 二、Tier 1 — 已实现/可用（优先探索）

### 2.1 KAIROS（常驻助手模式）⭐ 最高优先级

- **引用数**：154（全库最大）
- **功能**：将 CLI 变为常驻后台助手，支持：
  - 持久化 bridge 会话（跨重启复用 session）
  - 后台执行任务（用户离开终端时继续工作）
  - 推送通知到移动端（任务完成/需要输入时）
  - 每日记忆日志 + `/dream` 知识蒸馏
  - 外部频道消息接入（Slack/Discord/Telegram）
- **子 Feature**：

| 子 Feature | 引用 | 功能 |
|-----------|------|------|
| `KAIROS_BRIEF` | 39 | Brief 工具（`SendUserMessage`），结构化消息输出 |
| `KAIROS_CHANNELS` | 19 | 外部频道消息接入 |
| `KAIROS_PUSH_NOTIFICATION` | 4 | 移动端推送通知 |
| `KAIROS_GITHUB_WEBHOOKS` | 3 | GitHub PR webhook 订阅 |
| `KAIROS_DREAM` | 1 | 夜间记忆蒸馏 |

- **关键文件**：`src/assistant/`、`src/tools/BriefTool/`、`src/services/mcp/channelNotification.ts`、`src/memdir/memdir.ts`
- **外部依赖**：Anthropic OAuth（claude.ai 订阅）、GrowthBook 特性门控
- **探索命令**：`FEATURE_KAIROS=1 FEATURE_KAIROS_BRIEF=1 FEATURE_PROACTIVE=1 bun run dev`

**探索步骤**：
1. 开启 feature，观察启动行为变化
2. 测试 `/assistant`、`/brief` 命令
3. 验证 BriefTool 输出模式
4. 尝试频道消息接入
5. 测试 `/dream` 记忆蒸馏

---

### ~~2.2 TRANSCRIPT_CLASSIFIER（Auto Mode 分类器）~~ ✅ 已完成

- **引用数**：108
- **功能**：使用 LLM 对用户意图进行分类，实现 auto mode（自动决定工具权限）
- **状态**：✅ prompt 模板已重建，功能完整可用（2026-04-02 完成）

---

### 2.3 VOICE_MODE（语音输入）

- **引用数**：46
- **功能**：按键说话（Push-to-Talk），音频流式传输到 Anthropic STT 端点（Nova 3），实时转录显示
- **当前状态**：**完整实现**，包括录音、WebSocket 流、转录插入
- **关键文件**：`src/voice/voiceModeEnabled.ts`、`src/hooks/useVoice.ts`、`src/services/voiceStreamSTT.ts`
- **外部依赖**：Anthropic OAuth（非 API key）、macOS 原生音频或 SoX
- **探索命令**：`FEATURE_VOICE_MODE=1 bun run dev`
- **默认快捷键**：长按空格键录音

**探索步骤**：
1. 确认 OAuth token 可用
2. 测试按住空格录音 → 释放后转录
3. 验证实时中间转录显示
4. 测试 `/voice` 命令切换

---

### 2.4 TEAMMEM（团队共享记忆）

- **引用数**：51
- **功能**：基于 GitHub 仓库的团队共享记忆系统，`memory/team/` 目录双向同步到 Anthropic 服务器
- **当前状态**：**完整实现**，包括增量同步、冲突解决、密钥扫描、路径穿越防护
- **关键文件**：`src/services/teamMemorySync/`（index、watcher、secretScanner）、`src/memdir/teamMemPaths.ts`
- **外部依赖**：Anthropic OAuth + GitHub remote（`getGithubRepo()`）
- **探索命令**：`FEATURE_TEAMMEM=1 bun run dev`

**探索步骤**：
1. 确认项目有 GitHub remote
2. 开启后观察 `memory/team/` 目录创建
3. 测试团队记忆写入和同步
4. 验证密钥扫描防护

---

### 2.5 COORDINATOR_MODE（多 Agent 编排）

- **引用数**：32
- **功能**：CLI 变为编排者，通过 AgentTool 派发任务给多个 worker 并行执行
- **当前状态**：核心逻辑实现，worker agent 模块为 stub
- **关键文件**：`src/coordinator/coordinatorMode.ts`（系统 prompt 完整）、`src/coordinator/workerAgent.ts`（stub）
- **限制**：编排者只能使用 AgentTool/TaskStop/SendMessage，不能直接操作文件
- **探索命令**：`FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev`

**探索步骤**：
1. 补全 `workerAgent.ts` stub
2. 测试多 worker 并行任务派发
3. 验证 worker 结果汇总

---

### 2.6 BRIDGE_MODE（远程控制）

- **引用数**：28
- **功能**：本地 CLI 注册为 bridge 环境，可从 claude.ai 或其他控制面远程驱动
- **当前状态**：v1（env-based）和 v2（env-less）实现均存在
- **关键文件**：`src/bridge/bridgeEnabled.ts`、`src/bridge/replBridge.ts`（v1）、`src/bridge/remoteBridgeCore.ts`（v2）
- **外部依赖**：claude.ai OAuth、GrowthBook 门控 `tengu_ccr_bridge`
- **探索命令**：`FEATURE_BRIDGE_MODE=1 bun run dev`

---

### 2.7 FORK_SUBAGENT（上下文继承子 Agent）

- **引用数**：4
- **功能**：AgentTool 生成 fork 子 agent，继承父级完整对话上下文，优化 prompt cache
- **当前状态**：**完整实现**（`forkSubagent.ts`），支持 worktree 隔离通知、递归防护
- **关键文件**：`src/tools/AgentTool/forkSubagent.ts`
- **探索命令**：`FEATURE_FORK_SUBAGENT=1 bun run dev`

---

### 2.8 TOKEN_BUDGET（Token 预算控制）

- **引用数**：9
- **功能**：解析用户指定的 token 预算（如 "spend 2M tokens"），自动持续工作直到达到目标
- **当前状态**：解析器**完整实现**，支持简写和详细语法；QueryEngine 中的周转逻辑已连接
- **关键文件**：`src/utils/tokenBudget.ts`、`src/QueryEngine.ts`
- **探索命令**：`FEATURE_TOKEN_BUDGET=1 bun run dev`

---

### 2.9 MCP_SKILLS（MCP 技能发现）

- **引用数**：9
- **功能**：将 MCP 服务器提供的 prompt 类型命令筛选为可调用技能
- **当前状态**：**功能性实现**（config 门控筛选器）
- **关键文件**：`src/commands.ts`（`getMcpSkillCommands()`）
- **探索命令**：`FEATURE_MCP_SKILLS=1 bun run dev`

---

### 2.10 TREE_SITTER_BASH（Bash AST 解析）

- **引用数**：3
- **功能**：纯 TypeScript bash 命令 AST 解析器，用于 fail-closed 权限匹配
- **当前状态**：**完整实现**（`bashParser.ts` ~2000行 + `ast.ts` ~400行）
- **关键文件**：`src/utils/vendor/tree-sitter-bash/`
- **探索命令**：`FEATURE_TREE_SITTER_BASH=1 bun run dev`

---

### ~~2.11 BUDDY（虚拟伙伴）~~ ✅ 已完成

- **引用数**：16
- **功能**：`/buddy` 命令，支持 hatch/rehatch/pet/mute/unmute
- **状态**：✅ 已合入，功能完整可用（2026-04-02 完成）

---

## 三、Tier 2 — 部分实现（需要补全）

### 3.1 PROACTIVE（主动模式）

- **引用数**：37
- **功能**：Tick 驱动的自主代理，定时唤醒执行工作，配合 SleepTool 控制节奏
- **当前状态**：核心模块 `src/proactive/index.ts` **全部 stub**（activate/deactivate/pause 返回 false 或空操作）
- **依赖**：与 KAIROS 强绑定（所有检查都是 `feature('PROACTIVE') || feature('KAIROS')`）
- **补全工作量**：中等 — 需要实现 tick 生成、SleepTool 集成、暂停/恢复逻辑

### 3.2 BASH_CLASSIFIER（Bash 命令分类器）

- **引用数**：45
- **功能**：LLM 驱动的 bash 命令意图分类（允许/拒绝/询问）
- **当前状态**：`bashClassifier.ts` **全部 stub**（`matches: false`）
- **补全工作量**：大 — 需要 LLM 调用实现、prompt 设计

### 3.3 ULTRAPLAN（增强规划）

- **引用数**：10
- **功能**：关键字触发增强计划模式，输入 "ultraplan" 自动转为 plan
- **当前状态**：关键字检测**完整实现**，`/ultraplan` 命令**为 stub**
- **补全工作量**：小 — 只需实现命令处理逻辑

### 3.4 EXPERIMENTAL_SKILL_SEARCH（技能语义搜索）

- **引用数**：21
- **功能**：DiscoverSkills 工具，根据当前任务语义搜索可用技能
- **当前状态**：布线完整，核心搜索逻辑 stub
- **补全工作量**：中等 — 需要实现搜索引擎和索引

### 3.5 CONTEXT_COLLAPSE（上下文折叠）

- **引用数**：20
- **功能**：CtxInspectTool 让模型内省上下文窗口大小，优化压缩决策
- **当前状态**：工具 stub，HISTORY_SNIP 子功能也 stub
- **补全工作量**：中等

### 3.6 WORKFLOW_SCRIPTS（工作流自动化）

- **引用数**：10
- **功能**：基于文件的自动化工作流 + `/workflows` 命令
- **当前状态**：WorkflowTool、命令、加载器全部 stub
- **补全工作量**：大 — 需要从零设计工作流 DSL

### 3.7 WEB_BROWSER_TOOL（浏览器工具）

- **引用数**：4
- **功能**：模型可调用浏览器工具导航和交互网页
- **当前状态**：工具注册存在，实现 stub
- **补全工作量**：大

### 3.8 DAEMON（后台守护进程）

- **引用数**：3
- **功能**：后台守护进程 + 远程控制服务器
- **当前状态**：只有条件导入布线，无实现
- **补全工作量**：极大

---

## 四、Tier 3 — 纯 Stub / N/A（低优先级）

| Feature | 引用 | 状态 | 说明 |
|---------|------|------|------|
| CHICAGO_MCP | 16 | N/A | Anthropic 内部 MCP 基础设施 |
| UDS_INBOX | 17 | Experimental | 本机 UDS 消息层 + 本机 named-pipe 协调层 |
| MONITOR_TOOL | 13 | Stub | 文件/进程监控工具 |
| BG_SESSIONS | 11 | Stub | 后台会话管理 |
| SHOT_STATS | 10 | 无实现 | 逐 prompt 统计 |
| EXTRACT_MEMORIES | 7 | 无实现 | 自动记忆提取 |
| TEMPLATES | 6 | Stub | 项目/提示模板 |
| LODESTONE | 6 | N/A | 内部基础设施 |
| STREAMLINED_OUTPUT | 1 | — | 精简输出模式 |
| HOOK_PROMPTS | 1 | — | Hook 提示词 |
| CCR_AUTO_CONNECT | 3 | — | CCR 自动连接 |
| CCR_MIRROR | 4 | — | CCR 镜像模式 |
| CCR_REMOTE_SETUP | 1 | — | CCR 远程设置 |
| NATIVE_CLIPBOARD_IMAGE | 2 | — | 原生剪贴板图片 |
| CONNECTOR_TEXT | 7 | — | 连接器文本 |

以及其余 40+ 个低引用量 feature。

---

## 五、探索路线图

### Phase 1：快速验证（无外部依赖）

> 目标：确认代码可以正常运行，体验基本功能

| 优先级 | Feature | 命令 | 预期效果 |
|--------|---------|------|----------|
| 1 | BUDDY | `FEATURE_BUDDY=1 bun run dev` | `/buddy hatch` 生成伙伴 |
| 2 | FORK_SUBAGENT | `FEATURE_FORK_SUBAGENT=1 bun run dev` | Agent 可生成上下文继承的子任务 |
| 3 | TOKEN_BUDGET | `FEATURE_TOKEN_BUDGET=1 bun run dev` | 输入 "spend 500k tokens" 测试自动持续 |
| 4 | TREE_SITTER_BASH | `FEATURE_TREE_SITTER_BASH=1 bun run dev` | 更精确的 bash 权限匹配 |
| 5 | MCP_SKILLS | `FEATURE_MCP_SKILLS=1 bun run dev` | MCP 服务器 prompt 提升为技能 |

### Phase 2：核心功能探索（需要 OAuth）

> 目标：体验 KAIROS 全套能力

| 优先级 | Feature | 命令 | 预期效果 |
|--------|---------|------|----------|
| 1 | TRANSCRIPT_CLASSIFIER | `FEATURE_TRANSCRIPT_CLASSIFIER=1 bun run dev` | Auto mode 自动激活 |
| 2 | KAIROS 全套 | `FEATURE_KAIROS=1 FEATURE_KAIROS_BRIEF=1 FEATURE_KAIROS_CHANNELS=1 FEATURE_PROACTIVE=1 bun run dev` | 常驻助手 + Brief 输出 + 频道消息 |
| 3 | VOICE_MODE | `FEATURE_VOICE_MODE=1 bun run dev` | 按空格说话 |
| 4 | TEAMMEM | `FEATURE_TEAMMEM=1 bun run dev` | 团队记忆同步 |
| 5 | COORDINATOR_MODE | `FEATURE_COORDINATOR_MODE=1 CLAUDE_CODE_COORDINATOR_MODE=1 bun run dev` | 多 agent 编排 |

### Phase 3：Stub 补全开发

> 目标：将高价值 stub 实现为可用功能

| 优先级 | Feature | 补全难度 | 价值 |
|--------|---------|----------|------|
| 1 | PROACTIVE | 中 | 自主工作能力 |
| 2 | ULTRAPLAN | 小 | 增强规划 |
| 3 | CONTEXT_COLLAPSE | 中 | 长对话优化 |
| 4 | EXPERIMENTAL_SKILL_SEARCH | 中 | 技能发现 |
| 5 | BASH_CLASSIFIER | 大 | 安全增强 |

---

## 六、推荐组合方案

### "全功能助手"组合

```bash
FEATURE_KAIROS=1 \
FEATURE_KAIROS_BRIEF=1 \
FEATURE_KAIROS_CHANNELS=1 \
FEATURE_KAIROS_PUSH_NOTIFICATION=1 \
FEATURE_PROACTIVE=1 \
FEATURE_FORK_SUBAGENT=1 \
FEATURE_TOKEN_BUDGET=1 \
FEATURE_TRANSCRIPT_CLASSIFIER=1 \
FEATURE_BUDDY=1 \
bun run dev
```

### "多 Agent 协作"组合

```bash
FEATURE_COORDINATOR_MODE=1 \
FEATURE_FORK_SUBAGENT=1 \
FEATURE_BRIDGE_MODE=1 \
FEATURE_BG_SESSIONS=1 \
CLAUDE_CODE_COORDINATOR_MODE=1 \
bun run dev
```

### "开发者增强"组合

```bash
FEATURE_TRANSCRIPT_CLASSIFIER=1 \
FEATURE_TREE_SITTER_BASH=1 \
FEATURE_TOKEN_BUDGET=1 \
FEATURE_MCP_SKILLS=1 \
FEATURE_CONTEXT_COLLAPSE=1 \
bun run dev
```

---

## 七、风险与注意事项

1. **OAuth 依赖**：KAIROS、VOICE_MODE、TEAMMEM、BRIDGE_MODE 需要 Anthropic OAuth 认证（claude.ai 订阅），API key 用户无法使用
2. **GrowthBook 门控**：部分功能（VOICE_MODE 的 `tengu_cobalt_frost`、TEAMMEM 的 `tengu_herring_clock`）即使 feature flag 开启，还需要服务端 GrowthBook 开关
3. **反编译不完整**：所有"已实现"功能均为反编译产物，可能存在运行时错误，需要逐个验证
4. **Proactive stub**：KAIROS 的自主工作能力依赖 PROACTIVE，但 PROACTIVE 核心是 stub，需先补全
5. **tsc 错误**：代码库有 ~1341 个 TypeScript 编译错误（来自反编译），不影响 Bun 运行时但在 IDE 中会有大量红线

---

## 附录：Feature Flag 完整列表

共 89 个 feature flag（按引用数降序）：

| Feature | 引用 | Tier |
|---------|------|------|
| KAIROS | 154 | 1 |
| TRANSCRIPT_CLASSIFIER | 108 | 1 |
| TEAMMEM | 51 | 1 |
| VOICE_MODE | 46 | 1 |
| BASH_CLASSIFIER | 45 | 2 |
| KAIROS_BRIEF | 39 | 1 |
| PROACTIVE | 37 | 2 |
| COORDINATOR_MODE | 32 | 1 |
| BRIDGE_MODE | 28 | 1 |
| EXPERIMENTAL_SKILL_SEARCH | 21 | 2 |
| CONTEXT_COLLAPSE | 20 | 2 |
| KAIROS_CHANNELS | 19 | 1 |
| UDS_INBOX | 17 | 3 |
| CHICAGO_MCP | 16 | 3 |
| BUDDY | 16 | 1 |
| HISTORY_SNIP | 15 | 2 |
| MONITOR_TOOL | 13 | 3 |
| COMMIT_ATTRIBUTION | 12 | — |
| CACHED_MICROCOMPACT | 12 | — |
| BG_SESSIONS | 11 | 3 |
| WORKFLOW_SCRIPTS | 10 | 2 |
| ULTRAPLAN | 10 | 2 |
| SHOT_STATS | 10 | 3 |
| TOKEN_BUDGET | 9 | 1 |
| PROMPT_CACHE_BREAK_DETECTION | 9 | — |
| MCP_SKILLS | 9 | 1 |
| EXTRACT_MEMORIES | 7 | 3 |
| CONNECTOR_TEXT | 7 | — |
| TEMPLATES | 6 | 3 |
| LODESTONE | 6 | 3 |
| TREE_SITTER_BASH_SHADOW | 5 | — |
| QUICK_SEARCH | 5 | — |
| MESSAGE_ACTIONS | 5 | — |
| DOWNLOAD_USER_SETTINGS | 5 | — |
| DIRECT_CONNECT | 5 | — |
| WEB_BROWSER_TOOL | 4 | 2 |
| VERIFICATION_AGENT | 4 | — |
| TERMINAL_PANEL | 4 | — |
| SSH_REMOTE | 4 | — |
| REVIEW_ARTIFACT | 4 | — |
| REACTIVE_COMPACT | 4 | — |
| KAIROS_PUSH_NOTIFICATION | 4 | 1 |
| HISTORY_PICKER | 4 | — |
| FORK_SUBAGENT | 4 | 1 |
| CCR_MIRROR | 4 | — |
| TREE_SITTER_BASH | 3 | 1 |
| MEMORY_SHAPE_TELEMETRY | 3 | — |
| MCP_RICH_OUTPUT | 3 | — |
| KAIROS_GITHUB_WEBHOOKS | 3 | 1 |
| FILE_PERSISTENCE | 3 | — |
| DAEMON | 3 | 2 |
| CCR_AUTO_CONNECT | 3 | — |
| UPLOAD_USER_SETTINGS | 2 | — |
| POWERSHELL_AUTO_MODE | 2 | — |
| OVERFLOW_TEST_TOOL | 2 | — |
| NEW_INIT | 2 | — |
| NATIVE_CLIPBOARD_IMAGE | 2 | — |
| HARD_FAIL | 2 | — |
| ENHANCED_TELEMETRY_BETA | 2 | — |
| COWORKER_TYPE_TELEMETRY | 2 | — |
| BREAK_CACHE_COMMAND | 2 | — |
| AWAY_SUMMARY | 2 | — |
| AUTO_THEME | 2 | — |
| ALLOW_TEST_VERSIONS | 2 | — |
| AGENT_TRIGGERS_REMOTE | 2 | — |
| AGENT_MEMORY_SNAPSHOT | 2 | — |
| UNATTENDED_RETRY | 1 | — |
| ULTRATHINK | 1 | — |
| TORCH | 1 | — |
| STREAMLINED_OUTPUT | 1 | — |
| SLOW_OPERATION_LOGGING | 1 | — |
| SKILL_IMPROVEMENT | 1 | — |
| SELF_HOSTED_RUNNER | 1 | — |
| RUN_SKILL_GENERATOR | 1 | — |
| PERFETTO_TRACING | 1 | — |
| NATIVE_CLIENT_ATTESTATION | 1 | — |
| KAIROS_DREAM | 1 | 1 |
| IS_LIBC_MUSL | 1 | — |
| IS_LIBC_GLIBC | 1 | — |
| HOOK_PROMPTS | 1 | — |
| DUMP_SYSTEM_PROMPT | 1 | — |
| COMPACTION_REMINDERS | 1 | — |
| CCR_REMOTE_SETUP | 1 | — |
| BYOC_ENVIRONMENT_RUNNER | 1 | — |
| BUILTIN_EXPLORE_PLAN_AGENTS | 1 | — |
| BUILDING_CLAUDE_APPS | 1 | — |
| ANTI_DISTILLATION_CC | 1 | — |
| AGENT_TRIGGERS | 1 | — |
| ABLATION_BASELINE | 1 | — |
