import { feature } from 'bun:bundle'
import { getKairosActive } from '../bootstrap/state.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js'

/**
 * Runtime gate for KAIROS features.
 *
 * Two-layer gate:
 *   1. Build-time: feature('KAIROS') must be on
 *   2. Runtime: tengu_kairos_assistant GrowthBook flag (remote kill switch)
 *
 * Called by main.tsx BEFORE setKairosActive(true) — must NOT check
 * kairosActive (that would deadlock: gate needs active, active needs gate).
 * The caller (main.tsx L1826-1832) sets kairosActive after this returns true.
 */
export async function isKairosEnabled(): Promise<boolean> {
  if (!feature('KAIROS')) {
    return false
  }
  if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_kairos_assistant', false)) {
    return false
  }
  return true
}
