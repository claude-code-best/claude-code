import { feature } from 'bun:bundle'
import { markPostCompaction } from 'src/bootstrap/state.js'
import { getSdkBetas } from '../../bootstrap/state.js'
import type { QuerySource } from '../../constants/querySource.js'
import type { ToolUseContext } from '../../Tool.js'
import type { Message } from '../../types/message.js'
import { getGlobalConfig } from '../../utils/config.js'
import { getContextWindowForModel } from '../../utils/context.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { hasExactErrorMessage } from '../../utils/errors.js'
import type { CacheSafeParams } from '../../utils/forkedAgent.js'
import { logError } from '../../utils/log.js'
import { tokenCountWithEstimation } from '../../utils/tokens.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import { getMaxOutputTokensForModel } from '../api/claude.js'
import { notifyCompaction } from '../api/promptCacheBreakDetection.js'
import { setLastSummarizedMessageId } from '../SessionMemory/sessionMemoryUtils.js'
import {
  type CompactionResult,
  compactConversation,
  ERROR_MESSAGE_USER_ABORT,
  type RecompactionInfo,
} from './compact.js'
import { runPostCompactCleanup } from './postCompactCleanup.js'
import { trySessionMemoryCompaction } from './sessionMemoryCompact.js'

// 在压缩期间为输出预留这么多 token。基于压缩摘
// 要输出的 p99.99 为 17,387 个 token。
const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000

// 返回上下文窗口大小减去模型的最大输出 token 数
export function getEffectiveContextWindowSize(model: string): number {
  const reservedTokensForSummary = Math.min(
    getMaxOutputTokensForModel(model),
    MAX_OUTPUT_TOKENS_FOR_SUMMARY,
  )
  let contextWindow = getContextWindowForModel(model, getSdkBetas())

  const autoCompactWindow = process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW
  if (autoCompactWindow) {
    const parsed = parseInt(autoCompactWindow, 10)
    if (!isNaN(parsed) && parsed > 0) {
      contextWindow = Math.min(contextWindow, parsed)
    }
  }

  return contextWindow - reservedTokensForSummary
}

export type AutoCompactTrackingState = {
  compacted: boolean
  turnCounter: number
  // 每轮对话的唯一 ID
  turnId: string
  // 连续自动压缩失败次数。成功时重置。用作
  // 断路器，当上下文不可恢复地超出限制（例如 pr
  // ompt_too_long）时停止重试。
  consecutiveFailures?: number
}

export const AUTOCOMPACT_BUFFER_TOKENS = 13_000
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000

// Conservative estimate for tool result growth per turn.
// Typical tool results (file reads, grep, bash) average ~5-10K tokens;
// occasional large reads can spike to 20K+.
const TOOL_RESULT_GROWTH_ESTIMATE = 15_000

/**
 * Context-aware autocompact buffer. Larger context windows need more
 * headroom because a single turn can produce proportionally more tokens
 * (longer model outputs + larger tool results).
 */
export function getAutocompactBufferTokens(model: string): number {
  const effectiveWindow = getEffectiveContextWindowSize(model)
  if (effectiveWindow >= 800_000) return 50_000
  if (effectiveWindow >= 400_000) return 30_000
  return AUTOCOMPACT_BUFFER_TOKENS
}

/**
 * Estimate the maximum token growth a single turn can produce.
 * Used for predictive autocompact checks before the API call.
 */
export function estimateMaxTurnGrowth(model: string): number {
  const maxOutput = Math.min(
    getMaxOutputTokensForModel(model),
    MAX_OUTPUT_TOKENS_FOR_SUMMARY,
  )
  return maxOutput + TOOL_RESULT_GROWTH_ESTIMATE
}

// Stop trying autocompact after this many consecutive failures.
// BQ 2026-03-10: 1,279 sessions had 50+ consecutive failures (up to 3,272)
// in a single session, wasting ~250K API calls/day globally.
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3

export function getAutoCompactThreshold(model: string): number {
  const effectiveContextWindow = getEffectiveContextWindowSize(model)

  const autocompactThreshold =
    effectiveContextWindow - getAutocompactBufferTokens(model)

  // 覆盖以方便测试自动压缩
  const envPercent = process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
  if (envPercent) {
    const parsed = parseFloat(envPercent)
    if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
      const percentageThreshold = Math.floor(
        effectiveContextWindow * (parsed / 100),
      )
      return Math.min(percentageThreshold, autocompactThreshold)
    }
  }

  return autocompactThreshold
}

