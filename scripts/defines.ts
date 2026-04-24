/**
 * Shared MACRO define map used by both dev.ts (runtime -d flags)
 * and build.ts (Bun.build define option).
 *
 * Each value is a JSON-stringified expression that replaces the
 * corresponding MACRO.* identifier at transpile / bundle time.
 */
export function getMacroDefines(): Record<string, string> {
    return {
        "MACRO.VERSION": JSON.stringify("2.1.888"),
        "MACRO.BUILD_TIME": JSON.stringify(new Date().toISOString()),
        "MACRO.FEEDBACK_CHANNEL": JSON.stringify(""),
        "MACRO.ISSUES_EXPLAINER": JSON.stringify(""),
        "MACRO.NATIVE_PACKAGE_URL": JSON.stringify(""),
        "MACRO.PACKAGE_URL": JSON.stringify(""),
        "MACRO.VERSION_CHANGELOG": JSON.stringify(""),
    };
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
    'BUDDY',                       // 陪伴宠物角色（Squirtle Waddles）
    'TRANSCRIPT_CLASSIFIER',       // 对话分类器，用于标注会话类型
    'BRIDGE_MODE',                 // Remote Control / Bridge 模式，远程控制会话
    'AGENT_TRIGGERS_REMOTE',       // Agent 触发远程会话连接
    'CHICAGO_MCP',                 // Chicago MCP 集成（内部代号）
    'VOICE_MODE',                  // Push-to-Talk 语音输入模式
    'SHOT_STATS',                  // 单次请求统计信息收集
    'PROMPT_CACHE_BREAK_DETECTION', // 检测 prompt cache 是否被打破
    'TOKEN_BUDGET',                // Token 预算管理与控制
    // P0: local features
    'AGENT_TRIGGERS',              // 本地 Agent 触发器（工具调用时启动子代理）
    'ULTRATHINK',                  // 超深度思考模式，增加推理链长度
    'BUILTIN_EXPLORE_PLAN_AGENTS', // 内置 Explore/Plan 子代理类型
    'LODESTONE',                   // 上下文锚点，优化长对话的相关性检索
    'EXTRACT_MEMORIES',            // 自动从对话中提取并持久化记忆
    'VERIFICATION_AGENT',          // 验证代理，任务完成后自动校验结果
    'KAIROS_BRIEF',                // Kairos 定时摘要（定时汇报当前状态）
    'AWAY_SUMMARY',                // 离线摘要（用户离开后生成总结）
    'ULTRAPLAN',                   // 超级规划模式，深度分析后生成实施计划
    // 'DAEMON',                   // 守护进程模式，长驻 supervisor 管理后台 worker（已禁用：内存占用过高）
    'ACP',                         // ACP 代理协议，支持外部 agent 接入
    'WORKFLOW_SCRIPTS',            // 工作流脚本（.claude/workflows/ 中的 YAML/MD）
    'HISTORY_SNIP',                // 历史消息裁剪，压缩上下文窗口
    'CONTEXT_COLLAPSE',            // 上下文折叠，自动压缩旧消息
    'MONITOR_TOOL',                // Monitor 工具，流式监控后台进程输出
    'FORK_SUBAGENT',               // Fork 子代理，在隔离上下文中并行执行任务
    'UDS_INBOX',                   // Unix Domain Socket 收件箱，跨会话消息传递
    'KAIROS',                      // Kairos 定时任务系统核心
    'COORDINATOR_MODE',            // 协调者模式，多代理团队任务调度
    'LAN_PIPES',                   // 局域网管道，LAN 设备间通信
    'BG_SESSIONS',                 // 后台会话管理（ps/logs/attach/kill）
    'TEMPLATES',                   // 模板任务（new/list/reply 子命令）
    // 'REVIEW_ARTIFACT',          // 代码审查产物（API 请求无响应，待排查 schema 兼容性）
    // API content block types
    'CONNECTOR_TEXT',              // Connector 文本块类型，扩展 API 内容格式
    // Attribution tracking
    'COMMIT_ATTRIBUTION',          // Git 提交归属追踪（记录 AI 辅助贡献）
    // Server mode (claude server / claude open)
    'DIRECT_CONNECT',              // 直连模式（claude server / claude open）
    // Skill search
    'EXPERIMENTAL_SKILL_SEARCH',   // 实验性技能搜索（DiscoverSkills）
    // P3: poor mode
    'POOR',                        // 穷鬼模式，跳过 extract_memories/prompt_suggestion 减少消耗
    // Team Memory
    'TEAMMEM',                     // 团队记忆，代理队友间共享记忆文件
]as const;
