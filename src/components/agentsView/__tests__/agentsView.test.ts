import { describe, expect, test } from 'bun:test'
import { Cursor } from '../../../utils/Cursor.js'
import {
  getDefaultToAgentsView,
  getLeftArrowOpensAgents,
} from '../agentsViewSettings.js'
import {
  buildDetailHints,
  buildHint,
  buildListHints,
  trimHintsToWidth,
} from '../agentsViewHints.js'

// ── Settings (official 2.1.330, strings L930821/L907438) ───────────────────

describe('getLeftArrowOpensAgents', () => {
  test('defaults to true when unset', () => {
    expect(getLeftArrowOpensAgents({})).toBe(true)
  })

  test('true stays true', () => {
    expect(getLeftArrowOpensAgents({ leftArrowOpensAgents: true })).toBe(true)
  })

  test('false disables the ← shortcut', () => {
    expect(getLeftArrowOpensAgents({ leftArrowOpensAgents: false })).toBe(false)
  })
})

describe('getDefaultToAgentsView', () => {
  test('defaults to false when unset', () => {
    expect(getDefaultToAgentsView({})).toBe(false)
  })

  test('true opens the agents view at startup', () => {
    expect(getDefaultToAgentsView({ defaultToAgentsView: true })).toBe(true)
  })

  test('false stays false', () => {
    expect(getDefaultToAgentsView({ defaultToAgentsView: false })).toBe(false)
  })
})

// ── ← trigger condition (useTextInput leftArrow case) ──────────────────────
//
// The hook fires onLeftAtStart when `cursor.left().equals(cursor)` — i.e. ←
// cannot move the cursor any further left. These tests pin that condition.

describe('left arrow trigger condition', () => {
  const columns = 80

  test('← at the start of the input cannot move (callback fires)', () => {
    const cursor = Cursor.fromText('hello', columns, 0)
    expect(cursor.left().equals(cursor)).toBe(true)
  })

  test('← elsewhere in the input moves (callback does not fire)', () => {
    const cursor = Cursor.fromText('hello', columns, 2)
    expect(cursor.left().equals(cursor)).toBe(false)
  })

  test('← at the start of an empty input cannot move', () => {
    const cursor = Cursor.fromText('', columns, 0)
    expect(cursor.left().equals(cursor)).toBe(true)
  })

  test('← at the start of the second line still moves (multi-line input)', () => {
    // Multi-line: cursor at line 2's start moves to line 1's end — the
    // agents view only opens at the very start of the input.
    const cursor = Cursor.fromText('first\nsecond', columns, 6)
    expect(cursor.left().equals(cursor)).toBe(false)
  })
})

// ── Key hint rows (official L933730) ───────────────────────────────────────

describe('trimHintsToWidth', () => {
  test('keeps all hints when the row fits', () => {
    const hints = buildListHints()
    const kept = trimHintsToWidth(hints, 120)
    expect(kept).toEqual(hints)
  })

  test('drops lowest-priority hints when over width', () => {
    const hints = buildListHints()
    // Narrow terminal: only the first (navigate) hint fits
    const kept = trimHintsToWidth(hints, 20)
    expect(kept.length).toBeLessThan(hints.length)
    expect(kept[0]?.chord).toBe('↑/↓')
  })

  test('keeps nothing when nothing fits', () => {
    expect(trimHintsToWidth(buildListHints(), 4)).toEqual([])
  })

  test('detail hints trim independently of list hints', () => {
    const hints = buildDetailHints()
    expect(trimHintsToWidth(hints, 200)).toEqual(hints)
    expect(trimHintsToWidth(hints, 1)).toEqual([])
  })

  test('buildHint width covers chord + action + " to "', () => {
    const hint = buildHint('enter', 'view')
    expect(hint.width).toBe('enter'.length + 'view'.length + 4)
  })
})
