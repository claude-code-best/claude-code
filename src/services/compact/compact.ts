import { feature } from 'bun:bundle'
import type { UUID } from 'crypto'
import uniqBy from 'lodash-es/uniqBy.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const sessionTranscriptModule = feature('KAIROS')
  ? (require('../sessionTranscript/sessionTranscript.js') as typeof import('../sessionTranscript/sessionTranscript.js'))
  : null

import { APIUserAbortError } from '@anthropic-ai/sdk'
import { markPostCompaction } from 'src/bootstrap/state.js'
import { getInvokedSkillsForAgent } from '../../bootstrap/state.js'
import type { QuerySource } from '../../constants/querySource.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import type { Tool, ToolUseContext } from '../../Tool.js'
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { FileReadTool } from '@claude-code-best/builtin-tools/tools/FileReadTool/FileReadTool.js'
import {
  FILE_READ_TOOL_NAME,
  FILE_UNCHANGED_STUB,
} from '@claude-code-best/builtin-tools/tools/FileReadTool/prompt.js'
import { ToolSearchTool } from '@claude-code-best/builtin-tools/tools/ToolSearchTool/ToolSearchTool.js'
import type { AgentId } from '../../types/ids.js'
import type {
  AssistantMessage,
  AttachmentMessage,
  HookResultMessage,
  Message,
  PartialCompactDirection,
  StreamEvent,
  SystemAPIErrorMessage,
  SystemCompactBoundaryMessage,
  SystemMessage,
  UserMessage,
} from '../../types/message.js'
import {
  createAttachmentMessage,
  generateFileAttachment,
  getAgentListingDeltaAttachment,
  getDeferredToolsDeltaAttachment,
  getMcpInstructionsDeltaAttachment,
  type Attachment,
} from '../../utils/attachments.js'
import { getMemoryPath } from '../../utils/config.js'
import { COMPACT_MAX_OUTPUT_TOKENS } from '../../utils/context.js'
import {
  analyzeContext,
  tokenStatsToStatsigMetrics,
} from '../../utils/contextAnalysis.js'
import { logForDebugging } from '../../utils/debug.js'
import { hasExactErrorMessage } from '../../utils/errors.js'
import { cacheToObject } from '../../utils/fileStateCache.js'
import {
  type CacheSafeParams,
  runForkedAgent,
} from '../../utils/forkedAgent.js'
import {
  executePostCompactHooks,
  executePreCompactHooks,
} from '../../utils/hooks.js'
import { logError } from '../../utils/log.js'
import { MEMORY_TYPE_VALUES } from '../../utils/memory/types.js'
import {
  createCompactBoundaryMessage,
  createUserMessage,
  getAssistantMessageText,
  getLastAssistantMessage,
  getMessagesAfterCompactBoundary,
  isCompactBoundaryMessage,
  normalizeMessagesForAPI,
} from '../../utils/messages.js'
import { expandPath } from '../../utils/path.js'
import { getPlan, getPlanFilePath } from '../../utils/plans.js'
import {
  isSessionActivityTrackingActive,
  sendSessionActivitySignal,
} from '../../utils/sessionActivity.js'
import { processSessionStartHooks } from '../../utils/sessionStart.js'
import {
  getTranscriptPath,
  reAppendSessionMetadata,
} from '../../utils/sessionStorage.js'
import { sleep } from '../../utils/sleep.js'
import { jsonStringify } from '../../utils/slowOperations.js'
/* eslint-enable @typescript-eslint/no-require-imports */
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { getTaskOutputPath } from '../../utils/task/diskOutput.js'
import {
  getTokenUsage,
  tokenCountFromLastAPIResponse,
  tokenCountWithEstimation,
} from '../../utils/tokens.js'
import {
  extractDiscoveredToolNames,
  isToolSearchEnabled,
} from '../../utils/toolSearch.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import {
  getMaxOutputTokensForModel,
  queryModelWithStreaming,
} from '../api/claude.js'
import {
  getPromptTooLongTokenGap,
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  startsWithApiErrorPrefix,
} from '../api/errors.js'
import { notifyCompaction } from '../api/promptCacheBreakDetection.js'
import { getRetryDelay } from '../api/withRetry.js'
import { logPermissionContextForAnts } from '../internalLogging.js'
import {
  roughTokenCountEstimation,
  roughTokenCountEstimationForMessages,
} from '../tokenEstimation.js'
import type { SDKStatus } from '../../entrypoints/agentSdkTypes.js'
import { groupMessagesByApiRound } from './grouping.js'
import {
  getCompactPrompt,
  getCompactUserSummaryMessage,
  getPartialCompactPrompt,
} from './prompt.js'

export const POST_COMPACT_MAX_FILES_TO_RESTORE = 5
export const POST_COMPACT_TOKEN_BUDGET = 50_000
export const POST_COMPACT_MAX_TOKENS_PER_FILE = 5_000
// 技能可能很大（verify=18.7KB，claude-api=20.1
// KB）。之前每次压缩时都会无限制地重新注入 → 每次压缩消耗 5-1
// 0K 令牌。按技能截断优于丢弃——技能文件顶部的指令通常是关键部分。
// 预算大小设置为能容纳约 5 个达到单技能上限的技能。
export const POST_COMPACT_MAX_TOKENS_PER_SKILL = 5_000
export const POST_COMPACT_SKILLS_TOKEN_BUDGET = 25_000
const MAX_COMPACT_STREAMING_RETRIES = 2

/** 在发送进行压缩前，从用户消息中剥离图像块。
生成对话摘要不需要图像，并且可能导致压缩 API 调用本身触发提示过长限制，
尤其是在用户频繁附加图像的 CCD 会话中。
用文本标记替换图像块，以便摘要仍能记录
有图像被分享。

注意：只有用户消息包含图像（直接附加或在工具的工具结果内容中）。
助手消息包含文本、tool_use 和思考块，但不包含图像。 */
export function stripImagesFromMessages(messages: Message[]): Message[] {
  return messages.map(message => {
    if (message.type !== 'user') {
      return message
    }

    const content = message.message!.content
    if (!Array.isArray(content)) {
      return message
    }

    let hasMediaBlock = false
    const newContent = content.flatMap(block => {
      if (block.type === 'image') {
        hasMediaBlock = true
        return [{ type: 'text' as const, text: '[image]' }]
      }
      if (block.type === 'document') {
        hasMediaBlock = true
        return [{ type: 'text' as const, text: '[document]' }]
      }
      // 同时剥离嵌套在 tool_result 内容数组内的图像/文档
      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        let toolHasMedia = false
        const newToolContent = block.content.map(item => {
          if (item.type === 'image') {
            toolHasMedia = true
            return { type: 'text' as const, text: '[image]' }
          }
          if (item.type === 'document') {
            toolHasMedia = true
            return { type: 'text' as const, text: '[document]' }
          }
          return item
        })
        if (toolHasMedia) {
          hasMediaBlock = true
          return [{ ...block, content: newToolContent }]
        }
      }
      return [block]
    })

    if (!hasMediaBlock) {
      return message
    }

    return {
      ...message,
      message: {
        ...message.message,
        content: newContent,
      },
    } as typeof message
  })
}

