import { describe, test, expect } from 'bun:test'
import { FROM_DEX_STAT, TO_DEX_STAT, mapBaseStats, mapGenderRatio } from '../dex/pkmn'

describe('FROM_DEX_STAT', () => {
  test('maps all 6 stats', () => {
    expect(FROM_DEX_STAT.hp).toBe('hp')
    expect(FROM_DEX_STAT.atk).toBe('attack')
    expect(FROM_DEX_STAT.def).toBe('defense')
    expect(FROM_DEX_STAT.spa).toBe('spAtk')
    expect(FROM_DEX_STAT.spd).toBe('spDef')
    expect(FROM_DEX_STAT.spe).toBe('speed')
  })
})

describe('TO_DEX_STAT', () => {
  test('reverse maps all 6 stats', () => {
    expect(TO_DEX_STAT.hp).toBe('hp')
    expect(TO_DEX_STAT.attack).toBe('atk')
    expect(TO_DEX_STAT.defense).toBe('def')
    expect(TO_DEX_STAT.spAtk).toBe('spa')
    expect(TO_DEX_STAT.spDef).toBe('spd')
    expect(TO_DEX_STAT.speed).toBe('spe')
  })
})

describe('mapBaseStats', () => {
  test('converts Dex stat format to our format', () => {
    const result = mapBaseStats({ hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 })
    expect(result).toEqual({
      hp: 45, attack: 49, defense: 49,
      spAtk: 65, spDef: 65, speed: 45,
    })
  })
})

describe('mapGenderRatio', () => {
  test('returns -1 for genderless', () => {
    expect(mapGenderRatio(undefined)).toBe(-1)
    expect(mapGenderRatio('N')).toBe(-1)
  })

  test('calculates female ratio', () => {
    expect(mapGenderRatio({ M: 0.875, F: 0.125 })).toBe(1) // 12.5% F → 1
    expect(mapGenderRatio({ M: 0.5, F: 0.5 })).toBe(4)    // 50% F → 4
  })
})
