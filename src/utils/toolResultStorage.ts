/** * 用于将大型工具结果持久化到磁盘而非截断的实用工具。 */

import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getOriginalCwd, getSessionId } from '../bootstrap/state.js'
import {
  BYTES_PER_TOKEN,
  DEFAULT_MAX_RESULT_SIZE_CHARS,
  MAX_TOOL_RESULT_BYTES,
  MAX_TOOL_RESULTS_PER_MESSAGE_CHARS,
} from '../constants/toolLimits.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'
import { logEvent } from '../services/analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../services/analytics/metadata.js'
import type { Message } from '../types/message.js'
import { logForDebugging } from './debug.js'
import { getErrnoCode, toError } from './errors.js'
import { formatFileSize } from './format.js'
import { logError } from './log.js'
import { getProjectDir } from './sessionStorage.js'
import { jsonStringify } from './slowOperations.js'

// 会话内工具结果的子目录名称
export const TOOL_RESULTS_SUBDIR = 'tool-results'

// 用于包装持久化输出消息的 XML 标签
export const PERSISTED_OUTPUT_TAG = '<persisted-output>'
export const PERSISTED_OUTPUT_CLOSING_TAG = '</persisted-output>'

// 当工具结果内容被清除而未持久化到文件时使用的消息
export const TOOL_RESULT_CLEARED_MESSAGE = '[Old tool result content cleared]'

/** * GrowthBook 覆盖映射：工具名称 -> 持久化阈值（字符数）。
 * 当工具名称出现在此映射中时，该值将直接用作有效阈值，绕过 Math.min() 对 5 万默认值的钳制。
 * 映射中不存在的工具使用硬编码的备用值。
 * 标志默认值为 {}（无覆盖 == 行为不变）。 */
const PERSIST_THRESHOLD_OVERRIDE_FLAG = 'tengu_satin_quoll'

/** * 解析工具的有效持久化阈值。
 * 当存在 GrowthBook 覆盖时，优先使用；否则回退到由全局默认值钳制的声明的每工具上限。
 *
 * 防御性：GrowthBook 的缓存返回 `cached !== undefined ? cached : default`，
 * 因此以 `null` 形式提供的标志会泄漏。我们使用可选链和类型检查进行防护，
 * 以便任何非对象标志值（null、字符串、数字）都回退到硬编码的默认值，
 * 而不是在索引时抛出错误或返回 0。 */
export function getPersistenceThreshold(
  toolName: string,
  declaredMaxResultSizeChars: number,
): number {
  // Infinity = hard opt-out (reserved for tools that self-bound via other
  // mechanisms). Checked before the GB override so tengu_satin_quoll can't
  // force it back on.
  if (!Number.isFinite(declaredMaxResultSizeChars)) {
    return declaredMaxResultSizeChars
  }
  const overrides = getFeatureValue_CACHED_MAY_BE_STALE<Record<
    string,
    number
  > | null>(PERSIST_THRESHOLD_OVERRIDE_FLAG, {})
  const override = overrides?.[toolName]
  if (
    typeof override === 'number' &&
    Number.isFinite(override) &&
    override > 0
  ) {
    return override
  }
  return Math.min(declaredMaxResultSizeChars, DEFAULT_MAX_RESULT_SIZE_CHARS)
}

// 将工具结果持久化到磁盘的结果
export type PersistedToolResult = {
  filepath: string
  originalSize: number
  isJson: boolean
  preview: string
  hasMore: boolean
}

// 持久化失败时的错误结果
export type PersistToolResultError = {
  error: string
}

/** * 获取会话目录 (projectDir/sessionId) */
function getSessionDir(): string {
  return join(getProjectDir(getOriginalCwd()), getSessionId())
}

/** * 获取此会话的工具结果目录 (projectDir/sessionId/tool-results) */
export function getToolResultsDir(): string {
  return join(getSessionDir(), TOOL_RESULTS_SUBDIR)
}

// 参考消息的预览大小（字节）
export const PREVIEW_SIZE_BYTES = 2000

/** * 获取工具结果将被持久化到的文件路径。 */
export function getToolResultPath(id: string, isJson: boolean): string {
  const ext = isJson ? 'json' : 'txt'
  return join(getToolResultsDir(), `${id}.${ext}`)
}
/**
 * 确保会话专属的工具结果目录存在
 */
export async function ensureToolResultsDir(): Promise<void> {
  try {
    await mkdir(getToolResultsDir(), { recursive: true })
  } catch {
    // 目录可能已存在
  }
}

/**
 * 将工具结果持久化到磁盘，并返回持久化文件的信息
 *
 * @param content - 要持久化的工具结果内容（字符串或内容块数组）
 * @param toolUseId - 产生该结果的工具使用 ID
 * @returns 包含文件路径和预览的持久化文件信息
 */
