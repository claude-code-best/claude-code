import React, { useEffect, useState, useMemo } from 'react'
import { Box, Text } from '@anthropic/ink'
import { parseSprite, renderSprite, flipSpriteLines, EMPTY_ROW } from '../sprites/renderer'
import type { Pixel } from '../sprites/renderer'

/**
 * Simple battle sprite with fast 1-2px vertical bounce.
 * Padded so bounce never clips the sprite.
 */

// Bounce pattern: 0 → 1 → 2 → 1 → 0 → ...
const BOUNCE = [0, 1, 2, 1]
/** Vertical padding above & below — bounce shifts within this space */
const V_PAD = 3

interface BattleSpriteProps {
  /** ANSI sprite lines */
  lines: string[]
  /** Flip horizontally (player side) */
  flip?: boolean
  /** Enable animation (false = static) */
  animEnabled?: boolean
  /** Phase offset to stagger bounce between sprites */
  phaseOffset?: number
}

export function BattleSprite({ lines, flip, animEnabled = true, phaseOffset = 0 }: BattleSpriteProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!animEnabled) return
    const timer = setInterval(() => setTick(t => t + 1), 120)
    return () => clearInterval(timer)
  }, [animEnabled])

  // Flip once (cached)
  const source = useMemo(() => flip ? flipSpriteLines(lines) : lines, [lines, flip])

  // Parse to pixel grid once (cached), then pad
  const padded = useMemo(() => {
    const grid = parseSprite(source)
    const top = Array.from({ length: V_PAD }, () => EMPTY_ROW)
    const bottom = Array.from({ length: V_PAD }, () => EMPTY_ROW)
    return [...top, ...grid, ...bottom]
  }, [source])

  // Apply bounce offset with phase shift — shift up within padded space
  const offset = animEnabled ? BOUNCE[(tick + phaseOffset) % BOUNCE.length]! : 0
  const shifted = shiftGridUp(padded, offset)
  const rendered = renderSprite(shifted)

  return (
    <Box flexDirection="column">
      {rendered.map((line, i) => (
        <Text key={i}>{line || ' '}</Text>
      ))}
    </Box>
  )
}

/** Shift Pixel grid up by n rows, pad empty rows at bottom */
function shiftGridUp(grid: Pixel[][], n: number): Pixel[][] {
  if (n <= 0) return grid
  const height = grid.length
  const shifted = grid.slice(n)
  while (shifted.length < height) shifted.push(EMPTY_ROW)
  return shifted
}
