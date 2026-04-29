import { feature } from 'bun:bundle'
import type { UUID } from 'crypto'
import { randomUUID } from 'crypto'
import uniqBy from 'lodash-es/uniqBy.js'
import { logForDebugging } from 'src/utils/debug.js'
import { getProjectRoot, getSessionId } from 'src/bootstrap/state.js'
import { getCommand, getSkillToolCommands, hasCommand } from 'src/commands.js'
import {
  DEFAULT_AGENT_PROMPT,
  enhanceSystemPromptWithEnvDetails,
} from 'src/constants/prompts.js'
import type { QuerySource } from 'src/constants/querySource.js'
import { getSystemContext, getUserContext } from 'src/context.js'
import type { CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import { query } from 'src/query.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { getDumpPromptsPath } from 'src/services/api/dumpPrompts.js'
import { cleanupAgentTracking } from 'src/services/api/promptCacheBreakDetection.js'
import {
  connectToServer,
  fetchToolsForClient,
} from 'src/services/mcp/client.js'
import { getMcpConfigByName } from 'src/services/mcp/config.js'
import type {
  MCPServerConnection,
  ScopedMcpServerConfig,
} from 'src/services/mcp/types.js'
import type { Tool, Tools, ToolUseContext } from 'src/Tool.js'
import { killShellTasksForAgent } from 'src/tasks/LocalShellTask/killShellTasks.js'
import type { Command } from 'src/types/command.js'
import type { AgentId } from 'src/types/ids.js'
import type {
  AssistantMessage,
  Message,
  ProgressMessage,
  RequestStartEvent,
  StreamEvent,
  SystemCompactBoundaryMessage,
  TombstoneMessage,
  ToolUseSummaryMessage,
  UserMessage,
} from 'src/types/message.js'
import { createAttachmentMessage } from 'src/utils/attachments.js'
import { AbortError } from 'src/utils/errors.js'
import { getDisplayPath } from 'src/utils/file.js'
import {
  cloneFileStateCache,
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
} from 'src/utils/fileStateCache.js'
import {
  type CacheSafeParams,
  createSubagentContext,
} from 'src/utils/forkedAgent.js'
import { registerFrontmatterHooks } from 'src/utils/hooks/registerFrontmatterHooks.js'
import { clearSessionHooks } from 'src/utils/hooks/sessionHooks.js'
import { executeSubagentStartHooks } from 'src/utils/hooks.js'
import { createUserMessage } from 'src/utils/messages.js'
import { getAgentModel } from 'src/utils/model/agent.js'
import { getAPIProvider } from 'src/utils/model/providers.js'
import {
  createSubagentTrace,
  endTrace,
  isLangfuseEnabled,
} from 'src/services/langfuse/index.js'
import type { ModelAlias } from 'src/utils/model/aliases.js'
import {
  clearAgentTranscriptSubdir,
  recordSidechainTranscript,
  setAgentTranscriptSubdir,
  writeAgentMetadata,
} from 'src/utils/sessionStorage.js'
import {
  isRestrictedToPluginOnly,
  isSourceAdminTrusted,
} from 'src/utils/settings/pluginOnlyPolicy.js'
import {
  asSystemPrompt,
  type SystemPrompt,
} from 'src/utils/systemPromptType.js'
import {
  isPerfettoTracingEnabled,
  registerAgent as registerPerfettoAgent,
  unregisterAgent as unregisterPerfettoAgent,
} from 'src/utils/telemetry/perfettoTracing.js'
import type { ContentReplacementState } from 'src/utils/toolResultStorage.js'
import { createAgentId } from 'src/utils/uuid.js'
import { resolveAgentTools } from './agentToolUtils.js'
import { filterIncompleteToolCalls } from './filterIncompleteToolCalls.js'
import { type AgentDefinition, isBuiltInAgent } from './loadAgentsDir.js'

export { filterIncompleteToolCalls } from './filterIncompleteToolCalls.js'

/**
 * Initialize agent-specific MCP servers
 * Agents can define their own MCP servers in their frontmatter that are additive
 * to the parent's MCP clients. These servers are connected when the agent starts
 * and cleaned up when the agent finishes.
 *
 * @param agentDefinition The agent definition with optional mcpServers
 * @param parentClients MCP clients inherited from parent context
 * @returns Merged clients (parent + agent-specific), agent MCP tools, and cleanup function
 */
async function initializeAgentMcpServers(
  agentDefinition: AgentDefinition,
  parentClients: MCPServerConnection[],
): Promise<{
  clients: MCPServerConnection[]
  tools: Tools
  cleanup: () => Promise<void>
}> {
  // 如果未定义智能体特定的服务器，则原样返回父级客户端
  if (!agentDefinition.mcpServers?.length) {
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {},
    }
  }

  // 当 MCP 被锁定为仅限插件时，仅对 USER-CONTROLLED 类
  // 型的智能体跳过 frontmatter 中的 MCP 服务器。插件、内置和 p
  // olicySettings 智能体是受管理员信任的——它们的 frontma
  // tter MCP 是管理员批准功能面的一部分。阻止它们（如最初版本所做）会破
  // 坏那些合法需要 MCP 的插件智能体，这与“插件提供的始终加载”原则相悖。
  const agentIsAdminTrusted = isSourceAdminTrusted(agentDefinition.source)
  if (isRestrictedToPluginOnly('mcp') && !agentIsAdminTrusted) {
    logForDebugging(
      `[智能体: ${agentDefinition.agentType}] 跳过 MCP 服务器：strictPluginOnlyCustomization 将 MCP 锁定为仅限插件（智能体来源: ${agentDefinition.source}）`,
    )
    return {
      clients: parentClients,
      tools: [],
      cleanup: async () => {},
    }
  }

  const agentClients: MCPServerConnection[] = []
  // 追踪哪些客户端是新创建的（内联定义），哪些是从父级共享
  // 的。只有新创建的客户端才应在智能体结束时被清理。
  const newlyCreatedClients: MCPServerConnection[] = []
  const agentTools: Tool[] = []

  for (const spec of agentDefinition.mcpServers) {
    let config: ScopedMcpServerConfig | null = null
    let name: string
    let isNewlyCreated = false

    if (typeof spec === 'string') {
      // 按名称引用 - 在现有的 MCP 配置中查找。这使用了已
      // 缓存的 connectToServer，因此我们可能会获得一个共享的客户端。
      name = spec
      config = getMcpConfigByName(spec)
      if (!config) {
        logForDebugging(
          `[智能体: ${agentDefinition.agentType}] 未找到 MCP 服务器: ${spec}`,
          { level: 'warn' },
        )
        continue
      }
    } else {
      // 内联定义为 { [name]: co
      // nfig }。这些是特定于智能体的服务器，应该被清理。
      const entries = Object.entries(spec)
      if (entries.length !== 1) {
        logForDebugging(
          `[智能体: ${agentDefinition.agentType}] 无效的 MCP 服务器规范：预期恰好有一个键`,
          { level: 'warn' },
        )
        continue
      }
      const [serverName, serverConfig] = entries[0]!
      name = serverName
      config = {
        ...serverConfig,
        scope: 'dynamic' as const,
      } as ScopedMcpServerConfig
      isNewlyCreated = true
    }

    // 连接到服务器
    const client = await connectToServer(name, config)
    agentClients.push(client)
    if (isNewlyCreated) {
      newlyCreatedClients.push(client)
    }

    // 如果已连接则获取工具
    if (client.type === 'connected') {
      const tools = await fetchToolsForClient(client)
      agentTools.push(...tools)
      logForDebugging(
        `[智能体: ${agentDefinition.agentType}] 已连接到 MCP 服务器 '${name}'，拥有 ${tools.length} 个工具`,
      )
    } else {
      logForDebugging(
        `[智能体: ${agentDefinition.agentType}] 连接到 MCP 服务器 '${name}' 失败: ${client.type}`,
        { level: 'warn' },
      )
    }
  }

  // 为智能体特定的服务器创建清理函数。仅
  // 清理新创建的客户端（内联定义），不清理共享/引用的客户端。
  // 共享客户端（通过字符串名称引用）已被缓存并由父级上下文使用。
  const cleanup = async () => {
    for (const client of newlyCreatedClients) {
      if (client.type === 'connected') {
        try {
          await client.cleanup()
        } catch (error) {
          logForDebugging(
            `[智能体: ${agentDefinition.agentType}] 清理 MCP 服务器 '${client.name}' 时出错: ${error}`,
            { level: 'warn' },
          )
        }
      }
    }
  }

  // 返回合并后的客户端（父级 + 智能体特定）以及智能体工具
  return {
    clients: [...parentClients, ...agentClients],
    tools: agentTools,
    cleanup,
  }
}

