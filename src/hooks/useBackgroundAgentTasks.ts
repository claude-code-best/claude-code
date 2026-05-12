import { useMemo } from 'react'
import { useAppState } from '../state/AppState.js'
import {
  isLocalAgentTask,
  type LocalAgentTaskState,
} from '../tasks/LocalAgentTask/LocalAgentTask.js'

export function useBackgroundAgentTasks(): LocalAgentTaskState[] {
  const tasks = useAppState(s => s.tasks)
  return useMemo(() => {
    const now = Date.now()
    return Object.values(tasks)
      .filter(isLocalAgentTask)
      .filter(t => t.agentType !== 'main-session')
      .filter(t => t.isBackgrounded !== false)
      .filter(t => t.evictAfter === undefined || t.evictAfter > now)
      .sort((a, b) => a.startTime - b.startTime)
  }, [tasks])
}
