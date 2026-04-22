import { describe, test, expect, beforeEach } from 'bun:test'
import { generateCreature } from '../core/creature'
import { awardEV, awardTurnEV, getEVSummary, resetEVCooldowns } from '../core/effort'
import { MAX_EV_PER_STAT, MAX_EV_TOTAL } from '../dex/evMapping'

beforeEach(() => {
  resetEVCooldowns()
})

describe('awardEV', () => {
  test('mapped tool awards correct EV', async () => {
    let c = await generateCreature('bulbasaur')
    // Clear cooldown by using old timestamp
    c = awardEV(c, 'Bash', 0)
    expect(c.ev.attack).toBeGreaterThan(0)
    expect(c.ev.speed).toBeGreaterThan(0)
  })

  test('unmapped tool awards random EV', async () => {
    let c = await generateCreature('bulbasaur')
    c = awardEV(c, 'UnknownTool', 0)
    const totalEV = Object.values(c.ev).reduce((a: number, b: number) => a + b, 0)
    expect(totalEV).toBeGreaterThan(0)
  })

  test('cooldown prevents repeated awards', async () => {
    const now = Date.now()
    let c = await generateCreature('bulbasaur')
    c = awardEV(c, 'Bash', now)
    const ev1 = { ...c.ev }
    c = awardEV(c, 'Bash', now + 1000) // Within 30s cooldown
    expect(c.ev).toEqual(ev1) // No change
  })

  test('respects per-stat EV cap', async () => {
    let c = await generateCreature('bulbasaur')
    // Bash gives attack:2 + speed:1
    for (let i = 0; i < 200; i++) {
      c = awardEV(c, 'Bash', i * 60000) // Each call 60s apart (past cooldown)
    }
    expect(c.ev.attack).toBeLessThanOrEqual(MAX_EV_PER_STAT)
  })

  test('respects total EV cap', async () => {
    let c = await generateCreature('bulbasaur')
    const tools = ['Bash', 'Edit', 'Write', 'Read', 'Grep', 'Glob', 'Agent', 'WebSearch', 'WebFetch']
    for (let i = 0; i < 200; i++) {
      for (const tool of tools) {
        c = awardEV(c, tool, (i * tools.length + tools.indexOf(tool)) * 60000)
      }
    }
    const total = Object.values(c.ev).reduce((a: number, b: number) => a + b, 0)
    expect(total).toBeLessThanOrEqual(MAX_EV_TOTAL)
  })
})

describe('awardTurnEV', () => {
  test('awards EV for multiple tools', async () => {
    let c = await generateCreature('bulbasaur')
    c = awardTurnEV(c, ['Bash', 'Read', 'Write'], 0)
    const totalEV = Object.values(c.ev).reduce((a: number, b: number) => a + b, 0)
    expect(totalEV).toBeGreaterThan(0)
  })
})

describe('getEVSummary', () => {
  test('returns "None" for new creature', async () => {
    const c = await generateCreature('bulbasaur')
    expect(getEVSummary(c)).toBe('None')
  })

  test('shows stat breakdown', async () => {
    const c = await generateCreature('bulbasaur')
    c.ev = { hp: 0, attack: 5, defense: 0, spAtk: 3, spDef: 0, speed: 0 }
    const summary = getEVSummary(c)
    expect(summary).toContain('ATK+5')
    expect(summary).toContain('SPA+3')
  })
})
