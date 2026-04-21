import { describe, test, expect } from 'bun:test'
import { checkEggEligibility, generateEgg, advanceEggSteps, isEggReadyToHatch } from '../core/egg'
import type { BuddyData } from '../types'
import { generateCreature } from '../core/creature'

function makeBuddyData(overrides: Partial<BuddyData['stats']> = {}): BuddyData {
	return {
		version: 1,
		activeCreatureId: 'test',
		creatures: [generateCreature('bulbasaur')],
		eggs: [],
		dex: [{ speciesId: 'bulbasaur', discoveredAt: Date.now(), caughtCount: 1, bestLevel: 1 }],
		stats: {
			totalTurns: 50,
			consecutiveDays: 7,
			lastActiveDate: new Date().toISOString().split('T')[0],
			totalEggsObtained: 0,
			totalEvolutions: 0,
			...overrides,
		},
	}
}

describe('checkEggEligibility', () => {
	test('eligible when conditions met', () => {
		const data = makeBuddyData()
		expect(checkEggEligibility(data)).toBe(true)
	})

	test('not eligible with existing egg', () => {
		const data = makeBuddyData()
		data.eggs = [{ id: 'test', obtainedAt: Date.now(), stepsRemaining: 1000, totalSteps: 3000, speciesId: 'pikachu' }]
		expect(checkEggEligibility(data)).toBe(false)
	})

	test('not eligible with low consecutive days', () => {
		const data = makeBuddyData({ consecutiveDays: 3 })
		expect(checkEggEligibility(data)).toBe(false)
	})

	test('not eligible when turns not multiple of 50', () => {
		const data = makeBuddyData({ totalTurns: 51 })
		expect(checkEggEligibility(data)).toBe(false)
	})
})

describe('generateEgg', () => {
	test('prefers uncollected species', () => {
		const data = makeBuddyData()
		// Already have bulbasaur, so egg should prefer others
		const egg = generateEgg(data)
		expect(egg.speciesId).not.toBe('bulbasaur')
	})

	test('egg has valid steps', () => {
		const data = makeBuddyData()
		const egg = generateEgg(data)
		expect(egg.stepsRemaining).toBeGreaterThan(0)
		expect(egg.totalSteps).toBe(egg.stepsRemaining)
	})
})

describe('advanceEggSteps', () => {
	test('reduces steps remaining', () => {
		const egg = { id: 'test', obtainedAt: Date.now(), stepsRemaining: 100, totalSteps: 200, speciesId: 'pikachu' as const }
		const advanced = advanceEggSteps(egg, 30)
		expect(advanced.stepsRemaining).toBe(70)
	})

	test('steps do not go below 0', () => {
		const egg = { id: 'test', obtainedAt: Date.now(), stepsRemaining: 10, totalSteps: 200, speciesId: 'pikachu' as const }
		const advanced = advanceEggSteps(egg, 50)
		expect(advanced.stepsRemaining).toBe(0)
	})
})

describe('isEggReadyToHatch', () => {
	test('ready when steps = 0', () => {
		const egg = { id: 'test', obtainedAt: Date.now(), stepsRemaining: 0, totalSteps: 200, speciesId: 'pikachu' as const }
		expect(isEggReadyToHatch(egg)).toBe(true)
	})

	test('not ready when steps > 0', () => {
		const egg = { id: 'test', obtainedAt: Date.now(), stepsRemaining: 1, totalSteps: 200, speciesId: 'pikachu' as const }
		expect(isEggReadyToHatch(egg)).toBe(false)
	})
})
