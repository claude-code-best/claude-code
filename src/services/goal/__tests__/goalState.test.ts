/**
 * Unit tests for the per-session goal state machine.
 *
 * Pure-function tests: no FS, no network. The bootstrap/state.ts side
 * effect chain pulls in log.ts so we mock that to keep the suite fast
 * and side-effect free.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { logMock } from '../../../../tests/mocks/log.js'
mock.module('src/utils/log.ts', logMock)

import {
  _clearAllGoalsForTesting,
  BLOCKED_CONSECUTIVE_THRESHOLD,
  continueGoalFromMaxTurns,
  clearGoal,
  completeGoal,
  formatGoalElapsed,
  formatGoalStatusLabel,
  getActiveElapsedMs,
  getGoal,
  incrementGoalTurns,
  markUsageLimited,
  markGoalMaxTurnsReached,
  MAX_GOAL_TURNS,
  pauseGoal,
  recordBlockedAttempt,
  resumeGoal,
  setGoal,
  updateGoalTokens,
} from '../goalState.js'

const SESSION = 'test-session-id'

beforeEach(() => {
  _clearAllGoalsForTesting()
})

describe('setGoal — creates an active goal with sane defaults', () => {
  test('initial state has status active, zero tokens, no budget by default', () => {
    const g = setGoal('improve test coverage', { sessionId: SESSION })
    expect(g.status).toBe('active')
    expect(g.objective).toBe('improve test coverage')
    expect(g.tokensUsed).toBe(0)
    expect(g.tokenBudget).toBeNull()
    expect(g.blockedAttempts).toBe(0)
    expect(g.turnsExecuted).toBe(0)
  })

  test('accepts a positive integer token budget', () => {
    const g = setGoal('x', { tokenBudget: 5000, sessionId: SESSION })
    expect(g.tokenBudget).toBe(5000)
  })

  test('rejects non-finite or negative budgets as null', () => {
    expect(
      setGoal('a', { tokenBudget: Number.NaN, sessionId: SESSION }).tokenBudget,
    ).toBeNull()
    expect(
      setGoal('a', { tokenBudget: -1, sessionId: SESSION }).tokenBudget,
    ).toBeNull()
    expect(
      setGoal('a', { tokenBudget: Infinity, sessionId: SESSION }).tokenBudget,
    ).toBeNull()
  })

  test('setGoal replaces an existing goal entirely', () => {
    setGoal('first', { tokenBudget: 100, sessionId: SESSION })
    updateGoalTokens(50, SESSION)
    const g = setGoal('second', { sessionId: SESSION })
    expect(g.objective).toBe('second')
    expect(g.tokensUsed).toBe(0)
    expect(g.tokenBudget).toBeNull()
  })
})

describe('pause / resume — preserves active elapsed time', () => {
  test('pause then resume keeps accumulated active time', async () => {
    setGoal('x', { sessionId: SESSION })
    await Bun.sleep(10)
    const paused = pauseGoal(SESSION)
    expect(paused?.status).toBe('paused')
    expect(paused?.accumulatedActiveMs).toBeGreaterThanOrEqual(10)

    const before = paused?.accumulatedActiveMs ?? 0
    await Bun.sleep(20)
    const resumed = resumeGoal(SESSION)
    expect(resumed?.status).toBe('active')
    expect(resumed?.accumulatedActiveMs).toBe(before)
  })

  test('pause is a no-op on a non-active goal', () => {
    setGoal('x', { sessionId: SESSION })
    pauseGoal(SESSION)
    const second = pauseGoal(SESSION)
    expect(second).toBeNull()
  })

  test('resume is a no-op on an active goal', () => {
    setGoal('x', { sessionId: SESSION })
    expect(resumeGoal(SESSION)).toBeNull()
  })

  test('getActiveElapsedMs while active includes ongoing interval', async () => {
    setGoal('x', { sessionId: SESSION })
    await Bun.sleep(10)
    const g = getGoal(SESSION)!
    expect(getActiveElapsedMs(g)).toBeGreaterThanOrEqual(10)
  })

  test('getActiveElapsedMs while paused freezes at accumulated total', async () => {
    setGoal('x', { sessionId: SESSION })
    await Bun.sleep(10)
    pauseGoal(SESSION)
    const g = getGoal(SESSION)!
    const a = getActiveElapsedMs(g)
    await Bun.sleep(20)
    const b = getActiveElapsedMs(g)
    expect(b).toBe(a)
  })
})

describe('updateGoalTokens — accumulates and triggers budget_limited', () => {
  test('accumulates positive deltas', () => {
    setGoal('x', { tokenBudget: 1000, sessionId: SESSION })
    updateGoalTokens(100, SESSION)
    updateGoalTokens(200, SESSION)
    expect(getGoal(SESSION)?.tokensUsed).toBe(300)
  })

  test('crossing budget transitions to budget_limited', () => {
    setGoal('x', { tokenBudget: 100, sessionId: SESSION })
    updateGoalTokens(150, SESSION)
    expect(getGoal(SESSION)?.status).toBe('budget_limited')
  })

  test('further updates after budget_limited are no-ops (status-guarded)', () => {
    setGoal('x', { tokenBudget: 100, sessionId: SESSION })
    updateGoalTokens(150, SESSION)
    updateGoalTokens(50, SESSION) // should not accumulate
    expect(getGoal(SESSION)?.tokensUsed).toBe(150)
  })

  test('coerces non-finite or negative deltas to zero', () => {
    setGoal('x', { tokenBudget: 1000, sessionId: SESSION })
    updateGoalTokens(Number.NaN, SESSION)
    updateGoalTokens(-100, SESSION)
    updateGoalTokens(Infinity, SESSION)
    expect(getGoal(SESSION)?.tokensUsed).toBe(0)
  })

  test('no-op when there is no goal', () => {
    expect(updateGoalTokens(100, SESSION)).toBeNull()
  })
})

describe('recordBlockedAttempt — CODEX 3-consecutive-attempts audit', () => {
  test('first attempt records but stays active', () => {
    setGoal('x', { sessionId: SESSION })
    const r = recordBlockedAttempt('compile error', SESSION)
    expect(r?.status).toBe('active')
    expect(r?.attempts).toBe(1)
  })

  test('three same-reason attempts in a row flip to blocked', () => {
    setGoal('x', { sessionId: SESSION })
    recordBlockedAttempt('compile error', SESSION)
    recordBlockedAttempt('compile error', SESSION)
    const r = recordBlockedAttempt('compile error', SESSION)
    expect(r?.status).toBe('blocked')
    expect(r?.attempts).toBe(BLOCKED_CONSECUTIVE_THRESHOLD)
  })

  test('different reason resets counter', () => {
    setGoal('x', { sessionId: SESSION })
    recordBlockedAttempt('A', SESSION)
    recordBlockedAttempt('A', SESSION)
    const r = recordBlockedAttempt('B', SESSION)
    expect(r?.status).toBe('active')
    expect(r?.attempts).toBe(1)
  })

  test('case-insensitive comparison', () => {
    setGoal('x', { sessionId: SESSION })
    recordBlockedAttempt('compile error', SESSION)
    recordBlockedAttempt('Compile Error', SESSION)
    const r = recordBlockedAttempt('COMPILE ERROR', SESSION)
    expect(r?.status).toBe('blocked')
  })

  test('resume resets blocked attempts', () => {
    setGoal('x', { sessionId: SESSION })
    recordBlockedAttempt('oops', SESSION)
    recordBlockedAttempt('oops', SESSION)
    pauseGoal(SESSION)
    resumeGoal(SESSION)
    expect(getGoal(SESSION)!.blockedAttempts).toBe(0)
  })
})

describe('completeGoal / clearGoal / markUsageLimited', () => {
  test('completeGoal transitions to complete', () => {
    setGoal('x', { sessionId: SESSION })
    const g = completeGoal(SESSION)
    expect(g?.status).toBe('complete')
  })

  test('clearGoal removes entirely', () => {
    setGoal('x', { sessionId: SESSION })
    expect(clearGoal(SESSION)).toBe(true)
    expect(getGoal(SESSION)).toBeNull()
  })

  test('markUsageLimited transitions active → usage_limited', () => {
    setGoal('x', { sessionId: SESSION })
    markUsageLimited(SESSION)
    expect(getGoal(SESSION)?.status).toBe('usage_limited')
  })
})

describe('incrementGoalTurns', () => {
  test('counts correctly', () => {
    setGoal('x', { sessionId: SESSION })
    expect(incrementGoalTurns(SESSION)).toBe(1)
    expect(incrementGoalTurns(SESSION)).toBe(2)
    expect(getGoal(SESSION)?.turnsExecuted).toBe(2)
  })

  test('returns 0 when no goal', () => {
    expect(incrementGoalTurns(SESSION)).toBe(0)
  })
})

describe('max_turns lifecycle', () => {
  test('markGoalMaxTurnsReached flips active goal once cap is reached', () => {
    setGoal('x', { sessionId: SESSION })
    const goal = getGoal(SESSION)!
    goal.turnsExecuted = MAX_GOAL_TURNS
    const marked = markGoalMaxTurnsReached(SESSION)
    expect(marked?.status).toBe('max_turns')
  })

  test('continueGoalFromMaxTurns resets turns and re-activates goal', () => {
    setGoal('x', { sessionId: SESSION })
    const goal = getGoal(SESSION)!
    goal.turnsExecuted = MAX_GOAL_TURNS
    markGoalMaxTurnsReached(SESSION)
    const resumed = continueGoalFromMaxTurns(SESSION)
    expect(resumed?.status).toBe('active')
    expect(resumed?.turnsExecuted).toBe(0)
  })
})

describe('formatGoalStatusLabel', () => {
  test('returns human-readable labels', () => {
    expect(formatGoalStatusLabel('active')).toBe('Active')
    expect(formatGoalStatusLabel('paused')).toBe('Paused')
    expect(formatGoalStatusLabel('blocked')).toBe('Blocked')
    expect(formatGoalStatusLabel('budget_limited')).toBe('Budget Limited')
    expect(formatGoalStatusLabel('usage_limited')).toBe('Usage Limited')
    expect(formatGoalStatusLabel('max_turns')).toBe('Max Turns Reached')
    expect(formatGoalStatusLabel('complete')).toBe('Complete')
  })
})

describe('formatGoalElapsed', () => {
  test('returns "0s" for brand-new goals', () => {
    const g = setGoal('x', { sessionId: SESSION })
    expect(formatGoalElapsed(g)).toBe('0s')
  })
})
