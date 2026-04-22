import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { StatusCondition } from '../battle/types'

/** HP bar width in characters (GBA style) */
const HP_BAR_WIDTH = 12

function hpColor(pct: number): string {
  if (pct > 50) return 'success'
  if (pct > 25) return 'warning'
  return 'error'
}

function hpBar(current: number, max: number): { bar: string; pct: number } {
  if (max <= 0) return { bar: '░'.repeat(HP_BAR_WIDTH), pct: 0 }
  const pct = Math.round((current / max) * 100)
  const filled = Math.round((current / max) * HP_BAR_WIDTH)
  return {
    bar: '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, HP_BAR_WIDTH - filled)),
    pct,
  }
}

function statusLabel(status: StatusCondition): { text: string; color: string } | null {
  switch (status) {
    case 'poison':
    case 'bad_poison':
      return { text: 'PSN', color: 'warning' }
    case 'burn':
      return { text: 'BRN', color: 'error' }
    case 'paralysis':
      return { text: 'PAR', color: 'warning' }
    case 'freeze':
      return { text: 'FRZ', color: 'claude' }
    case 'sleep':
      return { text: 'SLP', color: 'inactive' }
    default:
      return null
  }
}

interface HpCardProps {
  name: string
  level: number
  hp: number
  maxHp: number
  status?: StatusCondition
  /** Left = opponent (top-left), Right = player (bottom-right) */
  align: 'left' | 'right'
  /** Show as opponent (wild pokemon prefix) */
  isOpponent?: boolean
}

export function HpCard({ name, level, hp, maxHp, status, align, isOpponent }: HpCardProps) {
  const { bar, pct } = hpBar(hp, maxHp)
  const statusInfo = status && status !== 'none' ? statusLabel(status) : null

  const prefix = isOpponent ? '野生的 ' : ''

  const nameLine = (
    <Box justifyContent={align === 'right' ? 'flex-end' : 'flex-start'}>
      {isOpponent && <Text bold> </Text>}
      <Text bold>{prefix}{name}</Text>
      <Text dimColor> Lv.{level}</Text>
      {statusInfo && (
        <Text color={statusInfo.color as any}> {statusInfo.text}</Text>
      )}
    </Box>
  )

  const hpLine = (
    <Box justifyContent={align === 'right' ? 'flex-end' : 'flex-start'}>
      <Text dimColor> HP </Text>
      <Text color={hpColor(pct) as any}>{bar}</Text>
      <Text> {hp}/{maxHp}</Text>
    </Box>
  )

  return (
    <Box flexDirection="column">
      {nameLine}
      {hpLine}
    </Box>
  )
}
