import { describe, test, expect } from 'bun:test'
import { getEVForTool, DEFAULT_EV_MAPPING, MAX_EV_PER_STAT, MAX_EV_TOTAL } from '../dex/evMapping'

describe('getEVForTool', () => {
  test('returns EV mapping for known tools', () => {
    const bashEV = getEVForTool('Bash')
    expect(bashEV).toBeDefined()
    expect(bashEV!.attack).toBe(2)
    expect(bashEV!.speed).toBe(1)
  })

  test('returns undefined for unknown tools', () => {
    expect(getEVForTool('UnknownTool')).toBeUndefined()
  })

  test('all mapped tools have correct stat shape', () => {
    for (const [, ev] of Object.entries(DEFAULT_EV_MAPPING)) {
      expect(ev.hp).toBeDefined()
      expect(ev.attack).toBeDefined()
      expect(ev.defense).toBeDefined()
      expect(ev.spAtk).toBeDefined()
      expect(ev.spDef).toBeDefined()
      expect(ev.speed).toBeDefined()
      // EVs should sum to > 0
      const total = ev.hp + ev.attack + ev.defense + ev.spAtk + ev.spDef + ev.speed
      expect(total).toBeGreaterThan(0)
    }
  })
})

describe('EV constants', () => {
  test('MAX_EV_PER_STAT is 252', () => {
    expect(MAX_EV_PER_STAT).toBe(252)
  })

  test('MAX_EV_TOTAL is 510', () => {
    expect(MAX_EV_TOTAL).toBe(510)
  })
})
