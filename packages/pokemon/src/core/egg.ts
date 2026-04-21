import { randomUUID } from 'node:crypto'
import type { BuddyData, Creature, Egg, SpeciesId } from '../types'
import { ALL_SPECIES_IDS } from '../types'
import { SPECIES_DATA } from '../data/species'
import { generateCreature } from './creature'

/** Days of consecutive coding needed to be eligible for an egg */
export const EGG_REQUIRED_DAYS = 3

/**
 * Check if the player is eligible to receive an egg.
 * Conditions: consecutiveDays >= EGG_REQUIRED_DAYS AND totalTurns % 50 === 0 AND eggs.length < 1
 */
export function checkEggEligibility(buddyData: BuddyData): boolean {
	if (buddyData.eggs.length >= 1) return false
	if (buddyData.stats.consecutiveDays < EGG_REQUIRED_DAYS) return false
	if (buddyData.stats.totalTurns % 50 !== 0) return false
	return true
}

/**
 * Generate a new egg with a species the player hasn't collected yet.
 * Priority: uncollected species > random from all species.
 */
export function generateEgg(buddyData: BuddyData): Egg {
	// Find uncollected species
	const collectedSpecies = new Set(buddyData.creatures.map((c) => c.speciesId))
	const uncollected = ALL_SPECIES_IDS.filter((id) => !collectedSpecies.has(id))

	// Pick species (prefer uncollected, fall back to random starter)
	const starters: SpeciesId[] = ['bulbasaur', 'charmander', 'squirtle', 'pikachu']
	const speciesId = uncollected.length > 0
		? uncollected[Math.floor(Math.random() * uncollected.length)]
		: starters[Math.floor(Math.random() * starters.length)]

	// Steps based on rarity (capture rate: lower = rarer = more steps)
	const species = SPECIES_DATA[speciesId]
	const baseSteps = Math.floor(2000 + ((255 - species.captureRate) / 255) * 3000)

	return {
		id: randomUUID(),
		obtainedAt: Date.now(),
		stepsRemaining: baseSteps,
		totalSteps: baseSteps,
		speciesId,
	}
}

/**
 * Advance egg steps by a given amount.
 * Returns updated egg or null if egg hatched.
 */
export function advanceEggSteps(egg: Egg, steps: number): Egg {
	const newSteps = Math.max(0, egg.stepsRemaining - steps)
	return { ...egg, stepsRemaining: newSteps }
}

/**
 * Check if an egg is ready to hatch.
 */
export function isEggReadyToHatch(egg: Egg): boolean {
	return egg.stepsRemaining <= 0
}

/**
 * Hatch an egg, creating a new creature and updating buddy data.
 */
export function hatchEgg(buddyData: BuddyData, egg: Egg): { buddyData: BuddyData; creature: Creature } {
	const creature = generateCreature(egg.speciesId)
	creature.hatchedAt = Date.now()

	// Update buddy data
	const updatedData: BuddyData = {
		...buddyData,
		creatures: [...buddyData.creatures, creature],
		eggs: buddyData.eggs.filter((e) => e.id !== egg.id),
		dex: updateDexEntry(buddyData.dex, egg.speciesId, creature.level),
		stats: {
			...buddyData.stats,
			totalEggsObtained: buddyData.stats.totalEggsObtained + 1,
		},
	}

	return { buddyData: updatedData, creature }
}

/**
 * Update or create a dex entry for a species.
 */
function updateDexEntry(dex: BuddyData['dex'], speciesId: SpeciesId, level: number): BuddyData['dex'] {
	const existing = dex.find((d) => d.speciesId === speciesId)
	if (existing) {
		return dex.map((d) =>
			d.speciesId === speciesId
				? { ...d, caughtCount: d.caughtCount + 1, bestLevel: Math.max(d.bestLevel, level) }
				: d,
		)
	}
	return [...dex, { speciesId, discoveredAt: Date.now(), caughtCount: 1, bestLevel: level }]
}
