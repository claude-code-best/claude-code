// biome-ignore-all assist/source/organizeImports: ANT-ONLY 导入标记不得被重新排序
import { toolMatchesName, type Tool, type Tools } from './Tool.js'
import { AgentTool } from '@claude-code-best/builtin-tools/tools/AgentTool/AgentTool.js'
import { SkillTool } from '@claude-code-best/builtin-tools/tools/SkillTool/SkillTool.js'
import { BashTool } from '@claude-code-best/builtin-tools/tools/BashTool/BashTool.js'
import { FileEditTool } from '@claude-code-best/builtin-tools/tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '@claude-code-best/builtin-tools/tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '@claude-code-best/builtin-tools/tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from '@claude-code-best/builtin-tools/tools/GlobTool/GlobTool.js'
import { NotebookEditTool } from '@claude-code-best/builtin-tools/tools/NotebookEditTool/NotebookEditTool.js'
import { WebFetchTool } from '@claude-code-best/builtin-tools/tools/WebFetchTool/WebFetchTool.js'
import { TaskStopTool } from '@claude-code-best/builtin-tools/tools/TaskStopTool/TaskStopTool.js'
import { BriefTool } from '@claude-code-best/builtin-tools/tools/BriefTool/BriefTool.js'
// 死代码消除：针对 ant-only 工具的条件导入
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const REPLTool =
  process.env.USER_TYPE === 'ant'
    ? require('@claude-code-best/builtin-tools/tools/REPLTool/REPLTool.js')
        .REPLTool
    : null
const SuggestBackgroundPRTool =
  process.env.USER_TYPE === 'ant'
    ? require('@claude-code-best/builtin-tools/tools/SuggestBackgroundPRTool/SuggestBackgroundPRTool.js')
        .SuggestBackgroundPRTool
    : null
const SleepTool =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('@claude-code-best/builtin-tools/tools/SleepTool/SleepTool.js')
        .SleepTool
    : null
const cronTools = [
  require('@claude-code-best/builtin-tools/tools/ScheduleCronTool/CronCreateTool.js')
    .CronCreateTool,
  require('@claude-code-best/builtin-tools/tools/ScheduleCronTool/CronDeleteTool.js')
    .CronDeleteTool,
  require('@claude-code-best/builtin-tools/tools/ScheduleCronTool/CronListTool.js')
    .CronListTool,
]
const RemoteTriggerTool = feature('AGENT_TRIGGERS_REMOTE')
  ? require('@claude-code-best/builtin-tools/tools/RemoteTriggerTool/RemoteTriggerTool.js')
      .RemoteTriggerTool
  : null
const MonitorTool = feature('MONITOR_TOOL')
  ? require('@claude-code-best/builtin-tools/tools/MonitorTool/MonitorTool.js')
      .MonitorTool
  : null
const SendUserFileTool = feature('KAIROS')
  ? require('@claude-code-best/builtin-tools/tools/SendUserFileTool/SendUserFileTool.js')
      .SendUserFileTool
  : null
const PushNotificationTool =
  feature('KAIROS') || feature('KAIROS_PUSH_NOTIFICATION')
    ? require('@claude-code-best/builtin-tools/tools/PushNotificationTool/PushNotificationTool.js')
        .PushNotificationTool
    : null
const SubscribePRTool = feature('KAIROS_GITHUB_WEBHOOKS')
  ? require('@claude-code-best/builtin-tools/tools/SubscribePRTool/SubscribePRTool.js')
      .SubscribePRTool
  : null
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import { TaskOutputTool } from '@claude-code-best/builtin-tools/tools/TaskOutputTool/TaskOutputTool.js'
import { WebSearchTool } from '@claude-code-best/builtin-tools/tools/WebSearchTool/WebSearchTool.js'
import { TodoWriteTool } from '@claude-code-best/builtin-tools/tools/TodoWriteTool/TodoWriteTool.js'
import { ExitPlanModeV2Tool } from '@claude-code-best/builtin-tools/tools/ExitPlanModeTool/ExitPlanModeV2Tool.js'
import { TestingPermissionTool } from '@claude-code-best/builtin-tools/tools/testing/TestingPermissionTool.js'
import { GrepTool } from '@claude-code-best/builtin-tools/tools/GrepTool/GrepTool.js'
import { TungstenTool } from '@claude-code-best/builtin-tools/tools/TungstenTool/TungstenTool.js'
// 延迟 require 以打破循环依赖：tools.ts -> TeamCreateTool/TeamDeleteTool -> ... -> tools.ts
/* eslint-disable @typescript-eslint/no-require-imports */
const getTeamCreateTool = () =>
  require('@claude-code-best/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js')
    .TeamCreateTool as typeof import('@claude-code-best/builtin-tools/tools/TeamCreateTool/TeamCreateTool.js').TeamCreateTool
