import { feature } from 'bun:bundle'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { QuerySource } from '../../constants/querySource.js'
import type { ToolUseContext } from '../../Tool.js'
import { FILE_EDIT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/GrepTool/prompt.js'
import { WEB_FETCH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/WebFetchTool/prompt.js'
import { WEB_SEARCH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/WebSearchTool/prompt.js'
import type { Message } from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import { getMainLoopModel } from '../../utils/model/model.js'
import { SHELL_TOOL_NAMES } from '../../utils/shell/shellToolUtils.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import { notifyCacheDeletion } from '../api/promptCacheBreakDetection.js'
import { roughTokenCountEstimation } from '../tokenEstimation.js'
import {
  clearCompactWarningSuppression,
  suppressCompactWarning,
} from './compactWarningState.js'
import {
  getTimeBasedMCConfig,
  type TimeBasedMCConfig,
} from './timeBasedMCConfig.js'

// 内联自 utils/toolResultStorage.ts — 导入该文件会引
// 入 sessionStorage → utils/messages → ser
// vices/api/errors，通过 promptCacheBreakDetect
// ion 形成一个循环依赖回到此文件。通过一个断言与事实来源相等的测试来捕获漂移。
export const TIME_BASED_MC_CLEARED_MESSAGE = '[旧的工具结果内容已清除]'

const IMAGE_MAX_TOKEN_SIZE = 2000

// 仅压缩这些工具
const COMPACTABLE_TOOLS = new Set<string>([
  FILE_READ_TOOL_NAME,
  ...SHELL_TOOL_NAMES,
  GREP_TOOL_NAME,
  GLOB_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  FILE_EDIT_TOOL_NAME,
  FILE_WRITE_TOOL_NAME,
])

// --- 缓存的微压缩状态（仅限 ant，由 feature('CACHED_MICROCOMPACT') 控制） ---

// 延迟初始化缓存的 MC 模块和状态，以避免在外部构建中导入。导入
// 和状态位于 feature() 检查内部，以便进行死代码消除。
let cachedMCModule: typeof import('./cachedMicrocompact.js') | null = null
let cachedMCState: import('./cachedMicrocompact.js').CachedMCState | null = null
let pendingCacheEdits:
  | import('./cachedMicrocompact.js').CacheEditsBlock
  | null = null

async function getCachedMCModule(): Promise<
  typeof import('./cachedMicrocompact.js')
> {
  if (!cachedMCModule) {
    cachedMCModule = await import('./cachedMicrocompact.js')
  }
  return cachedMCModule
}

function ensureCachedMCState(): import('./cachedMicrocompact.js').CachedMCState {
  if (!cachedMCState && cachedMCModule) {
    cachedMCState = cachedMCModule.createCachedMCState()
  }
  if (!cachedMCState) {
    throw new Error('cachedMCState 未初始化 — 必须先调用 getCachedMCModule()')
  }
  return cachedMCState
}

/** 获取要包含在下一次 API 请求中的新待处理缓存编辑。
如果没有新的待处理编辑，则返回 null。
清除待处理状态（调用者必须在插入后固定它们）。 */
export function consumePendingCacheEdits():
  | import('./cachedMicrocompact.js').CacheEditsBlock
  | null {
  const edits = pendingCacheEdits
  pendingCacheEdits = null
  return edits
}

/** 获取所有先前固定的缓存编辑，这些编辑必须在其原始位置重新发送以实现缓存命中。 */
export function getPinnedCacheEdits(): import('./cachedMicrocompact.js').PinnedCacheEdits[] {
  if (!cachedMCState) {
    return []
  }
  return cachedMCState.pinnedEdits
}

/** 将新的 cache_edits 块固定到特定的用户消息位置。
在插入新编辑后调用，以便它们在后续调用中重新发送。 */
export function pinCacheEdits(
  userMessageIndex: number,
  block: import('./cachedMicrocompact.js').CacheEditsBlock,
): void {
  if (cachedMCState) {
    cachedMCState.pinnedEdits.push({ userMessageIndex, block })
  }
}

/** 将所有已注册的工具标记为已发送给 API。
在成功的 API 响应后调用。 */
export function markToolsSentToAPIState(): void {
  if (cachedMCState && cachedMCModule) {
    cachedMCModule.markToolsSentToAPI(cachedMCState)
  }
}

export function resetMicrocompactState(): void {
  if (cachedMCState && cachedMCModule) {
    cachedMCModule.resetCachedMCState(cachedMCState)
  }
  pendingCacheEdits = null
}

// 计算工具结果 token 的辅助函数
function calculateToolResultTokens(block: ToolResultBlockParam): number {
  if (!block.content) {
    return 0
  }

  if (typeof block.content === 'string') {
    return roughTokenCountEstimation(block.content)
  }

  // TextBlockParam | ImageBlockParam | DocumentBlockParam 数组
  return block.content.reduce((sum, item) => {
    if (item.type === 'text') {
      return sum + roughTokenCountEstimation(item.text)
    } else if (item.type === 'image' || item.type === 'document') {
      // 无论格式如何，图像/文档大约为 2000 个 token
      return sum + IMAGE_MAX_TOKEN_SIZE
    }
    return sum
  }, 0)
}

/** 通过提取文本内容来估算消息的 token 数量。
用于在无法获得准确的 API 计数时进行粗略的 token 估算。
由于是近似估算，将估算值乘以 4/3 以保持保守。 */
export function estimateMessageTokens(messages: Message[]): number {
  let totalTokens = 0

  for (const message of messages) {
    if (message.type !== 'user' && message.type !== 'assistant') {
      continue
    }

    if (!Array.isArray(message.message!.content)) {
      continue
    }

    for (const block of message.message!.content) {
      if (block.type === 'text') {
        totalTokens += roughTokenCountEstimation(block.text)
      } else if (block.type === 'tool_result') {
        totalTokens += calculateToolResultTokens(block)
      } else if (block.type === 'image' || block.type === 'document') {
        totalTokens += IMAGE_MAX_TOKEN_SIZE
      } else if (block.type === 'thinking') {
        // 匹配 roughTokenCountEstimationForBloc
        // k：仅计算思考文本，不计算 JSON 包装器或签名（签名是元数据，不
        // 是模型 token 化的内容）。
        totalTokens += roughTokenCountEstimation(block.thinking)
      } else if (block.type === 'redacted_thinking') {
        totalTokens += roughTokenCountEstimation(block.data)
      } else if (block.type === 'tool_use') {
        // 匹配 roughTokenCountEstimationForBlock：计算名称和
        // 输入，不计算 JSON 包装器或 id 字段。
        totalTokens += roughTokenCountEstimation(
          block.name + jsonStringify(block.input ?? {}),
        )
      } else {
        // server_tool_use, web_search_tool_result 等。
        totalTokens += roughTokenCountEstimation(jsonStringify(block))
      }
    }
  }

  // 由于是近似估算，将估算值乘以 4/3 以保持保守
  return Math.ceil(totalTokens * (4 / 3))
}

export type PendingCacheEdits = {
  trigger: 'auto'
  deletedToolIds: string[] //本轮打算通过缓存编辑删掉哪些 tool_use_id
  // 来自前一个 API 响应的基线累积 cache_deleted_inpu
  // t_tokens，用于计算每次操作的增量（API 值是粘性的/累积的）
  baselineCacheDeletedTokens: number //发请求前，从上一条 assistant 的 usage 里读到的累积 cache_deleted_input_tokens，用作基线
}

export type MicrocompactResult = {
  messages: Message[]
  compactionInfo?: {
    pendingCacheEdits?: PendingCacheEdits
  }
  // Tool use IDs whose content was replaced with the cleared message.
  // Callers should remove these from contentReplacementState.replacements
  // to release the original strings from memory.
  clearedToolUseIds?: string[]
}

/** 遍历消息并收集工具名称在 COMPACTABLE_TOOLS 中的 tool_use ID，按遇到顺序排列。两个微压缩路径共享此逻辑。 */
function collectCompactableToolIds(messages: Message[]): string[] {
  const ids: string[] = []
  for (const message of messages) {
    if (
      message.type === 'assistant' &&
      Array.isArray(message.message!.content)
    ) {
      for (const block of message.message!.content) {
        if (block.type === 'tool_use' && COMPACTABLE_TOOLS.has(block.name)) {
          ids.push(block.id)
        }
      }
    }
  }
  return ids
}

// 前缀匹配是因为 promptCategory.ts 在启用非默认输出样式时
// 将 querySource 设置为 'repl_main_thread:output
// Style:<style>'。仅当使用默认样式时，才使用裸的 'repl_main_thr
// ead'。query.ts:350/1451 使用相同的 startsWith
// 模式；预先存在的缓存 MC `=== 'repl_main_thread'` 检查是一
// 个潜在的 bug — 使用非默认输出样式的用户被静默地排除在缓存 MC 之外。
function isMainThreadSource(querySource: QuerySource | undefined): boolean {
  return !querySource || querySource.startsWith('repl_main_thread')
}

export async function microcompactMessages(
  messages: Message[],
  toolUseContext?: ToolUseContext,
  querySource?: QuerySource,
): Promise<MicrocompactResult> {
  // 在新的微压缩尝试开始时清除抑制标志
  clearCompactWarningSuppression()

  // 基于时间的触发器首先运行并短路。如果自最后一条助
  // 手消息以来的间隔超过阈值，则服务器缓存已过期，无论
  // 如何都会重写完整前缀 — 因此现在在请求之前清除
  // 旧的工具结果内容，以缩小重写的内容。当此触发器
  // 触发时，跳过缓存的 MC（缓存编辑）：编辑假设缓
  // 存是热的，而我们刚刚确定它是冷的。
  const timeBasedResult = maybeTimeBasedMicrocompact(messages, querySource)
  if (timeBasedResult) {
    return timeBasedResult
  }

  // 仅对主线程运行缓存的 MC，以防止分叉代理（session
  // _memory, prompt_suggestion 等）
  // 将其 tool_results 注册到全局 cachedMCS
  // tate 中，这会导致主线程尝试删除其自身对话中不存在的工具。
  if (feature('CACHED_MICROCOMPACT')) {
    const mod = await getCachedMCModule()
    const model = toolUseContext?.options.mainLoopModel ?? getMainLoopModel()
    if (
      mod.isCachedMicrocompactEnabled() &&
      mod.isModelSupportedForCacheEditing(model) &&
      isMainThreadSource(querySource)
    ) {
      return await cachedMicrocompactPath(messages, querySource)
    }
  }

  // 旧的微压缩路径已移除 — tengu_cache_plum_vi
  // olet 始终为 true。对于缓存微压缩不可用的上下文（外部构
  // 建、非 ant 用户、不支持的模型、子代理），此处不进行压缩；au
  // tocompact 会处理上下文压力。
  return { messages }
}

/** 缓存微压缩路径 — 使用缓存编辑 API 移除工具结果，而不会使缓存前缀失效。

与常规微压缩的主要区别：
- 不修改本地消息内容（cache_reference 和 cache_edits 在 API 层添加）
- 使用来自 GrowthBook 配置的基于计数的触发/保留阈值
- 优先于常规微压缩（无磁盘持久化）
- 跟踪工具结果并为 API 层排队缓存编辑 */
async function cachedMicrocompactPath(
  messages: Message[],
  querySource: QuerySource | undefined,
): Promise<MicrocompactResult> {
  const mod = await getCachedMCModule()
  const state = ensureCachedMCState()
  const config = mod.getCachedMCConfig()

  const compactableToolIds = new Set(collectCompactableToolIds(messages))
  // 第二遍：按用户消息分组注册工具结果
  for (const message of messages) {
    if (message.type === 'user' && Array.isArray(message.message!.content)) {
      const groupIds: string[] = []
      for (const block of message.message!.content) {
        if (
          block.type === 'tool_result' &&
          compactableToolIds.has(block.tool_use_id) &&
          !state.registeredTools.has(block.tool_use_id)
        ) {
          mod.registerToolResult(state, block.tool_use_id)
          groupIds.push(block.tool_use_id)
        }
      }
      mod.registerToolMessage(state, groupIds)
    }
  }

  const toolsToDelete = mod.getToolResultsToDelete(state)

  if (toolsToDelete.length > 0) {
    // 创建并排队 API 层的 cache_edits 块
    const cacheEdits = mod.createCacheEditsBlock(state, toolsToDelete)
    if (cacheEdits) {
      pendingCacheEdits = cacheEdits
    }

    logForDebugging(
      `缓存 MC 正在删除 ${toolsToDelete.length} 个工具：${toolsToDelete.join(', ')}`,
    )

    // 记录事件
    logEvent('tengu_cached_microcompact', {
      toolsDeleted: toolsToDelete.length,
      deletedToolIds: toolsToDelete.join(
        ',',
      ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      activeToolCount: state.toolOrder.length - state.deletedRefs.size,
      triggerType:
        'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      threshold: config.triggerThreshold,
      keepRecent: config.keepRecent,
    })

    // 在成功压缩后抑制警告
    suppressCompactWarning()

    // 通知缓存中断检测，缓存读取将合法地下降
    if (feature('PROMPT_CACHE_BREAK_DETECTION')) {
      // 传递实际的 querySource — isMainThreadSource 现在进
      // 行前缀匹配，因此输出样式变体会进入此处，而 getTrackingKey 基于完整的
      // 源字符串（而非 'repl_main_thread' 前缀）进行键控。
      notifyCacheDeletion(querySource ?? 'repl_main_thread')
    }

    // 返回未更改的消息 — cache_reference 和 cache_edits
    // 在 API 层添加。边界消息延迟到 API 响应之后，以便使用来
    // 自 API 的实际 cache_deleted_input_tokens 而非
    // 客户端估算。捕获来自最后一条助手消息的基线累积 cache_delet
    // ed_input_tokens，以便在 API 调用后计算每次操作的增量。
    const lastAsst = messages.findLast(m => m.type === 'assistant')
    const baseline =
      lastAsst?.type === 'assistant'
        ? ((
            lastAsst.message!.usage as unknown as Record<
              string,
              number | undefined
            >
          )?.cache_deleted_input_tokens ?? 0)
        : 0

    return {
      messages,
      compactionInfo: {
        pendingCacheEdits: {
          trigger: 'auto',
          deletedToolIds: toolsToDelete,
          baselineCacheDeletedTokens: baseline,
        },
      },
    }
  }

  // 无需压缩，返回未更改的消息
  return { messages }
}

/** 基于时间的微压缩：当自上次主循环助手消息以来的间隔超过配置的阈值时，清除除最近 N 个可压缩工具结果之外的所有内容。

当触发器未触发时返回 null（禁用、源错误、间隔低于阈值、无内容可清除）— 调用者会回退到其他路径。

与缓存 MC 不同，这会直接修改消息内容。缓存是冷的，因此没有要通过 cache_edits 保留的缓存前缀。 */
/** 检查是否应为该请求触发基于时间的触发器。

当触发器触发时返回测量的间隔（自上次助手消息以来的分钟数），否则返回 null（禁用、源错误、低于阈值、无先前的助手、时间戳无法解析）。

提取出来以便其他预请求路径（例如 snip force-apply）可以查询相同的谓词，而无需耦合到工具结果清除操作。 */
export function evaluateTimeBasedTrigger(
  messages: Message[],
  querySource: QuerySource | undefined,
): { gapMinutes: number; config: TimeBasedMCConfig } | null {
  const config = getTimeBasedMCConfig()
  // 需要显式的主线程 querySource。isMainThreadSource 将
  // undefined 视为主线程（为了缓存 MC 的向后兼容性），但多个调用者（
  // /context, /compact, analyzeContext）仅出于分析目的
  // 调用 microcompactMessages 而没有提供源 — 它们不应触发。
  if (!config.enabled || !querySource || !isMainThreadSource(querySource)) {
    return null
  }
  const lastAssistant = messages.findLast(m => m.type === 'assistant')
  if (!lastAssistant) {
    return null
  }
  const gapMinutes =
    (Date.now() -
      new Date(lastAssistant.timestamp as string | number).getTime()) /
    60_000
  if (!Number.isFinite(gapMinutes) || gapMinutes < config.gapThresholdMinutes) {
    return null
  }
  return { gapMinutes, config }
}

function maybeTimeBasedMicrocompact(
  messages: Message[],
  querySource: QuerySource | undefined,
): MicrocompactResult | null {
  const trigger = evaluateTimeBasedTrigger(messages, querySource)
  if (!trigger) {
    return null
  }
  const { gapMinutes, config } = trigger

  const compactableIds = collectCompactableToolIds(messages)

  // 下限为 1：slice(-0) 返回完整数组（矛盾
  // 地保留了所有内容），而清除所有结果会使模型的工作上下文为
  // 零。这两种退化情况都不合理 — 始终至少保留最后一个。
  const keepRecent = Math.max(1, config.keepRecent)
  const keepSet = new Set(compactableIds.slice(-keepRecent))
  const clearSet = new Set(compactableIds.filter(id => !keepSet.has(id)))

  if (clearSet.size === 0) {
    return null
  }

  let tokensSaved = 0
  const result: Message[] = messages.map(message => {
    if (message.type !== 'user' || !Array.isArray(message.message!.content)) {
      return message
    }
    let touched = false
    const newContent = message.message!.content.map(block => {
      if (
        block.type === 'tool_result' &&
        clearSet.has(block.tool_use_id) &&
        block.content !== TIME_BASED_MC_CLEARED_MESSAGE
      ) {
        tokensSaved += calculateToolResultTokens(block)
        touched = true
        return { ...block, content: TIME_BASED_MC_CLEARED_MESSAGE }
      }
      return block
    })
    if (!touched) return message
    return {
      ...message,
      message: { ...message.message, content: newContent },
    }
  })

  if (tokensSaved === 0) {
    return null
  }

  logEvent('tengu_time_based_microcompact', {
    gapMinutes: Math.round(gapMinutes),
    gapThresholdMinutes: config.gapThresholdMinutes,
    toolsCleared: clearSet.size,
    toolsKept: keepSet.size,
    keepRecent: config.keepRecent,
    tokensSaved,
  })

  logForDebugging(
    `[基于时间的 MC] 间隔 ${Math.round(gapMinutes)} 分钟 > ${config.gapThresholdMinutes} 分钟，清除了 ${clearSet.size} 个工具结果（约 ${tokensSaved} 个 token），保留了最后 ${keepSet.size} 个`,
  )

  suppressCompactWarning()
  // 缓存 MC 状态（模块级别）保存了先前轮次注册的工具
  // ID。我们刚刚内容清除了其中一些工具，并通过更改提
  // 示内容使服务器缓存失效。如果缓存 MC 在下一轮使用
  // 过时状态运行，它将尝试缓存编辑那些服务器端条目已不存
  // 在的工具。重置它。
  resetMicrocompactState()
  // 我们刚刚更改了提示内容 — 下一个响应的缓存读取将很低，但这是我们的操
  // 作，而非中断。通知检测器预期下降。使用 notifyCacheDel
  // etion（而非 notifyCompaction），因为它已在此处导
  // 入，并且可以实现相同的误报抑制 — 将第二个符号添加到导入会被循环依赖
  // 检查标记。传递实际的 querySource：getTra
  // ckingKey 返回完整的源字符串（例如 'repl_main_thr
  // ead:outputStyle:custom'），而不仅仅是前缀。
  if (feature('PROMPT_CACHE_BREAK_DETECTION') && querySource) {
    notifyCacheDeletion(querySource)
  }

  return { messages: result, clearedToolUseIds: [...clearSet] }
}