/** 剥离那些在压缩后无论如何都会重新注入的附件类型。
skill_discovery/skill_listing 会被 resetSentSkillNames() 和下一轮的发现信号重新呈现，
因此将它们提供给摘要器会浪费令牌，并用过时的技能建议污染摘要。

当 EXPERIMENTAL_SKILL_SEARCH 关闭时无操作（这些附件类型
在外部构建中不存在）。 */
export function stripReinjectedAttachments(messages: Message[]): Message[] {
  if (feature('EXPERIMENTAL_SKILL_SEARCH')) {
    return messages.filter(
      m =>
        !(
          m.type === 'attachment' &&
          (m.attachment!.type === 'skill_discovery' ||
            m.attachment!.type === 'skill_listing')
        ),
    )
  }
  return messages
}

export const ERROR_MESSAGE_NOT_ENOUGH_MESSAGES = '消息数量不足以进行压缩。'
const MAX_PTL_RETRIES = 3
const PTL_RETRY_MARKER = '[为压缩重试而截断的先前对话]'

/** 从消息中丢弃最旧的 API 轮次组，直到覆盖 tokenGap。
当间隙无法解析时（某些 Vertex/Bedrock 错误格式），回退到丢弃 20% 的组。
当丢弃任何内容都会导致摘要集为空时返回 null。

这是针对 CC-1180 的最后逃生舱口——当压缩请求本身遇到提示过长时，
用户会被卡住。丢弃最旧的上下文是有损的，但能让他们继续。
响应式压缩路径（compactMessages.ts）有适当的重试循环，从尾部剥离；
此辅助函数是主动/手动路径的简单但安全的回退方案，该路径在 bfdb472f 的统一中未迁移。 */
export function truncateHeadForPTLRetry(
  messages: Message[],
  ptlResponse: AssistantMessage,
): Message[] | null {
  // 在分组前，从先前的重试中剥离我们自己的合成标记。否则它
  // 会成为自己的第 0 组，导致 20% 回退停滞（仅
  // 丢弃标记，重新添加它，重试 2+ 次时零进展）。
  const input =
    messages[0]?.type === 'user' &&
    messages[0]?.isMeta &&
    messages[0]?.message?.content === PTL_RETRY_MARKER
      ? messages.slice(1)
      : messages

  const groups = groupMessagesByApiRound(input)
  if (groups.length < 2) return null

  const tokenGap = getPromptTooLongTokenGap(ptlResponse)
  let dropCount: number
  if (tokenGap !== undefined) {
    let acc = 0
    dropCount = 0
    for (const g of groups) {
      acc += roughTokenCountEstimationForMessages(
        g as Parameters<typeof roughTokenCountEstimationForMessages>[0],
      )
      dropCount++
      if (acc >= tokenGap) break
    }
  } else {
    dropCount = Math.max(1, Math.floor(groups.length * 0.2))
  }

  // 至少保留一个组，以便有内容可摘要。
  dropCount = Math.min(dropCount, groups.length - 1)
  if (dropCount < 1) return null

  const sliced = groups.slice(dropCount).flat()
  // groupMessagesByApiRound 将前言放在第 0 组
  // ，并以助手消息开始每个后续组。丢弃第 0 组会留下一个以助手开头的序列
  // ，API 会拒绝（第一条消息必须是 role=user）。前置一个合
  // 成的用户标记——ensureToolResultPairing 已经
  // 处理了由此产生的任何孤立的 tool_results。
  if (sliced[0]?.type === 'assistant') {
    return [
      createUserMessage({ content: PTL_RETRY_MARKER, isMeta: true }),
      ...sliced,
    ]
  }
  return sliced
}

export const ERROR_MESSAGE_PROMPT_TOO_LONG =
  '对话过长。按两次 esc 键向上移动几条消息，然后重试。'
export const ERROR_MESSAGE_USER_ABORT = 'API 错误：请求被中止。'
export const ERROR_MESSAGE_INCOMPLETE_RESPONSE =
  '压缩中断 · 这可能是由于网络问题——请重试。'

export interface CompactionResult {
  boundaryMarker: SystemMessage
  summaryMessages: UserMessage[]
  attachments: AttachmentMessage[]
  hookResults: HookResultMessage[]
  messagesToKeep?: Message[]
  userDisplayMessage?: string
  preCompactTokenCount?: number
  postCompactTokenCount?: number
  truePostCompactTokenCount?: number
  compactionUsage?: ReturnType<typeof getTokenUsage>
}

/** 从 autoCompactIfNeeded 传递到 compactConversation 的诊断上下文。
让 tengu_compact 事件能够区分同链循环（H2）、跨代理（H1/H5）和手动与自动（H3）压缩，而无需连接。 */
export type RecompactionInfo = {
  isRecompactionInChain: boolean
  turnsSincePreviousCompact: number
  previousCompactTurnId?: string
  autoCompactThreshold: number
  querySource?: QuerySource
}

/** 从 CompactionResult 构建压缩后的基础消息数组。
这确保了所有压缩路径的顺序一致性。
顺序：boundaryMarker、summaryMessages、messagesToKeep、attachments、hookResults */
export function buildPostCompactMessages(result: CompactionResult): Message[] {
  return ([result.boundaryMarker] as Message[]).concat(
    result.summaryMessages,
    result.messagesToKeep ?? [],
    result.attachments,
    result.hookResults,
  )
}

/** 为 messagesToKeep 使用重链接元数据标注压缩边界。
保留的消息在磁盘上保持其原始 parentUuids（去重跳过）；
加载器使用此信息来修补 head→anchor 和 anchor 的其他子节点→tail。

`anchorUuid` = 在期望链中紧接在 keep[0] 之前的内容：
  - 后缀保留（响应式/会话内存）：最后一条摘要消息
  - 前缀保留（部分压缩）：边界本身 */
export function annotateBoundaryWithPreservedSegment(
  boundary: SystemCompactBoundaryMessage,
  anchorUuid: UUID,
  messagesToKeep: readonly Message[] | undefined,
): SystemCompactBoundaryMessage {
  const keep = messagesToKeep ?? []
  if (keep.length === 0) return boundary
  return {
    ...boundary,
    compactMetadata: {
      ...boundary.compactMetadata,
      preservedSegment: {
        headUuid: keep[0]!.uuid,
        anchorUuid,
        tailUuid: keep.at(-1)!.uuid,
      },
    },
  }
}

/** 合并用户提供的自定义指令与钩子提供的指令。
用户指令在前；钩子指令附加在后。
空字符串规范化为 undefined。 */
export function mergeHookInstructions(
  userInstructions: string | undefined,
  hookInstructions: string | undefined,
): string | undefined {
  if (!hookInstructions) return userInstructions || undefined
  if (!userInstructions) return hookInstructions
  return `${userInstructions}\n\n${hookInstructions}`
}