const getTeamDeleteTool = () =>
  require('@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js')
    .TeamDeleteTool as typeof import('@claude-code-best/builtin-tools/tools/TeamDeleteTool/TeamDeleteTool.js').TeamDeleteTool
const getSendMessageTool = () =>
  require('@claude-code-best/builtin-tools/tools/SendMessageTool/SendMessageTool.js')
    .SendMessageTool as typeof import('@claude-code-best/builtin-tools/tools/SendMessageTool/SendMessageTool.js').SendMessageTool
/* eslint-enable @typescript-eslint/no-require-imports */
import { AskUserQuestionTool } from '@claude-code-best/builtin-tools/tools/AskUserQuestionTool/AskUserQuestionTool.js'
import { LSPTool } from '@claude-code-best/builtin-tools/tools/LSPTool/LSPTool.js'
import { ListMcpResourcesTool } from '@claude-code-best/builtin-tools/tools/ListMcpResourcesTool/ListMcpResourcesTool.js'
import { ReadMcpResourceTool } from '@claude-code-best/builtin-tools/tools/ReadMcpResourceTool/ReadMcpResourceTool.js'
import { ToolSearchTool } from '@claude-code-best/builtin-tools/tools/ToolSearchTool/ToolSearchTool.js'
import { EnterPlanModeTool } from '@claude-code-best/builtin-tools/tools/EnterPlanModeTool/EnterPlanModeTool.js'
import { EnterWorktreeTool } from '@claude-code-best/builtin-tools/tools/EnterWorktreeTool/EnterWorktreeTool.js'
import { ExitWorktreeTool } from '@claude-code-best/builtin-tools/tools/ExitWorktreeTool/ExitWorktreeTool.js'
import { ConfigTool } from '@claude-code-best/builtin-tools/tools/ConfigTool/ConfigTool.js'
import { TaskCreateTool } from '@claude-code-best/builtin-tools/tools/TaskCreateTool/TaskCreateTool.js'
import { TaskGetTool } from '@claude-code-best/builtin-tools/tools/TaskGetTool/TaskGetTool.js'
import { TaskUpdateTool } from '@claude-code-best/builtin-tools/tools/TaskUpdateTool/TaskUpdateTool.js'
import { TaskListTool } from '@claude-code-best/builtin-tools/tools/TaskListTool/TaskListTool.js'
import uniqBy from 'lodash-es/uniqBy.js'
import { isToolSearchEnabledOptimistic } from './utils/toolSearch.js'
import { isTodoV2Enabled } from './utils/tasks.js'
// 死代码消除：针对 CLAUDE_CODE_VERIFY_PLAN 的条件导入
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const VerifyPlanExecutionTool =
  process.env.CLAUDE_CODE_VERIFY_PLAN === 'true'
    ? require('@claude-code-best/builtin-tools/tools/VerifyPlanExecutionTool/VerifyPlanExecutionTool.js')
        .VerifyPlanExecutionTool
    : null
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js'
export {
  ALL_AGENT_DISALLOWED_TOOLS,
  CUSTOM_AGENT_DISALLOWED_TOOLS,
  ASYNC_AGENT_ALLOWED_TOOLS,
  COORDINATOR_MODE_ALLOWED_TOOLS,
} from './constants/tools.js'
import { feature } from 'bun:bundle'
// 死代码消除：针对 OVERFLOW_TEST_TOOL 的条件导入
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const OverflowTestTool = feature('OVERFLOW_TEST_TOOL')
  ? require('@claude-code-best/builtin-tools/tools/OverflowTestTool/OverflowTestTool.js')
      .OverflowTestTool
  : null
const CtxInspectTool = feature('CONTEXT_COLLAPSE')
  ? require('@claude-code-best/builtin-tools/tools/CtxInspectTool/CtxInspectTool.js')
      .CtxInspectTool
  : null
const TerminalCaptureTool = feature('TERMINAL_PANEL')
  ? require('@claude-code-best/builtin-tools/tools/TerminalCaptureTool/TerminalCaptureTool.js')
      .TerminalCaptureTool
  : null
