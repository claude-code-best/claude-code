import React from 'react'
import { Box, Text, type Color } from '@anthropic/ink'
import type { SpeciesId, StatName } from '../types'
import { STAT_NAMES, STAT_LABELS, ALL_SPECIES_IDS } from '../types'
import { getSpeciesData } from '../dex/species'
import { getNextEvolution } from '../dex/evolution'
import { StatBar } from './StatBar'
import { getStatColor } from './shared'

const CYAN: Color = 'ansi:cyan'
const GRAY: Color = 'ansi:white'
const WHITE: Color = 'ansi:whiteBright'
const YELLOW: Color = 'ansi:yellow'
const GREEN: Color = 'ansi:green'
const RED: Color = 'ansi:red'
const BLUE: Color = 'ansi:blue'

/** Type → color */
const TYPE_COLORS: Record<string, Color> = {
  grass: 'ansi:green', poison: 'ansi:magenta', fire: 'ansi:red',
  flying: 'ansi:cyan', water: 'ansi:blue', electric: 'ansi:yellow',
  normal: 'ansi:white',
}

interface SpeciesDetailProps {
  speciesId: SpeciesId
  caughtLevel?: number
  spriteLines?: string[]
}

/**
 * Detailed species info page — base stats, evolution chain, flavor text.
 */
export function SpeciesDetail({ speciesId, caughtLevel, spriteLines }: SpeciesDetailProps) {
  const species = getSpeciesData(speciesId)
  const nextEvo = getNextEvolution(speciesId)

  // Type badges
  const typeBadges = species.types.filter((t): t is string => Boolean(t)).map((t, i) => (
    <Text key={t} color={TYPE_COLORS[t] ?? GRAY}>
      {i > 0 ? ' / ' : ''}{t.toUpperCase()}
    </Text>
  ))

  // Gender info
  const genderInfo = species.genderRate === -1
    ? 'Genderless'
    : species.genderRate === 0
      ? '♂ 100%'
      : species.genderRate === 8
        ? '♀ 100%'
        : `♀ ${(species.genderRate / 8 * 100).toFixed(1)}%`

  // Max base stat for bar scaling
  const maxBase = 130

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      {/* Header */}
      <Box justifyContent="space-between">
        <Box>
          <Text bold color={CYAN}>#{String(species.dexNumber).padStart(3, '0')} {species.names.zh ?? species.name}</Text>
        </Box>
        {caughtLevel && <Text color={GREEN}>Best: Lv.{caughtLevel}</Text>}
      </Box>

      {/* Type + gender */}
      <Box>
        {typeBadges}
        <Text color={GRAY}>  {genderInfo}</Text>
      </Box>

      {/* Sprite */}
      {spriteLines && (
        <Box flexDirection="column" alignItems="center" marginY={0}>
          {spriteLines.map((line, i) => <Text key={i}>{line}</Text>)}
        </Box>
      )}

      {/* Flavor text */}
      {species.flavorText && (
        <Box marginTop={0}>
          <Text color={GRAY} italic>{species.flavorText}</Text>
        </Box>
      )}

      {/* Base Stats */}
      <Box flexDirection="column" marginTop={0}>
        <Text color={GRAY}>─── Base Stats ───</Text>
        {STAT_NAMES.map((stat) => (
          <Box key={stat}>
            <Text color={WHITE}>{STAT_LABELS[stat].padEnd(3)}</Text>
            <Text color={getStatColor(stat)}>
              {'█'.repeat(Math.round((species.baseStats[stat] / maxBase) * 15))}
              {'░'.repeat(15 - Math.round((species.baseStats[stat] / maxBase) * 15))}
            </Text>
            <Text> {String(species.baseStats[stat]).padStart(3)}</Text>
          </Box>
        ))}
        {/* Total */}
        <Box>
          <Text color={WHITE}>{'Total'.padEnd(3)}</Text>
          <Text color={GRAY}>
            {'─'.repeat(15)}
          </Text>
          <Text bold> {Object.values(species.baseStats).reduce((a, b) => a + b, 0)}</Text>
        </Box>
      </Box>

      {/* Evolution chain */}
      {(nextEvo || species.dexNumber > 1) && (
        <Box flexDirection="column" marginTop={0}>
          <Text color={GRAY}>─── Evolution ───</Text>
          <EvolutionChain speciesId={speciesId} />
        </Box>
      )}

      {/* Info */}
      <Box flexDirection="column" marginTop={0}>
        <Text color={GRAY}>─── Info ───</Text>
        <Box>
          <Text color={GRAY}>Growth: </Text>
          <Text>{species.growthRate}</Text>
        </Box>
        <Box>
          <Text color={GRAY}>Capture: </Text>
          <Text>{species.captureRate}</Text>
          <Text color={GRAY}>  Happiness: </Text>
          <Text>{species.baseHappiness}</Text>
        </Box>
      </Box>
    </Box>
  )
}

/** Render evolution chain arrow */
function EvolutionChain({ speciesId }: { speciesId: SpeciesId }) {
  // Walk back to find chain head
  let head: SpeciesId = speciesId
  for (const candidate of ALL_SPECIES_IDS) {
    const evo = getNextEvolution(candidate)
    if (evo?.to === head) {
      head = candidate
      break
    }
  }

  const chain: SpeciesId[] = [head]
  let current: SpeciesId | undefined = head
  while (current) {
    const next = getNextEvolution(current)
    if (next) {
      chain.push(next.to)
      current = next.to
    } else {
      current = undefined
    }
  }

  return (
    <Box>
      {chain.map((sid, i) => (
        <React.Fragment key={sid}>
          {i > 0 && <Text color={GRAY}> → </Text>}
          <Text color={sid === speciesId ? CYAN : GRAY} bold={sid === speciesId}>
            {getSpeciesData(sid).names.zh ?? getSpeciesData(sid).name}
          </Text>
          {i < chain.length - 1 && getNextEvolution(sid) && (
            <Text color={GRAY}> Lv.{getNextEvolution(sid)!.minLevel}</Text>
          )}
        </React.Fragment>
      ))}
    </Box>
  )
}

