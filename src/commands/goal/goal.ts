import type { LocalCommandCall } from '../../types/command.js'
import {
  clearGoal,
  completeGoal,
  formatGoalStatus,
  getGoal,
  pauseGoal,
  resumeGoal,
  setGoal,
} from '../../services/goal/goalState.js'

export const call: LocalCommandCall = async args => {
  const trimmed = args.trim()

  // No arguments — show current goal status
  if (!trimmed) {
    return { type: 'text', value: formatGoalStatus() }
  }

  const lower = trimmed.toLowerCase()

  // Control subcommands
  if (lower === 'clear') {
    const goal = getGoal()
    if (!goal) {
      return { type: 'text', value: 'No active goal to clear.' }
    }
    clearGoal()
    return { type: 'text', value: 'Goal cleared.' }
  }

  if (lower === 'pause') {
    if (pauseGoal()) {
      return { type: 'text', value: 'Goal paused.' }
    }
    return { type: 'text', value: 'No active goal to pause.' }
  }

  if (lower === 'resume') {
    if (resumeGoal()) {
      return { type: 'text', value: 'Goal resumed.' }
    }
    return { type: 'text', value: 'No paused goal to resume.' }
  }

  if (lower === 'complete') {
    if (completeGoal()) {
      return { type: 'text', value: 'Goal marked as complete.' }
    }
    return { type: 'text', value: 'No active goal to complete.' }
  }

  // Set a new goal
  const existing = getGoal()
  if (existing && existing.status === 'active') {
    // Replace existing active goal
    setGoal(trimmed)
    return {
      type: 'text',
      value: `Goal replaced.\n\n${formatGoalStatus()}`,
    }
  }

  setGoal(trimmed)
  return { type: 'text', value: `Goal set.\n\n${formatGoalStatus()}` }
}
