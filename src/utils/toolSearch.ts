/**
 * Tool Search utilities for dynamically discovering deferred tools.
 *
 * When enabled, deferred tools (MCP and shouldDefer tools) are sent with
 * defer_loading: true and discovered via ToolSearchTool rather than being
 * loaded upfront.
 */

import memoize from 'lodash-es/memoize.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import type { Tool } from '../Tool.js'
import {
  type ToolPermissionContext,
  type Tools,
  toolMatchesName,
} from '../Tool.js'
import type { AgentDefinition } from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import {
  formatDeferredToolLine,
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME,
} from '@claude-code-best/builtin-tools/tools/ToolSearchTool/prompt.js'
import type { Message } from '../types/message.js'
import {
  countToolDefinitionTokens,
  TOOL_TOKEN_COUNT_OVERHEAD,
} from './analyzeContext.js'
import { count } from './array.js'
import { getMergedBetas } from './betas.js'
import { getContextWindowForModel } from './context.js'
import { logForDebugging } from './debug.js'
import { isEnvDefinedFalsy, isEnvTruthy } from './envUtils.js'
import {
  getAPIProvider,
  isFirstPartyAnthropicBaseUrl,
} from './model/providers.js'
import { jsonStringify } from './slowOperations.js'
import { zodToJsonSchema } from './zodToJsonSchema.js'

/**
 * 自动启用工具搜索的上下文窗口默认占比阈值。
 * 当 MCP 工具描述所占的 token 超过该百分比时，将启用工具搜索。
 * 可以通过 ENABLE_TOOL_SEARCH=auto:N 覆盖该值，其中 N 的范围为 0-100。
 */
const DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE = 10 // 10%

/**
 * 从 ENABLE_TOOL_SEARCH 环境变量中解析 auto:N 语法。
 * 返回限制在 0-100 范围内的百分比；
 * 如果不是 auto:N 格式或 N 不是数字，则返回 null。
 */
function parseAutoPercentage(value: string): number | null {
  if (!value.startsWith('auto:')) return null

  const percentStr = value.slice(5)
  const percent = parseInt(percentStr, 10)

  if (isNaN(percent)) {
    logForDebugging(
      `Invalid ENABLE_TOOL_SEARCH value "${value}": expected auto:N where N is a number.`,
    )
    return null
  }

  // Clamp to valid range
  return Math.max(0, Math.min(100, percent))
}

/**
 * 检查 ENABLE_TOOL_SEARCH 是否被设置为自动模式（auto 或 auto:N）。
 */
function isAutoToolSearchMode(value: string | undefined): boolean {
  if (!value) return false
  return value === 'auto' || value.startsWith('auto:')
}

/**
 * 从环境变量或默认值中获取自动启用的百分比。
 */

function getAutoToolSearchPercentage(): number {
  const value = process.env.ENABLE_TOOL_SEARCH
  if (!value) return DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE

  if (value === 'auto') return DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE

  const parsed = parseAutoPercentage(value)
  if (parsed !== null) return parsed

  return DEFAULT_AUTO_TOOL_SEARCH_PERCENTAGE
}

/**
 * MCP 工具定义（名称 + 描述 + 输入 schema）的每个 token 对应的字符数近似值。
 * 在无法使用 token 计数 API 时作为兜底估算使用。
 */
const CHARS_PER_TOKEN = 2.5

/**
 * 获取给定模型自动启用工具搜索的令牌阈值。
 */
function getAutoToolSearchTokenThreshold(model: string): number {
  const betas = getMergedBetas(model)
  const contextWindow = getContextWindowForModel(model, betas)
  const percentage = getAutoToolSearchPercentage() / 100
  return Math.floor(contextWindow * percentage)
}

/**
* 获取给定模型自动启用工具搜索的字符阈值。
* 当词元计数 API 不可用时，用作备用方案。
*/
export function getAutoToolSearchCharThreshold(model: string): number {
  return Math.floor(getAutoToolSearchTokenThreshold(model) * CHARS_PER_TOKEN)
}

