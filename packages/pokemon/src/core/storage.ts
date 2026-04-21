import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { BuddyData, SpeciesId } from '../types'
import { ALL_SPECIES_IDS } from '../types'
import { generateCreature } from './creature'
import { getSpeciesData } from '../data/species'

const BUDDY_DATA_PATH = join(homedir(), '.claude', 'buddy-data.json')
const BUDDY_SPRITES_DIR = join(homedir(), '.claude', 'buddy-sprites')

/**
 * Load buddy data from disk. Returns default data if file doesn't exist.
 * Auto-migrates legacy data without `party` field.
 */
export function loadBuddyData(): BuddyData {
	if (!existsSync(BUDDY_DATA_PATH)) {
		return getDefaultBuddyData()
	}
	try {
		const raw = readFileSync(BUDDY_DATA_PATH, 'utf-8')
		const data = JSON.parse(raw) as BuddyData
		if (data.version !== 1) {
			return migrateData(data)
		}
		// Migrate legacy data without party field
		return ensurePartyField(data)
	} catch {
		return getDefaultBuddyData()
	}
}

/**
 * Save buddy data to disk.
 */
export function saveBuddyData(data: BuddyData): void {
	// Ensure directory exists
	const dir = join(BUDDY_DATA_PATH, '..')
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true })
	}
	writeFileSync(BUDDY_DATA_PATH, JSON.stringify(data, null, 2))
}

/**
 * Get default buddy data for new users.
 * Randomly assigns one of the three starters.
 */
export function getDefaultBuddyData(): BuddyData {
	const starters: SpeciesId[] = ['bulbasaur', 'charmander', 'squirtle']
	const randomStarter = starters[Math.floor(Math.random() * starters.length)]
	const creature = generateCreature(randomStarter)

	return {
		version: 1,
		party: [creature.id, null, null, null, null, null],
		creatures: [creature],
		eggs: [],
		dex: [
			{
				speciesId: randomStarter,
				discoveredAt: Date.now(),
				caughtCount: 1,
				bestLevel: 1,
			},
		],
		stats: {
			totalTurns: 0,
			consecutiveDays: 0,
			lastActiveDate: new Date().toISOString().split('T')[0],
			totalEggsObtained: 0,
			totalEvolutions: 0,
		},
	}
}

/**
 * Get the sprites cache directory path.
 */
export function getSpritesDir(): string {
	if (!existsSync(BUDDY_SPRITES_DIR)) {
		mkdirSync(BUDDY_SPRITES_DIR, { recursive: true })
	}
	return BUDDY_SPRITES_DIR
}

/**
 * Migrate from legacy buddy system.
 * Accepts legacy companion data and maps to new Pokémon species.
 * If species cannot be determined, randomly assigns a starter.
 */
export function migrateFromLegacy(
	storedCompanion: { name?: string; personality?: string; seed?: string; hatchedAt?: number; species?: string },
): BuddyData {
	const speciesMap: Record<string, SpeciesId> = {
		duck: 'bulbasaur',
		goose: 'squirtle',
		blob: 'bulbasaur',
		cat: 'charmander',
		dragon: 'pikachu',
		octopus: 'squirtle',
		owl: 'bulbasaur',
		penguin: 'squirtle',
		turtle: 'squirtle',
		snail: 'bulbasaur',
		ghost: 'pikachu',
		axolotl: 'squirtle',
		capybara: 'bulbasaur',
		cactus: 'charmander',
		robot: 'charmander',
		rabbit: 'pikachu',
		mushroom: 'bulbasaur',
		chonk: 'charmander',
	}

	// If species is provided directly, use it; otherwise random starter
	const mapped = storedCompanion.species ? speciesMap[storedCompanion.species] : undefined
	const starters: SpeciesId[] = ['bulbasaur', 'charmander', 'squirtle']
	const speciesId: SpeciesId = mapped ?? starters[Math.floor(Math.random() * starters.length)]!

	const creature = generateCreature(speciesId)
	creature.level = 5 // Reward for existing users
	creature.totalXp = 100
	creature.friendship = 120 // Existing partner bonus

	// Preserve nickname if it's not the default
	const speciesInfo = getSpeciesData(speciesId)
	if (storedCompanion.name && storedCompanion.name !== speciesInfo.name) {
		creature.nickname = storedCompanion.name
	}

	return {
		version: 1,
		party: [creature.id, null, null, null, null, null],
		creatures: [creature],
		eggs: [],
		dex: [
			{
				speciesId,
				discoveredAt: Date.now(),
				caughtCount: 1,
				bestLevel: 5,
			},
		],
		stats: {
			totalTurns: 0,
			consecutiveDays: 1,
			lastActiveDate: new Date().toISOString().split('T')[0],
			totalEggsObtained: 0,
			totalEvolutions: 0,
		},
	}
}

