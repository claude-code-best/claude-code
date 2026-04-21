import { describe, test, expect } from 'bun:test'
import {
	getDefaultBuddyData,
	addToParty, removeFromParty, swapPartySlots, setActivePartyMember,
	depositToBox, withdrawFromBox, moveInBox, renameBox,
	findCreatureLocation, releaseCreature, getTotalCreatureCount, getAllCreatureIds,
	addItemToBag, removeItemFromBag, getItemCount,
	updateDailyStats, incrementTurns,
} from '../core/storage'
import type { BuddyData } from '../types'

function makeData(creatureCount = 1): BuddyData {
	const creatures = Array.from({ length: creatureCount }, (_, i) => ({
		id: `creature-${i}`,
		speciesId: 'bulbasaur' as const,
		gender: 'male' as const,
		level: 5,
		xp: 0,
		totalXp: 100,
		nature: 'hardy',
		ev: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
		iv: { hp: 15, attack: 15, defense: 15, spAtk: 15, spDef: 15, speed: 15 },
		moves: [
			{ id: 'tackle', pp: 35, maxPp: 35 },
			{ id: '', pp: 0, maxPp: 0 },
			{ id: '', pp: 0, maxPp: 0 },
			{ id: '', pp: 0, maxPp: 0 },
		] as [any, any, any, any],
		ability: 'overgrow',
		heldItem: null,
		friendship: 70,
		isShiny: false,
		hatchedAt: Date.now(),
		pokeball: 'pokeball',
	}))

	const party: (string | null)[] = [creatures[0]!.id, null, null, null, null, null]
	if (creatureCount > 1) party[1] = creatures[1]!.id
	if (creatureCount > 2) party[2] = creatures[2]!.id

	return {
		version: 2,
		party,
		boxes: [
			{ name: 'Box 1', slots: Array(30).fill(null) as (string | null)[] },
			{ name: 'Box 2', slots: Array(30).fill(null) as (string | null)[] },
		],
		creatures,
		eggs: [],
		dex: [],
		bag: { items: [] },
		stats: {
			totalTurns: 10,
			consecutiveDays: 5,
			lastActiveDate: new Date().toISOString().split('T')[0],
			totalEggsObtained: 0,
			totalEvolutions: 0,
			battlesWon: 3,
			battlesLost: 1,
		},
	}
}

// ─── Default data ───

describe('getDefaultBuddyData', () => {
	test('returns v2 data with correct structure', async () => {
		const data = await getDefaultBuddyData()
		expect(data.version).toBe(2)
		expect(data.party.length).toBe(6)
		expect(data.party[0]).toBeTruthy()
		expect(data.boxes.length).toBe(8)
		expect(data.boxes[0]!.slots.length).toBe(30)
		expect(data.bag.items).toEqual([])
		expect(data.stats.battlesWon).toBe(0)
		expect(data.stats.battlesLost).toBe(0)
	})

	test('has one creature matching party[0]', async () => {
		const data = await getDefaultBuddyData()
		expect(data.creatures.length).toBe(1)
		expect(data.creatures[0]!.id).toBe(data.party[0]!)
	})

	test('creature has v2 fields', async () => {
		const data = await getDefaultBuddyData()
		const creature = data.creatures[0]!
		expect(creature.nature).toBeTruthy()
		expect(creature.moves.length).toBe(4)
		expect(creature.ability).toBeTruthy()
		expect(creature.heldItem).toBeNull()
		expect(creature.pokeball).toBe('pokeball')
	})
})

// ─── Party operations ───

describe('addToParty', () => {
	test('adds creature to first empty slot', () => {
		const data = makeData()
		const result = addToParty(data, 'new-creature')
		expect(result.added).toBe(true)
		expect(result.data.party[1]).toBe('new-creature')
	})

	test('returns false when party is full', () => {
		const data = makeData()
		data.party = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']
		const result = addToParty(data, 'new-creature')
		expect(result.added).toBe(false)
	})
})

describe('removeFromParty', () => {
	test('removes creature at index', () => {
		const data = makeData(2)
		const updated = removeFromParty(data, 1)
		expect(updated.party[1]).toBeNull()
	})

	test('does nothing for out-of-bounds index', () => {
		const data = makeData()
		const updated = removeFromParty(data, 10)
		expect(updated.party).toEqual(data.party)
	})
})

describe('swapPartySlots', () => {
	test('swaps two party slots', () => {
		const data = makeData(2)
		const updated = swapPartySlots(data, 0, 1)
		expect(updated.party[0]).toBe('creature-1')
		expect(updated.party[1]).toBe('creature-0')
	})
})

describe('setActivePartyMember', () => {
	test('swaps creature to slot 0', () => {
		const data = makeData(2)
		const updated = setActivePartyMember(data, 'creature-1')
		expect(updated.party[0]).toBe('creature-1')
		expect(updated.party[1]).toBe('creature-0')
	})

	test('no change if already active', () => {
		const data = makeData()
		const updated = setActivePartyMember(data, 'creature-0')
		expect(updated).toEqual(data)
	})
})

// ─── PC Box operations ───

