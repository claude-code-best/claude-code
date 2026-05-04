/** 实验：会话内存压缩 */

import type { AgentId } from '../../types/ids.js'
import type { HookResultMessage, Message } from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { errorMessage } from '../../utils/errors.js'
import {
  createCompactBoundaryMessage,
  createUserMessage,
  isCompactBoundaryMessage,
} from '../../utils/messages.js'
import { getMainLoopModel } from '../../utils/model/model.js'
import { getSessionMemoryPath } from '../../utils/permissions/filesystem.js'
import { processSessionStartHooks } from '../../utils/sessionStart.js'
import { getTranscriptPath } from '../../utils/sessionStorage.js'
import { tokenCountFromLastAPIResponse } from '../../utils/tokens.js'
import { extractDiscoveredToolNames } from '../../utils/toolSearch.js'
import {
  getDynamicConfig_BLOCKS_ON_INIT,
  getFeatureValue_CACHED_MAY_BE_STALE,
} from '../analytics/growthbook.js'
import { logEvent } from '../analytics/index.js'
import {
  isSessionMemoryEmpty,
  truncateSessionMemoryForCompact,
} from '../SessionMemory/prompts.js'
import {
  getLastSummarizedMessageId,
  getSessionMemoryContent,
  waitForSessionMemoryExtraction,
} from '../SessionMemory/sessionMemoryUtils.js'
import {
  annotateBoundaryWithPreservedSegment,
  buildPostCompactMessages,
  type CompactionResult,
  createPlanAttachmentIfNeeded,
} from './compact.js'
import { estimateMessageTokens } from './microCompact.js'
import { getCompactUserSummaryMessage } from './prompt.js'

/** 会话内存压缩阈值的配置 */
export type SessionMemoryCompactConfig = {
  /** 压缩后保留的最小 token 数 */
  minTokens: number
  /** 保留的包含文本块消息的最小数量 */
  minTextBlockMessages: number
  /** 压缩后保留的最大 token 数（硬上限） */
  maxTokens: number
}

// 默认配置值（导出供测试使用）
export const DEFAULT_SM_COMPACT_CONFIG: SessionMemoryCompactConfig = {
  minTokens: 10_000,
  minTextBlockMessages: 5,
  maxTokens: 40_000,
}

// 当前配置（从默认值开始）
let smCompactConfig: SessionMemoryCompactConfig = {
  ...DEFAULT_SM_COMPACT_CONFIG,
}

// 跟踪配置是否已从远程初始化
let configInitialized = false

/** 设置会话内存压缩配置 */
export function setSessionMemoryCompactConfig(
  config: Partial<SessionMemoryCompactConfig>,
): void {
  smCompactConfig = {
    ...smCompactConfig,
    ...config,
  }
}

/** 获取当前会话内存压缩配置 */
export function getSessionMemoryCompactConfig(): SessionMemoryCompactConfig {
  return { ...smCompactConfig }
}

/** 重置配置状态（用于测试） */
export function resetSessionMemoryCompactConfig(): void {
  smCompactConfig = { ...DEFAULT_SM_COMPACT_CONFIG }
  configInitialized = false
}

/** 从远程配置（GrowthBook）初始化配置。
每个会话仅获取一次 - 后续调用立即返回。 */
async function initSessionMemoryCompactConfig(): Promise<void> {
  if (configInitialized) {
    return
  }
  configInitialized = true

  // 从 GrowthBook 加载配置，并与默认值合并
  const remoteConfig = await getDynamicConfig_BLOCKS_ON_INIT<
    Partial<SessionMemoryCompactConfig>
  >('tengu_sm_compact_config', {})

  // 仅当远程值被显式设置（正数）时才使用它
  // 们，这确保合理的默认值不会被零值覆盖
  const config: SessionMemoryCompactConfig = {
    minTokens:
      remoteConfig.minTokens && remoteConfig.minTokens > 0
        ? remoteConfig.minTokens
        : DEFAULT_SM_COMPACT_CONFIG.minTokens,
    minTextBlockMessages:
      remoteConfig.minTextBlockMessages && remoteConfig.minTextBlockMessages > 0
        ? remoteConfig.minTextBlockMessages
        : DEFAULT_SM_COMPACT_CONFIG.minTextBlockMessages,
    maxTokens:
      remoteConfig.maxTokens && remoteConfig.maxTokens > 0
        ? remoteConfig.maxTokens
        : DEFAULT_SM_COMPACT_CONFIG.maxTokens,
  }
  setSessionMemoryCompactConfig(config)
}

