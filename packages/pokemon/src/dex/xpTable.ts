import type { GrowthRate } from '../types'

/**
 * Calculate total XP required to reach a given level for a growth rate type.
 * Follows original Pokémon XP curve formulas.
 */
export function xpForLevel(level: number, growthRate: GrowthRate): number {
  if (level <= 1) return 0
  const n = level
  switch (growthRate) {
    case 'erratic':
      return xpErratic(n)
    case 'fast':
      return Math.floor((n * n * n * 4) / 5)
    case 'medium-fast':
      return n * n * n
    case 'medium-slow':
      return Math.floor((6 / 5) * n * n * n - 15 * n * n + 100 * n - 140)
    case 'slow':
      return Math.floor((5 * n * n * n) / 4)
    case 'fluctuating':
      return xpFluctuating(n)
    default:
      return n * n * n
  }
}

/**
 * Calculate level from total XP for a given growth rate.
 */
export function levelFromXp(totalXp: number, growthRate: GrowthRate): number {
  // Binary search for level
  let lo = 1
  let hi = 100
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (xpForLevel(mid, growthRate) <= totalXp) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return Math.min(lo, 100)
}

/**
 * XP needed to go from current level to next level.
 */
export function xpToNextLevel(currentLevel: number, totalXp: number, growthRate: GrowthRate): number {
  if (currentLevel >= 100) return 0
  const nextLevelXp = xpForLevel(currentLevel + 1, growthRate)
  return nextLevelXp - totalXp
}

// Erratic growth rate (complex piecewise)
function xpErratic(n: number): number {
  if (n <= 1) return 0
  if (n <= 50) {
    return Math.floor((n * n * n * (100 - n)) / 50)
  }
  if (n <= 68) {
    return Math.floor((n * n * n * (150 - n)) / 100)
  }
  if (n <= 98) {
    return Math.floor((n * n * n * Math.floor((1911 - 10 * n) / 3)) / 500)
  }
  // n 99-100
  return Math.floor((n * n * n * (160 - n)) / 100)
}

// Fluctuating growth rate (complex piecewise)
function xpFluctuating(n: number): number {
  if (n <= 1) return 0
  if (n <= 15) {
    return Math.floor((n * n * n * (Math.floor((n + 1) / 3) + 24)) / 50)
  }
  if (n <= 36) {
    return Math.floor((n * n * n * (n + 14)) / 50)
  }
  return Math.floor((n * n * n * (Math.floor(n / 2) + 32)) / 50)
}
