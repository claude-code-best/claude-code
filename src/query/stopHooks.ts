import { feature } from 'bun:bundle'
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js'
import { isExtractModeActive } from '../memdir/paths.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import type { ToolUseContext } from '../Tool.js'
import type { HookProgress } from '../types/hooks.js'
import type {
  AssistantMessage,
  Message,
  RequestStartEvent,
  StopHookInfo,
  StreamEvent,
  TombstoneMessage,
  ToolUseSummaryMessage,
} from '../types/message.js'
import { createAttachmentMessage } from '../utils/attachments.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import type { REPLHookContext } from '../utils/hooks/postSamplingHooks.js'
import {
  executeStopHooks,
  executeTaskCompletedHooks,
  executeTeammateIdleHooks,
  getStopHookMessage,
  getTaskCompletedHookMessage,
  getTeammateIdleHookMessage,
} from '../utils/hooks.js'
import {
  createStopHookSummaryMessage,
  createSystemMessage,
  createUserInterruptionMessage,
  createUserMessage,
} from '../utils/messages.js'
import type { SystemPrompt } from '../utils/systemPromptType.js'
import { getTaskListId, listTasks } from '../utils/tasks.js'
import { getAgentName, getTeamName, isTeammate } from '../utils/teammate.js'

/* eslint-disable @typescript-eslint/no-require-imports */
const extractMemoriesModule = feature('EXTRACT_MEMORIES')
  ? (require('../services/extractMemories/extractMemories.js') as typeof import('../services/extractMemories/extractMemories.js'))
  : null
const jobClassifierModule = feature('TEMPLATES')
  ? (require('../jobs/classifier.js') as typeof import('../jobs/classifier.js'))
  : null

/* eslint-enable @typescript-eslint/no-require-imports */

import type { QuerySource } from '../constants/querySource.js'
import { executeAutoDream } from '../services/autoDream/autoDream.js'
import { executePromptSuggestion } from '../services/PromptSuggestion/promptSuggestion.js'
import { isBareMode, isEnvDefinedFalsy } from '../utils/envUtils.js'
import {
  createCacheSafeParams,
  saveCacheSafeParams,
} from '../utils/forkedAgent.js'

type StopHookResult = {
  blockingErrors: Message[]
  preventContinuation: boolean
}

export async function* handleStopHooks(
  messagesForQuery: Message[],
  assistantMessages: AssistantMessage[],
  systemPrompt: SystemPrompt,
  userContext: { [k: string]: string },
  systemContext: { [k: string]: string },
  toolUseContext: ToolUseContext,
  querySource: QuerySource,
  stopHookActive?: boolean,
): AsyncGenerator<
  | StreamEvent
  | RequestStartEvent
  | Message
  | TombstoneMessage
  | ToolUseSummaryMessage,
  StopHookResult
