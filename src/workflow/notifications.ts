/**
 * Workflow 状态变更通知桥接。
 *
 * 引擎通过 progressEmitter.emit({ type: 'run_done', ... }) 发事件，
 * progress/store reducer 把状态记到 RunProgress。但旧实现没有任何代码
 * 把状态转换桥接到 host 通知机制——WorkflowTool 返回文本承诺的"完成时
 * 会自动通知"实际落空。
 *
 * 本模块订阅 WorkflowService.subscribe，监听 status 从 running →
 * completed/failed/killed 的转换，通过注入的 notifier 回调发 host
 * notification（默认走 enqueuePendingNotification task-notification mode）。
 */
import {
  STATUS_TAG,
  SUMMARY_TAG,
  TASK_ID_TAG,
  TASK_NOTIFICATION_TAG,
  TASK_TYPE_TAG,
} from '../constants/xml.js'
import { enqueuePendingNotification } from '../utils/messageQueueManager.js'
import type { RunProgress } from './progress/store.js'
import type { WorkflowService } from './service.js'

const WORKFLOW_TASK_TYPE = 'local_workflow'

/** 通知发送器抽象（便于测试注入 spy）。 */
export type WorkflowNotifier = (message: string) => void

const TERMINAL_STATUSES: ReadonlySet<RunProgress['status']> = new Set([
  'completed',
  'failed',
  'killed',
])

/** 默认通知器：走 host message queue 的 task-notification 模式。 */
const defaultNotifier: WorkflowNotifier = message => {
  enqueuePendingNotification({ value: message, mode: 'task-notification' })
}

export function installWorkflowNotifications(
  service: WorkflowService,
  notify: WorkflowNotifier = defaultNotifier,
): () => void {
  const prevStatus = new Map<string, RunProgress['status'] | undefined>()

  const unsubscribe = service.subscribe(() => {
    const runs = service.listRuns()
    for (const run of runs) {
      const prev = prevStatus.get(run.runId)
      // 初次见到这个 run：仅记录当前状态，不发通知
      // （避免安装时把已有历史 run 当作新通知触发）
      if (prev === undefined) {
        prevStatus.set(run.runId, run.status)
        continue
      }
      // 状态变化 + 进入终态 → 发通知
      if (prev !== run.status && TERMINAL_STATUSES.has(run.status)) {
        notify(buildMessage(run))
      }
      prevStatus.set(run.runId, run.status)
    }
  })

  return () => {
    unsubscribe()
    prevStatus.clear()
  }
}

function buildMessage(run: RunProgress): string {
  const statusText =
    run.status === 'completed'
      ? 'completed successfully'
      : run.status === 'failed'
        ? 'failed'
        : 'was stopped'
  const errorSuffix =
    run.status === 'failed' && run.error ? `: ${run.error}` : ''
  const summary = `Workflow "${run.workflowName}" ${statusText}${errorSuffix}`

  return `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${run.runId}</${TASK_ID_TAG}>
<${TASK_TYPE_TAG}>${WORKFLOW_TASK_TYPE}</${TASK_TYPE_TAG}>
<${STATUS_TAG}>${run.status}</${STATUS_TAG}>
<${SUMMARY_TAG}>${summary}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>`
}
