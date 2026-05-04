/** 用于运行带使用量追踪的分叉代理查询循环的辅助工具。

此工具确保分叉代理：
1. 与父代理共享相同的缓存关键参数，以保证提示缓存命中
2. 在整个查询循环中追踪完整的使用量指标
3. 完成后通过 tengu_fork_agent_query 事件记录指标
4. 隔离可变状态，防止干扰主代理循环 */

import type { UUID } from 'crypto'
import { randomUUID } from 'crypto'
import type { PromptCommand } from '../commands.js'
import type { QuerySource } from '../constants/querySource.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import { query } from '../query.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import { accumulateUsage, updateUsage } from '../services/api/claude.js'
import { EMPTY_USAGE, type NonNullableUsage } from '@ant/model-provider'
import type { ToolUseContext } from '../Tool.js'
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import type { AgentId } from '../types/ids.js'
import type { Message } from '../types/message.js'
import { createChildAbortController } from './abortController.js'
import { logForDebugging } from './debug.js'
import { cloneFileStateCache } from './fileStateCache.js'
import type { REPLHookContext } from './hooks/postSamplingHooks.js'
import {
  createUserMessage,
  extractTextContent,
  getLastAssistantMessage,
} from './messages.js'
import { createDenialTrackingState } from './permissions/denialTracking.js'
import { parseToolListFromCLI } from './permissions/permissionSetup.js'
import { recordSidechainTranscript } from './sessionStorage.js'
import type { SystemPrompt } from './systemPromptType.js'
import {
  type ContentReplacementState,
  cloneContentReplacementState,
} from './toolResultStorage.js'
import { createAgentId } from './uuid.js'

/** 分叉与父 API 请求之间必须相同的参数，
以共享父代理的提示缓存。Anthropic API 缓存键由以下部分组成：
system prompt、tools、model、messages（前缀）和 thinking config。

CacheSafeParams 携带前五个。Thinking config 从继承的
toolUseContext.options.thinkingConfig 派生——但如果分叉设置了
maxOutputTokens，则可能会无意中更改，这会在 claude.ts 中限制 budget_tokens
（但仅适用于不使用自适应思考的旧模型）。
请参阅 ForkedAgentParams 上的 maxOutputTokens 文档。 */
export type CacheSafeParams = {
  /** 系统提示——必须与父代理匹配才能缓存命中 */
  systemPrompt: SystemPrompt
  /** 用户上下文——附加到消息前，影响缓存 */
  userContext: { [k: string]: string }
  /** 系统上下文——附加到系统提示后，影响缓存 */
  systemContext: { [k: string]: string }
  /** 包含工具、模型和其他选项的工具使用上下文 */
  toolUseContext: ToolUseContext
  /** 用于提示缓存共享的父上下文消息 */
  forkContextMessages: Message[]
}

// 由 handleStopHooks 在每次轮次后写入的槽位，以便轮次后的
// 分叉（promptSuggestion、postTurnSummary、/
// btw）可以共享主循环的提示缓存，而无需每个调用者自行传递参数。
let lastCacheSafeParams: CacheSafeParams | null = null

export function saveCacheSafeParams(params: CacheSafeParams | null): void {
  lastCacheSafeParams = params
}

export function getLastCacheSafeParams(): CacheSafeParams | null {
  return lastCacheSafeParams
}