> {
  const hookStartTime = Date.now()

  const stopHookContext: REPLHookContext = {
    messages: [...messagesForQuery, ...assistantMessages],
    systemPrompt,
    userContext,
    systemContext,
    toolUseContext,
    querySource,
  }
  // 仅为主会话查询保存参数 — 子代理不得覆盖。
  // 在提示建议门控之外：REPL 的 /btw 命令和 side_question SDK 控制请求都会读取此快照，
  // 两者都不依赖于是否启用了提示建议。
  if (querySource === 'repl_main_thread' || querySource === 'sdk') {
    saveCacheSafeParams(createCacheSafeParams(stopHookContext))
  }

  // 模板任务分类：当作为分派任务运行时，在每一轮后对状态进行分类。
  // 门控为 repl_main_thread，以便后台分支（extract-memories、auto-dream）不会用它们自己的助手消息污染时间线。
  // 等待分类器完成，以便在轮次返回之前写入 state.json — 否则 `claude list` 会在间隙中显示过时的状态。
  // 环境变量键为硬编码（与从 jobs/state 导入 JOB_ENV_KEY 相对），以匹配上面的 require() 门控 jobs/ 导入模式；spawn.test.ts 断言该字符串匹配。
  if (
    feature('TEMPLATES') &&
    process.env.CLAUDE_JOB_DIR &&
    querySource.startsWith('repl_main_thread') &&
    !toolUseContext.agentId
  ) {
    // 完整的轮次历史 — assistantMessages 在每个 queryLoop 迭代中重置，
    // 因此来自先前迭代（Agent 生成，然后摘要）的工具调用需要 messagesForQuery 在工具调用摘要中可见。
    const turnAssistantMessages = stopHookContext.messages.filter(
      (m): m is AssistantMessage => m.type === 'assistant',
    )
    const p = jobClassifierModule!
      .classifyAndWriteState(process.env.CLAUDE_JOB_DIR, turnAssistantMessages)
      .catch(err => {
        logForDebugging(`[job] 分类器错误：${errorMessage(err)}`, {
          level: 'error',
        })
      })
    await Promise.race([
      p,
      // eslint-disable-next-line no-restricted-syntax -- sleep() 没有 .unref()；计时器不得阻止退出
      new Promise<void>(r => setTimeout(r, 60_000).unref()),
    ])
  }
  // --bare / SIMPLE：跳过后台书签（提示建议、内存提取、自动 dream）。脚本化的 -p 调用不希望自动内存或派生代理在关闭期间争抢资源。
  // 穷鬼模式：同样跳过提示建议和内存提取。
  const poorMode = feature('POOR')
    ? (await import('../commands/poor/poorMode.js')).isPoorModeActive()
    : false
  if (!isBareMode()) {
    // 内联环境检查，用于外部构建中的死代码消除
    if (
      !isEnvDefinedFalsy(process.env.CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION) &&
      !poorMode
    ) {
      void executePromptSuggestion(stopHookContext)
    }
    if (
      feature('EXTRACT_MEMORIES') &&
      !toolUseContext.agentId &&
      isExtractModeActive() &&
      !poorMode
    ) {
      // 在交互式和非交互式模式下即发即弃。对于 -p/SDK，
      // print.ts 在刷新响应后但在 gracefulShutdownSync 之前排空进行中的 promise（参见 drainPendingExtraction）。
      /**
       * 动态记忆缓存
       */
      void extractMemoriesModule!.executeExtractMemories(
        stopHookContext,
        toolUseContext.appendSystemMessage as
          | ((msg: import('../types/message.js').SystemMessage) => void)
          | undefined,
      )
    }
    /**
     * AutoDream执行。各种记忆缓存合并。
     */
    if (!toolUseContext.agentId && !poorMode) {
      void executeAutoDream(stopHookContext, toolUseContext.appendSystemMessage)
    }
  }

  // chicago MCP：在轮次结束时自动取消隐藏 + 释放锁。
  // 仅主线程 — CU 锁是进程级的模块级变量，因此子代理的 stopHooks 释放它会导致主线程的清理
  // 看到 isLockHeldLocally()===false → 没有退出通知，并在轮次中间取消隐藏。子代理不启动 CU 会话，因此纯粹跳过。
  if (feature('CHICAGO_MCP') && !toolUseContext.agentId) {
    try {
      const { cleanupComputerUseAfterTurn } = await import(
        '../utils/computerUse/cleanup.js'
      )
      await cleanupComputerUseAfterTurn(toolUseContext)
    } catch {
      // 失败静默处理 — 这是试运行清理，不是关键路径
    }
  }

  try {
    const blockingErrors = []
    const appState = toolUseContext.getAppState()
    const permissionMode = appState.toolPermissionContext.mode

    const generator = executeStopHooks(
      permissionMode,
      toolUseContext.abortController.signal,
      undefined,
      stopHookActive ?? false,
      toolUseContext.agentId,
      toolUseContext,
      [...messagesForQuery, ...assistantMessages],
      toolUseContext.agentType,
    )

    // 消费所有进度消息并获取阻塞错误
    let stopHookToolUseID = ''
    let hookCount = 0
    let preventedContinuation = false
    let stopReason = ''
    let hasOutput = false
    const hookErrors: string[] = []
    const hookInfos: StopHookInfo[] = []

    for await (const result of generator) {
      if (result.message) {
        yield result.message
        // 从进度消息中跟踪 toolUseID 并计数钩子
        if (result.message.type === 'progress' && result.message.toolUseID) {
          stopHookToolUseID = result.message.toolUseID as string
          hookCount++
          // 从进度数据中提取钩子命令和提示文本
          const progressData = result.message.data as HookProgress
          if (progressData.command) {
            hookInfos.push({
              command: progressData.command,
              promptText: progressData.promptText,
            })
          }
        }
        // 从附件中跟踪错误和输出
        if (result.message.type === 'attachment') {
          const attachment = result.message.attachment!
          if (
            'hookEvent' in attachment &&
            (attachment.hookEvent === 'Stop' ||
              attachment.hookEvent === 'SubagentStop')
          ) {
            if (attachment.type === 'hook_non_blocking_error') {
              hookErrors.push(
                (attachment.stderr as string) ||
                  `退出码 ${attachment.exitCode}`,
              )
              // 非阻塞错误总是有输出
              hasOutput = true
            } else if (attachment.type === 'hook_error_during_execution') {
              hookErrors.push(attachment.content as string)
              hasOutput = true
            } else if (attachment.type === 'hook_success') {
              // 检查成功的钩子是否产生了任何 stdout/stderr
              if (
                (attachment.stdout && (attachment.stdout as string).trim()) ||
                (attachment.stderr && (attachment.stderr as string).trim())
              ) {
                hasOutput = true
              }
            }
            // 提取每个钩子的持续时间，用于时间可见性。
            // 钩子并行运行；通过 command + 第一个未分配的条目进行匹配。
            if ('durationMs' in attachment && 'command' in attachment) {
              const info = hookInfos.find(
                i =>
                  i.command === attachment.command &&
                  i.durationMs === undefined,
              )
              if (info) {
                info.durationMs = attachment.durationMs as number
              }
            }
          }
        }
      }
      if (result.blockingError) {
        const userMessage = createUserMessage({
          content: getStopHookMessage(result.blockingError),
          isMeta: true, // 在 UI 中隐藏（改为在摘要消息中显示）
        })
        blockingErrors.push(userMessage)
        yield userMessage
        hasOutput = true
        // 将阻塞错误添加到 hookErrors 中，以便出现在摘要中
        hookErrors.push(result.blockingError.blockingError)
      }
      // 检查钩子是否希望阻止继续
      if (result.preventContinuation) {
        preventedContinuation = true
        stopReason = result.stopReason || 'Stop 钩子阻止了继续'
        // 创建附件以跟踪停止的继续（用于结构化数据）
        yield createAttachmentMessage({
          type: 'hook_stopped_continuation',
          message: stopReason,
          hookName: 'Stop',
          toolUseID: stopHookToolUseID,
          hookEvent: 'Stop',
        })
      }

      // 检查钩子执行期间是否被中止
      if (toolUseContext.abortController.signal.aborted) {
        logEvent('tengu_pre_stop_hooks_cancelled', {
          queryChainId: toolUseContext.queryTracking
            ?.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,

          queryDepth: toolUseContext.queryTracking?.depth,
        })
        yield createUserInterruptionMessage({
          toolUse: false,
        })
        return { blockingErrors: [], preventContinuation: true }
      }
    }

    // 如果钩子运行过，创建摘要系统消息
    if (hookCount > 0) {
      yield createStopHookSummaryMessage(
        hookCount,
        hookInfos,
        hookErrors,
        preventedContinuation,
        stopReason,
        hasOutput,
        'suggestion',
        stopHookToolUseID,
      )

      // 发送有关错误的通知（在详细/记录模式下通过 ctrl+o 显示）
      if (hookErrors.length > 0) {
        const expandShortcut = getShortcutDisplay(
          'app:toggleTranscript',
          'Global',
          'ctrl+o',
        )
        toolUseContext.addNotification?.({
          key: 'stop-hook-error',
          text: `Stop 钩子发生错误 · ${expandShortcut} 查看详情`,
          priority: 'immediate',
        })
      }
    }

    if (preventedContinuation) {
      return { blockingErrors: [], preventContinuation: true }
    }

    // 收集 Stop 钩子中的阻塞错误
    if (blockingErrors.length > 0) {
      return { blockingErrors, preventContinuation: false }
    }

    // 在 Stop 钩子通过后，如果这是队友，则运行 TeammateIdle 和 TaskCompleted 钩子
    if (isTeammate()) {
      const teammateName = getAgentName() ?? ''
      const teamName = getTeamName() ?? ''
      const teammateBlockingErrors: Message[] = []
      let teammatePreventedContinuation = false
      let teammateStopReason: string | undefined
      // 每个钩子执行器生成自己的 toolUseID — 从进度消息中捕获（与 L142 处的 stopHookToolUseID 模式相同），而不是使用 Stop ID。
      let teammateHookToolUseID = ''

      // 为此队友拥有的任何进行中的任务运行 TaskCompleted 钩子
      const taskListId = getTaskListId()
      const tasks = await listTasks(taskListId)
      const inProgressTasks = tasks.filter(
        t => t.status === 'in_progress' && t.owner === teammateName,
      )

      for (const task of inProgressTasks) {
        const taskCompletedGenerator = executeTaskCompletedHooks(
          task.id,
          task.subject,
          task.description,
          teammateName,
          teamName,
          permissionMode,
          toolUseContext.abortController.signal,
          undefined,
          toolUseContext,
        )

        for await (const result of taskCompletedGenerator) {
          if (result.message) {
            if (
              result.message.type === 'progress' &&
              result.message.toolUseID
            ) {
              teammateHookToolUseID = result.message.toolUseID as string
            }
            yield result.message
          }
          if (result.blockingError) {
            const userMessage = createUserMessage({
              content: getTaskCompletedHookMessage(result.blockingError),
              isMeta: true,
            })
            teammateBlockingErrors.push(userMessage)
            yield userMessage
          }
          // 匹配 Stop 钩子行为：允许 preventContinuation/stopReason
          if (result.preventContinuation) {
            teammatePreventedContinuation = true
            teammateStopReason =
              result.stopReason || 'TaskCompleted 钩子阻止了继续'
            yield createAttachmentMessage({
              type: 'hook_stopped_continuation',
              message: teammateStopReason,
              hookName: 'TaskCompleted',
              toolUseID: teammateHookToolUseID,
              hookEvent: 'TaskCompleted',
            })
          }
          if (toolUseContext.abortController.signal.aborted) {
            return { blockingErrors: [], preventContinuation: true }
          }
        }
      }

      // 运行 TeammateIdle 钩子
      const teammateIdleGenerator = executeTeammateIdleHooks(
        teammateName,
        teamName,
        permissionMode,
        toolUseContext.abortController.signal,
      )

      for await (const result of teammateIdleGenerator) {
        if (result.message) {
          if (result.message.type === 'progress' && result.message.toolUseID) {
            teammateHookToolUseID = result.message.toolUseID as string
          }
          yield result.message
        }
        if (result.blockingError) {
          const userMessage = createUserMessage({
            content: getTeammateIdleHookMessage(result.blockingError),
            isMeta: true,
          })
          teammateBlockingErrors.push(userMessage)
          yield userMessage
        }
        // 匹配 Stop 钩子行为：允许 preventContinuation/stopReason
        if (result.preventContinuation) {
          teammatePreventedContinuation = true
          teammateStopReason =
            result.stopReason || 'TeammateIdle 钩子阻止了继续'
          yield createAttachmentMessage({
            type: 'hook_stopped_continuation',
            message: teammateStopReason,
            hookName: 'TeammateIdle',
            toolUseID: teammateHookToolUseID,
            hookEvent: 'TeammateIdle',
          })
        }
        if (toolUseContext.abortController.signal.aborted) {
          return { blockingErrors: [], preventContinuation: true }
        }
      }

      if (teammatePreventedContinuation) {
        return { blockingErrors: [], preventContinuation: true }
      }

      if (teammateBlockingErrors.length > 0) {
        return {
          blockingErrors: teammateBlockingErrors,
          preventContinuation: false,
        }
      }
    }

    return { blockingErrors: [], preventContinuation: false }
  } catch (error) {
    const durationMs = Date.now() - hookStartTime
    logEvent('tengu_stop_hook_error', {
      duration: durationMs,

      queryChainId: toolUseContext.queryTracking
        ?.chainId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      queryDepth: toolUseContext.queryTracking?.depth,
    })
    // 生成一条用户不可见的系统消息，用于帮助用户调试其钩子。
    yield createSystemMessage(
      `Stop 钩子失败：${errorMessage(error)}`,
      'warning',
    )
    return { blockingErrors: [], preventContinuation: false }
  }
}
