import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { BuddyData, Creature, SpeciesId, PCBox, Bag } from '../types'
import { ALL_SPECIES_IDS } from '../types'
import { generateCreature } from './creature'
import { getSpeciesData } from '../data/species'
import { getDefaultMoveset, getDefaultAbility } from '../data/learnsets'
import { randomNature } from '../data/nature'

const BUDDY_DATA_PATH = join(homedir(), '.claude', 'buddy-data.json')
const BUDDY_SPRITES_DIR = join(homedir(), '.claude', 'buddy-sprites')

const DEFAULT_BOX_COUNT = 8
const BOX_SIZE = 30

/** Create empty boxes */
function makeDefaultBoxes(): PCBox[] {
	return Array.from({ length: DEFAULT_BOX_COUNT }, (_, i) => ({
		name: `Box ${i + 1}`,
		slots: Array.from({ length: BOX_SIZE }, () => null),
	}))
}

/**
 * Load buddy data from disk. Returns default data if file doesn't exist.
 * Auto-migrates from any older version.
 */
export async function loadBuddyData(): Promise<BuddyData> {
	if (!existsSync(BUDDY_DATA_PATH)) {
		return getDefaultBuddyData()
	}
	try {
		const raw = readFileSync(BUDDY_DATA_PATH, 'utf-8')
		const data = JSON.parse(raw)
		return migrateToV2(data)
	} catch (e) {
		console.error('[buddy] Failed to load buddy data:', e)
		return getDefaultBuddyData()
	}
}

/**
 * Save buddy data to disk.
 */
