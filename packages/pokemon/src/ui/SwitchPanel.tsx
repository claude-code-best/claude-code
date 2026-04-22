import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { Creature } from '../types'
import { getCreatureName } from '../core/creature'

const CYAN = 'ansi:cyan'
const GRAY = 'ansi:white'
const WHITE = 'ansi:whiteBright'

interface SwitchPanelProps {
  party: Creature[]
  activeId: string
  onSelect: (creatureId: string) => void
  onCancel: () => void
}

export function SwitchPanel({ party, activeId, onSelect, onCancel }: SwitchPanelProps) {
  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text bold color={CYAN}> 换人 </Text>
      {party.map((creature, i) => {
        const isActive = creature.id === activeId
        return (
          <Box key={creature.id}>
            <Text>{isActive ? '  ▶ ' : '  '}</Text>
            <Text color={isActive ? GRAY : WHITE}>
              [{i + 1}] {getCreatureName(creature)} (Lv.{creature.level}){' '}
            </Text>
            {isActive && <Text color={GRAY}> 当前场上</Text>}
          </Box>
        )
      })}
      <Box marginTop={1}>
        <Text color={GRAY}>  [ESC] 取消</Text>
      </Box>
    </Box>
  )
}
