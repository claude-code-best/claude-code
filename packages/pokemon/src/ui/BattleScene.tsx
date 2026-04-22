import React, { useMemo } from 'react'
import { Box, Text } from '@anthropic/ink'
import type { BattleState } from '../battle/types'
import type { SpeciesId } from '../types'
import { loadSprite } from '../core/spriteCache'
import { getFallbackSprite } from '../sprites/fallback'
import { HpCard } from './HpCard'
import { BattleMenu } from './BattleMenu'
import { BattleLogPanel } from './BattleLogPanel'
import { BattleSprite } from './BattleSprite'
import type { StatusCondition } from '../battle/types'

export type MenuPhase = 'main' | 'fight' | 'bag' | 'pokemon'

/** Get sprite lines: try cache → fallback */
function getSpriteLines(speciesId: SpeciesId): string[] {
  const cached = loadSprite(speciesId)
  if (cached) return cached.lines
  return getFallbackSprite(speciesId)
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

  // Load sprite lines (memoized by speciesId)
  const oppSpriteLines = useMemo(() => getSpriteLines(opp.speciesId as SpeciesId), [opp.speciesId])
  const playerSpriteLines = useMemo(() => getSpriteLines(player.speciesId as SpeciesId), [player.speciesId])

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
        borderText={{ content: ` 回合 ${state.turn} `, position: 'top', align: 'center' }}
        paddingX={1}
        paddingY={0}
        width="60%"
      >
        {overlay ? (
          overlay
        ) : (
          <>
            {/* Opponent: HP card left, sprite right */}
            <Box flexDirection="row" justifyContent="space-between">
              <HpCard
                name={opp.name}
                level={opp.level}
                hp={opp.hp}
                maxHp={opp.maxHp}
                status={opp.status as StatusCondition}
                align="left"
                isOpponent
              />
              <BattleSprite
                lines={oppSpriteLines}
                animEnabled={animEnabled}
              />
            </Box>

            {/* Player: sprite left, HP card right — no spacer, visually close */}
            <Box flexDirection="row" justifyContent="space-between" alignItems="flex-end">
              <BattleSprite
                lines={playerSpriteLines}
                flip
                phaseOffset={2}
                animEnabled={animEnabled}
              />
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
