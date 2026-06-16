/**
 * Audit rules constants for goal completion and blocked assessment.
 * Shared by prompt templates and integration tests.
 */
import { BLOCKED_CONSECUTIVE_THRESHOLD, MAX_GOAL_TURNS } from './goalState.js'
import type { GoalStatus } from '../../types/logs.js'

export { BLOCKED_CONSECUTIVE_THRESHOLD, MAX_GOAL_TURNS }

export const COMPLETION_AUDIT_RULES = [
  'Derive concrete requirements from the objective and any referenced files.',
  'Preserve the original scope — do not redefine success around what is already done.',
  'For every explicit requirement, identify authoritative evidence (test output, file content, command result).',
  'Treat tests, manifests, and verifiers as evidence only after confirming they actually cover the requirement.',
  'Treat uncertain or indirect evidence as "not achieved".',
  'The audit must PROVE completion, not merely fail to find remaining work.',
] as const

export const BLOCKED_AUDIT_RULES = [
  'The same blocking condition must persist across at least 3 consecutive continuation turns.',
  '"Difficult", "slow", or "partially incomplete" is NOT blocked.',
  'Only genuinely insurmountable obstacles qualify (missing credentials, external service down, etc.).',
] as const

export function isGoalTerminal(status: GoalStatus): boolean {
  return (
    status === 'complete' ||
    status === 'blocked' ||
    status === 'budget_limited' ||
    status === 'usage_limited' ||
    status === 'max_turns'
  )
}
