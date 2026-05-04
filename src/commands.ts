// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得被重新排序
import addDir from './commands/add-dir/index.js'
import autofixPr from './commands/autofix-pr/index.js'
import backfillSessions from './commands/backfill-sessions/index.js'
import btw from './commands/btw/index.js'
import goodClaude from './commands/good-claude/index.js'
import issue from './commands/issue/index.js'
import feedback from './commands/feedback/index.js'
import clear from './commands/clear/index.js'
import color from './commands/color/index.js'
import commit from './commands/commit.js'
import copy from './commands/copy/index.js'
import desktop from './commands/desktop/index.js'
import commitPushPr from './commands/commit-push-pr.js'
import compact from './commands/compact/index.js'
import config from './commands/config/index.js'
import { context, contextNonInteractive } from './commands/context/index.js'
import cost from './commands/cost/index.js'
import diff from './commands/diff/index.js'
import ctx_viz from './commands/ctx_viz/index.js'
import doctor from './commands/doctor/index.js'
import memory from './commands/memory/index.js'
import help from './commands/help/index.js'
import ide from './commands/ide/index.js'
import init from './commands/init.js'
import initVerifiers from './commands/init-verifiers.js'
import keybindings from './commands/keybindings/index.js'
import lang from './commands/lang/index.js'
import login from './commands/login/index.js'
import logout from './commands/logout/index.js'
import installGitHubApp from './commands/install-github-app/index.js'
import installSlackApp from './commands/install-slack-app/index.js'
import breakCache from './commands/break-cache/index.js'
import mcp from './commands/mcp/index.js'
import mobile from './commands/mobile/index.js'
import onboarding from './commands/onboarding/index.js'
import pr_comments from './commands/pr_comments/index.js'
import releaseNotes from './commands/release-notes/index.js'
import rename from './commands/rename/index.js'
import resume from './commands/resume/index.js'
import review, { ultrareview } from './commands/review.js'
import session from './commands/session/index.js'
import share from './commands/share/index.js'
import skills from './commands/skills/index.js'
import status from './commands/status/index.js'
import tasks from './commands/tasks/index.js'
import teleport from './commands/teleport/index.js'
/* eslint-disable @typescript-eslint/no-require-imports */
const agentsPlatform =
  process.env.USER_TYPE === 'ant'
    ? require('./commands/agents-platform/index.js').default
    : null
/* eslint-enable @typescript-eslint/no-require-imports */
import securityReview from './commands/security-review.js'
import bughunter from './commands/bughunter/index.js'
import terminalSetup from './commands/terminalSetup/index.js'
import usage from './commands/usage/index.js'
import theme from './commands/theme/index.js'
import vim from './commands/vim/index.js'
import { feature } from 'bun:bundle'
// 死代码消除：条件导入
/* eslint-disable @typescript-eslint/no-require-imports */
const proactive =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('./commands/proactive.js').default
    : null
const briefCommand =
  feature('KAIROS') || feature('KAIROS_BRIEF')
    ? require('./commands/brief.js').default
    : null
const assistantCommand = feature('KAIROS')
  ? require('./commands/assistant/index.js').default
  : null
const bridge = feature('BRIDGE_MODE')
  ? require('./commands/bridge/index.js').default
  : null
const remoteControlServerCommand = feature('BRIDGE_MODE')
  ? require('./commands/remoteControlServer/index.js').default
  : null
const voiceCommand = feature('VOICE_MODE')
  ? require('./commands/voice/index.js').default
  : null
const monitorCmd = feature('MONITOR_TOOL')
  ? require('./commands/monitor.js').default
  : null
const coordinatorCmd = feature('COORDINATOR_MODE')
  ? require('./commands/coordinator.js').default
  : null
const forceSnip = feature('HISTORY_SNIP')
  ? require('./commands/force-snip.js').default
  : null
const workflowsCmd = feature('WORKFLOW_SCRIPTS')
  ? (
      require('./commands/workflows/index.js') as typeof import('./commands/workflows/index.js')
    ).default
  : null
const webCmd = feature('CCR_REMOTE_SETUP')
  ? (
      require('./commands/remote-setup/index.js') as typeof import('./commands/remote-setup/index.js')
    ).default
  : null
