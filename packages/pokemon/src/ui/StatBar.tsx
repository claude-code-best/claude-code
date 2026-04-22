import React from 'react'
import { Box, Text, type Color } from '@anthropic/ink'

interface StatBarProps {
  label: string
  value: number
  maxValue: number
  color?: Color
  width?: number
}

/**
 * Compact horizontal stat bar for Pokémon stats.
 */
export function StatBar({ label, value, maxValue, color = 'ansi:green', width = 12 }: StatBarProps) {
  const filled = Math.round((value / maxValue) * width)
  const empty = width - filled
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  const valueStr = String(value).padStart(3)

  return (
    <Box>
      <Text color="ansi:whiteBright">{label.padEnd(3)}</Text>
      <Text color={color}>{bar}</Text>
      <Text> {valueStr}</Text>
    </Box>
  )
}
