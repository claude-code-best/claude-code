import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { BattleEvent } from '../battle/types'

/** Max lines to display in the log panel */
const MAX_VISIBLE = 20

function eventColor(event: BattleEvent): string {
  switch (event.type) {
    case 'damage': return 'error'
    case 'heal': return 'success'
    case 'faint': return 'error'
    case 'crit': return 'warning'
    case 'miss': return 'inactive'
    case 'effectiveness': return event.multiplier > 1 ? 'success' : 'warning'
    case 'move': return 'claude'
    case 'status': return 'warning'
    case 'switch': return 'claude'
    case 'turn': return 'inactive'
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
    case 'switch': return `${event.side === 'player' ? '我方' : '对手'}换上了 ${event.name}!`
    case 'turn': return `── 回合 ${event.number} ──`
    case 'statChange': {
      const sign = event.stages > 0 ? '↑' : '↓'
      return `${event.side === 'player' ? '我方' : '对手'}的 ${event.stat} ${sign}${Math.abs(event.stages)}`
    }
    case 'ability': return `${event.side === 'player' ? '我方' : '对手'}的特性 ${event.ability} 发动了!`
    case 'item': return `${event.side === 'player' ? '我方' : '对手'}使用了 ${event.item}!`
    case 'fail': return `失败了: ${event.reason}`
    default: return ''
  }
}

interface BattleLogPanelProps {
  events: BattleEvent[]
  animEnabled: boolean
  onToggleAnim: () => void
}

export function BattleLogPanel({ events, animEnabled, onToggleAnim }: BattleLogPanelProps) {
  const visible = events.slice(-MAX_VISIBLE)

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="success"
      borderText={{ content: ' 战斗日志 ', position: 'top', align: 'start' }}
      paddingX={1}
      paddingY={0}
      width="40%"
    >
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((event, i) => (
          <Text key={i} color={eventColor(event) as any} dimColor={event.type === 'turn'}>
            {' '}{formatEvent(event)}
          </Text>
        ))}
        {visible.length === 0 && (
          <Text dimColor> 等待战斗开始...</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor> [F] {animEnabled ? '关闭动画' : '开启动画'}</Text>
      </Box>
    </Box>
  )
}