const clearSkillIndexCache = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? (
      require('./services/skillSearch/localSearch.js') as typeof import('./services/skillSearch/localSearch.js')
    ).clearSkillIndexCache
  : null
const subscribePr = feature('KAIROS_GITHUB_WEBHOOKS')
  ? require('./commands/subscribe-pr.js').default
  : null
const ultraplan = feature('ULTRAPLAN')
  ? require('./commands/ultraplan.js').default
  : null
const torch = feature('TORCH') ? require('./commands/torch.js').default : null
const daemonCmd =
  feature('DAEMON') || feature('BG_SESSIONS')
    ? require('./commands/daemon/index.js').default
    : null
const jobCmd = feature('TEMPLATES')
  ? require('./commands/job/index.js').default
  : null
const peersCmd = feature('UDS_INBOX')
  ? (
      require('./commands/peers/index.js') as typeof import('./commands/peers/index.js')
    ).default
  : null
const attachCmd = feature('UDS_INBOX')
  ? require('./commands/attach/index.js').default
  : null
const detachCmd = feature('UDS_INBOX')
  ? require('./commands/detach/index.js').default
  : null
const sendCmd = feature('UDS_INBOX')
  ? require('./commands/send/index.js').default
  : null
const pipesCmd = feature('UDS_INBOX')
  ? require('./commands/pipes/index.js').default
  : null
const pipeStatusCmd = feature('UDS_INBOX')
  ? require('./commands/pipe-status/index.js').default
  : null
const historyCmd = feature('UDS_INBOX')
  ? require('./commands/history/index.js').default
  : null
const claimMainCmd = feature('UDS_INBOX')
  ? require('./commands/claim-main/index.js').default
  : null
const forkCmd = feature('FORK_SUBAGENT')
  ? (
      require('./commands/fork/index.js') as typeof import('./commands/fork/index.js')
    ).default
  : null
const buddy = feature('BUDDY')
  ? (
      require('./commands/buddy/index.js') as typeof import('./commands/buddy/index.js')
    ).default
  : null
const poor = feature('POOR')
  ? (
      require('./commands/poor/index.js') as typeof import('./commands/poor/index.js')
    ).default
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
import thinkback from './commands/thinkback/index.js'
import thinkbackPlay from './commands/thinkback-play/index.js'
import permissions from './commands/permissions/index.js'
import plan from './commands/plan/index.js'
import fast from './commands/fast/index.js'
import passes from './commands/passes/index.js'
import privacySettings from './commands/privacy-settings/index.js'
import hooks from './commands/hooks/index.js'
import files from './commands/files/index.js'
import branch from './commands/branch/index.js'
import agents from './commands/agents/index.js'
import plugin from './commands/plugin/index.js'
import reloadPlugins from './commands/reload-plugins/index.js'
import rewind from './commands/rewind/index.js'
import heapDump from './commands/heapdump/index.js'
import mockLimits from './commands/mock-limits/index.js'
import bridgeKick from './commands/bridge-kick.js'
import version from './commands/version.js'
import summary from './commands/summary/index.js'
import skillLearning from './commands/skill-learning/index.js'
import skillSearch from './commands/skill-search/index.js'
import {
  resetLimits,
  resetLimitsNonInteractive,
} from './commands/reset-limits/index.js'
import antTrace from './commands/ant-trace/index.js'
import perfIssue from './commands/perf-issue/index.js'
import sandboxToggle from './commands/sandbox-toggle/index.js'
import chrome from './commands/chrome/index.js'
import stickers from './commands/stickers/index.js'
import advisor from './commands/advisor.js'
import autonomy from './commands/autonomy.js'
import provider from './commands/provider.js'
import { logError } from './utils/log.js'
import { toError } from './utils/errors.js'
import { logForDebugging } from './utils/debug.js'
import {
  getSkillDirCommands,
  clearSkillCaches,
  getDynamicSkills,
} from './skills/loadSkillsDir.js'
import { getBundledSkills } from './skills/bundledSkills.js'
import { getBuiltinPluginSkillCommands } from './plugins/builtinPlugins.js'
import {
  getPluginCommands,
  clearPluginCommandCache,
  getPluginSkills,
  clearPluginSkillsCache,
} from './utils/plugins/loadPluginCommands.js'
import memoize from 'lodash-es/memoize.js'
import { isUsing3PServices, isClaudeAISubscriber } from './utils/auth.js'
import { isFirstPartyAnthropicBaseUrl } from './utils/model/providers.js'
import env from './commands/env/index.js'
import exit from './commands/exit/index.js'
import exportCommand from './commands/export/index.js'
import model from './commands/model/index.js'
import tag from './commands/tag/index.js'
import outputStyle from './commands/output-style/index.js'
import remoteEnv from './commands/remote-env/index.js'
import upgrade from './commands/upgrade/index.js'
import {
  extraUsage,
  extraUsageNonInteractive,
} from './commands/extra-usage/index.js'
import rateLimitOptions from './commands/rate-limit-options/index.js'
import statusline from './commands/statusline.js'
import effort from './commands/effort/index.js'
import stats from './commands/stats/index.js'
// insights.ts 文件大小为 113KB（3200 行，包含 diffLines/html 渲染）。延迟加载
// 垫片将重量级模块的加载推迟到实际调用 /insights 时。
const usageReport: Command = {
  type: 'prompt',
  name: 'insights',
  description: '生成一份分析您的 Claude Code 会话的报告',
  contentLength: 0,
  progressMessage: '正在分析您的会话',
  source: 'builtin',
  async getPromptForCommand(args, context) {
    const real = (await import('./commands/insights.js')).default
    if (real.type !== 'prompt') throw new Error('unreachable')
    return real.getPromptForCommand(args, context)
  },
}
import oauthRefresh from './commands/oauth-refresh/index.js'
import debugToolCall from './commands/debug-tool-call/index.js'
import { getSettingSourceName } from './utils/settings/constants.js'
import {
  type Command,
  getCommandName,
  isCommandEnabled,
} from './types/command.js'

