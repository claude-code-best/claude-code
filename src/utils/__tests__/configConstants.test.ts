import { describe, expect, test } from 'bun:test'
import {
  NOTIFICATION_CHANNELS,
  EDITOR_MODES,
  TEAMMATE_MODES,
} from '../configConstants'

describe('NOTIFICATION_CHANNELS', () => {
  test('contains expected channels', () => {
    expect(NOTIFICATION_CHANNELS).toContain('auto')
    expect(NOTIFICATION_CHANNELS).toContain('iterm2')
    expect(NOTIFICATION_CHANNELS).toContain('terminal_bell')
    expect(NOTIFICATION_CHANNELS).toContain('kitty')
    expect(NOTIFICATION_CHANNELS).toContain('ghostty')
  })

  test('is readonly array', () => {
    expect(Array.isArray(NOTIFICATION_CHANNELS)).toBe(true)
    // TypeScript enforces readonly at compile time; runtime is still a plain array
    expect(NOTIFICATION_CHANNELS.length).toBeGreaterThan(0)
  })

  test('includes all documented channels', () => {
    expect(NOTIFICATION_CHANNELS).toEqual([
      'auto',
      'iterm2',
      'iterm2_with_bell',
      'terminal_bell',
      'kitty',
      'ghostty',
      'notifications_disabled',
    ])
  })

  test('has no duplicate entries', () => {
    const unique = new Set(NOTIFICATION_CHANNELS)
    expect(unique.size).toBe(NOTIFICATION_CHANNELS.length)
  })
})

describe('EDITOR_MODES', () => {
  test("contains 'normal' and 'vim'", () => {
    expect(EDITOR_MODES).toContain('normal')
    expect(EDITOR_MODES).toContain('vim')
  })

  test('has exactly 2 entries', () => {
    expect(EDITOR_MODES).toHaveLength(2)
  })

  test('is ordered: normal, vim', () => {
    expect(EDITOR_MODES).toEqual(['normal', 'vim'])
  })
})

describe('TEAMMATE_MODES', () => {
  test("contains 'auto', 'tmux', 'in-process'", () => {
    expect(TEAMMATE_MODES).toContain('auto')
    expect(TEAMMATE_MODES).toContain('tmux')
    expect(TEAMMATE_MODES).toContain('in-process')
  })

  test('has exactly 3 entries', () => {
    expect(TEAMMATE_MODES).toHaveLength(3)
  })

  test('is ordered: auto, tmux, in-process', () => {
    expect(TEAMMATE_MODES).toEqual(['auto', 'tmux', 'in-process'])
  })
})
