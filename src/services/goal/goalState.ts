import { getSessionId } from '../../bootstrap/state.js'

export type GoalStatus = 'active' | 'paused' | 'budget_limited' | 'complete'

export type GoalState = {
  objective: string
  status: GoalStatus
  tokenBudget: number | null
  tokensUsed: number
  startTime: number
  pausedAt: number | null
  accumulatedActiveMs: number
}

const goals: Map<string, GoalState> = new Map()

export function getGoal(sessionId?: string): GoalState | null {
  return goals.get(sessionId ?? getSessionId()) ?? null
}

export function setGoal(
  objective: string,
  tokenBudget?: number,
  sessionId?: string,
): GoalState {
  const validBudget =
    tokenBudget !== undefined &&
    Number.isFinite(tokenBudget) &&
    tokenBudget >= 0
      ? tokenBudget
      : null
  const state: GoalState = {
    objective,
    status: 'active',
    tokenBudget: validBudget,
    tokensUsed: 0,
    startTime: Date.now(),
    pausedAt: null,
    accumulatedActiveMs: 0,
  }
  goals.set(sessionId ?? getSessionId(), state)
  return state
}

export function clearGoal(sessionId?: string): void {
  goals.delete(sessionId ?? getSessionId())
}

export function pauseGoal(sessionId?: string): boolean {
  const goal = getGoal(sessionId)
  if (!goal || goal.status !== 'active') return false
  goal.accumulatedActiveMs += Date.now() - goal.startTime
  goal.pausedAt = Date.now()
  goal.status = 'paused'
  return true
}

export function resumeGoal(sessionId?: string): boolean {
  const goal = getGoal(sessionId)
  if (!goal || goal.status !== 'paused') return false
  goal.pausedAt = null
  goal.startTime = Date.now()
  goal.status = 'active'
  return true
}

export function completeGoal(sessionId?: string): boolean {
  const goal = getGoal(sessionId)
  if (!goal) return false
  goal.status = 'complete'
  return true
}

export function updateGoalTokens(usage: number, sessionId?: string): void {
  const goal = getGoal(sessionId)
  if (!goal || goal.status !== 'active') return
  const validUsage = Number.isFinite(usage) && usage >= 0 ? usage : 0
  goal.tokensUsed += validUsage
  if (goal.tokenBudget !== null && goal.tokensUsed >= goal.tokenBudget) {
    goal.status = 'budget_limited'
  }
}

export function getActiveElapsedMs(goal: GoalState): number {
  const ongoing =
    goal.status === 'active' && goal.pausedAt === null
      ? Date.now() - goal.startTime
      : 0
  return goal.accumulatedActiveMs + ongoing
}

export function getGoalContinuationPrompt(sessionId?: string): string | null {
  const goal = getGoal(sessionId)
  if (!goal || goal.status !== 'active') return null

  const elapsedSeconds = Math.floor(getActiveElapsedMs(goal) / 1000)
  const budgetDisplay =
    goal.tokenBudget !== null ? `${goal.tokenBudget}` : 'unlimited'
  const remainingDisplay =
    goal.tokenBudget !== null
      ? `${Math.max(0, goal.tokenBudget - goal.tokensUsed)}`
      : 'unlimited'

  return `Continue working toward the active goal.

<objective>
${goal.objective}
</objective>

Budget:
- Time spent: ${elapsedSeconds} seconds
- Tokens used: ${goal.tokensUsed}
- Token budget: ${budgetDisplay}
- Tokens remaining: ${remainingDisplay}

Avoid repeating work that is already done. Choose the next concrete action toward the objective.

Before deciding that the goal is achieved, perform a completion audit:
- Restate the objective as concrete deliverables or success criteria.
- Inspect relevant files, command output, test results, or other real evidence.
- Do not accept proxy signals as completion by themselves.
- Treat uncertainty as not achieved; do more verification or continue the work.
- Only mark the goal achieved when the objective has actually been achieved and no required work remains.

If the objective is achieved, call the goal tool with action "complete" so usage accounting is preserved.`
}

export function formatGoalStatus(sessionId?: string): string {
  const goal = getGoal(sessionId)
  if (!goal) return 'No active goal.'

  const elapsed = Math.floor(getActiveElapsedMs(goal) / 1000)
  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60
  const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`

  const statusLabel: Record<GoalStatus, string> = {
    active: 'Active',
    paused: 'Paused',
    budget_limited: 'Budget Limited',
    complete: 'Complete',
  }

  const lines = [
    `Goal: ${goal.objective}`,
    `Status: ${statusLabel[goal.status]}`,
    `Time: ${timeStr}`,
    `Tokens: ${goal.tokensUsed}${goal.tokenBudget !== null ? ` / ${goal.tokenBudget}` : ''}`,
  ]

  return lines.join('\n')
}

export function clearAllGoals(): void {
  goals.clear()
}