/** 通过摘要较早的消息并保留最近的对话历史，创建对话的压缩版本。 */
export async function compactConversation(
  messages: Message[],
  context: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  suppressFollowUpQuestions: boolean,
  customInstructions?: string,
  isAutoCompact: boolean = false,
  recompactionInfo?: RecompactionInfo,
): Promise<CompactionResult> {
  try {
    if (messages.length === 0) {
      throw new Error(ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)
    }

    const preCompactTokenCount = tokenCountWithEstimation(messages)

    const appState = context.getAppState()
    void logPermissionContextForAnts(appState.toolPermissionContext, 'summary')

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'pre_compact',
    })

    // 执行 PreCompact 钩子
    context.setSDKStatus?.('compacting')
    const hookResult = await executePreCompactHooks(
      {
        trigger: isAutoCompact ? 'auto' : 'manual',
        customInstructions: customInstructions ?? null,
      },
      context.abortController.signal,
    )
    customInstructions = mergeHookInstructions(
      customInstructions,
      hookResult.newCustomInstructions,
    )
    const userDisplayMessage = hookResult.userDisplayMessage

    // 显示带有上箭头和自定义消息的请求模式
    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_start' })

    // 第三方默认：true——分叉代理路径重用主对话的提示缓存。实验（2026 年 1
    // 月）确认：false 路径有 98% 的缓存未命中，消耗约 0.76% 的舰队 c
    // ache_creation（约 38B 令牌/天），集中在具有冷 GB 缓存和禁用 G
    // B 的第三方提供商的临时环境（CCR/GHA/SDK）中。保留 GB 门控作为紧急关闭开关。
    const promptCacheSharingEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_compact_cache_prefix',
      true,
    )

    const compactPrompt = getCompactPrompt(customInstructions)
    const summaryRequest = createUserMessage({
      content: compactPrompt,
    })

    let messagesToSummarize = messages
    let retryCacheSafeParams = cacheSafeParams
    let summaryResponse: AssistantMessage
    let summary: string | null
    let ptlAttempts = 0
    for (;;) {
      summaryResponse = await streamCompactSummary({
        messages: messagesToSummarize,
        summaryRequest,
        appState,
        context,
        preCompactTokenCount,
        cacheSafeParams: retryCacheSafeParams,
      })
      summary = getAssistantMessageText(summaryResponse)
      if (!summary?.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) break

      // CC-1180：压缩请求本身遇到提示过长。截断
      // 最旧的 API 轮次组并重试，而不是让用户卡住。
      ptlAttempts++
      const truncated =
        ptlAttempts <= MAX_PTL_RETRIES
          ? truncateHeadForPTLRetry(messagesToSummarize, summaryResponse)
          : null
      if (!truncated) {
        logEvent('tengu_compact_failed', {
          reason:
            'prompt_too_long' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          preCompactTokenCount,
          promptCacheSharingEnabled,
          ptlAttempts,
        })
        throw new Error(ERROR_MESSAGE_PROMPT_TOO_LONG)
      }
      logEvent('tengu_compact_ptl_retry', {
        attempt: ptlAttempts,
        droppedMessages: messagesToSummarize.length - truncated.length,
        remainingMessages: truncated.length,
      })
      messagesToSummarize = truncated
      // 分叉代理路径从 cacheSafeParams.forkContextMessa
      // ges 读取，而不是 messages 参数——将截断后的集合通过两条路径传递。
      retryCacheSafeParams = {
        ...retryCacheSafeParams,
        forkContextMessages: truncated,
      }
    }

    if (!summary) {
      logForDebugging(
        `压缩失败：响应中没有摘要文本。响应：${jsonStringify(summaryResponse)}`,
        { level: 'error' },
      )
      logEvent('tengu_compact_failed', {
        reason:
          'no_summary' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        preCompactTokenCount,
        promptCacheSharingEnabled,
      })
      throw new Error(`生成对话摘要失败 - 响应未包含有效的文本内容`)
    } else if (startsWithApiErrorPrefix(summary)) {
      logEvent('tengu_compact_failed', {
        reason:
          'api_error' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        preCompactTokenCount,
        promptCacheSharingEnabled,
      })
      throw new Error(summary)
    }

    // Store the current file state before clearing
    let preCompactReadFileState = cacheToObject(context.readFileState)

    // 清除缓存
    context.readFileState.clear()
    context.loadedNestedMemoryPaths?.clear()

    // 故意不重置 sentSkillNames：压缩后重新注入完整的 skill
    // _listing（约 4K 令牌）纯粹是 cache_creation，边际效
    // 益很小。模型在其模式中仍有 SkillTool，并且 invoked_sk
    // ills 附件（下方）保留了已使用技能的内容。具有 EXPERIMENTAL_
    // SKILL_SEARCH 的蚂蚁已经通过 getSkillListingA
    // ttachments 中的提前返回来跳过重新注入。

    // 并行运行异步附件生成
    const [fileAttachments, asyncAgentAttachments] = await Promise.all([
      createPostCompactFileAttachments(
        preCompactReadFileState,
        context,
        POST_COMPACT_MAX_FILES_TO_RESTORE,
      ),
      createAsyncAgentAttachmentsIfNeeded(context),
    ])
    // Release the readFileState snapshot — it can hold 25+ MB of file content
    preCompactReadFileState =
      undefined as unknown as typeof preCompactReadFileState

    const postCompactFileAttachments: AttachmentMessage[] = [
      ...fileAttachments,
      ...asyncAgentAttachments,
    ]
    const planAttachment = createPlanAttachmentIfNeeded(context.agentId)
    if (planAttachment) {
      postCompactFileAttachments.push(planAttachment)
    }

    // 如果当前处于计划模式，则添加计划模式指令，以
    // 便模型在压缩后继续以计划模式运行
    const planModeAttachment = await createPlanModeAttachmentIfNeeded(context)
    if (planModeAttachment) {
      postCompactFileAttachments.push(planModeAttachment)
    }

    // 如果在此会话中调用了技能，则添加技能附件
    const skillAttachment = createSkillAttachmentIfNeeded(context.agentId)
    if (skillAttachment) {
      postCompactFileAttachments.push(skillAttachment)
    }

    // 压缩消耗了先前的增量附件。从当前状态重新宣布
    // ，以便模型在压缩后的第一轮拥有工具/指
    // 令上下文。空消息历史 → 与无内容比较 →
    // 宣布完整集合。
    for (const att of getDeferredToolsDeltaAttachment(
      context.options.tools,
      context.options.mainLoopModel,
      [],
      { callSite: 'compact_full' },
    )) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }
    for (const att of getAgentListingDeltaAttachment(context, [])) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }
    for (const att of getMcpInstructionsDeltaAttachment(
      context.options.mcpClients,
      context.options.tools,
      context.options.mainLoopModel,
      [],
    )) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'session_start',
    })
    // 在成功压缩后执行 SessionStart 钩子
    const hookMessages = await processSessionStartHooks('compact', {
      model: context.options.mainLoopModel,
    })

    // 在事件前创建压缩边界标记和摘要消息，以便
    // 我们可以计算真正的结果上下文大小。
    const boundaryMarker = createCompactBoundaryMessage(
      isAutoCompact ? 'auto' : 'manual',
      preCompactTokenCount ?? 0,
      messages.at(-1)?.uuid,
    )
    // 携带已加载工具状态——摘要不保留 tool_refer
    // ence 块，因此压缩后的模式过滤器需要此信息来继续
    // 向 API 发送已加载的延迟工具模式。
    const preCompactDiscovered = extractDiscoveredToolNames(messages)
    if (preCompactDiscovered.size > 0) {
      boundaryMarker.compactMetadata.preCompactDiscoveredTools = [
        ...preCompactDiscovered,
      ].sort()
    }

    const transcriptPath = getTranscriptPath()
    const summaryMessages: UserMessage[] = [
      createUserMessage({
        content: getCompactUserSummaryMessage(
          summary,
          suppressFollowUpQuestions,
          transcriptPath,
        ),
        isCompactSummary: true,
        isVisibleInTranscriptOnly: true,
      }),
    ]

    // 先前为“postCompactTokenCount”——重命名是因为这
    // 是压缩 API 调用的总使用量（input_tokens ≈ preComp
    // actTokenCount），而不是结果上下文的大小。为事件字段连续性而保留。
    const compactionCallTotalTokens = tokenCountFromLastAPIResponse([
      summaryResponse,
    ])

    // 结果上下文的消息负载估计。下一次迭代的 shouldAutoCompact 将看到
    // 此值加上系统提示 + 工具 + userContext 的约 20-40K（通过
    // API usage.input_tokens）。因此 `willRetriggerNe
    // xtTurn: true` 是一个强烈信号；`false` 在此值接近阈值时仍可能重新触发。
    const truePostCompactTokenCount = roughTokenCountEstimationForMessages([
      boundaryMarker,
      ...summaryMessages,
      ...postCompactFileAttachments,
      ...hookMessages,
    ] as Parameters<typeof roughTokenCountEstimationForMessages>[0])

    // 提取压缩 API 使用指标
    const compactionUsage = getTokenUsage(summaryResponse)
    // Release the full API response — it holds content blocks + usage metadata
    summaryResponse = undefined as unknown as typeof summaryResponse

    const querySourceForEvent =
      recompactionInfo?.querySource ?? context.options.querySource ?? 'unknown'

    logEvent('tengu_compact', {
      preCompactTokenCount,
      // 为连续性而保留——语义上是压缩 API 调用的总使用量
      postCompactTokenCount: compactionCallTotalTokens,
      truePostCompactTokenCount,
      autoCompactThreshold: recompactionInfo?.autoCompactThreshold ?? -1,
      willRetriggerNextTurn:
        recompactionInfo !== undefined &&
        truePostCompactTokenCount >= recompactionInfo.autoCompactThreshold,
      isAutoCompact,
      querySource:
        querySourceForEvent as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      queryChainId: (context.queryTracking?.chainId ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      queryDepth: context.queryTracking?.depth ?? -1,
      isRecompactionInChain: recompactionInfo?.isRecompactionInChain ?? false,
      turnsSincePreviousCompact:
        recompactionInfo?.turnsSincePreviousCompact ?? -1,
      previousCompactTurnId: (recompactionInfo?.previousCompactTurnId ??
        '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      compactionInputTokens: compactionUsage?.input_tokens,
      compactionOutputTokens: compactionUsage?.output_tokens,
      compactionCacheReadTokens: compactionUsage?.cache_read_input_tokens ?? 0,
      compactionCacheCreationTokens:
        compactionUsage?.cache_creation_input_tokens ?? 0,
      compactionTotalTokens: compactionUsage
        ? compactionUsage.input_tokens +
          (compactionUsage.cache_creation_input_tokens ?? 0) +
          (compactionUsage.cache_read_input_tokens ?? 0) +
          compactionUsage.output_tokens
        : 0,
      promptCacheSharingEnabled,
      // analyzeContext 遍历每个内容块（在 4.5K
      // 条消息的会话上约 11 毫秒）纯粹是为了此遥测细分。在此
      // 处计算，在压缩 API 等待之后，以便同步遍历不会在压缩
      // 开始前饿死渲染循环。与 reactiveCompact.t
      // s 相同的延迟模式。
      ...(() => {
        try {
          return tokenStatsToStatsigMetrics(analyzeContext(messages))
        } catch (error) {
          logError(error as Error)
          return {}
        }
      })(),
    })

    // 重置缓存读取基线，以便压缩后的下降不会被标记为中断
    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      notifyCompaction(
        context.options.querySource ?? 'compact',
        context.agentId,
      )
    }
    markPostCompaction()

    // 重新附加会话元数据（自定义标题、标签），使其保持在 re
    // adLiteMetadata 为 --resume 显示而读
    // 取的 16KB 尾部窗口内。没有这个，足够的压缩后消息会将
    // 元数据条目推出窗口，导致 --resume 显示自动生成的
    // 标题而不是用户设置的会话名称。
    reAppendSessionMetadata()

    // 为压缩前的消息写入一个简化的转录片段（仅
    // 助手模式）。触发后不管——错误在内部记录。
    if (feature('KAIROS')) {
      void sessionTranscriptModule?.writeSessionTranscriptSegment(messages)
    }

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'post_compact',
    })
    const postCompactHookResult = await executePostCompactHooks(
      {
        trigger: isAutoCompact ? 'auto' : 'manual',
        compactSummary: summary,
      },
      context.abortController.signal,
    )

    const combinedUserDisplayMessage = [
      userDisplayMessage,
      postCompactHookResult.userDisplayMessage,
    ]
      .filter(Boolean)
      .join('\n')

    return {
      boundaryMarker,
      summaryMessages,
      attachments: postCompactFileAttachments,
      hookResults: hookMessages,
      userDisplayMessage: combinedUserDisplayMessage || undefined,
      preCompactTokenCount,
      postCompactTokenCount: compactionCallTotalTokens,
      truePostCompactTokenCount,
      compactionUsage,
    }
  } catch (error) {
    // 仅对手动 /compact 显示错
    // 误通知。自动压缩失败会在下一轮重试，
    // 并且当压缩最终成功时，通知会令人困惑。
    if (!isAutoCompact) {
      addErrorNotificationIfNeeded(error, context)
    }
    throw error
  } finally {
    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_end' })
    context.setSDKStatus?.('' as SDKStatus)
  }
}

