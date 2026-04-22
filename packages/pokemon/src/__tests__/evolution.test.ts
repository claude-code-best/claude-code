import { describe, test, expect } from 'bun:test'
import type { Creature } from '../types'
import { checkEvolution, evolve, canEvolveFurther } from '../core/evolution'

function makeEvolutionCreature(overrides: Partial<Creature> = {}): Creature {
  return {
    id: 'test-evo',
    speciesId: overrides.speciesId ?? 'bulbasaur',
    gender: 'male',
    level: overrides.level ?? 50,
    xp: 0,
    totalXp: 0,
    nature: 'hardy',
    ev: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
    iv: { hp: 31, attack: 31, defense: 31, spAtk: 31, spDef: 31, speed: 31 },
    moves: [
      { id: 'tackle', pp: 35, maxPp: 35 },
      { id: 'growl', pp: 40, maxPp: 40 },
      { id: 'vinewhip', pp: 15, maxPp: 15 },
      { id: 'razorleaf', pp: 10, maxPp: 10 },
    ],
    ability: 'overgrow',
    heldItem: null,
    friendship: overrides.friendship ?? 70,
    isShiny: false,
    hatchedAt: Date.now(),
    pokeball: 'pokeball',
  }
}

describe('checkEvolution', () => {
  test('bulbasaur at level 15 cannot evolve', () => {
    const creature = makeEvolutionCreature({ speciesId: 'bulbasaur', level: 15 })
    expect(checkEvolution(creature)).toBeNull()
  })

  test('bulbasaur at level 16 can evolve into ivysaur', () => {
    const creature = makeEvolutionCreature({ speciesId: 'bulbasaur', level: 16 })
    const result = checkEvolution(creature)
    expect(result).not.toBeNull()
    expect(result!.from).toBe('bulbasaur')
    expect(result!.to).toBe('ivysaur')
  })

  test('charmander at level 16 evolves into charmeleon', () => {
    const creature = makeEvolutionCreature({ speciesId: 'charmander', level: 16 })
    const result = checkEvolution(creature)
    expect(result!.to).toBe('charmeleon')
  })

  test('charmeleon at level 36 evolves into charizard', () => {
    const creature = makeEvolutionCreature({ speciesId: 'charmeleon', level: 36 })
    const result = checkEvolution(creature)
    expect(result!.to).toBe('charizard')
  })

  test('squirtle at level 16 evolves into wartortle', () => {
    const creature = makeEvolutionCreature({ speciesId: 'squirtle', level: 16 })
    const result = checkEvolution(creature)
    expect(result!.to).toBe('wartortle')
  })

  test('wartortle at level 36 evolves into blastoise', () => {
    const creature = makeEvolutionCreature({ speciesId: 'wartortle', level: 36 })
    const result = checkEvolution(creature)
    expect(result!.to).toBe('blastoise')
  })

  test('venusaur cannot evolve further', () => {
    const creature = makeEvolutionCreature({ speciesId: 'venusaur', level: 50 })
    expect(checkEvolution(creature)).toBeNull()
  })

  test('pikachu does not evolve by level-up (needs item)', () => {
    const creature = makeEvolutionCreature({ speciesId: 'pikachu', level: 50 })
    // Pikachu evolves via Thunder Stone, not level-up
    const result = checkEvolution(creature)
    expect(result).toBeNull()
  })

  test('level 100 bulbasaur can still evolve (level >= minLevel)', () => {
    const creature = makeEvolutionCreature({ speciesId: 'bulbasaur', level: 100 })
    const result = checkEvolution(creature)
    expect(result).not.toBeNull()
    expect(result!.to).toBe('ivysaur')
  })
})

describe('evolve', () => {
  test('changes species and boosts friendship', () => {
    const creature = makeEvolutionCreature({ speciesId: 'bulbasaur', friendship: 70, level: 16 })
    const evolved = evolve(creature, 'ivysaur')
    expect(evolved.speciesId).toBe('ivysaur')
    expect(evolved.friendship).toBe(80) // +10 friendship on evolution
  })

  test('friendship is capped at 255', () => {
    const creature = makeEvolutionCreature({ speciesId: 'bulbasaur', friendship: 250, level: 16 })
    const evolved = evolve(creature, 'ivysaur')
    expect(evolved.friendship).toBe(255)
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

  test('pikachu can evolve into raichu', () => {
    expect(canEvolveFurther('pikachu')).toBe(true)
  })
})