export type ForkedAgentParams = {
  /** 用于启动分叉查询循环的消息 */
  promptMessages: Message[]
  /** 必须与父查询匹配的缓存安全参数 */
  cacheSafeParams: CacheSafeParams
  /** 分叉代理的权限检查函数 */
  canUseTool: CanUseToolFn
  /** 用于追踪的源标识符 */
  querySource: QuerySource
  /** 用于分析的标签（例如 'session_memory'、'supervisor'） */
  forkLabel: string
  /** 子代理上下文的可选覆盖（例如来自设置阶段的 readFileState） */
  overrides?: SubagentContextOverrides
  /** 输出 token 的可选上限。注意：设置此项会同时更改 max_tokens
和 budget_tokens（通过在 claude.ts 中限制）。如果分叉使用 cacheSafeParams
共享父代理的提示缓存，不同的 budget_tokens 将使缓存失效——
thinking config 是缓存键的一部分。仅在缓存共享不是目标时设置此项
（例如紧凑摘要）。 */
  maxOutputTokens?: number
  /** 轮次（API 往返）数量的可选上限 */
  maxTurns?: number
  /** 每条消息到达时调用的可选回调（用于流式 UI） */
  onMessage?: (message: Message) => void
  /** 跳过侧链转录记录（例如用于推测等临时工作） */
  skipTranscript?: boolean
  /** 跳过在最后一条消息上写入新的提示缓存条目。用于
即发即忘的分叉，其中没有未来的请求会从此前缀读取。 */
  skipCacheWrite?: boolean
}

export type ForkedAgentResult = {
  /** 查询循环期间生成的所有消息 */
  messages: Message[]
  /** 循环中所有 API 调用的累计使用量 */
  totalUsage: NonNullableUsage
}

/** 从 REPLHookContext 创建 CacheSafeParams。
当从采样后钩子上下文分叉时使用此辅助工具。

要覆盖特定字段（例如带有克隆文件状态的 toolUseContext），
展开结果并覆盖：`{ ...createCacheSafeParams(context), toolUseContext: clonedContext }`

@param context - 来自采样后钩子的 REPLHookContext */
export function createCacheSafeParams(
  context: REPLHookContext,
): CacheSafeParams {
  return {
    systemPrompt: context.systemPrompt,
    userContext: context.userContext,
    systemContext: context.systemContext,
    toolUseContext: context.toolUseContext,
    forkContextMessages: context.messages,
  }
}

/** 创建一个修改后的 getAppState，将允许的工具添加到权限上下文中。
分叉的技能/命令执行使用此工具来授予工具权限。 */
export function createGetAppStateWithAllowedTools(
  baseGetAppState: ToolUseContext['getAppState'],
  allowedTools: string[],
): ToolUseContext['getAppState'] {
  if (allowedTools.length === 0) return baseGetAppState
  return () => {
    const appState = baseGetAppState()
    return {
      ...appState,
      toolPermissionContext: {
        ...appState.toolPermissionContext,
        alwaysAllowRules: {
          ...appState.toolPermissionContext.alwaysAllowRules,
          command: [
            ...new Set([
              ...(appState.toolPermissionContext.alwaysAllowRules.command ||
                []),
              ...allowedTools,
            ]),
          ],
        },
      },
    }
  }
}

/** 准备分叉命令上下文的结果。 */
export type PreparedForkedContext = {
  /** 替换了参数后的技能内容 */
  skillContent: string
  /** 带有允许工具的修改后的 getAppState */
  modifiedGetAppState: ToolUseContext['getAppState']
  /** 要使用的通用代理 */
  baseAgent: AgentDefinition
  /** 初始提示消息 */
  promptMessages: Message[]
}

/** 准备执行分叉命令/技能的上下文。
这处理了 SkillTool 和斜杠命令所需的通用设置。 */
export async function prepareForkedCommandContext(
  command: PromptCommand,
  args: string,
  context: ToolUseContext,
): Promise<PreparedForkedContext> {
  // 获取替换了 $ARGUMENTS 的技能内容
  const skillPrompt = await command.getPromptForCommand(args, context)
  const skillContent = skillPrompt
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('\n')

  // 解析并准备允许的工具
  const allowedTools = parseToolListFromCLI(command.allowedTools ?? [])

  // 创建带有允许工具的修改上下文
  const modifiedGetAppState = createGetAppStateWithAllowedTools(
    context.getAppState,
    allowedTools,
  )

  // 如果指定则使用 command.agent，否则使用 'general-purpose'
  const agentTypeName = command.agent ?? 'general-purpose'
  const agents = context.options.agentDefinitions.activeAgents
  const baseAgent =
    agents.find(a => a.agentType === agentTypeName) ??
    agents.find(a => a.agentType === 'general-purpose') ??
    agents[0]

  if (!baseAgent) {
    throw new Error('没有可用于分叉执行的代理')
  }

  // 准备提示消息
  const promptMessages = [createUserMessage({ content: skillContent })]

  return {
    skillContent,
    modifiedGetAppState,
    baseAgent,
    promptMessages,
  }
}

