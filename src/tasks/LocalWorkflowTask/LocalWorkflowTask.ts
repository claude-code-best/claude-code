// Background task entry for local workflow execution.
// Makes workflow scripts visible in the footer pill and Shift+Down
// dialog. Follows the DreamTask pattern: lifecycle + UI surfacing via
// the existing task registry.

import type { AppState } from '../../state/AppState.js'
import type { SetAppState, Task, TaskStateBase } from '../../Task.js'
import { createTaskStateBase, generateTaskId } from '../../Task.js'
import type { AgentId } from '../../types/ids.js'
import { logForDebugging } from '../../utils/debug.js'
import { registerTask, updateTaskState } from '../../utils/task/framework.js'

export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow'
  /** meta.name from the workflow script (e.g. 'spec'). */
  workflowName: string
  /** Absolute path to the workflow file on disk. */
  workflowFile: string
  /** Human-readable one-line summary for the task list. */
  summary?: string
  /** Number of sub-agents spawned by this workflow. */
  agentCount?: number
  /** Captured output from workflow execution. */
  output?: string
  /** Agent that spawned this task. Used for orphan cleanup. */
  agentId?: AgentId
  /** Abort controller for cancellation. */
  abortController?: AbortController
  /**
   * Pending action for a sub-agent within this workflow.
   * The workflow execution loop polls this field and acts on it.
   */
  pendingAgentAction?: {
    kind: 'skip' | 'retry'
    agentId: AgentId
    requestedAt: number
  }
}

export function isLocalWorkflowTask(
  value: unknown,
): value is LocalWorkflowTaskState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as { type: string }).type === 'local_workflow'
  )
}

export function registerLocalWorkflowTask(
  setAppState: SetAppState,
  opts: {
    description: string
    workflowName: string
    workflowFile: string
    summary?: string
    toolUseId?: string
    agentId?: AgentId
    abortController?: AbortController
  },
): string {
  const id = generateTaskId('local_workflow')
  const task: LocalWorkflowTaskState = {
    ...createTaskStateBase(
      id,
      'local_workflow',
      opts.description,
      opts.toolUseId,
    ),
    type: 'local_workflow',
    status: 'running',
    workflowName: opts.workflowName,
    workflowFile: opts.workflowFile,
    summary: opts.summary,
    agentId: opts.agentId,
    abortController: opts.abortController,
  }
  registerTask(task, setAppState)
  return id
}

export function completeWorkflowTask(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => ({
    ...task,
    status: 'completed',
    endTime: Date.now(),
    notified: true,
    abortController: undefined,
  }))
}

export function failWorkflowTask(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => ({
    ...task,
    status: 'failed',
    endTime: Date.now(),
    notified: true,
    abortController: undefined,
  }))
}

/**
 * Kill a running workflow task. Called from BackgroundTasksDialog
 * via the feature-gated `killWorkflowTask` binding.
 */
export function killWorkflowTask(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') return task
    task.abortController?.abort()
    return {
      ...task,
      status: 'killed',
      endTime: Date.now(),
      notified: true,
      abortController: undefined,
    }
  })
}

/**
 * Skip the current agent step within a running workflow.
 * Called from BackgroundTasksDialog via the feature-gated
 * `skipWorkflowAgent` binding: skipWorkflowAgent(taskId, agentId, setAppState).
 */
export function skipWorkflowAgent(
  taskId: string,
  agentId: AgentId,
  setAppState: SetAppState,
): void {
  logForDebugging(
    `skipWorkflowAgent: skipping agent ${agentId} in workflow task ${taskId}`,
  )
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') return task
    return {
      ...task,
      pendingAgentAction: {
        kind: 'skip',
        agentId,
        requestedAt: Date.now(),
      },
    }
  })
}

/**
 * Retry the current agent step within a running workflow.
 * Called from BackgroundTasksDialog via the feature-gated
 * `retryWorkflowAgent` binding: retryWorkflowAgent(taskId, agentId, setAppState).
 */
export function retryWorkflowAgent(
  taskId: string,
  agentId: AgentId,
  setAppState: SetAppState,
): void {
  logForDebugging(
    `retryWorkflowAgent: retrying agent ${agentId} in workflow task ${taskId}`,
  )
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') return task
    return {
      ...task,
      pendingAgentAction: {
        kind: 'retry',
        agentId,
        requestedAt: Date.now(),
      },
    }
  })
}

/**
 * Kill all running workflow tasks spawned by a given agent.
 * Called from runAgent.ts finally block.
 */
export function killWorkflowTasksForAgent(
  agentId: AgentId,
  getAppState: () => AppState,
  setAppState: SetAppState,
): void {
  const tasks = getAppState().tasks ?? {}
  for (const [taskId, task] of Object.entries(tasks)) {
    if (
      isLocalWorkflowTask(task) &&
      task.agentId === agentId &&
      task.status === 'running'
    ) {
      logForDebugging(
        `killWorkflowTasksForAgent: killing orphaned workflow task ${taskId} (agent ${agentId} exiting)`,
      )
      killWorkflowTask(taskId, setAppState)
    }
  }
}

export const LocalWorkflowTask: Task = {
  name: 'LocalWorkflowTask',
  type: 'local_workflow',
  async kill(taskId: string, setAppState: SetAppState) {
    killWorkflowTask(taskId, setAppState)
  },
}
