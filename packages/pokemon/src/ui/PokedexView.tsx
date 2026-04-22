import React from 'react'
import { Box, Text, type Color } from '@anthropic/ink'
import type { BuddyData, SpeciesId } from '../types'
import { ALL_SPECIES_IDS } from '../types'
import { getSpeciesData } from '../dex/species'

const CYAN: Color = 'ansi:cyan'
const GREEN: Color = 'ansi:green'
const GRAY: Color = 'ansi:white'
const YELLOW: Color = 'ansi:yellow'
const WHITE: Color = 'ansi:whiteBright'

const BAR_WIDTH = 30

/** Gen ranges for stats */
const GEN_RANGES = [
  { label: 'Gen I',   start: 1,   end: 151 },
  { label: 'Gen II',  start: 152, end: 251 },
  { label: 'Gen III', start: 252, end: 386 },
  { label: 'Gen IV',  start: 387, end: 493 },
  { label: 'Gen V',   start: 494, end: 649 },
  { label: 'Gen VI',  start: 650, end: 721 },
  { label: 'Gen VII', start: 722, end: 809 },
  { label: 'Gen VIII',start: 810, end: 905 },
  { label: 'Gen IX',  start: 906, end: 1025 },
]

interface PokedexViewProps {
  buddyData: BuddyData
}

/**
 * Pokédex view — shows collection progress, per-gen stats,
 * and discovered species list.
 */
export function PokedexView({ buddyData }: PokedexViewProps) {
  const dexMap = new Map(buddyData.dex.map((d) => [d.speciesId, d]))
  const collected = buddyData.dex.length
  const total = ALL_SPECIES_IDS.length
  const percent = total > 0 ? collected / total : 0

  // Build dex number set for quick lookup
  const collectedNums = new Set<number>()
  for (const entry of buddyData.dex) {
    const data = getSpeciesData(entry.speciesId)
    collectedNums.add(data.dexNumber)
  }

  // Per-gen stats
  const genStats = GEN_RANGES.map(g => {
    const genTotal = ALL_SPECIES_IDS.filter(id => {
      const n = getSpeciesData(id).dexNumber
      return n >= g.start && n <= g.end
    }).length
    const genCollected = [...collectedNums].filter(n => n >= g.start && n <= g.end).length
    return { ...g, total: genTotal, collected: genCollected }
  })

  // Discovered species (for compact display)
  const discovered = buddyData.dex
    .map(entry => {
      const species = getSpeciesData(entry.speciesId)
      return { entry, species }
    })
    .sort((a, b) => a.species.dexNumber - b.species.dexNumber)

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      {/* Header with percentage */}
      <Box justifyContent="space-between">
        <Text bold color={CYAN}>Pokédex</Text>
        <Text>
          <Text bold color={collected === total ? GREEN : WHITE}>{collected}</Text>
          <Text color={GRAY}>/{total} </Text>
          <Text bold color={GREEN}>{(percent * 100).toFixed(1)}%</Text>
        </Text>
      </Box>

      {/* Fixed-width progress bar */}
      <Box>
        <Text color={GREEN}>{'█'.repeat(Math.round(percent * BAR_WIDTH))}</Text>
        <Text color={GRAY}>{'░'.repeat(BAR_WIDTH - Math.round(percent * BAR_WIDTH))}</Text>
        <Text> {Math.floor(percent * 100)}%</Text>
      </Box>

      {/* Per-gen stats */}
      <Box flexDirection="column" marginTop={0}>
        <Text color={GRAY}>─── 分代统计 ───</Text>
        {genStats.map(g => {
          const p = g.total > 0 ? g.collected / g.total : 0
          const miniBar = '█'.repeat(Math.round(p * 10)) + '░'.repeat(10 - Math.round(p * 10))
          return (
            <Box key={g.label}>
              <Text color={GRAY}>{g.label.padEnd(8)}</Text>
              <Text color={p >= 1 ? GREEN : p > 0 ? YELLOW : GRAY}>{miniBar}</Text>
              <Text> <Text bold>{g.collected}</Text><Text color={GRAY}>/{g.total}</Text></Text>
            </Box>
          )
        })}
      </Box>

      {/* Discovered species list */}
      {discovered.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Text color={GRAY}>─── 已发现 ({discovered.length}) ───</Text>
          {discovered.map(({ entry, species }) => {
            const isActive = buddyData.party[0]
              ? buddyData.creatures.some(c => c.id === buddyData.party[0] && c.speciesId === species.id)
              : false
            return (
              <Box key={species.id}>
                <Text>{isActive ? <Text color={YELLOW}>▶</Text> : ' '}</Text>
                <Text color={GRAY}>#{String(species.dexNumber).padStart(3, '0')} </Text>
                <Text color={WHITE} bold={isActive}>
                  {(species.names as Record<string, string>).zh ?? species.name}
                </Text>
                <Text>
                  {' '}
                  {species.types.filter((t): t is string => Boolean(t)).map((t, ti) => (
                    <Text key={t} color={getTypeColor(t)}>
                      {ti > 0 ? '/' : ''}{t.slice(0, 3).toUpperCase()}
                    </Text>
                  ))}
                </Text>
                <Text color={GREEN}> Lv.{entry.bestLevel}</Text>
                {entry.caughtCount > 1 && (
                  <Text color={GRAY}> x{entry.caughtCount}</Text>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      {discovered.length === 0 && (
        <Box marginTop={0}>
          <Text dimColor> 还没有发现任何精灵，开始冒险吧！</Text>
        </Box>
      )}

      {/* Stats row */}
      <Box marginTop={0} flexDirection="column">
        <Text color={GRAY}>─── Stats ───</Text>
        <Box>
          <Text color={GRAY}>Turns: </Text>
          <Text>{buddyData.stats.totalTurns}</Text>
          <Text color={GRAY}>  Days: </Text>
          <Text>{buddyData.stats.consecutiveDays}</Text>
        </Box>
        <Box>
          <Text color={GRAY}>Eggs: </Text>
          <Text>{buddyData.stats.totalEggsObtained}</Text>
          <Text color={GRAY}>  Evolutions: </Text>
          <Text>{buddyData.stats.totalEvolutions}</Text>
        </Box>
      </Box>

      {/* Egg info */}
      {buddyData.eggs.length > 0 && (
        <Box marginTop={0}>
          <Text color={YELLOW}>🥚 Egg: </Text>
          <Text>{buddyData.eggs[0].stepsRemaining}/{buddyData.eggs[0].totalSteps}</Text>
          <Text color={GRAY}> steps</Text>
        </Box>
      )}

      {buddyData.stats.consecutiveDays < 7 && (
        <Box>
          <Text color={GRAY}>Next egg: {7 - buddyData.stats.consecutiveDays} more days</Text>
        </Box>
      )}
    </Box>
  )
}

/** Type → color mapping */
function getTypeColor(type: string): Color {
  const colors: Record<string, Color> = {
    grass: 'ansi:green',
    poison: 'ansi:magenta',
    fire: 'ansi:red',
    flying: 'ansi:cyan',
    water: 'ansi:blue',
    electric: 'ansi:yellow',
    normal: 'ansi:white',
  }
  return colors[type] ?? 'ansi:white'
}
