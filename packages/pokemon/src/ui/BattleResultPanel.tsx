import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { BattleResult, BattlePokemon } from '../battle/types'

const GREEN = 'ansi:green'
const RED = 'ansi:red'
const YELLOW = 'ansi:yellow'
const CYAN = 'ansi:cyan'
const WHITE = 'ansi:whiteBright'

interface BattleResultPanelProps {
  result: BattleResult
  playerPokemon: BattlePokemon
  onContinue: () => void
}

export function BattleResultPanel({ result, playerPokemon, onContinue }: BattleResultPanelProps) {
  const isWin = result.winner === 'player'

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Box>
        <Text bold color={isWin ? GREEN : RED}>
          {' '}战斗结束！{isWin ? '胜利！' : '失败...'}
        </Text>
      </Box>

      {isWin && (
        <Box flexDirection="column">
          <Text>  {playerPokemon.name} 获得了 {result.xpGained} 经验值！</Text>

          {Object.keys(result.evGained).length > 0 && (
            <Box>
              <Text>  努力值获得: </Text>
              {Object.entries(result.evGained).map(([stat, value]) => (
                <Text key={stat}> {stat.toUpperCase()}+{value} </Text>
              ))}
            </Box>
          )}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={CYAN}>  [Enter] 继续</Text>
      </Box>
    </Box>
  )
}
