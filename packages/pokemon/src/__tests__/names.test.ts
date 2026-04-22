import { describe, test, expect } from 'bun:test'
import { SPECIES_NAMES, SPECIES_I18N, SPECIES_PERSONALITY } from '../dex/names'

// Original 10 curated species
const CURATED = [
  'bulbasaur', 'ivysaur', 'venusaur',
  'charmander', 'charmeleon', 'charizard',
  'squirtle', 'wartortle', 'blastoise',
  'pikachu',
]

describe('SPECIES_NAMES', () => {
  test('has name for curated species', () => {
    for (const id of CURATED) {
      expect(SPECIES_NAMES[id]).toBeTruthy()
    }
  })

  test('Charmander name is correct', () => {
    expect(SPECIES_NAMES.charmander).toBe('Charmander')
  })
})

describe('SPECIES_I18N', () => {
  test('has i18n for curated species', () => {
    for (const id of CURATED) {
      expect(SPECIES_I18N[id]).toBeTruthy()
      expect(SPECIES_I18N[id]!.en).toBeTruthy()
    }
  })

  test('has Chinese translations', () => {
    expect(SPECIES_I18N.pikachu!.zh).toBe('皮卡丘')
    expect(SPECIES_I18N.squirtle!.zh).toBe('杰尼龟')
  })
})

describe('SPECIES_PERSONALITY', () => {
  test('has personality for curated species', () => {
    for (const id of CURATED) {
      expect(SPECIES_PERSONALITY[id]).toBeTruthy()
    }
  })

  test('personality is non-empty string for curated species', () => {
    for (const id of CURATED) {
      expect(typeof SPECIES_PERSONALITY[id]).toBe('string')
      expect(SPECIES_PERSONALITY[id]!.length).toBeGreaterThan(0)
    }
  })
})