/**
* 使用Token计数 API 获取所有延迟工具的总Token数。
* 按延迟工具名称缓存——当 MCP 服务器连接/断开连接时，缓存将失效。
* 如果 API 不可用，则返回 null（调用者应回退到字符启发式方法）。
*/
const getDeferredToolTokenCount = memoize(
  async (
    tools: Tools,
    getToolPermissionContext: () => Promise<ToolPermissionContext>,
    agents: AgentDefinition[],
    model: string,
  ): Promise<number | null> => {
    const deferredTools = tools.filter(t => isDeferredTool(t))
    if (deferredTools.length === 0) return 0

    try {
      const total = await countToolDefinitionTokens(
        deferredTools,
        getToolPermissionContext,
        { activeAgents: agents, allAgents: agents },
        model,
      )
      if (total === 0) return null // API unavailable
      return Math.max(0, total - TOOL_TOKEN_COUNT_OVERHEAD)
    } catch {
      return null // Fall back to char heuristic
    }
  },
  (tools: Tools) =>
    tools
      .filter(t => isDeferredTool(t))
      .map(t => t.name)
      .join(','),
)

/**
 * 工具搜索模式。决定可延迟工具（MCP + shouldDefer）的呈现方式：
 *   - 'tst'：工具搜索工具模式 —— 通过 ToolSearchTool 发现延迟工具（始终启用）
 *   - 'tst-auto'：自动模式 —— 仅在工具超过阈值时才延迟
 *   - 'standard'：工具搜索禁用 —— 所有工具内联暴露
 */
export type ToolSearchMode = 'tst' | 'tst-auto' | 'standard'

/**
 * 根据 ENABLE_TOOL_SEARCH 确定工具搜索模式。
 *
 *   ENABLE_TOOL_SEARCH    模式
 *   auto / auto:1-99      tst-auto
 *   true / auto:0         tst
 *   false / auto:100      standard
 *   (未设置)               tst（默认：始终延迟 MCP 和 shouldDefer 工具）
 */
export function getToolSearchMode(): ToolSearchMode {
  // CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS 是 beta API 功能的总开关。
  // 工具搜索会在工具定义上输出 defer_loading 以及 tool_reference 内容块 —— 这两者都需要 API 接受 beta 标头。
  // 当设置总开关时，强制使用 'standard' 模式，这样即使设置了 ENABLE_TOOL_SEARCH，也不会发送任何 beta 形状的数据。
  // 这是针对代理网关的显式逃生舱口，isToolSearchEnabledOptimistic 中的启发式规则无法覆盖此类网关。
  // github.com/anthropics/claude-code/issues/20031
  if (isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS)) {
    return 'standard'
  }

  const value = process.env.ENABLE_TOOL_SEARCH

  // 处理 auto:N 语法 - 先检查边界情况
  const autoPercent = value ? parseAutoPercentage(value) : null
  if (autoPercent === 0) return 'tst' // auto:0 = 始终启用
  if (autoPercent === 100) return 'standard'
  if (isAutoToolSearchMode(value)) {
    return 'tst-auto' // auto 或 auto:1-99
  }

  if (isEnvTruthy(value)) return 'tst'
  if (isEnvDefinedFalsy(process.env.ENABLE_TOOL_SEARCH)) return 'standard'
  return 'tst' // 默认：始终延迟 MCP 和 shouldDefer 工具
}

/**
* 不支持 tool_reference 的模型的默认模式。
* 除非此处明确列出，否则新模型默认支持 tool_reference。
*/
const DEFAULT_UNSUPPORTED_MODEL_PATTERNS = ['haiku']

/**
* 获取不支持 tool_reference 的模型模式列表。
* 可通过 GrowthBook 进行配置，实现实时更新，无需更改代码。
*/
function getUnsupportedToolReferencePatterns(): string[] {
  try {
    // 尝试从 GrowthBook 获取实时配置信息
    const patterns = getFeatureValue_CACHED_MAY_BE_STALE<string[] | null>(
      'tengu_tool_search_unsupported_models',
      null,
    )
    if (patterns && Array.isArray(patterns) && patterns.length > 0) {
      return patterns
    }
  } catch {
    // GrowthBook 尚未准备就绪，请使用默认设置。
  }
  return DEFAULT_UNSUPPORTED_MODEL_PATTERNS
}