// 从集中位置重新导出类型
export type {
  Command,
  CommandBase,
  CommandResultDisplay,
  LocalCommandResult,
  LocalJSXCommandContext,
  PromptCommand,
  ResumeEntrypoint,
} from './types/command.js'
export { getCommandName, isCommandEnabled } from './types/command.js'

// 在外部构建中被消除的命令
export const INTERNAL_ONLY_COMMANDS = [
  backfillSessions,
  breakCache,
  bughunter,
  commit,
  commitPushPr,
  ctx_viz,
  goodClaude,
  issue,
  initVerifiers,
  mockLimits,
  bridgeKick,
  version,
  ...(subscribePr ? [subscribePr] : []),
  resetLimits,
  resetLimitsNonInteractive,
  onboarding,
  share,
  teleport,
  antTrace,
  perfIssue,
  env,
  oauthRefresh,
  debugToolCall,
  agentsPlatform,
  autofixPr,
].filter(Boolean)

// 声明为函数，以便在调用 getCommands 之前不运行此代码，
// 因为底层函数会读取配置，而配置无法在模块初始化时读取
const COMMANDS = memoize((): Command[] => [
  addDir,
  advisor,
  autonomy,
  provider,
  agents,
  branch,
  btw,
  chrome,
  clear,
  color,
  compact,
  config,
  copy,
  desktop,
  context,
  contextNonInteractive,
  cost,
  diff,
  doctor,
  effort,
  exit,
  fast,
  files,
  heapDump,
  help,
  ide,
  init,
  keybindings,
  lang,
  installGitHubApp,
  installSlackApp,
  mcp,
  memory,
  mobile,
  model,
  outputStyle,
  remoteEnv,
  plugin,
  pr_comments,
  releaseNotes,
  reloadPlugins,
  rename,
  resume,
  session,
  skills,
  stats,
  status,
  statusline,
  stickers,
  tag,
  theme,
  feedback,
  review,
  ultrareview,
  rewind,
  securityReview,
  terminalSetup,
  upgrade,
  extraUsage,
  extraUsageNonInteractive,
  rateLimitOptions,
  usage,
  usageReport,
  vim,
  ...(webCmd ? [webCmd] : []),
  ...(forkCmd ? [forkCmd] : []),
  ...(buddy ? [buddy] : []),
  ...(poor ? [poor] : []),
  ...(proactive ? [proactive] : []),
  ...(monitorCmd ? [monitorCmd] : []),
  ...(coordinatorCmd ? [coordinatorCmd] : []),
  ...(briefCommand ? [briefCommand] : []),
  ...(assistantCommand ? [assistantCommand] : []),
  ...(bridge ? [bridge] : []),
  ...(remoteControlServerCommand ? [remoteControlServerCommand] : []),
  ...(voiceCommand ? [voiceCommand] : []),
  thinkback,
  thinkbackPlay,
  permissions,
  plan,
  privacySettings,
  hooks,
  exportCommand,
  sandboxToggle,
  ...(!isUsing3PServices() ? [logout, login()] : []),
  passes,
  ...(peersCmd ? [peersCmd] : []),
  ...(attachCmd ? [attachCmd] : []),
  ...(detachCmd ? [detachCmd] : []),
  ...(sendCmd ? [sendCmd] : []),
  ...(pipesCmd ? [pipesCmd] : []),
  ...(pipeStatusCmd ? [pipeStatusCmd] : []),
  ...(historyCmd ? [historyCmd] : []),
  ...(claimMainCmd ? [claimMainCmd] : []),
  tasks,
  ...(workflowsCmd ? [workflowsCmd] : []),
  ...(ultraplan ? [ultraplan] : []),
  ...(torch ? [torch] : []),
  ...(daemonCmd ? [daemonCmd] : []),
  ...(jobCmd ? [jobCmd] : []),
  ...(forceSnip ? [forceSnip] : []),
  summary,
  skillLearning,
  skillSearch,
  ...(process.env.USER_TYPE === 'ant' && !process.env.IS_DEMO
    ? INTERNAL_ONLY_COMMANDS
    : []),
])

