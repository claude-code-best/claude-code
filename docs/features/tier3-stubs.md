# Tier 3 — 纯 Stub / N/A 低优先级 Feature 概览

> 本文档汇总所有 Tier 3 feature。这些功能要么是纯 Stub（所有函数返回空值），
> 要么是 Anthropic 内部基础设施（N/A），要么是引用量极低的辅助功能。

## 概览

| Feature | 引用 | 状态 | 类别 | 简要说明 |
|---------|------|------|------|---------|
| CHICAGO_MCP | 16 | 已实现 | 工具 | Computer Use + Chrome MCP 控制（build 默认启用） |
| MONITOR_TOOL | 13 | 已实现 | 工具 | 后台监控工具，持续监视 shell 输出（build 默认启用） |
| BG_SESSIONS | 11 | 部分实现 | 会话管理 | 后台会话注册/清理已实现，任务摘要是 stub（dev 默认启用） |
| SHOT_STATS | 10 | 已实现 | 统计 | API 调用统计面板（build 默认启用） |
| EXTRACT_MEMORIES | 7 | 已实现 | 记忆 | 自动记忆提取（build 默认启用，受 GrowthBook 门控） |
| TEMPLATES | 6 | 部分实现 | 项目管理 | 项目/提示模板系统（dev 默认启用） |
| LODESTONE | 6 | 已实现 | 深度链接 | URL 协议处理器（build 默认启用） |

## 单引用 Feature（40+ 个）

以下 feature 各只有 1 处引用，多为内部标记或实验性功能：

UNATTENDED_RETRY, ULTRATHINK, TORCH, SLOW_OPERATION_LOGGING, SKILL_IMPROVEMENT,
SELF_HOSTED_RUNNER, RUN_SKILL_GENERATOR, PERFETTO_TRACING, NATIVE_CLIENT_ATTESTATION,
KAIROS_DREAM（见 kairos.md）, IS_LIBC_MUSL, IS_LIBC_GLIBC, DUMP_SYSTEM_PROMPT,
COMPACTION_REMINDERS, CCR_REMOTE_SETUP, BYOC_ENVIRONMENT_RUNNER, BUILTIN_EXPLORE_PLAN_AGENTS,
BUILDING_CLAUDE_APPS, ANTI_DISTILLATION_CC, AGENT_TRIGGERS, ABLATION_BASELINE

## 优先级说明

这些 feature 被列为 Tier 3 的原因：

1. **已实现但影响范围小**（CHICAGO_MCP, LODESTONE, SHOT_STATS, EXTRACT_MEMORIES, MONITOR_TOOL）：已在 build/dev 默认启用，主要作为其他功能的基础设施
2. **部分实现**（BG_SESSIONS, TEMPLATES）：核心注册已实现，但部分功能如任务摘要仍是 stub
3. **辅助功能**（STREAMLINED_OUTPUT, HOOK_PROMPTS）：影响范围小
4. **CCR 系列**：依赖远程控制基础设施，需要 BRIDGE_MODE 先完善

如需深入了解某个 Tier 3 feature，可以在代码库中搜索 `feature('FEATURE_NAME')` 查看具体使用场景。
