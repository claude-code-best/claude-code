import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { Creature } from '../types'
import { Dex } from '@pkmn/sim'

const CYAN = 'ansi:cyan'
const YELLOW = 'ansi:yellow'
const GRAY = 'ansi:white'
const WHITE = 'ansi:whiteBright'

interface MoveLearnPanelProps {
  creature: Creature
  newMoveId: string
  replaceIndex: number
  onLearn: (replaceIndex: number) => void
  onSkip: () => void
  onSelectReplace: (index: number) => void
}

export function MoveLearnPanel({ creature, newMoveId, replaceIndex, onLearn, onSkip, onSelectReplace }: MoveLearnPanelProps) {
  const dexMove = Dex.moves.get(newMoveId)
  const moveName = dexMove?.name ?? newMoveId
  const moveType = dexMove?.type ?? 'Normal'

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold color={CYAN}> 新招式！</Text>
      <Text>  {creature.speciesId} 可以学习: <Text bold>{moveName}</Text> ({moveType})</Text>

      <Box marginTop={1}><Text bold> 当前招式:</Text></Box>
      {creature.moves.map((move, i) => {
        const isReplaceTarget = i === replaceIndex
        const moveInfo = move.id ? Dex.moves.get(move.id) : null
        return (
          <Box key={i}>
            <Text color={isReplaceTarget ? YELLOW : WHITE}>
              {'  '}[{i + 1}] {moveInfo?.name ?? move.id ?? '---'} PP {move.pp}/{move.maxPp}
            </Text>
            {isReplaceTarget && <Text color={YELLOW}> ← 替换目标</Text>}
          </Box>
        )
      })}

      <Box marginTop={1}>
        <Text color={GRAY}>  [1-4] 替换对应招式  [S] 跳过</Text>
      </Box>
    </Box>
  )
}