export const builtInCommandNames = memoize(
  (): Set<string> =>
    new Set(COMMANDS().flatMap(_ => [_.name, ...(_.aliases ?? [])])),
)

async function getSkills(cwd: string): Promise<{
  skillDirCommands: Command[]
  pluginSkills: Command[]
  bundledSkills: Command[]
  builtinPluginSkills: Command[]
}> {
  try {
    const [skillDirCommands, pluginSkills] = await Promise.all([
      getSkillDirCommands(cwd).catch(err => {
        logError(toError(err))
        logForDebugging('技能目录命令加载失败，将在没有它们的情况下继续运行')
        return []
      }),
      getPluginSkills().catch(err => {
        logError(toError(err))
        logForDebugging('插件技能加载失败，将在没有它们的情况下继续运行')
        return []
      }),
    ])
    // 捆绑技能在启动时同步注册
    const bundledSkills = getBundledSkills()
    // 内置插件技能来自已启用的内置插件
    const builtinPluginSkills = getBuiltinPluginSkillCommands()
    logForDebugging(
      `getSkills 返回：${skillDirCommands.length} 个技能目录命令，${pluginSkills.length} 个插件技能，${bundledSkills.length} 个捆绑技能，${builtinPluginSkills.length} 个内置插件技能`,
    )
    return {
      skillDirCommands,
      pluginSkills,
      bundledSkills,
      builtinPluginSkills,
    }
  } catch (err) {
    // 这应该永远不会发生，因为我们在 Promise 级别进行了捕获，但出于防御性编程
    logError(toError(err))
    logForDebugging('getSkills 中出现意外错误，返回空结果')
    return {
      skillDirCommands: [],
      pluginSkills: [],
      bundledSkills: [],
      builtinPluginSkills: [],
    }
  }
}

/* eslint-disable @typescript-eslint/no-require-imports */
const getWorkflowCommands = feature('WORKFLOW_SCRIPTS')
  ? (
      require('@claude-code-best/builtin-tools/tools/WorkflowTool/createWorkflowCommand.js') as typeof import('@claude-code-best/builtin-tools/tools/WorkflowTool/createWorkflowCommand.js')
    ).getWorkflowCommands
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

/** * 根据命令声明的 `availability`（身份验证/提供商要求）过滤命令。
 * 没有 `availability` 的命令被视为通用命令。
 * 此操作在 `isEnabled()` 之前运行，以便无论功能标志状态如何，
 * 由提供商限制的命令都会被隐藏。
 *
 * 未进行记忆化 — 身份验证状态可能在会话中途改变（例如，在 /login 之后），
 * 因此必须在每次 getCommands() 调用时重新评估。 */
