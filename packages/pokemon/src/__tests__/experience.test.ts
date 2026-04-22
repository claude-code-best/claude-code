import { describe, test, expect } from 'bun:test'
import { generateCreature } from '../core/creature'
import { awardXP, getXpProgress } from '../core/experience'
import { xpForLevel, levelFromXp, xpToNextLevel } from '../dex/xpTable'

describe('xpForLevel', () => {
  test('level 1 requires 0 XP', () => {
    expect(xpForLevel(1, 'medium-slow')).toBe(0)
  })

  test('medium-fast: level N requires N^3 XP', () => {
    expect(xpForLevel(10, 'medium-fast')).toBe(1000)
    expect(xpForLevel(100, 'medium-fast')).toBe(1000000)
  })

  test('fast: level N requires floor(N^3 * 4/5)', () => {
    expect(xpForLevel(10, 'fast')).toBe(Math.floor(1000 * 4 / 5)) // 800
  })

  test('slow: level N requires floor(N^3 * 5/4)', () => {
    expect(xpForLevel(10, 'slow')).toBe(Math.floor(1000 * 5 / 4))
  })

  test('higher levels require more XP', () => {
    for (let i = 2; i < 99; i++) {
      expect(xpForLevel(i + 1, 'medium-slow')).toBeGreaterThan(xpForLevel(i, 'medium-slow'))
    }
  })
})

describe('levelFromXp', () => {
  test('0 XP = level 1', () => {
    expect(levelFromXp(0, 'medium-fast')).toBe(1)
  })

  test('roundtrip: level → XP → level', () => {
    for (const growth of ['slow', 'medium-slow', 'medium-fast', 'fast'] as const) {
      for (const level of [1, 5, 10, 25, 50, 75, 100]) {
        const xp = xpForLevel(level, growth)
        expect(levelFromXp(xp, growth)).toBe(level)
      }
    }
  })

  test('XP slightly below threshold stays at lower level', () => {
    const xp20 = xpForLevel(20, 'medium-fast')
    expect(levelFromXp(xp20 - 1, 'medium-fast')).toBe(19)
  })
})

describe('awardXP', () => {
  test('awards XP and returns updated creature', async () => {
    const c = await generateCreature('bulbasaur')
    const result = awardXP(c, 10)
    expect(result.creature.totalXp).toBe(10)
    expect(result.leveledUp).toBeDefined()
  })

  test('large XP can cause level up', async () => {
    const c = await generateCreature('bulbasaur')
    // Award enough XP for several levels
    const result = awardXP(c, 10000)
    expect(result.creature.level).toBeGreaterThan(1)
    expect(result.leveledUp).toBe(true)
  })

  test('level capped at 100', async () => {
    const c = await generateCreature('bulbasaur')
    c.level = 100
    c.totalXp = 1000000
    const result = awardXP(c, 999999)
    expect(result.creature.level).toBe(100)
    expect(result.leveledUp).toBe(false)
  })
})

describe('getXpProgress', () => {
  test('new creature has 0 XP progress', async () => {
    const c = await generateCreature('bulbasaur')
    const progress = getXpProgress(c)
    expect(progress.current).toBe(0)
    expect(progress.percentage).toBe(0)
  })

  test('level 100 creature has 100% progress', async () => {
    const c = await generateCreature('charmander')
    c.level = 100
    c.totalXp = 1000000
    const progress = getXpProgress(c)
    expect(progress.percentage).toBe(100)
  })

  test('needed is positive for sub-100 creatures', async () => {
    const c = await generateCreature('bulbasaur')
    c.level = 5
    c.totalXp = xpForLevel(5, 'medium-slow')
    const progress = getXpProgress(c)
    expect(progress.needed).toBeGreaterThan(0)
    expect(progress.current).toBe(0)
  })
})

describe('xpToNextLevel', () => {
  test('returns XP needed from current to next level', () => {
    const xp10 = xpForLevel(10, 'medium-fast')
    const xp11 = xpForLevel(11, 'medium-fast')
    const needed = xpToNextLevel(10, xp10, 'medium-fast')
    expect(needed).toBe(xp11 - xp10)
  })

  test('returns 0 at level 100', () => {
    expect(xpToNextLevel(100, 1000000, 'medium-fast')).toBe(0)
  })

  test('accounts for partial XP already earned', () => {
    const xp10 = xpForLevel(10, 'medium-fast')
    const xp11 = xpForLevel(11, 'medium-fast')
    const halfWay = xp10 + Math.floor((xp11 - xp10) / 2)
    const needed = xpToNextLevel(10, halfWay, 'medium-fast')
    expect(needed).toBe(xp11 - halfWay)
  })
})

describe('awardXP - extended', () => {
  test('awarding 0 XP returns unchanged creature', async () => {
    const c = await generateCreature('bulbasaur')
    const result = awardXP(c, 0)
    expect(result.creature.totalXp).toBe(c.totalXp)
    expect(result.leveledUp).toBe(false)
  })

  test('XP progress is correctly calculated after award', async () => {
    const c = await generateCreature('squirtle')
    const xpNeeded = xpForLevel(2, 'medium-slow')
    const result = awardXP(c, Math.floor(xpNeeded / 2))
    expect(result.creature.xp).toBeGreaterThanOrEqual(0)
  })

  test('multiple small XP awards equal one large award', async () => {
    const c1 = await generateCreature('bulbasaur', 42)
    const c2 = await generateCreature('bulbasaur', 42)
    c2.totalXp = c1.totalXp

    let current = c1
    for (let i = 0; i < 10; i++) {
      current = awardXP(current, 100).creature
    }
    const bigResult = awardXP(c2, 1000)

    expect(current.totalXp).toBe(bigResult.creature.totalXp)
    expect(current.level).toBe(bigResult.creature.level)
  })
})