/** 检查消息是否包含文本块（用户/助手交互的文本内容） */
export function hasTextBlocks(message: Message): boolean {
  if (message.type === 'assistant') {
    const content = message.message!.content
    return (
      Array.isArray(content) && content.some(block => block.type === 'text')
    )
  }
  if (message.type === 'user') {
    const content = message.message!.content
    if (typeof content === 'string') {
      return content.length > 0
    }
    if (Array.isArray(content)) {
      return content.some(block => block.type === 'text')
    }
  }
  return false
}

/** 检查消息是否包含 tool_result 块并返回它们的 tool_use_id */
function getToolResultIds(message: Message): string[] {
  if (message.type !== 'user') {
    return []
  }
  const content = message.message!.content
  if (!Array.isArray(content)) {
    return []
  }
  const ids: string[] = []
  for (const block of content) {
    if (block.type === 'tool_result') {
      ids.push(block.tool_use_id)
    }
  }
  return ids
}

/** 检查消息是否包含带有任何给定 ID 的 tool_use 块 */
function hasToolUseWithIds(message: Message, toolUseIds: Set<string>): boolean {
  if (message.type !== 'assistant') {
    return false
  }
  const content = message.message!.content
  if (!Array.isArray(content)) {
    return false
  }
  return content.some(
    block => block.type === 'tool_use' && toolUseIds.has(block.id),
  )
}

/** 调整起始索引，以确保不会拆分 tool_use/tool_result 对
或与保留的助手消息共享相同 message.id 的思考块。

如果我们要保留的任何消息包含 tool_result 块，我们需要
包含前面包含匹配 tool_use 块的助手消息。

此外，如果保留范围内的任何助手消息与前面的助手消息具有相同的 message.id
（该消息可能包含思考块），我们需要
包含这些消息，以便它们可以被 normalizeMessagesForAPI 正确合并。

这处理了流式传输为每个内容块（思考、tool_use 等）生成单独消息的情况，
这些消息具有相同的 message.id 但不同的 uuid。如果
startIndex 落在这条流式消息上，我们需要查看所有保留的
消息中的 tool_results，而不仅仅是第一条。

此修复解决的示例错误场景：

工具对场景：
  会话存储（压缩前）：
    索引 N:   assistant, message.id: X, content: [thinking]
    索引 N+1: assistant, message.id: X, content: [tool_use: ORPHAN_ID]
    索引 N+2: assistant, message.id: X, content: [tool_use: VALID_ID]
    索引 N+3: user, content: [tool_result: ORPHAN_ID, tool_result: VALID_ID]

  如果 startIndex = N+2:
    - 旧代码：仅检查消息 N+2 中的 tool_results，未找到，返回 N+2
    - 切片后，normalizeMessagesForAPI 按 message.id 合并：
      msg[1]: assistant with [tool_use: VALID_ID]  (ORPHAN tool_use 被排除！)
      msg[2]: user with [tool_result: ORPHAN_ID, tool_result: VALID_ID]
    - API 错误：孤立的 tool_result 引用了不存在的 tool_use

思考块场景：
  会话存储（压缩前）：
    索引 N:   assistant, message.id: X, content: [thinking]
    索引 N+1: assistant, message.id: X, content: [tool_use: ID]
    索引 N+2: user, content: [tool_result: ID]

  如果 startIndex = N+1:
    - 没有此修复：索引 N 处的思考块被排除
    - 在 normalizeMessagesForAPI 之后：思考块丢失（没有可合并的消息）

  修复后的代码：检测到消息 N+1 与 N 具有相同的 message.id，调整为 N。 */