/**
 * 检查模型是否支持 tool_reference 块（工具搜索所需）。
 *
 * 本函数采用否定测试：模型默认假定支持 tool_reference，
 * 除非它们匹配不支持列表中的某个模式。这确保了新模型无需修改代码即可默认正常工作。
 *
 * 目前，Haiku 模型不支持 tool_reference。此配置可通过 GrowthBook 特性 'tengu_tool_search_unsupported_models' 更新。
 *
 * @param model 待检查的模型名称
 * @returns 若模型支持 tool_reference 则返回 true，否则返回 false
 */
export function modelSupportsToolReference(model: string): boolean {
  const normalizedModel = model.toLowerCase()
  const unsupportedPatterns = getUnsupportedToolReferencePatterns()

  // 检查模型是否匹配任何不支持的模式
  for (const pattern of unsupportedPatterns) {
    if (normalizedModel.includes(pattern.toLowerCase())) {
      return false
    }
  }

  // 新模型假定支持工具参考
  return true
}

/**
* 检查工具搜索*可能*已启用（乐观检查）。
*
* 如果工具搜索有可能已启用，则返回 true，而不检查
* 动态因素，例如模型支持或阈值。此方法可用于：
* - 将 ToolSearchTool 包含在基础工具中（以便在需要时可用）
* - 保留消息中的 tool_reference 字段（稍后可以删除）
* - 检查 ToolSearchTool 是否应报告自身已启用
*
* 仅当工具搜索已完全禁用时（标准模式）返回 false。
*
* 对于包含模型支持和阈值的最终检查，
* 请使用 isToolSearchEnabled()。
*/
let loggedOptimistic = false
export function isToolSearchEnabledOptimistic(): boolean {
  const mode = getToolSearchMode()
  if (mode === 'standard') {
    if (!loggedOptimistic) {
      loggedOptimistic = true
      logForDebugging(
        `[ToolSearch:optimistic] mode=${mode}, ENABLE_TOOL_SEARCH=${process.env.ENABLE_TOOL_SEARCH}, result=false`,
      )
    }
    return false
  }

  // tool_reference 是一个 beta 内容类型，第三方 API 网关（ANTHROPIC_BASE_URL 代理）通常不支持。
  // 当 provider 为 'firstParty' 但 base URL 指向其他地址时，代理会拒绝 tool_reference 块并返回 400。
  // Vertex/Bedrock/Foundry 不受影响 —— 它们有自己的端点和 beta 标头。
  // https://github.com/anthropics/claude-code/issues/30912
  //
  // 然而：有些代理确实支持 tool_reference（LiteLLM 透传、Cloudflare AI Gateway、转发 beta 标头的企业网关）。
  // 完全禁用会破坏这些用户的 defer_loading —— 所有 MCP 工具都加载到主上下文而非按需加载（gh-31936 / CC-457，
  // 很可能就是 CC-330 “v2.1.70 defer_loading 回归” 的真正原因）。
  // 此门控仅在 ENABLE_TOOL_SEARCH 未设置/为空时（默认行为）生效。设置任何非空值 —— 'true'、'auto'、'auto:N' ——
  // 意味着用户显式配置了工具搜索，并断言其环境支持该功能。falsy 检查（而不是 === undefined）与 getToolSearchMode()
  // 保持一致，后者也将空字符串视为未设置。
  if (
    !process.env.ENABLE_TOOL_SEARCH &&
    getAPIProvider() === 'firstParty' &&
    !isFirstPartyAnthropicBaseUrl()
  ) {
    if (!loggedOptimistic) {
      loggedOptimistic = true
      logForDebugging(
        `[ToolSearch:optimistic] 已禁用：ANTHROPIC_BASE_URL=${process.env.ANTHROPIC_BASE_URL} 不是第一方 Anthropic 主机。如果您的代理转发 tool_reference 块，请设置 ENABLE_TOOL_SEARCH=true（或 auto / auto:N）。`,
      )
    }
    return false
  }

  if (!loggedOptimistic) {
    loggedOptimistic = true
    logForDebugging(
      `[ToolSearch:optimistic] mode=${mode}, ENABLE_TOOL_SEARCH=${process.env.ENABLE_TOOL_SEARCH}, result=true`,
    )
  }
  return true
}