/** 围绕选定的消息索引执行部分压缩。
方向 'from'：摘要索引之后的消息，保留较早的。
  保留（较早）消息的提示缓存被保留。
方向 'up_to'：摘要索引之前的消息，保留较晚的。
  提示缓存失效，因为摘要位于保留消息之前。 */
export async function partialCompactConversation(
  allMessages: Message[],
  pivotIndex: number,
  context: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  userFeedback?: string,
  direction: PartialCompactDirection = 'from',
): Promise<CompactionResult> {
  try {
    const messagesToSummarize =
      direction === 'up_to'
        ? allMessages.slice(0, pivotIndex)
        : allMessages.slice(pivotIndex)
    // 'up_to' 必须剥离旧的压缩边界/摘要：对于 'up_to'，summa
    // ry_B 位于保留消息之前，因此保留消息中的陈旧 boundary_A
    // 会在 findLastCompactBoundaryIndex 的后向扫描中
    // 胜出并丢弃 summary_B。'from' 保留它们：summary_B
    // 位于保留消息之后（后向扫描仍然有效），并且移除旧的摘要会丢失其覆盖的历史。
    const messagesToKeep =
      direction === 'up_to'
        ? allMessages
            .slice(pivotIndex)
            .filter(
              m =>
                m.type !== 'progress' &&
                !isCompactBoundaryMessage(m) &&
                !(m.type === 'user' && m.isCompactSummary),
            )
        : allMessages.slice(0, pivotIndex).filter(m => m.type !== 'progress')

    if (messagesToSummarize.length === 0) {
      throw new Error(
        direction === 'up_to'
          ? '在选定消息之前没有内容可摘要。'
          : '在选定消息之后没有内容可摘要。',
      )
    }

    const preCompactTokenCount = tokenCountWithEstimation(allMessages)

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'pre_compact',
    })

    context.setSDKStatus?.('compacting')
    const hookResult = await executePreCompactHooks(
      {
        trigger: 'manual',
        customInstructions: null,
      },
      context.abortController.signal,
    )

    // 将钩子指令与用户反馈合并
    let customInstructions: string | undefined
    if (hookResult.newCustomInstructions && userFeedback) {
      customInstructions = `${hookResult.newCustomInstructions}

用户上下文：${userFeedback}`
    } else if (hookResult.newCustomInstructions) {
      customInstructions = hookResult.newCustomInstructions
    } else if (userFeedback) {
      customInstructions = `用户上下文：${userFeedback}`
    }

    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_start' })

    const compactPrompt = getPartialCompactPrompt(customInstructions, direction)
    const summaryRequest = createUserMessage({
      content: compactPrompt,
    })

    const failureMetadata = {
      preCompactTokenCount,
      direction:
        direction as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      messagesSummarized: messagesToSummarize.length,
    }

    // 'up_to' 前缀直接命中缓存；'from' 发送所有内容（尾部不会被缓存
    // ）。PTL 重试会破坏缓存前缀，但能让用户继续（CC-1180）。
    let apiMessages = direction === 'up_to' ? messagesToSummarize : allMessages
    let retryCacheSafeParams =
      direction === 'up_to'
        ? { ...cacheSafeParams, forkContextMessages: messagesToSummarize }
        : cacheSafeParams
    let summaryResponse: AssistantMessage
    let summary: string | null
    let ptlAttempts = 0
    for (;;) {
      summaryResponse = await streamCompactSummary({
        messages: apiMessages,
        summaryRequest,
        appState: context.getAppState(),
        context,
        preCompactTokenCount,
        cacheSafeParams: retryCacheSafeParams,
      })
      summary = getAssistantMessageText(summaryResponse)
      if (!summary?.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) break

      ptlAttempts++
      const truncated =
        ptlAttempts <= MAX_PTL_RETRIES
          ? truncateHeadForPTLRetry(apiMessages, summaryResponse)
          : null
      if (!truncated) {
        logEvent('tengu_partial_compact_failed', {
          reason:
            'prompt_too_long' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          ...failureMetadata,
          ptlAttempts,
        })
        throw new Error(ERROR_MESSAGE_PROMPT_TOO_LONG)
      }
      logEvent('tengu_compact_ptl_retry', {
        attempt: ptlAttempts,
        droppedMessages: apiMessages.length - truncated.length,
        remainingMessages: truncated.length,
        path: 'partial' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
      apiMessages = truncated
      retryCacheSafeParams = {
        ...retryCacheSafeParams,
        forkContextMessages: truncated,
      }
    }
    if (!summary) {
      logEvent('tengu_partial_compact_failed', {
        reason:
          'no_summary' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...failureMetadata,
      })
      throw new Error('生成对话摘要失败 - 响应未包含有效的文本内容')
    } else if (startsWithApiErrorPrefix(summary)) {
      logEvent('tengu_partial_compact_failed', {
        reason:
          'api_error' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ...failureMetadata,
      })
      throw new Error(summary)
    }

    // Store the current file state before clearing
    let preCompactReadFileState = cacheToObject(context.readFileState)
    context.readFileState.clear()
    context.loadedNestedMemoryPaths?.clear()
    // 故意不重置 sentSkillNames——参见 compactConvers
    // ation() 的理由（每次压缩事件节省约 4K 令牌）。

    const [fileAttachments, asyncAgentAttachments] = await Promise.all([
      createPostCompactFileAttachments(
        preCompactReadFileState,
        context,
        POST_COMPACT_MAX_FILES_TO_RESTORE,
        messagesToKeep,
      ),
      createAsyncAgentAttachmentsIfNeeded(context),
    ])
    // Release the readFileState snapshot — it can hold 25+ MB of file content
    preCompactReadFileState =
      undefined as unknown as typeof preCompactReadFileState

    const postCompactFileAttachments: AttachmentMessage[] = [
      ...fileAttachments,
      ...asyncAgentAttachments,
    ]
    const planAttachment = createPlanAttachmentIfNeeded(context.agentId)
    if (planAttachment) {
      postCompactFileAttachments.push(planAttachment)
    }

    // 如果当前处于计划模式，则添加计划模式指令
    const planModeAttachment = await createPlanModeAttachmentIfNeeded(context)
    if (planModeAttachment) {
      postCompactFileAttachments.push(planModeAttachment)
    }

    const skillAttachment = createSkillAttachmentIfNeeded(context.agentId)
    if (skillAttachment) {
      postCompactFileAttachments.push(skillAttachment)
    }

    // 仅重新宣布摘要部分的内容——扫描 messagesTo
    // Keep，因此任何已在那里宣布的内容都会被跳过。
    for (const att of getDeferredToolsDeltaAttachment(
      context.options.tools,
      context.options.mainLoopModel,
      messagesToKeep,
      { callSite: 'compact_partial' },
    )) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }
    for (const att of getAgentListingDeltaAttachment(context, messagesToKeep)) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }
    for (const att of getMcpInstructionsDeltaAttachment(
      context.options.mcpClients,
      context.options.tools,
      context.options.mainLoopModel,
      messagesToKeep,
    )) {
      postCompactFileAttachments.push(createAttachmentMessage(att))
    }

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'session_start',
    })
    const hookMessages = await processSessionStartHooks('compact', {
      model: context.options.mainLoopModel,
    })

    const postCompactTokenCount = tokenCountFromLastAPIResponse([
      summaryResponse,
    ])
    const compactionUsage = getTokenUsage(summaryResponse)
    // Release the full API response — it holds content blocks + usage metadata
    summaryResponse = undefined as unknown as typeof summaryResponse

    logEvent('tengu_partial_compact', {
      preCompactTokenCount,
      postCompactTokenCount,
      messagesKept: messagesToKeep.length,
      messagesSummarized: messagesToSummarize.length,
      direction:
        direction as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      hasUserFeedback: !!userFeedback,
      trigger:
        'message_selector' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      compactionInputTokens: compactionUsage?.input_tokens,
      compactionOutputTokens: compactionUsage?.output_tokens,
      compactionCacheReadTokens: compactionUsage?.cache_read_input_tokens ?? 0,
      compactionCacheCreationTokens:
        compactionUsage?.cache_creation_input_tokens ?? 0,
    })

    // 进度消息不可记录，因此 forkSessionImpl 会将指向它们的
    // logicalParentUuid 置空。两个方向都跳过它们。
    const lastPreCompactUuid =
      direction === 'up_to'
        ? allMessages.slice(0, pivotIndex).findLast(m => m.type !== 'progress')
            ?.uuid
        : messagesToKeep.at(-1)?.uuid
    const boundaryMarker = createCompactBoundaryMessage(
      'manual',
      preCompactTokenCount ?? 0,
      lastPreCompactUuid,
      userFeedback,
      messagesToSummarize.length,
    )
    // allMessages 而不仅仅是 messagesToSummariz
    // e——集合并集是幂等的，比跟踪每个工具位于哪一半更简单。
    const preCompactDiscovered = extractDiscoveredToolNames(allMessages)
    if (preCompactDiscovered.size > 0) {
      boundaryMarker.compactMetadata.preCompactDiscoveredTools = [
        ...preCompactDiscovered,
      ].sort()
    }

    const transcriptPath = getTranscriptPath()
    const summaryMessages: UserMessage[] = [
      createUserMessage({
        content: getCompactUserSummaryMessage(summary, false, transcriptPath),
        isCompactSummary: true,
        ...(messagesToKeep.length > 0
          ? {
              summarizeMetadata: {
                messagesSummarized: messagesToSummarize.length,
                userContext: userFeedback,
                direction,
              },
            }
          : { isVisibleInTranscriptOnly: true as const }),
      }),
    ]

    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      notifyCompaction(
        context.options.querySource ?? 'compact',
        context.agentId,
      )
    }
    markPostCompaction()

    // 重新附加会话元数据（自定义标题、标签），使其保持在 readLiteM
    // etadata 为 --resume 显示而读取的 16KB 尾部窗口内。
    reAppendSessionMetadata()

    if (feature('KAIROS')) {
      void sessionTranscriptModule?.writeSessionTranscriptSegment(
        messagesToSummarize,
      )
    }

    context.onCompactProgress?.({
      type: 'hooks_start',
      hookType: 'post_compact',
    })
    const postCompactHookResult = await executePostCompactHooks(
      {
        trigger: 'manual',
        compactSummary: summary,
      },
      context.abortController.signal,
    )

    // 'from'：前缀保留 → 边界；'up_to'：后缀 → 最后摘要
    const anchorUuid =
      direction === 'up_to'
        ? (summaryMessages.at(-1)?.uuid ?? boundaryMarker.uuid)
        : boundaryMarker.uuid
    return {
      boundaryMarker: annotateBoundaryWithPreservedSegment(
        boundaryMarker,
        anchorUuid,
        messagesToKeep,
      ),
      summaryMessages,
      messagesToKeep,
      attachments: postCompactFileAttachments,
      hookResults: hookMessages,
      userDisplayMessage: postCompactHookResult.userDisplayMessage,
      preCompactTokenCount,
      postCompactTokenCount,
      compactionUsage,
    }
  } catch (error) {
    addErrorNotificationIfNeeded(error, context)
    throw error
  } finally {
    context.setStreamMode?.('requesting')
    context.setResponseLength?.(() => 0)
    context.onCompactProgress?.({ type: 'compact_end' })
    context.setSDKStatus?.('' as SDKStatus)
  }
}