export function saveBuddyData(data: BuddyData): void {
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
export async function getDefaultBuddyData(): Promise<BuddyData> {
	const starters: SpeciesId[] = ['bulbasaur', 'charmander', 'squirtle']
	const randomStarter = starters[Math.floor(Math.random() * starters.length)]
	const creature = await generateCreature(randomStarter)

	return {
		version: 2,
		party: [creature.id, null, null, null, null, null],
		boxes: makeDefaultBoxes(),
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
		bag: { items: [] },
		stats: {
			totalTurns: 0,
			consecutiveDays: 0,
			lastActiveDate: new Date().toISOString().split('T')[0],
			totalEggsObtained: 0,
			totalEvolutions: 0,
			battlesWon: 0,
			battlesLost: 0,
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
 */
export async function migrateFromLegacy(
	storedCompanion: { name?: string; personality?: string; seed?: string; hatchedAt?: number; species?: string },
): Promise<BuddyData> {
	const speciesMap: Record<string, SpeciesId> = {
		duck: 'bulbasaur', goose: 'squirtle', blob: 'bulbasaur',
		cat: 'charmander', dragon: 'pikachu', octopus: 'squirtle',
		owl: 'bulbasaur', penguin: 'squirtle', turtle: 'squirtle',
		snail: 'bulbasaur', ghost: 'pikachu', axolotl: 'squirtle',
		capybara: 'bulbasaur', cactus: 'charmander', robot: 'charmander',
		rabbit: 'pikachu', mushroom: 'bulbasaur', chonk: 'charmander',
	}

	const mapped = storedCompanion.species ? speciesMap[storedCompanion.species] : undefined
	const starters: SpeciesId[] = ['bulbasaur', 'charmander', 'squirtle']
	const speciesId: SpeciesId = mapped ?? starters[Math.floor(Math.random() * starters.length)]!

	const creature = await generateCreature(speciesId)
	creature.level = 5
	creature.totalXp = 100
	creature.friendship = 120

	const speciesInfo = getSpeciesData(speciesId)
	if (storedCompanion.name && storedCompanion.name !== speciesInfo.name) {
		creature.nickname = storedCompanion.name
	}

	return {
		version: 2,
		party: [creature.id, null, null, null, null, null],
		boxes: makeDefaultBoxes(),
		creatures: [creature],
		eggs: [],
		dex: [{ speciesId, discoveredAt: Date.now(), caughtCount: 1, bestLevel: 5 }],
		bag: { items: [] },
		stats: {
			totalTurns: 0,
			consecutiveDays: 1,
			lastActiveDate: new Date().toISOString().split('T')[0],
			totalEggsObtained: 0,
			totalEvolutions: 0,
			battlesWon: 0,
			battlesLost: 0,
		},
	}
}

// ─── Migration ───

/** Migrate any version to v2 */
async function migrateToV2(data: Record<string, unknown>): Promise<BuddyData> {
	const version = (data.version as number) ?? 1

	if (version >= 2) return data as unknown as BuddyData

	// v1 → v2
	const v1 = data as Record<string, unknown>
	const party = ensureParty(v1)

	// Migrate creatures: add new fields
	const creatures = await migrateCreatures(v1.creatures as Creature[] ?? [])

	// Build boxes — put non-party creatures into Box 1
	const partyIds = new Set(party.filter(Boolean))
	const nonPartyCreatures = creatures.filter(c => !partyIds.has(c.id))
	const boxes = makeDefaultBoxes()
	const box1Slots = [...boxes[0]!.slots]
	let boxIdx = 0
	for (const c of nonPartyCreatures) {
		if (boxIdx < BOX_SIZE) {
			box1Slots[boxIdx] = c.id
			boxIdx++
		}
	}
	boxes[0] = { name: 'Box 1', slots: box1Slots }

	return {
		version: 2,
		party,
		boxes,
		creatures,
		eggs: (v1.eggs as BuddyData['eggs']) ?? [],
		dex: (v1.dex as BuddyData['dex']) ?? [],
		bag: { items: [] },
		stats: {
			totalTurns: ((v1.stats as Record<string, number>)?.totalTurns) ?? 0,
			consecutiveDays: ((v1.stats as Record<string, number>)?.consecutiveDays) ?? 0,
			lastActiveDate: ((v1.stats as Record<string, string>)?.lastActiveDate) ?? new Date().toISOString().split('T')[0],
			totalEggsObtained: ((v1.stats as Record<string, number>)?.totalEggsObtained) ?? 0,
			totalEvolutions: ((v1.stats as Record<string, number>)?.totalEvolutions) ?? 0,
			battlesWon: 0,
			battlesLost: 0,
		},
	}
}

/** Ensure party field is valid */
function ensureParty(data: Record<string, unknown>): (string | null)[] {
	const existing = data.party as (string | null)[] | undefined
	if (existing && existing.length === 6) return existing

	const party: (string | null)[] = new Array(6).fill(null)
	const activeId = data.activeCreatureId ?? existing?.[0]
	if (activeId) party[0] = activeId as string

	const creatures = data.creatures as Creature[] ?? []
	let slot = 1
	for (const c of creatures) {
		if (c.id === activeId) continue
		if (slot >= 6) break
		party[slot] = c.id
		slot++
	}
	return party
}

/** Migrate creatures from v1 format to v2 */
async function migrateCreatures(creatures: Creature[]): Promise<Creature[]> {
	const result: Creature[] = []
	for (const c of creatures) {
		// Already v2 (has nature field)
		if ('nature' in c && c.nature) {
			result.push(c)
			continue
		}

		result.push({
			...c,
			nature: randomNature(),
			moves: await getDefaultMoveset(c.speciesId, c.level),
			ability: getDefaultAbility(c.speciesId),
			heldItem: null,
			pokeball: 'pokeball',
		})
	}
	return result
}

// ─── Daily / Turn stats ───

export function updateDailyStats(data: BuddyData): BuddyData {
	const today = new Date().toISOString().split('T')[0]
	const lastDate = data.stats.lastActiveDate

	let consecutiveDays = data.stats.consecutiveDays
	if (lastDate !== today) {
		const yesterday = new Date()
		yesterday.setDate(yesterday.getDate() - 1)
		const yesterdayStr = yesterday.toISOString().split('T')[0]
		consecutiveDays = lastDate === yesterdayStr ? consecutiveDays + 1 : 1
	}

	return {
		...data,
		stats: { ...data.stats, consecutiveDays, lastActiveDate: today },
	}
}

export function incrementTurns(data: BuddyData): BuddyData {
	return {
		...data,
		stats: { ...data.stats, totalTurns: data.stats.totalTurns + 1 },
	}
}

// ─── Party operations ───

export function addToParty(data: BuddyData, creatureId: string): { data: BuddyData; added: boolean } {
	const party = [...data.party]
	const emptyIdx = party.findIndex(p => p === null)
	if (emptyIdx === -1) return { data, added: false }
	party[emptyIdx] = creatureId
	return { data: { ...data, party }, added: true }
}

export function removeFromParty(data: BuddyData, slotIndex: number): BuddyData {
	if (slotIndex < 0 || slotIndex >= 6) return data
	const party = [...data.party]
	party[slotIndex] = null
	return { ...data, party }
}

export function swapPartySlots(data: BuddyData, indexA: number, indexB: number): BuddyData {
	const party = [...data.party]
	const a = party[indexA]
	const b = party[indexB]
	party[indexA] = b
	party[indexB] = a
	return { ...data, party }
}

export function setActivePartyMember(data: BuddyData, creatureId: string): BuddyData {
	const party = [...data.party]
	const existingIdx = party.findIndex(id => id === creatureId)
	if (existingIdx === 0) return data
	if (existingIdx > 0) {
		party[0] = creatureId
		party[existingIdx] = data.party[0]
	} else {
		party[0] = creatureId
	}
	return { ...data, party }
}

// ─── PC Box operations ───

export function depositToBox(data: BuddyData, creatureId: string): { data: BuddyData; deposited: boolean } {
	for (let b = 0; b < data.boxes.length; b++) {
		const slots = [...data.boxes[b]!.slots]
		const emptyIdx = slots.findIndex(s => s === null)
		if (emptyIdx !== -1) {
			slots[emptyIdx] = creatureId
			const boxes = [...data.boxes]
			boxes[b] = { ...data.boxes[b]!, slots }
			return { data: { ...data, boxes }, deposited: true }
		}
	}
	return { data, deposited: false }
}

export function withdrawFromBox(data: BuddyData, creatureId: string): { data: BuddyData; withdrawn: boolean } {
	for (let b = 0; b < data.boxes.length; b++) {
		const slots = [...data.boxes[b]!.slots]
		const idx = slots.findIndex(s => s === creatureId)
		if (idx !== -1) {
			slots[idx] = null
			const boxes = [...data.boxes]
			boxes[b] = { ...data.boxes[b]!, slots }
			return { data: { ...data, boxes }, withdrawn: true }
		}
	}
	return { data, withdrawn: false }
}

export function moveInBox(data: BuddyData, fromBox: number, fromSlot: number, toBox: number, toSlot: number): BuddyData {
	const boxes = data.boxes.map(b => ({ ...b, slots: [...b.slots] }))
	const creatureId = boxes[fromBox]?.slots[fromSlot]
	if (!creatureId) return data
	boxes[fromBox]!.slots[fromSlot] = null
	boxes[toBox]!.slots[toSlot] = creatureId
	return { ...data, boxes }
}

export function renameBox(data: BuddyData, boxIndex: number, name: string): BuddyData {
	const boxes = [...data.boxes]
	boxes[boxIndex] = { ...boxes[boxIndex]!, name }
	return { ...data, boxes }
}

export function findCreatureLocation(data: BuddyData, creatureId: string): { area: 'party' | 'box'; slot: number; boxIndex?: number } | null {
	const partyIdx = data.party.findIndex(id => id === creatureId)
	if (partyIdx !== -1) return { area: 'party', slot: partyIdx }

	for (let b = 0; b < data.boxes.length; b++) {
		const slotIdx = data.boxes[b]!.slots.findIndex(id => id === creatureId)
		if (slotIdx !== -1) return { area: 'box', slot: slotIdx, boxIndex: b }
	}
	return null
}

export function releaseCreature(data: BuddyData, creatureId: string): BuddyData {
	// Remove from party
	let updated = removeFromParty(data, data.party.findIndex(id => id === creatureId))
	// Remove from boxes
	const withdrawResult = withdrawFromBox(updated, creatureId)
	if (withdrawResult.withdrawn) updated = withdrawResult.data
	// Remove from creatures array
	return {
		...updated,
		creatures: updated.creatures.filter(c => c.id !== creatureId),
	}
}

export function getTotalCreatureCount(data: BuddyData): number {
	return data.creatures.length
}

export function getAllCreatureIds(data: BuddyData): string[] {
	return data.creatures.map(c => c.id)
}

// ─── Bag operations ───

export function addItemToBag(data: BuddyData, itemId: string, count = 1): BuddyData {
	const items = data.bag.items.map(e => ({ ...e }))
	const existing = items.find(e => e.id === itemId)
	if (existing) {
		existing.count += count
	} else {
		items.push({ id: itemId, count })
	}
	return { ...data, bag: { items } }
}

export function removeItemFromBag(data: BuddyData, itemId: string, count = 1): { data: BuddyData; removed: boolean } {
	const items = data.bag.items.map(e => ({ ...e }))
	const existing = items.find(e => e.id === itemId)
	if (!existing || existing.count < count) return { data, removed: false }

	existing.count -= count
	if (existing.count <= 0) {
		const idx = items.indexOf(existing)
		items.splice(idx, 1)
	}
	return { data: { ...data, bag: { items } }, removed: true }
}

export function getItemCount(data: BuddyData, itemId: string): number {
	return data.bag.items.find(e => e.id === itemId)?.count ?? 0
}