export async function persistToolResult(
  content: NonNullable<ToolResultBlockParam['content']>,
  toolUseId: string,
): Promise<PersistedToolResult | PersistToolResultError> {
  const isJson = Array.isArray(content)

  // 检查非文本内容 — 我们只能持久化文本块
  if (isJson) {
    const hasNonTextContent = content.some(block => block.type !== 'text')
    if (hasNonTextContent) {
      return {
        error: '无法持久化包含非文本内容的工具结果',
      }
    }
  }

  await ensureToolResultsDir()
  const filepath = getToolResultPath(toolUseId, isJson)
  const contentStr = isJson ? jsonStringify(content, null, 2) : content

  // tool_use_id 每次调用都是唯一的，并且对于给定 id 的内容是确定性的，因此如果文件已存在则跳过写入。
  // 这可避免 microcompact 重放原始消息时，每个 API 轮次都重新写入相同内容。
  // 使用 'wx' 避免“先 stat 再 write”的竞态条件。
  try {
    await writeFile(filepath, contentStr, { encoding: 'utf-8', flag: 'wx' })
    logForDebugging(
      `已将工具结果持久化到 ${filepath} (${formatFileSize(contentStr.length)})`,
    )
  } catch (error) {
    if (getErrnoCode(error) !== 'EEXIST') {
      logError(toError(error))
      return { error: getFileSystemErrorMessage(toError(error)) }
    }
    // EEXIST：已在先前轮次持久化，回退到预览
  }

  // 生成预览
  const { preview, hasMore } = generatePreview(contentStr, PREVIEW_SIZE_BYTES)

  return {
    filepath,
    originalSize: contentStr.length,
    isJson,
    preview,
    hasMore,
  }
}

/**
 * 为大型工具结果构建带预览的消息
 */
export function buildLargeToolResultMessage(
  result: PersistedToolResult,
): string {
  let message = `${PERSISTED_OUTPUT_TAG}\n`
  message += `输出过大 (${formatFileSize(result.originalSize)})。完整输出已保存至：${result.filepath}`
  message += `预览（前 ${formatFileSize(PREVIEW_SIZE_BYTES)} 个字符）：`
  message += result.preview
  message += result.hasMore ? '\n...\n' : '\n'
  message += PERSISTED_OUTPUT_CLOSING_TAG
  return message
}

/**
 * 处理工具结果以便写入消息。
 * 将结果映射为 API 格式，并把过大的结果持久化到磁盘。
 */
export async function processToolResultBlock<T>(
  tool: {
    name: string
    maxResultSizeChars: number
    mapToolResultToToolResultBlockParam: (
      result: T,
      toolUseID: string,
    ) => ToolResultBlockParam
  },
  toolUseResult: T,
  toolUseID: string,
): Promise<ToolResultBlockParam> {
  const toolResultBlock = tool.mapToolResultToToolResultBlockParam(
    toolUseResult,
    toolUseID,
  )
  return maybePersistLargeToolResult(
    toolResultBlock,
    tool.name,
    getPersistenceThreshold(tool.name, tool.maxResultSizeChars),
  )
}

/**
 * 处理已预先映射的工具结果块。对大型结果应用持久化，而无需再次调用 mapToolResultToToolResultBlockParam。
 */
export async function processPreMappedToolResultBlock(
  toolResultBlock: ToolResultBlockParam,
  toolName: string,
  maxResultSizeChars: number,
): Promise<ToolResultBlockParam> {
  return maybePersistLargeToolResult(
    toolResultBlock,
    toolName,
    getPersistenceThreshold(toolName, maxResultSizeChars),
  )
}

/**
 * 当工具结果内容为空或“等价为空”时为 true。覆盖：
 * undefined/null/''、仅空白的字符串、空数组、以及仅包含空/空白文本块的数组。
 * 非文本块（图像、工具引用）视为非空。
 */
export function isToolResultContentEmpty(
  content: ToolResultBlockParam['content'],
): boolean {
  if (!content) return true
  if (typeof content === 'string') return content.trim() === ''
  if (!Array.isArray(content)) return false
  if (content.length === 0) return true
  return content.every(
    block =>
      typeof block === 'object' &&
      'type' in block &&
      block.type === 'text' &&
      'text' in block &&
      (typeof block.text !== 'string' || block.text.trim() === ''),
  )
}

/**
 * 通过持久化到磁盘来处理大型工具结果，而不是直接截断。
 * 如果无需持久化则返回原块；否则返回一个修改后的块，将内容替换为指向持久化文件的引用。
 */
