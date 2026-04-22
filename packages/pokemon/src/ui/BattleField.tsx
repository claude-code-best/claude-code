import React, { useEffect, useState, useMemo } from 'react'
import { Box, Text } from '@anthropic/ink'
import { parseSprite, renderSprite, flipSpriteLines, EMPTY_PIXEL, EMPTY_ROW } from '../sprites/renderer'
import type { Pixel } from '../sprites/renderer'

/**
 * Combined battle field — composites both sprites into one canvas.
 * Opponent (top-right) and player (bottom-left) share overlapping rows,
 * like the classic GBA Pokemon battle layout.
 *
 * Bounce: fast 0-1-2-1px vertical, staggered between the two.
 */

const BOUNCE = [0, 1, 2, 1]
/** How many rows the player sprite overlaps into opponent's area */
const OVERLAP = 3

interface BattleFieldProps {
  opponentLines: string[]
  playerLines: string[]
  animEnabled?: boolean
}

export function BattleField({ opponentLines, playerLines, animEnabled = true }: BattleFieldProps) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!animEnabled) return
    const timer = setInterval(() => setTick(t => t + 1), 120)
    return () => clearInterval(timer)
  }, [animEnabled])

  // Parse & flip (cached)
  const oppGrid = useMemo(() => parseSprite(opponentLines), [opponentLines])
  const playerGrid = useMemo(() => parseSprite(flipSpriteLines(playerLines)), [playerLines])

  // Composited canvas
  const canvas = useMemo(() => {
    const oppH = oppGrid.length
    const playerH = playerGrid.length
    const totalH = oppH + playerH - OVERLAP
    const canvasW = Math.max(
      widthOf(oppGrid),
      widthOf(playerGrid),
    )

    // Build empty canvas
    const rows: Pixel[][] = Array.from({ length: totalH }, () =>
      Array.from({ length: canvasW }, () => EMPTY_PIXEL),
    )

    // Bounce offsets
    const oppOffset = animEnabled ? BOUNCE[tick % BOUNCE.length]! : 0
    const playerOffset = animEnabled ? BOUNCE[(tick + 2) % BOUNCE.length]! : 0

    // Blit opponent (top-right, shifted up by bounce)
    const oppY = -oppOffset // negative = shift up
    blit(rows, oppGrid, oppY, canvasW - widthOf(oppGrid))

    // Blit player (bottom-left, shifted up by bounce)
    const playerStartRow = oppH - OVERLAP
    const playerY = playerStartRow - playerOffset
    blit(rows, playerGrid, playerY, 0)

    return rows
  }, [oppGrid, playerGrid, animEnabled, tick])

  const rendered = renderSprite(canvas)

  return (
    <Box flexDirection="column">
      {rendered.map((line, i) => (
        <Text key={i}>{line || ' '}</Text>
      ))}
    </Box>
  )
}

/** Get width of a pixel grid */
function widthOf(grid: Pixel[][]): number {
  return Math.max(0, ...grid.map(row => row.length))
}

/** Blit source grid onto target at (startRow, startCol). Non-empty pixels overwrite. */
function blit(target: Pixel[][], source: Pixel[][], startRow: number, startCol: number) {
  for (let sy = 0; sy < source.length; sy++) {
    const ty = startRow + sy
    if (ty < 0 || ty >= target.length) continue
    for (let sx = 0; sx < source[sy].length; sx++) {
      const tx = startCol + sx
      if (tx < 0 || tx >= target[ty].length) continue
      const pixel = source[sy][sx]
      if (pixel.char !== ' ') {
        target[ty][tx] = pixel
      }
    }
  }
}