describe('depositToBox', () => {
	test('deposits creature to first empty box slot', () => {
		const data = makeData()
		const result = depositToBox(data, 'box-creature')
		expect(result.deposited).toBe(true)
		expect(result.data.boxes[0]!.slots[0]).toBe('box-creature')
	})

	test('fills second box when first is full', () => {
		const data = makeData()
		data.boxes[0]!.slots = Array(30).fill('x')
		const result = depositToBox(data, 'box-creature')
		expect(result.deposited).toBe(true)
		expect(result.data.boxes[1]!.slots[0]).toBe('box-creature')
	})
})

describe('withdrawFromBox', () => {
	test('withdraws creature from box', () => {
		const data = makeData()
		data.boxes[0]!.slots[5] = 'box-creature'
		const result = withdrawFromBox(data, 'box-creature')
		expect(result.withdrawn).toBe(true)
		expect(result.data.boxes[0]!.slots[5]).toBeNull()
	})

	test('returns false when creature not in boxes', () => {
		const data = makeData()
		const result = withdrawFromBox(data, 'nonexistent')
		expect(result.withdrawn).toBe(false)
	})
})

describe('moveInBox', () => {
	test('moves creature between slots', () => {
		const data = makeData()
		data.boxes[0]!.slots[0] = 'moving-creature'
		const updated = moveInBox(data, 0, 0, 0, 5)
		expect(updated.boxes[0]!.slots[0]).toBeNull()
		expect(updated.boxes[0]!.slots[5]).toBe('moving-creature')
	})

	test('does nothing for empty source slot', () => {
		const data = makeData()
		const updated = moveInBox(data, 0, 0, 0, 5)
		expect(updated).toEqual(data)
	})
})

describe('renameBox', () => {
	test('renames a box', () => {
		const data = makeData()
		const updated = renameBox(data, 0, 'My Box')
		expect(updated.boxes[0]!.name).toBe('My Box')
	})
})

describe('findCreatureLocation', () => {
	test('finds creature in party', () => {
		const data = makeData()
		const loc = findCreatureLocation(data, 'creature-0')
		expect(loc).toEqual({ area: 'party', slot: 0 })
	})

	test('finds creature in box', () => {
		const data = makeData()
		data.boxes[0]!.slots[3] = 'box-creature'
		const loc = findCreatureLocation(data, 'box-creature')
		expect(loc).toEqual({ area: 'box', slot: 3, boxIndex: 0 })
	})

	test('returns null for nonexistent', () => {
		const data = makeData()
		expect(findCreatureLocation(data, 'nonexistent')).toBeNull()
	})
})

describe('releaseCreature', () => {
	test('removes creature from party and creatures array', () => {
		const data = makeData(2)
		const updated = releaseCreature(data, 'creature-1')
		expect(updated.creatures.find(c => c.id === 'creature-1')).toBeUndefined()
	})
})

describe('getTotalCreatureCount', () => {
	test('returns creature count', () => {
		expect(getTotalCreatureCount(makeData(3))).toBe(3)
	})
})

describe('getAllCreatureIds', () => {
	test('returns all ids', () => {
		expect(getAllCreatureIds(makeData(2))).toEqual(['creature-0', 'creature-1'])
	})
})

// ─── Bag operations ───

describe('addItemToBag', () => {
	test('adds new item', () => {
		const data = makeData()
		const updated = addItemToBag(data, 'potion', 3)
		expect(updated.bag.items).toEqual([{ id: 'potion', count: 3 }])
	})

	test('stacks existing item', () => {
		const data = makeData()
		const withItem = addItemToBag(data, 'potion', 2)
		const stacked = addItemToBag(withItem, 'potion', 3)
		expect(stacked.bag.items[0]!.count).toBe(5)
	})
})

describe('removeItemFromBag', () => {
	test('removes item quantity', () => {
		const data = makeData()
		const withItem = addItemToBag(data, 'potion', 5)
		const result = removeItemFromBag(withItem, 'potion', 3)
		expect(result.removed).toBe(true)
		expect(result.data.bag.items[0]!.count).toBe(2)
	})

	test('removes item entirely when count reaches 0', () => {
		const data = makeData()
		const withItem = addItemToBag(data, 'potion', 2)
		const result = removeItemFromBag(withItem, 'potion', 2)
		expect(result.removed).toBe(true)
		expect(result.data.bag.items.length).toBe(0)
	})

	test('returns false when not enough items', () => {
		const data = makeData()
		const withItem = addItemToBag(data, 'potion', 1)
		const result = removeItemFromBag(withItem, 'potion', 5)
		expect(result.removed).toBe(false)
	})

	test('returns false for nonexistent item', () => {
		const data = makeData()
		const result = removeItemFromBag(data, 'potion', 1)
		expect(result.removed).toBe(false)
	})
})

describe('getItemCount', () => {
	test('returns count for existing item', () => {
		const data = makeData()
		const withItem = addItemToBag(data, 'potion', 3)
		expect(getItemCount(withItem, 'potion')).toBe(3)
	})

	test('returns 0 for nonexistent item', () => {
		expect(getItemCount(makeData(), 'potion')).toBe(0)
	})
})

// ─── Stats ───

describe('updateDailyStats', () => {
	test('same day does not increment consecutive', () => {
		const data = makeData()
		const updated = updateDailyStats(data)
		expect(updated.stats.consecutiveDays).toBe(data.stats.consecutiveDays)
	})
})

describe('incrementTurns', () => {
	test('increments totalTurns by 1', () => {
		const data = makeData()
		const updated = incrementTurns(data)
		expect(updated.stats.totalTurns).toBe(data.stats.totalTurns + 1)
	})
})
