import { Dex } from '@pkmn/sim'
import { Generations } from '@pkmn/data'
import type { StatName } from '../types'

// Singleton Gen 9 data source
const gens = new Generations(Dex as unknown as import('@pkmn/data').Dex)
export const gen = gens.get(9)

// Stat name mapping: @pkmn/sim → our StatName
export const FROM_DEX_STAT: Record<string, StatName> = {
  hp: 'hp', atk: 'attack', def: 'defense',
  spa: 'spAtk', spd: 'spDef', spe: 'speed',
}

// Stat name mapping: our StatName → @pkmn/sim abbreviation
export const TO_DEX_STAT: Record<StatName, string> = {
  hp: 'hp', attack: 'atk', defense: 'def',
  spAtk: 'spa', spDef: 'spd', speed: 'spe',
}

/** Query species from Dex (uses Dex directly for full coverage) */
export function getSpecies(id: string) {
  return Dex.species.get(id)
}

/** Map Dex baseStats to our StatName format */
export function mapBaseStats(dexStats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }): Record<StatName, number> {
  const result = {} as Record<StatName, number>
  for (const [dexKey, ourKey] of Object.entries(FROM_DEX_STAT)) {
    result[ourKey] = dexStats[dexKey as keyof typeof dexStats] ?? 0
  }
  return result
}

/** Get gender rate from Dex genderRatio (M/F ratio → our genderRate 0-8) */
export function mapGenderRatio(genderRatio?: { M: number; F: number } | string): number {
  if (!genderRatio || typeof genderRatio === 'string') return -1 // genderless
  return Math.round(genderRatio.F * 8)
}
