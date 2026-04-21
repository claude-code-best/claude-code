import type { Creature, EvolutionResult, SpeciesId } from '../types'
import { SPECIES_DATA } from '../data/species'
import { getNextEvolution } from '../data/evolution'

/**
 * Check if a creature meets evolution conditions.
 * Returns the evolution result if evolution should occur, null otherwise.
 */
export function checkEvolution(creature: Creature): EvolutionResult | null {
	if (creature.level > 100) return null

	const nextEvo = getNextEvolution(creature.speciesId)
	if (!nextEvo) return null

	// Check level-up conditions
	if (nextEvo.trigger === 'level_up' && creature.level >= nextEvo.minLevel) {
		return {
			from: creature.speciesId,
			to: nextEvo.to,
			newLevel: creature.level,
		}
	}

	return null
}

/**
 * Execute evolution on a creature.
 * Returns the updated creature with new species and recalculated data.
 */
export function evolve(creature: Creature, targetSpeciesId: SpeciesId): Creature {
	const newSpecies = SPECIES_DATA[targetSpeciesId]

	return {
		...creature,
		speciesId: targetSpeciesId,
		friendship: Math.min(255, creature.friendship + 10), // Evolution boosts friendship
	}
}

/**
 * Check if a species can evolve further.
 */
export function canEvolveFurther(speciesId: SpeciesId): boolean {
	return getNextEvolution(speciesId) !== undefined
}
