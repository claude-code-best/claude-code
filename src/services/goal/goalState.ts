/**
 * Per-session goal state machine. Pure in-memory management — no FS,
 * no network. Persistence is handled by goalStorage.ts.
 *
 * Uses Map<string, GoalState> keyed by sessionId so concurrent
 * sub-sessions (agents, worktrees) don't leak into each other.
 */
import type { GoalState, GoalStatus } from '../../types/logs.js'
import { getSessionId } from '../../bootstrap/state.js'
import { logForDebugging } from '../../utils/debug.js'

export const BLOCKED_CONSECUTIVE_THRESHOLD = 3
export const MAX_GOAL_TURNS = 150

const goals = new Map<string, GoalState>()

function goalLog(
  tag: string,
  msg: string,
  extra?: Record<string, unknown>,
): void {
  const suffix = extra ? ` ${JSON.stringify(extra)}` : ''
  logForDebugging(`[goal] ${tag}: ${msg}${suffix}`)
}

function resolveSessionId(sessionId?: string): string {
  return sessionId ?? getSessionId()
}

export function setGoal(
  objective: string,
  options?: { tokenBudget?: number; sessionId?: string },
): GoalState {
  const id = resolveSessionId(options?.sessionId)
  const budget =
    options?.tokenBudget !== undefined &&
    Number.isFinite(options.tokenBudget) &&
    options.tokenBudget > 0
      ? options.tokenBudget
      : null
  const now = Date.now()
  const state: GoalState = {
    objective,
    status: 'active',
    tokenBudget: budget,
    tokensUsed: 0,
    startTime: now,
    pausedAt: null,
    accumulatedActiveMs: 0,
    blockedAttempts: 0,
    lastBlockReason: null,
    createdAt: now,
    updatedAt: now,
    turnsExecuted: 0,
  }
  goals.set(id, state)
  goalLog('SET', `objective="${objective.slice(0, 80)}"`, {
    tokenBudget: state.tokenBudget,
  })
  return state
}

export function getGoal(sessionId?: string): GoalState | null {
  return goals.get(resolveSessionId(sessionId)) ?? null
}

export function clearGoal(sessionId?: string): boolean {
  const had = goals.has(resolveSessionId(sessionId))
  const result = goals.delete(resolveSessionId(sessionId))
  if (had) goalLog('CLEAR', 'goal removed')
  return result
}

export function pauseGoal(sessionId?: string): GoalState | null {
  const id = resolveSessionId(sessionId)
  const goal = goals.get(id)
  if (!goal || goal.status !== 'active') return null
  const now = Date.now()
  goal.accumulatedActiveMs += now - goal.startTime
  goal.pausedAt = now
  goal.status = 'paused'
  goal.updatedAt = now
  goalLog(
    'PAUSE',
    `paused after ${Math.round(goal.accumulatedActiveMs / 1000)}s active`,
  )
  return goal
}

export function resumeGoal(sessionId?: string): GoalState | null {
  const id = resolveSessionId(sessionId)
  const goal = goals.get(id)
  if (!goal) return null
  if (goal.status !== 'paused') {
    return null
  }
  const now = Date.now()
  goal.startTime = now
  goal.pausedAt = null
  goal.status = 'active'
  goal.updatedAt = now
  goalLog('RESUME', 'goal resumed, blockedAttempts reset')
  goal.blockedAttempts = 0
  goal.lastBlockReason = null
  return goal
}

/**
 * Transition an active goal into max_turns once continuation cap is hit.
 * Idempotent: repeated calls while already max_turns are no-ops.
 */
export function markGoalMaxTurnsReached(sessionId?: string): GoalState | null {
  const goal = getGoal(sessionId)
  if (!goal || goal.status !== 'active') return null
  if (goal.turnsExecuted < MAX_GOAL_TURNS) return null
  goal.status = 'max_turns'
  goal.updatedAt = Date.now()
  goalLog('MAX_TURNS', `reached ${MAX_GOAL_TURNS} turns`)
  return goal
}

/**
 * Reset continuation turn counter after a max_turns stop and resume work.
 * This is a deliberate user action (`/goal continue`) to prevent silent
 * runaway loops.
 */
export function continueGoalFromMaxTurns(sessionId?: string): GoalState | null {
  const goal = getGoal(sessionId)
  if (!goal || goal.status !== 'max_turns') return null
  const now = Date.now()
  goal.turnsExecuted = 0
  goal.status = 'active'
  goal.startTime = now
  goal.pausedAt = null
  goal.blockedAttempts = 0
  goal.lastBlockReason = null
  goal.updatedAt = now
  goalLog(
    'CONTINUE',
    `turn counter reset, status active (max=${MAX_GOAL_TURNS})`,
  )
  return goal
}

