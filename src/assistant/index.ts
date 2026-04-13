import { readFileSync } from 'fs'
import { join } from 'path'
import { getKairosActive } from '../bootstrap/state.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

let _assistantForced = false

/**
 * Whether the current session is in assistant (KAIROS) daemon mode.
 * Wraps the bootstrap kairosActive state set by main.tsx after gate check.
 */
export function isAssistantMode(): boolean {
  return getKairosActive()
}

/**
 * Mark this session as forced assistant mode (--assistant flag).
 * Skips the GrowthBook gate check — daemon is pre-entitled.
 */
export function markAssistantForced(): void {
  _assistantForced = true
}

export function isAssistantForced(): boolean {
  return _assistantForced
}

/**
 * Pre-create an in-process team so Agent(name) can spawn teammates
 * without TeamCreate.
 *
 * Phase 1: returns undefined so main.tsx's `assistantTeamContext ?? computeInitialTeamContext()`
 * correctly falls back. Returning {} would bypass the ?? operator since {} is truthy.
 *
 * Phase 2: should return a full team context object matching AppState.teamContext shape.
 */
export async function initializeAssistantTeam(): Promise<undefined> {
  return undefined
}

/**
 * Assistant-specific system prompt addendum loaded from ~/.claude/agents/assistant.md.
 * Returns empty string if the file doesn't exist.
 */
export function getAssistantSystemPromptAddendum(): string {
  try {
    return readFileSync(
      join(getClaudeConfigHomeDir(), 'agents', 'assistant.md'),
      'utf-8',
    )
  } catch {
    return ''
  }
}

/**
 * How assistant mode was activated. Used for diagnostics/analytics.
 * - 'daemon': via --assistant flag (Agent SDK daemon)
 * - 'gate': via GrowthBook gate check
 */
export function getAssistantActivationPath(): string | undefined {
  if (!isAssistantMode()) return undefined
  return _assistantForced ? 'daemon' : 'gate'
}
