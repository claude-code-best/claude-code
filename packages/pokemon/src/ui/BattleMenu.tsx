import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { MoveOption } from '../battle/types'

export interface BattleMenuProps {
  phase: 'main' | 'fight'
  moves: MoveOption[]
  cursorIndex: number
  onMoveCursor: (direction: 'up' | 'down' | 'left' | 'right') => void
  onSelect: () => void
  onBack: () => void
}

export function BattleMenu({ phase, moves, cursorIndex }: BattleMenuProps) {
  if (phase === 'fight') {
    return <MoveMenu moves={moves} cursorIndex={cursorIndex} />
  }

  return <MainMenu cursorIndex={cursorIndex} />
}

function MainMenu({ cursorIndex }: { cursorIndex: number }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="success"
      paddingX={1}
    >
      {/* Row 0: 战斗 + 背包 */}
      <Box>
        <MenuItem label="战斗" selected={cursorIndex === 0} />
        <MenuItem label="背包" selected={cursorIndex === 1} />
      </Box>
      {/* Row 1: 宝可梦 + 逃跑 */}
      <Box>
        <MenuItem label="宝可梦" selected={cursorIndex === 2} />
        <MenuItem label="逃跑" selected={cursorIndex === 3} disabled />
      </Box>
    </Box>
  )
}

function MenuItem({ label, selected, disabled }: { label: string; selected: boolean; disabled?: boolean }) {
  if (selected && disabled) {
    return (
      <Box width={16}>
        <Text color="warning" bold>
          {' ▶ '}{label} (不可用)
        </Text>
      </Box>
    )
  }

  if (selected) {
    return (
      <Box width={16}>
        <Text color="success" bold>
          {' ▶ '}{label}
        </Text>
      </Box>
    )
  }

  if (disabled) {
    return (
      <Box width={16}>
        <Text dimColor>
          {'   '}{label}
        </Text>
      </Box>
    )
  }

  return (
    <Box width={16}>
      <Text>
        {'   '}{label}
      </Text>
    </Box>
  )
}

function MoveMenu({ moves, cursorIndex }: { moves: MoveOption[]; cursorIndex: number }) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="success"
      borderText={{ content: ' 选择招式 ', position: 'top', align: 'start' }}
      paddingX={1}
    >
      {moves.map((move, i) => (
        <MoveItem key={move.id || i} move={move} selected={cursorIndex === i} />
      ))}
    </Box>
  )
}

function MoveItem({ move, selected }: { move: MoveOption; selected: boolean }) {
  const ppText = `PP ${move.pp}/${move.maxPp}`
  const noPP = move.pp <= 0 || move.disabled

  if (selected) {
    return (
      <Box width={32}>
        <Text color="success" bold>
          {' ▶ '}{move.name.padEnd(14)}{ppText}
        </Text>
      </Box>
    )
  }

  return (
    <Box width={32}>
      <Text color={noPP ? ('inactive' as any) : undefined} dimColor={noPP}>
        {'   '}{move.name.padEnd(14)}{ppText}
      </Text>
      {move.disabled && <Text color="error"> 禁用</Text>}
    </Box>
  )
}
