/** * 对话清理工具。
 * 此模块依赖较重，应尽可能延迟加载。 */
import { feature } from 'bun:bundle'
import { randomUUID, type UUID } from 'crypto'
import { getReplBridgeHandle } from '../../bridge/replBridgeHandle.js'
import {
  getLastMainRequestId,
  getOriginalCwd,
  getSessionId,
  regenerateSessionId,
  resetCostState,
  setLastAPIRequest,
  setLastAPIRequestMessages,
  setLastClassifierRequests,
} from '../../bootstrap/state.js'
import type { SDKStatusMessage } from '../../entrypoints/sdk/coreTypes.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import type { AppState } from '../../state/AppState.js'
import { isInProcessTeammateTask } from '../../tasks/InProcessTeammateTask/types.js'
import {
  isLocalAgentTask,
  type LocalAgentTaskState,
} from '../../tasks/LocalAgentTask/LocalAgentTask.js'
import { isLocalShellTask } from '../../tasks/LocalShellTask/guards.js'
import { asAgentId } from '../../types/ids.js'
import type { Message } from '../../types/message.js'
import { createEmptyAttributionState } from '../../utils/commitAttribution.js'
import type { FileStateCache } from '../../utils/fileStateCache.js'
import {
  executeSessionEndHooks,
  getSessionEndHookTimeoutMs,
} from '../../utils/hooks.js'
import { logError } from '../../utils/log.js'
import { clearAllPlanSlugs } from '../../utils/plans.js'
import { setCwd } from '../../utils/Shell.js'
import { processSessionStartHooks } from '../../utils/sessionStart.js'
import {
  clearSessionMetadata,
  getAgentTranscriptPath,
  resetSessionFilePointer,
  saveWorktreeState,
} from '../../utils/sessionStorage.js'
import {
  evictTaskOutput,
  initTaskOutputAsSymlink,
} from '../../utils/task/diskOutput.js'
import { getCurrentWorktreeSession } from '../../utils/worktree.js'
import { clearSessionCaches } from './caches.js'

function notifyRemoteConversationCleared(): void {
  const handle = getReplBridgeHandle()
  if (!handle) return
  handle.markTranscriptReset?.()

  const message: SDKStatusMessage = {
    type: 'status',
    subtype: 'status',
    status: 'conversation_cleared',
    message: 'conversation_cleared',
    uuid: randomUUID(),
  }
  handle.writeSdkMessages([message])
}