async function maybePersistLargeToolResult(
  toolResultBlock: ToolResultBlockParam,
  toolName: string,
  persistenceThreshold?: number,
): Promise<ToolResultBlockParam> {
  // 在进行任何异步工作之前先检查大小 - 大多数工具结果都很小
  const content = toolResultBlock.content

  // inc-4586：提示尾部的空 tool_result 内容会导致某些
  // 模型（尤其是 capybara）发出 \n\nHuman: 停止序列并
  // 以零输出结束其轮次。服务器渲染器在工具结果后不插入 \n\nAssist
  // ant: 标记，因此一个裸露的 </function_results>
  // \n\n 模式会匹配到轮次边界。有几种工具可以合法地产生空输出（静默成功的
  // shell 命令、返回 content:[] 的 MCP 服务器、R
  // EPL 语句等）。注入一个简短的标记，以便模型始终有内容可以响应。
  if (isToolResultContentEmpty(content)) {
    logEvent('tengu_tool_empty_result', {
      toolName: sanitizeToolNameForAnalytics(toolName),
    })
    return {
      ...toolResultBlock,
      content: `(${toolName} 已完成，无输出)`,
    }
  }
  // 在空值防护之后缩小范围 — 超过此点内容为非空值。
  if (!content) {
    return toolResultBlock
  }

  // 跳过图像内容块的持久化 - 它们需要按原样发送给 Claude
  if (hasImageBlock(content)) {
    return toolResultBlock
  }

  const size = contentSize(content)

  // 如果提供了工具特定阈值则使用，否则回退到全局限制
  const threshold = persistenceThreshold ?? MAX_TOOL_RESULT_BYTES
  if (size <= threshold) {
    return toolResultBlock
  }

  // 将整个内容作为一个单元持久化
  const result = await persistToolResult(content, toolResultBlock.tool_use_id)
  if (isPersistError(result)) {
    // 如果持久化失败，则返回未更改的原始块
    return toolResultBlock
  }

  const message = buildLargeToolResultMessage(result)

  // 日志分析
  logEvent('tengu_tool_result_persisted', {
    toolName: sanitizeToolNameForAnalytics(toolName),
    originalSizeBytes: result.originalSize,
    persistedSizeBytes: message.length,
    estimatedOriginalTokens: Math.ceil(result.originalSize / BYTES_PER_TOKEN),
    estimatedPersistedTokens: Math.ceil(message.length / BYTES_PER_TOKEN),
    thresholdUsed: threshold,
  })

  return { ...toolResultBlock, content: message }
}

/**
 * 生成内容的预览，尽可能在换行边界处截断。
 */
export function generatePreview(
  content: string,
  maxBytes: number,
): { preview: string; hasMore: boolean } {
  if (content.length <= maxBytes) {
    return { preview: content, hasMore: false }
  }

  // 在限制范围内查找最后一个换行符，避免截断行中内容
  const truncated = content.slice(0, maxBytes)
  const lastNewline = truncated.lastIndexOf('\n')

  // 如果在限制附近找到换行符，则使用
  // 它；否则回退到精确限制
  const cutPoint = lastNewline > maxBytes * 0.5 ? lastNewline : maxBytes

  return { preview: content.slice(0, cutPoint), hasMore: true }
}

/**
 * 类型守卫：判断持久化结果是否为错误。
 */
export function isPersistError(
  result: PersistedToolResult | PersistToolResultError,
): result is PersistToolResultError {
  return 'error' in result
}

// --- 消息级别聚合工具结果预算 ---
//
// 跨轮次跟踪替换状态，确保 enforceToolResultBu
// dget 每次做出相同选择（保留提示缓存前缀）。

/**
 * 每个对话线程的工具结果聚合预算状态。
 * 状态必须保持稳定以保留提示缓存：
 *   - seenIds：已经通过预算检查的结果（无论是否被替换）。一旦被“见过”，该结果在对话中的命运就被冻结。
 *   - replacements：seenIds 的子集，这些结果被持久化到磁盘并替换为预览，映射到模型看到的精确预览字符串。
 *     重新应用时只需进行 Map 查找 —— 无需文件 I/O、保证字节级一致、不会失败。
 *
 * 生命周期：每个对话线程一个实例，挂在 ToolUseContext 上。
 * 主线程：REPL 只配置一次，从不重置 —— 在 /clear、回滚、恢复或压缩之后的陈旧条目永远不会被查找（tool_use_id 是 UUID），
 * 因此它们无害。子代理：createSubagentContext 默认克隆父状态（像 agentSummary 这类共享缓存的分支需要相同的决策），
 * 或者 resumeAgentBackground 使用从旁链记录重建的状态。
 */
export type ContentReplacementState = {
  seenIds: Set<string>
  replacements: Map<string, string>
}

export function createContentReplacementState(): ContentReplacementState {
  return { seenIds: new Set(), replacements: new Map() }
}

/**
 * 为共享缓存的分支（例如 agentSummary）克隆替换状态。
 * 分支需要在分叉时拥有与源相同的状态，以便 enforceToolResultBudget 做出相同的选择 → 相同的网络前缀 → 提示缓存命中。
 * 修改克隆不会影响源对象。
 */
export function cloneContentReplacementState(
  source: ContentReplacementState,
): ContentReplacementState {
  return {
    seenIds: new Set(source.seenIds),
    replacements: new Map(source.replacements),
  }
}