export function adjustIndexToPreserveAPIInvariants(
  messages: Message[],
  startIndex: number,
): number {
  if (startIndex <= 0 || startIndex >= messages.length) {
    return startIndex
  }

  let adjustedIndex = startIndex

  // 步骤 1：处理 tool_use/tool_res
  // ult 对 从保留范围内的所有消息中收集 tool_result ID
  const allToolResultIds: string[] = []
  for (let i = startIndex; i < messages.length; i++) {
    allToolResultIds.push(...getToolResultIds(messages[i]!))
  }

  if (allToolResultIds.length > 0) {
    // 收集已在保留范围内的 tool_use ID
    const toolUseIdsInKeptRange = new Set<string>()
    for (let i = adjustedIndex; i < messages.length; i++) {
      const msg = messages[i]!
      if (msg.type === 'assistant' && Array.isArray(msg.message!.content)) {
        for (const block of msg.message!.content) {
          if (block.type === 'tool_use') {
            toolUseIdsInKeptRange.add(block.id)
          }
        }
      }
    }

    // 仅查找尚未在保留范围内的 tool_use
    const neededToolUseIds = new Set(
      allToolResultIds.filter(id => !toolUseIdsInKeptRange.has(id)),
    )

    // 查找包含匹配 tool_use 块的助手消息
    for (let i = adjustedIndex - 1; i >= 0 && neededToolUseIds.size > 0; i--) {
      const message = messages[i]!
      if (hasToolUseWithIds(message, neededToolUseIds)) {
        adjustedIndex = i
        // 从集合中移除已找到的 tool_use_id
        if (
          message.type === 'assistant' &&
          Array.isArray(message.message!.content)
        ) {
          for (const block of message.message!.content) {
            if (block.type === 'tool_use' && neededToolUseIds.has(block.id)) {
              neededToolUseIds.delete(block.id)
            }
          }
        }
      }
    }
  }

  // 步骤 2：处理与保留的助手消息共享 message.id 的思考块
  // 从保留范围内的助手消息中收集所有 message.id
  const messageIdsInKeptRange = new Set<string>()
  for (let i = adjustedIndex; i < messages.length; i++) {
    const msg = messages[i]!
    if (msg.type === 'assistant' && msg.message!.id) {
      messageIdsInKeptRange.add(msg.message!.id)
    }
  }

  // 向后查找具有相同 message.id 但不在保留范围内的助手消息 这些消息可能
  // 包含需要由 normalizeMessagesForAPI 合并的思考块
  for (let i = adjustedIndex - 1; i >= 0; i--) {
    const message = messages[i]!
    if (
      message.type === 'assistant' &&
      message.message!.id &&
      messageIdsInKeptRange.has(message.message!.id)
    ) {
      // 此消息与保留范围内的某条消息具有相同的 messa
      // ge.id 包含它以便思考块可以被正确合并
      adjustedIndex = i
    }
  }

  return adjustedIndex
}

/** 计算压缩后要保留的消息的起始索引。
从 lastSummarizedMessageId 开始，然后向后扩展以满足最小值：
- 至少 config.minTokens 个 token
- 至少 config.minTextBlockMessages 个包含文本块的消息
如果达到 config.maxTokens 则停止扩展。
同时确保 tool_use/tool_result 对不会被拆分。 */
export function calculateMessagesToKeepIndex(
  messages: Message[],
  lastSummarizedIndex: number,
): number {
  if (messages.length === 0) {
    return 0
  }

  const config = getSessionMemoryCompactConfig()

  // 从 lastSummarizedIndex 之后的消息开始 如
  // 果 lastSummarizedIndex 为 -1（未找到）或 messages.length（没有
  // 已汇总的 ID），则从没有保留消息开始
  let startIndex =
    lastSummarizedIndex >= 0 ? lastSummarizedIndex + 1 : messages.length

  // 计算从 startIndex 到末尾的当前 token 数和文本块消息数
  let totalTokens = 0
  let textBlockMessageCount = 0
  for (let i = startIndex; i < messages.length; i++) {
    const msg = messages[i]!
    totalTokens += estimateMessageTokens([msg])
    if (hasTextBlocks(msg)) {
      textBlockMessageCount++
    }
  }

  // 检查是否已达到最大上限
  if (totalTokens >= config.maxTokens) {
    return adjustIndexToPreserveAPIInvariants(messages, startIndex)
  }

  // 检查是否已满足两个最小值
  if (
    totalTokens >= config.minTokens &&
    textBlockMessageCount >= config.minTextBlockMessages
  ) {
    return adjustIndexToPreserveAPIInvariants(messages, startIndex)
  }

  // 向后扩展直到满足两个最小值或达到最大上限。下限为最后
  // 一个边界：保留段链在那里存在磁盘不连续性（来自去重跳过的
  // att[0]→summary 快捷方式），这会让加载器的
  // tail→head 遍历绕过内部保留消息然后修剪它们。反应
  // 式压缩已通过 getMessagesAfterCompac
  // tBoundary 在该边界处切片；这是相同的不变量。
  const idx = messages.findLastIndex(m => isCompactBoundaryMessage(m))
  const floor = idx === -1 ? 0 : idx + 1
  for (let i = startIndex - 1; i >= floor; i--) {
    const msg = messages[i]!
    const msgTokens = estimateMessageTokens([msg])
    totalTokens += msgTokens
    if (hasTextBlocks(msg)) {
      textBlockMessageCount++
    }
    startIndex = i

    // 如果达到最大上限则停止
    if (totalTokens >= config.maxTokens) {
      break
    }

    // 如果满足两个最小值则停止
    if (
      totalTokens >= config.minTokens &&
      textBlockMessageCount >= config.minTextBlockMessages
    ) {
      break
    }
  }

  // 针对工具对进行调整
  return adjustIndexToPreserveAPIInvariants(messages, startIndex)
}