export async function clearConversation({
  setMessages,
  readFileState,
  discoveredSkillNames,
  loadedNestedMemoryPaths,
  getAppState,
  setAppState,
  setConversationId,
}: {
  setMessages: (updater: (prev: Message[]) => Message[]) => void
  readFileState: FileStateCache
  discoveredSkillNames?: Set<string>
  loadedNestedMemoryPaths?: Set<string>
  getAppState?: () => AppState
  setAppState?: (f: (prev: AppState) => AppState) => void
  setConversationId?: (id: UUID) => void
}): Promise<void> {
  // 在清理前执行 SessionEnd 钩子（受限于
  // CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS，默认 1.5 秒）
  const sessionEndTimeoutMs = getSessionEndHookTimeoutMs()
  await executeSessionEndHooks('clear', {
    getAppState,
    setAppState,
    signal: AbortSignal.timeout(sessionEndTimeoutMs),
    timeoutMs: sessionEndTimeoutMs,
  })

  // 通知推理服务此对话的缓存可以被驱逐。
  const lastRequestId = getLastMainRequestId()
  if (lastRequestId) {
    logEvent('tengu_cache_eviction_hint', {
      scope:
        'conversation_clear' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      last_request_id:
        lastRequestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
  }

  // 预先计算需保留的任务，使其在各代理中的状态能在后续
  // 缓存清除中得以保留。除非任务明确设置了
  // isBackgrounded === false，否则将被保留。主会话任务（Ctrl+B）会被保留——
  // 它们写入独立的每任务记录，并在代理
  // 上下文中运行，因此在会话 ID 重新生成时是安全的。参见
  // LocalMainSessionTask.ts 中的 startBackgroundSession。
  const preservedAgentIds = new Set<string>()
  const preservedLocalAgents: LocalAgentTaskState[] = []
  const shouldKillTask = (task: AppState['tasks'][string]): boolean =>
    'isBackgrounded' in task && task.isBackgrounded === false
  if (getAppState) {
    for (const task of Object.values(getAppState().tasks)) {
      if (shouldKillTask(task)) continue
      if (isLocalAgentTask(task)) {
        preservedAgentIds.add(task.agentId)
        preservedLocalAgents.push(task)
      } else if (isInProcessTeammateTask(task)) {
        preservedAgentIds.add(task.identity.agentId)
      }
    }
  }

  setMessages(() => [])
  notifyRemoteConversationCleared()

  // 清除上下文阻塞标志，以便在 /clear 后恢复主动轮询
  if (feature('PROACTIVE') || feature('KAIROS')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { setContextBlocked } = require('../../proactive/index.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    setContextBlocked(false)
  }

  // 通过更新 conversationId 强制重新渲染徽标
  if (setConversationId) {
    setConversationId(randomUUID())
  }

  // 清除所有与会话相关的缓存。已保留的后台任务
  // （已调用的技能、待处理的权限回调、转储状态、缓存中断
  // 跟踪）在各代理中的状态将被保留，以便这些代理继续运行。
  clearSessionCaches(preservedAgentIds)

  // Clear large STATE-held data that outlives the message array.
  // lastAPIRequestMessages can hold the full post-compaction conversation
  // (hundreds of KB–MB) for /share; resetCostState clears modelUsage.
  setLastAPIRequest(null)
  setLastAPIRequestMessages(null)
  setLastClassifierRequests(null)
  resetCostState()

  setCwd(getOriginalCwd())
  readFileState.clear()
  discoveredSkillNames?.clear()
  loadedNestedMemoryPaths?.clear()

  // 从应用状态中清理必要的项目
  if (setAppState) {
    setAppState(prev => {
      // 使用上面计算的相同谓词对任务进行分区：
      // 终止并移除前台任务，保留其他所有任务。
      const nextTasks: AppState['tasks'] = {}
      for (const [taskId, task] of Object.entries(prev.tasks)) {
        if (!shouldKillTask(task)) {
          nextTasks[taskId] = task
          continue
        }
        // 前台任务：终止并从状态中移除
        try {
          if (task.status === 'running') {
            if (isLocalShellTask(task)) {
              task.shellCommand?.kill()
              task.shellCommand?.cleanup()
              if (task.cleanupTimeoutId) {
                clearTimeout(task.cleanupTimeoutId)
              }
            }
            if ('abortController' in task) {
              task.abortController?.abort()
            }
            if ('unregisterCleanup' in task) {
              task.unregisterCleanup?.()
            }
          }
        } catch (error) {
          logError(error)
        }
        void evictTaskOutput(taskId)
      }

      return {
        ...prev,
        tasks: nextTasks,
        attribution: createEmptyAttributionState(),
        // 清除独立代理上下文（由 /rename、/color 设置的名称/颜色）
        // 以便新会话不会显示旧会话的身份徽章
        standaloneAgentContext: undefined,
        fileHistory: {
          snapshots: [],
          trackedFiles: new Set(),
          snapshotSequence: 0,
        },
        // 将 MCP 状态重置为默认值以触发重新初始化。
        // 保留 pluginReconnectKey，以免 /clear 导致无操作
        // （该键仅在 /reload-plugins 时更新）。
        mcp: {
          clients: [],
          tools: [],
          commands: [],
          resources: {},
          pluginReconnectKey: prev.mcp.pluginReconnectKey,
        },
      }
    })
  }

  // 清除计划 slug 缓存，以便在 /clear 后使用新的计划文件
  clearAllPlanSlugs()

  // 清除缓存的会话元数据（标题、标签、代理名称/颜色）
  // 以便新会话不会继承先前会话的身份
  clearSessionMetadata()

  // 生成新的会话 ID 以提供全新状态
  // 将旧会话设置为父会话，用于分析血缘追踪
  regenerateSessionId({ setCurrentAsParent: true })
  // 更新环境变量，使子进程使用新的会话 ID
  if (process.env.USER_TYPE === 'ant' && process.env.CLAUDE_CODE_SESSION_ID) {
    process.env.CLAUDE_CODE_SESSION_ID = getSessionId()
  }
  await resetSessionFilePointer()

  // 保留的 local_agent 任务在生成时，其 TaskOutput 符号链接已基于
  // 旧会话 ID 创建，但清理后的转录写入位于新会话目录下
  // （appendEntry 会重新读取 getSessionId()）。重新指向符号链接，
  // 使 TaskOutput 读取实时文件而非冻结的清理前快照。仅重新指向运行中的任务——
  // 已完成的任务不会再写入，重新指向会将有效符号链接替换为悬空链接。
  // 再次，重新指向会用无效的符号链接替换有效的符号链接。
  // 主会话任务使用相同的每个代理路径（它们通过 recordSidechainTranscript
  // 写入 getAgentTranscriptPath），因此无需特殊处理。
  for (const task of preservedLocalAgents) {
    if (task.status !== 'running') continue
    void initTaskOutputAsSymlink(
      task.id,
      getAgentTranscriptPath(asAgentId(task.agentId)),
    )
  }

  // 清理后重新持久化模式和工作树状态，以便未来的 --resume
  // 知道新的清理后会话处于何种状态。clearSessionMetadata
  // 已从缓存中清除两者，但进程仍处于相同模式
  // 且（如果适用）相同的工作树目录。
  if (feature('COORDINATOR_MODE')) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { saveMode } = require('../../utils/sessionStorage.js')
    const {
      isCoordinatorMode,
    } = require('../../coordinator/coordinatorMode.js')
    /* eslint-enable @typescript-eslint/no-require-imports */
    saveMode(isCoordinatorMode() ? 'coordinator' : 'normal')
  }
  const worktreeSession = getCurrentWorktreeSession()
  if (worktreeSession) {
    saveWorktreeState(worktreeSession)
  }

  // 清理后执行 SessionStart 钩子
  const hookMessages = await processSessionStartHooks('clear')

  // 使用钩子结果更新消息
  if (hookMessages.length > 0) {
    setMessages(() => hookMessages)
  }
}
