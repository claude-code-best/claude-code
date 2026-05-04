/**
 * 从当前会话记录中提取持久化记忆，并将其写入自动内存目录（~/.claude/projects/<路径>/memory/）。
 *
 * 它在每个完整查询循环结束时（当模型生成不带工具调用的最终响应时）通过 stopHooks.ts 中的 handleStopHooks 运行一次。
 *
 * 使用派生代理模式（runForkedAgent）—— 一个完美复制主对话并共享父级提示缓存的代理。
 *
 * 状态位于 initExtractMemories() 内部的闭包作用域中，而非模块级，这与 confidenceRating.ts 的模式相同。
 * 测试在 beforeEach 中调用 initExtractMemories() 以获得一个新的闭包。
 */

import { feature } from 'bun:bundle'
import { basename } from 'path'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import type { CanUseToolFn } from '../../hooks/useCanUseTool.js'
import { ENTRYPOINT_NAME } from '../../memdir/memdir.js'
import {
  formatMemoryManifest,
  scanMemoryFiles,
} from '../../memdir/memoryScan.js'
import {
  getAutoMemPath,
  isAutoMemoryEnabled,
  isAutoMemPath,
} from '../../memdir/paths.js'
import type { Tool } from '../../Tool.js'
import { BASH_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/GrepTool/prompt.js'
import { REPL_TOOL_NAME } from '@claude-code-best/builtin-tools/tools/REPLTool/constants.js'
import type {
  AssistantMessage,
  Message,
  SystemLocalCommandMessage,
  SystemMessage,
} from '../../types/message.js'
import { createAbortController } from '../../utils/abortController.js'
import { count, uniq } from '../../utils/array.js'
import { logForDebugging } from '../../utils/debug.js'
import {
  createCacheSafeParams,
  runForkedAgent,
} from '../../utils/forkedAgent.js'
import type { REPLHookContext } from '../../utils/hooks/postSamplingHooks.js'
import {
  createMemorySavedMessage,
  createUserMessage,
} from '../../utils/messages.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../analytics/growthbook.js'
import { logEvent } from '../analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../analytics/metadata.js'
import {
  buildExtractAutoOnlyPrompt,
  buildExtractCombinedPrompt,
} from './prompts.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const teamMemPaths = feature('TEAMMEM')
  ? (require('../../memdir/teamMemPaths.js') as typeof import('../../memdir/teamMemPaths.js'))
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 如果一条消息对模型可见（在 API 调用中发送），则返回 true。
 * 排除进度、系统和附件消息。
 */
function isModelVisibleMessage(message: Message): boolean {
  return message.type === 'user' || message.type === 'assistant'
}

function countModelVisibleMessagesSince(
  messages: Message[],
  sinceUuid: string | undefined,
): number {
  if (sinceUuid === null || sinceUuid === undefined) {
    return count(messages, isModelVisibleMessage)
  }

  let foundStart = false
  let n = 0
  for (const message of messages) {
    if (!foundStart) {
      if (message.uuid === sinceUuid) {
        foundStart = true
      }
      continue
    }
    if (isModelVisibleMessage(message)) {
      n++
    }
  }
  // 如果未找到 sinceUuid（例如被上下文压缩移除），则回退到计数所有模型可见消息，而不是返回 0，
  // 否则会永久禁用会话剩余部分的提取。
  if (!foundStart) {
    return count(messages, isModelVisibleMessage)
  }
  return n
}

/**
 * 如果游标 UUID 之后的任何助手消息包含针对自动内存路径的 Write/Edit tool_use 块，则返回 true。
 *
 * 主代理的提示具有完整的保存指令 —— 当它写入记忆时，派生的提取是多余的。runExtraction 跳过代理并将游标移过此范围，
 * 使得主代理和后台代理每轮互斥。
 */
function hasMemoryWritesSince(
  messages: Message[],
  sinceUuid: string | undefined,
): boolean {
  let foundStart = sinceUuid === undefined
  for (const message of messages) {
    if (!foundStart) {
      if (message.uuid === sinceUuid) {
        foundStart = true
      }
      continue
    }
    if (message.type !== 'assistant') {
      continue
    }
    const content = (message as AssistantMessage).message.content
    if (!Array.isArray(content)) {
      continue
    }
    for (const block of content) {
      const filePath = getWrittenFilePath(block)
      if (filePath !== undefined && isAutoMemPath(filePath)) {
        return true
      }
    }
  }
  return false
}

// ============================================================================
// 工具权限
// ============================================================================

function denyAutoMemTool(tool: Tool, reason: string) {
  logForDebugging(`[autoMem] 拒绝 ${tool.name}：${reason}`)
  logEvent('tengu_auto_mem_tool_denied', {
    tool_name: sanitizeToolNameForAnalytics(tool.name),
  })
  return {
    behavior: 'deny' as const,
    message: reason,
    decisionReason: { type: 'other' as const, reason },
  }
}

/**
 * 创建一个 canUseTool 函数，允许不受限制的 Read/Grep/Glob、只读的 Bash 命令，
 * 以及仅针对自动内存目录内路径的 Edit/Write。由 extractMemories 和 autoDream 共享。
 */
export function createAutoMemCanUseTool(memoryDir: string): CanUseToolFn {
  return async (tool: Tool, input: Record<string, unknown>) => {
    // 允许 REPL — 当 REPL 模式启用时（ant 默认），原始工具会从工具列表中隐藏，
    // 以便派生代理转而调用 REPL。REPL 的 VM 上下文会为每个内部原始工具重新调用此 canUseTool
    // （toolWrappers.ts 中的 createToolWrapper），因此下面的 Read/Bash/Edit/Write 检查仍然会
    // 门控实际的文件和 shell 操作。给派生代理一个不同的工具列表会破坏提示缓存共享
    // （工具是缓存键的一部分 — 参见 forkedAgent.ts 中的 CacheSafeParams）。
    if (tool.name === REPL_TOOL_NAME) {
      return { behavior: 'allow' as const, updatedInput: input }
    }

    // 允许不受限制的 Read/Grep/Glob — 它们都是只读的
    if (
      tool.name === FILE_READ_TOOL_NAME ||
      tool.name === GREP_TOOL_NAME ||
      tool.name === GLOB_TOOL_NAME
    ) {
      return { behavior: 'allow' as const, updatedInput: input }
    }

    // 仅允许通过 BashTool.isReadOnly 检查的 Bash 命令。
    // 这里的 `tool` 就是 BashTool — 不需要静态导入。
    if (tool.name === BASH_TOOL_NAME) {
      const parsed = tool.inputSchema.safeParse(input)
      if (parsed.success && tool.isReadOnly(parsed.data)) {
        return { behavior: 'allow' as const, updatedInput: input }
      }
      return denyAutoMemTool(
        tool,
        '此上下文中只允许执行只读的 shell 命令（ls, find, grep, cat, stat, wc, head, tail 等）',
      )
    }

    if (
      (tool.name === FILE_EDIT_TOOL_NAME ||
        tool.name === FILE_WRITE_TOOL_NAME) &&
      'file_path' in input
    ) {
      const filePath = input.file_path
      if (typeof filePath === 'string' && isAutoMemPath(filePath)) {
        return { behavior: 'allow' as const, updatedInput: input }
      }
    }

    return denyAutoMemTool(
      tool,
      `只允许 ${FILE_READ_TOOL_NAME}、${GREP_TOOL_NAME}、${GLOB_TOOL_NAME}、只读的 ${BASH_TOOL_NAME} 以及 ${memoryDir} 内的 ${FILE_EDIT_TOOL_NAME}/${FILE_WRITE_TOOL_NAME}`,
    )
  }
}

// ============================================================================
// 从代理输出中提取文件路径
// ============================================================================

/**
 * 从 tool_use 块的输入中提取 file_path（如果存在）。
 * 当块不是 Edit/Write 工具使用或没有 file_path 时返回 undefined。
 */
function getWrittenFilePath(block: {
  type: string
  name?: string
  input?: unknown
}): string | undefined {
  if (
    block.type !== 'tool_use' ||
    (block.name !== FILE_EDIT_TOOL_NAME && block.name !== FILE_WRITE_TOOL_NAME)
  ) {
    return undefined
  }
  const input = block.input
  if (typeof input === 'object' && input !== null && 'file_path' in input) {
    const fp = (input as { file_path: unknown }).file_path
    return typeof fp === 'string' ? fp : undefined
  }
  return undefined
}

function extractWrittenPaths(agentMessages: Message[]): string[] {
  const paths: string[] = []
  for (const message of agentMessages) {
    if (message.type !== 'assistant') {
      continue
    }
    const content = (message as AssistantMessage).message.content
    if (!Array.isArray(content)) {
      continue
    }
    for (const block of content) {
      const filePath = getWrittenFilePath(block)
      if (filePath !== undefined) {
        paths.push(filePath)
      }
    }
  }
  return uniq(paths)
}

// ============================================================================
// 初始化与闭包作用域状态
// ============================================================================

type AppendSystemMessageFn = (msg: SystemMessage) => void

/** 活动的提取器函数，由 initExtractMemories() 设置。 */
let extractor:
  | ((
      context: REPLHookContext,
      appendSystemMessage?: AppendSystemMessageFn,
    ) => Promise<void>)
  | null = null

/** 活动的排空函数，由 initExtractMemories() 设置。在初始化之前是无操作的。 */
let drainer: (timeoutMs?: number) => Promise<void> = async () => {}

/**
 * 初始化记忆提取系统。
 * 创建一个新的闭包，捕获所有可变状态（游标位置、重叠保护、待处理上下文）。
 * 在启动时与 initConfidenceRating/initPromptCoaching 一起调用一次，或者在每个测试的 beforeEach 中调用。
 */
export function initExtractMemories(): void {
  // --- 闭包作用域的可变状态 ---

  /** 提取器派发且尚未解决的每个 Promise。
   * 合并调用会存储并返回快速解决的 Promise（无害）；真正开始工作的调用会添加一个覆盖整个
   * 后续运行链的 Promise（通过 runExtraction 的递归 finally）。 */
  const inFlightExtractions = new Set<Promise<void>>()

  /** 最后处理的消息的 UUID — 游标，使得每次运行仅考虑自上次提取以来新增的消息。 */
  let lastMemoryMessageUuid: string | undefined

  /** 一次性标志：一旦记录门控已禁用，不再重复。 */
  let hasLoggedGateFailure = false

  /** 当 runExtraction 正在执行时为 true — 防止重叠运行。 */
  let inProgress = false

  /** 自上次提取运行以来符合条件的轮次数。每次运行后重置为 0。 */
  let turnsSinceLastExtraction = 0

  /** 当一次调用到达时，如果正在运行，我们将上下文暂存在这里，并在当前运行完成后执行一次尾部提取。 */
  let pendingContext:
    | {
        context: REPLHookContext
        appendSystemMessage?: AppendSystemMessageFn
      }
    | undefined

  // --- 内部提取逻辑 ---

  async function runExtraction({
    context,
    appendSystemMessage,
    isTrailingRun,
  }: {
    context: REPLHookContext
    appendSystemMessage?: AppendSystemMessageFn
    isTrailingRun?: boolean
  }): Promise<void> {
    const { messages } = context
    const memoryDir = getAutoMemPath()
    const newMessageCount = countModelVisibleMessagesSince(
      messages,
      lastMemoryMessageUuid,
    )

    // 互斥：当主代理写入了记忆时，跳过派生代理并将游标移过此范围，
    // 以便下一次提取仅考虑主代理写入之后的消息。
    if (hasMemoryWritesSince(messages, lastMemoryMessageUuid)) {
      logForDebugging('[extractMemories] 跳过 — 对话已直接写入内存文件')
      const lastMessage = messages.at(-1)
      if (lastMessage?.uuid) {
        lastMemoryMessageUuid = lastMessage.uuid
      }
      logEvent('tengu_extract_memories_skipped_direct_write', {
        message_count: newMessageCount,
      })
      return
    }

    const teamMemoryEnabled = feature('TEAMMEM')
      ? teamMemPaths!.isTeamMemoryEnabled()
      : false

    const skipIndex = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_moth_copse',
      false,
    )

    const canUseTool = createAutoMemCanUseTool(memoryDir)
    const cacheSafeParams = createCacheSafeParams(context)

    // 仅在每 N 个符合条件的轮次运行提取（tengu_bramble_lintel，默认 1）。
    // 尾部提取（来自暂存的上下文）跳过此检查，因为它们处理的是已经提交的工作，不应被限流。
    if (!isTrailingRun) {
      turnsSinceLastExtraction++
      if (
        turnsSinceLastExtraction <
        (getFeatureValue_CACHED_MAY_BE_STALE('tengu_bramble_lintel', null) ?? 1)
      ) {
        return
      }
    }
    turnsSinceLastExtraction = 0

    inProgress = true
    const startTime = Date.now()
    try {
      logForDebugging(
        `[extractMemories] 开始 — ${newMessageCount} 条新消息，memoryDir=${memoryDir}`,
      )

      // 预注入内存目录清单，以免代理花费一轮执行 `ls`。重用 findRelevantMemories 的前置元数据扫描。
      // 放在限流门控之后，以便跳过的轮次不付出扫描成本。
      const existingMemories = formatMemoryManifest(
        await scanMemoryFiles(memoryDir, createAbortController().signal),
      )

      const userPrompt =
        feature('TEAMMEM') && teamMemoryEnabled
          ? buildExtractCombinedPrompt(
              newMessageCount,
              existingMemories,
              skipIndex,
            )
          : buildExtractAutoOnlyPrompt(
              newMessageCount,
              existingMemories,
              skipIndex,
            )

      const result = await runForkedAgent({
        promptMessages: [createUserMessage({ content: userPrompt })],
        cacheSafeParams,
        canUseTool,
        querySource: 'extract_memories',
        forkLabel: 'extract_memories',
        // extractMemories 子代理不需要记录到对话记录中。
        // 这样做可能与主线程产生竞争条件。
        skipTranscript: true,
        // 行为良好的提取应在 2-4 轮内完成（读取 → 写入）。
        // 硬上限可防止验证过程消耗过多轮次。
        maxTurns: 5,
      })

      // 仅在成功运行后推进游标。如果代理出错（在下面被捕获），游标保持不变，
      // 以便在下一次提取时重新考虑这些消息。
      const lastMessage = messages.at(-1)
      if (lastMessage?.uuid) {
        lastMemoryMessageUuid = lastMessage.uuid
      }

      const writtenPaths = extractWrittenPaths(result.messages)
      const turnCount = count(result.messages, m => m.type === 'assistant')

      const totalInput =
        result.totalUsage.input_tokens +
        result.totalUsage.cache_creation_input_tokens +
        result.totalUsage.cache_read_input_tokens
      const hitPct =
        totalInput > 0
          ? (
              (result.totalUsage.cache_read_input_tokens / totalInput) *
              100
            ).toFixed(1)
          : '0.0'
      logForDebugging(
        `[extractMemories] 完成 — 写入 ${writtenPaths.length} 个文件，缓存：读取=${result.totalUsage.cache_read_input_tokens} 创建=${result.totalUsage.cache_creation_input_tokens} 输入=${result.totalUsage.input_tokens}（命中率 ${hitPct}%）`,
      )

      if (writtenPaths.length > 0) {
        logForDebugging(
          `[extractMemories] 已保存记忆：${writtenPaths.join(', ')}`,
        )
      } else {
        logForDebugging('[extractMemories] 本次运行未保存记忆')
      }

      // 索引文件的更新是机械性的 — 代理会修改 MEMORY.md 以添加主题链接，
      // 但对用户可见的“记忆”是主题文件本身。
      const memoryPaths = writtenPaths.filter(
        p => basename(p) !== ENTRYPOINT_NAME,
      )
      const teamCount = feature('TEAMMEM')
        ? count(memoryPaths, teamMemPaths!.isTeamMemPath)
        : 0

      // 记录提取事件，包含派生代理的使用情况
      logEvent('tengu_extract_memories_extraction', {
        input_tokens: result.totalUsage.input_tokens,
        output_tokens: result.totalUsage.output_tokens,
        cache_read_input_tokens: result.totalUsage.cache_read_input_tokens,
        cache_creation_input_tokens:
          result.totalUsage.cache_creation_input_tokens,
        message_count: newMessageCount,
        turn_count: turnCount,
        files_written: writtenPaths.length,
        memories_saved: memoryPaths.length,
        team_memories_saved: teamCount,
        duration_ms: Date.now() - startTime,
      })

      logForDebugging(
        `[extractMemories] writtenPaths=${writtenPaths.length} memoryPaths=${memoryPaths.length} appendSystemMessage defined=${appendSystemMessage != null}`,
      )
      if (memoryPaths.length > 0) {
        const msg = createMemorySavedMessage(memoryPaths)
        if (feature('TEAMMEM')) {
          msg.teamCount = teamCount
        }
        appendSystemMessage?.(msg)
      }
    } catch (error) {
      // 提取是尽力而为的 — 记录错误但不要通知
      logForDebugging(`[extractMemories] 错误：${error}`)
      logEvent('tengu_extract_memories_error', {
        duration_ms: Date.now() - startTime,
      })
    } finally {
      inProgress = false

      // 如果在运行时有一次调用到达，则使用最新的暂存上下文运行一次尾部提取。
      // 尾部运行将根据我们刚刚推进的游标计算它的 newMessageCount — 因此它只提取两次调用之间新增的消息，而不是整个历史。
      const trailing = pendingContext
      pendingContext = undefined
      if (trailing) {
        logForDebugging('[extractMemories] 为暂存的上下文运行尾部提取')
        await runExtraction({
          context: trailing.context,
          appendSystemMessage: trailing.appendSystemMessage,
          isTrailingRun: true,
        })
      }
    }
  }

  // --- 公共入口（由 extractor 捕获）---

  async function executeExtractMemoriesImpl(
    context: REPLHookContext,
    appendSystemMessage?: AppendSystemMessageFn,
  ): Promise<void> {
    // 仅为主代理运行，而不是子代理
    if (context.toolUseContext.agentId) {
      return
    }

    if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_passport_quail', false)) {
      if (process.env.USER_TYPE === 'ant' && !hasLoggedGateFailure) {
        hasLoggedGateFailure = true
        logEvent('tengu_extract_memories_gate_disabled', {})
      }
      return
    }

    // 检查自动内存是否启用
    if (!isAutoMemoryEnabled()) {
      return
    }

    // 在远程模式下跳过
    if (getIsRemoteMode()) {
      return
    }

    // 如果提取已经在进行中，将此上下文暂存用于尾部运行（覆盖任何先前暂存的上下文 — 只有最新的重要，因为它包含最多的消息）。
    if (inProgress) {
      logForDebugging('[extractMemories] 提取正在进行中 — 暂存用于尾部运行')
      logEvent('tengu_extract_memories_coalesced', {})
      pendingContext = { context, appendSystemMessage }
      return
    }

    await runExtraction({ context, appendSystemMessage })
  }

  extractor = async (context, appendSystemMessage) => {
    const p = executeExtractMemoriesImpl(context, appendSystemMessage)
    inFlightExtractions.add(p)
    try {
      await p
    } finally {
      inFlightExtractions.delete(p)
    }
  }

  drainer = async (timeoutMs = 60_000) => {
    if (inFlightExtractions.size === 0) return
    await Promise.race([
      Promise.all(inFlightExtractions).catch(() => {}),
      // eslint-disable-next-line no-restricted-syntax -- sleep() 没有 .unref()；计时器不得阻止退出
      new Promise<void>(r => setTimeout(r, timeoutMs).unref()),
    ])
  }
}

// ============================================================================
// 公共 API
// ============================================================================

/**
 * 在查询循环结束时运行内存提取。
 * 在 handleStopHooks 中即发即弃地调用，与提示建议/指导并列。
 * 在调用 initExtractMemories() 之前是无操作的。
 */
export async function executeExtractMemories(
  context: REPLHookContext,
  appendSystemMessage?: AppendSystemMessageFn,
): Promise<void> {
  await extractor?.(context, appendSystemMessage)
}

/**
 * 等待所有进行中的提取（包括尾部暂存运行）完成，带有一个软超时。
 * 由 print.ts 在响应刷新之后、gracefulShutdownSync 之前调用，以便派生代理在 5 秒关闭安全阀杀死它之前完成。
 * 在调用 initExtractMemories() 之前是无操作的。
 */
export async function drainPendingExtraction(
  timeoutMs?: number,
): Promise<void> {
  await drainer(timeoutMs)
}
