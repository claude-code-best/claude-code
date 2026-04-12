import { feature } from 'bun:bundle'
import { getKairosActive } from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'

/**
 * Runtime gate for KAIROS features.
 *
 * Build-time: feature('KAIROS') must be on (checked by caller before
 * this module is required).
 *
 * Runtime: tengu_kairos_assistant GrowthBook flag acts as a remote kill
 * switch, and kairosActive state must be true (set during bootstrap when
 * the session qualifies for KAIROS features).
 */
export async function isKairosEnabled(): Promise<boolean> {
  if (!feature('KAIROS')) {
    return false
  }
  if (
    !getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos_assistant', false)
  ) {
    return false
  }
  return getKairosActive()
}
