/**
 * promptEngineeringAudit.test.ts
 *
 * 验证 prompts.ts 中从 Opus 4.7 官方 prompt 借鉴的提示词工程改进。
 * 对应审计文档: docs/features/opus-4.7-prompt-engineering-audit.md
 *
 * 测试策略: 通过 getSystemPrompt() 生成完整 system prompt，
 * 然后检查关键段落是否存在。大部分被测函数是 module-private，
 * 只能通过最终输出间接验证。
 */

import { describe, test, expect, mock, beforeEach } from 'bun:test'

// --- MACRO 全局注入 (编译时 define 在测试中不可用) ---
;(globalThis as any).MACRO = {
  VERSION: '2.1.888',
  BUILD_TIME: '2026-04-22T00:00:00Z',
  FEEDBACK_CHANNEL: '',
  ISSUES_EXPLAINER: 'report issues on GitHub',
  NATIVE_PACKAGE_URL: '',
  PACKAGE_URL: '',
  VERSION_CHANGELOG: '',
}

// --- Mock 链 (阻断副作用) ---

mock.module('src/bootstrap/state.js', () => ({
  getIsNonInteractiveSession: () => false,
  sessionId: 'test-session',
  getCwd: () => '/test/project',
}))
mock.module('src/utils/cwd.js', () => ({
  getCwd: () => '/test/project',
}))
mock.module('src/utils/git.js', () => ({
  getIsGit: async () => true,
}))
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
mock.module('src/utils/env.js', () => ({
  env: { platform: 'linux' },
}))
mock.module('src/utils/envUtils.js', () => ({
  isEnvTruthy: () => false,
}))
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
mock.module('src/utils/undercover.js', () => ({
  isUndercover: () => false,
}))
mock.module('src/utils/model/antModels.js', () => ({
  getAntModelOverrideConfig: () => null,
}))
mock.module('src/utils/mcpInstructionsDelta.js', () => ({
  isMcpInstructionsDeltaEnabled: () => false,
}))
mock.module('src/memdir/memdir.js', () => ({
  loadMemoryPrompt: async () => null,
}))
mock.module('src/utils/debug.js', () => ({
  logForDebugging: () => {},
}))
mock.module('src/services/analytics/growthbook.js', () => ({
  getFeatureValue_CACHED_MAY_BE_STALE: () => false,
}))
mock.module('bun:bundle', () => ({
  feature: (_name: string) => false,
}))
mock.module('src/constants/systemPromptSections.js', () => ({
  systemPromptSection: (_name: string, fn: () => any) => fn(),
  DANGEROUS_uncachedSystemPromptSection: (_name: string, fn: () => any) => fn(),
  resolveSystemPromptSections: async (sections: any[]) =>
    sections.filter(s => s !== null),
}))

// 工具常量 mock
const TOOL_NAMES = {
  Bash: 'Bash',
  Read: 'Read',
  Edit: 'Edit',
  Write: 'Write',
  Glob: 'Glob',
  Grep: 'Grep',
  Agent: 'Agent',
  AskUserQuestion: 'AskUserQuestion',
  TaskCreate: 'TaskCreate',
  DiscoverSkills: 'DiscoverSkills',
  Skill: 'Skill',
  Sleep: 'Sleep',
}