/** 检查是否应使用会话内存进行压缩
使用缓存的开关值以避免阻塞 Statsig 初始化 */
export function shouldUseSessionMemoryCompaction(): boolean {
  // 允许通过环境变量覆盖以用于评估运行和测试
  if (isEnvTruthy(process.env.ENABLE_CLAUDE_CODE_SM_COMPACT)) {
    return true
  }
  if (isEnvTruthy(process.env.DISABLE_CLAUDE_CODE_SM_COMPACT)) {
    return false
  }

  const sessionMemoryFlag = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_session_memory',
    false,
  )
  const smCompactFlag = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_sm_compact',
    false,
  )
  const shouldUse = sessionMemoryFlag && smCompactFlag

  // 记录开关状态以用于调试（仅限 ant 以避免外部日志中的噪音）
  if (process.env.USER_TYPE === 'ant') {
    logEvent('tengu_sm_compact_flag_check', {
      tengu_session_memory: sessionMemoryFlag,
      tengu_sm_compact: smCompactFlag,
      should_use: shouldUse,
    })
  }

  return shouldUse
}

/** 从会话内存创建 CompactionResult */
function createCompactionResultFromSessionMemory(
  messages: Message[],
  sessionMemory: string,
  messagesToKeep: Message[],
  hookResults: HookResultMessage[],
  transcriptPath: string,
  agentId?: AgentId,
): CompactionResult {
  const preCompactTokenCount = tokenCountFromLastAPIResponse(messages)

  const boundaryMarker = createCompactBoundaryMessage(
    'auto',
    preCompactTokenCount ?? 0,
    messages[messages.length - 1]?.uuid,
  )
  const preCompactDiscovered = extractDiscoveredToolNames(messages)
  if (preCompactDiscovered.size > 0) {
    boundaryMarker.compactMetadata.preCompactDiscoveredTools = [
      ...preCompactDiscovered,
    ].sort()
  }

  // 截断过大的部分以防止会话内存消耗整个压缩
  // 后的 token 预算
  const { truncatedContent, wasTruncated } =
    truncateSessionMemoryForCompact(sessionMemory)

  let summaryContent = getCompactUserSummaryMessage(
    truncatedContent,
    true,
    transcriptPath,
    true,
  )

  if (wasTruncated) {
    const memoryPath = getSessionMemoryPath()
    summaryContent += `\n\n某些会话内存部分因长度过长而被截断。完整的会话内存可在以下位置查看：${memoryPath}`
  }

  const summaryMessages = [
    createUserMessage({
      content: summaryContent,
      isCompactSummary: true,
      isVisibleInTranscriptOnly: true,
    }),
  ]

  const planAttachment = createPlanAttachmentIfNeeded(agentId)
  const attachments = planAttachment ? [planAttachment] : []

  return {
    boundaryMarker: annotateBoundaryWithPreservedSegment(
      boundaryMarker,
      summaryMessages[summaryMessages.length - 1]!.uuid,
      messagesToKeep,
    ),
    summaryMessages,
    attachments,
    hookResults,
    messagesToKeep,
    preCompactTokenCount,
    // SM-compact 没有 compact-API-call，因此 postCompactToke
    // nCount（为事件连续性保留）和 truePostCompactTokenCount 收敛到相同的值。
    postCompactTokenCount: estimateMessageTokens(summaryMessages),
    truePostCompactTokenCount: estimateMessageTokens(summaryMessages),
  }
}

