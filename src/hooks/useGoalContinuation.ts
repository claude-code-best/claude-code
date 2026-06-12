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
 *   4. No active local-JSX UI (modal dialog)
 *   5. Not in plan mode
 *   6. turnsExecuted < MAX_GOAL_TURNS
 *   7. No user messages in the queue (user input always takes priority)
 *
 * When user messages are queued during a goal turn, the hook always
 * yields to let them process first. After the user messages are
 * handled, the next idle will fire the hook again to continue.
 * This ensures commands like `/goal pause` are never starved by
 * auto-continuation.
 *
 * The hook is intentionally simple: a single useEffect that fires
 * when `isLoading` flips to false. No timers, no intervals — the
 * idle→enqueue→process→query→idle cycle is self-sustaining.
 */
import { useLayoutEffect, useRef } from 'react'

import { logForDebugging } from 'src/utils/debug.js'
import {
  markGoalMaxTurnsReached,
  getGoal,
  incrementGoalTurns,
  MAX_GOAL_TURNS,
} from 'src/services/goal/goalState.js'
import { persistCurrentGoal } from 'src/services/goal/goalStorage.js'
import {
  buildBudgetLimitPrompt,
  buildContinuationPrompt,
} from 'src/services/goal/prompts.js'
import {
  enqueue,
  getCommandQueueSnapshot,
} from 'src/utils/messageQueueManager.js'

function hookLog(msg: string): void {
  logForDebugging(`[goal] hook: ${msg}`)
}

export type UseGoalContinuationOpts = {
  isLoading: boolean
  wasAborted: boolean
  queuedCommandsLength: number
  hasActiveLocalJsxUI: boolean
  isInPlanMode: boolean
  isQueryActiveNow?: () => boolean
  onMaxTurnsReached?: () => void
  onContinuationEnqueued?: (payload: {
    turn: number
    objective: string
  }) => void
}

export function useGoalContinuation(opts: UseGoalContinuationOpts): void {
  const optsRef = useRef(opts)
  optsRef.current = opts

  // Track whether we already enqueued for the current idle window.
  // Reset to false every time isLoading becomes true (new turn starts).
  const enqueuedRef = useRef(false)
  // Fire budget_limit prompt exactly once per budget transition.
  const budgetLimitFiredRef = useRef(false)

  useLayoutEffect(() => {
    if (opts.isLoading) {
      enqueuedRef.current = false
      return
    }

    // Avoid stale-render races: queue processing can reserve QueryGuard in an
    // earlier effect during the same commit. Read live state before deciding.
    if (opts.isQueryActiveNow?.()) {
      hookLog('skip: queryActiveNow=true')
      return
    }

    // Codex parity: continuation only after normal completion.
    // Aborted turns (Ctrl+C / Escape) must not trigger a new turn.
    if (opts.wasAborted) {
      hookLog('skip: wasAborted=true')
      return
    }

    // Already enqueued for this idle window
    if (enqueuedRef.current) return

    // User messages always take priority over auto-continuation.
    // If the user typed something (e.g. `/goal pause`) while a turn was
    // running, let their message process first. After it finishes, the
    // next idle cycle will re-evaluate whether to continue.
    const liveQueueLength = getCommandQueueSnapshot().length
    if (liveQueueLength > 0) {
      hookLog('skip: yielding to queued user messages')
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
    if (!goal) {
      budgetLimitFiredRef.current = false
      return
    }
    if (goal.status === 'active') {
      budgetLimitFiredRef.current = false
    }

    // Budget-limited: inject one final steering prompt so the model
    // knows to stop substantive work and summarise progress.
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
        priority: 'now',
        isMeta: true,
        origin: 'goal-budget-limit',
        skipSlashCommands: true,
      })
      return
    }

    // Only continue for active goals
    if (goal.status !== 'active') {
      hookLog(`skip: status="${goal.status}" (not active)`)
      return
    }

    if (goal.turnsExecuted >= MAX_GOAL_TURNS) {
      const marked = markGoalMaxTurnsReached()
      if (marked) {
        persistCurrentGoal()
        opts.onMaxTurnsReached?.()
      }
      logForDebugging(
        `[goal] hook: MAX_GOAL_TURNS (${MAX_GOAL_TURNS}) reached, stopping`,
      )
      return
    }

    // All conditions met — enqueue a continuation turn
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
      priority: 'now',
      isMeta: true,
      origin: 'goal-continuation',
      skipSlashCommands: true,
    })
    opts.onContinuationEnqueued?.({
      turn: turns,
      objective: goal.objective,
    })
  }, [
    opts.isLoading,
    opts.wasAborted,
    opts.queuedCommandsLength,
    opts.hasActiveLocalJsxUI,
    opts.isInPlanMode,
  ])
}
