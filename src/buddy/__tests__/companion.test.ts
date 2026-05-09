import { describe, expect, test } from 'bun:test'
import { inferLegacyCompanionBones } from '../companion.js'

describe('inferLegacyCompanionBones', () => {
  test('infers species and rarity from legacy seedless companion text', () => {
    expect(
      inferLegacyCompanionBones({
        name: 'Biscuit',
        personality: 'A common mushroom of few words.',
      }),
    ).toEqual({
      species: 'mushroom',
      rarity: 'common',
    })
  })

  test('does not override seeded companions', () => {
    expect(
      inferLegacyCompanionBones({
        name: 'Spore',
        personality: 'A common mushroom of few words.',
        seed: 'rehatch-1',
      }),
    ).toEqual({})
  })
})
