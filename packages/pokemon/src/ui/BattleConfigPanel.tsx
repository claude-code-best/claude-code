import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { Creature, SpeciesId } from '../types'
import { ALL_SPECIES_IDS } from '../types'
import { getSpeciesData } from '../dex/species'
import { calculateStats, getCreatureName } from '../core/creature'

const CYAN = 'ansi:cyan'
const GREEN = 'ansi:green'
const GRAY = 'ansi:white'
const YELLOW = 'ansi:yellow'

interface BattleConfigPanelProps {
  party: (Creature | null)[]
  onSubmit: (opponentSpeciesId: SpeciesId, opponentLevel: number) => void
  onCancel: () => void
}

export function BattleConfigPanel({ party, onSubmit, onCancel }: BattleConfigPanelProps) {
  const activeCreature = party[0]

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold color={CYAN}> 战斗配置 </Text>

      {/* Party display */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>队伍:</Text>
        {party.map((creature, i) => {
          if (!creature) return (
            <Box key={i}>
              <Text color={GRAY}>  [{i + 1}] [空]</Text>
            </Box>
          )
          const species = getSpeciesData(creature.speciesId)
          const stats = calculateStats(creature)
          const hpPercent = 100
          const hpBar = '█'.repeat(Math.floor(hpPercent / 10))
          const hpEmpty = '░'.repeat(10 - Math.floor(hpPercent / 10))
          const isLead = i === 0
          return (
            <Box key={creature.id}>
              <Text>{isLead ? ' ▶ ' : '   '}</Text>
              <Text bold={isLead}>{getCreatureName(creature)}</Text>
              <Text> Lv.{creature.level} </Text>
              <Text color={GREEN}>{hpBar}</Text>
              <Text color={GRAY}>{hpEmpty}</Text>
              <Text> {hpPercent}%</Text>
            </Box>
          )
        })}
      </Box>

      {/* Opponent selection */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>对手:</Text>
        <Text color={YELLOW}>  [1] 随机遇战（等级自动匹配）</Text>
        <Text color={GRAY}>  [2] 指定对手（输入物种名）</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={GRAY}>[Enter] 开始战斗  [ESC] 取消</Text>
      </Box>
    </Box>
  )
}
