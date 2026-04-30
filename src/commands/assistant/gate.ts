import { feature } from 'bun:bundle'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js'

/**
 * Runtime gate for the /assistant command visibility.
 *
 * Build-time: feature('KAIROS') must be on.
 * Runtime: tengu_kairos_assistant GrowthBook flag (remote kill switch).
 *
 * Does NOT require kairosActive — the /assistant command is visible
 * before activation so users can invoke it to activate KAIROS.
 */
export function isAssistantEnabled(): boolean {
  if (!feature('KAIROS')) {
    return false
  }
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos_assistant', false)) {
    return false
  }
  return true
}