export function completeGoal(sessionId?: string): GoalState | null {
  const id = resolveSessionId(sessionId)
  const goal = goals.get(id)
  if (!goal) return null
  const now = Date.now()
  if (goal.status === 'active' && goal.pausedAt === null) {
    goal.accumulatedActiveMs += now - goal.startTime
  }
  goal.status = 'complete'
  goal.updatedAt = now
  goalLog('COMPLETE', `goal achieved`, {
    tokensUsed: goal.tokensUsed,
    turns: goal.turnsExecuted,
  })
  return goal
}

export function updateGoalTokens(
  delta: number,
  sessionId?: string,
): GoalState | null {
  const id = resolveSessionId(sessionId)
  const goal = goals.get(id)
  if (!goal) return null
  if (goal.status !== 'active') return null
  if (!Number.isFinite(delta) || delta <= 0) return goal
  const sanitized = delta
  goal.tokensUsed += sanitized
  goal.updatedAt = Date.now()
  if (goal.tokenBudget !== null && goal.tokensUsed >= goal.tokenBudget) {
    goal.status = 'budget_limited'
    goalLog(
      'BUDGET_LIMITED',
      `tokens ${goal.tokensUsed} >= budget ${goal.tokenBudget}`,
    )
  } else if (sanitized > 0) {
    goalLog(
      'TOKENS',
      `+${sanitized} → total ${goal.tokensUsed}${goal.tokenBudget ? `/${goal.tokenBudget}` : ''}`,
    )
  }
  return goal
}

export function markUsageLimited(sessionId?: string): GoalState | null {
  const id = resolveSessionId(sessionId)
  const goal = goals.get(id)
  if (!goal || goal.status !== 'active') return null
  goal.status = 'usage_limited'
  goal.updatedAt = Date.now()
  return goal
}

export function incrementGoalTurns(sessionId?: string): number {
  const id = resolveSessionId(sessionId)
  const goal = goals.get(id)
  if (!goal) return 0
  goal.turnsExecuted += 1
  goal.updatedAt = Date.now()
  goalLog('TURN', `#${goal.turnsExecuted}/${MAX_GOAL_TURNS}`, {
    status: goal.status,
    tokensUsed: goal.tokensUsed,
  })
  return goal.turnsExecuted
}

export function recordBlockedAttempt(
  reason: string,
  sessionId?: string,
): { status: GoalStatus; attempts: number } | null {
  const id = resolveSessionId(sessionId)
  const goal = goals.get(id)
  if (!goal || goal.status !== 'active') return null
  const normalised = reason.trim().toLowerCase()
  if (
    goal.lastBlockReason !== null &&
    goal.lastBlockReason.trim().toLowerCase() !== normalised
  ) {
    goal.blockedAttempts = 0
  }
  goal.lastBlockReason = reason
  goal.blockedAttempts += 1
  goal.updatedAt = Date.now()
  if (goal.blockedAttempts >= BLOCKED_CONSECUTIVE_THRESHOLD) {
    goal.status = 'blocked'
    goalLog('BLOCKED', `3-strike reached! reason="${normalised}"`)
  } else {
    goalLog(
      'BLOCK_ATTEMPT',
      `attempt ${goal.blockedAttempts}/${BLOCKED_CONSECUTIVE_THRESHOLD} reason="${normalised}"`,
    )
  }
  return { status: goal.status, attempts: goal.blockedAttempts }
}

/**
 * Wall-clock time the goal has been actively worked on (excludes
 * paused intervals). Used by status displays and completion reports.
 */
export function getActiveElapsedMs(goal: GoalState): number {
  const ongoing =
    goal.status === 'active' && goal.pausedAt === null
      ? Date.now() - goal.startTime
      : 0
  return goal.accumulatedActiveMs + ongoing
}

/** Test-only: wipe the in-memory map without touching disk. */
export function _clearAllGoalsForTesting(): void {
  goals.clear()
}

/**
 * Test/internal: hydrate the in-memory map from persisted state.
 * Called by goalStorage on session resume.
 */
export function _setGoalFromPersistedState(
  state: GoalState,
  sessionId?: string,
): void {
  goals.set(resolveSessionId(sessionId), state)
}

/** Format the elapsed time as "Xm Ys" / "Ys" for UI display. */
export function formatGoalElapsed(goal: GoalState): string {
  const elapsedMs = getActiveElapsedMs(goal)
  const seconds = Math.floor(elapsedMs / 1000)
  const minutes = Math.floor(seconds / 60)
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds % 60}s`
}

/** Human-readable status label for UI. */
export function formatGoalStatusLabel(status: GoalStatus): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'paused':
      return 'Paused'
    case 'blocked':
      return 'Blocked'
    case 'budget_limited':
      return 'Budget Limited'
    case 'usage_limited':
      return 'Usage Limited'
    case 'max_turns':
      return 'Max Turns Reached'
    case 'complete':
      return 'Complete'
  }
}
