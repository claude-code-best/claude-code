import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../analytics/index.js'
import { getSessionsSinceLastShown, recordTipShown } from './tipHistory.js'
import { getRelevantTips } from './tipRegistry.js'
import type { Tip, TipContext } from './types.js'

/**
 * Resolve a tip's scheduling priority. Lower number = shown first.
 * Undefined priority ranks after any defined priority (official tips that
 * declare `priority: 1` surface first among ties).
 */
function tipPriority(tip: Tip): number {
  return tip.priority ?? Number.POSITIVE_INFINITY
}

export function selectTipWithLongestTimeSinceShown(
  availableTips: Tip[],
): Tip | undefined {
  if (availableTips.length === 0) {
    return undefined
  }

  if (availableTips.length === 1) {
    return availableTips[0]
  }

  // Sort tips by sessions since last shown (descending) and take the first one
  // This is the tip that hasn't been shown for the longest time.
  // Ties (e.g. several never-shown tips, all Infinity) break by ascending
  // `priority` — official tips declare priority: 1 to surface first.
  const tipsWithSessions = availableTips.map(tip => ({
    tip,
    sessions: getSessionsSinceLastShown(tip.id),
    priority: tipPriority(tip),
  }))

  tipsWithSessions.sort(
    (a, b) => b.sessions - a.sessions || a.priority - b.priority,
  )
  return tipsWithSessions[0]?.tip
}

export async function getTipToShowOnSpinner(
  context?: TipContext,
): Promise<Tip | undefined> {
  // Check if tips are disabled (default to true if not set)
  if (getSettings_DEPRECATED().spinnerTipsEnabled === false) {
    return undefined
  }

  const tips = await getRelevantTips(context)
  if (tips.length === 0) {
    return undefined
  }

  return selectTipWithLongestTimeSinceShown(tips)
}

export function recordShownTip(tip: Tip): void {
  // Record in history
  recordTipShown(tip.id)

  // Log event for analytics. Command names are strings, so per the
  // no-strings analytics convention we log a boolean flag instead of the
  // command itself.
  logEvent('tengu_tip_shown', {
    tipIdLength:
      tip.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    cooldownSessions: tip.cooldownSessions,
    maxLifetimeShows: tip.maxLifetimeShows,
    priority: tip.priority,
    hasAdvertisedCommand: tip.advertisedCommand !== undefined,
  })
}
