import { describe, expect, test } from 'bun:test'
import { generateWordSlug, generateShortWordSlug } from '../words'

describe('generateWordSlug', () => {
  test('returns three-part hyphenated slug', () => {
    const slug = generateWordSlug()
    const parts = slug.split('-')
    expect(parts.length).toBe(3)
  })

  test('all parts are non-empty', () => {
    for (let i = 0; i < 10; i++) {
      const slug = generateWordSlug()
      const parts = slug.split('-')
      for (const part of parts) {
        expect(part.length).toBeGreaterThan(0)
      }
    }
  })

  test('all parts are lowercase', () => {
    for (let i = 0; i < 10; i++) {
      const slug = generateWordSlug()
      expect(slug).toBe(slug.toLowerCase())
    }
  })

  test('no consecutive hyphens', () => {
    for (let i = 0; i < 10; i++) {
      const slug = generateWordSlug()
      expect(slug).not.toContain('--')
    }
  })

  test('multiple calls produce varied results', () => {
    const slugs = new Set<string>()
    for (let i = 0; i < 20; i++) {
      slugs.add(generateWordSlug())
    }
    // With 50+ adjectives × 50+ verbs × 50+ nouns, 20 calls should produce mostly unique slugs
    expect(slugs.size).toBeGreaterThan(10)
  })

  test('slug matches adjective-verb-noun pattern', () => {
    const slug = generateWordSlug()
    expect(slug).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/)
  })
})

describe('generateShortWordSlug', () => {
  test('returns two-part hyphenated slug', () => {
    const slug = generateShortWordSlug()
    const parts = slug.split('-')
    expect(parts.length).toBe(2)
  })

  test('all parts are non-empty', () => {
    for (let i = 0; i < 10; i++) {
      const slug = generateShortWordSlug()
      const parts = slug.split('-')
      for (const part of parts) {
        expect(part.length).toBeGreaterThan(0)
      }
    }
  })

  test('all parts are lowercase', () => {
    for (let i = 0; i < 10; i++) {
      const slug = generateShortWordSlug()
      expect(slug).toBe(slug.toLowerCase())
    }
  })

  test('slug matches adjective-noun pattern', () => {
    const slug = generateShortWordSlug()
    expect(slug).toMatch(/^[a-z]+-[a-z]+$/)
  })

  test('no consecutive hyphens', () => {
    for (let i = 0; i < 10; i++) {
      const slug = generateShortWordSlug()
      expect(slug).not.toContain('--')
    }
  })
})