/**
 * 解析每条消息的聚合预算限制。当 GrowthBook 覆盖（tengu_hawthorn_window）存在且为有限正数时优先使用；
 * 否则回退到硬编码常量。防御性的 typeof/finite 检查：GrowthBook 的缓存返回 `cached !== undefined ? cached : default`，
 * 因此如果标志被下发为 null/string/NaN，会泄漏出来。
 */
export function getPerMessageBudgetLimit(): number {
  const override = getFeatureValue_CACHED_MAY_BE_STALE<number | null>(
    'tengu_hawthorn_window',
    null,
  )
  if (
    typeof override === 'number' &&
    Number.isFinite(override) &&
    override > 0
  ) {
    return override
  }
  return MAX_TOOL_RESULTS_PER_MESSAGE_CHARS
}

/**
 * 为新对话线程配置替换状态。
 *
 * 封装了特性标志门控 + 重建 vs 全新的选择：
 *   - 标志关闭 → undefined（query.ts 完全跳过强制）
 *   - 没有 initialMessages（冷启动）→ 全新状态
 *   - 有 initialMessages → 重建（冻结所有候选 ID，这样预算永远不会替换模型已经以“未替换”形式见到的内容）。
 *     记录为空或不存在时会冻结所有内容；记录非空时还会填充 replacements Map，以便字节级一致地重新应用。
 */
export function provisionContentReplacementState(
  initialMessages?: Message[],
  initialContentReplacements?: ContentReplacementRecord[],
): ContentReplacementState | undefined {
  const enabled = getFeatureValue_CACHED_MAY_BE_STALE(
    'tengu_hawthorn_steeple',
    false,
  )
  if (!enabled) return undefined
  if (initialMessages) {
    return reconstructContentReplacementState(
      initialMessages,
      initialContentReplacements ?? [],
    )
  }
  return createContentReplacementState()
}

/**
 * 可序列化的内容替换决策记录。会作为 ContentReplacementEntry 写入转录文件，使决策在恢复后仍可复用。
 * 用 `kind` 字段做区分，以便未来的替换机制（用户文本、离线图片等）共享同一种转录条目类型。
 *
 * `replacement` 是模型看到的精确字符串 —— 选择存储而不是在恢复时重新派生，
 * 这样预览模板、大小格式化或路径布局的代码改动就不会静默地破坏提示缓存。
 */
export type ContentReplacementRecord = {
  kind: 'tool-result'
  toolUseId: string
  replacement: string
}

export type ToolResultReplacementRecord = Extract<
  ContentReplacementRecord,
  { kind: 'tool-result' }
>

type ToolResultCandidate = {
  toolUseId: string
  content: NonNullable<ToolResultBlockParam['content']>
  size: number
}

type CandidatePartition = {
  mustReapply: Array<ToolResultCandidate & { replacement: string }>
  frozen: ToolResultCandidate[]
  fresh: ToolResultCandidate[]
}

function isContentAlreadyCompacted(
  content: ToolResultBlockParam['content'],
): boolean {
  // 所有预算生成的内容都以标签 (buildLargeToolResultMe
  // ssage) 开头。`.startsWith()` 可避免当标签出现
  // 在内容其他位置（例如读取此源文件）时产生误报。
  return typeof content === 'string' && content.startsWith(PERSISTED_OUTPUT_TAG)
}

function hasImageBlock(
  content: NonNullable<ToolResultBlockParam['content']>,
): boolean {
  return (
    Array.isArray(content) &&
    content.some(
      b => typeof b === 'object' && 'type' in b && b.type === 'image',
    )
  )
}

function contentSize(
  content: NonNullable<ToolResultBlockParam['content']>,
): number {
  if (typeof content === 'string') return content.length
  // 直接累加文本块长度。与序列化相比略有低估（无 J
  // SON 框架），但预算本身是粗略的 token
  // 启发式方法。避免每次执行时分配内容大小的字符串。
  return content.reduce(
    (sum, b) => sum + (b.type === 'text' ? b.text.length : 0),
    0,
  )
}

/**
 * 遍历消息，从助手消息的 tool_use 块构建 tool_use_id → tool_name 映射。
 * tool_use 总是先于其 tool_result（模型先调用，然后结果到达），因此当预算强制逻辑看到结果时，其名称已知。
 */
function buildToolNameMap(messages: Message[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const message of messages) {
    if (message.type !== 'assistant') continue
    const content = message.message!.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block.type === 'tool_use') {
        map.set(block.id, block.name)
      }
    }
  }
  return map
}
/**
 * 从单条用户消息中提取候选的 tool_result 块：非空、非图像、且未被标签标记为已压缩（即未被按工具限制或本次查询调用的较早迭代压缩）。
 * 对于没有合格块的消息，返回 []。
 */
