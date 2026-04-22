import { Box, Text } from '@anthropic/ink'
import type { Creature, SpeciesId } from '../types'
import { getCreatureName } from '../core/creature'

interface BattleConfigPanelProps {
  party: (Creature | null)[]
  cursorIndex: number
  onSubmit: (opponentSpeciesId: SpeciesId, opponentLevel: number) => void
  onCancel: () => void
}

const OPTIONS = [
  { label: '随机遇战（等级自动匹配）', color: 'warning' as const },
  { label: '指定对手', color: 'inactive' as const },
]

export function BattleConfigPanel({ party, cursorIndex }: BattleConfigPanelProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="claude"
      borderText={{ content: ' 战斗配置 ', position: 'top', align: 'center' }}
      paddingX={2}
      paddingY={1}
    >
      {/* Party display */}
      <Text bold color="claude">队伍</Text>
      {party.map((creature, i) => {
        if (!creature) return (
          <Box key={i}>
            <Text dimColor>    [空]</Text>
          </Box>
        )
        const hpPercent = 100
        const hpBar = '█'.repeat(Math.floor(hpPercent / 10))
        const hpEmpty = '░'.repeat(10 - Math.floor(hpPercent / 10))
        const isLead = i === 0
        return (
          <Box key={creature.id}>
            <Text color={isLead ? 'claude' : 'inactive'}>
              {isLead ? ' ▸ ' : '   '}
            </Text>
            <Text bold={isLead}>{getCreatureName(creature)}</Text>
            <Text> Lv.{creature.level} </Text>
            <Text color="success">{hpBar}</Text>
            <Text color="inactive">{hpEmpty}</Text>
            <Text> {hpPercent}%</Text>
          </Box>
        )
      })}

      {/* Options */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold color="claude">选择对手</Text>
        {OPTIONS.map((opt, i) => (
          <Box key={i}>
            <Text color={i === cursorIndex ? 'success' : 'inactive'}>
              {i === cursorIndex ? ' ▶ ' : '   '}
            </Text>
            <Text bold={i === cursorIndex} color={i === cursorIndex ? opt.color : 'inactive'}>
              {opt.label}
            </Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[↑↓] 选择 · [Enter] 确认 · [ESC] 取消</Text>
      </Box>
    </Box>
  )
}