export function meetsAvailabilityRequirement(cmd: Command): boolean {
  if (!cmd.availability || cmd.availability.length === 0) return true
  for (const a of cmd.availability) {
    switch (a) {
      case 'claude-ai':
        if (isClaudeAISubscriber()) return true
        break
      case 'console':
        // Console API key 用户 = 直接的一方 API 客户（非三方，非 claude.ai）。
        // 排除未设置 ANTHROPIC_BASE_URL 的三方用户（Bedrock/Vertex/Foundry）
        // 以及通过自定义基础 URL 代理的网关用户。
        if (
          !isClaudeAISubscriber() &&
          !isUsing3PServices() &&
          isFirstPartyAnthropicBaseUrl()
        )
          return true
        break
      default: {
        const _exhaustive: never = a
        void _exhaustive
        break
      }
    }
  }
  return false
}

/** * 加载所有命令源（技能、插件、工作流）。按当前工作目录进行记忆化，
 * 因为加载成本高昂（磁盘 I/O，动态导入）。 */
const loadAllCommands = memoize(async (cwd: string): Promise<Command[]> => {
  const [
    { skillDirCommands, pluginSkills, bundledSkills, builtinPluginSkills },
    pluginCommands,
    workflowCommands,
  ] = await Promise.all([
    getSkills(cwd),
    getPluginCommands(),
    getWorkflowCommands ? getWorkflowCommands(cwd) : Promise.resolve([]),
  ])

  return [
    ...bundledSkills,
    ...builtinPluginSkills,
    ...skillDirCommands,
    ...(workflowCommands as Command[]),
    ...(pluginCommands as Command[]),
    ...pluginSkills,
    ...COMMANDS(),
  ]
})

/** * 返回当前用户可用的命令。昂贵的加载操作已记忆化，
 * 但可用性和 isEnabled 检查每次调用都会重新运行，
 * 以便身份验证更改（例如 /login）立即生效。 */
export async function getCommands(cwd: string): Promise<Command[]> {
  const allCommands = await loadAllCommands(cwd)

  // 获取在文件操作期间发现的动态技能
  const dynamicSkills = getDynamicSkills()

  // 构建不含动态技能的基础命令
  const baseCommands = allCommands.filter(
    _ => meetsAvailabilityRequirement(_) && isCommandEnabled(_),
  )

  if (dynamicSkills.length === 0) {
    return baseCommands
  }

  // 动态技能去重 - 仅当不存在时才添加
  const baseCommandNames = new Set(baseCommands.map(c => c.name))
  const uniqueDynamicSkills = dynamicSkills.filter(
    s =>
      !baseCommandNames.has(s.name) &&
      meetsAvailabilityRequirement(s) &&
      isCommandEnabled(s),
  )

  if (uniqueDynamicSkills.length === 0) {
    return baseCommands
  }

  // 在插件技能之后、内置命令之前插入动态技能
  const builtInNames = new Set(COMMANDS().map(c => c.name))
  const insertIndex = baseCommands.findIndex(c => builtInNames.has(c.name))

  if (insertIndex === -1) {
    return [...baseCommands, ...uniqueDynamicSkills]
  }

  return [
    ...baseCommands.slice(0, insertIndex),
    ...uniqueDynamicSkills,
    ...baseCommands.slice(insertIndex),
  ]
}

/** * 仅清除命令的缓存，而不清除技能缓存。
 * 当添加动态技能使缓存的命令列表失效时，使用此方法。 */
export function clearCommandMemoizationCaches(): void {
  loadAllCommands.cache?.clear?.()
  getSkillToolCommands.cache?.clear?.()
  getSlashCommandToolSkills.cache?.clear?.()
  // skillSearch/localSearch.ts 中的 getSkillIndex 是一个独立的缓存层
  // 构建在 getSkillToolCommands/getCommands 之上。仅清除内部
  // 缓存对外层无效 — lodash memoize 会返回缓存的结果
  // 而不会触及已清除的内部缓存。必须显式清除它。
  clearSkillIndexCache?.()
}