const WebBrowserTool = feature('WEB_BROWSER_TOOL')
  ? require('@claude-code-best/builtin-tools/tools/WebBrowserTool/WebBrowserTool.js')
      .WebBrowserTool
  : null
const coordinatorModeModule = feature('COORDINATOR_MODE')
  ? (require('./coordinator/coordinatorMode.js') as typeof import('./coordinator/coordinatorMode.js'))
  : null
const SnipTool = feature('HISTORY_SNIP')
  ? require('@claude-code-best/builtin-tools/tools/SnipTool/SnipTool.js')
      .SnipTool
  : null
const DiscoverSkillsTool = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? require('@claude-code-best/builtin-tools/tools/DiscoverSkillsTool/DiscoverSkillsTool.js')
      .DiscoverSkillsTool
  : null
const ReviewArtifactTool = feature('REVIEW_ARTIFACT')
  ? require('@claude-code-best/builtin-tools/tools/ReviewArtifactTool/ReviewArtifactTool.js')
      .ReviewArtifactTool
  : null
const ListPeersTool = feature('UDS_INBOX')
  ? require('@claude-code-best/builtin-tools/tools/ListPeersTool/ListPeersTool.js')
      .ListPeersTool
  : null
const WorkflowTool = feature('WORKFLOW_SCRIPTS')
  ? (() => {
      require('@claude-code-best/builtin-tools/tools/WorkflowTool/bundled/index.js').initBundledWorkflows()
      return require('@claude-code-best/builtin-tools/tools/WorkflowTool/WorkflowTool.js')
        .WorkflowTool
    })()
  : null
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import type { ToolPermissionContext } from './Tool.js'
import { getDenyRuleForTool } from './utils/permissions/permissions.js'
import { hasEmbeddedSearchTools } from './utils/embeddedTools.js'
import { isEnvTruthy } from './utils/envUtils.js'
import { isPowerShellToolEnabled } from './utils/shell/shellToolUtils.js'
import { isAgentSwarmsEnabled } from './utils/agentSwarmsEnabled.js'
import { isWorktreeModeEnabled } from './utils/worktreeModeEnabled.js'
import {
  REPL_TOOL_NAME,
  REPL_ONLY_TOOLS,
  isReplModeEnabled,
} from '@claude-code-best/builtin-tools/tools/REPLTool/constants.js'
export { REPL_ONLY_TOOLS }
/* eslint-disable @typescript-eslint/no-require-imports */
const getPowerShellTool = () => {
  if (!isPowerShellToolEnabled()) return null
  return (
    require('@claude-code-best/builtin-tools/tools/PowerShellTool/PowerShellTool.js') as typeof import('@claude-code-best/builtin-tools/tools/PowerShellTool/PowerShellTool.js')
  ).PowerShellTool
}
/* eslint-enable @typescript-eslint/no-require-imports */

/** * 可与 --tools 标志一起使用的预定义工具预设 */
export const TOOL_PRESETS = ['default'] as const

export type ToolPreset = (typeof TOOL_PRESETS)[number]

export function parseToolPreset(preset: string): ToolPreset | null {
  const presetString = preset.toLowerCase()
  if (!TOOL_PRESETS.includes(presetString as ToolPreset)) {
    return null
  }
  return presetString as ToolPreset
}

/** * 获取给定预设的工具名称列表
 * 过滤掉通过 isEnabled() 检查被禁用的工具
 * @param preset 预设名称
 * @returns 工具名称数组 */
export function getToolsForDefaultPreset(): string[] {
  const tools = getAllBaseTools()
  const isEnabled = tools.map(tool => tool.isEnabled())
  return tools.filter((_, i) => isEnabled[i]).map(tool => tool.name)
}

/** * 获取在当前环境中可能可用的所有工具的完整详尽列表
 * (遵循 process.env 标志)。
 * 这是所有工具的单一事实来源。 */
