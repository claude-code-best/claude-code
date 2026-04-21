import { describe, test, expect } from 'bun:test'
import type { SpeciesId, Creature } from '../types'
import { generateCreature, calculateStats, getCreatureName, getTotalEV, recalculateLevel } from '../core/creature'
import { SPECIES_DATA } from '../data/species'

describe('generateCreature', () => {
	test('creates a creature with correct defaults', () => {
		const c = generateCreature('bulbasaur', 42)
		expect(c.speciesId).toBe('bulbasaur')
		expect(c.level).toBe(1)
		expect(c.xp).toBe(0)
		expect(c.totalXp).toBe(0)
		expect(c.friendship).toBe(SPECIES_DATA.bulbasaur.baseHappiness)
		expect(c.isShiny).toBeDefined()
		expect(c.id).toBeTruthy()
		expect(Object.values(c.iv).every((v) => v >= 0 && v <= 31)).toBe(true)
		expect(Object.values(c.ev).every((v) => v === 0)).toBe(true)
	})

	test('deterministic IV generation from seed', () => {
		const c1 = generateCreature('charmander', 12345)
		const c2 = generateCreature('charmander', 12345)
		expect(c1.iv).toEqual(c2.iv)
	})

	test('different seeds produce different IVs', () => {
		const c1 = generateCreature('squirtle', 100)
		const c2 = generateCreature('squirtle', 200)
		expect(c1.iv).not.toEqual(c2.iv)
	})

	test('all MVP species can be generated', () => {
		const species: SpeciesId[] = [
			'bulbasaur', 'ivysaur', 'venusaur',
			'charmander', 'charmeleon', 'charizard',
			'squirtle', 'wartortle', 'blastoise',
			'pikachu',
		]
		for (const s of species) {
			const c = generateCreature(s)
			expect(c.speciesId).toBe(s)
		}
	})
})

describe('calculateStats', () => {
	test('level 1 stats are reasonable', () => {
		const c = generateCreature('bulbasaur', 0)
		const stats = calculateStats(c)
		// HP at lv1: floor((2*45 + iv + floor(0/4)) * 1/100) + 1 + 10
		// With any IV: floor((90 + iv) / 100) + 11 = 0 + 11 = 11
		expect(stats.hp).toBeGreaterThanOrEqual(11)
		expect(stats.hp).toBeLessThanOrEqual(12)
		// Attack: floor((2*49 + iv) * 1/100) + 5 = 0 + 5 = 5
		expect(stats.attack).toBeGreaterThanOrEqual(5)
		expect(stats.attack).toBeLessThanOrEqual(6)
	})

	test('stats increase with level', () => {
		const c1 = generateCreature('charmander', 0)
		c1.level = 1
		const stats1 = calculateStats(c1)

		const c50 = { ...c1, level: 50 }
		const stats50 = calculateStats(c50)
		// All stats should be higher at level 50
		expect(stats50.hp).toBeGreaterThan(stats1.hp)
		expect(stats50.attack).toBeGreaterThan(stats1.attack)
	})

	test('EVs affect stats', () => {
		const c = generateCreature('pikachu', 0)
		const statsNoEV = calculateStats(c)

		const cWithEV = { ...c, ev: { ...c.ev, attack: 252 } }
		const statsWithEV = calculateStats(cWithEV)

		expect(statsWithEV.attack).toBeGreaterThan(statsNoEV.attack)
	})
})

describe('getCreatureName', () => {
	test('returns species name when no nickname', () => {
		const c = generateCreature('pikachu')
		c.nickname = undefined
		expect(getCreatureName(c)).toBe('Pikachu')
	})

	test('returns nickname when set', () => {
		const c = generateCreature('pikachu')
		c.nickname = 'Sparky'
		expect(getCreatureName(c)).toBe('Sparky')
	})
})

describe('getTotalEV', () => {
	test('returns 0 for new creature', () => {
		const c = generateCreature('bulbasaur')
		expect(getTotalEV(c)).toBe(0)
	})

	test('sums all EV values', () => {
		const c = generateCreature('bulbasaur')
		c.ev = { hp: 10, attack: 20, defense: 30, spAtk: 40, spDef: 50, speed: 60 }
		expect(getTotalEV(c)).toBe(210)
	})
})