/** 尝试使用会话内存进行压缩，而不是传统的压缩。
如果无法使用会话内存压缩，则返回 null。

处理两种场景：
1. 正常情况：设置了 lastSummarizedMessageId，仅保留该 ID 之后的消息
2. 恢复的会话：未设置 lastSummarizedMessageId 但会话内存有内容，
   保留所有消息但使用会话内存作为摘要 */
export async function trySessionMemoryCompaction(
  messages: Message[],
  agentId?: AgentId,
  autoCompactThreshold?: number,
): Promise<CompactionResult | null> {
  if (!shouldUseSessionMemoryCompaction()) {
    return null
  }

  // 从远程初始化配置（仅获取一次）
  await initSessionMemoryCompactConfig()

  // 等待任何正在进行的会话内存提取完成（带超时）
  await waitForSessionMemoryExtraction()

  const lastSummarizedMessageId = getLastSummarizedMessageId()
  const sessionMemory = await getSessionMemoryContent()

  // 会话内存文件根本不存在
  if (!sessionMemory) {
    logEvent('tengu_sm_compact_no_session_memory', {})
    return null
  }

  // 会话内存存在但与模板匹配（未提取到实际内容
  // ）回退到传统压缩行为
  if (await isSessionMemoryEmpty(sessionMemory)) {
    logEvent('tengu_sm_compact_empty_template', {})
    return null
  }

  try {
    let lastSummarizedIndex: number

    if (lastSummarizedMessageId) {
      // 正常情况：我们确切知道哪些消息已被汇总
      lastSummarizedIndex = messages.findIndex(
        msg => msg.uuid === lastSummarizedMessageId,
      )

      if (lastSummarizedIndex === -1) {
        // 汇总的消息 ID 在当前消息中不存在
        // 如果消息被修改，可能会发生这种情况 - 回退到
        // 传统压缩，因为我们无法确定已汇总和未汇总消息之间的边界
        logEvent('tengu_sm_compact_summarized_id_not_found', {})
        return null
      }
    } else {
      // 恢复的会话情况：会话内存有内容但我们不知道边界 将 lastSummarizedIn
      // dex 设置为最后一条消息，以便 startIndex 变为 messages.length（最初不保留任何消息）
      lastSummarizedIndex = messages.length - 1
      logEvent('tengu_sm_compact_resumed_session', {})
    }

    // 计算要保留的消息的起始索引 从 lastSum
    // marizedIndex 开始，扩展以满足最小值，并调整以不
    // 拆分 tool_use/tool_result 对
    const startIndex = calculateMessagesToKeepIndex(
      messages,
      lastSummarizedIndex,
    )
    // 从 messagesToKeep 中过滤掉旧的压缩边界消息。在
    // REPL 修剪之后，从 messagesToKeep 重新产生的旧边界
    // 会触发不必要的第二次修剪（isCompactBoundaryMessage
    // 返回 true），丢弃新的边界和摘要。
    const messagesToKeep = messages
      .slice(startIndex)
      .filter(m => !isCompactBoundaryMessage(m))

    // 运行会话启动钩子以恢复 CLAUDE.md 和其他上下文
    const hookResults = await processSessionStartHooks('compact', {
      model: getMainLoopModel(),
    })

    // 获取摘要消息的转录路径
    const transcriptPath = getTranscriptPath()

    const compactionResult = createCompactionResultFromSessionMemory(
      messages,
      sessionMemory,
      messagesToKeep,
      hookResults,
      transcriptPath,
      agentId,
    )

    const postCompactMessages = buildPostCompactMessages(compactionResult)

    const postCompactTokenCount = estimateMessageTokens(postCompactMessages)

    // 仅在提供了阈值时才检查阈值（用于自动压缩）
    if (
      autoCompactThreshold !== undefined &&
      postCompactTokenCount >= autoCompactThreshold
    ) {
      logEvent('tengu_sm_compact_threshold_exceeded', {
        postCompactTokenCount,
        autoCompactThreshold,
      })
      return null
    }

    return {
      ...compactionResult,
      postCompactTokenCount,
      truePostCompactTokenCount: postCompactTokenCount,
    }
  } catch (error) {
    // 使用 logEvent 而不是 logError，因为此处
    // 的错误是预期的（例如，文件未找到、路径问题），不应进入错误日志
    logEvent('tengu_sm_compact_error', {})
    if (process.env.USER_TYPE === 'ant') {
      logForDebugging(`会话内存压缩错误：${errorMessage(error)}`)
    }
    return null
  }
}
