import { feature } from 'bun:bundle'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'
import { randomUUID } from 'crypto'
import last from 'lodash-es/last.js'
import {
  getSessionId,
  isSessionPersistenceDisabled,
} from 'src/bootstrap/state.js'
import type {
  PermissionMode,
  SDKCompactBoundaryMessage,
  SDKMessage,
  SDKPermissionDenial,
  SDKStatus,
  SDKUserMessageReplay,
} from 'src/entrypoints/agentSdkTypes.js'
import type { BetaMessageDeltaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { accumulateUsage, updateUsage } from 'src/services/api/claude.js'
import type { NonNullableUsage } from '@ant/model-provider'
import { EMPTY_USAGE } from '@ant/model-provider'
import stripAnsi from 'strip-ansi'
import type { Command } from './commands.js'
import { getSlashCommandToolSkills } from './commands.js'
import {
  LOCAL_COMMAND_STDERR_TAG,
  LOCAL_COMMAND_STDOUT_TAG,
} from './constants/xml.js'
import {
  getModelUsage,
  getTotalAPIDuration,
  getTotalCost,
} from './cost-tracker.js'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import { loadMemoryPrompt } from './memdir/memdir.js'
import { hasAutoMemPathOverride } from './memdir/paths.js'
import { query } from './query.js'
import { categorizeRetryableAPIError } from './services/api/errors.js'
import type { MCPServerConnection } from './services/mcp/types.js'
import type { AppState } from './state/AppState.js'
import { type Tools, type ToolUseContext, toolMatchesName } from './Tool.js'
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { SYNTHETIC_OUTPUT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SyntheticOutputTool/SyntheticOutputTool.js'
import type { APIError } from '@anthropic-ai/sdk'
import type {
  CompactMetadata,
  Message,
  SystemCompactBoundaryMessage,
} from './types/message.js'
import type { OrphanedPermission } from './types/textInputTypes.js'
import { createAbortController } from './utils/abortController.js'
import type { AttributionState } from './utils/commitAttribution.js'
import { getGlobalConfig } from './utils/config.js'
import { getCwd } from './utils/cwd.js'
import { isBareMode, isEnvTruthy } from './utils/envUtils.js'
import { getFastModeState } from './utils/fastMode.js'
import {
  type FileHistoryState,
  fileHistoryEnabled,
  fileHistoryMakeSnapshot,
} from './utils/fileHistory.js'
import {
  cloneFileStateCache,
  type FileStateCache,
} from './utils/fileStateCache.js'
import { headlessProfilerCheckpoint } from './utils/headlessProfiler.js'
import { registerStructuredOutputEnforcement } from './utils/hooks/hookHelpers.js'
import { getInMemoryErrors } from './utils/log.js'
import { countToolCalls, SYNTHETIC_MESSAGES } from './utils/messages.js'
import {
  getMainLoopModel,
  parseUserSpecifiedModel,
} from './utils/model/model.js'
import { loadAllPluginsCacheOnly } from './utils/plugins/pluginLoader.js'
import {
  type ProcessUserInputContext,
  processUserInput,
} from './utils/processUserInput/processUserInput.js'
import { fetchSystemPromptParts } from './utils/queryContext.js'
import { setCwd } from './utils/Shell.js'
import {
  flushSessionStorage,
  recordTranscript,
} from './utils/sessionStorage.js'
import { asSystemPrompt } from './utils/systemPromptType.js'
import { resolveThemeSetting } from './utils/systemTheme.js'
import {
  shouldEnableThinkingByDefault,
  type ThinkingConfig,
} from './utils/thinking.js'

// 惰性加载：MessageSelector.tsx 仅在查询时进行消息过滤时才需要拉取 React/ink
/* eslint-disable @typescript-eslint/no-require-imports */
const messageSelector = ():
  | typeof import('src/components/MessageSelector.js')
  | null => {
  try {
    return require('src/components/MessageSelector.js')
  } catch {
    return null
  }
}

import {
  localCommandOutputToSDKAssistantMessage,
  toSDKCompactMetadata,
} from './utils/messages/mappers.js'
import {
  buildSystemInitMessage,
  sdkCompatToolName,
} from './utils/messages/systemInit.js'
import {
  getScratchpadDir,
  isScratchpadEnabled,
} from './utils/permissions/filesystem.js'
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  handleOrphanedPermission,
  isResultSuccessful,
  normalizeMessage,
} from './utils/queryHelpers.js'

// 死代码消除：协调器模式的条件导入
/* eslint-disable @typescript-eslint/no-require-imports */
const getCoordinatorUserContext: (
  mcpClients: ReadonlyArray<{ name: string }>,
  scratchpadDir?: string,
) => { [k: string]: string } = feature('COORDINATOR_MODE')
  ? require('./coordinator/coordinatorMode.js').getCoordinatorUserContext
  : () => ({})
/* eslint-enable @typescript-eslint/no-require-imports */

// 死代码消除：片段压缩的条件导入
/* eslint-disable @typescript-eslint/no-require-imports */
const snipModule = feature('HISTORY_SNIP')
  ? (require('./services/compact/snipCompact.js') as typeof import('./services/compact/snipCompact.js'))
  : null
const snipProjection = feature('HISTORY_SNIP')
  ? (require('./services/compact/snipProjection.js') as typeof import('./services/compact/snipProjection.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

export type QueryEngineConfig = {
  cwd: string
  tools: Tools
  commands: Command[]
  mcpClients: MCPServerConnection[]
  agents: AgentDefinition[]
  canUseTool: CanUseToolFn
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  initialMessages?: Message[]
  readFileCache: FileStateCache
  customSystemPrompt?: string
  appendSystemPrompt?: string
  userSpecifiedModel?: string
  fallbackModel?: string
  thinkingConfig?: ThinkingConfig
  maxTurns?: number
  maxBudgetUsd?: number
  taskBudget?: { total: number }
  jsonSchema?: Record<string, unknown>
  verbose?: boolean
  replayUserMessages?: boolean
  /** 处理由 MCP 工具 -32042 错误触发的 URL 请求。 */
  handleElicitation?: ToolUseContext['handleElicitation']
  includePartialMessages?: boolean
  setSDKStatus?: (status: SDKStatus) => void
  abortController?: AbortController
  orphanedPermission?: OrphanedPermission
  /** * 片段边界处理器：接收每个产出的系统消息以及当前可变的 messages 存储。如果消息不是片段边界，则返回 undefined；否则返回重放的片段结果。当启用 HISTORY_SNIP 时由 ask() 注入，以便功能门控的字符串保留在门控模块内（使 QueryEngine 不包含被排除的字符串，并且即使在 bun test 下 feature() 返回 false 时也可测试）。仅限 SDK：REPL 为 UI 回滚保留完整历史记录，并通过 projectSnippedView 按需投影；QueryEngine 在此处截断，以在长时间的无头会话中限制内存占用（无需保留 UI）。 */
  snipReplay?: (
    yieldedSystemMsg: Message,
    store: Message[],
  ) => { messages: Message[]; executed: boolean } | undefined
}

/** * QueryEngine 拥有对话的查询生命周期和会话状态。它将 ask() 中的核心逻辑提取到一个独立的类中，可供无头/SDK 路径以及（在未来阶段）REPL 使用。
 *
 * 每个对话一个 QueryEngine。每次 submitMessage() 调用在同一对话中开始一个新的轮次。状态（消息、文件缓存、使用情况等）在轮次间持续存在。 */
export class QueryEngine {
  private config: QueryEngineConfig
  private mutableMessages: Message[]
  private abortController: AbortController
  private permissionDenials: SDKPermissionDenial[]
  private totalUsage: NonNullableUsage
  private hasHandledOrphanedPermission = false
  private readFileState: FileStateCache
  // 轮次范围内的技能发现跟踪（填充 tengu_skill_tool_invocation 上的 was_discovered）。
  // 必须在 submitMessage 内部的两次 processUserInputContext 重建过程中持续存在，但
  // 在每次 submitMessage 开始时被清除，以避免在 SDK 模式下
  // 跨多个轮次无限增长。
  // 包装 canUseTool 以跟踪权限拒绝
  private discoveredSkillNames = new Set<string>()
  private loadedNestedMemoryPaths = new Set<string>()

  constructor(config: QueryEngineConfig) {
    this.config = config
    this.mutableMessages = config.initialMessages ?? []
    this.abortController = config.abortController ?? createAbortController()
    this.permissionDenials = []
    this.readFileState = config.readFileCache
    this.totalUsage = EMPTY_USAGE
  }

  async *submitMessage(
    prompt: string | ContentBlockParam[],
    options?: { uuid?: string; isMeta?: boolean },
  ): AsyncGenerator<SDKMessage, void, unknown> {
    const {
      cwd,
      commands,
      tools,
      mcpClients,
      verbose = false,
      thinkingConfig,
      maxTurns,
      maxBudgetUsd,
      taskBudget,
      canUseTool,
      customSystemPrompt,
      appendSystemPrompt,
      userSpecifiedModel,
      fallbackModel,
      jsonSchema,
      getAppState,
      setAppState,
      replayUserMessages = false,
      includePartialMessages = false,
      agents = [],
      setSDKStatus,
      orphanedPermission,
    } = this.config

    this.discoveredSkillNames.clear()
    this.permissionDenials = []
    setCwd(cwd)
    const persistSession = !isSessionPersistenceDisabled()
    const startTime = Date.now()

    // 为 SDK 报告跟踪拒绝情况
    const wrappedCanUseTool: CanUseToolFn = async (
      tool,
      input,
      toolUseContext,
      assistantMessage,
      toolUseID,
      forceDecision,
    ) => {
      const result = await canUseTool(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseID,
        forceDecision,
      )

      // 进行一次类型收窄，以便 TypeScript 在后续条件语句中跟踪类型。
      if (result.behavior !== 'allow') {
        this.permissionDenials.push({
          type: 'permission_denial',
          tool_name: sdkCompatToolName(tool.name),
          tool_use_id: toolUseID,
          tool_input: input,
        })
      }

      return result
    }

    const initialAppState = getAppState()
    const initialMainLoopModel = userSpecifiedModel
      ? parseUserSpecifiedModel(userSpecifiedModel)
      : getMainLoopModel()

    const initialThinkingConfig: ThinkingConfig = thinkingConfig
      ? thinkingConfig
      : shouldEnableThinkingByDefault() !== false
        ? { type: 'adaptive' }
        : { type: 'disabled' }

    headlessProfilerCheckpoint('before_getSystemPrompt')
    // 当 SDK 调用者提供了自定义系统提示词 AND 设置了
    const customPrompt =
      typeof customSystemPrompt === 'string' ? customSystemPrompt : undefined
    const {
      defaultSystemPrompt,
      userContext: baseUserContext,
      systemContext,
    } = await fetchSystemPromptParts({
      tools,
      mainLoopModel: initialMainLoopModel,
      additionalWorkingDirectories: Array.from(
        initialAppState.toolPermissionContext.additionalWorkingDirectories.keys(),
      ),
      mcpClients,
      customSystemPrompt: customPrompt,
    })
    headlessProfilerCheckpoint('after_getSystemPrompt')
    const userContext = {
      ...baseUserContext,
      ...getCoordinatorUserContext(
        mcpClients,
        isScratchpadEnabled() ? getScratchpadDir() : undefined,
      ),
    }

    // CLAUDE_COWORK_MEMORY_PATH_OVERRIDE 环境变量时，注入内存机制提示词。
    // 该环境变量是一个明确的加入信号——调用者已经配置了
    // 一个内存目录，并且需要 Claude 知道如何使用它（调用哪个
    // Write/Edit 工具，MEMORY.md 文件名，加载语义）。
    // 调用者可以通过 appendSystemPrompt 添加自己的策略文本。
    // 注册函数钩子以强制执行结构化输出
    const memoryMechanicsPrompt =
      customPrompt !== undefined && hasAutoMemPathOverride()
        ? await loadMemoryPrompt()
        : null

    const systemPrompt = asSystemPrompt([
      ...(customPrompt !== undefined ? [customPrompt] : defaultSystemPrompt),
      ...(memoryMechanicsPrompt ? [memoryMechanicsPrompt] : []),
      ...(appendSystemPrompt ? [appendSystemPrompt] : []),
    ])

    // 修改消息数组的斜杠命令（例如 /force-snip）
    const hasStructuredOutputTool = tools.some(t =>
      toolMatchesName(t, SYNTHETIC_OUTPUT_TOOL_NAME),
    )
    if (jsonSchema && hasStructuredOutputTool) {
      registerStructuredOutputEnforcement(setAppState, getSessionId())
    }

    let processUserInputContext: ProcessUserInputContext = {
      messages: this.mutableMessages,
      // 调用 setMessages(fn)。在交互模式下，这会写回
      // AppState；在打印模式下，我们写回 mutableMessages，以便
      // AppState；在打印模式下，我们写回 mutableMessages，以便
      // 查询循环的其余部分（在 :389 处推送，在 :392 处快照）会看到
      // 结果。下面的第二个 processUserInputContext（在
      // 斜杠命令处理之后）保持无操作状态——在此之后没有其他代码会调用
      // 设置消息。
      setMessages: fn => {
        this.mutableMessages = fn(this.mutableMessages)
      },
      onChangeAPIKey: () => {},
      handleElicitation: this.config.handleElicitation,
      options: {
        commands,
        debug: false, // 我们使用标准输出，所以不想破坏它
        tools,
        verbose,
        mainLoopModel: initialMainLoopModel,
        thinkingConfig: initialThinkingConfig,
        mcpClients,
        mcpResources: {},
        ideInstallationStatus: null,
        isNonInteractiveSession: true,
        customSystemPrompt,
        appendSystemPrompt,
        agentDefinitions: { activeAgents: agents, allAgents: [] },
        theme: resolveThemeSetting(getGlobalConfig().theme),
        maxBudgetUsd,
      },
      getAppState,
      setAppState,
      abortController: this.abortController,
      readFileState: this.readFileState,
      nestedMemoryAttachmentTriggers: new Set<string>(),
      loadedNestedMemoryPaths: this.loadedNestedMemoryPaths,
      dynamicSkillDirTriggers: new Set<string>(),
      discoveredSkillNames: this.discoveredSkillNames,
      setInProgressToolUseIDs: () => {},
      setResponseLength: () => {},
      updateFileHistoryState: (
        updater: (prev: FileHistoryState) => FileHistoryState,
      ) => {
        setAppState(prev => {
          const updated = updater(prev.fileHistory)
          if (updated === prev.fileHistory) return prev
          return { ...prev, fileHistory: updated }
        })
      },
      updateAttributionState: (
        updater: (prev: AttributionState) => AttributionState,
      ) => {
        setAppState(prev => {
          const updated = updater(prev.attribution)
          if (updated === prev.attribution) return prev
          return { ...prev, attribution: updated }
        })
      },
      setSDKStatus,
    }

    // 处理孤立的权限（每个引擎生命周期仅一次）
    if (orphanedPermission && !this.hasHandledOrphanedPermission) {
      this.hasHandledOrphanedPermission = true
      for await (const message of handleOrphanedPermission(
        orphanedPermission,
        tools,
        this.mutableMessages,
        processUserInputContext,
      )) {
        yield message
      }
    }

    const {
      messages: messagesFromUserInput,
      shouldQuery,
      allowedTools,
      model: modelFromUserInput,
      resultText,
    } = await processUserInput({
      input: prompt,
      mode: 'prompt',
      setToolJSX: () => {},
      context: {
        ...processUserInputContext,
        messages: this.mutableMessages,
      },
      messages: this.mutableMessages,
      uuid: options?.uuid,
      isMeta: options?.isMeta,
      querySource: 'sdk',
    })

    // 推送新消息，包括用户输入和任何附件
    this.mutableMessages.push(...messagesFromUserInput)

    // 更新参数以反映处理 /slash 命令后的更新
    const messages = [...this.mutableMessages]

    // 在进入查询循环之前，将用户的消息持久化到对话记录中。
    // 下面的 for-await 循环仅在 ask() 产生
    // 助手/用户/compact_boundary 消息时调用 recordTranscript——而这要等到
    // API 响应后才会发生。如果在此之前进程被终止（例如，用户在发送后几秒内点击
    // 停止按钮），对话记录将只留下
    // 队列操作条目；getLastSessionLog 会过滤掉这些条目，返回
    // null，并且 --resume 会失败并提示“未找到对话”。现在写入使得
    // 即使没有收到任何 API 响应，对话记录也可以从用户消息被接受的点恢复。
    // --bare / SIMPLE：即发即弃。脚本化调用在请求中途被终止后不会 --resume。
    //
    // 在 SSD 上等待时间约为 4ms，在磁盘争用下约为 30ms
    // ——这是模块评估之后最大的可控关键路径成本。
    // 对话记录仍然会被写入（用于事后调试）；只是不会阻塞。
    // 过滤应在对话记录后确认的消息
    if (persistSession && messagesFromUserInput.length > 0) {
      const transcriptPromise = recordTranscript(messages)
      if (isBareMode()) {
        void transcriptPromise
      } else {
        await transcriptPromise
        if (
          isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
          isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
        ) {
          await flushSessionStorage()
        }
      }
    }

    // Filter messages that should be acknowledged after transcript
    const _selector = messageSelector()
    const replayableMessages = messagesFromUserInput.filter(
      msg =>
        (msg.type === 'user' &&
          !msg.isMeta && // Skip synthetic caveat messages
          !msg.toolUseResult && // Skip tool results (they'll be acked from query)
          (_selector?.selectableUserMessagesFilter(msg) ?? true)) || // Skip non-user-authored messages (task notifications, etc.)
        (msg.type === 'system' && msg.subtype === 'compact_boundary'), // Always ack compact boundaries
    )
    const messagesToAck = replayUserMessages ? replayableMessages : []

    // 在处理提示后重新创建，以获取更新的消息和
    setAppState(prev => ({
      ...prev,
      toolPermissionContext: {
        ...prev.toolPermissionContext,
        alwaysAllowRules: {
          ...prev.toolPermissionContext.alwaysAllowRules,
          command: allowedTools,
        },
      },
    }))

    const mainLoopModel = modelFromUserInput ?? initialMainLoopModel

    // 模型（来自斜杠命令）。
    // 仅缓存：无头/SDK/CCR 启动不得因网络而阻塞
    processUserInputContext = {
      messages,
      setMessages: () => {},
      onChangeAPIKey: () => {},
      handleElicitation: this.config.handleElicitation,
      options: {
        commands,
        debug: false,
        tools,
        verbose,
        mainLoopModel,
        thinkingConfig: initialThinkingConfig,
        mcpClients,
        mcpResources: {},
        ideInstallationStatus: null,
        isNonInteractiveSession: true,
        customSystemPrompt,
        appendSystemPrompt,
        theme: resolveThemeSetting(getGlobalConfig().theme),
        agentDefinitions: { activeAgents: agents, allAgents: [] },
        maxBudgetUsd,
      },
      getAppState,
      setAppState,
      abortController: this.abortController,
      readFileState: this.readFileState,
      nestedMemoryAttachmentTriggers: new Set<string>(),
      loadedNestedMemoryPaths: this.loadedNestedMemoryPaths,
      dynamicSkillDirTriggers: new Set<string>(),
      discoveredSkillNames: this.discoveredSkillNames,
      setInProgressToolUseIDs: () => {},
      setResponseLength: () => {},
      updateFileHistoryState: processUserInputContext.updateFileHistoryState,
      updateAttributionState: processUserInputContext.updateAttributionState,
      setSDKStatus,
    }

    headlessProfilerCheckpoint('before_skills_plugins')
    // 引用跟踪的插件。CCR 通过 CLAUDE_CODE_SYNC_PLUGIN_INSTALL
    // （headlessPluginInstall）或 CLAUDE_CODE_PLUGIN_SEED_DIR 在此运行前填充缓存；
    // 需要最新源代码的 SDK 调用者可以调用 /reload-plugins。
    // 记录系统消息产生的时间，用于无头模式延迟跟踪
    const [skills, { enabled: enabledPlugins }] = await Promise.all([
      getSlashCommandToolSkills(getCwd()),
      loadAllPluginsCacheOnly(),
    ])
    headlessProfilerCheckpoint('after_skills_plugins')

    yield buildSystemInitMessage({
      tools,
      mcpClients,
      model: mainLoopModel,
      permissionMode: initialAppState.toolPermissionContext
        .mode as PermissionMode, // 待办：避免类型转换
      commands,
      agents,
      skills,
      plugins: enabledPlugins,
      fastMode: initialAppState.fastMode,
    })

    // 返回本地斜杠命令的结果。
    headlessProfilerCheckpoint('system_message_yielded')

    if (!shouldQuery) {
      // 返回本地斜杠命令的结果。
      // 命令输出使用 messagesFromUserInput（而非 replayableMessages）
      // 因为 selectableUserMessagesFilter 会排除 local-command-stdout 标签。
      for (const msg of messagesFromUserInput) {
        if (
          msg.type === 'user' &&
          typeof msg.message!.content === 'string' &&
          (msg.message!.content.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`) ||
            msg.message!.content.includes(`<${LOCAL_COMMAND_STDERR_TAG}>`) ||
            msg.isCompactSummary)
        ) {
          yield {
            type: 'user',
            message: {
              ...msg.message,
              content: stripAnsi(msg.message!.content),
            },
            session_id: getSessionId(),
            parent_tool_use_id: null,
            uuid: msg.uuid,
            timestamp: msg.timestamp,
            isReplay: !msg.isCompactSummary,
            isSynthetic: msg.isMeta || msg.isVisibleInTranscriptOnly,
          } as unknown as SDKUserMessageReplay
        }

        // 本地命令输出 — 作为合成助手消息生成，以便
        // RC 将其渲染为助手样式文本而非用户气泡。
        // 作为助手消息发出（而非专用的 SDKLocalCommandOutputMessage
        // 系统子类型），以便移动客户端 + 会话入口能够解析。
        if (
          msg.type === 'system' &&
          msg.subtype === 'local_command' &&
          typeof msg.content === 'string' &&
          (msg.content.includes(`<${LOCAL_COMMAND_STDOUT_TAG}>`) ||
            msg.content.includes(`<${LOCAL_COMMAND_STDERR_TAG}>`))
        ) {
          yield localCommandOutputToSDKAssistantMessage(msg.content, msg.uuid)
        }

        if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
          const compactMsg = msg as SystemCompactBoundaryMessage
          yield {
            type: 'system',
            subtype: 'compact_boundary' as const,
            session_id: getSessionId(),
            uuid: msg.uuid,
            compact_metadata: toSDKCompactMetadata(compactMsg.compactMetadata),
          } as unknown as SDKCompactBoundaryMessage
        }
      }

      if (persistSession) {
        await recordTranscript(messages)
        if (
          isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
          isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
        ) {
          await flushSessionStorage()
        }
      }

      yield {
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: Date.now() - startTime,
        duration_api_ms: getTotalAPIDuration(),
        num_turns: messages.length - 1,
        result: resultText ?? '',
        stop_reason: null,
        session_id: getSessionId(),
        total_cost_usd: getTotalCost(),
        usage: this.totalUsage,
        modelUsage: getModelUsage(),
        permission_denials: this.permissionDenials,
        fast_mode_state: getFastModeState(
          mainLoopModel,
          initialAppState.fastMode,
        ),
        uuid: randomUUID(),
      }
      return
    }

    if (fileHistoryEnabled() && persistSession) {
      const _sel = messageSelector()
      const _filter =
        _sel?.selectableUserMessagesFilter ?? ((_msg: unknown) => true)
      messagesFromUserInput.filter(_filter).forEach(message => {
        void fileHistoryMakeSnapshot(
          (updater: (prev: FileHistoryState) => FileHistoryState) => {
            setAppState(prev => ({
              ...prev,
              fileHistory: updater(prev.fileHistory),
            }))
          },
          message.uuid,
        )
      })
    }

    // 追踪当前消息使用量（每次 message_start 时重置）
    let currentMessageUsage: NonNullableUsage = EMPTY_USAGE
    let turnCount = 1
    let hasAcknowledgedInitialMessages = false
    // 追踪来自 StructuredOutput 工具调用的结构化输出
    let structuredOutputFromTool: unknown
    // 追踪助手消息中的最新 stop_reason
    let lastStopReason: string | null = null
    // 基于引用的水印，使 error_during_execution 的 errors[] 成为
    // 回合作用域的。当 100 条环形缓冲区在回合期间 shift() 时，
    // 基于长度的索引会失效 — 索引会滑动。如果此条目被轮转
    // 出去，lastIndexOf 返回 -1，我们将包含所有内容（安全的回退方案）。
    const errorLogWatermark = getInMemoryErrors().at(-1)
    // 此查询前的快照计数，用于基于增量的重试限制
    const initialStructuredOutputCalls = jsonSchema
      ? countToolCalls(this.mutableMessages, SYNTHETIC_OUTPUT_TOOL_NAME)
      : 0

    for await (const message of query({
      messages,
      systemPrompt,
      userContext,
      systemContext,
      canUseTool: wrappedCanUseTool,
      toolUseContext: processUserInputContext,
      fallbackModel,
      querySource: 'sdk',
      maxTurns,
      taskBudget,
    })) {
      // 记录助手、用户和紧凑边界消息
      if (
        message.type === 'assistant' ||
        message.type === 'user' ||
        (message.type === 'system' && message.subtype === 'compact_boundary')
      ) {
        // 在写入紧凑边界前，刷新所有仅存在于内存中的
        // 消息直至 preservedSegment 尾部。附件和
        // 进度现在已内联记录（见下方 switch 分支），但
        // 此刷新对于 preservedSegment 尾部遍历仍很重要。
        // 如果 SDK 子进程在此之前重启（claude-desktop 在回合间
        // 终止），tailUuid 指向一条从未写入的消息 →
        // applyPreservedSegmentRelinks 的尾部→头部遍历失败 → 返回
        // 而不进行修剪 → 恢复时加载完整的压缩前历史。
        if (
          persistSession &&
          message.type === 'system' &&
          message.subtype === 'compact_boundary'
        ) {
          const compactMsg = message as SystemCompactBoundaryMessage
          const tailUuid =
            compactMsg.compactMetadata?.preservedSegment?.tailUuid
          if (tailUuid) {
            const tailIdx = this.mutableMessages.findLastIndex(
              m => m.uuid === tailUuid,
            )
            if (tailIdx !== -1) {
              await recordTranscript(this.mutableMessages.slice(0, tailIdx + 1))
            }
          }
        }
        messages.push(message as Message)
        if (persistSession) {
          // 助手消息采用即发即弃模式。claude.ts 为每个内容块
          // 生成一条助手消息，然后在 message_delta 时
          // 修改最后一条消息的 message.usage/stop_reason — 依赖于
          // 写入队列的 100ms 延迟 jsonStringify。在此处等待
          // 会阻塞 ask() 的生成器，因此 message_delta 无法运行，直到
          // 所有块都被消费；排水计时器（从块 1 开始）
          // 会先超时。交互式 CC 不会遇到此问题，因为
          // useLogMessages.ts 采用即发即弃模式。enqueueWrite 是
          // 顺序保持的，因此这里的即发即弃是安全的。
          if (message.type === 'assistant') {
            void recordTranscript(messages)
          } else {
            await recordTranscript(messages)
          }
        }

        // 在首次转录记录后，确认初始用户消息
        if (!hasAcknowledgedInitialMessages && messagesToAck.length > 0) {
          hasAcknowledgedInitialMessages = true
          for (const msgToAck of messagesToAck) {
            if (msgToAck.type === 'user') {
              yield {
                type: 'user',
                message: msgToAck.message,
                session_id: getSessionId(),
                parent_tool_use_id: null,
                uuid: msgToAck.uuid,
                timestamp: msgToAck.timestamp,
                isReplay: true,
              } as unknown as SDKUserMessageReplay
            }
          }
        }
      }

      if (message.type === 'user') {
        turnCount++
      }

      switch (message.type) {
        case 'tombstone':
          // 墓碑消息是用于移除消息的控制信号，跳过它们
          break
        case 'assistant': {
          // 如果已设置，捕获 stop_reason（针对合成消息）。对于
          // 流式响应，在 content_block_stop 时此项为 null；
          // 实际值通过 message_delta 到达（在下方处理）。
          const msg = message as Message
          const stopReason = msg.message?.stop_reason as
            | string
            | null
            | undefined
          if (stopReason != null) {
            lastStopReason = stopReason
          }
          this.mutableMessages.push(msg)
          yield* normalizeMessage(msg)
          break
        }
        case 'progress': {
          const msg = message as Message
          this.mutableMessages.push(msg)
          // 内联记录，以便下一个 ask() 调用中的去重循环能将其
          // 视为已记录。若不这样做，延迟的进度信息会与
          // mutableMessages 中已记录的 tool_results 交错，并且
          // 去重遍历会将 startingParentUuid 冻结在错误的消息上——
          // 导致链分叉，并在恢复时使对话孤立。
          if (persistSession) {
            messages.push(msg)
            void recordTranscript(messages)
          }
          yield* normalizeMessage(msg)
          break
        }
        case 'user': {
          const msg = message as Message
          this.mutableMessages.push(msg)
          yield* normalizeMessage(msg)
          break
        }
        case 'stream_event': {
          const event = (
            message as unknown as { event: Record<string, unknown> }
          ).event
          if (event.type === 'message_start') {
            // 为新消息重置当前消息使用量
            currentMessageUsage = EMPTY_USAGE
            const eventMessage = event.message as {
              usage: BetaMessageDeltaUsage
            }
            currentMessageUsage = updateUsage(
              currentMessageUsage,
              eventMessage.usage,
            )
          }
          if (event.type === 'message_delta') {
            currentMessageUsage = updateUsage(
              currentMessageUsage,
              event.usage as BetaMessageDeltaUsage,
            )
            // 从 message_delta 捕获 stop_reason。助手消息
            // 在 content_block_stop 时以 stop_reason=null 产生；
            // 实际值仅在此处到达（参见 claude.ts 的 message_delta
            // 处理程序）。若不这样做，result.stop_reason 将始终为 null。
            const delta = event.delta as { stop_reason?: string | null }
            if (delta.stop_reason != null) {
              lastStopReason = delta.stop_reason
            }
          }
          if (event.type === 'message_stop') {
            // 将当前消息使用量累加到总计中
            this.totalUsage = accumulateUsage(
              this.totalUsage,
              currentMessageUsage,
            )
          }

          if (includePartialMessages) {
            yield {
              type: 'stream_event' as const,
              event,
              session_id: getSessionId(),
              parent_tool_use_id: null,
              uuid: randomUUID(),
            }
          }

          break
        }
        case 'attachment': {
          const msg = message as Message
          this.mutableMessages.push(msg)
          // 内联记录（原因同上方的进度记录）。
          if (persistSession) {
            messages.push(msg)
            void recordTranscript(messages)
          }

          const attachment = msg.attachment as {
            type: string
            data?: unknown
            turnCount?: number
            maxTurns?: number
            prompt?: string
            source_uuid?: string
            [key: string]: unknown
          }

          // 从 StructuredOutput 工具调用中提取结构化输出
          if (attachment.type === 'structured_output') {
            structuredOutputFromTool = attachment.data
          }
          // 处理来自 query.ts 的最大轮次达到信号
          else if (attachment.type === 'max_turns_reached') {
            if (persistSession) {
              if (
                isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
                isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
              ) {
                await flushSessionStorage()
              }
            }
            yield {
              type: 'result',
              subtype: 'error_max_turns',
              duration_ms: Date.now() - startTime,
              duration_api_ms: getTotalAPIDuration(),
              is_error: true,
              num_turns: attachment.turnCount as number,
              stop_reason: lastStopReason,
              session_id: getSessionId(),
              total_cost_usd: getTotalCost(),
              usage: this.totalUsage,
              modelUsage: getModelUsage(),
              permission_denials: this.permissionDenials,
              fast_mode_state: getFastModeState(
                mainLoopModel,
                initialAppState.fastMode,
              ),
              uuid: randomUUID(),
              errors: [`已达到最大轮次限制（${attachment.maxTurns}）`],
            }
            return
          }
          // Yield queued_command attachments as SDK user message replays
          else if (replayUserMessages && attachment.type === 'queued_command') {
            yield {
              type: 'user',
              message: {
                role: 'user' as const,
                content: attachment.prompt,
              },
              session_id: getSessionId(),
              parent_tool_use_id: null,
              uuid: attachment.source_uuid || msg.uuid,
              timestamp: msg.timestamp,
              isReplay: true,
            } as unknown as SDKUserMessageReplay
          }
          break
        }
        case 'stream_request_start':
          // 不产生流请求开始消息
          break
        case 'system': {
          const msg = message as Message
          // Snip boundary: replay on our store to remove zombie messages and
          // stale markers. The yielded boundary is a signal, not data to push —
          // the replay produces its own equivalent boundary. Without this,
          // markers persist and re-trigger on every turn, and mutableMessages
          // never shrinks (memory leak in long SDK sessions). The subtype
          // check lives inside the injected callback so feature-gated strings
          // stay out of this file (excluded-strings check).
          const snipResult = this.config.snipReplay?.(msg, this.mutableMessages)
          if (snipResult !== undefined) {
            if (snipResult.executed) {
              this.mutableMessages.length = 0
              this.mutableMessages.push(...snipResult.messages)
            }
            break
          }
          this.mutableMessages.push(msg)
          // Yield compact boundary messages to SDK
          if (msg.subtype === 'compact_boundary' && msg.compactMetadata) {
            const compactMsg = msg as SystemCompactBoundaryMessage
            // 释放用于垃圾回收的预压缩消息。边界刚刚
            // 被推送，所以它是最后一个元素。query.ts 内部已经使用
            // getMessagesAfterCompactBoundary()，因此后续只需要
            // 边界后的消息。
            const mutableBoundaryIdx = this.mutableMessages.length - 1
            if (mutableBoundaryIdx > 0) {
              this.mutableMessages.splice(0, mutableBoundaryIdx)
            }
            const localBoundaryIdx = messages.length - 1
            if (localBoundaryIdx > 0) {
              messages.splice(0, localBoundaryIdx)
            }

            yield {
              type: 'system',
              subtype: 'compact_boundary' as const,
              session_id: getSessionId(),
              uuid: msg.uuid,
              compact_metadata: toSDKCompactMetadata(
                compactMsg.compactMetadata,
              ),
            }
          }
          if (msg.subtype === 'api_error') {
            const apiErrorMsg = msg as Message & {
              retryAttempt: number
              maxRetries: number
              retryInMs: number
              error: APIError
            }
            yield {
              type: 'system',
              subtype: 'api_retry' as const,
              attempt: apiErrorMsg.retryAttempt,
              max_retries: apiErrorMsg.maxRetries,
              retry_delay_ms: apiErrorMsg.retryInMs,
              error_status: apiErrorMsg.error.status ?? null,
              error: categorizeRetryableAPIError(apiErrorMsg.error),
              session_id: getSessionId(),
              uuid: msg.uuid,
            }
          }
          // 在无头模式下不要产生其他系统消息
          break
        }
        case 'tool_use_summary': {
          const msg = message as Message & {
            summary: unknown
            precedingToolUseIds: unknown
          }
          // Yield tool use summary messages to SDK
          yield {
            type: 'tool_use_summary' as const,
            summary: msg.summary,
            preceding_tool_use_ids: msg.precedingToolUseIds,
            session_id: getSessionId(),
            uuid: msg.uuid,
          }
          break
        }
      }

      // 检查是否超出 USD 预算
      if (maxBudgetUsd !== undefined && getTotalCost() >= maxBudgetUsd) {
        if (persistSession) {
          if (
            isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
            isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
          ) {
            await flushSessionStorage()
          }
        }
        yield {
          type: 'result',
          subtype: 'error_max_budget_usd',
          duration_ms: Date.now() - startTime,
          duration_api_ms: getTotalAPIDuration(),
          is_error: true,
          num_turns: turnCount,
          stop_reason: lastStopReason,
          session_id: getSessionId(),
          total_cost_usd: getTotalCost(),
          usage: this.totalUsage,
          modelUsage: getModelUsage(),
          permission_denials: this.permissionDenials,
          fast_mode_state: getFastModeState(
            mainLoopModel,
            initialAppState.fastMode,
          ),
          uuid: randomUUID(),
          errors: [`已达到最大预算 ($${maxBudgetUsd})`],
        }
        return
      }

      // 检查是否超出结构化输出重试限制（仅针对用户消息）
      if (message.type === 'user' && jsonSchema) {
        const currentCalls = countToolCalls(
          this.mutableMessages,
          SYNTHETIC_OUTPUT_TOOL_NAME,
        )
        const callsThisQuery = currentCalls - initialStructuredOutputCalls
        const maxRetries = parseInt(
          process.env.MAX_STRUCTURED_OUTPUT_RETRIES || '5',
          10,
        )
        if (callsThisQuery >= maxRetries) {
          if (persistSession) {
            if (
              isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
              isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
            ) {
              await flushSessionStorage()
            }
          }
          yield {
            type: 'result',
            subtype: 'error_max_structured_output_retries',
            duration_ms: Date.now() - startTime,
            duration_api_ms: getTotalAPIDuration(),
            is_error: true,
            num_turns: turnCount,
            stop_reason: lastStopReason,
            session_id: getSessionId(),
            total_cost_usd: getTotalCost(),
            usage: this.totalUsage,
            modelUsage: getModelUsage(),
            permission_denials: this.permissionDenials,
            fast_mode_state: getFastModeState(
              mainLoopModel,
              initialAppState.fastMode,
            ),
            uuid: randomUUID(),
            errors: [`经过 ${maxRetries} 次尝试后仍未能提供有效的结构化输出`],
          }
          return
        }
      }
    }

    // 停止钩子在助手
    // 响应之后产生进度/附件消息（通过 query.ts 中的 yield* handleStopHooks）。由于 #23537 将这些消息
    // 内联推送到 `messages`，last(messages) 可能是一个进度/附件
    // 而不是助手消息——这导致下面的 textResult 提取
    // 返回 '' 且 -p 模式输出空行。将允许列表限制为 assistant|user:
    // isResultSuccessful 处理两者（包含所有 tool_result 块的用户消息是
    // 一个有效的成功终止状态）。
    const result = messages.findLast(
      m => m.type === 'assistant' || m.type === 'user',
    )
    // 为 error_during_execution 诊断捕获——isResultSuccessful
    // 是一个类型谓词（message 是 Message），所以在 false 分支内
    // `result` 被收窄为 never，这些访问无法通过类型检查。
    const edeResultType = result?.type ?? 'undefined'
    const edeLastContentType =
      result?.type === 'assistant'
        ? (last(
            result.message!
              .content as import('@anthropic-ai/sdk/resources/beta/messages/messages.js').BetaContentBlock[],
          )?.type ?? 'none')
        : 'n/a'

    // 在产生结果之前刷新缓冲的转录写入。
    // 桌面应用在接收到
    // 结果消息后会立即终止 CLI 进程，因此任何未刷新的写入都会丢失。
    if (persistSession) {
      if (
        isEnvTruthy(process.env.CLAUDE_CODE_EAGER_FLUSH) ||
        isEnvTruthy(process.env.CLAUDE_CODE_IS_COWORK)
      ) {
        await flushSessionStorage()
      }
    }

    if (!isResultSuccessful(result, lastStopReason)) {
      yield {
        type: 'result',
        subtype: 'error_during_execution',
        duration_ms: Date.now() - startTime,
        duration_api_ms: getTotalAPIDuration(),
        is_error: true,
        num_turns: turnCount,
        stop_reason: lastStopReason,
        session_id: getSessionId(),
        total_cost_usd: getTotalCost(),
        usage: this.totalUsage,
        modelUsage: getModelUsage(),
        permission_denials: this.permissionDenials,
        fast_mode_state: getFastModeState(
          mainLoopModel,
          initialAppState.fastMode,
        ),
        uuid: randomUUID(),
        // 诊断前缀：这些是 isResultSuccessful() 检查的内容——如果
        // 结果类型不是 assistant-with-text/thinking 或 user-with-
        // tool_result，并且 stop_reason 不是 end_turn，这就是触发此诊断的原因。
        // errors[] 通过水印限定在回合范围内；之前它会转储
        // 整个进程的 logError 缓冲区（ripgrep 超时、ENOENT 等）。
        errors: (() => {
          const all = getInMemoryErrors()
          const start = errorLogWatermark
            ? all.lastIndexOf(errorLogWatermark) + 1
            : 0
          return [
            `[ede_diagnostic] result_type=${edeResultType} last_content_type=${edeLastContentType} stop_reason=${lastStopReason}`,
            ...all.slice(start).map(_ => _.error),
          ]
        })(),
      }
      return
    }

    // 根据消息类型提取文本结果
    let textResult = ''
    let isApiError = false

    if (result.type === 'assistant') {
      const lastContent = last(
        result.message!
          .content as import('@anthropic-ai/sdk/resources/beta/messages/messages.js').BetaContentBlock[],
      )
      if (
        lastContent?.type === 'text' &&
        !SYNTHETIC_MESSAGES.has(lastContent.text)
      ) {
        textResult = lastContent.text
      }
      isApiError = Boolean(result.isApiErrorMessage)
    }

    yield {
      type: 'result',
      subtype: 'success',
      is_error: isApiError,
      duration_ms: Date.now() - startTime,
      duration_api_ms: getTotalAPIDuration(),
      num_turns: turnCount,
      result: textResult,
      stop_reason: lastStopReason,
      session_id: getSessionId(),
      total_cost_usd: getTotalCost(),
      usage: this.totalUsage,
      modelUsage: getModelUsage(),
      permission_denials: this.permissionDenials,
      structured_output: structuredOutputFromTool,
      fast_mode_state: getFastModeState(
        mainLoopModel,
        initialAppState.fastMode,
      ),
      uuid: randomUUID(),
    }
  }

  interrupt(): void {
    this.abortController.abort()
  }

  /** 重置 abort controller，以便下一次 submitMessage() 调用可以从一个全新的、未中止的信号开始。必须在 interrupt() 之后调用。 */
  resetAbortController(): void {
    this.abortController = createAbortController()
  }

  /** 为外部消费者（例如 ACP bridge）暴露当前的 abort signal。 */
  getAbortSignal(): AbortSignal {
    return this.abortController.signal
  }

  getMessages(): readonly Message[] {
    return this.mutableMessages
  }

  getReadFileState(): FileStateCache {
    return this.readFileState
  }

  getSessionId(): string {
    return getSessionId()
  }

  setModel(model: string): void {
    this.config.userSpecifiedModel = model
  }
}

/** * 向 Claude API 发送单个提示并返回响应。
 * 假设 Claude 以非交互方式使用——不会向用户请求权限或进一步输入。
 *
 * 为一次性使用场景封装的 QueryEngine 便捷包装器。 */
export async function* ask({
  commands,
  prompt,
  promptUuid,
  isMeta,
  cwd,
  tools,
  mcpClients,
  verbose = false,
  thinkingConfig,
  maxTurns,
  maxBudgetUsd,
  taskBudget,
  canUseTool,
  mutableMessages = [],
  getReadFileCache,
  setReadFileCache,
  customSystemPrompt,
  appendSystemPrompt,
  userSpecifiedModel,
  fallbackModel,
  jsonSchema,
  getAppState,
  setAppState,
  abortController,
  replayUserMessages = false,
  includePartialMessages = false,
  handleElicitation,
  agents = [],
  setSDKStatus,
  orphanedPermission,
}: {
  commands: Command[]
  prompt: string | Array<ContentBlockParam>
  promptUuid?: string
  isMeta?: boolean
  cwd: string
  tools: Tools
  verbose?: boolean
  mcpClients: MCPServerConnection[]
  thinkingConfig?: ThinkingConfig
  maxTurns?: number
  maxBudgetUsd?: number
  taskBudget?: { total: number }
  canUseTool: CanUseToolFn
  mutableMessages?: Message[]
  customSystemPrompt?: string
  appendSystemPrompt?: string
  userSpecifiedModel?: string
  fallbackModel?: string
  jsonSchema?: Record<string, unknown>
  getAppState: () => AppState
  setAppState: (f: (prev: AppState) => AppState) => void
  getReadFileCache: () => FileStateCache
  setReadFileCache: (cache: FileStateCache) => void
  abortController?: AbortController
  replayUserMessages?: boolean
  includePartialMessages?: boolean
  handleElicitation?: ToolUseContext['handleElicitation']
  agents?: AgentDefinition[]
  setSDKStatus?: (status: SDKStatus) => void
  orphanedPermission?: OrphanedPermission
}): AsyncGenerator<SDKMessage, void, unknown> {
  const engine = new QueryEngine({
    cwd,
    tools,
    commands,
    mcpClients,
    agents: agents ?? [],
    canUseTool,
    getAppState,
    setAppState,
    initialMessages: mutableMessages,
    readFileCache: cloneFileStateCache(getReadFileCache()),
    customSystemPrompt,
    appendSystemPrompt,
    userSpecifiedModel,
    fallbackModel,
    thinkingConfig,
    maxTurns,
    maxBudgetUsd,
    taskBudget,
    jsonSchema,
    verbose,
    handleElicitation,
    replayUserMessages,
    includePartialMessages,
    setSDKStatus,
    abortController,
    orphanedPermission,
    ...(feature('HISTORY_SNIP')
      ? {
          snipReplay: (yielded: Message, store: Message[]) => {
            if (!snipProjection!.isSnipBoundaryMessage(yielded))
              return undefined
            return snipModule!.snipCompactIfNeeded(store, { force: true })
          },
        }
      : {}),
  })

  try {
    yield* engine.submitMessage(prompt, {
      uuid: promptUuid,
      isMeta,
    })
  } finally {
    setReadFileCache(engine.getReadFileState())
  }
}
