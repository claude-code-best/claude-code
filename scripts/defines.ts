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
    'BUDDY', 'TRANSCRIPT_CLASSIFIER', 'BRIDGE_MODE',
    'AGENT_TRIGGERS_REMOTE',
    'CHICAGO_MCP',
    'VOICE_MODE',
    'SHOT_STATS',
    'PROMPT_CACHE_BREAK_DETECTION',
    'TOKEN_BUDGET',
    // P0: local features
    'AGENT_TRIGGERS',
    'ULTRATHINK',
    'BUILTIN_EXPLORE_PLAN_AGENTS',
    'LODESTONE',
    // P1: API-dependent features
    'EXTRACT_MEMORIES',
    'VERIFICATION_AGENT',
    'KAIROS_BRIEF',
    'AWAY_SUMMARY',
    'ULTRAPLAN',
    // P2: daemon + remote control server
    'DAEMON',
    // ACP (Agent Client Protocol) agent mode
    'ACP',
    // PR-package restored features
    'WORKFLOW_SCRIPTS',
    'HISTORY_SNIP',
    'CONTEXT_COLLAPSE',
    'MONITOR_TOOL',
    'FORK_SUBAGENT',
    'UDS_INBOX',
    'KAIROS',
    'COORDINATOR_MODE',
    'LAN_PIPES',
    'BG_SESSIONS',
    'TEMPLATES',
    // 'REVIEW_ARTIFACT', // API 请求无响应，需进一步排查     schema 兼容性
    // API content block types
    'CONNECTOR_TEXT',
    // Attribution tracking
    'COMMIT_ATTRIBUTION',
    // Server mode (claude server / claude open)
    'DIRECT_CONNECT',
    // Skill search
    'EXPERIMENTAL_SKILL_SEARCH',
    // P3: poor mode (disable extract_memories +     prompt_suggestion)
    'POOR',
    // Team Memory (shared memory files between agent     teammates)
    'TEAMMEM',
]as const;