function addErrorNotificationIfNeeded(
  error: unknown,
  context: Pick<ToolUseContext, 'addNotification'>,
) {
  if (
    !hasExactErrorMessage(error, ERROR_MESSAGE_USER_ABORT) &&
    !hasExactErrorMessage(error, ERROR_MESSAGE_NOT_ENOUGH_MESSAGES)
  ) {
    context.addNotification?.({
      key: 'error-compacting-conversation',
      text: '压缩对话时出错',
      priority: 'immediate',
      color: 'error',
    })
  }
}

export function createCompactCanUseTool(): CanUseToolFn {
  return async () => ({
    behavior: 'deny' as const,
    message: '压缩期间不允许使用工具',
    decisionReason: {
      type: 'other' as const,
      reason: '压缩代理应仅生成文本摘要',
    },
  })
}

async function streamCompactSummary({
  messages,
  summaryRequest,
  appState,
  context,
  preCompactTokenCount,
  cacheSafeParams,
}: {
  messages: Message[]
  summaryRequest: UserMessage
  appState: Awaited<ReturnType<ToolUseContext['getAppState']>>
  context: ToolUseContext
  preCompactTokenCount: number
  cacheSafeParams: CacheSafeParams
}): Promise<AssistantMessage> {
  // 当启用提示缓存共享时，使用分叉代理来重用主对话的缓存前
  // 缀（系统提示、工具、上下文消息）。失败时回退到常规流式路径。第
  // 三方默认：true——参见上方另一个 t
  // engu_compact_cache_prefix 读取处的注释。
  const promptCacheSharingEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_compact_cache_prefix',
    true,
  )
  // 在压缩期间发送保活信号，以防止远程会话 WebSocket
  // 空闲超时断开桥接连接。压缩 API 调用可能需要 5-10+
  // 秒，在此期间没有其他消息通过传输层——没有保活，服务器
  // 可能因不活动而关闭 WebSocket。两个信号：(1)
  // 通过 sessionActi
  // vity 发送 PUT /worker 心跳，以及 (2
  // ) 重新发出 'compacting' 状态，以便 SDK
  // 事件流保持活动状态，服务器不会认为会话已过期。
  const activityInterval = isSessionActivityTrackingActive()
    ? setInterval(
        (statusSetter?: (status: 'compacting' | null) => void) => {
          sendSessionActivitySignal()
          statusSetter?.('compacting')
        },
        30_000,
        context.setSDKStatus,
      )
    : undefined

  try {
    if (promptCacheSharingEnabled) {
      try {
        // 不要在此处设置 maxOutputTokens。分叉通过发送相同的缓存键
        // 参数（系统、工具、模型、消息前缀、思考配置）来搭载主线程的提示缓存。设置
        // maxOutputTokens 会通过 claude.ts 中的 M
        // ath.min(budget, maxOutputTokens-1
        // ) 限制 budget_tokens，造成思考配置不匹配，从而
        // 使缓存失效。流式回退路径（下方）可以安全地设置 maxOutputToke
        // nsOverride，因为它不与主线程共享缓存。
        const result = await runForkedAgent({
          promptMessages: [summaryRequest],
          cacheSafeParams,
          canUseTool: createCompactCanUseTool(),
          querySource: 'compact',
          forkLabel: 'compact',
          maxTurns: 1,
          skipCacheWrite: true,
          // 传递压缩上下文的 abortController，以便用户按 Esc 键中止分叉—
          // —与下方流式回退在 `signal: context.abor
          // tController.signal` 处使用的信号相同。
          overrides: { abortController: context.abortController },
        })
        const assistantMsg = getLastAssistantMessage(result.messages)
        const assistantText = assistantMsg
          ? getAssistantMessageText(assistantMsg)
          : null
        // 保护 isApiErrorMessage：query() 捕获 A
        // PI 错误（包括按 Esc 键时的 APIUserAbortErro
        // r）并将它们作为合成的助手消息产生。没有此检查，一个被中止的压缩会“
        // 成功”并返回“请求被中止。”作为摘要——文本不以“API 错误”开头，因
        // 此调用者的 startsWithApiErrorPrefix 保护会错过它。
        if (assistantMsg && assistantText && !assistantMsg.isApiErrorMessage) {
          // 跳过 PTL 错误文本的成功日志记录——它被返回
          // 以便调用者的重试循环捕获它，但它不是一个成功的摘要。
          if (!assistantText.startsWith(PROMPT_TOO_LONG_ERROR_MESSAGE)) {
            logEvent('tengu_compact_cache_sharing_success', {
              preCompactTokenCount,
              outputTokens: result.totalUsage.output_tokens,
              cacheReadInputTokens: result.totalUsage.cache_read_input_tokens,
              cacheCreationInputTokens:
                result.totalUsage.cache_creation_input_tokens,
              cacheHitRate:
                result.totalUsage.cache_read_input_tokens > 0
                  ? result.totalUsage.cache_read_input_tokens /
                    (result.totalUsage.cache_read_input_tokens +
                      result.totalUsage.cache_creation_input_tokens +
                      result.totalUsage.input_tokens)
                  : 0,
            })
          }
          return assistantMsg
        }
        logForDebugging(
          `压缩缓存共享：响应中无文本，正在回退。响应：${jsonStringify(assistantMsg)}`,
          { level: 'warn' },
        )
        logEvent('tengu_compact_cache_sharing_fallback', {
          reason:
            'no_text_response' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          preCompactTokenCount,
        })
      } catch (error) {
        logError(error)
        logEvent('tengu_compact_cache_sharing_fallback', {
          reason:
            'error' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          preCompactTokenCount,
        })
      }
    }

    // 常规流式路径（当缓存共享失败或禁用时的回退）
    const retryEnabled = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_compact_streaming_retry',
      false,
    )
    const maxAttempts = retryEnabled ? MAX_COMPACT_STREAMING_RETRIES : 1

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 为重试重置状态
      let hasStartedStreaming = false
      let response: AssistantMessage | undefined
      context.setResponseLength?.(() => 0)

      // 使用主循环的工具列表检查工具搜索是否启用。context.options
      // .tools 包括通过 useMergedTools 合并的 MCP 工具。
      const useToolSearch = await isToolSearchEnabled(
        context.options.mainLoopModel,
        context.options.tools,
        async () => appState.toolPermissionContext,
        context.options.agentDefinitions.activeAgents,
        'compact',
      )

      // 当工具搜索启用时，包含 ToolSearchTool 和 MCP 工具。它们获得 defer_lo
      // ading: true 并且不计入上下文——API 在令牌计数前将它们从 system_prompt_
      // tools 中过滤掉（参见 api/token_count_api/counting.py:188 和 api/
      // public_api/messages/handler.p
      // y:324）。从 context.options.tools（而不是 appState.mcp.t
      // ools）中过滤 MCP 工具，以便我们从 useMergedTools 获得权限过滤后的集合——
      // 与上方 isToolSearchEnabled 和下方 normalizeMes
      // sagesForAPI 使用的来源相同。按名称去重，以避免当 MCP 工具与内置工具共享名称时出现 API 错误。
      const tools: Tool[] = useToolSearch
        ? uniqBy(
            [
              FileReadTool,
              ToolSearchTool,
              ...context.options.tools.filter(t => t.isMcp),
            ],
            'name',
          )
        : [FileReadTool]

      const streamingGen = queryModelWithStreaming({
        messages: normalizeMessagesForAPI(
          stripImagesFromMessages(
            stripReinjectedAttachments([
              ...getMessagesAfterCompactBoundary(messages),
              summaryRequest,
            ]),
          ),
          context.options.tools,
        ),
        systemPrompt: asSystemPrompt([
          '你是一个有帮助的 AI 助手，负责摘要对话。',
        ]),
        thinkingConfig: { type: 'disabled' as const },
        tools,
        signal: context.abortController.signal,
        options: {
          async getToolPermissionContext() {
            const appState = context.getAppState()
            return appState.toolPermissionContext
          },
          model: context.options.mainLoopModel,
          toolChoice: undefined,
          isNonInteractiveSession: context.options.isNonInteractiveSession,
          hasAppendSystemPrompt: !!context.options.appendSystemPrompt,
          maxOutputTokensOverride: Math.min(
            COMPACT_MAX_OUTPUT_TOKENS,
            getMaxOutputTokensForModel(context.options.mainLoopModel),
          ),
          querySource: 'compact',
          agents: context.options.agentDefinitions.activeAgents,
          mcpTools: [],
          effortValue: appState.effortValue,
          langfuseTrace: context.langfuseTrace,
        },
      })
      const streamIter = streamingGen[Symbol.asyncIterator]()
      let next = await streamIter.next()

      while (!next.done) {
        const event = next.value as
          | StreamEvent
          | AssistantMessage
          | SystemAPIErrorMessage
        const streamEvent = event as {
          type: string
          event: {
            type: string
            content_block: { type: string }
            delta: { type: string; text: string }
          }
        }

        if (
          !hasStartedStreaming &&
          streamEvent.type === 'stream_event' &&
          streamEvent.event.type === 'content_block_start' &&
          streamEvent.event.content_block.type === 'text'
        ) {
          hasStartedStreaming = true
          context.setStreamMode?.('responding')
        }

        if (
          streamEvent.type === 'stream_event' &&
          streamEvent.event.type === 'content_block_delta' &&
          streamEvent.event.delta.type === 'text_delta'
        ) {
          const charactersStreamed = streamEvent.event.delta.text.length
          context.setResponseLength?.(length => length + charactersStreamed)
        }

        if (event.type === 'assistant') {
          response = event as AssistantMessage
        }

        next = await streamIter.next()
      }

      if (response) {
        return response
      }

      if (attempt < maxAttempts) {
        logEvent('tengu_compact_streaming_retry', {
          attempt,
          preCompactTokenCount,
          hasStartedStreaming,
        })
        await sleep(getRetryDelay(attempt), context.abortController.signal, {
          abortError: () => new APIUserAbortError(),
        })
        continue
      }

      logForDebugging(
        `压缩流式传输在 ${attempt} 次尝试后失败。hasStartedStreaming=${hasStartedStreaming}`,
        { level: 'error' },
      )
      logEvent('tengu_compact_failed', {
        reason:
          'no_streaming_response' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        preCompactTokenCount,
        hasStartedStreaming,
        retryEnabled,
        attempts: attempt,
        promptCacheSharingEnabled,
      })
      throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE)
    }

    // 由于上方的抛出，这应该永远不会到达，但 TypeScript 需要它
    throw new Error(ERROR_MESSAGE_INCOMPLETE_RESPONSE)
  } finally {
    clearInterval(activityInterval)
  }
}

