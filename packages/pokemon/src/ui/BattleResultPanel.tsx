import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { BattleResult } from '../battle/types'

interface BattleResultPanelProps {
  result: BattleResult
  onContinue: () => void
}

export function BattleResultPanel({ result, onContinue }: BattleResultPanelProps) {
  const isWin = result.winner === 'player'

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isWin ? 'success' : 'error'}
      borderText={{ content: isWin ? ' 胜利 ' : ' 战败 ', position: 'top', align: 'center' }}
      paddingX={2}
      paddingY={1}
    >
      <Text bold color={isWin ? 'success' : 'error'}>
        {isWin ? '战斗胜利！' : '战斗失败...'}
      </Text>

      <Box marginTop={1}>
        <Text color="claude">[Enter] 继续</Text>
      </Box>
    </Box>
  )
}