mock.module(
  '@claude-code-best/builtin-tools/tools/BashTool/toolName.js',
  () => ({ BASH_TOOL_NAME: TOOL_NAMES.Bash }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/FileReadTool/prompt.js',
  () => ({ FILE_READ_TOOL_NAME: TOOL_NAMES.Read }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/FileEditTool/constants.js',
  () => ({ FILE_EDIT_TOOL_NAME: TOOL_NAMES.Edit }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/FileWriteTool/prompt.js',
  () => ({ FILE_WRITE_TOOL_NAME: TOOL_NAMES.Write }),
)
mock.module('@claude-code-best/builtin-tools/tools/GlobTool/prompt.js', () => ({
  GLOB_TOOL_NAME: TOOL_NAMES.Glob,
}))
mock.module('@claude-code-best/builtin-tools/tools/GrepTool/prompt.js', () => ({
  GREP_TOOL_NAME: TOOL_NAMES.Grep,
}))
mock.module(
  '@claude-code-best/builtin-tools/tools/AgentTool/constants.js',
  () => ({
    AGENT_TOOL_NAME: TOOL_NAMES.Agent,
    VERIFICATION_AGENT_TYPE: 'verification',
  }),
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
  () => ({ ASK_USER_QUESTION_TOOL_NAME: TOOL_NAMES.AskUserQuestion }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/TodoWriteTool/constants.js',
  () => ({ TODO_WRITE_TOOL_NAME: 'TodoWrite' }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/TaskCreateTool/constants.js',
  () => ({ TASK_CREATE_TOOL_NAME: TOOL_NAMES.TaskCreate }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/DiscoverSkillsTool/prompt.js',
  () => ({ DISCOVER_SKILLS_TOOL_NAME: TOOL_NAMES.DiscoverSkills }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/SkillTool/constants.js',
  () => ({ SKILL_TOOL_NAME: TOOL_NAMES.Skill }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/SleepTool/prompt.js',
  () => ({ SLEEP_TOOL_NAME: TOOL_NAMES.Sleep }),
)
mock.module(
  '@claude-code-best/builtin-tools/tools/REPLTool/constants.js',
  () => ({ isReplModeEnabled: () => false }),
)

// --- 导入被测模块 ---

import {
  getSystemPrompt,
  prependBullets,
  computeSimpleEnvInfo,
  getScratchpadInstructions,
} from './prompts.js'
import type { Tools } from '../Tool.js'

// --- 辅助 ---

const standardTools: Tools = [
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

async function getFullPrompt(
  tools: Tools = standardTools,
  model = 'claude-opus-4-7',
): Promise<string> {
  const sections = await getSystemPrompt(tools, model)
  return sections.join('\n\n')
}

// =====================================================================
// 第一部分: 提示词工程技巧验证
// 对应审计文档 第一部分 #1-#10
// =====================================================================

describe('Opus 4.7 Prompt Engineering Audit', () => {
  // ------------------------------------------------------------------
  // #1 决策树结构 (Decision Tree)
  // TXT 来源: {request_evaluation_checklist} — Step 0→1→2→3
  // ------------------------------------------------------------------
  describe('#1 Decision tree for tool selection', () => {
    test('prompt contains step-based tool selection guidance', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Step 0')
      expect(prompt).toContain('Step 1')
      expect(prompt).toContain('Step 2')
      expect(prompt).toContain('Step 3')
    })

    test('decision tree has "stop at the first match" semantics', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('stop at the first match')
    })

    test('Step 0 teaches when NOT to use tools', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Step 0')
      expect(prompt).toContain('answer directly, no tool call')
    })

    test('Step 1 prioritizes dedicated tools over Bash', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Step 1')
      expect(prompt).toContain('dedicated tool')
    })
  })

  // ------------------------------------------------------------------
  // #2 反模式先行 (Anti-Pattern First)
  // TXT 来源: {unnecessary_computer_use_avoidance}, {artifact_usage_criteria}
  // ------------------------------------------------------------------
  describe('#2 Anti-pattern guidance (when NOT to use tools)', () => {
    test('prompt says when NOT to use tools', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Do NOT use')
    })

    test('includes explicit "Do not use tools when" section', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Do not use tools when')
    })

    test('anti-pattern covers knowledge questions', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain(
        'programming concepts, syntax, or design patterns',
      )
    })

    test('anti-pattern covers content already in context', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('already visible in context')
    })

    test('includes file creation anti-pattern', async () => {
      const prompt = await getFullPrompt()
      const hasFileAntiPattern =
        prompt.includes('Do not create files unless') ||
        prompt.includes('prefer editing an existing file')
      expect(hasFileAntiPattern).toBe(true)
    })
  })

  // ------------------------------------------------------------------
  // #6 渐进式回退链 (Progressive Fallback Chain)
  // TXT 来源: {core_search_behaviors}, {past_chats_tools}
  // ------------------------------------------------------------------
  describe('#6 Progressive fallback chain', () => {
    test('Grep/Glob fallback chain exists', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('fallback chain')
    })

    test('fallback includes broader pattern as first retry', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Broader pattern')
    })

    test('fallback includes alternate naming conventions', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('camelCase vs snake_case')
    })

    test('fallback ends with asking user after exhaustion', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('ask for guidance')
    })
  })

  // ------------------------------------------------------------------
  // #3 Few-Shot 场景示例 (Few-Shot Examples)
  // TXT 来源: {examples}, {visualizer_examples}, {past_chats_tools}
  // ------------------------------------------------------------------
  describe('#3 Few-shot examples', () => {
    test('contains tool selection examples with arrow notation', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('→')
      expect(prompt).toContain('Tool selection examples')
    })

    test('has multiple concrete Request→Action pairs (>=5)', async () => {
      const prompt = await getFullPrompt()
      const arrowCount = (prompt.match(/[""].+?[""] → /g) || []).length
      expect(arrowCount).toBeGreaterThanOrEqual(5)
    })

    test('examples cover different tool types', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Glob("**/*.tsx")')
      expect(prompt).toContain('Bash("bun test")')
      expect(prompt).toContain('Grep("TODO")')
      expect(prompt).toContain('answer directly')
    })

    test('examples include negative cases (what NOT to use)', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('not Bash find')
      expect(prompt).toContain('not Bash sed')
    })
  })

  // ------------------------------------------------------------------
  // #4 语言信号识别 (Linguistic Signal Detection)
  // TXT 来源: {past_chats_tools}, {file_creation_advice}
  // ------------------------------------------------------------------
  describe('#4 Linguistic signal detection', () => {
    test('file creation signals teach when to create vs inline', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Linguistic signals')
      expect(prompt).toContain('write a script')
      expect(prompt).toContain('create a config')
    })

    test('inline answer signals are listed', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('show me how')
      expect(prompt).toContain('answer inline')
    })

    test('20-line threshold for file creation', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('20 lines')
    })
  })

  // ------------------------------------------------------------------
  // #5 成本不对称分析 (Asymmetric Cost Analysis)
  // TXT 来源: {tool_discovery} "treat tool_search as essentially free"
  // ------------------------------------------------------------------
  describe('#5 Cost asymmetry framing', () => {
    test('prompt has cost asymmetry for actions (existing)', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('cost of pausing to confirm is low')
    })

    test('frames search tools as cheap', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('cheap operations')
    })

    test('expanded cost asymmetry with multiple scenarios', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Cost asymmetry principle')
      expect(prompt).toContain('costs user trust')
      expect(prompt).toContain('breaks their flow')
    })
  })

  // ------------------------------------------------------------------
  // #7 反过度解释 (Anti-Over-Explanation)
  // TXT 来源: {sharing_files}, {request_evaluation_checklist}
  // ------------------------------------------------------------------
  describe('#7 Anti-over-explanation', () => {
    test('prompt contains no-machinery-narration rule (existing)', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain("Don't narrate internal machinery")
    })

    test('includes anti-postamble guidance', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Do not restate')
      expect(prompt).toContain('the user can read the diff')
    })

    test('discourages offering unchosen approach', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('unchosen approach')
    })
  })

  // ------------------------------------------------------------------
  // #8 查询构造教学 (Query Construction Teaching)
  // TXT 来源: {search_usage_guidelines}, {past_chats_tools}
  // ------------------------------------------------------------------
  describe('#8 Query construction guidance', () => {
    test('includes Grep query construction advice', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('query construction')
      expect(prompt).toContain('content words')
    })

    test('Grep guidance teaches content words vs meta-descriptions', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('authenticate|login|signIn')
      expect(prompt).toContain('not "auth handling code"')
    })

    test('Grep guidance teaches pipe alternation for naming variants', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('userId|user_id|userID')
    })

    test('includes Glob query construction advice', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Glob query construction')
      expect(prompt).toContain('**/*Auth*.ts')
    })

    test('Glob guidance teaches narrowing by extension', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('**/*.test.ts')
    })
  })

  // ------------------------------------------------------------------
  // #9 Prompt 注入防御 (Prompt Injection Defense)
  // TXT 来源: {anthropic_reminders}, {request_evaluation_checklist}
  // ------------------------------------------------------------------
  describe('#9 Prompt injection defense', () => {
    test('prompt warns about prompt injection in tool results (existing)', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('prompt injection')
    })

    test('distinguishes file instructions from user instructions', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('not from the user')
    })
  })

  // =====================================================================
  // 第二部分: 行为规则验证
  // 对应审计文档 第二部分 #11-#18
  // =====================================================================

  // ------------------------------------------------------------------
  // #11 格式化纪律 (Formatting Discipline)
  // TXT 来源: {lists_and_bullets}
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // #10 分步搜索策略 (Multi-Step Search Strategy)
  // TXT 来源: {tool_discovery}, {core_search_behaviors}
  // ------------------------------------------------------------------
  describe('#10 Multi-step search strategy', () => {
    test('scales search effort to task complexity', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Scale search effort to task complexity')
    })

    test('gives concrete complexity tiers', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Single file fix')
      expect(prompt).toContain('Cross-cutting change')
      expect(prompt).toContain('Architecture investigation')
    })
  })

  describe('#11 Formatting discipline', () => {
    test('prompt contains prose-first guidance (existing)', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('direct answer in prose')
    })

    test('discourages over-formatting', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('over-formatting')
      expect(prompt).toContain('natural language')
    })

    test('bullet points must be 1-2 sentences, not fragments', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('1-2 sentences')
      expect(prompt).toContain('not sentence fragments')
    })
  })

  // ------------------------------------------------------------------
  // #22 先搜再说不知道 (Search Before Saying Unknown)
  // TXT 来源: {tool_discovery}
  // ------------------------------------------------------------------
  describe('#22 Search before saying unknown', () => {
    test('instructs to search before claiming something does not exist', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Search first, report results second')
    })

    test('explicitly says do not say "I don\'t see that file"', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain("don't see that file")
    })
  })

  // ------------------------------------------------------------------
  // #12 温暖语气 (Warm Tone)
  // TXT 来源: {tone_and_formatting}
  // ------------------------------------------------------------------
  describe('#12 Warm tone', () => {
    test('avoids negative assumptions about user abilities', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('negative assumptions')
    })

    test('pushback should be constructive', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('constructively')
    })
  })

  // ------------------------------------------------------------------
  // #20 风险感知时说得更少 (Say Less When Risky)
  // TXT 来源: {refusal_handling}
  // ------------------------------------------------------------------
  describe('#20 Say less when risky', () => {
    test('security-sensitive code should say less about details', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('saying less about implementation details')
    })
  })

  // ------------------------------------------------------------------
  // #23 不解释为什么搜索 (Don't Justify Search)
  // TXT 来源: {search_usage_guidelines}
  // ------------------------------------------------------------------
  describe("#23 Don't justify search", () => {
    test('instructs not to justify why searching', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain("Don't justify why you're searching")
    })
  })

  // ------------------------------------------------------------------
  // #13 产品线信息 (Product Information)
  // TXT 来源: {product_information}
  // ------------------------------------------------------------------
  describe('#13 Product information', () => {
    test('env info contains Claude Code product description', async () => {
      const envInfo = await computeSimpleEnvInfo('claude-opus-4-7')
      expect(envInfo).toContain('Claude Code')
      expect(envInfo).toContain('CLI')
    })

    test('env info contains model family', async () => {
      const envInfo = await computeSimpleEnvInfo('claude-opus-4-7')
      expect(envInfo).toContain('Claude 4.5/4.6/4.7')
    })

    test('env info contains correct model IDs', async () => {
      const envInfo = await computeSimpleEnvInfo('claude-opus-4-7')
      expect(envInfo).toContain('claude-opus-4-7')
      expect(envInfo).toContain('claude-sonnet-4-6')
      expect(envInfo).toContain('claude-haiku-4-5')
    })

    test('mentions Chrome/Excel/Cowork products', async () => {
      const envInfo = await computeSimpleEnvInfo('claude-opus-4-7')
      expect(envInfo).toContain('Chrome')
      expect(envInfo).toContain('Excel')
      expect(envInfo).toContain('Cowork')
    })
  })

  // ------------------------------------------------------------------
  // #15 对话结束尊重 (Conversation End Respect)
  // TXT 来源: {refusal_handling} line 51
  // ------------------------------------------------------------------
  describe('#15 Conversation end respect', () => {
    test('discourages "anything else?" appendages', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('the user will ask if they need more')
    })
  })

  // ------------------------------------------------------------------
  // #16 每回复最多一个问题 (One Question Per Response)
  // TXT 来源: {tone_and_formatting} line 71
  // ------------------------------------------------------------------
  describe('#16 One question per response', () => {
    test('limits questions per response', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('one question per response')
    })
  })

  // =====================================================================
  // 第三部分: 已存在功能的回归测试
  // 确保现有的从 TXT 对齐的锚点不被破坏
  // =====================================================================

  describe('Existing behavioral anchors (regression)', () => {
    test('default_stance: default to helping', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Default to helping')
      expect(prompt).toContain('concrete, specific risk of serious harm')
    })

    test('anti-collapse: no self-abasement', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('self-abasement')
      expect(prompt).toContain('maintain self-respect')
    })

    test('cutoff silence: do not proactively mention cutoff', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain(
        "Don't proactively mention your knowledge cutoff",
      )
    })

    test('no-machinery-narration: describe in user terms', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain("Don't narrate internal machinery")
      expect(prompt).toContain('Describe the action in user terms')
    })

    test('tool_discovery: search before saying unavailable', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('visible tool list is partial by design')
      expect(prompt).toContain(
        'Only state something is unavailable after the search returns no match',
      )
    })

    test('false-claims mitigation: report outcomes faithfully', async () => {
      const prompt = await getFullPrompt()
      expect(prompt).toContain('Report outcomes faithfully')
    })

    test('CYBER_RISK_INSTRUCTION: allows security testing', async () => {
      const prompt = await getFullPrompt()
      // TS 允许安全测试 (TXT 完全禁止 — 这是有意的差异)
      expect(prompt).not.toContain(
        'does not write or explain or work on malicious code',
      )
    })
  })

  // =====================================================================
  // 第四部分: prependBullets 工具函数
  // =====================================================================

  describe('prependBullets utility', () => {
    test('flat items get single bullet', () => {
      const result = prependBullets(['A', 'B'])
      expect(result).toEqual([' - A', ' - B'])
    })

    test('nested arrays get double-indented bullets', () => {
      const result = prependBullets(['A', ['sub1', 'sub2'], 'B'])
      expect(result).toEqual([' - A', '  - sub1', '  - sub2', ' - B'])
    })

    test('empty array returns empty', () => {
      expect(prependBullets([])).toEqual([])
    })
  })

  // =====================================================================
  // 第五部分: 环境信息与模型 cutoff
  // =====================================================================

  describe('Knowledge cutoff correctness', () => {
    test('Opus 4.7 cutoff is January 2026', async () => {
      const envInfo = await computeSimpleEnvInfo('claude-opus-4-7')
      expect(envInfo).toContain('January 2026')
    })

    test('Opus 4.6 cutoff is May 2025', async () => {
      const envInfo = await computeSimpleEnvInfo('claude-opus-4-6')
      expect(envInfo).toContain('May 2025')
    })

    test('Sonnet 4.6 cutoff is August 2025', async () => {
      const envInfo = await computeSimpleEnvInfo('claude-sonnet-4-6')
      expect(envInfo).toContain('August 2025')
    })

    test('Opus 4.7 frontier model name is correct', async () => {
      const envInfo = await computeSimpleEnvInfo('claude-opus-4-7')
      expect(envInfo).toContain('Claude Opus 4.7')
    })
  })
})