/** 从代理消息中提取结果文本。 */
export function extractResultText(
  agentMessages: Message[],
  defaultText = '执行完成',
): string {
  const lastAssistantMessage = getLastAssistantMessage(agentMessages)
  if (!lastAssistantMessage) return defaultText

  const textContent = extractTextContent(
    Array.isArray(lastAssistantMessage.message.content)
      ? lastAssistantMessage.message.content
      : [],
    '\n',
  )

  return textContent || defaultText
}

/** 创建子代理上下文的选项。

默认情况下，所有可变状态都被隔离以防止干扰父代理。
使用这些选项可以：
- 覆盖特定字段（例如自定义选项、agentId、messages）
- 明确选择共享特定回调（用于交互式子代理） */
export type SubagentContextOverrides = {
  /** 覆盖 options 对象（例如自定义工具、模型） */
  options?: ToolUseContext['options']
  /** 覆盖 agentId（用于拥有自己 ID 的子代理） */
  agentId?: AgentId
  /** 覆盖 agentType（用于特定类型的子代理） */
  agentType?: string
  /** 覆盖 messages 数组 */
  messages?: Message[]
  /** 覆盖 readFileState（例如新缓存而非克隆） */
  readFileState?: ToolUseContext['readFileState']
  /** 覆盖 abortController */
  abortController?: AbortController
  /** 覆盖 getAppState 函数 */
  getAppState?: ToolUseContext['getAppState']

  /** 明确选择共享父代理的 setAppState 回调。
用于需要更新共享状态的交互式子代理。
@default false（隔离的无操作） */
  shareSetAppState?: boolean
  /** 明确选择共享父代理的 setResponseLength 回调。
用于对父代理响应指标有贡献的子代理。
@default false（隔离的无操作） */
  shareSetResponseLength?: boolean
  /** 明确选择共享父代理的 abortController。
用于应与父代理一起中止的交互式子代理。
注意：仅在未提供 abortController 覆盖时适用。
@default false（链接到父代理的新控制器） */
  shareAbortController?: boolean
  /** 关键系统提醒，在每个用户轮次重新注入 */
  criticalSystemReminder_EXPERIMENTAL?: string
  /** 当为 true 时，即使钩子自动批准，也必须始终调用 canUseTool。
由推测用于覆盖文件路径重写。 */
  requireCanUseTool?: boolean
  /** 覆盖替换状态——由 resumeAgentBackground 用于传递
从恢复的侧链重建的状态，以便相同的结果
被重新替换（提示缓存稳定性）。 */
  contentReplacementState?: ContentReplacementState
}

