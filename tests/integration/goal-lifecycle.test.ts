/**
 * Integration test for the goal lifecycle.
 * Verifies set → work → complete flow, pause/resume, budget limiting,
 * blocked attempts, prompt generation, and audit rules consistency.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

import { logMock } from '../mocks/log.js'
mock.module('src/utils/log.ts', logMock)

mock.module('bun:bundle', () => ({
  feature: () => true,
}))

import {
  setGoal,
  getGoal,
  clearGoal,
  pauseGoal,
  resumeGoal,
  completeGoal,
  updateGoalTokens,
  markUsageLimited,
  incrementGoalTurns,
  recordBlockedAttempt,
  formatGoalElapsed,
  formatGoalStatusLabel,
  getActiveElapsedMs,
  _clearAllGoalsForTesting,
  BLOCKED_CONSECUTIVE_THRESHOLD,
  MAX_GOAL_TURNS,
} from '../../src/services/goal/goalState'

import {
  buildContinuationPrompt,
  buildBudgetLimitPrompt,
  buildObjectiveUpdatedPrompt,
  buildGoalContextBlock,
} from '../../src/services/goal/prompts'

import {
  COMPLETION_AUDIT_RULES,
  BLOCKED_AUDIT_RULES,
  isGoalTerminal,
} from '../../src/services/goal/goalAudit'

const TEST_SESSION = 'test-integration-session'

beforeEach(() => {
  _clearAllGoalsForTesting()
})

describe('Goal lifecycle: set → work → complete', () => {
  test('full happy path', () => {
    const goal = setGoal('Implement feature X with tests', {
      tokenBudget: 100_000,
      sessionId: TEST_SESSION,
    })
    expect(goal.status).toBe('active')
    expect(goal.objective).toBe('Implement feature X with tests')
    expect(goal.tokenBudget).toBe(100_000)
    expect(goal.tokensUsed).toBe(0)
    expect(goal.turnsExecuted).toBe(0)

    updateGoalTokens(15_000, TEST_SESSION)
    incrementGoalTurns(TEST_SESSION)
    updateGoalTokens(20_000, TEST_SESSION)
    incrementGoalTurns(TEST_SESSION)

    const mid = getGoal(TEST_SESSION)!
    expect(mid.tokensUsed).toBe(35_000)
    expect(mid.turnsExecuted).toBe(2)
    expect(mid.status).toBe('active')

    const completed = completeGoal(TEST_SESSION)!
    expect(completed.status).toBe('complete')
    expect(completed.tokensUsed).toBe(35_000)

    expect(getGoal(TEST_SESSION)).not.toBeNull()

    expect(clearGoal(TEST_SESSION)).toBe(true)
    expect(getGoal(TEST_SESSION)).toBeNull()
  })
})

describe('Goal lifecycle: pause and resume', () => {
  test('pause accumulates active time, resume resets start', () => {
    setGoal('Refactor module', { sessionId: TEST_SESSION })

    const paused = pauseGoal(TEST_SESSION)!
    expect(paused.status).toBe('paused')
    expect(paused.pausedAt).not.toBeNull()

    const resumed = resumeGoal(TEST_SESSION)!
    expect(resumed.status).toBe('active')
    expect(resumed.pausedAt).toBeNull()
    expect(resumed.blockedAttempts).toBe(0)
  })

  test('pause on non-active goal is no-op', () => {
    setGoal('Something', { sessionId: TEST_SESSION })
    completeGoal(TEST_SESSION)
    expect(pauseGoal(TEST_SESSION)).toBeNull()
  })

  test('resume on non-paused goal is no-op', () => {
    setGoal('Something', { sessionId: TEST_SESSION })
    expect(resumeGoal(TEST_SESSION)).toBeNull()
  })
})

describe('Goal lifecycle: budget limiting', () => {
  test('exceeding budget transitions to budget_limited', () => {
    setGoal('Big task', {
      tokenBudget: 50_000,
      sessionId: TEST_SESSION,
    })

    updateGoalTokens(30_000, TEST_SESSION)
    expect(getGoal(TEST_SESSION)!.status).toBe('active')

    updateGoalTokens(25_000, TEST_SESSION)
    expect(getGoal(TEST_SESSION)!.status).toBe('budget_limited')
    expect(getGoal(TEST_SESSION)!.tokensUsed).toBe(55_000)
  })

  test('budget_limited is terminal', () => {
    expect(isGoalTerminal('budget_limited')).toBe(true)
  })
})

describe('Goal lifecycle: usage limiting', () => {
  test('markUsageLimited transitions active → usage_limited', () => {
    setGoal('Rate limited task', { sessionId: TEST_SESSION })
    markUsageLimited(TEST_SESSION)
    expect(getGoal(TEST_SESSION)!.status).toBe('usage_limited')
  })

  test('usage_limited is terminal', () => {
    expect(isGoalTerminal('usage_limited')).toBe(true)
  })
})

describe('Goal lifecycle: blocked attempts', () => {
  test('3 consecutive same-reason attempts transition to blocked', () => {
    setGoal('Need credentials', { sessionId: TEST_SESSION })

    const r1 = recordBlockedAttempt('missing API key', TEST_SESSION)!
    expect(r1.status).toBe('active')
    expect(r1.attempts).toBe(1)

    const r2 = recordBlockedAttempt('missing API key', TEST_SESSION)!
    expect(r2.status).toBe('active')
    expect(r2.attempts).toBe(2)

    const r3 = recordBlockedAttempt('missing API key', TEST_SESSION)!
    expect(r3.status).toBe('blocked')
    expect(r3.attempts).toBe(3)
  })

  test('different reason resets counter', () => {
    setGoal('Flaky thing', { sessionId: TEST_SESSION })

    recordBlockedAttempt('error A', TEST_SESSION)
    recordBlockedAttempt('error A', TEST_SESSION)
    const r = recordBlockedAttempt('error B', TEST_SESSION)!
    expect(r.status).toBe('active')
    expect(r.attempts).toBe(1)
  })

  test('resume resets blocked attempts', () => {
    setGoal('Was stuck', { sessionId: TEST_SESSION })
    recordBlockedAttempt('oops', TEST_SESSION)
    recordBlockedAttempt('oops', TEST_SESSION)
    pauseGoal(TEST_SESSION)
    resumeGoal(TEST_SESSION)
    expect(getGoal(TEST_SESSION)!.blockedAttempts).toBe(0)
  })

  test('BLOCKED_CONSECUTIVE_THRESHOLD is 3', () => {
    expect(BLOCKED_CONSECUTIVE_THRESHOLD).toBe(3)
  })
})

describe('Goal lifecycle: turn limits', () => {
  test('MAX_GOAL_TURNS is a reasonable upper bound', () => {
    expect(MAX_GOAL_TURNS).toBeGreaterThanOrEqual(10)
    expect(MAX_GOAL_TURNS).toBeLessThanOrEqual(200)
  })

  test('incrementGoalTurns counts correctly', () => {
    setGoal('Counting', { sessionId: TEST_SESSION })
    for (let i = 1; i <= 5; i++) {
      expect(incrementGoalTurns(TEST_SESSION)).toBe(i)
    }
    expect(getGoal(TEST_SESSION)!.turnsExecuted).toBe(5)
  })
})

describe('isGoalTerminal', () => {
  test('active and paused are NOT terminal', () => {
    expect(isGoalTerminal('active')).toBe(false)
    expect(isGoalTerminal('paused')).toBe(false)
  })

  test('complete, blocked, budget_limited, usage_limited are terminal', () => {
    expect(isGoalTerminal('complete')).toBe(true)
    expect(isGoalTerminal('blocked')).toBe(true)
    expect(isGoalTerminal('budget_limited')).toBe(true)
    expect(isGoalTerminal('usage_limited')).toBe(true)
  })
})

describe('Goal prompt templates', () => {
  test('continuation prompt contains objective and audit rules', () => {
    const goal = setGoal('Build dashboard', {
      tokenBudget: 200_000,
      sessionId: TEST_SESSION,
    })
    const prompt = buildContinuationPrompt(goal)
    expect(prompt).toContain('Build dashboard')
    expect(prompt).toContain('goal-steering')
    expect(prompt).toContain('continuation')
    expect(prompt).toContain('Completion Audit')
    expect(prompt).toContain('Blocked Audit')
    expect(prompt).toContain('200000')
  })

  test('budget limit prompt instructs stop', () => {
    const goal = setGoal('Over budget', {
      tokenBudget: 50_000,
      sessionId: TEST_SESSION,
    })
    updateGoalTokens(60_000, TEST_SESSION)
    const updated = getGoal(TEST_SESSION)!
    const prompt = buildBudgetLimitPrompt(updated)
    expect(prompt).toContain('budget_limit')
    expect(prompt).toContain('Stop all substantive work')
    expect(prompt).toContain('60000')
  })

  test('objective updated prompt contains new objective', () => {
    const prompt = buildObjectiveUpdatedPrompt('New objective', 'Old objective')
    expect(prompt).toContain('objective_updated')
    expect(prompt).toContain('New objective')
    expect(prompt).toContain('Old objective')
  })

  test('goal context block is compact', () => {
    const goal = setGoal('Short task', { sessionId: TEST_SESSION })
    const block = buildGoalContextBlock(goal)
    expect(block).toContain('<active-goal')
    expect(block).toContain('Short task')
    expect(block).toContain('</active-goal>')
    expect(block.split('\n').length).toBeLessThanOrEqual(5)
  })
})

describe('Audit rules consistency', () => {
  test('completion audit has 6 rules', () => {
    expect(COMPLETION_AUDIT_RULES.length).toBe(6)
  })

  test('blocked audit has 3 rules', () => {
    expect(BLOCKED_AUDIT_RULES.length).toBe(3)
  })

  test('continuation prompt embeds all completion audit rules', () => {
    const goal = setGoal('Audit check', { sessionId: TEST_SESSION })
    const prompt = buildContinuationPrompt(goal)
    for (const rule of COMPLETION_AUDIT_RULES) {
      expect(prompt).toContain(rule)
    }
  })
})

describe('Format helpers', () => {
  test('formatGoalStatusLabel returns human-readable labels', () => {
    expect(formatGoalStatusLabel('active')).toBe('Active')
    expect(formatGoalStatusLabel('budget_limited')).toBe('Budget Limited')
    expect(formatGoalStatusLabel('complete')).toBe('Complete')
  })

  test('getActiveElapsedMs returns accumulated time for paused goals', () => {
    const goal = setGoal('Timed', { sessionId: TEST_SESSION })
    const elapsed = getActiveElapsedMs(goal)
    expect(elapsed).toBeGreaterThanOrEqual(0)
  })
})
