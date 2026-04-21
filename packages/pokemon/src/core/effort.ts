import type { Creature, StatName } from '../types'
import { STAT_NAMES } from '../types'
import { getEVForTool, MAX_EV_PER_STAT, MAX_EV_TOTAL, EV_COOLDOWN_MS } from '../data/evMapping'
import { getTotalEV } from './creature'

// Track last EV award time per tool to enforce cooldown
const evCooldowns = new Map<string, number>()

/**
 * Reset EV cooldown state (for testing).
 */
export function resetEVCooldowns(): void {
	evCooldowns.clear()
}

/**
 * Award EV to a creature based on tool usage.
 * Returns updated creature and actual EV awarded.
 */
export function awardEV(creature: Creature, toolName: string, timestamp?: number): Creature {
	const now = timestamp ?? Date.now()

	// Check cooldown
	const lastTime = evCooldowns.get(toolName)
	if (lastTime !== undefined && now - lastTime < EV_COOLDOWN_MS) return creature

	const currentTotal = getTotalEV(creature)
	if (currentTotal >= MAX_EV_TOTAL) return creature

	let evGains = getEVForTool(toolName)
	if (!evGains) {
		// Random EV for unmapped tools
		evGains = generateRandomEV()
	}

	const updated = { ...creature, ev: { ...creature.ev } }
	for (const stat of STAT_NAMES) {
		const gain = evGains[stat]
		if (gain > 0) {
			const current = updated.ev[stat]
			const canAdd = Math.min(gain, MAX_EV_PER_STAT - current, MAX_EV_TOTAL - getTotalEV(updated))
			if (canAdd > 0) {
				updated.ev[stat] = current + canAdd
			}
		}
	}

	evCooldowns.set(toolName, now)
	return updated
}

/**
 * Award EVs for a full turn's worth of tool calls.
 * Deduplicates tool names and spaces timestamps to avoid cooldown issues.
 */
export function awardTurnEV(creature: Creature, toolNames: string[], timestamp?: number): Creature {
	const uniqueTools = [...new Set(toolNames)]
	const baseTime = timestamp ?? Date.now()
	let current = creature
	for (let i = 0; i < uniqueTools.length; i++) {
		current = awardEV(current, uniqueTools[i]!, baseTime + i * 60_000)
	}
	return current
}

/**
 * Generate random 1-2 EV points in a random stat.
 */
function generateRandomEV(): Record<StatName, number> {
	const stats = [...STAT_NAMES]
	const stat = stats[Math.floor(Math.random() * stats.length)]
	const amount = Math.random() < 0.5 ? 1 : 2
	const result: Record<StatName, number> = { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 }
	result[stat] = amount
	return result
}

/**
 * Get formatted EV summary string.
 */
export function getEVSummary(creature: Creature): string {
	const parts: string[] = []
	for (const stat of STAT_NAMES) {
		const val = creature.ev[stat]
		if (val > 0) {
			const labels: Record<StatName, string> = {
				hp: 'HP',
				attack: 'ATK',
				defense: 'DEF',
				spAtk: 'SPA',
				spDef: 'SPD',
				speed: 'SPE',
			}
			parts.push(`${labels[stat]}+${val}`)
		}
	}
	return parts.join(' ') || 'None'
}
