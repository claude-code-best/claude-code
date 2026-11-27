import type { GlobalConfig } from '../../utils/config.js'

/**
 * Agents view settings (official Claude Code 2.1.330, strings L930821/L907438).
 *
 * Two GlobalConfig booleans surface as /config rows:
 * - `leftArrowOpensAgents` (default **true**): ← at the start of the input
 *   line opens the agents view.
 * - `defaultToAgentsView` (default **false**): launch straight into the
 *   agents view when no prompt argument is given.
 */

/** ← at input start opens the agents view. Default true. */
export function getLeftArrowOpensAgents(
  config: Pick<GlobalConfig, 'leftArrowOpensAgents'>,
): boolean {
  return config.leftArrowOpensAgents !== false
}

/** Launch into the agents view by default (no prompt args). Default false. */
export function getDefaultToAgentsView(
  config: Pick<GlobalConfig, 'defaultToAgentsView'>,
): boolean {
  return config.defaultToAgentsView === true
}
