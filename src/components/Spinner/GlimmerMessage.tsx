import * as React from 'react'
import { Text, stringWidth, useTheme } from '@anthropic/ink'
import { getGraphemeSegmenter } from '../../utils/intl.js'
import { getTheme, type Theme } from '../../utils/theme.js'
import type { SpinnerMode } from './types.js'
import { interpolateColor, parseRGB, toRGBColor } from './utils.js'

type Props = {
  message: string
  mode: SpinnerMode
  messageColor: keyof Theme
  glimmerIndex: number
  flashOpacity: number
  shimmerColor: keyof Theme
  stalledIntensity?: number
}

const ERROR_RED = { r: 171, g: 43, b: 63 }

export function GlimmerMessage({
  message,
  mode,
  messageColor,
  glimmerIndex,
  flashOpacity,
  shimmerColor,
  stalledIntensity = 0,
}: Props): React.ReactNode {
  const [themeName] = useTheme()
  const theme = getTheme(themeName)

  // This component re-renders at 20fps (glimmerIndex changes every 50ms) but
  // message is stable within a turn. Precompute grapheme segmentation + widths
  // once per message instead of per frame. Measured -81% on the shimmer path.
  const { segments, messageWidth } = React.useMemo(() => {
    const segs: { segment: string; width: number }[] = []
    for (const { segment } of getGraphemeSegmenter().segment(message)) {
      segs.push({ segment, width: stringWidth(segment) })
    }
    return { segments: segs, messageWidth: stringWidth(message) }
  }, [message])

  if (!message) return null

  // When stalled, show text that smoothly transitions to red
  if (stalledIntensity > 0) {
    const baseColorStr = theme[messageColor]
    const baseRGB = baseColorStr ? parseRGB(baseColorStr) : null

    if (baseRGB) {
      const interpolated = interpolateColor(
        baseRGB,
        ERROR_RED,
        stalledIntensity,
      )
      const color = toRGBColor(interpolated)
      return (
        <>
          <Text color={color}>{message}</Text>
          <Text color={color}> </Text>
        </>
      )
    }

    // Fallback for ANSI themes: use messageColor until fully stalled, then error
    const color = stalledIntensity > 0.5 ? 'error' : messageColor
    return (
      <>
        <Text color={color}>{message}</Text>
        <Text color={color}> </Text>
      </>
    )
  }

  // tool-use mode: all chars flash with the same opacity, so render as a
  // single <Text> instead of N individual FlashingChar components.
  if (mode === 'tool-use') {
    const baseColorStr = theme[messageColor]
    const shimmerColorStr = theme[shimmerColor]
    const baseRGB = baseColorStr ? parseRGB(baseColorStr) : null
    const shimmerRGB = shimmerColorStr ? parseRGB(shimmerColorStr) : null

    if (baseRGB && shimmerRGB) {
      const interpolated = interpolateColor(baseRGB, shimmerRGB, flashOpacity)
      return (
        <>
          <Text color={toRGBColor(interpolated)}>{message}</Text>
          <Text color={messageColor}> </Text>
        </>
      )
    }

    const color = flashOpacity > 0.5 ? shimmerColor : messageColor
    return (
      <>
        <Text color={color}>{message}</Text>
        <Text color={messageColor}> </Text>
      </>
    )
  }

  // Shimmer mode: only chars within ±1 of glimmerIndex need the shimmer
  // color. When glimmer is offscreen, render as a single <Text>.
  const shimmerStart = glimmerIndex - 1
  const shimmerEnd = glimmerIndex + 1

  if (shimmerStart >= messageWidth || shimmerEnd < 0) {
    return (
      <>
        <Text color={messageColor}>{message}</Text>
        <Text color={messageColor}> </Text>
      </>
    )
  }

  // Split into at most 3 segments by visual column position
  const clampedStart = Math.max(0, shimmerStart)
  let colPos = 0
  let before = ''
  let shim = ''
  let after = ''
  for (const { segment, width } of segments) {
    if (colPos + width <= clampedStart) {
      before += segment
    } else if (colPos > shimmerEnd) {
      after += segment
    } else {
      shim += segment
    }
    colPos += width
  }

  return (
    <>
      {before && <Text color={messageColor}>{before}</Text>}
      <Text color={shimmerColor}>{shim}</Text>
      {after && <Text color={messageColor}>{after}</Text>}
      <Text color={messageColor}> </Text>
    </>
  )
}
