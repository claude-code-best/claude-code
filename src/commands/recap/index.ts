/**
 * /recap — Generate a one-line session recap now.
 *
 * Aliases: /away, /catchup
 *
 * Mirrors the official v2.1.123 implementation:
 *   - Gated by AWAY_SUMMARY feature flag (must be set at runtime) AND
 *     the 'tengu_sedge_lantern' GrowthBook flag (default: true)
 *   - Calls generateRecap() which shares the main loop's prompt-cache prefix
 *   - Returns a short (≤40 word) plain-text sentence describing the current
 *     goal, active task, and next action — no markdown, no status reports
 *
 * When the user has been away and comes back, they can type /recap (or /away /
 * /catchup) to get an instant orientation without scrolling back through history.
 *
 * isEnabled guard: the automatic "while you were away" card in REPL.tsx already
 * checks feature('AWAY_SUMMARY'). For the manual /recap command we check the
 * same GrowthBook flag so the two surfaces stay in sync.
 */
import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'
import type {
  Command,
  LocalCommandCall,
  LocalCommandResult,
} from '../../types/command.js'

// ── Call implementation ───────────────────────────────────────────────────────

const call: LocalCommandCall = async (_args, context) => {
  // Dynamic import keeps the heavy forkedAgent dependency out of module load
  const { generateRecap } = await import('./generateRecap.js')

  const signal = context.abortController?.signal ?? new AbortController().signal
  const result = await generateRecap(signal)

  switch (result.kind) {
    case 'ok':
    case 'api-error':
      return { type: 'text', value: result.text } satisfies LocalCommandResult

    case 'no-turn':
      return {
        type: 'text',
        value: 'Nothing to recap yet \u2014 send a message first.',
      } satisfies LocalCommandResult

    case 'aborted':
      return {
        type: 'text',
        value: 'Recap cancelled.',
      } satisfies LocalCommandResult

    case 'failed':
      return {
        type: 'text',
        value: 'Couldn\u2019t generate a recap. Run with --debug for details.',
      } satisfies LocalCommandResult
  }
}

// ── Command declaration ───────────────────────────────────────────────────────

const recap = {
  type: 'local',
  name: 'recap',
  description: 'Generate a one-line session recap now',
  aliases: ['away', 'catchup'],
  /**
   * Enabled when:
   *  1. The AWAY_SUMMARY feature flag is on (build/env), AND
   *  2. The 'tengu_sedge_lantern' GrowthBook flag is true (default: true)
   *
   * This matches the isEnabled() predicate used in the official binary and
   * keeps this command in sync with the automatic away-summary card in REPL.
   */
  isEnabled: (): boolean => {
    if (!feature('AWAY_SUMMARY')) return false
    return getFeatureValue_CACHED_MAY_BE_STALE('tengu_sedge_lantern', true)
  },
  supportsNonInteractive: false,
  isHidden: false,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default recap
