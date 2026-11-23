import { describe, expect, test } from 'bun:test'
import { Cursor } from '../../../utils/Cursor.js'
import {
  getDefaultToAgentsView,
  getLeftArrowOpensAgents,
} from '../agentsViewSettings.js'
import {
  buildDetailHints,
  buildHint,
  buildInputHints,
  buildListHints,
  buildRawHint,
  buildReplyHints,
  buildRemoveConfirmHints,
  trimHintsToWidth,
  SHORTCUTS_TABLE,
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

// ── Key hint rows (tmux-verified against the official binary) ──────────────

describe('buildListHints', () => {
  test('list state (input empty): enter to open · space to reply · ctrl+x to remove · ? for shortcuts', () => {
    const hints = buildListHints(false)
    expect(hints.map(h => h.raw ?? `${h.chord} to ${h.action}`)).toEqual([
      'enter to open',
      'space to reply',
      'ctrl+x to remove',
      '? for shortcuts',
    ])
  })

  test('right after returning from a session: enter to return', () => {
    const hints = buildListHints(true)
    expect(hints[0]).toEqual(buildHint('enter', 'return'))
    expect(hints[0]?.chord).toBe('enter')
    expect(hints[0]?.action).toBe('return')
  })
})

describe('buildInputHints', () => {
  test('input state (has text): enter to create · esc×2 to clear · ctrl+f to find', () => {
    const hints = buildInputHints()
    expect(hints.map(h => `${h.chord} to ${h.action}`)).toEqual([
      'enter to create',
      'esc×2 to clear',
      'ctrl+f to find',
    ])
  })
})

describe('buildReplyHints', () => {
  test('reply dialog: enter to open · space to close · ctrl+x to remove', () => {
    const hints = buildReplyHints()
    expect(hints.map(h => `${h.chord} to ${h.action}`)).toEqual([
      'enter to open',
      'space to close',
      'ctrl+x to remove',
    ])
  })
})

describe('buildRemoveConfirmHints', () => {
  test('remove confirmation: ctrl+x to confirm', () => {
    const hints = buildRemoveConfirmHints()
    expect(hints.map(h => `${h.chord} to ${h.action}`)).toEqual([
      'ctrl+x to confirm',
    ])
  })
})

describe('SHORTCUTS_TABLE', () => {
  test('matches the official table verbatim (3 rows, 4/4/3 entries)', () => {
    expect(SHORTCUTS_TABLE).toEqual([
      [
        'ctrl+r to rename',
        'ctrl+s to switch views',
        'ctrl+t to pin to top',
        'esc to quit',
      ],
      ['ctrl+f to find', 'ctrl+j for newline', 'opt+1 to open', '? to close'],
      ['opt+↑/↓ to jump groups', '@ to mention', 'ctrl+x to remove'],
    ])
  })
})

describe('trimHintsToWidth', () => {
  test('keeps all hints when the row fits', () => {
    const hints = buildListHints(false)
    const kept = trimHintsToWidth(hints, 200)
    expect(kept).toEqual(hints)
  })

  test('drops lowest-priority hints when over width', () => {
    const hints = buildListHints(false)
    // Narrow terminal: only the first (open) hint fits
    const kept = trimHintsToWidth(hints, 20)
    expect(kept.length).toBeLessThan(hints.length)
    expect(kept[0]?.chord).toBe('enter')
  })

  test('keeps nothing when nothing fits', () => {
    expect(trimHintsToWidth(buildListHints(false), 4)).toEqual([])
  })

  test('detail hints trim independently of list hints', () => {
    const hints = buildDetailHints()
    expect(trimHintsToWidth(hints, 200)).toEqual(hints)
    expect(trimHintsToWidth(hints, 1)).toEqual([])
  })

  test('buildHint width covers chord + action + " to "', () => {
    const hint = buildHint('enter', 'open')
    expect(hint.width).toBe('enter'.length + 'open'.length + 4)
  })

  test('raw hints ("? for shortcuts") use the literal text as width', () => {
    const hint = buildRawHint('? for shortcuts')
    expect(hint.raw).toBe('? for shortcuts')
    expect(hint.width).toBe('? for shortcuts'.length)
  })
})
