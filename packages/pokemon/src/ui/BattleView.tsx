import React from 'react'
import { Box, Text, type Color } from '@anthropic/ink'
import type { BattleState, BattleEvent } from '../battle/types'

const CYAN = 'ansi:cyan'
const GREEN = 'ansi:green'
const YELLOW = 'ansi:yellow'
const RED = 'ansi:red'
const GRAY = 'ansi:white'
const WHITE = 'ansi:whiteBright'

function hpColor(pct: number): Color {
	if (pct > 50) return GREEN
	if (pct > 25) return YELLOW
	return RED
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

	// Show last 5 events
	const recentEvents = state.events.slice(-5)

	return (
		<Box flexDirection="column" borderStyle="round" paddingX={1}>
			{/* Opponent */}
			<Box flexDirection="column">
				<Box>
					<Text bold> 野生 {opp.name} </Text>
					<Text>(Lv.{opp.level})</Text>
				</Box>
				<Box>
					<Text>  HP </Text>
					<Text color={hpColor(oppHp.pct)}>{oppHp.bar}</Text>
					<Text> {oppHp.pct}%</Text>
					{opp.status !== 'none' && <Text color={YELLOW}> [{opp.status}]</Text>}
				</Box>
			</Box>

			<Text color={GRAY}>  ── vs ──</Text>

			{/* Player */}
			<Box flexDirection="column">
				<Box>
					<Text bold>  {player.name} </Text>
					<Text>(Lv.{player.level})</Text>
				</Box>
				<Box>
					<Text>  HP </Text>
					<Text color={hpColor(playerHp.pct)}>{playerHp.bar}</Text>
					<Text> {playerHp.pct}%</Text>
					{player.status !== 'none' && <Text color={YELLOW}> [{player.status}]</Text>}
				</Box>
			</Box>

			{/* Move selection */}
			{!state.finished && (
				<Box flexDirection="column" marginTop={1}>
					<Text bold> 选择行动:</Text>
					{player.moves.map((move, i) => (
						<Box key={move.id || i}>
							<Text color={move.pp > 0 ? WHITE : GRAY}>
								{'  '}[{i + 1}] {move.name || '---'} PP {move.pp}/{move.maxPp}
							</Text>
						</Box>
					))}
					<Text color={CYAN}>  [S] 换人  [I] 道具</Text>
				</Box>
			)}

			{/* Event log */}
			{recentEvents.length > 0 && (
				<Box flexDirection="column" marginTop={1}>
					{recentEvents.map((event, i) => (
						<Text key={i} color={eventColor(event)}>  {formatEvent(event)}</Text>
					))}
				</Box>
			)}
		</Box>
	)
}

function eventColor(event: BattleEvent): Color {
	switch (event.type) {
		case 'damage': return RED
		case 'heal': return GREEN
		case 'faint': return RED
		case 'crit': return YELLOW
		case 'miss': return GRAY
		case 'effectiveness': return event.multiplier > 1 ? GREEN : YELLOW
		default: return WHITE
	}
}

function formatEvent(event: BattleEvent): string {
	switch (event.type) {
		case 'move': return `${event.side === 'player' ? '我方' : '对手'}使用了 ${event.move}!`
		case 'damage': return `${event.side === 'player' ? '我方' : '对手'}受到了 ${event.amount} 点伤害! (${event.percentage}%)`
		case 'heal': return `${event.side === 'player' ? '我方' : '对手'}恢复了 ${event.amount} HP!`
		case 'faint': return `${event.side === 'player' ? '我方' : '对手'}的 ${event.speciesId} 倒下了!`
		case 'crit': return '击中要害!'
		case 'miss': return '攻击没有命中!'
		case 'effectiveness': return event.multiplier > 1 ? '效果拔群!' : '效果不佳...'
		case 'status': return `${event.side === 'player' ? '我方' : '对手'}陷入了${event.status}状态!`
		case 'turn': return `── 回合 ${event.number} ──`
		default: return ''
	}
}
