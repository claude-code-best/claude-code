import { describe, expect, test } from 'bun:test'
import {
  parseTokenBudget,
  findTokenBudgetPositions,
  getBudgetContinuationMessage,
} from '../tokenBudget'

describe('parseTokenBudget', () => {
  // --- shorthand at start ---
  test('parses +500k at start', () => {
    expect(parseTokenBudget('+500k')).toBe(500_000)
  })

  test('parses +2.5M at start', () => {
    expect(parseTokenBudget('+2.5M')).toBe(2_500_000)
  })

  test('parses +1b at start', () => {
    expect(parseTokenBudget('+1b')).toBe(1_000_000_000)
  })

  test('parses shorthand with leading whitespace', () => {
    expect(parseTokenBudget('  +500k')).toBe(500_000)
  })

  // --- shorthand at end ---
  test('parses +1.5m at end of sentence', () => {
    expect(parseTokenBudget('do this +1.5m')).toBe(1_500_000)
  })

  test('parses shorthand at end with trailing period', () => {
    expect(parseTokenBudget('please continue +100k.')).toBe(100_000)
  })

  test('parses shorthand at end with trailing whitespace', () => {
    expect(parseTokenBudget('keep going +250k  ')).toBe(250_000)
  })

  // --- verbose ---
  test("parses 'use 2M tokens'", () => {
    expect(parseTokenBudget('use 2M tokens')).toBe(2_000_000)
  })

  test("parses 'spend 500k tokens'", () => {
    expect(parseTokenBudget('spend 500k tokens')).toBe(500_000)
  })

  test("parses verbose with singular 'token'", () => {
    expect(parseTokenBudget('use 1k token')).toBe(1_000)
  })

  test('parses verbose embedded in sentence', () => {
    expect(parseTokenBudget('please use 3.5m tokens for this task')).toBe(
      3_500_000,
    )
  })

  // --- no match (returns null) ---
  test('returns null for plain text', () => {
    expect(parseTokenBudget('hello world')).toBeNull()
  })

  test('returns null for bare number without +', () => {
    expect(parseTokenBudget('500k')).toBeNull()
  })

  test('returns null for number without suffix', () => {
    expect(parseTokenBudget('+500')).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseTokenBudget('')).toBeNull()
  })

  // --- case insensitivity ---
  test('is case insensitive for suffix', () => {
    expect(parseTokenBudget('+500K')).toBe(500_000)
    expect(parseTokenBudget('+2m')).toBe(2_000_000)
    expect(parseTokenBudget('+1B')).toBe(1_000_000_000)
  })

  // --- priority: start shorthand wins over end/verbose ---
  test('start shorthand takes priority over verbose in same text', () => {
    expect(parseTokenBudget('+100k use 2M tokens')).toBe(100_000)
  })
})

describe('findTokenBudgetPositions', () => {
  test('returns single position for +500k at start', () => {
    const positions = findTokenBudgetPositions('+500k')
    expect(positions).toHaveLength(1)
    expect(positions[0]!.start).toBe(0)
    expect(positions[0]!.end).toBe(5)
  })

  test('returns position for shorthand at end', () => {
    const text = 'do this +100k'
    const positions = findTokenBudgetPositions(text)
    expect(positions).toHaveLength(1)
    expect(positions[0]!.start).toBe(8)
    expect(text.slice(positions[0]!.start, positions[0]!.end)).toBe('+100k')
  })

  test('returns position for verbose match', () => {
    const text = 'please use 2M tokens here'
    const positions = findTokenBudgetPositions(text)
    expect(positions).toHaveLength(1)
    expect(text.slice(positions[0]!.start, positions[0]!.end)).toBe(
      'use 2M tokens',
    )
  })

  test('returns multiple positions for combined shorthand + verbose', () => {
    const text = 'use 2M tokens and then +500k'
    const positions = findTokenBudgetPositions(text)
    expect(positions.length).toBeGreaterThanOrEqual(2)
  })

  test('returns empty array for no match', () => {
    expect(findTokenBudgetPositions('hello world')).toEqual([])
  })

  test('does not double-count when +500k matches both start and end', () => {
    const positions = findTokenBudgetPositions('+500k')
    expect(positions).toHaveLength(1)
  })
})

describe('getBudgetContinuationMessage', () => {
  test('formats a continuation message with correct values', () => {
    const msg = getBudgetContinuationMessage(50, 250_000, 500_000)
    expect(msg).toContain('50%')
    expect(msg).toContain('250,000')
    expect(msg).toContain('500,000')
    expect(msg).toContain('Keep working')
    expect(msg).toContain('do not summarize')
  })

  test('formats zero values', () => {
    const msg = getBudgetContinuationMessage(0, 0, 100_000)
    expect(msg).toContain('0%')
    expect(msg).toContain('0 / 100,000')
  })

  test('formats large numbers with commas', () => {
    const msg = getBudgetContinuationMessage(75, 7_500_000, 10_000_000)
    expect(msg).toContain('7,500,000')
    expect(msg).toContain('10,000,000')
  })
})
