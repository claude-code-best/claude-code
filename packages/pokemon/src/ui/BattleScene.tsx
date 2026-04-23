import React, { useState, useEffect } from 'react'
import { Box, Text } from '@anthropic/ink'
import type { BattleState, WeatherKind } from '../battle/types'
import type { SpeciesId } from '../types'
import { loadSprite, fetchAndCacheSprite } from '../core/spriteCache'
import { getFallbackSprite } from '../sprites/fallback'
import { HpCard } from './HpCard'
import { BattleMenu } from './BattleMenu'
import { BattleLogPanel } from './BattleLogPanel'
import { BattleSprite } from './BattleSprite'
import type { StatusCondition } from '../battle/types'

export type MenuPhase = 'main' | 'fight' | 'bag' | 'pokemon'

/** Hook: get sprite lines with async fetch fallback */
function useSpriteLines(speciesId: SpeciesId): string[] {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (loadSprite(speciesId)) return
    fetchAndCacheSprite(speciesId).then(s => { if (s) setTick(t => t + 1) })
  }, [speciesId])
  void tick
  const cached = loadSprite(speciesId)
  return cached?.lines ?? getFallbackSprite(speciesId)
}

interface BattleSceneProps {
  state: BattleState
  menuPhase: MenuPhase
  cursorIndex: number
  animEnabled: boolean
  /** Override content for right panel (bag/pokemon overlay) */
  overlay?: React.ReactNode
  onMoveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void
  onSelect: () => void
  onBack: () => void
  onToggleAnim: () => void
}

const WEATHER_LABELS: Record<WeatherKind, string> = {
  sun: '☀ 大晴天', rain: '🌧 雨天', sandstorm: '🌪 沙暴', hail: '❄ 冰雹',
  snow: '🌨 下雪', desolateland: '☀ 大日照', primordialsea: '🌧 大雨', deltastream: '🌀 强气流',
}

export function BattleScene({
  state,
  menuPhase,
  cursorIndex,
  animEnabled,
  overlay,
  onMoveCursor,
  onSelect,
  onBack,
  onToggleAnim,
}: BattleSceneProps) {
  const opp = state.opponentPokemon
  const player = state.playerPokemon

  // Load sprite lines (with async fetch for uncached species)
  const oppSpriteLines = useSpriteLines(opp.speciesId as SpeciesId)
  const playerSpriteLines = useSpriteLines(player.speciesId as SpeciesId)

  return (
    <Box flexDirection="row" width="100%">
      {/* Left: Battle Log (40%) */}
      <BattleLogPanel
        events={state.events}
        animEnabled={animEnabled}
        onToggleAnim={onToggleAnim}
      />

      {/* Right: Battle Field (60%) */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="success"
        borderText={{ content: state.weather ? ` ${WEATHER_LABELS[state.weather]} · 回合 ${state.turn} ` : ` 回合 ${state.turn} `, position: 'top', align: 'center' }}
        paddingX={1}
        paddingY={0}
        width="60%"
      >
        {overlay ? (
          overlay
        ) : (
          <>
            {/* Opponent info */}
            <Box flexDirection="row" justifyContent="flex-start">
              <HpCard
                name={opp.name}
                level={opp.level}
                hp={opp.hp}
                maxHp={opp.maxHp}
                status={opp.status as StatusCondition}
                align="left"
                isOpponent
              />
            </Box>

            {/*
              Keep the overlapping sprites inside a fixed-height battlefield with absolute positioning.
              Do NOT switch this back to negative margins or normal-flow overlap: Ink/Yoga reflow can leave
              visual ghosting above the player sprite during animation when overlap affects outer layout.
            */}
            {/* Overlapped battlefield: fixed-height container so overlap won't disturb outer layout */}
            <Box height={18} marginTop={1} marginBottom={1} overflow="hidden">
              <Box position="absolute" top={0} right={0}>
                <BattleSprite
                  lines={oppSpriteLines}
                  animEnabled={animEnabled}
                />
              </Box>
              <Box position="absolute" bottom={0} left={0}>
                <BattleSprite
                  lines={playerSpriteLines}
                  flip
                  phaseOffset={2}
                  animEnabled={animEnabled}
                />
              </Box>
            </Box>

            {/* Player info */}
            <Box flexDirection="row" justifyContent="flex-end">
              <HpCard
                name={player.name}
                level={player.level}
                hp={player.hp}
                maxHp={player.maxHp}
                status={player.status as StatusCondition}
                align="right"
              />
            </Box>

            {/* Menu */}
            {!state.finished && (
              <BattleMenu
                phase={menuPhase as 'main' | 'fight'}
                moves={player.moves}
                cursorIndex={cursorIndex}
                onMoveCursor={onMoveCursor}
                onSelect={onSelect}
                onBack={onBack}
              />
            )}

            {state.finished && (
              <Box marginTop={1}>
                <Text dimColor> 战斗结束</Text>
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  )
}
