import { describe, test, expect } from 'bun:test'
import { checkEvolution, evolve, canEvolveFurther } from '../core/evolution'

describe('checkEvolution', () => {
	test('bulbasaur at level 15 cannot evolve', () => {
		const creature = { speciesId: 'bulbasaur' as const, level: 15, friendship: 70 } as any
		expect(checkEvolution(creature)).toBeNull()
	})

	test('bulbasaur at level 16 can evolve into ivysaur', () => {
		const creature = { speciesId: 'bulbasaur' as const, level: 16, friendship: 70 } as any
		const result = checkEvolution(creature)
		expect(result).not.toBeNull()
		expect(result!.from).toBe('bulbasaur')
		expect(result!.to).toBe('ivysaur')
	})

	test('charmander at level 16 evolves into charmeleon', () => {
		const creature = { speciesId: 'charmander' as const, level: 16, friendship: 70 } as any
		const result = checkEvolution(creature)
		expect(result!.to).toBe('charmeleon')
	})

	test('charmeleon at level 36 evolves into charizard', () => {
		const creature = { speciesId: 'charmeleon' as const, level: 36, friendship: 70 } as any
		const result = checkEvolution(creature)
		expect(result!.to).toBe('charizard')
	})

	test('squirtle at level 16 evolves into wartortle', () => {
		const creature = { speciesId: 'squirtle' as const, level: 16, friendship: 70 } as any
		const result = checkEvolution(creature)
		expect(result!.to).toBe('wartortle')
	})

	test('wartortle at level 36 evolves into blastoise', () => {
		const creature = { speciesId: 'wartortle' as const, level: 36, friendship: 70 } as any
		const result = checkEvolution(creature)
		expect(result!.to).toBe('blastoise')
	})

	test('venusaur cannot evolve further', () => {
		const creature = { speciesId: 'venusaur' as const, level: 50, friendship: 70 } as any
		expect(checkEvolution(creature)).toBeNull()
	})

	test('pikachu cannot evolve in MVP', () => {
		const creature = { speciesId: 'pikachu' as const, level: 50, friendship: 70 } as any
		expect(checkEvolution(creature)).toBeNull()
	})

	test('level 100 bulbasaur can still evolve (level >= minLevel)', () => {
		const creature = { speciesId: 'bulbasaur' as const, level: 100, friendship: 70 } as any
		const result = checkEvolution(creature)
		expect(result).not.toBeNull()
		expect(result!.to).toBe('ivysaur')
	})
})

describe('evolve', () => {
	test('changes species and boosts friendship', () => {
		const creature = { speciesId: 'bulbasaur' as const, friendship: 70, level: 16 } as any
		const evolved = evolve(creature, 'ivysaur')
		expect(evolved.speciesId).toBe('ivysaur')
		expect(evolved.friendship).toBe(80) // +10 friendship on evolution
	})
})

describe('canEvolveFurther', () => {
	test('starter species can evolve', () => {
		expect(canEvolveFurther('bulbasaur')).toBe(true)
		expect(canEvolveFurther('charmander')).toBe(true)
		expect(canEvolveFurther('squirtle')).toBe(true)
	})

	test('middle evolution can evolve', () => {
		expect(canEvolveFurther('ivysaur')).toBe(true)
		expect(canEvolveFurther('charmeleon')).toBe(true)
		expect(canEvolveFurther('wartortle')).toBe(true)
	})

	test('final evolution cannot evolve', () => {
		expect(canEvolveFurther('venusaur')).toBe(false)
		expect(canEvolveFurther('charizard')).toBe(false)
		expect(canEvolveFurther('blastoise')).toBe(false)
	})

	test('pikachu cannot evolve in MVP', () => {
		expect(canEvolveFurther('pikachu')).toBe(false)
	})
})
