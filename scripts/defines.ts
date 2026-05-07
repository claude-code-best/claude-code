import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(__dirname, '..', 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

/**
 * Shared MACRO define map used by both dev.ts (runtime -d flags)
 * and build.ts (Bun.build define option).
 *
 * Each value is a JSON-stringified expression that replaces the
 * corresponding MACRO.* identifier at transpile / bundle time.
 *
 * VERSION is read from package.json to avoid version drift.
 */
export function getMacroDefines(): Record<string, string> {
  return {
    'MACRO.VERSION': JSON.stringify(pkg.version),
    'MACRO.BUILD_TIME': JSON.stringify(new Date().toISOString()),
    'MACRO.FEEDBACK_CHANNEL': JSON.stringify(''),
    'MACRO.ISSUES_EXPLAINER': JSON.stringify(''),
    'MACRO.NATIVE_PACKAGE_URL': JSON.stringify(''),
    'MACRO.PACKAGE_URL': JSON.stringify(''),
    'MACRO.VERSION_CHANGELOG': JSON.stringify(''),
  }
}

/**
 * Default feature flags enabled in both Bun.build and Vite builds.
 * Additional features can be enabled via FEATURE_<NAME>=1 env vars.
 *
 * Used by:
 *   - build.ts (Bun.build)
 *   - scripts/vite-plugin-feature-flags.ts (Vite/Rollup)
 *   - scripts/dev.ts (bun run dev)
 */
export const DEFAULT_BUILD_FEATURES = [
  'BUDDY', // 陪伴宠物角色（Squirtle Waddles）
  'TRANSCRIPT_CLASSIFIER', // 对话分类器，用于标注会话类型
  'BRIDGE_MODE', // Remote Control / Bridge 模式，远程控制会话
  'AGENT_TRIGGERS_REMOTE', // sessionIngress 模块级 Map 累积（非 GB 级主因）
  'CHICAGO_MCP', // Chicago MCP 集成（内部代号）
  'VOICE_MODE', // Push-to-Talk 语音输入模式
  'SHOT_STATS', // 单次请求统计信息收集
  'PROMPT_CACHE_BREAK_DETECTION', // 检测 prompt cache 是否被打破（有 10 条上限，可控）
  'TOKEN_BUDGET', // Token 预算管理与控制
  // P0: local features
  'AGENT_TRIGGERS', // 本地 Agent 触发器（工具调用时启动子代理）
  'ULTRATHINK', // 超深度思考模式，增加推理链长度
  'BUILTIN_EXPLORE_PLAN_AGENTS', // 内置 Explore/Plan 子代理类型
  'LODESTONE', // 上下文锚点，优化长对话的相关性检索
  'EXTRACT_MEMORIES', // 每次 turn 结束 fork 完整消息历史（非 GB 级主因）
  'VERIFICATION_AGENT', // 任务完成后 fork 完整消息（非 GB 级主因）
  'KAIROS_BRIEF', // Kairos 定时摘要（定时汇报当前状态）
  'AWAY_SUMMARY', // 离线摘要（用户离开后生成总结）
  'ULTRAPLAN', // 超级规划模式，深度分析后生成实施计划
  'DAEMON', // 守护进程模式，长驻 supervisor 管理后台 worker（非 GB 级主因）
  'ACP', // ACP 代理协议，支持外部 agent 接入
  'WORKFLOW_SCRIPTS', // 工作流脚本（.claude/workflows/ 中的 YAML/MD）
  'HISTORY_SNIP', // 历史消息裁剪，压缩上下文窗口
  // 'CONTEXT_COLLAPSE', // 已禁用：实现是空壳 stub，启用后会抑制 auto compact 导致上下文管理完全失效
  'MONITOR_TOOL', // Monitor 工具，流式监控后台进程输出
  // 'FORK_SUBAGENT',            // 已禁用：通过 Agent tool 的特殊方式实现了等效功能，无需再开
  'KAIROS', // Kairos 定时任务系统核心
  'COORDINATOR_MODE', // 多 worker 编排模式（AgentSummary 泄露已在 52b61c2c 修复）
  // 'UDS_INBOX', // 进程间通信管道（inbox/pipe/peers 等命令）构建后 nodejs 环境卡住
  // 'LAN_PIPES', // 局域网管道，依赖 UDS_INBOX  构建后 nodejs 环境卡住
  'BG_SESSIONS', // 后台会话管理（ps/logs/attach/kill）
  'TEMPLATES', // 模板任务（new/list/reply 子命令）
  // 'REVIEW_ARTIFACT',          // 代码审查产物（API 请求无响应，待排查 schema 兼容性）
  // API content block types
  'CONNECTOR_TEXT', // Connector 文本块类型，扩展 API 内容格式
  // Attribution tracking
  'COMMIT_ATTRIBUTION', // Git 提交归属追踪（记录 AI 辅助贡献）
  // Server mode (claude server / claude open)
  'DIRECT_CONNECT', // 直连模式（claude server / claude open）
  // Skill search & learning — feature flags compiled in (so the slash
  // commands /skill-* etc. exist), but the runtime "enabled" toggle
  // defaults to OFF (see featureCheck.ts). Operators turn on via the
  // slash-command toggle or env vars (SKILL_SEARCH_ENABLED=1,
  // SKILL_LEARNING_ENABLED=1). Rationale: bounded caches added on
  // this branch (see docs/agent/sur-skill-overflow-bugs.md) close the
  // overflow risk, but Haiku-on-first-Chinese-query and disk-side
  // observation accumulation remain operator-discretion concerns.
  'EXPERIMENTAL_SKILL_SEARCH', // 技能搜索（bounded caches 已修复 overflow，内存问题已解决）
  // 'SKILL_LEARNING',
  // P3: poor mode
  'POOR', // 穷鬼模式，跳过 extract_memories/prompt_suggestion 减少消耗
  // Team Memory
  // 'TEAMMEM',                  // 已禁用：依赖 COORDINATOR_MODE，邮箱文件无限增长
  // SSH Remote
  'SSH_REMOTE', // SSH 远程连接，本地 REPL + 远端工具执行
] as const
