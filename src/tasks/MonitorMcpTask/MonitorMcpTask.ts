// Background task entry for MCP resource monitoring.
// Tracks a long-running subscription to an MCP server resource so the
// otherwise-invisible stream is visible in the footer pill and Shift+Down
// dialog. Follows the DreamTask pattern: pure UI surfacing via the existing
// task registry.

import type { AppState } from '../../state/AppState.js'
import type { SetAppState, Task, TaskStateBase } from '../../Task.js'
import { createTaskStateBase, generateTaskId } from '../../Task.js'
import type { AgentId } from '../../types/ids.js'
import { logForDebugging } from '../../utils/debug.js'
import { registerTask, updateTaskState } from '../../utils/task/framework.js'

export type MonitorMcpTaskState = TaskStateBase & {
  type: 'monitor_mcp'
  /** The MCP server name being monitored. */
  serverName: string
  /** The resource URI being subscribed to. */
  resourceUri: string
  /** The shell command used to drive monitoring (if any). */
  command?: string
  /** Agent that spawned this task. Used to kill orphaned tasks on agent exit. */
  agentId?: AgentId
  /** Abort controller to cancel the subscription. */
  abortController?: AbortController
}

export function isMonitorMcpTask(task: unknown): task is MonitorMcpTaskState {
  return (
    typeof task === 'object' &&
    task !== null &&
    'type' in task &&
    task.type === 'monitor_mcp'
  )
}

export function registerMonitorMcpTask(
  setAppState: SetAppState,
  opts: {
    description: string
    serverName: string
    resourceUri: string
    command?: string
    toolUseId?: string
    agentId?: AgentId
    abortController?: AbortController
  },
): string {
  const id = generateTaskId('monitor_mcp')
  const task: MonitorMcpTaskState = {
    ...createTaskStateBase(id, 'monitor_mcp', opts.description, opts.toolUseId),
    type: 'monitor_mcp',
    status: 'running',
    serverName: opts.serverName,
    resourceUri: opts.resourceUri,
    command: opts.command,
    agentId: opts.agentId,
    abortController: opts.abortController,
  }
  registerTask(task, setAppState)
  return id
}

export function completeMonitorMcpTask(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState<MonitorMcpTaskState>(taskId, setAppState, task => ({
    ...task,
    status: 'completed',
    endTime: Date.now(),
    notified: true,
    abortController: undefined,
  }))
}

export function failMonitorMcpTask(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState<MonitorMcpTaskState>(taskId, setAppState, task => ({
    ...task,
    status: 'failed',
    endTime: Date.now(),
    notified: true,
    abortController: undefined,
  }))
}

export function killMonitorMcp(
  taskId: string,
  setAppState: SetAppState,
): void {
  updateTaskState<MonitorMcpTaskState>(taskId, setAppState, task => {
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
 * Kill all running monitor_mcp tasks spawned by a given agent.
 * Called from runAgent.ts finally block so subscriptions don't outlive
 * the agent that started them.
 */
export function killMonitorMcpTasksForAgent(
  agentId: AgentId,
  getAppState: () => AppState,
  setAppState: SetAppState,
): void {
  const tasks = getAppState().tasks ?? {}
  for (const [taskId, task] of Object.entries(tasks)) {
    if (
      isMonitorMcpTask(task) &&
      task.agentId === agentId &&
      task.status === 'running'
    ) {
      logForDebugging(
        `killMonitorMcpTasksForAgent: killing orphaned monitor task ${taskId} (agent ${agentId} exiting)`,
      )
      killMonitorMcp(taskId, setAppState)
    }
  }
}

export const MonitorMcpTask: Task = {
  name: 'MonitorMcpTask',
  type: 'monitor_mcp',

  async kill(taskId, setAppState) {
    killMonitorMcp(taskId, setAppState)
  },
}
