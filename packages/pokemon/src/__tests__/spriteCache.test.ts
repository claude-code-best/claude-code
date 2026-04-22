import { describe, test, expect } from 'bun:test'
import { getSpeciesDisplay, loadSprite } from '../core/spriteCache'

describe('getSpeciesDisplay', () => {
  test('formats charmander display', () => {
    expect(getSpeciesDisplay('charmander')).toBe('#004 Charmander')
  })

  test('formats pikachu display', () => {
    expect(getSpeciesDisplay('pikachu')).toBe('#025 Pikachu')
  })

  test('formats bulbasaur display', () => {
    expect(getSpeciesDisplay('bulbasaur')).toBe('#001 Bulbasaur')
  })

  test('pads dex number to 3 digits', () => {
    expect(getSpeciesDisplay('squirtle')).toBe('#007 Squirtle')
  })
})

describe('loadSprite', () => {
  test('returns null when no cache exists', () => {
    // Uses a temp directory via getSpritesDir, should return null for non-cached
    const result = loadSprite('nonexistent_pokemon' as any)
    // Will be null since the file doesn't exist
    expect(result).toBeNull()
  })
})
