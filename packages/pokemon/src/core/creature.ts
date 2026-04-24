import { randomUUID } from 'node:crypto'
import type { Creature, SpeciesId, StatName, StatsResult } from '../types'
import { STAT_NAMES } from '../types'
import { getSpeciesData } from '../dex/species'
import { determineGender } from './gender'
import { levelFromXp } from '../dex/xpTable'
import { gen, TO_DEX_STAT, getSpecies } from '../dex/pkmn'
import { getDefaultMoveset, randomAbility } from '../dex/learnsets'
import { randomNature } from '../dex/nature'

/**
 * Generate a new creature of the given species.
 */
export async function generateCreature(speciesId: SpeciesId, seed?: number): Promise<Creature> {
  const species = getSpeciesData(speciesId)
  const actualSeed = seed ?? Math.floor(Math.random() * 0xffffffff)

  // Generate PID (32-bit personality value) from seed
  const pid = generatePID(actualSeed)

  // Generate IVs (0-31) extracted from PID (Gen 3+ style)
  const iv = generateIVsFromPID(pid)

  // Determine gender from PID's low 8 bits (Gen 3+ style)
  const gender = determineGender(species, pid & 0xff)

  // Determine shiny status from PID XOR (Gen 3+ style)
  const isShiny = checkShiny(pid, actualSeed)

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
    ability: randomAbility(speciesId),
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
 * Generate a 32-bit Personality Value (PID) from a seed.
 * PID is the core identity value used for shiny check, gender, IVs, etc.
 */
function generatePID(seed: number): number {
  let s = seed
  const next = () => { s = ((s * 1103515245 + 12345) & 0x7fffffff) >>> 0; return s }
  return ((next() & 0xffff) | ((next() & 0xffff) << 16)) >>> 0
}

/**
 * Generate IVs from PID using Gen 3+ style extraction.
 * HP IV = bits 0-4 of (pid >> 16) | (pid & 0xffff) is NOT used here;
 * instead we use the more common method:
 *   word1 = pid (lower 16 bits), word2 = pid >> 16 (upper 16 bits)
 *   hp = word1 & 0x1f, atk = (word1 >> 5) & 0x1f, def = (word1 >> 10) & 0x1f
 *   spe = word2 & 0x1f, spa = (word2 >> 5) & 0x1f, spd = (word2 >> 10) & 0x1f
 */
function generateIVsFromPID(pid: number): Record<StatName, number> {
  const word1 = pid & 0xffff
  const word2 = (pid >>> 16) & 0xffff
  return {
    hp: word1 & 0x1f,
    attack: (word1 >>> 5) & 0x1f,
    defense: (word1 >>> 10) & 0x1f,
    speed: word2 & 0x1f,
    spAtk: (word2 >>> 5) & 0x1f,
    spDef: (word2 >>> 10) & 0x1f,
  }
}

/**
 * Check shiny status using PID XOR method (Gen 3+).
 * Shiny if (pid_upper16 XOR pid_lower16 XOR trainerID XOR secretID) < threshold.
 * Since we don't have trainer IDs, use the seed's high/low as proxy.
 */
function checkShiny(pid: number, seed: number): boolean {
  const pidUpper = (pid >>> 16) & 0xffff
  const pidLower = pid & 0xffff
  const trainerId = seed & 0xffff
  const secretId = (seed >>> 16) & 0xffff
  const xorResult = pidUpper ^ pidLower ^ trainerId ^ secretId
  // Standard threshold: 1 (1/65536 per encounter, ~1/8192 with both checks)
  // Gen 8+: 16 (1/4096 base rate, 1/1024 with charm)
  return xorResult < 16
}

/**
 * Get total EV across all stats.
 */
export function getTotalEV(creature: Creature): number {
  return STAT_NAMES.reduce((sum, stat) => sum + creature.ev[stat], 0)
}
