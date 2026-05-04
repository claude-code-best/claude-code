// biome-ignore-all assist/source/organizeImports: 仅限 ANT 的导入标记不得重新排序
import type {
  ToolResultBlockParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { CanUseToolFn } from './hooks/useCanUseTool.js'
import { FallbackTriggeredError } from './services/api/withRetry.js'
import {
  calculateTokenWarningState,
  estimateMaxTurnGrowth,
  getAutoCompactThreshold,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
  type AutoCompactTrackingState,
} from './services/compact/autoCompact.js'
import { buildPostCompactMessages } from './services/compact/compact.js'
/* eslint-disable @typescript-eslint/no-require-imports */
const reactiveCompact = feature('REACTIVE_COMPACT')
  ? (require('./services/compact/reactiveCompact.js') as typeof import('./services/compact/reactiveCompact.js'))
  : null
const contextCollapse = feature('CONTEXT_COLLAPSE')
  ? (require('./services/contextCollapse/index.js') as typeof import('./services/contextCollapse/index.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  logEvent,
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
} from 'src/services/analytics/index.js'
import { ImageSizeError } from './utils/imageValidation.js'
import { ImageResizeError } from './utils/imageResizer.js'
import { findToolByName, type ToolUseContext } from './Tool.js'
import { asSystemPrompt, type SystemPrompt } from './utils/systemPromptType.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  Message,
  RequestStartEvent,
  StreamEvent,
  ToolUseSummaryMessage,
  UserMessage,
  TombstoneMessage,
} from './types/message.js'
import { logError } from './utils/log.js'
import {
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  isPromptTooLongMessage,
} from './services/api/errors.js'
import { logAntError, logForDebugging } from './utils/debug.js'
import {
  createUserMessage,
  createUserInterruptionMessage,
  normalizeMessagesForAPI,
  createSystemMessage,
  createAssistantAPIErrorMessage,
  getMessagesAfterCompactBoundary,
  createToolUseSummaryMessage,
  createMicrocompactBoundaryMessage,
  stripSignatureBlocks,
} from './utils/messages.js'
import { generateToolUseSummary } from './services/toolUseSummary/toolUseSummaryGenerator.js'
import { prependUserContext, appendSystemContext } from './utils/api.js'
import {
  createAttachmentMessage,
  filterDuplicateMemoryAttachments,
  getAttachmentMessages,
  startRelevantMemoryPrefetch,
} from './utils/attachments.js'
/* eslint-disable @typescript-eslint/no-require-imports */
const skillPrefetch = feature('EXPERIMENTAL_SKILL_SEARCH')
  ? (require('./services/skillSearch/prefetch.js') as typeof import('./services/skillSearch/prefetch.js'))
  : null
const jobClassifier = feature('TEMPLATES')
  ? (require('./jobs/classifier.js') as typeof import('./jobs/classifier.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */
import {
  enqueue,
  remove as removeFromQueue,
  getCommandsByMaxPriority,
  isSlashCommand,
} from './utils/messageQueueManager.js'
import {
  type AutonomyTurnOutcome,
  claimConsumableQueuedAutonomyCommands,
  finalizeAutonomyCommandsForTurn,
} from './utils/autonomyQueueLifecycle.js'
import { notifyCommandLifecycle } from './utils/commandLifecycle.js'
import { headlessProfilerCheckpoint } from './utils/headlessProfiler.js'
import {
  getRuntimeMainLoopModel,
  renderModelName,
} from './utils/model/model.js'
import {
  doesMostRecentAssistantMessageExceed200k,
  finalContextTokensFromLastResponse,
  tokenCountWithEstimation,
} from './utils/tokens.js'
import { ESCALATED_MAX_TOKENS } from './utils/context.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from './services/analytics/growthbook.js'
import { SLEEP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/SleepTool/prompt.js'
import { executePostSamplingHooks } from './utils/hooks/postSamplingHooks.js'
import { executeStopFailureHooks } from './utils/hooks.js'
import type { QuerySource } from './constants/querySource.js'
import type { QueuedCommand } from './types/textInputTypes.js'
import { createDumpPromptsFetch } from './services/api/dumpPrompts.js'
import { StreamingToolExecutor } from './services/tools/StreamingToolExecutor.js'
import { queryCheckpoint } from './utils/queryProfiler.js'
import { runTools } from './services/tools/toolOrchestration.js'
import { applyToolResultBudget } from './utils/toolResultStorage.js'
import { recordContentReplacement } from './utils/sessionStorage.js'
import { handleStopHooks } from './query/stopHooks.js'
import { buildQueryConfig } from './query/config.js'
import { productionDeps, type QueryDeps } from './query/deps.js'
import type { Terminal, Continue } from './query/transitions.js'
import { feature } from 'bun:bundle'
import {
  getCurrentTurnTokenBudget,
  getTurnOutputTokens,
  incrementBudgetContinuationCount,
  getSessionId,
} from './bootstrap/state.js'
import { createBudgetTracker, checkTokenBudget } from './query/tokenBudget.js'
import { count } from './utils/array.js'
import {
  createTrace,
  endTrace,
  isLangfuseEnabled,
} from './services/langfuse/index.js'
import { getAPIProvider } from './utils/model/providers.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const snipModule = feature('HISTORY_SNIP')
  ? (require('./services/compact/snipCompact.js') as typeof import('./services/compact/snipCompact.js'))
  : null
const taskSummaryModule = feature('BG_SESSIONS')
  ? (require('./utils/taskSummary.js') as typeof import('./utils/taskSummary.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

function* yieldMissingToolResultBlocks(
  assistantMessages: AssistantMessage[],
  errorMessage: string,
) {
  for (const assistantMessage of assistantMessages) {
    // Extract all tool use blocks from this assistant message
    const toolUseBlocks = (
      Array.isArray(assistantMessage.message?.content)
        ? assistantMessage.message.content
        : []
    ).filter(
      (content: { type: string }) => content.type === 'tool_use',
    ) as ToolUseBlock[]

    // 为每个工具使用发出中断消息
    for (const toolUse of toolUseBlocks) {
      yield createUserMessage({
        content: [
          {
            type: 'tool_result',
            content: errorMessage,
            is_error: true,
            tool_use_id: toolUse.id,
          },
        ],
        toolUseResult: errorMessage,
        sourceToolAssistantUUID: assistantMessage.uuid,
      })
    }
  }
}

/** * 思考的规则冗长而偶然。它们需要长时间的深入冥想，巫师才能理解。
 *
 * 规则如下：
 * 1. 包含思考或编辑后思考块的消息必须是其 max_thinking_length > 0 的查询的一部分
 * 2. 思考块不能是块中的最后一条消息
 * 3. 思考块必须在整个助手轨迹期间保留（单个轮次，或者如果该轮次包含 tool_use 块，则包括其后续的 tool_result 和下一个助手消息）
 *
 * 年轻的巫师，请务必遵守这些规则。因为它们是思考的规则，
 * 而思考的规则就是宇宙的规则。如果你不遵守这些规则，
 * 你将受到一整天的调试和拔头发的惩罚。 */
const MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3

/** * 这是 max_output_tokens 错误消息吗？如果是，流循环应将其
 * 保留，直到我们知道恢复循环能否继续。提前产生会向 SDK 调用者
 * 泄露中间错误（例如 cowork/desktop），后者会在任何 `error` 字段上终止会话 ——
 * 恢复循环仍在运行，但无人监听。
 *
 * 镜像 reactiveCompact.isWithheldPromptTooLong。 */
function isWithheldMaxOutputTokens(
  msg: Message | StreamEvent | undefined,
): msg is AssistantMessage {
  return msg?.type === 'assistant' && msg.apiError === 'max_output_tokens'
}

function getAutonomyTurnOutcome(params: {
  terminal?: Terminal
  thrownError?: unknown
}): AutonomyTurnOutcome {
  if (params.thrownError !== undefined) {
    return { type: 'failed', error: params.thrownError }
  }

  const terminal = params.terminal
  const reason = terminal?.reason
  switch (reason) {
    case 'completed':
      return { type: 'completed' }
    case undefined:
    case 'aborted_streaming':
    case 'aborted_tools':
      return { type: 'cancelled' }
    case 'model_error':
      return { type: 'failed', error: terminal.error }
    default:
      return {
        type: 'failed',
        message: `query ended without successful completion: ${reason}`,
      }
  }
}

export type QueryParams = {
  messages: Message[]
  systemPrompt: SystemPrompt
  userContext: { [k: string]: string } //例如 CLAUDE.md、项目记忆等。以UserMessage的方式拼进消息列表
  systemContext: { [k: string]: string } //例如 git 状态、日期等。以SystemMessage的方式拼进消息列表
  canUseTool: CanUseToolFn //每次模型发起 tool_use 时的权限检查。「能不能用、要不要弹窗、自动批准还是拒绝」
  toolUseContext: ToolUseContext //本轮 query（含多轮 tool 循环）的「运行时上下文」，是最大、最杂的一个对象
  fallbackModel?: string
  querySource: QuerySource
  maxOutputTokensOverride?: number
  maxTurns?: number
  skipCacheWrite?: boolean
  // API task_budget (output_config.task_budget, beta task-budgets-2026-03-13)。
  // 与 tokenBudget +500k 自动继续功能不同。`total` 是整个 agent 轮次的预算；
  // `remaining` 根据累积的 API 使用量每轮计算。参见 claude.ts 中的 configureTaskBudgetParams。
  taskBudget?: { total: number }
  deps?: QueryDeps
}

// -- 查询循环状态

// 在循环迭代之间携带的可变状态
type State = {
  messages: Message[]
  toolUseContext: ToolUseContext
  autoCompactTracking: AutoCompactTrackingState | undefined
  maxOutputTokensRecoveryCount: number
  hasAttemptedReactiveCompact: boolean
  maxOutputTokensOverride: number | undefined
  pendingToolUseSummary: Promise<ToolUseSummaryMessage | null> | undefined
  stopHookActive: boolean | undefined
  turnCount: number
  // 上一次迭代继续的原因。第一次迭代时未定义。
  // 让测试能够断言恢复路径已触发，而无需检查消息内容。
  transition: Continue | undefined
}
export async function* query(
  params: QueryParams,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal
> {
  const consumedCommandUuids: string[] = []
  const consumedAutonomyCommands: QueuedCommand[] = []

  // 为此查询轮次创建 Langfuse 跟踪（如果未配置，则为空操作）。
  // 当作为子 agent 调用时，langfuseTrace 已由 runAgent() 设置
  // — 复用而不是创建独立的跟踪。
  const ownsTrace = !params.toolUseContext.langfuseTrace
  logForDebugging(
    `[query] ownsTrace=${ownsTrace} incoming langfuseTrace=${params.toolUseContext.langfuseTrace ? 'present' : 'null/undefined'} isLangfuseEnabled=${isLangfuseEnabled()}`,
  )
  const langfuseTrace =
    params.toolUseContext.langfuseTrace ??
    (isLangfuseEnabled()
      ? createTrace({
          sessionId: getSessionId(),
          model: params.toolUseContext.options.mainLoopModel,
          provider: getAPIProvider(),
          input: params.messages,
          querySource: params.querySource,
        })
      : null)

  // 将跟踪附加到 toolUseContext，以便工具执行可以记录观测
  const paramsWithTrace: QueryParams = langfuseTrace
    ? {
        ...params,
        toolUseContext: { ...params.toolUseContext, langfuseTrace },
      }
    : params

  let terminal: Terminal | undefined
  let didThrow = false
  let thrownError: unknown
  try {
    terminal = yield* queryLoop(
      paramsWithTrace,
      consumedCommandUuids,
      consumedAutonomyCommands,
    )
  } catch (error) {
    didThrow = true
    thrownError = error
    throw error
  } finally {
    await finalizeAutonomyCommandsForTurn({
      commands: consumedAutonomyCommands,
      outcome: getAutonomyTurnOutcome({
        terminal,
        ...(didThrow ? { thrownError } : {}),
      }),
      priority: 'later',
    })
      .then(nextCommands => {
        for (const command of nextCommands) {
          enqueue(command)
        }
      })
      .catch(logError)

    // Only end the trace if we created it — sub-agents own their traces
    if (ownsTrace) {
      const isAborted =
        terminal?.reason === 'aborted_streaming' ||
        terminal?.reason === 'aborted_tools'
      endTrace(langfuseTrace, undefined, isAborted ? 'interrupted' : undefined)
    }
  }

  // 仅在 queryLoop 正常返回时到达。在抛出时跳过（错误通过 yield* 传播）
  // 以及在 .return() 时跳过（Return 完成会关闭两个生成器）。
  // 这提供了与 print.ts 的 drainCommandQueue 在轮次失败时相同的非对称“已启动但未完成”信号。
  for (const uuid of consumedCommandUuids) {
    notifyCommandLifecycle(uuid, 'completed')
  }
  return terminal!
}

async function* queryLoop(
  params: QueryParams,
  consumedCommandUuids: string[],
  consumedAutonomyCommands: QueuedCommand[],
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  Terminal
> {
  // 不可变参数 — 在查询循环期间永远不会重新赋值。
  const {
    systemPrompt,
    userContext,
    systemContext,
    canUseTool,
    fallbackModel,
    querySource,
    maxTurns,
    skipCacheWrite,
  } = params
  const deps = params.deps ?? productionDeps()

  // 可变的跨迭代状态。循环体在每次迭代顶部解构此状态，
  // 以便读取保持裸名称（`messages`、`toolUseContext`）。
  // 继续站点写入 `state = { ... }` 而不是 9 个单独的赋值。
  let state: State = {
    messages: params.messages,
    toolUseContext: params.toolUseContext,
    maxOutputTokensOverride: params.maxOutputTokensOverride,
    autoCompactTracking: undefined,
    stopHookActive: undefined,
    maxOutputTokensRecoveryCount: 0,
    hasAttemptedReactiveCompact: false,
    turnCount: 1,
    pendingToolUseSummary: undefined,
    transition: undefined,
  }
  const budgetTracker = feature('TOKEN_BUDGET') ? createBudgetTracker() : null

  // task_budget.remaining 在压缩边界（compaction boundaries）之间的跟踪逻辑。
  // 在首次触发 compaction 之前该值为 undefined —— 当上下文尚未被压缩时，
  // 服务端可以看到完整历史，因此会自行基于 {total} 计算剩余量
  //（见 api/api/sampling/prompt/renderer.py:292）。
  //
  // 在发生 compaction 之后，服务端只会看到摘要内容，从而会低估已消耗的 token。
  // remaining 用于告诉服务端：在压缩发生前被摘要掉的“完整上下文窗口”到底有多少。
  //
  // 在多次 compaction 的情况下是累积的：每次都会减去触发该次压缩时的最终上下文窗口。
  // 该变量是 loop-local（不放在 State 中），以避免修改 7 个 continue 相关调用点。
  let taskBudgetRemaining: number | undefined

  // 在入口处对不可变的环境/统计信息/会话状态进行快照。
  // 请参阅 QueryConfig 以了解包含的内容以及为何有意排除 feature() 门。
  const config = buildQueryConfig()

  // 每个用户回合触发一次——提示信息在循环迭代中保持不变，
  // 因此每次迭代触发都会向 sideQuery 询问相同的问题 N 次。
  // 消费已解决的轮询点（永不阻塞）。`using` 会在生成器退出路径上释放内存——有关释放/遥测语义，
  // 请参阅 MemoryPrefetch。
  //获取相关记忆文件清单。并通过大模型筛选，但是使用地方在后续接收完这轮消息后，调用pendingMemoryPrefetch.promise获取结果。
  using pendingMemoryPrefetch = startRelevantMemoryPrefetch(
    state.messages,
    state.toolUseContext,
  )

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // 在每次迭代顶部解构状态。toolUseContext 单独在迭代内被重新赋值
    //（queryTracking、消息更新）；其余的在继续站点之间是只读的。
    let { toolUseContext } = state
    const {
      messages,
      autoCompactTracking,
      maxOutputTokensRecoveryCount,
      hasAttemptedReactiveCompact,
      maxOutputTokensOverride,
      pendingToolUseSummary,
      stopHookActive,
      turnCount,
    } = state

    // 技能发现预取——每次迭代（使用 findWritePivot 守卫，在非写入迭代中提前返回）。
    // 发现过程在模型流和工具执行期间运行；等待工具执行完毕后，内存预取消耗也随之进行。
    // 它取代了 getAttachmentMessages 内部阻塞的 assistant_turn 路径
    // （在生产环境中，97% 的此类调用未找到任何内容）。
    // Turn-0 用户输入发现仍然阻塞在 userInputAttachments 中——这是唯一一个没有先前工作可以隐藏的信号。
    const pendingSkillPrefetch = skillPrefetch?.startSkillDiscoveryPrefetch(
      //技能发现预取操作
      null,
      messages,
      toolUseContext,
    )

    yield { type: 'stream_request_start' }

    queryCheckpoint('query_fn_entry')

    // 记录无头延迟跟踪的查询开始（跳过子 agent）
    if (!toolUseContext.agentId) {
      headlessProfilerCheckpoint('query_started')
    }

    // 初始化或递增查询跟踪链，是**“一次对话查询链路”的追踪信息**，
    // 用来把同一次用户请求触发的多轮 query() 调用、工具调用、hooks、压缩(compact)
    // 以及 fork 出来的子 agent 查询关联到同一条链上，并记录它在链路中的层级深度。
    const queryTracking = toolUseContext.queryTracking
      ? {
          chainId: toolUseContext.queryTracking.chainId,
          depth: toolUseContext.queryTracking.depth + 1,
        }
      : {
          chainId: deps.uuid(),
          depth: 0,
        }

    const queryChainIdForAnalytics =
      queryTracking.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

    toolUseContext = {
      ...toolUseContext,
      queryTracking,
    }

    let messagesForQuery = getMessagesAfterCompactBoundary(messages)

    let tracking = autoCompactTracking

    // 对聚合的工具结果大小执行每条消息预算。在 microcompact 之前运行
    // — 缓存的 MC 纯粹基于 tool_use_id 操作（从不检查内容），
    // 因此内容替换对它不可见，两者可以干净地组合。
    // 当 contentReplacementState 未定义时（功能关闭），无操作。
    // 仅对在恢复时会读回记录的查询源进行持久化：agentId 路由到旁链文件（AgentTool 恢复）
    // 或会话文件（/resume）。临时的 runForkedAgent 调用者（agent_summary 等）不持久化。
    //**对工具查询结果的长度做限制，超长就使用预览+真实内容路径。超长内容会存入本地磁盘。**
    const persistReplacements =
      querySource.startsWith('agent:') ||
      querySource.startsWith('repl_main_thread')
    messagesForQuery = await applyToolResultBudget(
      messagesForQuery,
      toolUseContext.contentReplacementState,
      persistReplacements
        ? records =>
            void recordContentReplacement(
              records,
              toolUseContext.agentId,
            ).catch(logError)
        : undefined,
      new Set(
        toolUseContext.options.tools
          .filter(t => !Number.isFinite(t.maxResultSizeChars))
          .map(t => t.name),
      ),
    )

    // 在 microcompact 之前应用剪裁（两者都可以运行 — 它们不是互斥的）。
    // snipTokensFreed 被传递给 autocompact，以便其阈值检查反映剪裁移除的内容；
    // 仅靠 tokenCountWithEstimation 无法看到它（它从受保护的尾部助手读取使用量，
    // 该助手在剪裁后保持不变）。
    let snipTokensFreed = 0
    if (feature('HISTORY_SNIP')) {
      queryCheckpoint('query_snip_start')
      const snipResult = snipModule!.snipCompactIfNeeded(messagesForQuery)
      messagesForQuery = snipResult.messages
      snipTokensFreed = snipResult.tokensFreed
      if (snipResult.boundaryMessage) {
        yield snipResult.boundaryMessage
      }
      queryCheckpoint('query_snip_end')
    }

    // 在 autocompact 之前应用 microcompact
    queryCheckpoint('query_microcompact_start')
    //删减旧的tool_result内容。方式：1.通过本地替换（保留最近5个）
    // 。2.通过缓存修改（已注册的、可压缩的工具结果数量超过10个，保留最近5个）。
    const microcompactResult = await deps.microcompact(
      messagesForQuery,
      toolUseContext,
      querySource,
    )
    messagesForQuery = microcompactResult.messages
    // Release original strings from contentReplacementState.replacements for
    // tool results whose content was replaced with the cleared message.
    if (microcompactResult.clearedToolUseIds?.length) {
      const replacements = toolUseContext?.contentReplacementState?.replacements
      if (replacements) {
        for (const id of microcompactResult.clearedToolUseIds) {
          replacements.delete(id)
        }
      }
    }
    // For cached microcompact (cache editing), defer boundary message until after
    // the API response so we can use actual cache_deleted_input_tokens.
    // Gated behind feature() so the string is eliminated from external builds.
    const pendingCacheEdits = feature('CACHED_MICROCOMPACT')
      ? microcompactResult.compactionInfo?.pendingCacheEdits
      : undefined
    queryCheckpoint('query_microcompact_end')

    // 投影折叠的上下文视图，并可能提交更多折叠。
    // 在 autocompact 之前运行，这样如果折叠使我们低于 autocompact 阈值，
    // autocompact 将无操作，我们保留细粒度的上下文而不是单个摘要。
    //
    // 不产生任何内容 — 折叠视图是 REPL 完整历史记录上的读取时投影。
    // 摘要消息存在于折叠存储中，而不是 REPL 数组中。这就是使折叠能够跨轮次持久化的原因：
    // projectView() 在每次进入时重放提交日志。在轮次内，视图通过 continue 站点处的
    // state.messages（query.ts:1192）向前流动，下一次 projectView() 无操作，
    // 因为存档的消息已从其输入中消失。
    if (feature('CONTEXT_COLLAPSE') && contextCollapse) {
      const collapseResult = await contextCollapse.applyCollapsesIfNeeded(
        messagesForQuery,
        toolUseContext,
        querySource,
      )
      messagesForQuery = collapseResult.messages
    }

    const fullSystemPrompt = asSystemPrompt(
      appendSystemContext(systemPrompt, systemContext),
    )

    queryCheckpoint('query_autocompact_start')
    const { compactionResult, consecutiveFailures } = await deps.autocompact(
      messagesForQuery,
      toolUseContext,
      {
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        forkContextMessages: messagesForQuery,
      },
      querySource,
      tracking,
      snipTokensFreed,
    )
    queryCheckpoint('query_autocompact_end')

    if (compactionResult) {
      const {
        preCompactTokenCount,
        postCompactTokenCount,
        truePostCompactTokenCount,
        compactionUsage,
      } = compactionResult

      logEvent('tengu_auto_compact_succeeded', {
        originalMessageCount: messages.length,
        compactedMessageCount:
          compactionResult.summaryMessages.length +
          compactionResult.attachments.length +
          compactionResult.hookResults.length,
        preCompactTokenCount,
        postCompactTokenCount,
        truePostCompactTokenCount,
        compactionInputTokens: compactionUsage?.input_tokens,
        compactionOutputTokens: compactionUsage?.output_tokens,
        compactionCacheReadTokens:
          compactionUsage?.cache_read_input_tokens ?? 0,
        compactionCacheCreationTokens:
          compactionUsage?.cache_creation_input_tokens ?? 0,
        compactionTotalTokens: compactionUsage
          ? compactionUsage.input_tokens +
            (compactionUsage.cache_creation_input_tokens ?? 0) +
            (compactionUsage.cache_read_input_tokens ?? 0) +
            compactionUsage.output_tokens
          : 0,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })

      // task_budget：在下面的 messagesForQuery 被 postCompactMessages 替换之前捕获压缩前的最终上下文窗口。
      // iterations[-1] 是权威的最终窗口（服务器后工具循环）；参见 #304930。
      if (params.taskBudget) {
        const preCompactContext =
          finalContextTokensFromLastResponse(messagesForQuery)
        taskBudgetRemaining = Math.max(
          0,
          (taskBudgetRemaining ?? params.taskBudget.total) - preCompactContext,
        )
      }

      // 每次压缩时重置，以便 turnCounter/turnId 反映最近的压缩。
      // recompactionInfo（autoCompact.ts:190）在调用前已经捕获了
      // turnsSincePreviousCompact/previousCompactTurnId 的旧值，因此这次重置不会丢失它们。
      tracking = {
        compacted: true,
        turnId: deps.uuid(),
        turnCounter: 0,
        consecutiveFailures: 0,
      }

      const postCompactMessages = buildPostCompactMessages(compactionResult)
      //*把压缩信息推送出去，更新历史message列表，方便下一次取消息时，从最新的分割线开始取。
      for (const message of postCompactMessages) {
        yield message
      }

      // 使用压缩后的消息继续当前的查询调用
      messagesForQuery = postCompactMessages
    } else if (consecutiveFailures !== undefined) {
      // Autocompact 失败 — 传播失败计数，以便断路器可以在下一次迭代时停止重试。
      tracking = {
        ...(tracking ?? { compacted: false, turnId: '', turnCounter: 0 }),
        consecutiveFailures,
      }
    }

    // TODO：设置期间无需设置 toolUseContext.messages，因为此处已更新
    toolUseContext = {
      ...toolUseContext,
      messages: messagesForQuery,
    }

    const assistantMessages: AssistantMessage[] = []
    const toolResults: (UserMessage | AttachmentMessage)[] = []
    // 参见 https://docs.claude.com/en/docs/build-with-claude/tool-use
    // 注意：stop_reason === 'tool_use' 不可靠 —— 它并不总是被正确设置。
    // 在流式传输期间，每当 tool_use 块到达时设置 —— 这是唯一的循环退出信号。
    // 如果流式传输后为 false，我们就完成了（模 stop-hook 重试）。
    const toolUseBlocks: ToolUseBlock[] = []
    let needsFollowUp = false

    queryCheckpoint('query_setup_start')
    const useStreamingToolExecution = config.gates.streamingToolExecution
    //是否使用流式工具执行，不要只靠 stop_reason === 'tool_use'，而要在流里看到 tool_use 块再驱动循环。
    let streamingToolExecutor = useStreamingToolExecution
      ? new StreamingToolExecutor(
          toolUseContext.options.tools,
          canUseTool,
          toolUseContext,
        )
      : null

    const appState = toolUseContext.getAppState()
    const permissionMode = appState.toolPermissionContext.mode
    //根据运行模式和当前模型，获取当前要使用的模型。(具体怎么切换，没有看懂。)
    let currentModel = getRuntimeMainLoopModel({
      permissionMode, //运行的模式，包括auto、plan、bypassPermissions、acceptEdits、dontAsk。
      mainLoopModel: toolUseContext.options.mainLoopModel,
      exceeds200kTokens: //当前是否已经超过200k token的限制。
        permissionMode === 'plan' &&
        doesMostRecentAssistantMessageExceed200k(messagesForQuery),
    })

    queryCheckpoint('query_setup_end')

    // 每个查询会话创建一次 fetch 包装器，以避免内存保留。
    // 每次调用 createDumpPromptsFetch 都会创建一个捕获请求体的闭包。
    // 只创建一次意味着只保留最新的请求体（约 700KB），
    // 而不是会话中的所有请求体（长时间会话约 500MB）。
    // 注意：在 query() 调用期间，agentId 实际上是常量 —— 它只在查询之间变化
    // （例如 /clear 命令或会话恢复）。
    const dumpPromptsFetch = config.gates.isAnt
      ? createDumpPromptsFetch(toolUseContext.agentId ?? config.sessionId)
      : undefined

    // 如果已达到硬阻塞限制则阻塞（仅在自动压缩关闭时适用）
    // 这会预留空间，以便用户仍然可以手动运行 /compact
    // 如果刚刚发生压缩，则跳过此检查 —— 压缩结果已被验证低于阈值，
    // 而 tokenCountWithEstimation 将使用保留消息中反映压缩前上下文大小的陈旧 input_tokens。
    // 同样的陈旧性适用于剪裁：减去 snipTokensFreed（否则我们会在剪裁使我们低于自动压缩阈值
    // 但陈旧的使用量仍高于阻塞限制的窗口中错误阻塞 —— 在此 PR 之前，该窗口从未存在，
    // 因为 autocompact 总是在陈旧计数上触发）。
    // 同时也跳过 compact/session_memory 查询 — 这些是继承完整对话的分支 agent，
    // 如果在此阻塞会死锁（压缩 agent 需要运行以减少令牌计数）。
    // 当响应式压缩启用且允许自动压缩时也跳过 — 预占位的合成错误在 API 调用之前返回，
    // 因此响应式压缩永远看不到需要响应的提示过长。
    // 扩展到 walrus，以便在主动模式失败时 RC 可以作为后备。
    //
    // 同样的跳过适用于上下文折叠：其 recoverFromOverflow 在真实的 API 413 上排空暂存的折叠，
    // 然后回退到 reactiveCompact。这里的合成预占位会在 API 调用之前返回，并使两种恢复路径都匮乏。
    // isAutoCompactEnabled() 条件保留了用户显式的“无自动任何操作”配置 — 如果他们设置了
    // DISABLE_AUTO_COMPACT，他们会得到预占位。
    let collapseOwnsIt = false
    if (feature('CONTEXT_COLLAPSE')) {
      collapseOwnsIt =
        (contextCollapse?.isContextCollapseEnabled() ?? false) &&
        isAutoCompactEnabled()
    }
    // 每轮提升一次媒体恢复门控。保留（在流循环内部）和恢复（之后）必须一致；
    // CACHED_MAY_BE_STALE 可以在 5-30 秒的流期间翻转，保留而不恢复会丢失消息。
    // PTL 不提升，因为它的保留是无门控的 — 它早于实验，已经是控制臂基线。
    //是否开启媒体恢复式压缩功能，只在模型调用报错413的时候使用。
    const mediaRecoveryEnabled =
      reactiveCompact?.isReactiveCompactEnabled() ?? false
    if (
      !compactionResult &&
      querySource !== 'compact' &&
      querySource !== 'session_memory' &&
      !(
        (reactiveCompact?.isReactiveCompactEnabled() && isAutoCompactEnabled()) //有自己的413（超长）错误处理机制。
      ) &&
      !collapseOwnsIt //有自己的413（超长）错误处理机制。
    ) {
      //没有开启自动压缩，也不是子Agent的时候，需要判断现在的token使用情况是否超过了blocking limit。
      //如果超过了blocking limit，就返回提示过长错误。
      //留了余量给用户手动‘/compact’压缩。
      const { isAtBlockingLimit } = calculateTokenWarningState(
        tokenCountWithEstimation(messagesForQuery) - snipTokensFreed,
        toolUseContext.options.mainLoopModel,
      )
      if (isAtBlockingLimit) {
        yield createAssistantAPIErrorMessage({
          content: PROMPT_TOO_LONG_ERROR_MESSAGE,
          error: 'invalid_request',
        })
        return { reason: 'blocking_limit' }
      }
    }

    // Predictive autocompact: estimate if this turn's growth will push
    // us past the context window. Uses effectiveContextWindow directly
    // (without the autocompact buffer) to avoid double-reserving with
    // getAutoCompactThreshold which already subtracts buffer.
    if (!compactionResult && isAutoCompactEnabled()) {
      const model = toolUseContext.options.mainLoopModel
      const currentTokens =
        tokenCountWithEstimation(messagesForQuery) - snipTokensFreed
      const estimatedGrowth = estimateMaxTurnGrowth(model)
      const predictiveThreshold =
        getEffectiveContextWindowSize(model) - estimatedGrowth
      if (currentTokens > predictiveThreshold) {
        const predictiveResult = await deps.autocompact(
          messagesForQuery,
          toolUseContext,
          {
            systemPrompt,
            userContext,
            systemContext,
            toolUseContext,
            forkContextMessages: messagesForQuery,
          },
          querySource,
          tracking,
          snipTokensFreed,
        )
        if (predictiveResult.compactionResult) {
          messagesForQuery = buildPostCompactMessages(
            predictiveResult.compactionResult,
          )
          snipTokensFreed = 0
          tracking = tracking
            ? {
                ...tracking,
                compacted: true,
                consecutiveFailures: predictiveResult.consecutiveFailures ?? 0,
              }
            : tracking
        }
      }
    }

    let attemptWithFallback = true

    queryCheckpoint('query_api_loop_start')
    try {
      while (attemptWithFallback) {
        attemptWithFallback = false
        try {
          let streamingFallbackOccured = false
          queryCheckpoint('query_api_streaming_start')
          for await (const message of deps.callModel({
            messages: prependUserContext(messagesForQuery, userContext),
            systemPrompt: fullSystemPrompt,
            thinkingConfig: toolUseContext.options.thinkingConfig,
            tools: toolUseContext.options.tools,
            signal: toolUseContext.abortController.signal,
            options: {
              async getToolPermissionContext() {
                const appState = toolUseContext.getAppState()
                return appState.toolPermissionContext
              },
              model: currentModel,
              ...(config.gates.fastModeEnabled && {
                fastMode: appState.fastMode,
              }),
              toolChoice: undefined,
              isNonInteractiveSession:
                toolUseContext.options.isNonInteractiveSession,
              fallbackModel,
              onStreamingFallback: () => {
                streamingFallbackOccured = true
              },
              querySource,
              agents: toolUseContext.options.agentDefinitions.activeAgents,
              allowedAgentTypes:
                toolUseContext.options.agentDefinitions.allowedAgentTypes,
              hasAppendSystemPrompt:
                !!toolUseContext.options.appendSystemPrompt,
              maxOutputTokensOverride,
              fetchOverride: dumpPromptsFetch,
              mcpTools: appState.mcp.tools,
              hasPendingMcpServers: appState.mcp.clients.some(
                c => c.type === 'pending',
              ),
              queryTracking,
              effortValue: appState.effortValue,
              advisorModel: appState.advisorModel,
              skipCacheWrite, //是否跳过本次缓存写入。forAgent在借用主Agent缓存的时候使用它。可以避免在fork的时候污染服务器的Agent缓存。
              agentId: toolUseContext.agentId,
              addNotification: toolUseContext.addNotification,
              ...(params.taskBudget && {
                taskBudget: {
                  total: params.taskBudget.total,
                  ...(taskBudgetRemaining !== undefined && {
                    remaining: taskBudgetRemaining,
                  }),
                },
              }),
              langfuseTrace: toolUseContext.langfuseTrace,
            },
          })) {
            // 我们不会使用第一次尝试中的 tool_calls
            // 我们可以使用...但那样我们就必须合并具有不同 id 的助手消息，并对完整的 tool_results 重复计数
            if (streamingFallbackOccured) {
              // 为孤立消息产生墓碑，以便它们从 UI 和记录中移除。
              // 这些部分消息（尤其是思考块）具有无效签名，
              // 否则会导致“思考块无法修改”的 API 错误。
              for (const msg of assistantMessages) {
                yield { type: 'tombstone' as const, message: msg }
              }
              logEvent('tengu_orphaned_messages_tombstoned', {
                orphanedMessageCount: assistantMessages.length,
                queryChainId: queryChainIdForAnalytics,
                queryDepth: queryTracking.depth,
              })

              assistantMessages.length = 0
              toolResults.length = 0
              toolUseBlocks.length = 0
              needsFollowUp = false

              // 丢弃失败流尝试的待处理结果，并创建新的执行器。
              // 这可以防止孤立的 tool_results（使用旧的 tool_use_ids）在回退响应到达后被产生。
              if (streamingToolExecutor) {
                streamingToolExecutor.discard()
                streamingToolExecutor = new StreamingToolExecutor(
                  toolUseContext.options.tools,
                  canUseTool,
                  toolUseContext,
                )
              }
            }
            // 在生成之前，在克隆的消息上回填 tool_use 输入，以便
            // SDK 流输出和记录序列化能看到遗留/派生字段。
            // 原始的 `message` 保持不变以供下面的 assistantMessages.push 使用
            // — 将其流回 API 并修改它会破坏提示缓存（字节不匹配）。
            let yieldMessage: typeof message = message
            if (message.type === 'assistant') {
              const assistantMsg = message as AssistantMessage
              const contentArr = Array.isArray(assistantMsg.message?.content)
                ? (assistantMsg.message.content as unknown as Array<{
                    type: string
                    input?: unknown
                    name?: string
                    [key: string]: unknown
                  }>)
                : []
              let clonedContent: typeof contentArr | undefined
              for (let i = 0; i < contentArr.length; i++) {
                const block = contentArr[i]!
                if (
                  block.type === 'tool_use' &&
                  typeof block.input === 'object' &&
                  block.input !== null
                ) {
                  const tool = findToolByName(
                    toolUseContext.options.tools,
                    block.name as string,
                  )
                  if (tool?.backfillObservableInput) {
                    const originalInput = block.input as Record<string, unknown>
                    const inputCopy = { ...originalInput }
                    tool.backfillObservableInput(inputCopy)
                    // 仅在回填添加了字段时生成克隆；如果它只是覆盖了现有字段（例如文件工具扩展 file_path），则跳过。
                    // 覆盖会更改序列化的记录并在恢复时破坏 VCR 测试夹具哈希，
                    // 而不会添加 SDK 流需要的任何内容 — 钩子通过 toolExecution.ts 单独获取扩展路径。
                    const addedFields = Object.keys(inputCopy).some(
                      k => !(k in originalInput),
                    )
                    if (addedFields) {
                      clonedContent ??= [...contentArr]
                      clonedContent[i] = { ...block, input: inputCopy }
                    }
                  }
                }
              }
              if (clonedContent) {
                yieldMessage = {
                  ...message,
                  message: {
                    ...(assistantMsg.message ?? {}),
                    content: clonedContent,
                  },
                } as typeof message
              }
            }
            // 保留可恢复的错误（提示过长、最大输出令牌），直到我们知道恢复
            // （折叠排空 / 响应式压缩 / 截断重试）能否成功。仍然推送到 assistantMessages，
            // 以便下面的恢复检查能够找到它们。
            // 任一子系统的保留都足够了 — 它们是独立的，因此关闭一个不会破坏另一个的恢复路径。
            //
            // feature() 仅在 if/ternary 条件下工作（bun:bundle 树摇约束），
            // 因此折叠检查是嵌套的而不是组合的。
            let withheld = false
            if (feature('CONTEXT_COLLAPSE')) {
              if (
                contextCollapse?.isWithheldPromptTooLong(
                  message as Message,
                  isPromptTooLongMessage as (msg: Message) => boolean,
                  querySource,
                )
              ) {
                withheld = true
              }
            }
            if (reactiveCompact?.isWithheldPromptTooLong(message as Message)) {
              withheld = true
            }
            if (
              mediaRecoveryEnabled &&
              reactiveCompact?.isWithheldMediaSizeError(message as Message)
            ) {
              withheld = true
            }
            if (isWithheldMaxOutputTokens(message)) {
              withheld = true
            }
            if (!withheld) {
              yield yieldMessage
            }
            if (message.type === 'assistant') {
              const assistantMessage = message as AssistantMessage
              assistantMessages.push(assistantMessage)

              const msgToolUseBlocks = (
                Array.isArray(assistantMessage.message?.content)
                  ? assistantMessage.message.content
                  : []
              ).filter(
                (content: { type: string }) => content.type === 'tool_use',
              ) as ToolUseBlock[]
              if (msgToolUseBlocks.length > 0) {
                toolUseBlocks.push(...msgToolUseBlocks)
                needsFollowUp = true
              }

              if (
                streamingToolExecutor &&
                !toolUseContext.abortController.signal.aborted
              ) {
                for (const toolBlock of msgToolUseBlocks) {
                  streamingToolExecutor.addTool(toolBlock, assistantMessage)
                }
              }
            }

            if (
              streamingToolExecutor &&
              !toolUseContext.abortController.signal.aborted
            ) {
              for (const result of streamingToolExecutor.getCompletedResults()) {
                if (result.message) {
                  yield result.message
                  toolResults.push(
                    ...normalizeMessagesForAPI(
                      [result.message],
                      toolUseContext.options.tools,
                    ).filter(_ => _.type === 'user'),
                  )
                }
              }
            }
          }
          queryCheckpoint('query_api_streaming_end')

          // 使用 API 报告的实际令牌删除计数（而不是客户端估算）生成延迟的 microcompact 边界消息。
          // 整个块通过 feature() 门控，以便从外部构建中消除被排除的字符串。
          if (feature('CACHED_MICROCOMPACT') && pendingCacheEdits) {
            const lastAssistant = assistantMessages.at(-1)
            // API 字段在请求之间是累积/粘性的，因此我们减去此请求之前捕获的基线以获得增量。
            const usage = lastAssistant?.message.usage
            const cumulativeDeleted = usage
              ? ((usage as unknown as Record<string, number>)
                  .cache_deleted_input_tokens ?? 0)
              : 0
            const deletedTokens = Math.max(
              0,
              cumulativeDeleted - pendingCacheEdits.baselineCacheDeletedTokens,
            )
            if (deletedTokens > 0) {
              yield createMicrocompactBoundaryMessage(
                pendingCacheEdits.trigger,
                0,
                deletedTokens,
                pendingCacheEdits.deletedToolIds,
                [],
              )
            }
          }
        } catch (innerError) {
          if (innerError instanceof FallbackTriggeredError && fallbackModel) {
            // 回退已触发 — 切换模型并重试
            currentModel = fallbackModel
            attemptWithFallback = true

            // 清除助手消息，因为我们将重试整个请求
            yield* yieldMissingToolResultBlocks(
              assistantMessages,
              '模型回退已触发',
            )
            assistantMessages.length = 0
            toolResults.length = 0
            toolUseBlocks.length = 0
            needsFollowUp = false

            // 丢弃失败尝试的待处理结果，并创建新的执行器。
            // 这可以防止孤立的 tool_results（使用旧的 tool_use_ids）泄漏到重试中。
            if (streamingToolExecutor) {
              streamingToolExecutor.discard()
              streamingToolExecutor = new StreamingToolExecutor(
                toolUseContext.options.tools,
                canUseTool,
                toolUseContext,
              )
            }

            // 使用新模型更新工具使用上下文
            toolUseContext.options.mainLoopModel = fallbackModel

            // 思考签名是模型绑定的：将受保护的思考块（例如 capybara）重放到不受保护的回退（例如 opus）会返回 400。
            // 在重试前剥离，以便回退模型获得干净的历史记录。
            if (process.env.USER_TYPE === 'ant') {
              messagesForQuery = stripSignatureBlocks(messagesForQuery)
            }

            // 记录回退事件
            logEvent('tengu_model_fallback_triggered', {
              original_model:
                innerError.originalModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              fallback_model:
                fallbackModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              entrypoint:
                'cli' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              queryChainId: queryChainIdForAnalytics,
              queryDepth: queryTracking.depth,
            })

            // 生成关于回退的系统消息 — 使用 'warning' 级别，以便
            // 用户无需详细模式即可看到通知
            yield createSystemMessage(
              `由于对 ${renderModelName(innerError.originalModel)} 的高需求，已切换到 ${renderModelName(innerError.fallbackModel)}`,
              'warning',
            )

            continue
          }
          throw innerError
        }
      }
    } catch (error) {
      logError(error)
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logEvent('tengu_query_error', {
        assistantMessages: assistantMessages.length,
        toolUses: assistantMessages.flatMap(_ =>
          (Array.isArray(_.message?.content)
            ? (_.message.content as Array<{ type: string }>)
            : []
          ).filter(content => content.type === 'tool_use'),
        ).length,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })

      // 使用用户友好的消息处理图像大小/调整大小错误
      if (
        error instanceof ImageSizeError ||
        error instanceof ImageResizeError
      ) {
        yield createAssistantAPIErrorMessage({
          content: error.message,
        })
        return { reason: 'image_error' }
      }

      // 通常 queryModelWithStreaming 不应抛出错误，而是将它们作为合成助手消息生成。
      // 但是如果由于错误而抛出，我们可能处于已发出 tool_use 块但将在发出 tool_result 之前停止的状态。
      yield* yieldMissingToolResultBlocks(assistantMessages, errorMessage)

      // 显示真实的错误，而不是误导性的“[用户中断请求]” — 此路径是模型/运行时故障，不是用户操作。
      // SDK 消费者在看到例如 Node 18 缺少 Array.prototype.with() 时会看到幻影中断，掩盖了实际原因。
      yield createAssistantAPIErrorMessage({
        content: errorMessage,
      })

      // 为了帮助跟踪错误，为 ants 大声记录
      logAntError('查询错误', error)
      return { reason: 'model_error', error }
    }

    // 在模型响应完成后执行后采样钩子
    // session Memory存储
    if (assistantMessages.length > 0) {
      void executePostSamplingHooks(
        messagesForQuery.concat(assistantMessages),
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
      )
    }

    // 我们需要在任何其他事情之前处理流中止。
    // 当使用 streamingToolExecutor 时，我们必须消费 getRemainingResults()，以便
    // 执行器可以为队列中/进行中的工具生成合成的 tool_result 块。
    // 没有这个，tool_use 块将缺少匹配的 tool_result 块。
    if (toolUseContext.abortController.signal.aborted) {
      if (streamingToolExecutor) {
        // 消费剩余结果 - 执行器为中止的工具生成合成的 tool_results，
        // 因为它在 executeTool() 中检查中止信号
        for await (const update of streamingToolExecutor.getRemainingResults()) {
          if (update.message) {
            yield update.message
          }
        }
      } else {
        yield* yieldMissingToolResultBlocks(assistantMessages, '用户中断')
      }
      // chicago MCP：中断时自动取消隐藏 + 释放锁。
      // 与 stopHooks.ts 中自然轮次结束路径相同的清理。仅主线程 —
      // 参见 stopHooks.ts 了解子代理释放主线程锁的原理。
      if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
        try {
          const { cleanupComputerUseAfterTurn } = await import(
            './utils/computerUse/cleanup.js'
          )
          await cleanupComputerUseAfterTurn(toolUseContext)
        } catch {
          // 失败静默 — 这是自用清理，不是关键路径
        }
      }

      // 跳过提交中断的中断消息 — 后续的排队用户消息提供了足够的上下文。
      if (toolUseContext.abortController.signal.reason !== 'interrupt') {
        yield createUserInterruptionMessage({
          toolUse: false,
        })
      }
      return { reason: 'aborted_streaming' }
    }

    // 生成上一轮的工具使用摘要 — haiku（约 1 秒）在模型流式传输期间解析（5-30 秒）
    if (pendingToolUseSummary) {
      const summary = await pendingToolUseSummary
      if (summary) {
        yield summary
      }
    }

    if (!needsFollowUp) {
      const lastMessage = assistantMessages.at(-1)

      // 提示过长恢复：流循环保留了错误（参见上面的 withheldByCollapse / withheldByReactive）。
      // 首先尝试折叠排空（便宜，保留细粒度上下文），然后响应式压缩（完整摘要）。
      // 每个单次 — 如果重试仍然 413，则由下一阶段处理或错误浮出水面。
      const isWithheld413 =
        lastMessage?.type === 'assistant' &&
        lastMessage.isApiErrorMessage &&
        isPromptTooLongMessage(lastMessage)
      // 媒体大小拒绝（图像/PDF/多图像）可通过响应式压缩的剥离重试恢复。
      // 与 PTL 不同，媒体错误跳过折叠排空 — 折叠不剥离图像。mediaRecoveryEnabled
      // 是流循环前提升的门控（与保留检查相同的值 — 这两者必须一致，否则保留的消息会丢失）。
      // 如果过大的媒体在保留的尾部中，压缩后的轮次将再次出现媒体错误；hasAttemptedReactiveCompact
      // 防止螺旋，错误会浮出水面。
      const isWithheldMedia =
        mediaRecoveryEnabled &&
        reactiveCompact?.isWithheldMediaSizeError(lastMessage as Message)
      if (isWithheld413) {
        // 首先：排空所有暂存的上下文折叠。门控基于前一个转换不是 collapse_drain_retry
        // — 如果我们已经排空并且重试仍然 413，则回退到响应式压缩。
        if (
          feature('CONTEXT_COLLAPSE') &&
          contextCollapse &&
          state.transition?.reason !== 'collapse_drain_retry'
        ) {
          const drained = contextCollapse.recoverFromOverflow(
            messagesForQuery,
            querySource,
          )
          if (drained.committed > 0) {
            const next: State = {
              messages: drained.messages,
              toolUseContext,
              autoCompactTracking: tracking,
              maxOutputTokensRecoveryCount,
              hasAttemptedReactiveCompact,
              maxOutputTokensOverride: undefined,
              pendingToolUseSummary: undefined,
              stopHookActive: undefined,
              turnCount,
              transition: {
                reason: 'collapse_drain_retry',
                committed: drained.committed,
              },
            }
            state = next
            continue
          }
        }
      }
      if ((isWithheld413 || isWithheldMedia) && reactiveCompact) {
        const compacted = await reactiveCompact.tryReactiveCompact({
          hasAttempted: hasAttemptedReactiveCompact,
          querySource,
          aborted: toolUseContext.abortController.signal.aborted,
          messages: messagesForQuery,
          cacheSafeParams: {
            systemPrompt,
            userContext,
            systemContext,
            toolUseContext,
            forkContextMessages: messagesForQuery,
          },
        })

        if (compacted) {
          // task_budget：与上面主动路径相同的结转。
          // messagesForQuery 在此处仍持有压缩前的数组（413 失败尝试的输入）。
          if (params.taskBudget) {
            const preCompactContext =
              finalContextTokensFromLastResponse(messagesForQuery)
            taskBudgetRemaining = Math.max(
              0,
              (taskBudgetRemaining ?? params.taskBudget.total) -
                preCompactContext,
            )
          }

          const postCompactMessages = buildPostCompactMessages(compacted)
          //把压缩信息插入到历史消息中。
          for (const msg of postCompactMessages) {
            yield msg
          }
          const next: State = {
            messages: postCompactMessages,
            toolUseContext,
            autoCompactTracking: undefined,
            maxOutputTokensRecoveryCount,
            hasAttemptedReactiveCompact: true,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'reactive_compact_retry' },
          }
          state = next
          continue
        }

        // 无法恢复 — 浮出被保留的错误并退出。不要回退到停止钩子：
        // 模型从未产生有效响应，因此钩子没有有意义的评估内容。
        // 在提示过长上运行停止钩子会创建死亡螺旋：错误 → 钩子阻塞 → 重试 → 错误 → …（钩子每个周期注入更多令牌）。
        yield lastMessage!
        void executeStopFailureHooks(lastMessage!, toolUseContext)
        return { reason: isWithheldMedia ? 'image_error' : 'prompt_too_long' }
      } else if (feature('CONTEXT_COLLAPSE') && isWithheld413) {
        // reactiveCompact 被编译掉，但 contextCollapse 保留且无法恢复（暂存队列为空/陈旧）。浮出。
        // 相同的提前返回原理 — 不要回退到停止钩子。
        yield lastMessage
        void executeStopFailureHooks(lastMessage, toolUseContext)
        return { reason: 'prompt_too_long' }
      }

      // 检查 max_output_tokens 并注入恢复消息。错误在上面被保留；
      // 只有在恢复耗尽时才浮出。
      if (isWithheldMaxOutputTokens(lastMessage)) {
        // 升级重试：如果我们使用了上限 8k 默认值并达到了限制，
        // 以 64k 重试相同的请求 — 无元消息，无多轮舞蹈。
        // 每轮触发一次（由覆盖检查保护），然后如果 64k 也达到上限，则回退到多轮恢复。
        // 3P 默认：false（未在 Bedrock/Vertex 上验证）
        const capEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
          'tengu_otk_slot_v1',
          false,
        )
        if (
          capEnabled &&
          maxOutputTokensOverride === undefined &&
          !process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS
        ) {
          logEvent('tengu_max_tokens_escalate', {
            escalatedTo: ESCALATED_MAX_TOKENS,
          })
          const next: State = {
            messages: messagesForQuery,
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount,
            hasAttemptedReactiveCompact,
            maxOutputTokensOverride: ESCALATED_MAX_TOKENS,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'max_output_tokens_escalate' },
          }
          state = next
          continue
        }

        if (maxOutputTokensRecoveryCount < MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) {
          const recoveryMessage = createUserMessage({
            content:
              `输出令牌限制已到达。直接恢复 — 不要道歉，不要回顾你正在做的事情。` +
              `如果截断发生，从中间想法处继续。将剩余工作分解为更小的部分。`,
            isMeta: true,
          })

          const next: State = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              recoveryMessage,
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: maxOutputTokensRecoveryCount + 1,
            hasAttemptedReactiveCompact,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: {
              reason: 'max_output_tokens_recovery',
              attempt: maxOutputTokensRecoveryCount + 1,
            },
          }
          state = next
          continue
        }

        // 恢复已耗尽 — 现在浮出被保留的错误。
        yield lastMessage
      }

      // 当最后一条消息是 API 错误（速率限制、提示过长、认证失败等）时跳过停止钩子。
      // 模型从未产生真实响应 — 钩子评估它会创建死亡螺旋：
      // 错误 → 钩子阻塞 → 重试 → 错误 → …
      if (lastMessage?.isApiErrorMessage) {
        void executeStopFailureHooks(lastMessage, toolUseContext)
        return {
          reason: 'model_error',
          error: lastMessage.error ?? lastMessage.apiError ?? 'api_error',
        }
      }

      //自动缓存处理   autoDream执行。
      const stopHookResult = yield* handleStopHooks(
        messagesForQuery,
        assistantMessages,
        systemPrompt,
        userContext,
        systemContext,
        toolUseContext,
        querySource,
        stopHookActive,
      )

      if (stopHookResult.preventContinuation) {
        return { reason: 'stop_hook_prevented' }
      }

      if (stopHookResult.blockingErrors.length > 0) {
        const next: State = {
          messages: [
            ...messagesForQuery,
            ...assistantMessages,
            ...stopHookResult.blockingErrors,
          ],
          toolUseContext,
          autoCompactTracking: tracking,
          maxOutputTokensRecoveryCount: 0,
          // 保留响应式压缩守卫 — 如果压缩已运行且无法从提示过长恢复，
          // 在停止钩子阻塞错误后重试会产生相同的结果。
          // 在此处重置为 false 会导致无限循环：压缩 → 仍然过长 → 错误 →
          // 停止钩子阻塞 → 压缩 → … 消耗数千次 API 调用。
          hasAttemptedReactiveCompact,
          maxOutputTokensOverride: undefined,
          pendingToolUseSummary: undefined,
          stopHookActive: true,
          turnCount,
          transition: { reason: 'stop_hook_blocking' },
        }
        state = next
        continue
      }

      if (feature('TOKEN_BUDGET')) {
        const decision = checkTokenBudget(
          budgetTracker!,
          toolUseContext.agentId,
          getCurrentTurnTokenBudget(),
          getTurnOutputTokens(),
        )

        if (decision.action === 'continue') {
          incrementBudgetContinuationCount()
          logForDebugging(
            `令牌预算继续 #${decision.continuationCount}: ${decision.pct}% (${decision.turnTokens.toLocaleString()} / ${decision.budget.toLocaleString()})`,
          )
          state = {
            messages: [
              ...messagesForQuery,
              ...assistantMessages,
              createUserMessage({
                content: decision.nudgeMessage,
                isMeta: true,
              }),
            ],
            toolUseContext,
            autoCompactTracking: tracking,
            maxOutputTokensRecoveryCount: 0,
            hasAttemptedReactiveCompact: false,
            maxOutputTokensOverride: undefined,
            pendingToolUseSummary: undefined,
            stopHookActive: undefined,
            turnCount,
            transition: { reason: 'token_budget_continuation' },
          }
          continue
        }

        if (decision.completionEvent) {
          if (decision.completionEvent.diminishingReturns) {
            logForDebugging(
              `令牌预算提前停止：收益递减 ${decision.completionEvent.pct}%`,
            )
          }
          logEvent('tengu_token_budget_completed', {
            ...decision.completionEvent,
            queryChainId: queryChainIdForAnalytics,
            queryDepth: queryTracking.depth,
          })
        }
      }

      return { reason: 'completed' }
    }

    let shouldPreventContinuation = false
    let updatedToolUseContext = toolUseContext

    queryCheckpoint('query_tool_execution_start')

    if (streamingToolExecutor) {
      logEvent('tengu_streaming_tool_execution_used', {
        tool_count: toolUseBlocks.length,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    } else {
      logEvent('tengu_streaming_tool_execution_not_used', {
        tool_count: toolUseBlocks.length,
        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    }

    const toolUpdates = streamingToolExecutor
      ? streamingToolExecutor.getRemainingResults()
      : runTools(toolUseBlocks, assistantMessages, canUseTool, toolUseContext)

    for await (const update of toolUpdates) {
      if (update.message) {
        yield update.message

        if (
          update.message.type === 'attachment' &&
          update.message.attachment!.type === 'hook_stopped_continuation'
        ) {
          shouldPreventContinuation = true
        }

        toolResults.push(
          ...normalizeMessagesForAPI(
            [update.message],
            toolUseContext.options.tools,
          ).filter(_ => _.type === 'user'),
        )
      }
      if (update.newContext) {
        updatedToolUseContext = {
          ...update.newContext,
          queryTracking,
        }
      }
    }
    queryCheckpoint('query_tool_execution_end')

    // 在工具批处理完成后生成工具使用摘要 — 传递给下一次递归调用。把本轮“用了哪些工具、输入输出是什么、以及最后一段 assistant 文本上下文”的信息，传递给下一次递归调用。
    let nextPendingToolUseSummary:
      | Promise<ToolUseSummaryMessage | null>
      | undefined
    if (
      config.gates.emitToolUseSummaries &&
      toolUseBlocks.length > 0 &&
      !toolUseContext.abortController.signal.aborted &&
      !toolUseContext.agentId // 子 agent 不会出现在移动 UI 中 — 跳过 Haiku 调用
    ) {
      // 提取最后一个助手文本块作为上下文
      const lastAssistantMessage = assistantMessages.at(-1)
      let lastAssistantText: string | undefined
      if (lastAssistantMessage) {
        const textBlocks = (
          Array.isArray(lastAssistantMessage.message?.content)
            ? (lastAssistantMessage.message.content as Array<{
                type: string
                text?: string
              }>)
            : []
        ).filter(block => block.type === 'text')
        if (textBlocks.length > 0) {
          const lastTextBlock = textBlocks.at(-1)
          if (lastTextBlock && 'text' in lastTextBlock) {
            lastAssistantText = lastTextBlock.text
          }
        }
      }

      // 收集摘要生成的工具信息
      const toolUseIds = toolUseBlocks.map(block => block.id)
      const toolInfoForSummary = toolUseBlocks.map(block => {
        // 查找对应的工具结果
        const toolResult = toolResults.find(
          result =>
            result.type === 'user' &&
            Array.isArray(result.message.content) &&
            result.message.content.some(
              content =>
                content.type === 'tool_result' &&
                content.tool_use_id === block.id,
            ),
        )
        const resultContent =
          toolResult?.type === 'user' &&
          Array.isArray(toolResult.message.content)
            ? toolResult.message.content.find(
                (c): c is ToolResultBlockParam =>
                  c.type === 'tool_result' && c.tool_use_id === block.id,
              )
            : undefined
        return {
          name: block.name,
          input: block.input,
          output:
            resultContent && 'content' in resultContent
              ? resultContent.content
              : null,
        }
      })

      // 在不阻塞下一个 API 调用的情况下触发摘要生成
      nextPendingToolUseSummary = generateToolUseSummary({
        tools: toolInfoForSummary,
        signal: toolUseContext.abortController.signal,
        isNonInteractiveSession: toolUseContext.options.isNonInteractiveSession,
        lastAssistantText,
      })
        .then(summary => {
          if (summary) {
            return createToolUseSummaryMessage(summary, toolUseIds)
          }
          return null
        })
        .catch(() => null)
    }

    // 我们在工具调用期间被中止
    if (toolUseContext.abortController.signal.aborted) {
      // chicago MCP：在工具调用中途中止时自动取消隐藏 + 释放锁。
      // 这是 CU 最可能的 Ctrl+C 路径（例如慢速截图）。
      // 仅主线程 — 参见 stopHooks.ts 了解子代理原理。
      if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
        try {
          const { cleanupComputerUseAfterTurn } = await import(
            './utils/computerUse/cleanup.js'
          )
          await cleanupComputerUseAfterTurn(toolUseContext)
        } catch {
          // 失败静默 — 这是自用清理，不是关键路径
        }
      }
      // 跳过提交中断的中断消息 — 后续的排队用户消息提供了足够的上下文。
      if (toolUseContext.abortController.signal.reason !== 'interrupt') {
        yield createUserInterruptionMessage({
          toolUse: true,
        })
      }
      // 在中止时返回前检查 maxTurns
      const nextTurnCountOnAbort = turnCount + 1
      if (maxTurns && nextTurnCountOnAbort > maxTurns) {
        yield createAttachmentMessage({
          type: 'max_turns_reached',
          maxTurns,
          turnCount: nextTurnCountOnAbort,
        })
      }
      return { reason: 'aborted_tools' }
    }

    // 如果钩子指示阻止继续，则在此停止
    if (shouldPreventContinuation) {
      return { reason: 'hook_stopped' }
    }

    if (tracking?.compacted) {
      tracking.turnCounter++
      logEvent('tengu_post_autocompact_turn', {
        turnId:
          tracking.turnId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        turnCounter: tracking.turnCounter,

        queryChainId: queryChainIdForAnalytics,
        queryDepth: queryTracking.depth,
      })
    }

    // 注意：在工具调用完成后执行此操作，因为 API
    // 如果我们在 tool_result 消息与常规用户消息之间交错，将会出错。

    // 仪表化：在附件之前跟踪消息计数
    logEvent('tengu_query_before_attachments', {
      messagesForQueryCount: messagesForQuery.length,
      assistantMessagesCount: assistantMessages.length,
      toolResultsCount: toolResults.length,
      queryChainId: queryChainIdForAnalytics,
      queryDepth: queryTracking.depth,
    })

    // 在处理附件之前获取排队命令的快照。
    // 这些将作为附件发送，以便 Claude 可以在当前轮次中响应它们。
    //
    // 排空待处理的通知。LocalShellTask 完成是 'next'
    // （当 MONITOR_TOOL 开启时）并在没有 Sleep 的情况下排空。其他任务类型
    // （agent/workflow/framework）仍然默认为 'later' — Sleep 刷新覆盖了这些。
    // 如果所有任务类型都移到 'next'，此分支可以移除。
    //
    // 斜杠命令被排除在轮次中排空之外 — 它们必须通过轮次结束后的 processSlashCommand
    // （通过 useQueueProcessor）处理，而不是作为文本发送给模型。
    // Bash 模式命令已被 getQueuedCommandAttachments 中的 INLINE_NOTIFICATION_MODES 排除。
    //
    // Agent 作用域：队列是协调器和所有进程内子代理共享的进程全局单例。
    // 每个循环仅排空发送给它的内容 — 主线程排空 agentId===undefined，
    // 子代理排空自己的 agentId。用户提示（mode:'prompt'）仍然只发送给主线程；
    // 子代理永远不会看到提示流。
    // eslint-disable-next-line custom-rules/require-tool-match-name -- ToolUseBlock.name 没有别名
    const sleepRan = toolUseBlocks.some(b => b.name === SLEEP_TOOL_NAME)
    const isMainThread =
      querySource.startsWith('repl_main_thread') || querySource === 'sdk'
    const currentAgentId = toolUseContext.agentId
    const queuedCommandsSnapshot = getCommandsByMaxPriority(
      sleepRan ? 'later' : 'next',
    ).filter(cmd => {
      if (isSlashCommand(cmd)) return false
      if (isMainThread) return cmd.agentId === undefined
      // 子代理仅排空发送给它们的任务通知 — 永远不是用户提示，
      // 即使有人在上面标记了 agentId。
      return cmd.mode === 'task-notification' && cmd.agentId === currentAgentId
    })
    const queuedAutonomyClaim = await claimConsumableQueuedAutonomyCommands(
      queuedCommandsSnapshot,
    )
    if (queuedAutonomyClaim.staleCommands.length > 0) {
      removeFromQueue(queuedAutonomyClaim.staleCommands)
    }

    const claimedConsumedCommands = queuedAutonomyClaim.claimedCommands.filter(
      cmd => cmd.mode === 'prompt' || cmd.mode === 'task-notification',
    )
    if (claimedConsumedCommands.length > 0) {
      consumedAutonomyCommands.push(...claimedConsumedCommands)
      for (const cmd of claimedConsumedCommands) {
        if (cmd.uuid) {
          consumedCommandUuids.push(cmd.uuid)
          notifyCommandLifecycle(cmd.uuid, 'started')
        }
      }
      removeFromQueue(claimedConsumedCommands)
    }

    for await (const attachment of getAttachmentMessages(
      null,
      updatedToolUseContext,
      null,
      queuedAutonomyClaim.attachmentCommands,
      messagesForQuery.concat(assistantMessages, toolResults),
      querySource,
    )) {
      yield attachment
      toolResults.push(attachment)
    }

    // 内存预取消费：仅当已解决且未在更早的迭代中消费时。
    // 如果尚未解决，则跳过（零等待）并在下一次迭代重试 — 预取在轮次结束前有多少次循环迭代就有多少次机会。
    // readFileState（跨迭代累积）会过滤模型已经读取/写入/编辑过的记忆
    // — 包括在更早迭代中，而每轮的 toolUseBlocks 数组会错过这些。
    //取之前通过startRelevantMemoryPrefetch()获取的“记忆”文件清单。
    if (
      pendingMemoryPrefetch &&
      pendingMemoryPrefetch.settledAt !== null &&
      pendingMemoryPrefetch.consumedOnIteration === -1
    ) {
      const memoryAttachments = filterDuplicateMemoryAttachments(
        await pendingMemoryPrefetch.promise,
        toolUseContext.readFileState,
      )
      for (const memAttachment of memoryAttachments) {
        const msg = createAttachmentMessage(memAttachment)
        yield msg
        toolResults.push(msg)
      }
      pendingMemoryPrefetch.consumedOnIteration = turnCount - 1
    }

    // Inject prefetched skill discovery. collectSkillDiscoveryPrefetch emits
    // hidden_by_main_turn — true when the prefetch resolved before this point
    // (should be >98% at AKI@250ms / Haiku@573ms vs turn durations of 2-30s).
    if (skillPrefetch && pendingSkillPrefetch) {
      const skillAttachments =
        await skillPrefetch.collectSkillDiscoveryPrefetch(pendingSkillPrefetch)
      for (const att of skillAttachments) {
        const msg = createAttachmentMessage(att)
        yield msg
        toolResults.push(msg)
      }
    }

    // Remove only commands that were actually consumed as attachments.
    // Prompt and task-notification commands are converted to attachments above.
    const claimedCommandSet = new Set(claimedConsumedCommands)
    const consumedCommands = queuedAutonomyClaim.attachmentCommands.filter(
      cmd =>
        (cmd.mode === 'prompt' || cmd.mode === 'task-notification') &&
        !claimedCommandSet.has(cmd),
    )
    if (consumedCommands.length > 0) {
      for (const cmd of consumedCommands) {
        if (cmd.uuid) {
          consumedCommandUuids.push(cmd.uuid)
          notifyCommandLifecycle(cmd.uuid, 'started')
        }
      }
      removeFromQueue(consumedCommands)
    }

    // 仪表化：在添加后跟踪文件更改附件
    const fileChangeAttachmentCount = count(
      toolResults,
      tr =>
        tr.type === 'attachment' && tr.attachment.type === 'edited_text_file',
    )

    logEvent('tengu_query_after_attachments', {
      totalToolResultsCount: toolResults.length,
      fileChangeAttachmentCount,
      queryChainId: queryChainIdForAnalytics,
      queryDepth: queryTracking.depth,
    })

    // 在轮次之间刷新工具，以便新连接的 MCP 服务器可用
    if (updatedToolUseContext.options.refreshTools) {
      const refreshedTools = updatedToolUseContext.options.refreshTools()
      if (refreshedTools !== updatedToolUseContext.options.tools) {
        updatedToolUseContext = {
          ...updatedToolUseContext,
          options: {
            ...updatedToolUseContext.options,
            tools: refreshedTools,
          },
        }
      }
    }

    const toolUseContextWithQueryTracking = {
      ...updatedToolUseContext,
      queryTracking,
    }

    // 每次我们有工具结果并即将递归时，就是一整个轮次
    const nextTurnCount = turnCount + 1

    // 周期性任务摘要用于 `claude ps` — 在轮次中触发，以便
    // 长时间运行的 agent 仍然刷新其工作内容。仅门控于 !agentId，
    // 因此每个顶级会话（REPL、SDK、HFI、远程）都会生成摘要；子 agent/分支不会。
    if (feature('BG_SESSIONS')) {
      if (
        !toolUseContext.agentId &&
        taskSummaryModule!.shouldGenerateTaskSummary()
      ) {
        taskSummaryModule!.maybeGenerateTaskSummary({
          systemPrompt,
          userContext,
          systemContext,
          toolUseContext,
          forkContextMessages: messagesForQuery.concat(
            assistantMessages,
            toolResults,
          ),
        })
      }
    }

    // 检查是否已达到最大轮次限制
    if (maxTurns && nextTurnCount > maxTurns) {
      yield createAttachmentMessage({
        type: 'max_turns_reached',
        maxTurns,
        turnCount: nextTurnCount,
      })
      return { reason: 'max_turns', turnCount: nextTurnCount }
    }

    queryCheckpoint('query_recursive_call')
    const next: State = {
      messages: messagesForQuery.concat(assistantMessages, toolResults),
      toolUseContext: toolUseContextWithQueryTracking,
      autoCompactTracking: tracking,
      turnCount: nextTurnCount,
      maxOutputTokensRecoveryCount: 0,
      hasAttemptedReactiveCompact: false,
      pendingToolUseSummary: nextPendingToolUseSummary,
      maxOutputTokensOverride: undefined,
      stopHookActive,
      transition: { reason: 'next_turn' },
    }
    state = next
  } // while (true)
}