type QueryMessage =
  | StreamEvent
  | RequestStartEvent
  | Message
  | ToolUseSummaryMessage
  | TombstoneMessage

/** 类型守卫，用于检查来自 query() 的消息是否为可记录的 Message 类型。
匹配我们想要记录的类型：assistant、user、progress 或 system compact_boundary。 */
function isRecordableMessage(
  msg: QueryMessage,
): msg is
  | AssistantMessage
  | UserMessage
  | ProgressMessage
  | SystemCompactBoundaryMessage {
  return (
    msg.type === 'assistant' ||
    msg.type === 'user' ||
    msg.type === 'progress' ||
    (msg.type === 'system' &&
      'subtype' in msg &&
      msg.subtype === 'compact_boundary')
  )
}

export async function* runAgent({
  agentDefinition,
  promptMessages,
  toolUseContext,
  canUseTool,
  isAsync,
  canShowPermissionPrompts,
  forkContextMessages,
  querySource,
  override,
  model,
  maxTurns,
  preserveToolUseResults,
  availableTools,
  allowedTools,
  onCacheSafeParams,
  contentReplacementState,
  useExactTools,
  worktreePath,
  description,
  transcriptSubdir,
  onQueryProgress,
}: {
  agentDefinition: AgentDefinition
  promptMessages: Message[]
  toolUseContext: ToolUseContext
  canUseTool: CanUseToolFn
  isAsync: boolean
  /** 此智能体是否可以显示权限提示。默认为 !isAsync。
对于运行异步但共享终端的进程内队友，设置为 true。 */
  canShowPermissionPrompts?: boolean
  forkContextMessages?: Message[]
  querySource: QuerySource
  override?: {
    userContext?: { [k: string]: string }
    systemContext?: { [k: string]: string }
    systemPrompt?: SystemPrompt
    abortController?: AbortController
    agentId?: AgentId
  }
  model?: ModelAlias
  maxTurns?: number
  /** 为具有可查看转录的子智能体在消息上保留 toolUseResult。 */
  preserveToolUseResults?: boolean
  /** 为工作器智能体预计算好的工具池。由调用者（AgentTool.tsx）计算，以避免 runAgent 和 tools.ts 之间的循环依赖。
始终包含使用工作器自身权限模式组装的完整工具池，独立于父级的工具限制。 */
  availableTools: Tools
  /** 要添加到智能体会话允许规则中的工具权限规则。
当提供时，将替换所有允许规则，因此智能体只拥有明确列出的规则（父级的批准不会泄漏过来）。 */
  allowedTools?: string[]
  /** 在构建智能体的系统提示、上下文和工具后，使用 CacheSafeParams 调用的可选回调。用于后台摘要功能，以分叉智能体的对话进行定期进度摘要。 */
  onCacheSafeParams?: (params: CacheSafeParams) => void
  /** 从恢复的侧链转录重建的替换状态，以便重新替换相同的工具结果（提示缓存稳定性）。
当省略时，createSubagentContext 会克隆父级的状态。 */
  contentReplacementState?: ContentReplacementState
  /** 当为 true 时，直接使用 availableTools，而不通过 resolveAgentTools() 进行过滤。同时继承父级的 thinkingConfig 和 isNonInteractiveSession，而不是覆盖它们。用于分叉子智能体路径，以生成字节完全相同的 API 请求前缀，以实现提示缓存命中。 */
  useExactTools?: boolean
  /** 如果智能体以隔离模式 "worktree" 启动，则为其工作树路径。
持久化到元数据中，以便恢复时可以恢复正确的 cwd。 */
  worktreePath?: string
  /** 来自 AgentTool 输入的原始任务描述。持久化到元数据中，以便恢复的智能体的通知可以显示原始描述。 */
  description?: string
  /** subagents/ 下的可选子目录，用于将此智能体的转录与相关转录分组（例如，工作流子智能体的 workflows/<runId>）。 */
  transcriptSubdir?: string
  /** 在 query() 产生的每条消息上触发的可选回调——包括 runAgent 通常会丢弃的 stream_event 增量。用于在长时间单块流（例如思考）期间检测活跃性，其中超过 60 秒没有产生 assistant 消息。 */
  onQueryProgress?: () => void
}): AsyncGenerator<Message, void> {
  // 追踪子智能体使用情况以进行功能发现

  const appState = toolUseContext.getAppState()
  const permissionMode = appState.toolPermissionContext.mode
  // 始终共享的通往根 AppState 存储的通道。当*父级*本身是一个异步智能体
  // 时（嵌套异步→异步），toolUseContext.setAppState
  // 是一个空操作，因此会话范围的写入（钩子、bash 任务）必须通过此通道进行。
  const rootSetAppState =
    toolUseContext.setAppStateForTasks ?? toolUseContext.setAppState

  const resolvedAgentModel = getAgentModel(
    agentDefinition.model,
    toolUseContext.options.mainLoopModel,
    model,
    permissionMode,
  )

  const agentId = override?.agentId ? override.agentId : createAgentId()

  // 如果请求，将此代理的转录路由到分组子目录中（例如，工作流子代理写入
  // 子代理/工作流/<runId>/）。
  if (transcriptSubdir) {
    setAgentTranscriptSubdir(agentId, transcriptSubdir)
  }

  // 在 Perfetto 跟踪中注册代理，用于层次结构可视化
  if (isPerfettoTracingEnabled()) {
    const parentId = toolUseContext.agentId ?? getSessionId()
    registerPerfettoAgent(agentId, agentDefinition.agentType, parentId)
  }

  // 记录子代理的 API 调用路径（仅限 ant）
  if (process.env.USER_TYPE === 'ant') {
    logForDebugging(
      `[子代理 ${agentDefinition.agentType}] API 调用：${getDisplayPath(getDumpPromptsPath(agentId))}`,
    )
  }

  // 处理消息分叉以共享上下文。过
  // 滤掉父消息中不完整的工具调用，以避免 API 错误
  const contextMessages: Message[] = forkContextMessages
    ? filterIncompleteToolCalls(forkContextMessages)
    : []
  const initialMessages: Message[] = [...contextMessages, ...promptMessages]

  const agentReadFileState =
    forkContextMessages !== undefined
      ? cloneFileStateCache(toolUseContext.readFileState)
      : createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE)

  const [baseUserContext, baseSystemContext] = await Promise.all([
    override?.userContext ?? getUserContext(),
    override?.systemContext ?? getSystemContext(),
  ])

  // 只读代理（探索、计划）不执行 CLAUDE.md 中的提交/PR/代码检查规则
  // ——主代理拥有完整上下文并解释它们的输出。在此处丢弃 claudeMd 可在超
  // 过 3400 万次探索生成中每周节省约 5-15 Gtok。调用方显式设置的
  // override.userContext 保持不变。终止开关默认开启；设
  // 置 tengu_slim_subagent_claudemd=false 可恢复原状。
  const shouldOmitClaudeMd =
    agentDefinition.omitClaudeMd &&
    !override?.userContext &&
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_slim_subagent_claudemd', true)
  const { claudeMd: _omittedClaudeMd, ...userContextNoClaudeMd } =
    baseUserContext
  const resolvedUserContext = shouldOmitClaudeMd
    ? userContextNoClaudeMd
    : baseUserContext

  // 探索/计划是只读搜索代理——父会话启动时的 gitStatus（
  // 最多 40KB，明确标记为过时）是冗余负担。如果它们需要 git 信息
  // ，会自行运行 `git status` 以获取最新数据。全舰队每
  // 周可节省约 1-3 Gtok。
  const { gitStatus: _omittedGitStatus, ...systemContextNoGit } =
    baseSystemContext
  const resolvedSystemContext =
    agentDefinition.agentType === 'Explore' ||
    agentDefinition.agentType === 'Plan'
      ? systemContextNoGit
      : baseSystemContext

  // 如果代理定义了权限模式，则覆盖它。但是，如果父级处
  // 于 bypassPermissions 或 acceptEdits 模式，则不覆盖——这些模式应始终优先。对于异步代理，还需设
  // 置 shouldAvoidPermissionPrompts，因为它们无法显示 UI。
  const agentPermissionMode = agentDefinition.permissionMode
  const agentGetAppState = () => {
    const state = toolUseContext.getAppState()
    let toolPermissionContext = state.toolPermissionContext

    // 如果代理定义了权限模式，则覆盖它（除非父级处于 bypassPermissions、acceptEdits 或 auto 模式）
    if (
      agentPermissionMode &&
      state.toolPermissionContext.mode !== 'bypassPermissions' &&
      state.toolPermissionContext.mode !== 'acceptEdits' &&
      !(
        feature('TRANSCRIPT_CLASSIFIER') &&
        state.toolPermissionContext.mode === 'auto'
      )
    ) {
      toolPermissionContext = {
        ...toolPermissionContext,
        mode: agentPermissionMode,
      }
    }

    // 为无法显示 UI 的代理设置自动拒绝提示的标志。如果提供了
    // 显式的 canShowPermissionPrompts，则
    // 使用它；否则：- bubble 模式：始终显示提示（冒泡到父终
    // 端）- 默认：!isAsync（同步代理显示提示，异步代理不显示）
    const shouldAvoidPrompts =
      canShowPermissionPrompts !== undefined
        ? !canShowPermissionPrompts
        : agentPermissionMode === 'bubble'
          ? false
          : isAsync
    if (shouldAvoidPrompts) {
      toolPermissionContext = {
        ...toolPermissionContext,
        shouldAvoidPermissionPrompts: true,
      }
    }

    // 对于可以显示提示的后台代理，在显示权限对话框之前等
    // 待自动化检查（分类器、权限钩子）。由于这些是后台代理
    // ，等待是可以的——用户只应在自动化检查无法解决权限问
    // 题时被打断。这适用于 bubble 模式（始终）和显式
    // 的 canShowPermissionPrompts。
    if (isAsync && !shouldAvoidPrompts) {
      toolPermissionContext = {
        ...toolPermissionContext,
        awaitAutomatedChecksBeforeDialog: true,
      }
    }

    // 作用域工具权限：当提供了 allowedTools 时，将其用作会话
    // 规则。重要：保留 cliArg 规则（来自 SDK 的 --a
    // llowedTools），因为这些是 SDK 使用者指定的显式
    // 权限，应适用于所有代理。仅清除父级的会话级规则，以防止意外泄漏。
    if (allowedTools !== undefined) {
      toolPermissionContext = {
        ...toolPermissionContext,
        alwaysAllowRules: {
          // 保留来自 --allowedTools 的 SDK 级权限
          cliArg: state.toolPermissionContext.alwaysAllowRules.cliArg,
          // 使用提供的 allowedTools 作为会话级权限
          session: [...allowedTools],
        },
      }
    }

    // 如果代理定义了工作级别，则覆盖它
    const effortValue =
      agentDefinition.effort !== undefined
        ? agentDefinition.effort
        : state.effortValue

    if (
      toolPermissionContext === state.toolPermissionContext &&
      effortValue === state.effortValue
    ) {
      return state
    }
    return {
      ...state,
      toolPermissionContext,
      effortValue,
    }
  }

  const resolvedTools = useExactTools
    ? availableTools
    : resolveAgentTools(agentDefinition, availableTools, isAsync).resolvedTools

  const additionalWorkingDirectories = Array.from(
    appState.toolPermissionContext.additionalWorkingDirectories.keys(),
  )

  const agentSystemPrompt = override?.systemPrompt
    ? override.systemPrompt
    : asSystemPrompt(
        await getAgentSystemPrompt(
          agentDefinition,
          toolUseContext,
          resolvedAgentModel,
          additionalWorkingDirectories,
          resolvedTools,
        ),
      )

  // 确定 abortCon
  // troller：- 覆
  // 盖项优先- 异步代理获取一个新的、无关联的控制器（独立
  // 运行）- 同步代理共享父级的控制器
  const agentAbortController = override?.abortController
    ? override.abortController
    : isAsync
      ? new AbortController()
      : toolUseContext.abortController

  // 执行 SubagentStart 钩子并收集额外上下文
  const additionalContexts: string[] = []
  for await (const hookResult of executeSubagentStartHooks(
    agentId,
    agentDefinition.agentType,
    agentAbortController.signal,
  )) {
    if (
      hookResult.additionalContexts &&
      hookResult.additionalContexts.length > 0
    ) {
      additionalContexts.push(...hookResult.additionalContexts)
    }
  }

  // 将 SubagentStart 钩子上下文添加为用户消息（与 SessionStart/UserPromptSubmit 保持一致）
  if (additionalContexts.length > 0) {
    const contextMessage = createAttachmentMessage({
      type: 'hook_additional_context',
      content: additionalContexts,
      hookName: 'SubagentStart',
      toolUseID: randomUUID(),
      hookEvent: 'SubagentStart',
    })
    initialMessages.push(contextMessage)
  }

  // 注册代理的前置元数据钩子（作用域限定于代理生命周期）。传递
  // isAgent=true 以将 Stop 钩子转换为 SubagentStop（因为子
  // 代理触发 SubagentStop）。前置元数据钩子采用相同的管
  // 理员信任门控：仅在 ["hooks"] 下（skills/a
  // gents 未锁定），用户代理仍会加载——在此处（已知来源）阻止
  // 它们的前置元数据钩子注册，而不是在执行时全面阻止所有会话钩子
  // （那样也会杀死插件代理的钩子）。
  const hooksAllowedForThisAgent =
    !isRestrictedToPluginOnly('hooks') ||
    isSourceAdminTrusted(agentDefinition.source)
  if (agentDefinition.hooks && hooksAllowedForThisAgent) {
    registerFrontmatterHooks(
      rootSetAppState,
      agentId,
      agentDefinition.hooks,
      `代理 '${agentDefinition.agentType}'`,
      true, // isAgent - 将 Stop 转换为 SubagentStop
    )
  }

  // 从代理前置元数据预加载技能
  const skillsToPreload = agentDefinition.skills ?? []
  if (skillsToPreload.length > 0) {
    const allSkills = await getSkillToolCommands(getProjectRoot())

    // 过滤有效技能并警告缺失的技能
    const validSkills: Array<{
      skillName: string
      skill: (typeof allSkills)[0] & { type: 'prompt' }
    }> = []

    for (const skillName of skillsToPreload) {
      // 解析技能名称，尝试多种策略：1. 精确匹配（hasComm
      // and 检查 name、userFacingName、aliases）2.
      // 使用代理的插件前缀完全限定（例如，"my-skill" → "plugin:my-skill"
      // ）3. 对插件命名空间的技能进行 ":skillName" 后缀匹配
      const resolvedName = resolveSkillName(
        skillName,
        allSkills,
        agentDefinition,
      )
      if (!resolvedName) {
        logForDebugging(
          `[代理：${agentDefinition.agentType}] 警告：在前置元数据中指定的技能 '${skillName}' 未找到`,
          { level: 'warn' },
        )
        continue
      }

      const skill = getCommand(resolvedName, allSkills)
      if (skill.type !== 'prompt') {
        logForDebugging(
          `[代理：${agentDefinition.agentType}] 警告：技能 '${skillName}' 不是基于提示的技能`,
          { level: 'warn' },
        )
        continue
      }
      validSkills.push({ skillName, skill })
    }

    // 并发加载所有技能内容并添加到初始消息中
    const { formatSkillLoadingMetadata } = await import(
      'src/utils/processUserInput/processSlashCommand.js'
    )
    const loaded = await Promise.all(
      validSkills.map(async ({ skillName, skill }) => ({
        skillName,
        skill,
        content: await skill.getPromptForCommand('', toolUseContext),
      })),
    )
    for (const { skillName, skill, content } of loaded) {
      logForDebugging(
        `[代理：${agentDefinition.agentType}] 已预加载技能 '${skillName}'`,
      )

      // 添加命令消息元数据，以便 UI 显示正在加载哪个技能
      const metadata = formatSkillLoadingMetadata(
        skillName,
        skill.progressMessage,
      )

      initialMessages.push(
        createUserMessage({
          content: [{ type: 'text', text: metadata }, ...content],
          isMeta: true,
        }),
      )
    }
  }

  // 初始化代理特定的 MCP 服务器（附加到父级的服务器）
  const {
    clients: mergedMcpClients,
    tools: agentMcpTools,
    cleanup: mcpCleanup,
  } = await initializeAgentMcpServers(
    agentDefinition,
    toolUseContext.options.mcpClients,
  )

  // 将代理的 MCP 工具与已解析的代理工具合并，按名称去重。resolve
  // dTools 已经去重（参见 resolveAgentTools），因
  // 此当没有代理特定的 MCP 工具时，跳过展开 + uniqBy 的开销。
  const allTools =
    agentMcpTools.length > 0
      ? uniqBy([...resolvedTools, ...agentMcpTools], 'name')
      : resolvedTools

  // 构建代理特定的选项
  const agentOptions: ToolUseContext['options'] = {
    isNonInteractiveSession: useExactTools
      ? toolUseContext.options.isNonInteractiveSession
      : isAsync
        ? true
        : (toolUseContext.options.isNonInteractiveSession ?? false),
    appendSystemPrompt: toolUseContext.options.appendSystemPrompt,
    tools: allTools,
    commands: [],
    debug: toolUseContext.options.debug,
    verbose: toolUseContext.options.verbose,
    mainLoopModel: resolvedAgentModel,
    // 对于分支子代理（useExactTools），继承思考配
    // 置以匹配父级 API 请求前缀，以便命中提示缓存
    // 。对于常规子代理，禁用思考以控制输出令牌成本。
    thinkingConfig: useExactTools
      ? toolUseContext.options.thinkingConfig
      : { type: 'disabled' as const },
    mcpClients: mergedMcpClients,
    mcpResources: toolUseContext.options.mcpResources,
    agentDefinitions: toolUseContext.options.agentDefinitions,
    // 分支子代理（useExactTools 路径）需要在 context.options
    // 上设置 querySource，用于 AgentTool.tsx call
    // () 中的递归分支守卫——它检查 options.querySource === '
    // agent:builtin:fork'。这在自动压缩后依然存在（自动压缩会重写消息，
    // 而非 context.options）。没有此项，守卫会读取 undefin
    // ed，仅触发消息扫描回退——而自动压缩会替换分支样板消息，从而破坏此回退。
    ...(useExactTools && { querySource }),
  }

  // 使用共享辅助函数创建子代理上下文 - 同步代理与
  // 父级共享 setAppState、setResponseLength、abortCont
  // roller - 异步代理完全隔离（但具有显式未链接的 abortController）
  const agentToolUseContext = createSubagentContext(toolUseContext, {
    options: agentOptions,
    agentId,
    agentType: agentDefinition.agentType,
    messages: initialMessages,
    readFileState: agentReadFileState,
    abortController: agentAbortController,
    getAppState: agentGetAppState,
    // 同步代理与父级共享这些回调
    shareSetAppState: !isAsync,
    shareSetResponseLength: true, // 同步和异步代理均计入响应指标
    criticalSystemReminder_EXPERIMENTAL:
      agentDefinition.criticalSystemReminder_EXPERIMENTAL,
    contentReplacementState,
  })

  // 为具有可查看记录的子代理（进程内队友）保留工具使用结果
  if (preserveToolUseResults) {
    agentToolUseContext.preserveToolUseResults = true
  }

  // 为后台摘要（提示缓存共享）暴露缓存安全参数
  if (onCacheSafeParams) {
    onCacheSafeParams({
      systemPrompt: agentSystemPrompt,
      userContext: resolvedUserContext,
      systemContext: resolvedSystemContext,
      toolUseContext: agentToolUseContext,
      forkContextMessages: initialMessages,
    })
  }

  // 在查询循环开始前记录初始消息，以及 agentT
  // ype，以便在子代理类型缺失时恢复能正确路由。两
  // 项写入均为即发即弃——持久化失败不应阻塞代理。
  void recordSidechainTranscript(initialMessages, agentId).catch(_err =>
    logForDebugging(`记录侧链记录失败：${_err}`),
  )
  void writeAgentMetadata(agentId, {
    agentType: agentDefinition.agentType,
    ...(worktreePath && { worktreePath }),
    ...(description && { description }),
  }).catch(_err => logForDebugging(`写入代理元数据失败：${_err}`))

  // 跟踪最后记录的消息 UUID 以保持父链连续性
  let lastRecordedUuid: UUID | null = initialMessages.at(-1)?.uuid ?? null

  // 创建 Langfuse 子代理追踪（若未配置则为空操作）
  // 。子代理追踪与父级共享相同的 sessionId，因此 Lang
  // fuse 将它们分组在同一会话视图下。
  const subTrace = isLangfuseEnabled()
    ? createSubagentTrace({
        sessionId: getSessionId(),
        agentType: agentDefinition.agentType,
        agentId,
        model: resolvedAgentModel,
        provider: getAPIProvider(),
        input: initialMessages,
      })
    : null

  // 将子代理追踪附加到 toolUseContext，以便 query() 复用
  if (subTrace) {
    agentToolUseContext.langfuseTrace = subTrace
  }

  try {
    for await (const message of query({
      messages: initialMessages,
      systemPrompt: agentSystemPrompt,
      userContext: resolvedUserContext,
      systemContext: resolvedSystemContext,
      canUseTool,
      toolUseContext: agentToolUseContext,
      querySource,
      maxTurns: maxTurns ?? agentDefinition.maxTurns,
    })) {
      onQueryProgress?.()
      // 将子代理 API 请求开始转发到父级的指标显示，以便在
      // 子代理执行期间更新 TTFT/OTPS。
      if (
        message.type === 'stream_event' &&
        (message as any).event.type === 'message_start' &&
        (message as any).ttftMs != null
      ) {
        toolUseContext.pushApiMetricsEntry?.((message as any).ttftMs)
        continue
      }

      // 生成附件消息（例如 structured_output）而不记录它们
      if (message.type === 'attachment') {
        // 处理来自 query.ts 的最大轮次达到信号
        if ((message as any).attachment.type === 'max_turns_reached') {
          logForDebugging(
            `[代理
: $
{
  agentDefinition.agentType
}
] 达到最大轮次限制 ($
{
  (message as any).attachment.maxTurns
}
)`,
          )
          break
        }
        yield message as Message
        continue
      }

      if (isRecordableMessage(message)) {
        // 仅记录具有正确父级的新消息（每条消息 O(1)）
        await recordSidechainTranscript(
          [message],
          agentId,
          lastRecordedUuid,
        ).catch(err =>
          logForDebugging(`记录侧链记录失败：${err}`),
        )
        if (message.type !== 'progress') {
          lastRecordedUuid = message.uuid
        }
        yield message
      }
    }

    if (agentAbortController.signal.aborted) {
      throw new AbortError()
    }

    // 如果提供了回调则运行（仅内置代理具有回调）
    if (isBuiltInAgent(agentDefinition) && agentDefinition.callback) {
      agentDefinition.callback()
    }
  } finally {
    // 结束 Langfuse 子代理追踪（若未配置则为空操作）
    endTrace(subTrace)
    // 清理代理特定的 MCP 服务器（在正常完成、中止或错误时运行）
    await mcpCleanup()
    // 清理代理的会话钩子
    if (agentDefinition.hooks) {
      clearSessionHooks(rootSetAppState, agentId)
    }
    // 清理此代理的提示缓存跟踪状态
    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      cleanupAgentTracking(agentId)
    }
    // 释放克隆的文件状态缓存内存
    agentToolUseContext.readFileState.clear()
    // 释放克隆的分支上下文消息
    initialMessages.length = 0
    // 释放 perfetto 代理注册表条目
    unregisterPerfettoAgent(agentId)
    // 释放记录子目录映射
    clearAgentTranscriptSubdir(agentId)
    // 释放此代理的待办事项条目。若不执行此操作，每个调用 TodoWri
    // te 的子代理都会在 AppState.todos 中永久留下一个键（
    // 即使所有项目都已完成，其值变为 []，但键仍会保留）。鲸鱼会话会
    // 生成数百个代理；每个孤立的键都是一个微小的内存泄漏，累积起来影响显著。
    rootSetAppState(prev => {
      if (!(agentId in prev.todos)) return prev
      const { [agentId]: _removed, ...todos } = prev.todos
      return { ...prev, todos }
    })
    // 终止此代理生成的任何后台 bash 任务。若不执行此操作，一旦主会话最终退出，
    // `run_in_background` shell 循环（例如测试夹具 fake-l
    // ogs.sh）将在 PPID=1 的情况下作为僵尸进程存活，超过代理的生命周期。
    killShellTasksForAgent(agentId, toolUseContext.getAppState, rootSetAppState)
    /* eslint-disable @typescript-eslint/no-require-imports */
    if (feature('MONITOR_TOOL')) {
      const mcpMod =
        require('src/tasks/MonitorMcpTask/MonitorMcpTask.js') as typeof import('src/tasks/MonitorMcpTask/MonitorMcpTask.js')
      mcpMod.killMonitorMcpTasksForAgent(
        agentId,
        toolUseContext.getAppState,
        rootSetAppState,
      )
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
  }
}

