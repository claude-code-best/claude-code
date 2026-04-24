/**
 * dump-prompt.ts — 生成完整 system prompt 用于人工检查格式和内容。
 * Usage: bun run scripts/dump-prompt.ts
 */
import { mock } from 'bun:test'

// --- Mock chain (block side-effects) ---
mock.module('src/bootstrap/state.js', () => ({
  getIsNonInteractiveSession: () => false,
  sessionId: 'test-session',
  getCwd: () => '/test/project',
}))
mock.module('src/utils/cwd.js', () => ({ getCwd: () => '/test/project' }))
mock.module('src/utils/git.js', () => ({ getIsGit: async () => true }))
mock.module('src/utils/worktree.js', () => ({
  getCurrentWorktreeSession: () => null,
}))
mock.module('src/constants/common.js', () => ({
  getSessionStartDate: () => '2026-04-22',
}))
mock.module('src/utils/settings/settings.js', () => ({
  getInitialSettings: () => ({ language: undefined }),
}))
mock.module('src/commands/poor/poorMode.js', () => ({
  isPoorModeActive: () => false,
}))
mock.module('src/utils/env.js', () => ({ env: { platform: 'linux' } }))
mock.module('src/utils/envUtils.js', () => ({ isEnvTruthy: () => false }))
mock.module('src/utils/model/model.js', () => ({
  getCanonicalName: (id: string) => id,
  getMarketingNameForModel: (id: string) => {
    if (id.includes('opus-4-7')) return 'Claude Opus 4.7'
    if (id.includes('opus-4-6')) return 'Claude Opus 4.6'
    if (id.includes('sonnet-4-6')) return 'Claude Sonnet 4.6'
    return null
  },
}))
mock.module('src/commands.js', () => ({
  getSkillToolCommands: async () => [],
}))
mock.module('src/constants/outputStyles.js', () => ({
  getOutputStyleConfig: async () => null,
}))
mock.module('src/utils/embeddedTools.js', () => ({
  hasEmbeddedSearchTools: () => false,
}))
mock.module('src/utils/permissions/filesystem.js', () => ({
  isScratchpadEnabled: () => false,
  getScratchpadDir: () => '/tmp/scratchpad',
}))
mock.module('src/utils/betas.js', () => ({
  shouldUseGlobalCacheScope: () => false,
}))
mock.module('src/utils/undercover.js', () => ({ isUndercover: () => false }))
mock.module('src/utils/model/antModels.js', () => ({
  getAntModelOverrideConfig: () => null,
}))
mock.module('src/utils/mcpInstructionsDelta.js', () => ({
  isMcpInstructionsDeltaEnabled: () => false,
}))
mock.module('src/memdir/memdir.js', () => ({
  loadMemoryPrompt: async () => null,
}))
mock.module('src/utils/debug.js', () => ({ logForDebugging: () => {} }))
mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => false,
}))
mock.module('bun:bundle', () => ({ feature: (_name: string) => false }))
mock.module('src/constants/systemPromptSections.js', () => ({
  systemPromptSection: (_name: string, fn: () => any) => ({
    __deferred: true,
    fn,
  }),
  DANGEROUS_uncachedSystemPromptSection: (
    _name: string,
    fn: () => any,
  ) => ({ __deferred: true, fn }),
  resolveSystemPromptSections: async (sections: any[]) => {
    const results = await Promise.all(
      sections.map((s: any) => (s?.__deferred ? s.fn() : s)),
    )
    return results.filter((s: any) => s !== null)
  },
}))

// Tool name mocks
mock.module(
  '@claude-code-best/builtin-tools/tools/BashTool/toolName.js',
  () => ({ BASH_TOOL_NAME: 'Bash' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/FileReadTool/prompt.js',
  () => ({ FILE_READ_TOOL_NAME: 'Read' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/FileEditTool/constants.js',
  () => ({ FILE_EDIT_TOOL_NAME: 'Edit' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/FileWriteTool/prompt.js',
  () => ({ FILE_WRITE_TOOL_NAME: 'Write' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/GlobTool/prompt.js',
  () => ({ GLOB_TOOL_NAME: 'Glob' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/GrepTool/prompt.js',
  () => ({ GREP_TOOL_NAME: 'Grep' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/constants.js',
  () => ({ AGENT_TOOL_NAME: 'Agent', VERIFICATION_AGENT_TYPE: 'verification' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/forkSubagent.js',
  () => ({ isForkSubagentEnabled: () => false }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/builtInAgents.js',
  () => ({ areExplorePlanAgentsEnabled: () => false }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/built-in/exploreAgent.js',
  () => ({
    EXPLORE_AGENT: { agentType: 'explore' },
    EXPLORE_AGENT_MIN_QUERIES: 5,
  }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/AskUserQuestionTool/prompt.js',
  () => ({ ASK_USER_QUESTION_TOOL_NAME: 'AskUserQuestion' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/TodoWriteTool/constants.js',
  () => ({ TODO_WRITE_TOOL_NAME: 'TodoWrite' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/TaskCreateTool/constants.js',
  () => ({ TASK_CREATE_TOOL_NAME: 'TaskCreate' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/DiscoverSkillsTool/prompt.js',
  () => ({ DISCOVER_SKILLS_TOOL_NAME: 'DiscoverSkills' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/SkillTool/constants.js',
  () => ({ SKILL_TOOL_NAME: 'Skill' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/SleepTool/prompt.js',
  () => ({ SLEEP_TOOL_NAME: 'Sleep' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/REPLTool/constants.js',
  () => ({ isReplModeEnabled: () => false }),
)

// MACRO globals
;(globalThis as any).MACRO = {
  VERSION: '2.1.888',
  BUILD_TIME: '2026-04-22T00:00:00Z',
  FEEDBACK_CHANNEL: '',
  ISSUES_EXPLAINER: 'report issues on GitHub',
  NATIVE_PACKAGE_URL: '',
  PACKAGE_URL: '',
  VERSION_CHANGELOG: '',
}

// --- Import and dump ---
const { getSystemPrompt } = await import('src/constants/prompts.js')

const tools = [
  { name: 'Bash' },
  { name: 'Read' },
  { name: 'Edit' },
  { name: 'Write' },
  { name: 'Glob' },
  { name: 'Grep' },
  { name: 'Agent' },
  { name: 'AskUserQuestion' },
  { name: 'TaskCreate' },
] as any

const sections = await getSystemPrompt(tools, 'claude-opus-4-7')
const full = sections.join('\n\n')

const outputPath = 'scripts/system-prompt-dump.txt'
await Bun.write(outputPath, full)
console.log(`Written to ${outputPath}`)
console.log(`Sections: ${sections.length} | Chars: ${full.length} | Lines: ${full.split('\n').length}`)