export function clearCommandsCache(): void {
  clearCommandMemoizationCaches()
  clearPluginCommandCache()
  clearPluginSkillsCache()
  clearSkillCaches()
}

/** * 将 AppState.mcp.commands 过滤为 MCP 提供的技能（提示类型、
 * 模型可调用、从 MCP 加载）。这些存在于 getCommands() 之外，因此
 * 需要在技能索引中包含 MCP 技能的调用方会单独处理它们。 */
export function getMcpSkillCommands(
  mcpCommands: readonly Command[],
): readonly Command[] {
  if (feature('MCP_SKILLS')) {
    return mcpCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        cmd.loadedFrom === 'mcp' &&
        !cmd.disableModelInvocation,
    )
  }
  return []
}

// SkillTool 显示模型可以调用的所有基于提示的命令
// 这包括技能（来自 /skills/）和命令（来自 /commands/）
export const getSkillToolCommands = memoize(
  async (cwd: string): Promise<Command[]> => {
    const allCommands = await getCommands(cwd)
    return allCommands.filter(
      cmd =>
        cmd.type === 'prompt' &&
        !cmd.disableModelInvocation &&
        cmd.source !== 'builtin' &&
        // 始终包含来自 /skills/ 目录的技能、捆绑的技能以及旧的 /commands/ 条目
        // （如果缺少 frontmatter，它们都会从第一行自动派生描述）。
        // 插件/MCP 命令仍然需要显式描述才能出现在列表中。
        (cmd.loadedFrom === 'bundled' ||
          cmd.loadedFrom === 'skills' ||
          cmd.loadedFrom === 'commands_DEPRECATED' ||
          cmd.hasUserSpecifiedDescription ||
          cmd.whenToUse),
    )
  },
)

// 过滤命令，仅包含技能。技能是为模型提供
// 专用能力的命令。它们通过以下方式标识：
// loadedFrom 为 'skills'、'plugin' 或 'bundled'，或者设置了 disableModelInvocation。
export const getSlashCommandToolSkills = memoize(
  async (cwd: string): Promise<Command[]> => {
    try {
      const allCommands = await getCommands(cwd)
      return allCommands.filter(
        cmd =>
          cmd.type === 'prompt' &&
          cmd.source !== 'builtin' &&
          (cmd.hasUserSpecifiedDescription || cmd.whenToUse) &&
          (cmd.loadedFrom === 'skills' ||
            cmd.loadedFrom === 'plugin' ||
            cmd.loadedFrom === 'bundled' ||
            cmd.disableModelInvocation),
      )
    } catch (error) {
      logError(toError(error))
      // 返回空数组而非抛出错误 - 技能是非关键性的
      // 这可以防止技能加载失败导致整个系统崩溃
      logForDebugging('因加载失败返回空技能数组')
      return []
    }
  },
)
/**
 * 在远程模式（--remote）下可安全使用的命令。
 * 这些命令仅影响本地 TUI 状态，不依赖本地文件系统、
 * git、shell、IDE、MCP 或其他本地执行上下文。
 *
 * 在两个地方使用：
 * 1. 在 REPL 渲染前，于 main.tsx 中预过滤命令（防止与 CCR 初始化竞争）
 * 2. 在 CCR 过滤后，于 REPL 的 handleRemoteInit 中保留仅限本地的命令
 */
export const REMOTE_SAFE_COMMANDS: Set<Command> = new Set([
  session, // 显示远程会话的二维码 / URL
  exit, // 退出 TUI
  clear, // 清屏
  help, // 显示帮助
  theme, // 更改终端主题
  color, // 更改代理颜色
  vim, // 切换 Vim 模式
  cost, // 显示会话成本（本地成本跟踪）
  usage, // 显示使用信息
  copy, // 复制最后一条消息
  btw, // 快速备注
  feedback, // 发送反馈
  plan, // 切换计划模式
  proactive, // 切换主动模式
  keybindings, // 按键绑定管理
  statusline, // 状态行切换
  stickers, // 贴纸
  mobile, // 移动端二维码
])

