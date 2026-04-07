import * as React from 'react'
import { Box, Text, useTheme } from '../../ink.js'
import { getTheme, type Theme } from '../../utils/theme.js'
import {
  getDefaultCharacters,
  interpolateColor,
  parseRGB,
  toRGBColor,
} from './utils.js'

const DEFAULT_CHARACTERS = getDefaultCharacters()

const SPINNER_FRAMES = [
  ...DEFAULT_CHARACTERS,
  ...[...DEFAULT_CHARACTERS].reverse(),
]

const REDUCED_MOTION_DOT = '●'
const REDUCED_MOTION_CYCLE_MS = 2000 // 2-second cycle: 1s visible, 1s dim
const ERROR_RED = { r: 171, g: 43, b: 63 }

type Props = {
  frame: number
  messageColor: keyof Theme
  stalledIntensity?: number
  reducedMotion?: boolean
  time?: number
}

export function SpinnerGlyph({
  frame,
  messageColor,
  stalledIntensity = 0,
  reducedMotion = false,
  time = 0,
}: Props): React.ReactNode {
  const [themeName] = useTheme()
  const theme = getTheme(themeName)

  // Reduced motion: slowly flashing orange dot
  if (reducedMotion) {
    const isDim = Math.floor(time / (REDUCED_MOTION_CYCLE_MS / 2)) % 2 === 1
    return (
      <Box flexWrap="wrap" height={1} width={2}>
        <Text color={messageColor} dimColor={isDim}>
          {REDUCED_MOTION_DOT}
        </Text>
      </Box>
    )
  }

  const spinnerChar = SPINNER_FRAMES[frame % SPINNER_FRAMES.length]

  // Smoothly interpolate from current color to red when stalled
  if (stalledIntensity > 0) {
    const baseColorStr = theme[messageColor]
    const baseRGB = baseColorStr ? parseRGB(baseColorStr) : null

    if (baseRGB) {
      const interpolated = interpolateColor(
        baseRGB,
        ERROR_RED,
        stalledIntensity,
      )
      return (
        <Box flexWrap="wrap" height={1} width={2}>
          <Text color={toRGBColor(interpolated)}>{spinnerChar}</Text>
        </Box>
      )
    }

    // Fallback for ANSI themes
    const color = stalledIntensity > 0.5 ? 'error' : messageColor
    return (
      <Box flexWrap="wrap" height={1} width={2}>
        <Text color={color}>{spinnerChar}</Text>
      </Box>
    )
  }

  return (
    <Box flexWrap="wrap" height={1} width={2}>
      <Text color={messageColor}>{spinnerChar}</Text>
    </Box>
  )
}
