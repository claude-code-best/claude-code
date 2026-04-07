import React from 'react'
import { Text } from '../index.js'
import type { Theme } from './theme-types.js'

type Props = {
  /**
   * How much progress to display, between 0 and 1 inclusive
   */
  ratio: number // [0, 1]

  /**
   * How many characters wide to draw the progress bar
   */
  width: number // how many characters wide

  /**
   * Optional color for the filled portion of the bar
   */
  fillColor?: keyof Theme

  /**
   * Optional color for the empty portion of the bar
   */
  emptyColor?: keyof Theme
}

const BLOCKS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█']

export function ProgressBar({
  ratio: inputRatio,
  width,
  fillColor,
  emptyColor,
}: Props): React.ReactNode {
  const ratio = Math.min(1, Math.max(0, inputRatio))
  const whole = Math.floor(ratio * width)
  const segments = [BLOCKS[BLOCKS.length - 1]!.repeat(whole)]
  if (whole < width) {
    const remainder = ratio * width - whole
    const middle = Math.floor(remainder * BLOCKS.length)
    segments.push(BLOCKS[middle]!)

    const empty = width - whole - 1
    if (empty > 0) {
      segments.push(BLOCKS[0]!.repeat(empty))
    }
  }

  return (
    <Text color={fillColor} backgroundColor={emptyColor}>
      {segments.join('')}
    </Text>
  )
}
