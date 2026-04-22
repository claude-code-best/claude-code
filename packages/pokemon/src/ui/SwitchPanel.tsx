import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { Creature } from '../types'
import { getCreatureName } from '../core/creature'

interface SwitchPanelProps {
  party: Creature[]
  activeId: string
  cursorIndex: number
  /** HP values from battle state (keyed by creature id) */
  battleHp?: Record<string, { hp: number; maxHp: number }>
  onSelect: (creatureId: string, partyIndex: number) => void
  onCancel: () => void
}

function hpBarSmall(current: number, max: number): string {
  if (max <= 0) return '░░░░░░'
  const filled = Math.round((current / max) * 6)
  return '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, 6 - filled))
}

function hpColorStr(pct: number): string {
  if (pct > 50) return 'success'
  if (pct > 25) return 'warning'
  return 'error'
}

export function SwitchPanel({ party, activeId, cursorIndex, battleHp, onCancel }: SwitchPanelProps) {
  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="success"
        borderText={{ content: ' 换人 ', position: 'top', align: 'start' }}
        paddingX={1}
      >
        {party.map((creature, i) => {
          const isActive = creature.id === activeId
          const hpData = battleHp?.[creature.id]
          const hp = hpData?.hp ?? 0
          const maxHp = hpData?.maxHp ?? 1
          const hpPct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0
          const isFainted = hpData ? hp <= 0 : false

          return (
            <Box key={creature.id}>
              {cursorIndex === i ? (
                <Text color="success" bold>
                  {' ▸ '}{getCreatureName(creature)}{' Lv.'}{creature.level}{' '}
                </Text>
              ) : isActive ? (
                <Text dimColor>
                  {'   '}{getCreatureName(creature)}{' Lv.'}{creature.level}{' (场上) '}
                </Text>
              ) : isFainted ? (
                <Text dimColor>
                  {'   '}{getCreatureName(creature)}{' Lv.'}{creature.level}{' (倒下) '}
                </Text>
              ) : (
                <Text>
                  {'   '}{getCreatureName(creature)}{' Lv.'}{creature.level}{' '}
                </Text>
              )}

              {hpData && (
                <Text color={hpColorStr(hpPct) as any}>
                  {hpBarSmall(hp, maxHp)} {hp}/{maxHp}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor> [ESC] 返回</Text>
      </Box>
    </Box>
  )
}