/**
 * Handle data migration between versions.
 */
function migrateData(data: BuddyData): BuddyData {
	// Currently only version 1 exists
	if (!data.version || data.version < 1) {
		return getDefaultBuddyData()
	}
	return data
}

/**
 * Update daily stats (consecutive days, last active date).
 */
export function updateDailyStats(data: BuddyData): BuddyData {
	const today = new Date().toISOString().split('T')[0]
	const lastDate = data.stats.lastActiveDate

	let consecutiveDays = data.stats.consecutiveDays
	if (lastDate !== today) {
		// Check if yesterday
		const yesterday = new Date()
		yesterday.setDate(yesterday.getDate() - 1)
		const yesterdayStr = yesterday.toISOString().split('T')[0]

		if (lastDate === yesterdayStr) {
			consecutiveDays++
		} else {
			consecutiveDays = 1
		}
	}

	return {
		...data,
		stats: {
			...data.stats,
			consecutiveDays,
			lastActiveDate: today,
		},
	}
}

/**
 * Increment turn counter.
 */
export function incrementTurns(data: BuddyData): BuddyData {
	return {
		...data,
		stats: {
			...data.stats,
			totalTurns: data.stats.totalTurns + 1,
		},
	}
}

/**
 * Ensure buddy data has a `party` field.
 * Migrates from legacy `activeCreatureId` if needed.
 */
function ensurePartyField(data: BuddyData): BuddyData {
	if (data.party && data.party.length === 6) return data

	// Build party from existing creatures
	const party: (string | null)[] = new Array(6).fill(null)

	// Put active creature first
	const activeId = data.activeCreatureId ?? data.party?.[0]
	if (activeId) {
		party[0] = activeId
	}

	// Fill remaining slots with other creatures
	let slot = 1
	for (const c of data.creatures) {
		if (c.id === activeId) continue
		if (slot >= 6) break
		party[slot] = c.id
		slot++
	}

	return { ...data, party }
}

/**
 * Add a creature to the party. Finds first empty slot.
 * Returns true if added, false if party is full.
 */
export function addToParty(data: BuddyData, creatureId: string): { data: BuddyData; added: boolean } {
	const party = [...data.party]
	const emptyIdx = party.findIndex(p => p === null)
	if (emptyIdx === -1) {
		return { data, added: false }
	}
	party[emptyIdx] = creatureId
	return { data: { ...data, party }, added: true }
}

/**
 * Remove a creature from party by slot index.
 */
export function removeFromParty(data: BuddyData, slotIndex: number): BuddyData {
	if (slotIndex < 0 || slotIndex >= 6) return data
	const party = [...data.party]
	party[slotIndex] = null
	return { ...data, party }
}

/**
 * Swap two party slots by index.
 */
export function swapPartySlots(data: BuddyData, indexA: number, indexB: number): BuddyData {
	const party = [...data.party]
	const a = party[indexA]
	const b = party[indexB]
	party[indexA] = b
	party[indexB] = a
	return { ...data, party }
}

/**
 * Set party[0] to the given creature ID (by swapping if already in party).
 */
export function setActivePartyMember(data: BuddyData, creatureId: string): BuddyData {
	const party = [...data.party]
	const existingIdx = party.findIndex(id => id === creatureId)
	if (existingIdx === 0) return data // Already active
	if (existingIdx > 0) {
		// Swap with slot 0
		party[0] = creatureId
		party[existingIdx] = data.party[0]
	} else {
		// Not in party — put in slot 0
		party[0] = creatureId
	}
	return { ...data, party }
}
