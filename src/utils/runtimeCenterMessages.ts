import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type { GoalState } from '../types/logs.js'
import type { RunProgress } from '../workflow/progress/store.js'

export function buildGoalStateMessage(
  goal: GoalState | null,
  activeElapsedMs: number,
): SDKMessage {
  return {
    type: 'system',
    subtype: 'goal_state',
    goal: goal
      ? {
          objective: goal.objective,
          status: goal.status,
          token_budget: goal.tokenBudget,
          tokens_used: goal.tokensUsed,
          turns_executed: goal.turnsExecuted,
          active_elapsed_ms: activeElapsedMs,
          start_time: goal.startTime,
          paused_at: goal.pausedAt,
          accumulated_active_ms: goal.accumulatedActiveMs,
          blocked_attempts: goal.blockedAttempts,
          last_block_reason: goal.lastBlockReason,
          created_at: goal.createdAt,
          updated_at: goal.updatedAt,
        }
      : null,
  }
}

export function buildWorkflowStateMessage(
  runs: RunProgress[],
  namedWorkflows: string[],
  runsDirectory: string,
): SDKMessage {
  return {
    type: 'system',
    subtype: 'workflow_state',
    runs,
    named_workflows: namedWorkflows,
    runs_directory: runsDirectory,
  }
}