/**
 * 检查提供的工具列表中是否存在 ToolSearchTool。
 * 如果 ToolSearchTool 不可用（例如通过 disallowedTools 被禁用），则工具搜索无法运行，应予以禁用。
 *
 * 
 * @param tools 包含 name 属性的工具数组
 * @returns 如果工具列表中存在 ToolSearchTool 则返回 true，否则返回 false
 */
export function isToolSearchToolAvailable(
  tools: readonly { name: string }[],
): boolean {
  return tools.some(tool => toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME))
}

/**
 * Calculate total deferred tool description size in characters.
 * Includes name, description text, and input schema to match what's actually sent to the API.
 */
async function calculateDeferredToolDescriptionChars(
  tools: Tools,
  getToolPermissionContext: () => Promise<ToolPermissionContext>,
  agents: AgentDefinition[],
): Promise<number> {
  const deferredTools = tools.filter(t => isDeferredTool(t))
  if (deferredTools.length === 0) return 0

  const sizes = await Promise.all(
    deferredTools.map(async tool => {
      const description = await tool.prompt({
        getToolPermissionContext,
        tools,
        agents,
      })
      const inputSchema = tool.inputJSONSchema
        ? jsonStringify(tool.inputJSONSchema)
        : tool.inputSchema
          ? jsonStringify(zodToJsonSchema(tool.inputSchema))
          : ''
      return tool.name.length + description.length + inputSchema.length
    }),
  )

  return sizes.reduce((total, size) => total + size, 0)
}

/**
* 检查特定请求是否启用了工具搜索（使用 tool_reference 进行 MCP 工具延迟）。
*
* 这是最终检查，包括：
* - MCP 模式（Tst、TstAuto、McpCli、Standard）
* - 模型兼容性（haiku 不支持 tool_reference）
* - ToolSearchTool 的可用性（必须在工具列表中）
* - TstAuto 模式的阈值检查
*
* 在进行实际 API 调用时使用此方法，因为此时所有上下文都可用。
*
* @param model 要检查是否支持 tool_reference 的模型
* @param tools 可用工具数组（包括 MCP 工具）
* @param getToolPermissionContext 获取工具权限上下文的函数
* @param agents 代理定义数组
* @param source 调用者的可选标识符（用于调试）
* @returns 如果应为此请求启用工具搜索，则返回 true
*/
export async function isToolSearchEnabled(
  model: string,
  tools: Tools,
  getToolPermissionContext: () => Promise<ToolPermissionContext>,
  agents: AgentDefinition[],
  source?: string,
): Promise<boolean> {
  const mcpToolCount = count(tools, t => t.isMcp)

  // 记录模式决策事件的辅助函数
  function logModeDecision(
    enabled: boolean,
    mode: ToolSearchMode,
    reason: string,
    extraProps?: Record<string, number>,
  ): void {
    logEvent('tengu_tool_search_mode_decision', {
      enabled,
      mode: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      reason:
        reason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      // 记录正在检查的实际模型，而非会话的主模型。
      // 这对于调试子 agent 工具搜索决策很重要，因为子 agent 模型（例如 haiku）可能与会话模型（例如 opus）不同。
      checkedModel:
        model as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      mcpToolCount,
      userType: (process.env.USER_TYPE ??
        'external') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      ...extraProps,
    })
  }

  // 检查模型是否支持 tool_reference，也就是支持toolsearchTool
  if (!modelSupportsToolReference(model)) {
    logForDebugging(
      `模型 '${model}' 禁用工具搜索：该模型不支持 tool_reference 块。` +
        `此功能仅适用于 Claude Sonnet 4+、Opus 4+ 及更新的模型。`,
    )
    logModeDecision(false, 'standard', 'model_unsupported')
    return false
  }

  // 检查 ToolSearchTool 是否可用（遵循 disallowedTools）
  if (!isToolSearchToolAvailable(tools)) {
    logForDebugging(
      `工具搜索已禁用：ToolSearchTool 不可用（可能已通过 disallowedTools 禁止）。`,
    )
    logModeDecision(false, 'standard', 'mcp_search_unavailable')
    return false
  }

  const mode = getToolSearchMode()

  switch (mode) {
    case 'tst':
      logModeDecision(true, mode, 'tst_enabled')
      return true

    case 'tst-auto': {
      const { enabled, debugDescription, metrics } = await checkAutoThreshold(
        tools,
        getToolPermissionContext,
        agents,
        model,
      )

      if (enabled) {
        logForDebugging(
          `自动工具搜索已启用：${debugDescription}` +
            (source ? ` [来源: ${source}]` : ''),
        )
        logModeDecision(true, mode, 'auto_above_threshold', metrics)
        return true
      }

      logForDebugging(
        `自动工具搜索已禁用：${debugDescription}` +
          (source ? ` [来源: ${source}]` : ''),
      )
      logModeDecision(false, mode, 'auto_below_threshold', metrics)
      return false
    }

    case 'standard':
      logModeDecision(false, mode, 'standard_mode')
      return false
  }
}

