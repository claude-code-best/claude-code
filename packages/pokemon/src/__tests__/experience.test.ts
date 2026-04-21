import { describe, test, expect } from 'bun:test'
import { generateCreature } from '../core/creature'
import { awardXP, getXpProgress } from '../core/experience'
import { xpForLevel, levelFromXp } from '../data/xpTable'

describe('xpForLevel', () => {
	test('level 1 requires 0 XP', () => {
		expect(xpForLevel(1, 'medium-slow')).toBe(0)
	})

	test('medium-fast: level N requires N^3 XP', () => {
		expect(xpForLevel(10, 'medium-fast')).toBe(1000)
		expect(xpForLevel(100, 'medium-fast')).toBe(1000000)
	})

	test('fast: level N requires floor(N^3 * 4/5)', () => {
		expect(xpForLevel(10, 'fast')).toBe(Math.floor(1000 * 4 / 5)) // 800
	})

	test('slow: level N requires floor(N^3 * 5/4)', () => {
		expect(xpForLevel(10, 'slow')).toBe(Math.floor(1000 * 5 / 4))
	})

	test('higher levels require more XP', () => {
		for (let i = 2; i < 99; i++) {
			expect(xpForLevel(i + 1, 'medium-slow')).toBeGreaterThan(xpForLevel(i, 'medium-slow'))
		}
	})
})

describe('levelFromXp', () => {
	test('0 XP = level 1', () => {
		expect(levelFromXp(0, 'medium-fast')).toBe(1)
	})

	test('roundtrip: level → XP → level', () => {
		for (const growth of ['slow', 'medium-slow', 'medium-fast', 'fast'] as const) {
			for (const level of [1, 5, 10, 25, 50, 75, 100]) {
				const xp = xpForLevel(level, growth)
				expect(levelFromXp(xp, growth)).toBe(level)
			}
		}
	})

	test('XP slightly below threshold stays at lower level', () => {
		const xp20 = xpForLevel(20, 'medium-fast')
		expect(levelFromXp(xp20 - 1, 'medium-fast')).toBe(19)
	})
})

describe('awardXP', () => {
	test('awards XP and returns updated creature', () => {
		const c = generateCreature('bulbasaur')
		const result = awardXP(c, 10)
		expect(result.creature.totalXp).toBe(10)
		expect(result.leveledUp).toBeDefined()
	})

	test('large XP can cause level up', () => {
		const c = generateCreature('bulbasaur')
		// Award enough XP for several levels
		const result = awardXP(c, 10000)
		expect(result.creature.level).toBeGreaterThan(1)
		expect(result.leveledUp).toBe(true)
	})

	test('level capped at 100', () => {
		const c = generateCreature('bulbasaur')
		c.level = 100
		c.totalXp = 1000000
		const result = awardXP(c, 999999)
		expect(result.creature.level).toBe(100)
		expect(result.leveledUp).toBe(false)
	})
})

describe('getXpProgress', () => {
	test('new creature has 0 XP progress', () => {
		const c = generateCreature('bulbasaur')
		const progress = getXpProgress(c)
		expect(progress.current).toBe(0)
		expect(progress.percentage).toBe(0)
	})
})
