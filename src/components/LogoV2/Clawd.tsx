import * as React from 'react'
import { Box, Text } from '@anthropic/ink'
import { env } from '../../utils/env.js'

export type ClawdPose =
  | 'default'
  | 'arms-up' // kept for AnimatedClawd compatibility
  | 'look-left'
  | 'look-right'

type Props = {
  pose?: ClawdPose
}

type RgbColor = `rgb(${number},${number},${number})`
type LogoCell = Readonly<{ char: '█' | '░' | ' '; color?: RgbColor }>
type Letter = 'O' | 'R' | 'I' | 'N'

const LETTER_WIDTH = 5
const LETTER_HEIGHT = 7
const LETTER_GAP = 1

export const ORION_LOGO_WIDTH =
  LETTER_WIDTH * 5 + LETTER_GAP * 4 + 1 // +1 for the down-right relief shadow
export const ORION_LOGO_HEIGHT = LETTER_HEIGHT + 1

const LETTER_SEQUENCE = ['O', 'R', 'I', 'O', 'N'] as const satisfies readonly Letter[]

const LETTERS = {
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
} as const satisfies Record<Letter, readonly string[]>

// Per-letter palette: cool blue/violet on the left, warm terracotta/amber on
// the right.  The three-tone bevel (highlight/body/shadow) makes the pixel
// grid read like embossed metal rather than flat ASCII art.
const HIGHLIGHT_COLORS = [
  'rgb(157,171,255)',
  'rgb(188,158,255)',
  'rgb(238,166,232)',
  'rgb(255,184,143)',
  'rgb(255,215,125)',
] as const satisfies readonly RgbColor[]

const BODY_COLORS = [
  'rgb(87,105,247)',
  'rgb(123,92,225)',
  'rgb(184,79,184)',
  'rgb(218,119,82)',
  'rgb(242,164,58)',
] as const satisfies readonly RgbColor[]

const SHADOW_COLORS = [
  'rgb(36,45,133)',
  'rgb(61,43,130)',
  'rgb(104,38,112)',
  'rgb(139,63,41)',
  'rgb(153,93,27)',
] as const satisfies readonly RgbColor[]

const DROP_SHADOW_COLORS = [
  'rgb(24,31,91)',
  'rgb(40,30,88)',
  'rgb(68,28,74)',
  'rgb(88,42,28)',
  'rgb(100,62,21)',
] as const satisfies readonly RgbColor[]

function getPixelInfo(
  globalColumn: number,
): { letterIndex: number; localColumn: number } | null {
  const stride = LETTER_WIDTH + LETTER_GAP
  const letterIndex = Math.floor(globalColumn / stride)
  if (letterIndex < 0 || letterIndex >= LETTER_SEQUENCE.length) return null

  const localColumn = globalColumn % stride
  if (localColumn >= LETTER_WIDTH) return null
  return { letterIndex, localColumn }
}

function isLit(row: number, globalColumn: number): boolean {
  if (row < 0 || row >= LETTER_HEIGHT) return false

  const info = getPixelInfo(globalColumn)
  if (!info) return false

  const letter = LETTER_SEQUENCE[info.letterIndex]!
  const rowPattern = LETTERS[letter][row]
  return rowPattern?.[info.localColumn] === '1'
}

function getLitLetterIndex(row: number, globalColumn: number): number | null {
  return isLit(row, globalColumn) ? getPixelInfo(globalColumn)!.letterIndex : null
}

function getBevelColor(
  row: number,
  globalColumn: number,
  letterIndex: number,
): RgbColor {
  const topEdge = !isLit(row - 1, globalColumn)
  const leftEdge = !isLit(row, globalColumn - 1)
  const bottomEdge = !isLit(row + 1, globalColumn)
  const rightEdge = !isLit(row, globalColumn + 1)

  if (topEdge || leftEdge) return HIGHLIGHT_COLORS[letterIndex]!
  if (bottomEdge || rightEdge) return SHADOW_COLORS[letterIndex]!
  return BODY_COLORS[letterIndex]!
}

function getLogoCell(row: number, globalColumn: number): LogoCell {
  const litLetterIndex = getLitLetterIndex(row, globalColumn)
  if (litLetterIndex !== null) {
    return {
      char: '█',
      color: getBevelColor(row, globalColumn, litLetterIndex),
    }
  }

  // One-cell down-right cast shadow. It creates the relief/extrusion effect
  // while preserving the underlying 5x7 pixel letterforms.
  const shadowLetterIndex = getLitLetterIndex(row - 1, globalColumn - 1)
  if (shadowLetterIndex !== null) {
    return { char: '░', color: DROP_SHADOW_COLORS[shadowLetterIndex]! }
  }

  return { char: ' ' }
}

function OrionLogo({ reduceShadow }: { reduceShadow: boolean }): React.ReactNode {
  return (
    <Box flexDirection="column">
      {Array.from({ length: ORION_LOGO_HEIGHT }, (_, rowIdx) => (
        <Text key={rowIdx}>
          {Array.from({ length: ORION_LOGO_WIDTH }, (_unused, colIdx) => {
            const cell = getLogoCell(rowIdx, colIdx)
            if (cell.char === ' ' || (reduceShadow && cell.char === '░')) {
              return <Text key={colIdx}> </Text>
            }
            return (
              <Text key={colIdx} color={cell.color}>
                {cell.char}
              </Text>
            )
          })}
        </Text>
      ))}
    </Box>
  )
}

export function Clawd({ pose = 'default' }: Props = {}): React.ReactNode {
  // AnimatedClawd still passes historical Clawd poses. ORION is a static wordmark,
  // so the pose is intentionally ignored while keeping the public component API.
  void pose

  return <OrionLogo reduceShadow={env.terminal === 'Apple_Terminal'} />
}
