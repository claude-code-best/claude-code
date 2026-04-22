import React, { useState, useEffect } from 'react'
import { Box, Text, type Color } from '@anthropic/ink'
import type { SpeciesId } from '../types'
import { getSpeciesData } from '../dex/species'
import { loadSprite } from '../core/spriteCache'
import { getFallbackSprite } from '../sprites/fallback'

const YELLOW: Color = 'ansi:yellow'
const GREEN: Color = 'ansi:green'
const GRAY: Color = 'ansi:white'

interface EvolutionAnimProps {
  fromSpecies: SpeciesId
  toSpecies: SpeciesId
  onComplete: () => void
}

/**
 * Evolution animation component.
 * Displays a flashing/morphing effect from old species to new species.
 * 8 frames × 500ms = ~4 seconds total.
 */
export function EvolutionAnim({ fromSpecies, toSpecies, onComplete }: EvolutionAnimProps) {
  const [tick, setTick] = useState(0)
  const totalFrames = 8

  useEffect(() => {
    if (tick >= totalFrames) {
      onComplete()
      return
    }
    const timer = setTimeout(() => setTick((t) => t + 1), 500)
    return () => clearTimeout(timer)
  }, [tick, onComplete])

  const fromSprite = getSpriteLines(fromSpecies)
  const toSprite = getSpriteLines(toSpecies)
  const fromName = getSpeciesData(fromSpecies).name
  const toName = getSpeciesData(toSpecies).name

  // Frame logic:
  // 0-3: old sprite with flash (alternate blank)
  // 4-7: alternate old/new, settle on new
  let displayLines: string[]
  if (tick < 3) {
    displayLines = tick % 2 === 0 ? fromSprite : fromSprite.map(() => '')
  } else if (tick < 6) {
    displayLines = tick % 2 === 0 ? fromSprite : toSprite
  } else {
    displayLines = toSprite
  }

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1} alignItems="center">
      <Text bold color={YELLOW}>
        ✨ Evolution! ✨
      </Text>

      <Box flexDirection="column" alignItems="center" marginY={1}>
        {displayLines.map((line, i) => (
          <Text key={i}>
            {tick >= 6 ? '✨ ' : ''}
            {line}
            {tick >= 6 ? ' ✨' : ''}
          </Text>
        ))}
      </Box>

      <Text>
        <Text color={GRAY}>{fromName}</Text>
        <Text color={YELLOW}> → </Text>
        <Text bold color={GREEN}>
          {toName}
        </Text>
      </Text>

      {tick >= totalFrames - 1 && (
        <Text bold color={GREEN}>
          进化成功！
        </Text>
      )}
    </Box>
  )
}

function getSpriteLines(speciesId: SpeciesId): string[] {
  const cached = loadSprite(speciesId)
  if (cached) return cached.lines
  return getFallbackSprite(speciesId)
}
