import type { Creature } from '../types'
import { SPECIES_DATA } from '../data/species'
import { levelFromXp, xpForLevel } from '../data/xpTable'

/**
 * Award XP to a creature. Returns updated creature and whether level up occurred.
 */
export function awardXP(creature: Creature, amount: number): { creature: Creature; leveledUp: boolean; newLevel: number } {
	const species = SPECIES_DATA[creature.speciesId]
	if (creature.level >= 100) {
		return { creature, leveledUp: false, newLevel: creature.level }
	}

	const newTotalXp = creature.totalXp + amount
	const oldLevel = creature.level
	const newLevel = Math.min(levelFromXp(newTotalXp, species.growthRate), 100)

	// XP progress within current level
	const currentLevelXp = xpForLevel(newLevel, species.growthRate)
	const nextLevelXp = newLevel < 100 ? xpForLevel(newLevel + 1, species.growthRate) : currentLevelXp
	const xp = newTotalXp - currentLevelXp

	const updated: Creature = {
		...creature,
		totalXp: newTotalXp,
		xp: Math.max(0, xp),
		level: newLevel,
	}

	return {
		creature: updated,
		leveledUp: newLevel > oldLevel,
		newLevel,
	}
}

/**
 * Get XP needed to reach next level from current state.
 */
export function getXpProgress(creature: Creature): { current: number; needed: number; percentage: number } {
	const species = SPECIES_DATA[creature.speciesId]
	const currentLevelXp = xpForLevel(creature.level, species.growthRate)
	const nextLevelXp = creature.level < 100 ? xpForLevel(creature.level + 1, species.growthRate) : currentLevelXp
	const needed = nextLevelXp - currentLevelXp
	const current = creature.totalXp - currentLevelXp

	return {
		current: Math.max(0, current),
		needed,
		percentage: needed > 0 ? Math.min(100, Math.floor((current / needed) * 100)) : 100,
	}
}