/** * 注意：为了跨用户缓存系统提示，这必须与 https://console.statsig.com/4aF3Ewatb6xPVpCwxb5nA3/dynamic_configs/claude_code_global_system_caching 保持同步。 */
export function getAllBaseTools(): Tools {
  return [
    AgentTool,
    TaskOutputTool,
    BashTool,
    // Ant-native builds have bfs/ugrep embedded in the bun binary (same ARGV0
    // trick as ripgrep). When available, find/grep in Claude's shell are aliased
    // to these fast tools, so the dedicated Glob/Grep tools are unnecessary.
    ...(hasEmbeddedSearchTools() ? [] : [GlobTool, GrepTool]),
    ExitPlanModeV2Tool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    NotebookEditTool,
    WebFetchTool,
    TodoWriteTool,
    WebSearchTool,
    TaskStopTool,
    AskUserQuestionTool,
    SkillTool,
    EnterPlanModeTool,
    ...(process.env.USER_TYPE === 'ant' ? [ConfigTool] : []),
    ...(process.env.USER_TYPE === 'ant' ? [TungstenTool] : []),
    ...(SuggestBackgroundPRTool ? [SuggestBackgroundPRTool] : []),
    ...(WebBrowserTool ? [WebBrowserTool] : []),
    ...(isTodoV2Enabled()
      ? [TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool]
      : []),
    ...(OverflowTestTool ? [OverflowTestTool] : []),
    ...(CtxInspectTool ? [CtxInspectTool] : []),
    ...(TerminalCaptureTool ? [TerminalCaptureTool] : []),
    ...(isEnvTruthy(process.env.ENABLE_LSP_TOOL) ? [LSPTool] : []),
    ...(isWorktreeModeEnabled() ? [EnterWorktreeTool, ExitWorktreeTool] : []),
    getSendMessageTool(),
    ...(ListPeersTool ? [ListPeersTool] : []),
    ...(isAgentSwarmsEnabled()
      ? [getTeamCreateTool(), getTeamDeleteTool()]
      : []),
    ...(VerifyPlanExecutionTool ? [VerifyPlanExecutionTool] : []),
    ...(process.env.USER_TYPE === 'ant' && REPLTool ? [REPLTool] : []),
    ...(WorkflowTool ? [WorkflowTool] : []),
    ...(SleepTool ? [SleepTool] : []),
    ...cronTools,
    ...(RemoteTriggerTool ? [RemoteTriggerTool] : []),
    ...(MonitorTool ? [MonitorTool] : []),
    BriefTool,
    ...(SendUserFileTool ? [SendUserFileTool] : []),
    ...(PushNotificationTool ? [PushNotificationTool] : []),
    ...(SubscribePRTool ? [SubscribePRTool] : []),
    ...(ReviewArtifactTool ? [ReviewArtifactTool] : []),
    ...(getPowerShellTool() ? [getPowerShellTool()] : []),
    ...(SnipTool ? [SnipTool] : []),
    ...(DiscoverSkillsTool ? [DiscoverSkillsTool] : []),
    ...(process.env.NODE_ENV === 'test' ? [TestingPermissionTool] : []),
    ListMcpResourcesTool,
    ReadMcpResourceTool,
    // Include ToolSearchTool when tool search might be enabled (optimistic check)
    // The actual decision to defer tools happens at request time in claude.ts
    ...(isToolSearchEnabledOptimistic() ? [ToolSearchTool] : []),
  ]
}

/** * 过滤掉被权限上下文完全拒绝的工具。
 * 如果存在一条匹配工具名称且没有 ruleContent（即对该工具的完全拒绝）的拒绝规则，则该工具被过滤掉。
 *
 * 使用与运行时权限检查（步骤 1a）相同的匹配器，因此像 `mcp__server` 这样的 MCP 服务器前缀规则会在模型看到该服务器的所有工具之前就将其全部剥离——而不仅仅是在调用时。 */
export function filterToolsByDenyRules<
  T extends {
    name: string
    mcpInfo?: { serverName: string; toolName: string }
  },
>(tools: readonly T[], permissionContext: ToolPermissionContext): T[] {
  return tools.filter(tool => !getDenyRuleForTool(permissionContext, tool))
}