/** 为子代理创建隔离的 ToolUseContext。

默认情况下，所有可变状态都被隔离以防止干扰：
- readFileState：从父代理克隆
- abortController：链接到父代理的新控制器（父代理中止会传播）
- getAppState：包装以设置 shouldAvoidPermissionPrompts
- 所有变异回调（setAppState 等）：无操作
- 新集合：nestedMemoryAttachmentTriggers、toolDecisions

调用者可以：
- 通过 overrides 参数覆盖特定字段
- 明确选择共享特定回调（shareSetAppState 等）

@param parentContext - 要从中创建子代理上下文的父 ToolUseContext
@param overrides - 可选的覆盖和共享选项

@example
// 完全隔离（用于后台代理，如会话记忆）
const ctx = createSubagentContext(parentContext)

@example
// 自定义选项和 agentId（用于 AgentTool 异步代理）
const ctx = createSubagentContext(parentContext, {
  options: customOptions,
  agentId: newAgentId,
  messages: initialMessages,
})

@example
// 共享某些状态的交互式子代理
const ctx = createSubagentContext(parentContext, {
  options: customOptions,
  agentId: newAgentId,
  shareSetAppState: true,
  shareSetResponseLength: true,
  shareAbortController: true,
}) */
export function createSubagentContext(
  parentContext: ToolUseContext,
  overrides?: SubagentContextOverrides,
): ToolUseContext {
  // 确定 abortController：显式覆盖 > 共享父代理的 > 新的子代理
  const abortController =
    overrides?.abortController ??
    (overrides?.shareAbortController
      ? parentContext.abortController
      : createChildAbortController(parentContext.abortController))

  // 确定 getAppState - 包装以设置 shouldAvoidPermissionPrompts，除非共享 abortCo
  // ntroller（如果共享 abortController，则它是可以显示 UI 的交互式代理）
  const getAppState: ToolUseContext['getAppState'] = overrides?.getAppState
    ? overrides.getAppState
    : overrides?.shareAbortController
      ? parentContext.getAppState
      : () => {
          const state = parentContext.getAppState()
          if (state.toolPermissionContext.shouldAvoidPermissionPrompts) {
            return state
          }
          return {
            ...state,
            toolPermissionContext: {
              ...state.toolPermissionContext,
              shouldAvoidPermissionPrompts: true,
            },
          }
        }

  return {
    // 单独保留父 Langfuse 追踪，以便 auto_m
    // ode 等嵌套侧查询可以附加到主代理追踪，而不是子
    // 代理自己的追踪。
    langfuseRootTrace: parentContext.langfuseTrace,
    // 可变状态 - 默认克隆以保持隔离。如果提供了 ove
    // rrides.readFileState 则克隆，否则从父代理克隆
    readFileState: cloneFileStateCache(
      overrides?.readFileState ?? parentContext.readFileState,
    ),
    nestedMemoryAttachmentTriggers: new Set<string>(),
    loadedNestedMemoryPaths: new Set<string>(),
    dynamicSkillDirTriggers: new Set<string>(),
    // 每个子代理：追踪由发现暴露的技能，用于 was_discovered 遥测（SkillTool.ts:116）
    discoveredSkillNames: new Set<string>(),
    toolDecisions: undefined,
    // 预算决策：覆盖 > 父代理克隆 > 未定义（功能关闭）。
    //
    // 默认克隆（非新缓存）：缓存共享分叉处理包含父 to
    // ol_use_id 的父消息。新状态会将它们视为未
    // 见并做出不同的替换决策 → wire 前缀不同
    // → 缓存未命中。克隆做出相同的决策 → 缓存命中。
    // 对于非分叉子代理，父 UUID 永远不会匹配——克
    // 隆是无害的无操作。
    //
    // 覆盖：AgentTool 恢复（从侧链记录重建）和 inP
    // rocessRunner（每个队友的持久循环状态）。
    contentReplacementState:
      overrides?.contentReplacementState ??
      (parentContext.contentReplacementState
        ? cloneContentReplacementState(parentContext.contentReplacementState)
        : undefined),

    // AbortController
    abortController,

    // AppState 访问
    getAppState,
    setAppState: overrides?.shareSetAppState
      ? parentContext.setAppState
      : () => {},
    // 任务注册/终止必须始终到达根存储，即使 setAppS
    // tate 是无操作——否则异步代理的后台 bash 任务永
    // 远不会被注册和终止（PPID=1 僵尸进程）。
    setAppStateForTasks:
      parentContext.setAppStateForTasks ?? parentContext.setAppState,
    // setAppState 为无操作的异步子代理需要本地
    // 拒绝追踪，以便拒绝计数器实际上在重试中累积。
    localDenialTracking: overrides?.shareSetAppState
      ? parentContext.localDenialTracking
      : createDenialTrackingState(),

    // 变异回调 - 默认无操作
    setInProgressToolUseIDs: () => {},
    setResponseLength: overrides?.shareSetResponseLength
      ? parentContext.setResponseLength
      : () => {},
    pushApiMetricsEntry: overrides?.shareSetResponseLength
      ? parentContext.pushApiMetricsEntry
      : undefined,
    updateFileHistoryState: () => {},
    // 归属是作用域化的且功能性的（prev => next）——即使 setAp
    // pState 被存根，共享也是安全的。并发调用通过 React 的状态队列组合。
    updateAttributionState: parentContext.updateAttributionState,

    // UI 回调 - 子代理为 undefined（无法控制父 UI）
    addNotification: undefined,
    setToolJSX: undefined,
    setStreamMode: undefined,
    setSDKStatus: undefined,
    openMessageSelector: undefined,

    // 可以从父代理覆盖或复制的字段
    options: overrides?.options ?? parentContext.options,
    messages: overrides?.messages ?? parentContext.messages,
    // 为子代理生成新的 agentId（每个子代理应有自己的 ID）
    agentId: overrides?.agentId ?? createAgentId(),
    agentType: overrides?.agentType,

    // 为子代理创建新的查询追踪链，深度递增
    queryTracking: {
      chainId: randomUUID(),
      depth: (parentContext.queryTracking?.depth ?? -1) + 1,
    },
    fileReadingLimits: parentContext.fileReadingLimits,
    userModified: parentContext.userModified,
    criticalSystemReminder_EXPERIMENTAL:
      overrides?.criticalSystemReminder_EXPERIMENTAL,
    requireCanUseTool: overrides?.requireCanUseTool,
  }
}