/** 为最近访问的文件创建附件消息，以便在压缩后恢复它们。
这可以防止模型不得不重新读取最近访问过的文件。
使用 FileReadTool 重新读取文件以获取经过适当验证的新鲜内容。
文件的选择基于最近访问时间，但受文件数量和令牌预算限制的双重约束。

对于已作为 Read 工具结果存在于 preservedMessages 中的文件，将跳过处理——
重新注入模型在保留的尾部消息中已经能看到的内容纯粹是浪费（每次压缩最多浪费 25K 令牌）。
这镜像了 getDeferredToolsDeltaAttachment 在同一调用点使用的、针对保留内容的差异对比模式。

@param readFileState 跟踪最近读取文件的当前文件状态
@param toolUseContext 用于调用 FileReadTool 的工具使用上下文
@param maxFiles 要恢复的最大文件数量（默认值：5）
@param preservedMessages 压缩后保留的消息；其中的 Read 结果将被跳过
@returns 符合令牌预算限制的、最近访问文件的附件消息数组 */
export async function createPostCompactFileAttachments(
  readFileState: Record<string, { content: string; timestamp: number }>,
  toolUseContext: ToolUseContext,
  maxFiles: number,
  preservedMessages: Message[] = [],
): Promise<AttachmentMessage[]> {
  const preservedReadPaths = collectReadToolFilePaths(preservedMessages)
  const recentFiles = Object.entries(readFileState)
    .map(([filename, state]) => ({ filename, ...state }))
    .filter(
      file =>
        !shouldExcludeFromPostCompactRestore(
          file.filename,
          toolUseContext.agentId,
        ) && !preservedReadPaths.has(expandPath(file.filename)),
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxFiles)

  const results = await Promise.all(
    recentFiles.map(async file => {
      const attachment = await generateFileAttachment(
        file.filename,
        {
          ...toolUseContext,
          fileReadingLimits: {
            maxTokens: POST_COMPACT_MAX_TOKENS_PER_FILE,
          },
        },
        'tengu_post_compact_file_restore_success',
        'tengu_post_compact_file_restore_error',
        'compact',
      )
      return attachment ? createAttachmentMessage(attachment) : null
    }),
  )

  let usedTokens = 0
  return results.filter((result): result is AttachmentMessage<Attachment> => {
    if (result === null) {
      return false
    }
    const attachmentTokens = roughTokenCountEstimation(jsonStringify(result))
    if (usedTokens + attachmentTokens <= POST_COMPACT_TOKEN_BUDGET) {
      usedTokens += attachmentTokens
      return true
    }
    return false
  })
}