function collectCandidatesFromMessage(message: Message): ToolResultCandidate[] {
  if (message.type !== 'user' || !Array.isArray(message.message!.content)) {
    return []
  }
  return message.message!.content.flatMap(block => {
    if (block.type !== 'tool_result' || !block.content) return []
    if (isContentAlreadyCompacted(block.content)) return []
    if (hasImageBlock(block.content)) return []
    return [
      {
        toolUseId: block.tool_use_id,
        content: block.content,
        size: contentSize(block.content),
      },
    ]
  })
}

/**
 * 按 API 级别的用户消息分组提取候选的 tool_result 块。
 *
 * normalizeMessagesForAPI 会将连续的用户消息合并为一条（Bedrock 兼容；第一方服务端也会同样合并），
 * 因此在我们状态中作为 N 条独立用户消息到达的并行工具结果，在网络传输中会变成一条用户消息。
 * 预算逻辑必须以同样的方式分组，否则它会看到 N 条未超预算的消息，而不是一条超预算的消息，
 * 从而在最关键时刻无法正确执行强制。
 *
 * “分组”是指不被助手消息分隔的一段连续用户消息。只有助手消息会形成网络层面的边界——
 * normalizeMessagesForAPI 会完全过滤掉进度消息，并将附件/系统（local_command）合并到相邻的用户块中，
 * 因此这些类型在这里也不会打断分组。
 *
 * 这对于“并行工具执行中途中止”的路径至关重要：agent_progress 消息（非临时，持久化在 REPL 状态中）
 * 可能穿插在全新的 tool_result 消息之间。如果我们基于进度消息进行刷新，这些 tool_result 就会被拆分成
 * 未超预算的小组，从而在不被替换的情况下通过、被冻结，然后被 normalizeMessagesForAPI 合并成一条
 * 超预算的网络消息 —— 这会使该功能失效。
 *
 * 仅返回至少包含一个合格候选项的分组。
 */
function collectCandidatesByMessage(
  messages: Message[],
): ToolResultCandidate[][] {
  const groups: ToolResultCandidate[][] = []
  let current: ToolResultCandidate[] = []

  const flush = () => {
    if (current.length > 0) groups.push(current)
    current = []
  }

  // 跟踪迄今为止看到的所有助手消息 ID — 相同 ID 的片段由 normali
  // zeMessagesForAPI 合并（messages.ts ~2126 通过
  // `continue` 回溯到不同 ID 的助手消息），因此任何先前见过的 I
  // D 再次出现时绝不能创建分组边界。两种场景：• 连续：streamingToo
  // lExecution 每个 content_block_stop 产生一个 As
  // sistantMessage（相同 ID）；快速工具在块之间耗尽；中止/钩子
  // 停止留下 [asst(X), user(trA), asst(X), use
  // r(trB)]。• 交错：协调器/队友流混合不同响应，如 [asst(X),
  // user(trA), asst(Y), user(trB), asst(X)
  // , user(trC)]。在这两种情况下，normalizeMessagesFo
  // rAPI 将 X 片段合并为一个网络助手消息，它们随后的 tool_result
  // s 合并为一个网络用户消息 — 因此预算也必须将它们视为一个组。
  const seenAsstIds = new Set<string>()
  for (const message of messages) {
    if (message.type === 'user') {
      current.push(...collectCandidatesFromMessage(message))
    } else if (message.type === 'assistant') {
      if (!seenAsstIds.has(message.message!.id ?? '')) {
        flush()
        seenAsstIds.add(message.message!.id ?? '')
      }
    }
    // progress / attachment / system 由 nor
    // malizeMessagesForAPI 过滤或合并 — 它们不创建网络边界。
  }
  flush()

  return groups
}

/**
 * 根据候选项的历史决策状态进行分区：
 *  - mustReapply：之前已被替换 → 重新应用缓存的替换内容以保证前缀稳定性
 *  - frozen：之前已见且未被替换 → 禁止替换（现在替换会改变已缓存的前缀）
 *  - fresh：从未见过 → 可参与新的替换决策
 */
function partitionByPriorDecision(
  candidates: ToolResultCandidate[],
  state: ContentReplacementState,
): CandidatePartition {
  return candidates.reduce<CandidatePartition>(
    (acc, c) => {
      const replacement = state.replacements.get(c.toolUseId)
      if (replacement !== undefined) {
        acc.mustReapply.push({ ...c, replacement })
      } else if (state.seenIds.has(c.toolUseId)) {
        acc.frozen.push(c)
      } else {
        acc.fresh.push(c)
      }
      return acc
    },
    { mustReapply: [], frozen: [], fresh: [] },
  )
}

/**
 * 选择最大的 fresh 结果进行替换，直到模型可见总量（frozen + 剩余 fresh）降至预算以内，
 * 或 fresh 耗尽为止。如果仅 frozen 的结果就已经超预算，则接受超额 —— microcompact 最终会清理它们。
 */