/**
* 检查对象是否为 tool_reference 块。
* tool_reference 是一个测试版功能，尚未包含在 SDK 类型中，因此我们需要运行时检查。
*/
export function isToolReferenceBlock(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    (obj as { type: unknown }).type === 'tool_reference'
  )
}

/**
 * 用于判断带有 tool_name 的 tool_reference 块的类型守卫。
 */
function isToolReferenceWithName(
  obj: unknown,
): obj is { type: 'tool_reference'; tool_name: string } {
  return (
    isToolReferenceBlock(obj) &&
    'tool_name' in (obj as object) &&
    typeof (obj as { tool_name: unknown }).tool_name === 'string'
  )
}

/**
 * 表示 content 为数组的 tool_result 块类型。
 * 用于从 ToolSearchTool 的结果中提取 tool_reference 块。
 */
type ToolResultBlock = {
  type: 'tool_result'
  content: unknown[]
}

/**
 * 用于判断 content 为数组的 tool_result 块的类型守卫。
 */
function isToolResultBlockWithContent(obj: unknown): obj is ToolResultBlock {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'type' in obj &&
    (obj as { type: unknown }).type === 'tool_result' &&
    'content' in obj &&
    Array.isArray((obj as { content: unknown }).content)
  )
}

/**
 * 从消息历史中的 tool_reference 块中提取工具名称。
 *
 * 当启用动态工具加载时，MCP 工具不会在 tools 数组中预先声明。
 * 相反，它们通过 ToolSearchTool 被发现，并以 tool_reference 块的形式返回。
 * 该函数会扫描消息历史，收集所有已被引用的工具名称，以便在后续 API 请求中
 * 仅包含这些工具。
 *
 * 这种方式：
 * - 消除了必须预先声明所有 MCP 工具的需求
 * - 解除 MCP 工具总数量的限制
 *
 * 在 compaction 过程中，包含 tool_reference 的消息会被摘要替换，
 * 因此会在边界标记上将已发现的工具集合快照到
 * compactMetadata.preCompactDiscoveredTools 中；
 * 本函数会从该字段中读取恢复这些信息。
 * 而 snip 机制则通过保留包含 tool_reference 的消息，防止其被移除。
 *
 * @param messages 可能包含 tool_result 及 tool_reference 内容的消息数组
 * @returns 通过 tool_reference 发现的工具名称集合
 */
