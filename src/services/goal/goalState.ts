export type GoalStatus = 'active' | 'paused' | 'budget_limited' | 'complete'

export type GoalState = {
  objective: string
  status: GoalStatus
  tokenBudget: number | null
  tokensUsed: number
  startTime: number
}

let currentGoal: GoalState | null = null

export function getGoal(): GoalState | null {
  return currentGoal
}

export function setGoal(objective: string, tokenBudget?: number): GoalState {
  currentGoal = {
    objective,
    status: 'active',
    tokenBudget: tokenBudget ?? null,
    tokensUsed: 0,
    startTime: Date.now(),
  }
  return currentGoal
}

export function clearGoal(): void {
  currentGoal = null
}

export function pauseGoal(): boolean {
  if (!currentGoal || currentGoal.status !== 'active') return false
  currentGoal.status = 'paused'
  return true
}

export function resumeGoal(): boolean {
  if (!currentGoal || currentGoal.status !== 'paused') return false
  currentGoal.status = 'active'
  return true
}

export function completeGoal(): boolean {
  if (!currentGoal) return false
  currentGoal.status = 'complete'
  return true
}

export function updateGoalTokens(usage: number): void {
  if (!currentGoal || currentGoal.status !== 'active') return
  currentGoal.tokensUsed += usage
  if (
    currentGoal.tokenBudget !== null &&
    currentGoal.tokensUsed >= currentGoal.tokenBudget
  ) {
    currentGoal.status = 'budget_limited'
  }
}

export function getGoalContinuationPrompt(): string | null {
  if (!currentGoal || currentGoal.status !== 'active') return null

  const elapsedSeconds = Math.floor((Date.now() - currentGoal.startTime) / 1000)
  const budgetDisplay =
    currentGoal.tokenBudget !== null
      ? `${currentGoal.tokenBudget}`
      : 'unlimited'
  const remainingDisplay =
    currentGoal.tokenBudget !== null
      ? `${Math.max(0, currentGoal.tokenBudget - currentGoal.tokensUsed)}`
      : 'unlimited'

  return `Continue working toward the active goal.

<objective>
${currentGoal.objective}
</objective>

Budget:
- Time spent: ${elapsedSeconds} seconds
- Tokens used: ${currentGoal.tokensUsed}
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

export function formatGoalStatus(): string {
  if (!currentGoal) return 'No active goal.'

  const elapsed = Math.floor((Date.now() - currentGoal.startTime) / 1000)
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
    `Goal: ${currentGoal.objective}`,
    `Status: ${statusLabel[currentGoal.status]}`,
    `Time: ${timeStr}`,
    `Tokens: ${currentGoal.tokensUsed}${currentGoal.tokenBudget !== null ? ` / ${currentGoal.tokenBudget}` : ''}`,
  ]

  return lines.join('\n')
}
