import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

export function recordTipShown(tipId: string): void {
  const numStartups = getGlobalConfig().numStartups
  saveGlobalConfig(c => {
    const history = c.tipsHistory ?? {}
    // Already recorded this session (e.g. a double recordShownTip call) —
    // treat as the same show: no write, no extra lifetime count.
    if (history[tipId] === numStartups) return c
    const showCounts = c.tipsShowCounts ?? {}
    return {
      ...c,
      tipsHistory: { ...history, [tipId]: numStartups },
      tipsShowCounts: { ...showCounts, [tipId]: (showCounts[tipId] ?? 0) + 1 },
    }
  })
}

export function getSessionsSinceLastShown(tipId: string): number {
  const config = getGlobalConfig()
  const lastShown = config.tipsHistory?.[tipId]
  if (!lastShown) return Infinity
  return config.numStartups - lastShown
}

/** Lifetime show count for a tip (0 when never shown). Backs maxLifetimeShows. */
export function getTipShowCount(tipId: string): number {
  return getGlobalConfig().tipsShowCounts?.[tipId] ?? 0
}