export function calculateTokenWarningState(
  tokenUsage: number,
  model: string,
): {
  percentLeft: number
  isAboveWarningThreshold: boolean
  isAboveErrorThreshold: boolean
  isAboveAutoCompactThreshold: boolean
  isAtBlockingLimit: boolean
} {
  const autoCompactThreshold = getAutoCompactThreshold(model)
  const threshold = isAutoCompactEnabled()
    ? autoCompactThreshold
    : getEffectiveContextWindowSize(model)

  const percentLeft = Math.max(
    0,
    Math.round(((threshold - tokenUsage) / threshold) * 100),
  )

  const warningThreshold = threshold - WARNING_THRESHOLD_BUFFER_TOKENS
  const errorThreshold = threshold - ERROR_THRESHOLD_BUFFER_TOKENS

  const isAboveWarningThreshold = tokenUsage >= warningThreshold
  const isAboveErrorThreshold = tokenUsage >= errorThreshold

  const isAboveAutoCompactThreshold =
    isAutoCompactEnabled() && tokenUsage >= autoCompactThreshold

  const actualContextWindow = getEffectiveContextWindowSize(model)
  const defaultBlockingLimit =
    actualContextWindow - MANUAL_COMPACT_BUFFER_TOKENS

  // 允许覆盖以进行测试
  const blockingLimitOverride = process.env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE
  const parsedOverride = blockingLimitOverride
    ? parseInt(blockingLimitOverride, 10)
    : NaN
  const blockingLimit =
    !isNaN(parsedOverride) && parsedOverride > 0
      ? parsedOverride
      : defaultBlockingLimit

  const isAtBlockingLimit = tokenUsage >= blockingLimit

  return {
    percentLeft,
    isAboveWarningThreshold,
    isAboveErrorThreshold,
    isAboveAutoCompactThreshold,
    isAtBlockingLimit,
  }
}

export function isAutoCompactEnabled(): boolean {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) {
    return false
  }
  // 允许仅禁用自动压缩（保留手动 /compact 功能）
  if (isEnvTruthy(process.env.DISABLE_AUTO_COMPACT)) {
    return false
  }
  // 检查用户是否在其设置中禁用了自动压缩
  const userConfig = getGlobalConfig()
  return userConfig.autoCompactEnabled
}

export async function shouldAutoCompact(
  messages: Message[],
  model: string,
  querySource?: QuerySource,
  // Snip 会移除消息，但保留的助手的用量仍然反映 snip 之前的上下
  // 文，因此 tokenCountWithEstimation 无法看
  // 到节省量。减去 snip 已经计算出的粗略差值。
  snipTokensFreed = 0,
): Promise<boolean> {
  // 递归保护。session_memory 和 compact 是分叉的代
  // 理，会导致死锁。
  if (querySource === 'session_memory' || querySource === 'compact') {
    return false
  }
  // marble_origami 是上下文代理——如果它的上下文爆炸并触发
  // 了自动压缩，runPostCompactCleanup 会调用 resetCon
  // textCollapse()，这会销毁主线程的已提交日志（跨分叉共享的模块级
  // 状态）。位于 feature() 内部，因此该字符串会从外部构建中消除（
  // 它位于 excluded-strings.txt 中）。
  if (feature('CONTEXT_COLLAPSE')) {
    if (querySource === 'marble_origami') {
      return false
    }
  }

  if (!isAutoCompactEnabled()) {
    return false
  }

  // 仅响应模式：抑制主动自动压缩，让响应式压缩捕获 API 的 prompt-to
  // o-long。feature() 包装器使该标志字符串不进入外部构建（REAC
  // TIVE_COMPACT 仅限 ant）。注意：在此处返回
  // false 也意味着 autoCompactIfNeeded 永远不会到达
  // 查询循环中的 trySessionMemoryCompaction——/c
  // ompact 调用点仍然会先尝试会话内存。如果仅响应模式升级，请重新审视。
  if (feature('REACTIVE_COMPACT')) {
    if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_cobalt_raccoon', false)) {
      return false
    }
  }

  // 上下文折叠模式：同样的抑制。当折叠开启时，它就是上下文管理系统—
  // —90% 提交 / 95% 阻塞生成流程负责处理余量问题。自动压缩在
  // 有效 13k（约有效值的 93%）处触发，正好位于折叠的提交开始（
  // 90%）和阻塞（95%）之间，因此它会与折叠竞争并且通常会获胜，从而
  // 破坏折叠即将保存的精细上下文。在此处而非 isAutoCompact
  // Enabled() 中进行门控，可以保持 reactiveCompa
  // ct 作为 413 回退机制处于活动状态（它直接查询 isAutoC
  // ompactEnabled），并保留 sessionMemor
  // y 和手动 /compact 功能。
  //
  // 查询 isContextCollapseEnabled（而非原始门控），以
  // 便 CLAUDE_CONTEXT_COLLAPSE 环境变量覆盖在此处也生效。块内的
  // require() 打破了初始化时的循环（此文件导出了 collapse 的 i
  // ndex 导入的 getEffectiveContextWindowSize）。
  if (feature('CONTEXT_COLLAPSE')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { isContextCollapseEnabled } =
      require('../contextCollapse/index.js') as typeof import('../contextCollapse/index.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    if (isContextCollapseEnabled()) {
      return false
    }
  }

  const tokenCount = tokenCountWithEstimation(messages) - snipTokensFreed
  const threshold = getAutoCompactThreshold(model)
  const effectiveWindow = getEffectiveContextWindowSize(model)

  logForDebugging(
    `自动压缩：tokens=${tokenCount} threshold=${threshold} effectiveWindow=${effectiveWindow}${snipTokensFreed > 0 ? ` snipFreed=${snipTokensFreed}` : ''}`,
  )

  const { isAboveAutoCompactThreshold } = calculateTokenWarningState(
    tokenCount,
    model,
  )

  return isAboveAutoCompactThreshold
}