/**
 * 通过远程控制桥接收时，可安全执行的 'local' 类型内置命令。
 * 这些命令产生流式传输回移动端/Web 客户端的文本输出，且没有仅限终端的副作用。
 *
 * 'local-jsx' 命令按类型被阻止（它们渲染 Ink UI），而
 * 'prompt' 命令按类型被允许（它们扩展为发送给模型的文本）— 此集合仅控制 'local' 命令。
 *
 * 当添加一个应在移动端工作的新 'local' 命令时，请在此处添加。
 * 默认情况下是被阻止的。
 */
export const BRIDGE_SAFE_COMMANDS: Set<Command> = new Set(
  [
    compact, // 压缩上下文 — 在手机上中途使用很有用
    clear, // 清空记录
    cost, // 显示会话成本
    summary, // 总结对话
    releaseNotes, // 显示更新日志
    files, // 列出跟踪的文件
  ].filter((c): c is Command => c !== null),
)

/** * 当斜杠命令的输入通过远程控制桥（移动端/Web 客户端）到达时，是否可安全执行。
 *
 * PR #19134 全面阻止了所有来自桥的斜杠命令，因为
 * 来自 iOS 的 `/model` 会弹出本地 Ink 选择器。此谓词通过显式允许列表放宽了
 * 该限制：'prompt' 命令（技能）扩展为文本，在构造上是安全的；'local' 命令需要通过
 * BRIDGE_SAFE_COMMANDS 显式选择加入；'local-jsx' 命令渲染 Ink UI 并保持被阻止。 */
export function isBridgeSafeCommand(cmd: Command): boolean {
  if (cmd.type === 'local-jsx') return cmd.bridgeSafe === true
  if (cmd.type === 'prompt') return true
  return cmd.bridgeSafe === true || BRIDGE_SAFE_COMMANDS.has(cmd)
}

export function getBridgeCommandSafety(
  cmd: Command,
  args: string,
): { ok: true } | { ok: false; reason?: string } {
  if (!isBridgeSafeCommand(cmd)) return { ok: false }
  const reason = cmd.getBridgeInvocationError?.(args)
  return reason ? { ok: false, reason } : { ok: true }
}

/** * 过滤命令，仅包含对远程模式安全的命令。
 * 用于在 --remote 模式下渲染 REPL 时预过滤命令，
 * 防止在 CCR 初始化消息到达前，短暂出现仅限本地的命令。 */
export function filterCommandsForRemoteMode(commands: Command[]): Command[] {
  return commands.filter(cmd => REMOTE_SAFE_COMMANDS.has(cmd))
}

export function findCommand(
  commandName: string,
  commands: Command[],
): Command | undefined {
  return commands.find(
    _ =>
      _.name === commandName ||
      getCommandName(_) === commandName ||
      _.aliases?.includes(commandName),
  )
}

export function hasCommand(commandName: string, commands: Command[]): boolean {
  return findCommand(commandName, commands) !== undefined
}

export function getCommand(commandName: string, commands: Command[]): Command {
  const command = findCommand(commandName, commands)
  if (!command) {
    throw ReferenceError(
      `未找到命令 ${commandName}。可用命令：${commands
        .map(_ => {
          const name = getCommandName(_)
          return _.aliases ? `${name} (aliases: ${_.aliases.join(', ')})` : name
        })
        .sort((a, b) => a.localeCompare(b))
        .join(', ')}`,
    )
  }

  return command
}

/** 格式化命令的描述，并附上其来源标注，用于面向用户的 UI。
在自动补全、帮助屏幕和其他用户需要查看命令来源的地方使用。

对于面向模型的提示（如 SkillTool），直接使用 cmd.description。 */
export function formatDescriptionWithSource(cmd: Command): string {
  if (cmd.type !== 'prompt') {
    return cmd.description
  }

  if (cmd.kind === 'workflow') {
    return `${cmd.description}（工作流）`
  }

  if (cmd.source === 'plugin') {
    const pluginName = cmd.pluginInfo?.pluginManifest.name
    if (pluginName) {
      return `(${pluginName}) ${cmd.description}`
    }
    return `${cmd.description}（插件）`
  }

  if (cmd.source === 'builtin' || cmd.source === 'mcp') {
    return cmd.description
  }

  if (cmd.source === 'bundled') {
    return `${cmd.description}（捆绑）`
  }

  return `${cmd.description} (${getSettingSourceName(cmd.source)})`
}