export function extractDiscoveredToolNames(messages: Message[]): Set<string> {
  const discoveredTools = new Set<string>()
  let carriedFromBoundary = 0

  for (const msg of messages) {
    // compaction 边界会携带压缩前已发现的工具集合。
    // 这里使用内联类型判断，而不是 isCompactBoundaryMessage ——
    // 因为 utils/messages.ts 已经依赖本文件，如果再反向导入会形成循环依赖。
    if (msg.type === 'system' && msg.subtype === 'compact_boundary') {
      const carried = (msg as any).compactMetadata?.preCompactDiscoveredTools as string[] | undefined
      if (carried) {
        for (const name of carried) discoveredTools.add(name)
        carriedFromBoundary += carried.length
      }
      continue
    }

    // 只有 user 消息中才会包含 tool_result 块（作为 tool_use 的响应）
    if (msg.type !== 'user') continue

    const content = msg.message?.content
    if (!Array.isArray(content)) continue

    for (const block of content) {
      // tool_reference 块只会出现在 tool_result 的内容中，
      // 具体来说是 ToolSearchTool 的返回结果里。
      // API 会将这些引用展开为完整的工具定义，并注入到模型上下文中。
      if (isToolResultBlockWithContent(block)) {
        for (const item of block.content) {
          if (isToolReferenceWithName(item)) {
            discoveredTools.add(item.tool_name)
          }
        }
      }
    }
  }

  if (discoveredTools.size > 0) {
    logForDebugging(
      `Dynamic tool loading: found ${discoveredTools.size} discovered tools in message history` +
        (carriedFromBoundary > 0
          ? ` (${carriedFromBoundary} carried from compact boundary)`
          : ''),
    )
  }

  return discoveredTools
}

export type DeferredToolsDelta = {
  addedNames: string[]
  /** Rendered lines for addedNames; the scan reconstructs from names. */
  addedLines: string[]
  removedNames: string[]
}

/**
 * tengu_deferred_tools_pool_change 事件的调用点判别器。
 * 该扫描会在多个不同调用点运行，而它们对 expected-prior（期望先验值）的语义不同（inc-4747）：
 *
 *   - attachments_main：主线程 getAttachments → prior=0 是 fire-2+ 下的 BUG
 *   - attachments_subagent：子 agent getAttachments → prior=0 是“符合预期”
 *     （新对话，initialMessages 中没有 DTD）
 *   - compact_full：compact.ts 传入 [] → prior=0 是“符合预期”
 *   - compact_partial：compact.ts 传入 messagesToKeep → 取决于保留内容
 *   - reactive_compact：reactiveCompact.ts 传入 preservedMessages → 同理
 *
 * 如果不做区分，统计中 96% 的 prior=0 会被“符合预期”的桶所主导，
 * 从而导致真实的主线程跨轮 bug（如果存在）在 BigQuery 中不可见。
 */
export type DeferredToolsDeltaScanContext = {
  callSite:
    | 'attachments_main'
    | 'attachments_subagent'
    | 'compact_full'
    | 'compact_partial'
    | 'reactive_compact'
  querySource?: string
}

/**
* True → 通过持久化的增量附件发布延迟工具。
* False → claude.ts 保留其每次调用时的 <available-deferred-tools> 标头前缀（附件不会触发）。
*/
export function isDeferredToolsDeltaEnabled(): boolean {
  return (
    process.env.USER_TYPE === 'ant' ||
    getFeatureValue_CACHED_MAY_BE_STALE('tengu_glacier_2xr', false)
  )
}

/**
 * 对比当前延迟工具池与此次对话中已经声明过的内容（通过扫描之前的 deferred_tools_delta 附件重建）。
 * 如果没有任何变化，则返回 null。
 *
 * 某个名称之前声明过，但此后不再延迟 —— 却仍然在基础池中 —— 不会被报告为“已移除”。
 * 因为它现在已经直接加载了，所以告诉模型“不再可用”是错误的。
 */