export async function autoCompactIfNeeded(
  messages: Message[],
  toolUseContext: ToolUseContext,
  cacheSafeParams: CacheSafeParams,
  querySource?: QuerySource,
  tracking?: AutoCompactTrackingState,
  snipTokensFreed?: number,
): Promise<{
  wasCompacted: boolean
  compactionResult?: CompactionResult
  consecutiveFailures?: number
}> {
  if (isEnvTruthy(process.env.DISABLE_COMPACT)) {
    return { wasCompacted: false }
  }

  // 断路器：在连续失败 N 次后停止重试。没
  // 有这个，上下文不可恢复地超出限制的会话会在每一
  // 轮都使用注定失败的压缩尝试来冲击 API。
  if (
    tracking?.consecutiveFailures !== undefined &&
    tracking.consecutiveFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES
  ) {
    return { wasCompacted: false }
  }

  const model = toolUseContext.options.mainLoopModel
  const shouldCompact = await shouldAutoCompact(
    messages,
    model,
    querySource,
    snipTokensFreed,
  )

  if (!shouldCompact) {
    return { wasCompacted: false }
  }

  const recompactionInfo: RecompactionInfo = {
    isRecompactionInChain: tracking?.compacted === true,
    turnsSincePreviousCompact: tracking?.turnCounter ?? -1,
    previousCompactTurnId: tracking?.turnId,
    autoCompactThreshold: getAutoCompactThreshold(model),
    querySource,
  }

  // 实验：先尝试会话内存压缩
  const sessionMemoryResult = await trySessionMemoryCompaction(
    messages,
    toolUseContext.agentId,
    recompactionInfo.autoCompactThreshold,
  )
  if (sessionMemoryResult) {
    // 重置 lastSummarizedMessageId，因为会话内存压
    // 缩会修剪消息，并且在 REPL 替换消息后旧的 UUID 将不再存在
    setLastSummarizedMessageId(undefined)
    runPostCompactCleanup(querySource)
    // 重置缓存读取基线，以便压缩后的下降不会被标记为中断。compactConversation
    // 内部执行此操作；SM-compact 不执行。BQ 2026-03-01：缺少此操作导致
    // 20% 的 tengu_prompt_cache_break 事件成为误报（systemPr
    // omptChanged=true, timeSinceLastAssistantMsg=-1）。
    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      notifyCompaction(querySource ?? 'compact', toolUseContext.agentId)
    }
    markPostCompaction()
    return {
      wasCompacted: true,
      compactionResult: sessionMemoryResult,
    }
  }
  /**
   * 以下是传统压缩流程。
   */
  try {
    const compactionResult = await compactConversation(
      messages,
      toolUseContext,
      cacheSafeParams,
      true, // 抑制自动压缩的用户问题
      undefined, // 自动压缩无自定义指令
      true, // isAutoCompact
      recompactionInfo,
    )

    // 重置 lastSummarizedMessageId，因为旧版压缩会
    // 替换所有消息，并且旧的消息 UUID 将不再存在于新的消息数组中
    setLastSummarizedMessageId(undefined)
    runPostCompactCleanup(querySource)

    return {
      wasCompacted: true,
      compactionResult,
      // 成功时重置失败计数
      consecutiveFailures: 0,
    }
  } catch (error) {
    if (!hasExactErrorMessage(error, ERROR_MESSAGE_USER_ABORT)) {
      logError(error)
    }
    // 为断路器增加连续失败计数。调用者通过 aut
    // oCompactTracking 传递此值，以
    // 便下一个查询循环迭代可以跳过徒劳的重试尝试。
    const prevFailures = tracking?.consecutiveFailures ?? 0
    const nextFailures = prevFailures + 1
    if (nextFailures >= MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES) {
      logForDebugging(
        `自动压缩：断路器在连续 ${nextFailures} 次失败后触发——跳过本次会话的后续尝试`,
        { level: 'warn' },
      )
    }
    return { wasCompacted: false, consecutiveFailures: nextFailures }
  }
}