export const getTools = (permissionContext: ToolPermissionContext): Tools => {
  // 简单模式：仅 Bash、Read 和 Edit 工具
  if (isEnvTruthy(process.env.CLAUDE_CODE_SIMPLE)) {
    // --bare + REPL 模式：REPL 在虚拟机内部包装 Bash/Read/Edit 等工具，所以
    // 返回 REPL 而不是原始基础工具。与非 bare 路径匹配，
    // 后者在启用 REPL 时也会隐藏 REPL_ONLY_TOOLS。
    if (isReplModeEnabled() && REPLTool) {
      const replSimple: Tool[] = [REPLTool]
      if (
        feature('COORDINATOR_MODE') &&
        coordinatorModeModule?.isCoordinatorMode()
      ) {
        replSimple.push(TaskStopTool, getSendMessageTool())
      }
      return filterToolsByDenyRules(replSimple, permissionContext)
    }
    const simpleTools: Tool[] = [BashTool, FileReadTool, FileEditTool]
    // 当协调器模式也激活时，包含 AgentTool 和 TaskStopTool
    // 这样协调器就能获得 Task+TaskStop（通过 useMergedTools 过滤），并且
    // 工作器获得 Bash/Read/Edit（通过 filterToolsForAgent 过滤）。
    if (
      feature('COORDINATOR_MODE') &&
      coordinatorModeModule?.isCoordinatorMode()
    ) {
      simpleTools.push(AgentTool, TaskStopTool, getSendMessageTool())
    }
    return filterToolsByDenyRules(simpleTools, permissionContext)
  }

  // 获取所有基础工具并过滤掉有条件添加的特殊工具
  const specialTools = new Set([
    ListMcpResourcesTool.name,
    ReadMcpResourceTool.name,
    SYNTHETIC_OUTPUT_TOOL_NAME,
  ])

  const tools = getAllBaseTools().filter(tool => !specialTools.has(tool.name))

  // 过滤掉被拒绝规则拒绝的工具
  let allowedTools = filterToolsByDenyRules(tools, permissionContext)

  // 当启用 REPL 模式时，隐藏原始工具的直接使用。
  // 在 REPL 中，它们仍然可以通过 VM 上下文访问。
  if (isReplModeEnabled()) {
    const replEnabled = allowedTools.some(tool =>
      toolMatchesName(tool, REPL_TOOL_NAME),
    )
    if (replEnabled) {
      allowedTools = allowedTools.filter(
        tool => !REPL_ONLY_TOOLS.has(tool.name),
      )
    }
  }

  const isEnabled = allowedTools.map(_ => _.isEnabled())
  return allowedTools.filter((_, i) => isEnabled[i])
}

/** * 为给定的权限上下文和 MCP 工具组装完整的工具池。
 *
 * 这是将内置工具与 MCP 工具结合的唯一事实来源。
 * REPL.tsx（通过 useMergedTools 钩子）和 runAgent.ts（用于协调器工作线程）
 * 都使用此函数来确保工具池组装的一致性。
 *
 * 该函数：
 * 1. 通过 getTools() 获取内置工具（遵循模式过滤）
 * 2. 根据拒绝规则过滤 MCP 工具
 * 3. 按工具名称去重（内置工具优先）
 *
 * @param permissionContext - 用于过滤内置工具的权限上下文
 * @param mcpTools - 来自 appState.mcp.tools 的 MCP 工具
 * @returns 合并、去重后的内置工具和 MCP 工具数组 */
export function assembleToolPool(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
): Tools {
  const builtInTools = getTools(permissionContext)

  // 过滤掉拒绝列表中的 MCP 工具
  const allowedMcpTools = filterToolsByDenyRules(mcpTools, permissionContext)

  // 对每个分区进行排序以确保提示缓存的稳定性，保持内置工具作为
  // 连续的前缀。服务器的 claude_code_system_cache_policy 在最后一个前缀匹配的内置工具之后放置一个
  // 全局缓存断点；如果进行扁平排序，MCP 工具会与内置工具交错，每当一个 MCP 工具排序到现有内置工具之间时，都会使所有下游
  // 缓存键失效。uniqBy
  // 保留插入顺序，因此在名称冲突时内置工具胜出。
  // 避免使用 Array.toSorted（Node 20+）——我们支持 Node 18。builtInTools 是
  // 只读的，因此先复制再排序；allowedMcpTools 是 .filter() 的新结果。
  // * 获取所有工具，包括内置工具和 MCP 工具。
  const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name)
  return uniqBy(
    [...builtInTools].sort(byName).concat(allowedMcpTools.sort(byName)),
    'name',
  )
}

/** * 获取所有工具，包括内置工具和 MCP 工具。
 *
 * 当您需要完整的工具列表用于以下场景时，这是首选函数：
 * - 工具搜索阈值计算（isToolSearchEnabled）
 * - 包含 MCP 工具的令牌计数
 * - 任何应考虑 MCP 工具的上下文
 *
 * 仅当您明确只需要内置工具时，才使用 getTools()。
 *
 * @param permissionContext - 用于过滤内置工具的权限上下文
 * @param mcpTools - 来自 appState.mcp.tools 的 MCP 工具
 * @returns 内置工具和 MCP 工具的组合数组 */
export function getMergedTools(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools,
): Tools {
  const builtInTools = getTools(permissionContext)
  return [...builtInTools, ...mcpTools]
}
