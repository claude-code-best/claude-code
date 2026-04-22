import type { AnimMode } from '../types'

// ═══════════════════════════════════════════════════════
// Pixel Grid Model — ANSI-safe animation foundation
// ═══════════════════════════════════════════════════════
//
// Every sprite line is parsed into a Pixel[] row:
//   Pixel = { char: '▄', style: '\x1b[33m' }
//
// style = full accumulated ANSI state at that position,
// so any transform (shift, reverse, slice) just moves Pixels
// around without ever touching raw ANSI strings.
//
// After transform, render each row back: reset → style → char → reset

interface Pixel {
  char: string
  /** Full ANSI state needed to render this pixel */
  style: string
}

const EMPTY_PIXEL: Pixel = { char: ' ', style: '' }
const EMPTY_ROW: Pixel[] = []

// ─── Parse / Render ───────────────────────────────────

/** Parse a raw ANSI string line into a Pixel row */
function parseLine(line: string): Pixel[] {
  const pixels: Pixel[] = []
  let style = ''
  let i = 0
  while (i < line.length) {
    if (line[i] === '\x1b') {
      // Collect full ANSI escape sequence: \x1b[ ... m
      const start = i
      i++ // skip \x1b
      if (i < line.length && line[i] === '[') {
        i++ // skip [
        while (i < line.length && line[i] !== 'm') i++
        if (i < line.length) i++ // skip m
      }
      style += line.slice(start, i)
    } else {
      // Visible character (handle multi-byte Unicode)
      const cp = line.codePointAt(i)!
      const ch = String.fromCodePoint(cp)
      pixels.push({ char: ch, style })
      i += ch.length
    }
  }
  return pixels
}

/** Render a Pixel row back to an ANSI string */
function renderRow(pixels: Pixel[]): string {
  if (pixels.length === 0) return ''
  let out = ''
  let lastStyle: string | null = null
  for (const p of pixels) {
    if (p.style !== lastStyle) {
      out += '\x1b[0m' + p.style // reset then apply
      lastStyle = p.style
    }
    out += p.char
  }
  out += '\x1b[0m' // final reset
  return out
}

function parseSprite(lines: string[]): Pixel[][] {
  return lines.map(parseLine)
}

function renderSprite(grid: Pixel[][]): string[] {
  return grid.map(renderRow)
}

// ─── Grid Transforms ──────────────────────────────────
// All transforms operate on Pixel[][], never touch raw strings.

/** Horizontal shift — positive = right, negative = left */
function shiftH(grid: Pixel[][], n: number): Pixel[][] {
  if (n > 0) return grid.map(row => [...Array(n).fill(EMPTY_PIXEL), ...row])
  if (n < 0) return grid.map(row => row.slice(Math.abs(n)))
  return grid
}

/** Vertical shift up — removes rows from top, pads empty at bottom */
function shiftUp(grid: Pixel[][], n: number): Pixel[][] {
  if (n <= 0) return grid
  const height = grid.length
  const shifted = grid.slice(n)
  while (shifted.length < height) shifted.push(EMPTY_ROW)
  return shifted
}

/** Mirror map — characters that change when flipped horizontally */
const MIRROR: Record<string, string> = {
  '/': '\\', '\\': '/',
  '(': ')', ')': '(',
  '<': '>', '>': '<',
  '{': '}', '}': '{',
  '[': ']', ']': '[',
  '╱': '╲', '╲': '╱',
  '▌': '▐', '▐': '▌',
  '▎': '▏', '▏': '▎',
  '◀': '▶', '▶': '◀',
  '◄': '►', '►': '◄',
  '→': '←', '←': '→',
  '↗': '↙', '↙': '↗',
  '↘': '↖', '↖': '↘',
  '`': "'", "'": '`',
  ',': '´', '´': ',',
}

/**
 * Horizontal mirror — reverse each row.
 * When mirrorChars=true, also swap directional characters (correct mirror).
 * When mirrorChars=false, only reverse positions (more visible "flip" effect).
 */
function reverseH(grid: Pixel[][], mirrorChars = true): Pixel[][] {
  const width = Math.max(0, ...grid.map(row => row.length))
  return grid.map(row =>
    [...row, ...Array(width - row.length).fill(EMPTY_PIXEL)]
      .reverse()
      .map(p => ({
        ...p,
        char: mirrorChars ? (MIRROR[p.char] ?? p.char) : p.char,
      })),
  )
}

/** Replace eye-like characters with dash */
function blinkEyes(grid: Pixel[][]): Pixel[][] {
  return grid.map(row =>
    row.map(p =>
      /[·✦×◉@°oO]/.test(p.char) ? { ...p, char: '—' } : p,
    ),
  )
}

// ═══════════════════════════════════════════════════════
// Idle Sequence
// ═══════════════════════════════════════════════════════

const IDLE_SEQUENCE: AnimMode[] = [
  'idle', 'idle',
  'breathe', 'breathe',
  'idle',
  'blink',
  'idle',
  'bounce',
  'idle',
  'fidget', 'fidget',
  'idle',
  'breathe', 'breathe',
  'idle',
  'flip', 'flip', 'flip',
  'idle', 'idle',
  'bounce',
  'idle',
  'blink',
  'idle',
  'excited', 'excited',
  'idle',
]

export function getIdleAnimMode(tick: number): AnimMode {
  return IDLE_SEQUENCE[tick % IDLE_SEQUENCE.length]
}

// ═══════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════

/**
 * Apply animation transform to sprite lines.
 * Internally: parse ANSI → Pixel grid → transform → render back.
 */
export function renderAnimatedSprite(lines: string[], tick: number, mode: AnimMode): string[] {
  const grid = parseSprite(lines)

  let result: Pixel[][] = grid

  switch (mode) {
    case 'idle':
      break
    case 'breathe':
      // Right sway → center
      result = shiftH(result, tick % 4 < 2 ? 3 : 0)
      break
    case 'blink':
      result = blinkEyes(result)
      break
    case 'fidget':
      // Big right sway → center
      result = shiftH(result, tick % 2 === 0 ? 4 : 0)
      break
    case 'bounce': {
      const PATTERN = [0, 2, 3, 4, 4, 3, 2, 0, 0]
      const h = PATTERN[tick % PATTERN.length]
      result = shiftUp(result, h)
      break
    }
    case 'walkLeft':
      // Step right → center (mimics bounce-back from left step)
      result = shiftH(result, tick % 4 === 0 ? 0 : 3)
      break
    case 'walkRight':
      // Step right → further right → center
      result = shiftH(result, (tick % 4) * 2)
      break
    case 'flip':
      // Pure position reversal — do NOT mirror chars so / \ ( )
      // visibly swap, making the flip obvious.
      result = reverseH(result, false)
      break
    case 'excited':
      // Jitter right ↔ further right (never crop)
      result = shiftH(result, tick % 2 === 0 ? 1 : 4)
      break
    case 'pet':
      break // overlay handled by SpriteAnimator
  }

  return renderSprite(result)
}

// ─── Heart overlay (kept for SpriteAnimator convenience) ──

const PET_HEARTS = [
  ['   ♥    ', '        '],
  ['  ♥ ♥   ', '   ♥    '],
  [' ♥   ♥  ', '  ♥ ♥   '],
  ['  ♥ ♥   ', ' ♥   ♥  '],
  ['   ♥    ', '  ♥ ♥   '],
]

export function getPetOverlay(tick: number): string[] {
  return PET_HEARTS[tick % PET_HEARTS.length]
}
