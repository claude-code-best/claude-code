import { feature } from 'bun:bundle'
import * as React from 'react'
import { useSettings } from '../../hooks/useSettings.js'
import { Box, Text, useAnimationFrame } from '../../ink.js'
import { interpolateColor, toRGBColor } from '../Spinner/utils.js'

type Props = {
  voiceState: 'idle' | 'recording' | 'processing'
}

// Processing shimmer colors: dim gray to lighter gray (matches ThinkingShimmerText)
const PROCESSING_DIM = { r: 153, g: 153, b: 153 }
const PROCESSING_BRIGHT = { r: 185, g: 185, b: 185 }

const PULSE_PERIOD_S = 2 // 2 second period for all pulsing animations

export function VoiceIndicator(props: Props): React.ReactNode {
  if (!feature('VOICE_MODE')) return null
  return <VoiceIndicatorImpl {...props} />
}

function VoiceIndicatorImpl({ voiceState }: Props): React.ReactNode {
  switch (voiceState) {
    case 'recording':
      return <Text dimColor>listening…</Text>
    case 'processing':
      return <ProcessingShimmer />
    case 'idle':
      return null
  }
}

// Static — the warmup window (~120ms between space #2 and activation)
// is too brief for a 1s-period shimmer to register, and a 50ms animation
// timer here runs concurrently with auto-repeat spaces arriving every
// 30-80ms, compounding re-renders during an already-busy window.
export function VoiceWarmupHint(): React.ReactNode {
  if (!feature('VOICE_MODE')) return null
  return <Text dimColor>keep holding…</Text>
}

function ProcessingShimmer(): React.ReactNode {
  const settings = useSettings()
  const reducedMotion = settings.prefersReducedMotion ?? false
  const [ref, time] = useAnimationFrame(reducedMotion ? null : 50)

  if (reducedMotion) {
    return <Text color="warning">Voice: processing…</Text>
  }

  const elapsedSec = time / 1000
  const opacity =
    (Math.sin((elapsedSec * Math.PI * 2) / PULSE_PERIOD_S) + 1) / 2
  const color = toRGBColor(
    interpolateColor(PROCESSING_DIM, PROCESSING_BRIGHT, opacity),
  )

  return (
    <Box ref={ref}>
      <Text color={color}>Voice: processing…</Text>
    </Box>
  )
}
