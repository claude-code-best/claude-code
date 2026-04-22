import type { StatName } from '../types'

/**
 * Default EV mapping: tool name → EV gains per use.
 * Tools not in this mapping get random 1-2 EV points.
 */
export const DEFAULT_EV_MAPPING: Record<string, Record<StatName, number>> = {
  Bash: { hp: 0, attack: 2, defense: 0, spAtk: 0, spDef: 0, speed: 1 },
  Edit: { hp: 0, attack: 0, defense: 1, spAtk: 2, spDef: 0, speed: 0 },
  Write: { hp: 0, attack: 0, defense: 0, spAtk: 3, spDef: 0, speed: 0 },
  Read: { hp: 1, attack: 0, defense: 2, spAtk: 0, spDef: 0, speed: 0 },
  Grep: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 2, speed: 1 },
  Glob: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 2, speed: 1 },
  Agent: { hp: 0, attack: 1, defense: 0, spAtk: 0, spDef: 0, speed: 2 },
  WebSearch: { hp: 1, attack: 0, defense: 0, spAtk: 0, spDef: 2, speed: 0 },
  WebFetch: { hp: 1, attack: 0, defense: 0, spAtk: 0, spDef: 2, speed: 0 },
}

// EV limits (matching original Pokémon)
export const MAX_EV_PER_STAT = 252
export const MAX_EV_TOTAL = 510

// EV cooldown: same tool type only counts once per 30 seconds
export const EV_COOLDOWN_MS = 30_000

/**
 * Get EV gains for a tool. Returns undefined if not mapped (→ random).
 */
export function getEVForTool(toolName: string): Record<StatName, number> | undefined {
  return DEFAULT_EV_MAPPING[toolName]
}
