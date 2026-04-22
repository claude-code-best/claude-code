import { describe, test, expect } from 'bun:test'
import { getAllNatureNames, randomNature, getNatureEffect } from '../dex/nature'

describe('getAllNatureNames', () => {
  test('returns 25 nature names', () => {
    const names = getAllNatureNames()
    expect(names.length).toBe(25)
  })

  test('includes hardy and quirky', () => {
    const names = getAllNatureNames()
    expect(names).toContain('hardy')
    expect(names).toContain('quirky')
  })
})

describe('randomNature', () => {
  test('returns a valid nature name', () => {
    const nature = randomNature()
    expect(getAllNatureNames()).toContain(nature)
  })

  test('produces different natures over multiple calls', () => {
    const natures = new Set(Array.from({ length: 50 }, () => randomNature()))
    expect(natures.size).toBeGreaterThan(1)
  })
})

describe('getNatureEffect', () => {
  test('hardy is neutral (no effect)', () => {
    const effect = getNatureEffect('hardy')
    expect(effect.plus).toBeNull()
    expect(effect.minus).toBeNull()
  })

  test('adamant boosts attack and lowers spAtk', () => {
    const effect = getNatureEffect('adamant')
    expect(effect.plus).toBe('attack')
    expect(effect.minus).toBe('spAtk')
  })

  test('timid boosts speed and lowers attack', () => {
    const effect = getNatureEffect('timid')
    expect(effect.plus).toBe('speed')
    expect(effect.minus).toBe('attack')
  })

  test('invalid nature returns neutral', () => {
    const effect = getNatureEffect('nonexistent')
    expect(effect.plus).toBeNull()
    expect(effect.minus).toBeNull()
  })
})