/** 如果当前会话存在计划文件，则创建一个计划文件附件。
这确保了计划在压缩后得以保留。 */
export function createPlanAttachmentIfNeeded(
  agentId?: AgentId,
): AttachmentMessage | null {
  const planContent = getPlan(agentId)

  if (!planContent) {
    return null
  }

  const planFilePath = getPlanFilePath(agentId)

  return createAttachmentMessage({
    type: 'plan_file_reference',
    planFilePath,
    planContent,
  })
}

/** 为已调用的技能创建附件，以便在压缩过程中保留其内容。
仅包含限定于给定智能体（或当 agentId 为 null/undefined 时为主会话）的技能。
这确保了在对话被总结后，技能指南仍然可用，
同时不会泄露来自其他智能体上下文的技能。 */
export function createSkillAttachmentIfNeeded(
  agentId?: string,
): AttachmentMessage | null {
  const invokedSkills = getInvokedSkillsForAgent(agentId)

  if (invokedSkills.size === 0) {
    return null
  }

  // 按最近优先排序，这样预算压力会淘汰最不相关的技能。
  // 对每个技能进行截断，保留每个文件的头部（通常
  // 包含设置/使用说明），而不是丢弃整个技能。
  let usedTokens = 0
  const skills = Array.from(invokedSkills.values())
    .sort((a, b) => b.invokedAt - a.invokedAt)
    .map(skill => ({
      name: skill.skillName,
      path: skill.skillPath,
      content: truncateToTokens(
        skill.content,
        POST_COMPACT_MAX_TOKENS_PER_SKILL,
      ),
    }))
    .filter(skill => {
      const tokens = roughTokenCountEstimation(skill.content)
      if (usedTokens + tokens > POST_COMPACT_SKILLS_TOKEN_BUDGET) {
        return false
      }
      usedTokens += tokens
      return true
    })

  if (skills.length === 0) {
    return null
  }

  return createAttachmentMessage({
    type: 'invoked_skills',
    skills,
  })
}