/** 运行分叉代理查询循环并追踪缓存命中指标。

此函数：
1. 使用与父代理相同的缓存安全参数以启用提示缓存
2. 累积所有查询迭代的使用量
3. 完成后记录包含完整使用量的 tengu_fork_agent_query

@example
```typescript
const result = await runForkedAgent({
  promptMessages: [createUserMessage({ content: userPrompt })],
  cacheSafeParams: {
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext: clonedToolUseContext,
    forkContextMessages: messages,
  },
  canUseTool,
  querySource: 'session_memory',
  forkLabel: 'session_memory',
})
``` */
export async function runForkedAgent({
  promptMessages,
  cacheSafeParams,
  canUseTool,
  querySource,
  forkLabel,
  overrides,
  maxOutputTokens,
  maxTurns,
  onMessage,
  skipTranscript,
  skipCacheWrite,
}: ForkedAgentParams): Promise<ForkedAgentResult> {
  const startTime = Date.now()
  const outputMessages: Message[] = []
  let totalUsage: NonNullableUsage = { ...EMPTY_USAGE }

  const {
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    forkContextMessages,
  } = cacheSafeParams

  // 创建隔离上下文以防止父状态变异
  const isolatedToolUseContext = createSubagentContext(
    toolUseContext,
    overrides,
  )

  // 不要在此处 filterIncompleteToolCalls——它会在部
  // 分工具批次上丢弃整个助手消息，导致配对结果孤立（API 400）。悬空的
  // tool_uses 会在下游由 claude.ts 中的 ensureTool
  // ResultPairing 修复，与主线程相同——相同的修复后前缀保持缓存命中。
  const initialMessages: Message[] = [...forkContextMessages, ...promptMessages]

  // 生成代理 ID 并记录初始消息到转录。当设置了 ski
  // pTranscript 时，跳过代理 ID 创建和所有转录 I/O
  const agentId = skipTranscript ? undefined : createAgentId(forkLabel)
  let lastRecordedUuid: UUID | null = null
  if (agentId) {
    await recordSidechainTranscript(initialMessages, agentId).catch(err =>
      logForDebugging(`分叉代理 [${forkLabel}] 记录初始转录失败：${err}`),
    )
    // 追踪最后记录的消息 UUID 以保持父链连续性
    lastRecordedUuid =
      initialMessages.length > 0
        ? initialMessages[initialMessages.length - 1]!.uuid
        : null
  }

  // 使用隔离上下文运行查询循环（保留缓存安全参数）
  try {
    for await (const message of query({
      messages: initialMessages,
      systemPrompt,
      userContext,
      systemContext,
      canUseTool,
      toolUseContext: isolatedToolUseContext,
      querySource,
      maxOutputTokensOverride: maxOutputTokens,
      maxTurns,
      skipCacheWrite,
    })) {
      // 从 message_delta 流事件中提取实际使用量（每次 API 调用的最终使用量）
      if (message.type === 'stream_event') {
        if (
          'event' in message &&
          (message as any).event?.type === 'message_delta' &&
          (message as any).event.usage
        ) {
          const turnUsage = updateUsage(
            { ...EMPTY_USAGE },
            (message as any).event.usage,
          )
          totalUsage = accumulateUsage(totalUsage, turnUsage)
        }
        continue
      }
      if (message.type === 'stream_request_start') {
        continue
      }

      logForDebugging(`分叉代理 [${forkLabel}] 收到消息：type=${message.type}`)

      outputMessages.push(message as Message)
      onMessage?.(message as Message)

      // 为可记录的消息类型记录转录（与 runAgent.ts 相同的模式）
      const msg = message as Message
      if (
        agentId &&
        (msg.type === 'assistant' ||
          msg.type === 'user' ||
          msg.type === 'progress')
      ) {
        await recordSidechainTranscript([msg], agentId, lastRecordedUuid).catch(
          err =>
            logForDebugging(`分叉代理 [${forkLabel}] 记录对话失败：${err}`),
        )
        if (msg.type !== 'progress') {
          lastRecordedUuid = msg.uuid
        }
      }
    }
  } finally {
    // 释放克隆文件状态缓存内存（与 runAgent.ts 相同的模式）
    isolatedToolUseContext.readFileState.clear()
    // 释放克隆的分叉上下文消息
    initialMessages.length = 0
  }

  logForDebugging(
    `分叉代理 [${forkLabel}] 完成：${outputMessages.length} 条消息，类型=[${outputMessages.map(m => m.type).join(', ')}]，总用量：输入=${totalUsage.input_tokens} 输出=${totalUsage.output_tokens} 缓存读取=${totalUsage.cache_read_input_tokens} 缓存创建=${totalUsage.cache_creation_input_tokens}`,
  )

  const durationMs = Date.now() - startTime

  // 使用完整的 NonNullableUsage 记录分叉查询指标
  logForkAgentQueryEvent({
    forkLabel,
    querySource,
    durationMs,
    messageCount: outputMessages.length,
    totalUsage,
    queryTracking: toolUseContext.queryTracking,
  })

  return {
    messages: outputMessages,
    totalUsage,
  }
}

