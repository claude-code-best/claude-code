import { Dex } from '@pkmn/sim'
import { FROM_DEX_STAT } from './pkmn'
import type { NatureName, NatureEffect, NatureStat } from '../types'

// All 25 canonical nature names (Dex.natures is not iterable, so we list them)
const NATURE_IDS: NatureName[] = [
  'hardy', 'lonely', 'brave', 'adamant', 'naughty',
  'bold', 'docile', 'relaxed', 'impish', 'lax',
  'timid', 'hasty', 'serious', 'jolly', 'naive',
  'modest', 'mild', 'quiet', 'bashful', 'rash',
  'calm', 'gentle', 'sassy', 'careful', 'quirky',
]

/** Get all nature names */
export function getAllNatureNames(): NatureName[] {
  return NATURE_IDS.filter(name => Dex.natures.get(name)?.exists)
}

/** Randomly assign a nature */
export function randomNature(): NatureName {
  const names = getAllNatureNames()
  return names[Math.floor(Math.random() * names.length)]!
}

/** Map Dex stat abbreviation (atk, spa, spe, etc.) to our NatureStat format */
function mapDexStat(stat: string | undefined): NatureStat | null {
  if (!stat) return null
  return (FROM_DEX_STAT[stat] as NatureStat) ?? null
}

/** Get nature effect (plus/minus stat, or null for neutral) — delegates to Dex.natures */
export function getNatureEffect(nature: NatureName): NatureEffect {
  const n = Dex.natures.get(nature)
  if (!n?.exists) return { plus: null, minus: null }
  return {
    plus: mapDexStat(n.plus),
    minus: mapDexStat(n.minus),
  }
}
