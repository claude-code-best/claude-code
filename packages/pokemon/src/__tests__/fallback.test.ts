import { describe, test, expect } from 'bun:test'
import { getFallbackSprite } from '../sprites/fallback'
import { ALL_SPECIES_IDS } from '../types'

describe('getFallbackSprite', () => {
  test('returns 5 lines for every species', () => {
    for (const id of ALL_SPECIES_IDS) {
      const sprite = getFallbackSprite(id)
      expect(sprite.length).toBe(5)
    }
  })

  test('returns generic fallback for unknown species', () => {
    const sprite = getFallbackSprite('unknowndefinitelynotarealspecies')
    expect(sprite.length).toBe(5)
    expect(sprite[0]).toContain('.---')
  })

  test('returns curated sprite for pikachu', () => {
    const sprite = getFallbackSprite('pikachu')
    expect(sprite[0]).toContain('/\\')
  })

  test('each line has consistent width', () => {
    for (const id of ALL_SPECIES_IDS) {
      const sprite = getFallbackSprite(id)
      const widths = sprite.map(line => line.length)
      const maxWidth = Math.max(...widths)
      const minWidth = Math.min(...widths)
      expect(maxWidth - minWidth).toBeLessThanOrEqual(2)
    }
  })
})
