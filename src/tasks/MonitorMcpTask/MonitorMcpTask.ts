// Auto-generated stub — replace with real implementation
import type { TaskStateBase, SetAppState } from '../../Task.js'
import type { AppState } from '../../state/AppState.js'
import type { AgentId } from '../../types/ids.js'

export type MonitorMcpTaskState = TaskStateBase & {
  type: 'monitor_mcp'
}
export const killMonitorMcp: (
  taskId: string,
  setAppState: SetAppState,
) => void = () => {}
export const killMonitorMcpTasksForAgent: (
  agentId: AgentId,
  getAppState: () => AppState,
  setAppState: SetAppState,
) => void = () => {}
