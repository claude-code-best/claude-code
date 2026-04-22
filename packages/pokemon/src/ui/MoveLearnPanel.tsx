import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { Creature } from '../types'
import { Dex } from '@pkmn/sim'

interface MoveLearnPanelProps {
  creature: Creature
  newMoveId: string
  cursorIndex: number
  onLearn: (replaceIndex: number) => void
  onSkip: () => void
  onSelectReplace: (index: number) => void
}

export function MoveLearnPanel({ creature, newMoveId, cursorIndex, onLearn, onSkip, onSelectReplace }: MoveLearnPanelProps) {
  const dexMove = Dex.moves.get(newMoveId)
  const moveName = dexMove?.name ?? newMoveId
  const moveType = dexMove?.type ?? 'Normal'

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="success"
      borderText={{ content: ' 新招式 ', position: 'top', align: 'center' }}
      paddingX={2}
      paddingY={1}
    >
      <Text>{creature.speciesId} 可以学习: <Text bold color="claude">{moveName}</Text> <Text dimColor>({moveType})</Text></Text>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>当前招式:</Text>
        {creature.moves.map((move, i) => {
          const isSelected = i === cursorIndex
          const moveInfo = move.id ? Dex.moves.get(move.id) : null
          return (
            <Box key={i}>
              {isSelected ? (
                <Text color="success" bold>
                  {' ▶ '}{moveInfo?.name ?? move.id ?? '---'}
                </Text>
              ) : (
                <Text>
                  {'   '}{moveInfo?.name ?? move.id ?? '---'}
                </Text>
              )}
              <Text dimColor> PP {move.pp}/{move.maxPp}</Text>
              {isSelected && <Text color="warning"> {'<-- 替换'}</Text>}
            </Box>
          )
        })}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[↑↓] 选择 · [Enter] 替换 · [S] 跳过</Text>
      </Box>
    </Box>
  )
}
