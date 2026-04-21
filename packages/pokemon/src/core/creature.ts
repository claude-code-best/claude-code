import { randomUUID } from 'node:crypto'
import type { Creature, SpeciesId, StatName, StatsResult } from '../types'
import { STAT_NAMES } from '../types'
import { SPECIES_DATA } from '../data/species'
import { determineGender } from './gender'
import { levelFromXp } from '../data/xpTable'

/**
 * Generate a new creature of the given species.
 */
export function generateCreature(speciesId: SpeciesId, seed?: number): Creature {
	const species = SPECIES_DATA[speciesId]
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
		ev: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
		iv,
		friendship: species.baseHappiness,
		isShiny,
		hatchedAt: Date.now(),
	}
}

/**
 * Calculate actual stats for a creature using Pokémon stat formulas.
 * HP: floor((2 * base + iv + floor(ev/4)) * level / 100) + level + 10
 * Other: floor((2 * base + iv + floor(ev/4)) * level / 100) + 5
 */
export function calculateStats(creature: Creature): StatsResult {
	const species = SPECIES_DATA[creature.speciesId]
	const level = creature.level
	const result: StatsResult = {} as StatsResult

	for (const stat of STAT_NAMES) {
		const base = species.baseStats[stat]
		const iv = creature.iv[stat]
		const ev = creature.ev[stat]
		const raw = Math.floor((2 * base + iv + Math.floor(ev / 4)) * level / 100)

		if (stat === 'hp') {
			result[stat] = raw + level + 10
		} else {
			result[stat] = raw + 5
		}
	}

	return result
}

/**
 * Get display name for a creature (nickname or species name).
 */
export function getCreatureName(creature: Creature): string {
	if (creature.nickname) return creature.nickname
	return SPECIES_DATA[creature.speciesId].name
}

/**
 * Recalculate level from total XP (e.g. after XP gain).
 */
export function recalculateLevel(creature: Creature): Creature {
	const species = SPECIES_DATA[creature.speciesId]
	const newLevel = levelFromXp(creature.totalXp, species.growthRate)
	if (newLevel !== creature.level) {
		return { ...creature, level: newLevel }
	}
	return creature
}

/**
 * Get the active creature from buddy data.
 */
export function getActiveCreature(buddyData: { activeCreatureId: string | null; creatures: Creature[] }): Creature | null {
	if (!buddyData.activeCreatureId) return null
	return buddyData.creatures.find((c) => c.id === buddyData.activeCreatureId) ?? null
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
