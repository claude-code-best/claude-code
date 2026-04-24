import { describe, test, expect } from 'bun:test'
import type { SpeciesId, Creature } from '../types'
import { generateCreature, calculateStats, getCreatureName, getTotalEV, recalculateLevel, getActiveCreature } from '../core/creature'
import { getSpeciesData } from '../dex/species'

describe('generateCreature', () => {
  test('creates a creature with correct defaults', async () => {
    const c = await generateCreature('bulbasaur', 42)
    expect(c.speciesId).toBe('bulbasaur')
    expect(c.level).toBe(1)
    expect(c.xp).toBe(0)
    expect(c.totalXp).toBe(0)
    expect(c.friendship).toBe(getSpeciesData('bulbasaur').baseHappiness)
    expect(c.isShiny).toBeDefined()
    expect(c.id).toBeTruthy()
    expect(Object.values(c.iv).every((v: number) => v >= 0 && v <= 31)).toBe(true)
    expect(Object.values(c.ev).every((v: number) => v === 0)).toBe(true)
  })

  test('deterministic IV generation from seed', async () => {
    const c1 = await generateCreature('charmander', 12345)
    const c2 = await generateCreature('charmander', 12345)
    expect(c1.iv).toEqual(c2.iv)
  })

  test('different seeds produce different IVs', async () => {
    const c1 = await generateCreature('squirtle', 100)
    const c2 = await generateCreature('squirtle', 200)
    expect(c1.iv).not.toEqual(c2.iv)
  })

  test('all MVP species can be generated', async () => {
    const species: SpeciesId[] = [
      'bulbasaur', 'ivysaur', 'venusaur',
      'charmander', 'charmeleon', 'charizard',
      'squirtle', 'wartortle', 'blastoise',
      'pikachu',
    ]
    for (const s of species) {
      const c = await generateCreature(s)
      expect(c.speciesId).toBe(s)
    }
  })
})

describe('calculateStats', () => {
  test('level 1 stats are reasonable', async () => {
    const c = await generateCreature('bulbasaur', 0)
    // Use deterministic nature to avoid flaky test from randomNature()
    c.nature = 'hardy'
    const stats = calculateStats(c)
    // HP at lv1: floor((2*45 + iv + floor(0/4)) * 1/100) + 1 + 10
    // With any IV: floor((90 + iv) / 100) + 11 = 0 + 11 = 11
    expect(stats.hp).toBeGreaterThanOrEqual(11)
    expect(stats.hp).toBeLessThanOrEqual(12)
    // Attack with Hardy (neutral): floor((2*49 + iv) * 1/100 + 5)
    expect(stats.attack).toBeGreaterThanOrEqual(5)
    expect(stats.attack).toBeLessThanOrEqual(6)
  })

  test('stats increase with level', async () => {
    const c1 = await generateCreature('charmander', 0)
    c1.level = 1
    const stats1 = calculateStats(c1)

    const c50 = { ...c1, level: 50 }
    const stats50 = calculateStats(c50)
    // All stats should be higher at level 50
    expect(stats50.hp).toBeGreaterThan(stats1.hp)
    expect(stats50.attack).toBeGreaterThan(stats1.attack)
  })

  test('EVs affect stats', async () => {
    const c = await generateCreature('pikachu', 0)
    // Level must be high enough for EV contribution to be visible in stat formula
    const c50 = { ...c, level: 50 }
    const statsNoEV = calculateStats(c50)

    const cWithEV = { ...c50, ev: { ...c50.ev, attack: 252 } }
    const statsWithEV = calculateStats(cWithEV)

    expect(statsWithEV.attack).toBeGreaterThan(statsNoEV.attack)
  })
})

describe('getCreatureName', () => {
  test('returns species name when no nickname', async () => {
    const c = await generateCreature('pikachu')
    c.nickname = undefined
    expect(getCreatureName(c)).toBe('Pikachu')
  })

  test('returns nickname when set', async () => {
    const c = await generateCreature('pikachu')
    c.nickname = 'Sparky'
    expect(getCreatureName(c)).toBe('Sparky')
  })
})

describe('getTotalEV', () => {
  test('returns 0 for new creature', async () => {
    const c = await generateCreature('bulbasaur')
    expect(getTotalEV(c)).toBe(0)
  })

  test('sums all EV values', async () => {
    const c = await generateCreature('bulbasaur')
    c.ev = { hp: 10, attack: 20, defense: 30, spAtk: 40, spDef: 50, speed: 60 }
    expect(getTotalEV(c)).toBe(210)
  })
})

describe('recalculateLevel', () => {
  test('returns same creature if level unchanged', async () => {
    const c = await generateCreature('bulbasaur', 42)
    const result = recalculateLevel(c)
    expect(result.level).toBe(c.level)
  })

  test('updates level based on totalXp', async () => {
    const c = await generateCreature('charmander', 42)
    c.totalXp = 8000
    const result = recalculateLevel(c)
    expect(result.level).toBeGreaterThan(1)
  })
})

describe('getActiveCreature', () => {
  test('returns null when party is empty', async () => {
    const c = await generateCreature('bulbasaur')
    const result = getActiveCreature({ party: [null, null, null, null, null, null], creatures: [c] })
    expect(result).toBeNull()
  })

  test('returns creature from party[0]', async () => {
    const c = await generateCreature('pikachu')
    const result = getActiveCreature({ party: [c.id, null, null, null, null, null], creatures: [c] })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(c.id)
  })

  test('returns creature from activeCreatureId (legacy)', async () => {
    const c = await generateCreature('squirtle')
    const result = getActiveCreature({ activeCreatureId: c.id, creatures: [c] })
    expect(result).not.toBeNull()
    expect(result!.id).toBe(c.id)
  })

  test('prefers party[0] over activeCreatureId', async () => {
    const c1 = await generateCreature('bulbasaur')
    const c2 = await generateCreature('charmander')
    const result = getActiveCreature({ party: [c1.id, null, null, null, null, null], activeCreatureId: c2.id, creatures: [c1, c2] })
    expect(result!.id).toBe(c1.id)
  })

  test('returns null when creature ID not found', () => {
    const result = getActiveCreature({ party: ['nonexistent', null, null, null, null, null], creatures: [] })
    expect(result).toBeNull()
  })
})

describe('calculateStats - nature effects', () => {
  test('adamant nature boosts attack and lowers spAtk', async () => {
    const c = await generateCreature('charmander', 42)
    c.level = 50
    c.nature = 'adamant'
    const adamantStats = calculateStats(c)

    c.nature = 'hardy'
    const hardyStats = calculateStats(c)

    expect(adamantStats.attack).toBeGreaterThan(hardyStats.attack)
    expect(adamantStats.spAtk).toBeLessThan(hardyStats.spAtk)
  })

  test('timid nature boosts speed and lowers attack', async () => {
    const c = await generateCreature('pikachu', 42)
    c.level = 50
    c.nature = 'timid'
    const timidStats = calculateStats(c)

    c.nature = 'hardy'
    const hardyStats = calculateStats(c)

    expect(timidStats.speed).toBeGreaterThan(hardyStats.speed)
    expect(timidStats.attack).toBeLessThan(hardyStats.attack)
  })
})