async function getAgentSystemPrompt(
  agentDefinition: AgentDefinition,
  toolUseContext: Pick<ToolUseContext, 'options'>,
  resolvedAgentModel: string,
  additionalWorkingDirectories: string[],
  resolvedTools: readonly Tool[],
): Promise<string[]> {
  const enabledToolNames = new Set(resolvedTools.map(t => t.name))
  try {
    const agentPrompt = agentDefinition.getSystemPrompt({ toolUseContext })
    const prompts = [agentPrompt]

    return await enhanceSystemPromptWithEnvDetails(
      prompts,
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames,
    )
  } catch (_error) {
    return enhanceSystemPromptWithEnvDetails(
      [DEFAULT_AGENT_PROMPT],
      resolvedAgentModel,
      additionalWorkingDirectories,
      enabledToolNames,
    )
  }
}

/** 从代理 frontmatter 中解析技能名称到已注册的命令名称。

插件技能以命名空间名称注册（例如 "my-plugin:my-skill"），
但代理使用裸名称引用它们（例如 "my-skill"）。此函数
尝试多种解析策略：

1. 通过 hasCommand（名称、userFacingName、别名）进行精确匹配
2. 添加代理的插件名称作为前缀（例如 "my-skill" → "my-plugin:my-skill"）
3. 后缀匹配 — 查找任何名称以 ":skillName" 结尾的命令 */
function resolveSkillName(
  skillName: string,
  allSkills: Command[],
  agentDefinition: AgentDefinition,
): string | null {
  // 1. 直接匹配
  if (hasCommand(skillName, allSkills)) {
    return skillName
  }

  // 2. 尝试添加代理的插件名称作为前缀 插件代理的 age
  // ntType 格式类似 "pluginName:agentName"
  const pluginPrefix = agentDefinition.agentType.split(':')[0]
  if (pluginPrefix) {
    const qualifiedName = `${pluginPrefix}:${skillName}`
    if (hasCommand(qualifiedName, allSkills)) {
      return qualifiedName
    }
  }

  // 3. 后缀匹配 — 查找名称以 ":skillName" 结尾的技能
  const suffix = `:${skillName}`
  const match = allSkills.find(cmd => cmd.name.endsWith(suffix))
  if (match) {
    return match.name
  }

  return null
}