export function getDeferredToolsDelta(
  tools: Tools,
  messages: Message[],
  scanContext?: DeferredToolsDeltaScanContext,
): DeferredToolsDelta | null {
  const announced = new Set<string>()
  let attachmentCount = 0
  let dtdCount = 0
  const attachmentTypesSeen = new Set<string>()
  for (const msg of messages) {
    if (msg.type !== 'attachment') continue
    attachmentCount++
    attachmentTypesSeen.add(msg.attachment!.type)
    if (msg.attachment!.type !== 'deferred_tools_delta') continue
    dtdCount++
    for (const n of msg.attachment!.addedNames) announced.add(n)
    for (const n of msg.attachment!.removedNames) announced.delete(n)
  }

  const deferred: Tool[] = tools.filter(isDeferredTool)
  const deferredNames = new Set(deferred.map(t => t.name))
  const poolNames = new Set(tools.map(t => t.name))

  const added = deferred.filter(t => !announced.has(t.name))
  const removed: string[] = []
  for (const n of announced) {
    if (deferredNames.has(n)) continue
    if (!poolNames.has(n)) removed.push(n)
    // else: undeferred — silent
  }

  if (added.length === 0 && removed.length === 0) return null

  //// 针对 inc-4747 扫描找不到内容 bug 的诊断。
  // 第23167号问题中第一轮字段（messagesLength/attachmentCount/dtdCount）显示 45.6% 的事件有附件但没有 DTD，
  // 但这些数字存在干扰：子 agent 首次触发和 compact-path 扫描的预期 prior=0 并且占统计主导地位。
  // callSite/querySource/attachmentTypesSeen 可拆分这些桶，使得真正的主线程跨回合故障在 BQ 中可隔离。
  logEvent('tengu_deferred_tools_pool_change', {
    addedCount: added.length,
    removedCount: removed.length,
    priorAnnouncedCount: announced.size,
    messagesLength: messages.length,
    attachmentCount,
    dtdCount,
    callSite: (scanContext?.callSite ??
      'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource: (scanContext?.querySource ??
      'unknown') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    attachmentTypesSeen: [...attachmentTypesSeen]
      .sort()
      .join(',') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  return {
    addedNames: added.map(t => t.name).sort(),
    addedLines: added.map(formatDeferredToolLine).sort(),
    removedNames: removed.sort(),
  }
}

/**
 * 检查延迟工具是否超过启用 TST 的自动阈值。
 * 优先尝试精确的 token 计数，若不可用则回退到基于字符的启发式规则。
 * 计算工具Token数量占据整个上下文的百分比，超过10%就启动TST。如果入法计算token数量，就通过char计算。
 */
async function checkAutoThreshold(
  tools: Tools,
  getToolPermissionContext: () => Promise<ToolPermissionContext>,
  agents: AgentDefinition[],
  model: string,
): Promise<{
  enabled: boolean
  debugDescription: string
  metrics: Record<string, number>
}> {
  // 优先尝试精确 token 计数（已缓存，每次工具集变更仅调用一次 API）
  const deferredToolTokens = await getDeferredToolTokenCount(
    tools,
    getToolPermissionContext,
    agents,
    model,
  )

  if (deferredToolTokens !== null) {
    const threshold = getAutoToolSearchTokenThreshold(model)
    return {
      enabled: deferredToolTokens >= threshold,
      debugDescription:
        `${deferredToolTokens} tokens (threshold: ${threshold}, ` +
        `${getAutoToolSearchPercentage()}% of context)`,
      metrics: { deferredToolTokens, threshold },
    }
  }

  // 备用方案：当令牌 API 不可用时，采用基于字符的启发式方法。
  const deferredToolDescriptionChars =
    await calculateDeferredToolDescriptionChars(
      tools,
      getToolPermissionContext,
      agents,
    )
  const charThreshold = getAutoToolSearchCharThreshold(model)
  return {
    enabled: deferredToolDescriptionChars >= charThreshold,
    debugDescription:
      `${deferredToolDescriptionChars} chars (threshold: ${charThreshold}, ` +
      `${getAutoToolSearchPercentage()}% of context) (char fallback)`,
    metrics: { deferredToolDescriptionChars, charThreshold },
  }
}