function selectFreshToReplace(
  fresh: ToolResultCandidate[],
  frozenSize: number,
  limit: number,
): ToolResultCandidate[] {
  const sorted = [...fresh].sort((a, b) => b.size - a.size)
  const selected: ToolResultCandidate[] = []
  let remaining = frozenSize + fresh.reduce((sum, c) => sum + c.size, 0)
  for (const c of sorted) {
    if (remaining <= limit) break
    selected.push(c)
    // 在持久化之前我们不知道替换大小，但预览约
    // 2K，而触发此路径的结果要大得多，因此减去
    // 完整大小对于选择目的来说是接近的近似值。
    remaining -= c.size
  }
  return selected
}

/**
 * 返回一个新的 Message[]，其中每个在 replacementMap 中出现的 tool_result 块的内容被替换。
 * 没有发生替换的消息和块会按引用透传。
 */
function replaceToolResultContents(
  messages: Message[],
  replacementMap: Map<string, string>,
): Message[] {
  return messages.map(message => {
    if (message.type !== 'user' || !Array.isArray(message.message!.content)) {
      return message
    }
    const content = message.message!.content
    const needsReplace = content.some(
      b => b.type === 'tool_result' && replacementMap.has(b.tool_use_id),
    )
    if (!needsReplace) return message
    return {
      ...message,
      message: {
        ...message.message,
        content: content.map(block => {
          if (block.type !== 'tool_result') return block
          const replacement = replacementMap.get(block.tool_use_id)
          return replacement === undefined
            ? block
            : { ...block, content: replacement }
        }),
      },
    }
  })
}

async function buildReplacement(
  candidate: ToolResultCandidate,
): Promise<{ content: string; originalSize: number } | null> {
  const result = await persistToolResult(candidate.content, candidate.toolUseId)
  if (isPersistError(result)) return null
  return {
    content: buildLargeToolResultMessage(result),
    originalSize: result.originalSize,
  }
}
/**
 * 对聚合的工具结果大小执行每条消息预算强制。
 *
 * 对于每条其 tool_result 块合计超过每条消息限制（参见 getPerMessageBudgetLimit）的用户消息，
 * 该消息中最大的 FRESH（从未见过）结果会被持久化到磁盘并替换为预览。
 * 消息彼此独立评估 — 一条消息中的 150K 结果和另一条消息中的 150K 结果都未超预算，因此保持不变。
 *
 * 状态通过 `state` 中的 tool_use_id 进行跟踪。一旦某个结果被“见过”，其命运就被冻结：
 * 之前已替换的结果会在每个轮次通过缓存的预览字符串重新应用相同替换（零 I/O、字节级一致），
 * 而之前未替换的结果之后永远不会被替换（否则会破坏提示缓存）。
 *
 * 每个轮次最多添加一条包含 tool_result 块的新用户消息，因此每条消息的循环通常最多执行一次预算检查；
 * 所有之前的消息只是重新应用缓存的替换。
 *
 * @param state — 会被原地修改：seenIds 和 replacements 会被更新以记录本次调用做出的选择。
 *   调用方跨轮次持有稳定引用；若返回新对象，则需要在每次查询后进行容易出错的 ref 更新。
 *
 * 返回 `{ messages, newlyReplaced }`：
 *   - messages：当无需替换时，返回同一个数组实例
 *   - newlyReplaced：本次调用产生的新替换（不含重新应用）。调用方会将这些持久化到转录文件中，以便恢复时重建。
 */
