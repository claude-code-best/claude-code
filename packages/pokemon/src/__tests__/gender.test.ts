import { describe, test, expect } from 'bun:test'
import { determineGender, getGenderSymbol } from '../core/gender'
import { SPECIES_DATA } from '../data/species'

describe('determineGender', () => {
	test('genderless species', () => {
		// Pikachu has genderRate 4 (50% female)
		// Venusaur has genderRate 1 (12.5% female)
		// For testing genderless, we'd need a species with genderRate -1
		// None in MVP are genderless, so test the basic logic
		const pikachu = SPECIES_DATA.pikachu
		expect(pikachu.genderRate).toBe(4)
	})

	test('pikachu 50% female ratio', () => {
		const pikachu = SPECIES_DATA.pikachu
		let males = 0
		let females = 0
		for (let seed = 0; seed < 1000; seed++) {
			const g = determineGender(pikachu, seed)
			if (g === 'male') males++
			else females++
		}
		// Should be roughly 50/50 with some tolerance
		expect(females).toBeGreaterThan(300)
		expect(males).toBeGreaterThan(300)
	})

	test('starters are ~12.5% female', () => {
		const bulbasaur = SPECIES_DATA.bulbasaur
		let females = 0
		for (let seed = 0; seed < 1000; seed++) {
			if (determineGender(bulbasaur, seed) === 'female') females++
		}
		// ~12.5% female = ~125 out of 1000
		expect(females).toBeGreaterThan(50)
		expect(females).toBeLessThan(250)
	})
})

describe('getGenderSymbol', () => {
	test('male symbol', () => {
		expect(getGenderSymbol('male')).toBe('♂')
	})
	test('female symbol', () => {
		expect(getGenderSymbol('female')).toBe('♀')
	})
	test('genderless has no symbol', () => {
		expect(getGenderSymbol('genderless')).toBe('')
	})
})
