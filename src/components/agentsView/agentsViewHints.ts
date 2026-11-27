/**
 * Key hint row helpers for the agents view (official Claude Code 2.1.330,
 * tmux-verified against the official binary): `${chord} to ${action}`
 * entries joined with " · " in a dimColor italic bottom row. When the row
 * would exceed the terminal width, hints are dropped
 * lowest-priority-first.
 *
 * Verified hint rows:
 * - list (input empty):  `enter to open · space to reply · ctrl+x to remove
 *   · ? for shortcuts` — becomes `enter to return` right after returning
 *   from a session's REPL.
 * - input (has text):    `enter to create · esc×2 to clear · ctrl+f to find`
 * - reply dialog:        `enter to open · space to close · ctrl+x to remove`
 * - remove confirm:      `ctrl+x to confirm`
 * - `?` toggles the full shortcuts table (see SHORTCUTS_TABLE).
 */

export type Hint = {
  chord: string
  action: string
  /** Rendered width of the hint (`${chord} to ${action}` or the raw text). */
  width: number
  /** Literal hint text ("? for shortcuts" cannot be expressed as chord+action). */
  raw?: string
}

/** " · " separator width between two adjacent hints. */
const SEPARATOR_WIDTH = 3

export function buildHint(chord: string, action: string): Hint {
  return { chord, action, width: chord.length + action.length + 4 }
}

/** A literal hint that does not follow the `${chord} to ${action}` pattern. */
export function buildRawHint(text: string): Hint {
  return { chord: text, action: '', width: text.length, raw: text }
}

/**
 * Keep as many hints (highest priority first) as fit into `columns`.
 * Mirrors the official over-width trimming: the leading navigate hints
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

/**
 * List-view key hints (input box empty, cursor in the list). Official:
 * `enter to open · space to reply · ctrl+x to remove · ? for shortcuts`.
 *
 * Right after returning from a session's REPL, the first hint becomes
 * `enter to return` (context-sensitive).
 */
export function buildListHints(hasReturnTarget: boolean): Hint[] {
  return [
    buildHint('enter', hasReturnTarget ? 'return' : 'open'),
    buildHint('space', 'reply'),
    buildHint('ctrl+x', 'remove'),
    buildRawHint('? for shortcuts'),
  ]
}

/**
 * Input-box key hints (the persistent input has text). Official:
 * `enter to create · esc×2 to clear · ctrl+f to find`.
 */
export function buildInputHints(): Hint[] {
  return [
    buildHint('enter', 'create'),
    buildHint('esc×2', 'clear'),
    buildHint('ctrl+f', 'find'),
  ]
}

/** Reply-dialog key hints. Official: `enter to open · space to close · ctrl+x to remove`. */
export function buildReplyHints(): Hint[] {
  return [
    buildHint('enter', 'open'),
    buildHint('space', 'close'),
    buildHint('ctrl+x', 'remove'),
  ]
}

/** Remove-confirmation key hints. Official: `ctrl+x to confirm`. */
export function buildRemoveConfirmHints(): Hint[] {
  return [buildHint('ctrl+x', 'confirm')]
}

/** Detail-view key hints: up/down scroll, enter collapse, esc back. */
export function buildDetailHints(): Hint[] {
  return [
    buildHint('↑/↓', 'scroll'),
    buildHint('enter', 'collapse'),
    buildHint('esc', 'back'),
  ]
}

/**
 * The full shortcuts table toggled by `?` (official, verbatim — two-column
 * grid, 4/4/3 entries per row):
 *
 * ```
 * ctrl+r to rename          ctrl+s to switch views    ctrl+t to pin to top    esc to quit
 * ctrl+f to find            ctrl+j for newline        opt+1 to open           ? to close
 * opt+↑/↓ to jump groups    @ to mention              ctrl+x to remove
 * ```
 */
export const SHORTCUTS_TABLE: string[][] = [
  [
    'ctrl+r to rename',
    'ctrl+s to switch views',
    'ctrl+t to pin to top',
    'esc to quit',
  ],
  ['ctrl+f to find', 'ctrl+j for newline', 'opt+1 to open', '? to close'],
  ['opt+↑/↓ to jump groups', '@ to mention', 'ctrl+x to remove'],
]

/** Column width of the shortcuts table grid (aligns the literal rows). */
export const SHORTCUTS_TABLE_COLUMN_WIDTH = 25
