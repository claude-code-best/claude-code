/**
 * useGoalContinuation — React hook that drives the auto-continuation
 * loop for the `/goal` feature.
 *
 * Mounted inside REPL.tsx when feature('GOAL') is enabled. After each
 * turn completes (queryGuard transitions to idle), checks whether the
 * active goal should trigger another turn:
 *
 *   1. GOAL feature flag enabled
 *   2. Goal exists and status === 'active'
 *   3. Query just finished (isLoading transitioned false)
 *   4. No pending user input in queue
 *   5. No active local-JSX UI (modal dialog)
 *   6. Not in plan mode
 *   7. turnsExecuted < MAX_GOAL_TURNS
 *
 * When all conditions are met, a meta-message containing the
 * continuation prompt is enqueued. The queue processor picks it up
 * and submits it as a new turn — the model sees the steering prompt
 * and continues working towards the goal.
 */
import { useEffect, useRef } from 'react'

import { logForDebugging } from 'src/utils/debug.js'
import {
  getGoal,
  incrementGoalTurns,
  MAX_GOAL_TURNS,
} from 'src/services/goal/goalState.js'
import { persistCurrentGoal } from 'src/services/goal/goalStorage.js'
import {
  buildBudgetLimitPrompt,
  buildContinuationPrompt,
} from 'src/services/goal/prompts.js'
import { enqueue } from 'src/utils/messageQueueManager.js'

function hookLog(msg: string): void {
  logForDebugging(`[goal] hook: ${msg}`)
}

export type UseGoalContinuationOpts = {
  isLoading: boolean
  wasAborted: boolean
  queuedCommandsLength: number
  hasActiveLocalJsxUI: boolean
  isInPlanMode: boolean
}

export function useGoalContinuation(opts: UseGoalContinuationOpts): void {
  const optsRef = useRef(opts)
  optsRef.current = opts

  const enqueuedRef = useRef(false)
  const budgetLimitFiredRef = useRef(false)

  useEffect(() => {
    if (opts.isLoading) {
      enqueuedRef.current = false
      return
    }

    if (opts.wasAborted) {
      hookLog('skip: wasAborted=true')
      return
    }

    if (enqueuedRef.current) return

    if (opts.queuedCommandsLength > 0) {
      hookLog('skip: queuedCommands=' + opts.queuedCommandsLength)
      return
    }
    if (opts.hasActiveLocalJsxUI) {
      hookLog('skip: activeLocalJsxUI')
      return
    }
    if (opts.isInPlanMode) {
      hookLog('skip: planMode')
      return
    }

    const goal = getGoal()
    if (!goal) return

    if (goal.status === 'budget_limited' && !budgetLimitFiredRef.current) {
      budgetLimitFiredRef.current = true
      enqueuedRef.current = true
      const prompt = buildBudgetLimitPrompt(goal)
      logForDebugging(
        '[goal] hook: budget limit reached, injecting wrap-up prompt',
      )
      enqueue({
        value: prompt,
        mode: 'prompt',
        priority: 'later',
        isMeta: true,
        origin: 'goal-budget-limit',
        skipSlashCommands: true,
      })
      return
    }

    if (goal.status !== 'active') {
      hookLog(`skip: status="${goal.status}" (not active)`)
      return
    }

    if (goal.turnsExecuted >= MAX_GOAL_TURNS) {
      logForDebugging(
        `[goal] hook: MAX_GOAL_TURNS (${MAX_GOAL_TURNS}) reached, stopping`,
      )
      return
    }

    enqueuedRef.current = true

    const turns = incrementGoalTurns()
    persistCurrentGoal()

    const prompt = buildContinuationPrompt(goal)
    logForDebugging(
      `[goal] hook: enqueuing turn ${turns} for "${goal.objective.slice(0, 60)}"`,
    )

    enqueue({
      value: prompt,
      mode: 'prompt',
      priority: 'later',
      isMeta: true,
      origin: 'goal-continuation',
      skipSlashCommands: true,
    })
  }, [
    opts.isLoading,
    opts.wasAborted,
    opts.queuedCommandsLength,
    opts.hasActiveLocalJsxUI,
    opts.isInPlanMode,
  ])
}