export async function enforceToolResultBudget(
  messages: Message[],
  state: ContentReplacementState,
  skipToolNames: ReadonlySet<string> = new Set(),
): Promise<{
  messages: Message[]
  newlyReplaced: ToolResultReplacementRecord[]
}> {
  const candidatesByMessage = collectCandidatesByMessage(messages)
  const nameByToolUseId =
    skipToolNames.size > 0 ? buildToolNameMap(messages) : undefined
  const shouldSkip = (id: string): boolean =>
    nameByToolUseId !== undefined &&
    skipToolNames.has(nameByToolUseId.get(id) ?? '')
  // 每次调用解析一次。会话中的标志更改仅影响新消息（先前
  // 决策通过 seenIds/replacements
  // 冻结），因此无论怎样，已见内容的提示缓存都会保留。
  const limit = getPerMessageBudgetLimit()

  // 独立遍历每个 API 级别的消息组。对于先前处理过的消息（se
  // enIds 中的所有 ID），这只是重新应用缓存的替
  // 换。对于本轮添加的单个新消息，它运行预算检查。
  const replacementMap = new Map<string, string>()
  const toPersist: ToolResultCandidate[] = []
  let reappliedCount = 0
  let messagesOverBudget = 0

  for (const candidates of candidatesByMessage) {
    //已经替换，已经发给模型，新消息（主要就是处理新消息）
    const { mustReapply, frozen, fresh } = partitionByPriorDecision(
      candidates,
      state,
    )

    // 重新应用：纯 Map 查找。无文件 I/O，字节相同，不会失败。
    mustReapply.forEach(c => replacementMap.set(c.toolUseId, c.replacement))
    reappliedCount += mustReapply.length

    // 新消息意味着这是一个新消息。检查其每消息预算。（先前处理过
    // 的消息 fresh.length === 0，因为其所有 I
    // D 在首次出现时已添加到 seenIds。）
    if (fresh.length === 0) {
      // mustReapply/frozen 已在首次处理时加入 se
      // enIds — 重新添加是无操作，但保持不变量明确。
      candidates.forEach(c => state.seenIds.add(c.toolUseId))
      continue
    }

    // Tools with maxResultSizeChars: Infinity — never persist (reserved for
    // tools that self-bound via other mechanisms). Mark as seen (frozen) so
    // the decision sticks across turns. They don't count toward freshSize; if
    // that lets the group slip under budget and the wire message is still
    // large, that's the contract — the tool's own maxTokens is the bound, not
    // this wrapper.
    const skipped = fresh.filter(c => shouldSkip(c.toolUseId))
    skipped.forEach(c => state.seenIds.add(c.toolUseId))
    const eligible = fresh.filter(c => !shouldSkip(c.toolUseId))

    const frozenSize = frozen.reduce((sum, c) => sum + c.size, 0)
    const freshSize = eligible.reduce((sum, c) => sum + c.size, 0)

    const selected =
      frozenSize + freshSize > limit
        ? selectFreshToReplace(eligible, frozenSize, limit)
        : []

    // 立即（同步）标记非持久化候选为已见。选择持久化的 ID
    // 在 await 之后标记为已见，与 replacemen
    // ts.set 一起 — 保持这对操作在观察下原子化，因此没
    // 有并发读取器（一旦子代理共享状态）会看到 X∈seenId
    // s 但 X∉replacements，这将错误地将 X 分
    // 类为冻结并发送完整内容，而主线程发送预览 → 缓存未命中。
    const selectedIds = new Set(selected.map(c => c.toolUseId))
    candidates
      .filter(c => !selectedIds.has(c.toolUseId))
      .forEach(c => state.seenIds.add(c.toolUseId))

    if (selected.length === 0) continue
    messagesOverBudget++
    toPersist.push(...selected)
  }

  if (replacementMap.size === 0 && toPersist.length === 0) {
    return { messages, newlyReplaced: [] }
  }

  // 新消息：跨所有消息的所有选定候选并发持久化。
  // 实践中 toPersist 每轮来自单个消息。
  const freshReplacements = await Promise.all(
    toPersist.map(async c => [c, await buildReplacement(c)] as const),
  )
  const newlyReplaced: ToolResultReplacementRecord[] = []
  let replacedSize = 0
  for (const [candidate, replacement] of freshReplacements) {
    // 在此处标记为已见，await 之后，与 replacemen
    // ts.set 原子化处理成功情况。对于持久化失败（replac
    // ement === null），ID 为已见但未替换 —
    // 原始内容已发送给模型，因此将其视为冻结向前是正确的。
    state.seenIds.add(candidate.toolUseId)
    if (replacement === null) continue
    replacedSize += candidate.size
    replacementMap.set(candidate.toolUseId, replacement.content)
    state.replacements.set(candidate.toolUseId, replacement.content)
    newlyReplaced.push({
      kind: 'tool-result',
      toolUseId: candidate.toolUseId,
      replacement: replacement.content,
    })
    logEvent('tengu_tool_result_persisted_message_budget', {
      originalSizeBytes: replacement.originalSize,
      persistedSizeBytes: replacement.content.length,
      estimatedOriginalTokens: Math.ceil(
        replacement.originalSize / BYTES_PER_TOKEN,
      ),
      estimatedPersistedTokens: Math.ceil(
        replacement.content.length / BYTES_PER_TOKEN,
      ),
    })
  }

  if (replacementMap.size === 0) {
    return { messages, newlyReplaced: [] }
  }

  if (newlyReplaced.length > 0) {
    logForDebugging(
      `每消息预算：持久化了 ${newlyReplaced.length} 个工具结果` +
        `跨 ${messagesOverBudget} 个超预算消息，` +
        `削减约 ${formatFileSize(replacedSize)}，${reappliedCount} 个重新应用`,
    )
    logEvent('tengu_message_level_tool_result_budget_enforced', {
      resultsPersisted: newlyReplaced.length,
      messagesOverBudget,
      replacedSizeBytes: replacedSize,
      reapplied: reappliedCount,
    })
  }

  return {
    messages: replaceToolResultContents(messages, replacementMap),
    newlyReplaced,
  }
}
/**
 * 聚合预算的查询循环集成点。
 *
 * 基于 `state` 进行门控（undefined 表示功能禁用 → 无操作返回），
 * 执行强制替换，并为新的替换触发可选的转录写入回调。
 * 调用者（query.ts）拥有持久化门控 — 它仅为那些在恢复时会读回记录的查询源
 * （repl_main_thread*、agent:*）传递回调；临时性的 runForkedAgent 调用者
 * （agentSummary、sessionMemory、/btw、compact）传递 undefined。
 *
 * @returns 应用替换后的消息数组，如果功能关闭或未发生替换则返回输入数组不变
 */