/** 如果用户当前处于计划模式，则创建一个 plan_mode 附件。
这确保了模型在压缩后继续在计划模式下运行
（否则它将丢失计划模式指令，因为这些指令
通常仅在工具使用轮次通过 getAttachmentMessages 注入）。 */
export async function createPlanModeAttachmentIfNeeded(
  context: ToolUseContext,
): Promise<AttachmentMessage | null> {
  const appState = context.getAppState()
  if (appState.toolPermissionContext.mode !== 'plan') {
    return null
  }

  const planFilePath = getPlanFilePath(context.agentId)
  const planExists = getPlan(context.agentId) !== null

  return createAttachmentMessage({
    type: 'plan_mode',
    reminderType: 'full',
    isSubAgent: !!context.agentId,
    planFilePath,
    planExists,
  })
}

/** 为异步智能体创建附件，以便模型在压缩后了解它们。
涵盖仍在后台运行的智能体（这样模型就不会
重复生成）以及已完成但其结果尚未被检索的智能体。 */
export async function createAsyncAgentAttachmentsIfNeeded(
  context: ToolUseContext,
): Promise<AttachmentMessage[]> {
  const appState = context.getAppState()
  const asyncAgents = Object.values(appState.tasks).filter(
    (task): task is LocalAgentTaskState => task.type === 'local_agent',
  )

  return asyncAgents.flatMap(agent => {
    if (
      agent.retrieved ||
      agent.status === 'pending' ||
      agent.agentId === context.agentId
    ) {
      return []
    }
    return [
      createAttachmentMessage({
        type: 'task_status',
        taskId: agent.agentId,
        taskType: 'local_agent',
        description: agent.description,
        status: agent.status,
        deltaSummary:
          agent.status === 'running'
            ? (agent.progress?.summary ?? null)
            : (agent.error ?? null),
        outputFilePath: getTaskOutputPath(agent.agentId),
      }),
    ]
  })
}

/** 扫描消息中的 Read 工具使用块，并收集它们的 file_path 输入
（通过 expandPath 进行标准化）。用于在压缩后恢复文件时，
对已经在保留尾部消息中可见的内容进行去重。

跳过那些 tool_result 是去重存根的 Read 操作——该存根指向一个
可能已被压缩掉的早期完整 Read 操作，因此我们希望
createPostCompactFileAttachments 重新注入真实内容。 */
function collectReadToolFilePaths(messages: Message[]): Set<string> {
  const stubIds = new Set<string>()
  for (const message of messages) {
    if (message.type !== 'user' || !Array.isArray(message.message!.content)) {
      continue
    }
    for (const block of message.message!.content) {
      if (
        block.type === 'tool_result' &&
        typeof block.content === 'string' &&
        block.content.startsWith(FILE_UNCHANGED_STUB)
      ) {
        stubIds.add(block.tool_use_id)
      }
    }
  }

  const paths = new Set<string>()
  for (const message of messages) {
    if (
      message.type !== 'assistant' ||
      !Array.isArray(message.message!.content)
    ) {
      continue
    }
    for (const block of message.message!.content) {
      if (
        block.type !== 'tool_use' ||
        block.name !== FILE_READ_TOOL_NAME ||
        stubIds.has(block.id)
      ) {
        continue
      }
      const input = block.input
      if (
        input &&
        typeof input === 'object' &&
        'file_path' in input &&
        typeof input.file_path === 'string'
      ) {
        paths.add(expandPath(input.file_path))
      }
    }
  }
  return paths
}

const SKILL_TRUNCATION_MARKER =
  '\n\n[... 技能内容已为压缩而截断；如果需要完整文本，请对技能路径使用 Read 操作]'

/** 将内容截断至大约 maxTokens，保留头部。roughTokenCountEstimation
使用约 4 个字符/令牌（其默认的 bytesPerToken），因此字符预算 = maxTokens * 4
减去标记文本，以使结果保持在预算内。标记文本告诉模型，
如果需要，它可以读取完整文件。 */
function truncateToTokens(content: string, maxTokens: number): string {
  if (roughTokenCountEstimation(content) <= maxTokens) {
    return content
  }
  const charBudget = maxTokens * 4 - SKILL_TRUNCATION_MARKER.length
  return content.slice(0, charBudget) + SKILL_TRUNCATION_MARKER
}

function shouldExcludeFromPostCompactRestore(
  filename: string,
  agentId?: AgentId,
): boolean {
  const normalizedFilename = expandPath(filename)
  // 排除计划文件
  try {
    const planFilePath = expandPath(getPlanFilePath(agentId))
    if (normalizedFilename === planFilePath) {
      return true
    }
  } catch {
    // 如果无法获取计划文件路径，则继续执行其他检查
  }

  // 排除所有类型的 claude.md 文件 T
  // ODO：重构以使用 claudemd.ts 中的 isMemoryFilePath()
  // 以确保一致性，并同时匹配子目录中的记忆文件（.claude/rules/*.md 等）
  try {
    const normalizedMemoryPaths = new Set(
      MEMORY_TYPE_VALUES.map(type => expandPath(getMemoryPath(type))),
    )

    if (normalizedMemoryPaths.has(normalizedFilename)) {
      return true
    }
  } catch {
    // 如果无法获取记忆文件路径，则继续
  }

  return false
}
