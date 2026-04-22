import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { BattleState, BattleEvent } from '../battle/types'

function hpColor(pct: number): 'success' | 'warning' | 'error' {
  if (pct > 50) return 'success'
  if (pct > 25) return 'warning'
  return 'error'
}

function hpBar(current: number, max: number): { bar: string; pct: number } {
  if (max <= 0) return { bar: '░░░░░░░░░░', pct: 0 }
  const pct = Math.round((current / max) * 100)
  const filled = Math.round((current / max) * 10)
  return {
    bar: '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, 10 - filled)),
    pct,
  }
}

interface BattleViewProps {
  state: BattleState
  onAction: (action: import('../battle/types').PlayerAction) => void
}

export function BattleView({ state, onAction }: BattleViewProps) {
  const opp = state.opponentPokemon
  const player = state.playerPokemon
  const oppHp = hpBar(opp.hp, opp.maxHp)
  const playerHp = hpBar(player.hp, player.maxHp)

  const recentEvents = state.events.slice(-10)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="claude"
      borderText={{ content: ` 回合 ${state.turn} `, position: 'top', align: 'center' }}
      paddingX={2}
      paddingY={1}
    >
      {/* Opponent */}
      <Box flexDirection="column">
        <Box>
          <Text bold> 野生的 </Text>
          <Text bold color="error">{opp.name}</Text>
          <Text dimColor> Lv.{opp.level}</Text>
        </Box>
        <Box>
          <Text dimColor>  HP </Text>
          <Text color={hpColor(oppHp.pct)}>{oppHp.bar}</Text>
          <Text> {opp.hp}/{opp.maxHp}</Text>
          {opp.status !== 'none' && <Text color="warning"> [{opp.status}]</Text>}
        </Box>
      </Box>

      <Text color="inactive">  ─── vs ───</Text>

      {/* Player */}
      <Box flexDirection="column">
        <Box>
          <Text bold>  </Text>
          <Text bold color="claude">{player.name}</Text>
          <Text dimColor> Lv.{player.level}</Text>
        </Box>
        <Box>
          <Text dimColor>  HP </Text>
          <Text color={hpColor(playerHp.pct)}>{playerHp.bar}</Text>
          <Text> {player.hp}/{player.maxHp}</Text>
          {player.status !== 'none' && <Text color="warning"> [{player.status}]</Text>}
        </Box>
      </Box>

      {/* Move selection */}
      {!state.finished && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="claude">选择行动</Text>
          {player.moves.map((move, i) => (
            <Box key={move.id || i}>
              <Text color={move.pp > 0 ? 'text' : 'inactive'}>
                {'  '}[{i + 1}] {move.name || '---'}
              </Text>
              <Text dimColor> PP {move.pp}/{move.maxPp}</Text>
              {move.disabled && <Text color="error"> (禁用)</Text>}
            </Box>
          ))}
          <Text color="claude">  [S] 换人</Text>
          <Text color="claude">  [I] 道具</Text>
        </Box>
      )}

      {/* Event log */}
      {recentEvents.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {recentEvents.map((event, i) => (
            <Text key={i} color={eventColor(event)} dimColor>  {formatEvent(event)}</Text>
          ))}
        </Box>
      )}
    </Box>
  )
}

function eventColor(event: BattleEvent): 'error' | 'success' | 'warning' | 'claude' | 'inactive' | 'text' {
  switch (event.type) {
    case 'damage': return 'error'
    case 'heal': return 'success'
    case 'faint': return 'error'
    case 'crit': return 'warning'
    case 'miss': return 'inactive'
    case 'effectiveness': return event.multiplier > 1 ? 'success' : 'warning'
    default: return 'inactive'
  }
}

function formatEvent(event: BattleEvent): string {
  switch (event.type) {
    case 'move': return `${event.side === 'player' ? '我方' : '对手'}使用了 ${event.move}!`
    case 'damage': return `${event.side === 'player' ? '我方' : '对手'}受到了 ${event.amount} 点伤害 (${event.percentage}%)`
    case 'heal': return `${event.side === 'player' ? '我方' : '对手'}恢复了 ${event.amount} HP`
    case 'faint': return `${event.side === 'player' ? '我方' : '对手'}的 ${event.speciesId} 倒下了!`
    case 'crit': return '击中要害!'
    case 'miss': return '攻击没有命中!'
    case 'effectiveness': return event.multiplier > 1 ? '效果拔群!' : '效果不佳...'
    case 'status': return `${event.side === 'player' ? '我方' : '对手'}陷入了${event.status}状态!`
    case 'turn': return `── 回合 ${event.number} ──`
    default: return ''
  }
}
