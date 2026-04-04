import * as React from 'react'
import { Text, useTheme } from '../../ink.js'
import { getTheme, type Theme } from '../../utils/theme.js'
import { interpolateColor, parseRGB, toRGBColor } from './utils.js'

type Props = {
  char: string
  flashOpacity: number
  messageColor: keyof Theme
  shimmerColor: keyof Theme
}

export function FlashingChar({
  char,
  flashOpacity,
  messageColor,
  shimmerColor,
}: Props): React.ReactNode {
  const [themeName] = useTheme()
  const theme = getTheme(themeName)

  const baseColorStr = theme[messageColor]
  const shimmerColorStr = theme[shimmerColor]

  const baseRGB = baseColorStr ? parseRGB(baseColorStr) : null
  const shimmerRGB = shimmerColorStr ? parseRGB(shimmerColorStr) : null

  if (baseRGB && shimmerRGB) {
    // Smooth interpolation between colors
    const interpolated = interpolateColor(baseRGB, shimmerRGB, flashOpacity)
    return <Text color={toRGBColor(interpolated)}>{char}</Text>
  }

  // Fallback for ANSI themes: binary switch
  const shouldUseShimmer = flashOpacity > 0.5
  return (
    <Text color={shouldUseShimmer ? shimmerColor : messageColor}>{char}</Text>
  )
}
