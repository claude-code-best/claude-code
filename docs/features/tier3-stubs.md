# Tier 3 — 纯 Stub / N/A 低优先级 Feature 概览

> 本文档汇总所有 Tier 3 feature。这些功能要么是纯 Stub（所有函数返回空值），
> 要么是 Anthropic 内部基础设施（N/A），要么是引用量极低的辅助功能。

## 概览

| Feature | 引用 | 状态 | 类别 | 简要说明 |
|---------|------|------|------|---------|
| CHICAGO_MCP | 16 | N/A | 内部基础设施 | Anthropic 内部 MCP 基础设施，非外部可用 |
| MONITOR_TOOL | 13 | Stub | 工具 | 文件/进程监控工具，检测变更并通知 |
| BG_SESSIONS | 11 | Stub | 会话管理 | 后台会话管理，支持多会话并行 |
| SHOT_STATS | 10 | 无实现 | 统计 | 逐 prompt 统计信息收集 |
| EXTRACT_MEMORIES | 7 | 无实现 | 记忆 | 自动从对话中提取重要信息作为记忆 |
| TEMPLATES | 6 | Stub | 项目管理 | 项目/提示模板系统 |
| LODESTONE | 6 | N/A | 内部基础设施 | 内部基础设施模块 |
| STREAMLINED_OUTPUT | 1 | — | 输出 | 精简输出模式，减少终端输出量 |
| HOOK_PROMPTS | 1 | — | 钩子 | Hook 提示词，自定义钩子的提示注入 |
| CCR_AUTO_CONNECT | 3 | — | 远程控制 | CCR 自动连接，自动建立远程控制会话 |
| CCR_MIRROR | 4 | — | 远程控制 | CCR 镜像模式，会话状态同步 |
| CCR_REMOTE_SETUP | 1 | — | 远程控制 | CCR 远程设置，初始化远程控制配置 |
| NATIVE_CLIPBOARD_IMAGE | 2 | — | 系统集成 | 原生剪贴板图片，从剪贴板读取图片 |
| CONNECTOR_TEXT | 7 | — | 连接器 | 连接器文本，外部系统文本适配 |
| COMMIT_ATTRIBUTION | 12 | — | Git | Commit 归因，标记 commit 来源 |
| CACHED_MICROCOMPACT | 12 | — | 压缩 | 缓存微压缩，优化 compaction 性能 |
| PROMPT_CACHE_BREAK_DETECTION | 9 | — | 性能 | Prompt cache 中断检测，监控 cache miss |
| MEMORY_SHAPE_TELEMETRY | 3 | — | 遥测 | 记忆形态遥测，记忆使用模式追踪 |
| MCP_RICH_OUTPUT | 3 | — | MCP | MCP 富输出，增强 MCP 工具输出格式 |
| FILE_PERSISTENCE | 3 | — | 持久化 | 文件持久化，跨会话保持状态 |
| TREE_SITTER_BASH_SHADOW | 5 | Shadow | 安全 | Bash AST Shadow 模式（见 tree-sitter-bash.md） |
| QUICK_SEARCH | 5 | — | 搜索 | 快速搜索，优化的文件/内容搜索 |
| MESSAGE_ACTIONS | 5 | — | UI | 消息操作，对消息执行后处理动作 |
| DOWNLOAD_USER_SETTINGS | 5 | — | 配置 | 下载用户设置，从服务端同步配置 |
| DIRECT_CONNECT | 5 | — | 网络 | 直连模式，绕过代理直接连接 API |
| VERIFICATION_AGENT | 4 | — | Agent | 验证 Agent，专门用于验证代码变更 |
| TERMINAL_PANEL | 4 | — | UI | 终端面板，嵌入式终端输出显示 |
| SSH_REMOTE | 4 | — | 远程 | SSH 远程，通过 SSH 连接远程 Claude |
| REVIEW_ARTIFACT | 4 | — | 审查 | Review Artifact，代码审查产出物 |
| REACTIVE_COMPACT | 4 | — | 压缩 | 响应式压缩，基于上下文变化触发 compaction |
| HISTORY_PICKER | 4 | — | UI | 历史选择器，浏览和选择历史对话 |
| UPLOAD_USER_SETTINGS | 2 | — | 配置 | 上传用户设置，同步配置到服务端 |
| POWERSHELL_AUTO_MODE | 2 | — | 平台 | PowerShell 自动模式，Windows 权限自动化 |
| OVERFLOW_TEST_TOOL | 2 | — | 测试 | 溢出测试工具，测试上下文溢出处理 |
| NEW_INIT | 2 | — | 初始化 | 新版初始化流程 |
| HARD_FAIL | 2 | — | 错误处理 | 硬失败模式，不可恢复错误直接终止 |
| ENHANCED_TELEMETRY_BETA | 2 | — | 遥测 | 增强遥测 Beta，详细的性能指标收集 |
| COWORKER_TYPE_TELEMETRY | 2 | — | 遥测 | 协作者类型遥测，追踪协作模式 |
| BREAK_CACHE_COMMAND | 2 | — | 缓存 | 中断缓存命令，强制刷新 prompt cache |
| AWAY_SUMMARY | 2 | — | 摘要 | 离开摘要，用户返回时总结期间工作 |
| AUTO_THEME | 2 | — | UI | 自动主题，根据终端设置切换主题 |
| ALLOW_TEST_VERSIONS | 2 | — | 版本 | 允许测试版本，跳过版本检查 |
| AGENT_TRIGGERS_REMOTE | 2 | — | Agent | Agent 远程触发，从远程触发 Agent 任务 |
| AGENT_MEMORY_SNAPSHOT | 2 | — | Agent | Agent 记忆快照，保存/恢复 Agent 状态 |

## 单引用 Feature（40+ 个）

以下 feature 各只有 1 处引用，多为内部标记或实验性功能：

UNATTENDED_RETRY, ULTRATHINK, TORCH, SLOW_OPERATION_LOGGING, SKILL_IMPROVEMENT,
SELF_HOSTED_RUNNER, RUN_SKILL_GENERATOR, PERFETTO_TRACING, NATIVE_CLIENT_ATTESTATION,
KAIROS_DREAM（见 kairos.md）, IS_LIBC_MUSL, IS_LIBC_GLIBC, DUMP_SYSTEM_PROMPT,
COMPACTION_REMINDERS, CCR_REMOTE_SETUP, BYOC_ENVIRONMENT_RUNNER, BUILTIN_EXPLORE_PLAN_AGENTS,
BUILDING_CLAUDE_APPS, ANTI_DISTILLATION_CC, AGENT_TRIGGERS, ABLATION_BASELINE

## 优先级说明

这些 feature 被列为 Tier 3 的原因：

1. **内部基础设施**（CHICAGO_MCP, LODESTONE）：Anthropic 内部使用，外部无法运行
2. **纯 Stub 且引用低**（MONITOR_TOOL, BG_SESSIONS）：需要大量工作才能实现
3. **实验性功能**（SHOT_STATS, EXTRACT_MEMORIES）：尚在概念阶段
4. **辅助功能**（STREAMLINED_OUTPUT, HOOK_PROMPTS）：影响范围小
5. **CCR 系列**：依赖远程控制基础设施，需要 BRIDGE_MODE 先完善

如需深入了解某个 Tier 3 feature，可以在代码库中搜索 `feature('FEATURE_NAME')` 查看具体使用场景。
