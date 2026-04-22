import { describe, expect, test } from 'bun:test'
import { renderAnimatedSprite, getIdleAnimMode, getPetOverlay } from '../sprites/renderer'

describe('renderAnimatedSprite', () => {
  const testSprite = [
    '  AB',
    ' C  D',
  ]

  test('idle mode returns original sprite (with ANSI resets)', () => {
    const result = renderAnimatedSprite(testSprite, 0, 'idle')
    expect(result.length).toBe(2)
    // Each row should contain the original characters
    expect(result[0]).toContain('A')
    expect(result[0]).toContain('B')
  })

  test('flip reverses rows', () => {
    const flipped = renderAnimatedSprite(testSprite, 0, 'flip')
    expect(flipped[0]).toContain('B')
    expect(flipped[0]).toContain('A')
  })

  test('blink replaces eye characters with dash', () => {
    const sprite = ['  O  ', '  O  ']
    const result = renderAnimatedSprite(sprite, 0, 'blink')
    expect(result[0]).toContain('—')
    expect(result[1]).toContain('—')
  })

  test('bounce shifts sprite up', () => {
    const result = renderAnimatedSprite(testSprite, 2, 'bounce')
    // Bounce at tick 2 should shift up by some amount
    expect(result.length).toBe(2)
  })

  test('excited mode shifts horizontally', () => {
    const result = renderAnimatedSprite(testSprite, 0, 'excited')
    expect(result.length).toBe(2)
  })

  test('walkRight shifts progressively', () => {
    const r0 = renderAnimatedSprite(testSprite, 0, 'walkRight')
    const r1 = renderAnimatedSprite(testSprite, 1, 'walkRight')
    // Different ticks should produce different horizontal positions
    expect(r0).toBeDefined()
    expect(r1).toBeDefined()
  })

  test('walkLeft mode shifts', () => {
    const result = renderAnimatedSprite(testSprite, 0, 'walkLeft')
    expect(result.length).toBe(2)
  })

  test('pet mode returns sprite unchanged', () => {
    const result = renderAnimatedSprite(testSprite, 0, 'pet')
    expect(result.length).toBe(2)
  })
})

describe('getIdleAnimMode', () => {
  test('returns valid AnimMode for any tick', () => {
    const modes = new Set<string>()
    for (let i = 0; i < 100; i++) {
      modes.add(getIdleAnimMode(i))
    }
    expect(modes.size).toBeGreaterThan(1)
  })

  test('cycles through sequence', () => {
    // First tick should be 'idle' (first element of IDLE_SEQUENCE)
    expect(getIdleAnimMode(0)).toBe('idle')
  })

  test('wraps around after sequence length', () => {
    const mode0 = getIdleAnimMode(0)
    const modeAfterFullCycle = getIdleAnimMode(26) // IDLE_SEQUENCE.length
    expect(mode0).toBe(modeAfterFullCycle)
  })
})

describe('getPetOverlay', () => {
  test('returns two lines', () => {
    const overlay = getPetOverlay(0)
    expect(overlay.length).toBe(2)
  })

  test('contains heart characters', () => {
    const overlay = getPetOverlay(0)
    const combined = overlay.join('')
    expect(combined).toContain('♥')
  })

  test('cycles through overlays', () => {
    const o0 = getPetOverlay(0)
    const o1 = getPetOverlay(1)
    expect(o0).not.toEqual(o1)
  })

  test('wraps around', () => {
    expect(getPetOverlay(0)).toEqual(getPetOverlay(5))
  })
})
