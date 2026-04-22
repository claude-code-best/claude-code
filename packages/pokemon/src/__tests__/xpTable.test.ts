import { describe, test, expect } from 'bun:test'
import { xpForLevel, levelFromXp, xpToNextLevel } from '../dex/xpTable'

describe('xpForLevel', () => {
  test('returns 0 for level 1', () => {
    expect(xpForLevel(1, 'medium-fast')).toBe(0)
  })

  test('returns 0 for level 0', () => {
    expect(xpForLevel(0, 'medium-fast')).toBe(0)
  })

  test('medium-fast: level 5 = 125 XP', () => {
    expect(xpForLevel(5, 'medium-fast')).toBe(125)
  })

  test('medium-fast: level 10 = 1000 XP', () => {
    expect(xpForLevel(10, 'medium-fast')).toBe(1000)
  })

  test('slow: level 5 = 156 XP', () => {
    expect(xpForLevel(5, 'slow')).toBe(156)
  })

  test('fast: level 5 = 100 XP', () => {
    expect(xpForLevel(5, 'fast')).toBe(100)
  })
})

describe('levelFromXp', () => {
  test('returns 1 for 0 XP', () => {
    expect(levelFromXp(0, 'medium-fast')).toBe(1)
  })

  test('returns 5 for 125 XP medium-fast', () => {
    expect(levelFromXp(125, 'medium-fast')).toBe(5)
  })

  test('caps at 100', () => {
    expect(levelFromXp(999999999, 'medium-fast')).toBe(100)
  })

  test('roundtrip: xpForLevel then levelFromXp', () => {
    for (let lv = 1; lv <= 100; lv += 10) {
      const xp = xpForLevel(lv, 'medium-fast')
      expect(levelFromXp(xp, 'medium-fast')).toBe(lv)
    }
  })
})

describe('xpToNextLevel', () => {
  test('returns 0 at level 100', () => {
    expect(xpToNextLevel(100, 0, 'medium-fast')).toBe(0)
  })

  test('returns difference to next level', () => {
    // Level 5 medium-fast: xpForLevel(5)=125, xpForLevel(6)=216
    expect(xpToNextLevel(5, 125, 'medium-fast')).toBe(216 - 125)
  })

  test('returns full next level XP from 0', () => {
    expect(xpToNextLevel(1, 0, 'medium-fast')).toBe(8) // 2^3=8
  })
})