/** 使用完整的 NonNullableUsage 字段记录 tengu_fork_agent_query 事件。 */
function logForkAgentQueryEvent({
  forkLabel,
  querySource,
  durationMs,
  messageCount,
  totalUsage,
  queryTracking,
}: {
  forkLabel: string
  querySource: QuerySource
  durationMs: number
  messageCount: number
  totalUsage: NonNullableUsage
  queryTracking?: { chainId: string; depth: number }
}): void {
  // 计算缓存命中率
  const totalInputTokens =
    totalUsage.input_tokens +
    totalUsage.cache_creation_input_tokens +
    totalUsage.cache_read_input_tokens
  const cacheHitRate =
    totalInputTokens > 0
      ? totalUsage.cache_read_input_tokens / totalInputTokens
      : 0

  logEvent('tengu_fork_agent_query', {
    // 元数据
    forkLabel:
      forkLabel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource:
      querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    durationMs,
    messageCount,

    // NonNullableUsage 字段
    inputTokens: totalUsage.input_tokens,
    outputTokens: totalUsage.output_tokens,
    cacheReadInputTokens: totalUsage.cache_read_input_tokens,
    cacheCreationInputTokens: totalUsage.cache_creation_input_tokens,
    serviceTier:
      totalUsage.service_tier as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    cacheCreationEphemeral1hTokens:
      totalUsage.cache_creation.ephemeral_1h_input_tokens,
    cacheCreationEphemeral5mTokens:
      totalUsage.cache_creation.ephemeral_5m_input_tokens,

    // 派生指标
    cacheHitRate,

    // 查询跟踪
    ...(queryTracking
      ? {
          queryChainId:
            queryTracking.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          queryDepth: queryTracking.depth,
        }
      : {}),
  })
}