export async function applyToolResultBudget(
  messages: Message[],
  state: ContentReplacementState | undefined,
  writeToTranscript?: (records: ToolResultReplacementRecord[]) => void,
  skipToolNames?: ReadonlySet<string>,
): Promise<Message[]> {
  if (!state) return messages
  const result = await enforceToolResultBudget(messages, state, skipToolNames)
  if (result.newlyReplaced.length > 0) {
    writeToTranscript?.(result.newlyReplaced)
  }
  return result.messages
}

/**
 * 从转录文件中加载的内容替换记录重建替换状态。用于恢复会话时，
 * 使预算机制做出与原始会话相同的选择（保持提示缓存稳定性）。
 *
 * 接受来自 LogOption 的完整 ContentReplacementRecord[] 数组（可能包含未来非工具结果类型）；
 * 此处仅应用工具结果类型的记录。
 *
 *   - replacements: 直接从存储的替换字符串填充。
 *     对于不在消息中的 ID（例如压缩后）的记录将被跳过 —— 它们本来就是惰性的。
 *   - seenIds: 加载的消息中每个候选的 tool_use_id。记录存在于转录文件中意味着它已被发送给模型，
 *     因此该结果被视为“已见过”。这会将未替换的结果冻结，防止将来被替换。
 *   - inheritedReplacements: 为分支子代理恢复填补空缺。分支的原始运行通过 mustReapply 应用父级继承的替换
 *     （从未持久化 —— 不是 newlyReplaced）。恢复时，旁链包含原始内容但没有记录，
 *     因此仅凭记录会将其归类为 frozen。父级的实时状态仍然保留映射关系；对于记录未覆盖的消息中的 ID，
 *     复制该映射。对于非分支的恢复（父级 ID 不在子代理的消息中），此操作为空操作。
 */
export function reconstructContentReplacementState(
  messages: Message[],
  records: ContentReplacementRecord[],
  inheritedReplacements?: ReadonlyMap<string, string>,
): ContentReplacementState {
  const state = createContentReplacementState()
  const candidateIds = new Set(
    collectCandidatesByMessage(messages)
      .flat()
      .map(c => c.toolUseId),
  )

  for (const id of candidateIds) {
    state.seenIds.add(id)
  }
  for (const r of records) {
    if (r.kind === 'tool-result' && candidateIds.has(r.toolUseId)) {
      state.replacements.set(r.toolUseId, r.replacement)
    }
  }
  if (inheritedReplacements) {
    for (const [id, replacement] of inheritedReplacements) {
      if (candidateIds.has(id) && !state.replacements.has(id)) {
        state.replacements.set(id, replacement)
      }
    }
  }
  return state
}
/**
 * AgentTool 恢复变体：封装了特性标志门控 + 父级空缺填补，
 * 使得 AgentTool.call 和 resumeAgentBackground 共享同一个实现。
 * 当 parentState 为 undefined 时返回 undefined（功能关闭）；
 * 否则从旁链记录重建，并用父级的实时替换填补 fork 继承的 mustReapply 条目的空缺。
 *
 * 保留在 AgentTool.tsx 之外 —— 该文件处于 feature() DCE 复杂性悬崖，
 * 无法在不静默破坏测试中 feature('TRANSCRIPT_CLASSIFIER') 评估的情况下
 * 容忍增加 +1 净源代码行。
 */
export function reconstructForSubagentResume(
  parentState: ContentReplacementState | undefined,
  resumedMessages: Message[],
  sidechainRecords: ContentReplacementRecord[],
): ContentReplacementState | undefined {
  if (!parentState) return undefined
  return reconstructContentReplacementState(
    resumedMessages,
    sidechainRecords,
    parentState.replacements,
  )
}
/**
 * 从文件系统错误中获取人类可读的错误信息
 */
function getFileSystemErrorMessage(error: Error): string {
  // Node.js 文件系统错误具有 'code' 属性 eslint-dis
  // able-next-line no-restricted-syntax — 使用 .path，而不仅仅是 .code
  const nodeError = error as NodeJS.ErrnoException
  if (nodeError.code) {
    switch (nodeError.code) {
      case 'ENOENT':
        return `目录未找到：${nodeError.path ?? 'unknown path'}`
      case 'EACCES':
        return `权限被拒绝：${nodeError.path ?? 'unknown path'}`
      case 'ENOSPC':
        return '设备空间不足'
      case 'EROFS':
        return '只读文件系统'
      case 'EMFILE':
        return '打开文件过多'
      case 'EEXIST':
        return `文件已存在：${nodeError.path ?? 'unknown path'}`
      default:
        return `${nodeError.code}: ${nodeError.message}`
    }
  }
  return error.message
}
