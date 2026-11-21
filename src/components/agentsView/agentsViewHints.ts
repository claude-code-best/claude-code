/**
 * Key hint row helpers for the agents view (official Claude Code 2.1.330,
 * strings L933730): `${chord} ${action}` entries joined KeyboardShortcutHint
 * style in a dimColor italic bottom row. When the row would exceed the
 * terminal width, hints are dropped lowest-priority-first (official trim
 * priority order: up/enter/s/f/p/r/j — mapped onto this view's chords).
 */

export type Hint = {
  chord: string
  action: string
  /** Rendered width of `${chord} to ${action}`. */
  width: number
}

/** " · " separator width between two adjacent hints. */
const SEPARATOR_WIDTH = 3

export function buildHint(chord: string, action: string): Hint {
  return { chord, action, width: chord.length + action.length + 4 }
}

/**
 * Keep as many hints (highest priority first) as fit into `columns`.
 * Mirrors the official over-width trimming: the leading navigate/view hints
 * survive, trailing ones drop off.
 */
export function trimHintsToWidth(hints: Hint[], columns: number): Hint[] {
  // +2 padding margin
  let budget = columns - 2
  const kept: Hint[] = []
  for (const hint of hints) {
    if (kept.length > 0) budget -= SEPARATOR_WIDTH
    if (hint.width > budget) break
    kept.push(hint)
    budget -= hint.width
  }
  return kept
}

/** List-view key hints: up/down navigate, x stop, r restart, enter view, esc close. */
export function buildListHints(): Hint[] {
  return [
    buildHint('↑/↓', 'navigate'),
    buildHint('x', 'stop'),
    buildHint('r', 'restart'),
    buildHint('enter', 'view'),
    buildHint('esc', 'close'),
  ]
}

/** Detail-view key hints: up/down scroll, enter collapse, esc back. */
export function buildDetailHints(): Hint[] {
  return [
    buildHint('↑/↓', 'scroll'),
    buildHint('enter', 'collapse'),
    buildHint('esc', 'back'),
  ]
}
