import { randomUUID } from 'node:crypto'
import type { Creature, SpeciesId, StatName, StatsResult } from '../types'
import { STAT_NAMES } from '../types'
import { getSpeciesData } from '../dex/species'
import { determineGender } from './gender'
import { levelFromXp } from '../dex/xpTable'
import { gen, TO_DEX_STAT, getSpecies } from '../dex/pkmn'
import { getDefaultMoveset, getDefaultAbility } from '../dex/learnsets'
import { randomNature } from '../dex/nature'

/**
 * Generate a new creature of the given species.
 */
export async function generateCreature(speciesId: SpeciesId, seed?: number): Promise<Creature> {
  const species = getSpeciesData(speciesId)
  const actualSeed = seed ?? Math.floor(Math.random() * 0xffffffff)

  // Generate IVs (0-31) using simple hash from seed
  const iv = generateIVs(actualSeed)

  // Determine gender
  const gender = determineGender(species, actualSeed & 0xff)

  // Determine shiny status
  const isShiny = Math.random() < species.shinyChance

  return {
    id: randomUUID(),
    speciesId,
    gender,
    level: 1,
    xp: 0,
    totalXp: 0,
    nature: randomNature(),
    ev: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
    iv,
    moves: await getDefaultMoveset(speciesId, 1),
    ability: getDefaultAbility(speciesId),
    heldItem: null,
    friendship: species.baseHappiness,
    isShiny,
    hatchedAt: Date.now(),
    pokeball: 'pokeball',
  }
}

/**
 * Calculate actual stats for a creature using @pkmn/data stats.calc().
 * Handles base stats, IV, EV, level, and nature correction internally.
 */
export function calculateStats(creature: Creature): StatsResult {
  const species = getSpecies(creature.speciesId)
  if (!species) throw new Error(`Species ${creature.speciesId} not found`)

  // Get nature if creature has one (Phase 1 adds nature field)
  const nature = 'nature' in creature && creature.nature
    ? gen.natures.get(creature.nature as string)
    : undefined

  const result = {} as StatsResult
  for (const stat of STAT_NAMES) {
    const dexKey = TO_DEX_STAT[stat] as 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
    result[stat] = gen.stats.calc(
      dexKey,
      species.baseStats[dexKey],
      creature.iv[stat],
      creature.ev[stat],
      creature.level,
      nature ?? undefined,
    )
  }
  return result
}

/**
 * Get display name for a creature (nickname or species name).
 */
export function getCreatureName(creature: Creature): string {
  if (creature.nickname) return creature.nickname
  return getSpeciesData(creature.speciesId).name
}

/**
 * Recalculate level from total XP (e.g. after XP gain).
 */
export function recalculateLevel(creature: Creature): Creature {
  const species = getSpeciesData(creature.speciesId)
  const newLevel = levelFromXp(creature.totalXp, species.growthRate)
  if (newLevel !== creature.level) {
    return { ...creature, level: newLevel }
  }
  return creature
}

/**
 * Get the active creature from buddy data.
 * Reads from party[0] (new) with fallback to activeCreatureId (legacy).
 */
export function getActiveCreature(buddyData: { party?: (string | null)[]; activeCreatureId?: string | null; creatures: Creature[] }): Creature | null {
  const activeId = buddyData.party?.[0] ?? buddyData.activeCreatureId ?? null
  if (!activeId) return null
  return buddyData.creatures.find((c) => c.id === activeId) ?? null
}

/**
 * Generate IVs from a seed value. Each stat gets 0-31.
 */
function generateIVs(seed: number): Record<StatName, number> {
  let s = seed
  const nextRand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s
  }
  return {
    hp: nextRand() % 32,
    attack: nextRand() % 32,
    defense: nextRand() % 32,
    spAtk: nextRand() % 32,
    spDef: nextRand() % 32,
    speed: nextRand() % 32,
  }
}

/**
 * Get total EV across all stats.
 */
export function getTotalEV(creature: Creature): number {
  return STAT_NAMES.reduce((sum, stat) => sum + creature.ev[stat], 0)
}
