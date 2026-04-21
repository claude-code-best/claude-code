import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from '@anthropic/ink'
import type { BuddyData, Creature, SpeciesId } from '../types'
import { saveBuddyData } from '../core/storage'
import { createBattle, executeTurn, type BattleInit } from '../battle/engine'
import { settleBattle, applyMoveLearn, applyEvolution } from '../battle/settlement'
import { BattleConfigPanel } from './BattleConfigPanel'
import { BattleView } from './BattleView'
import { SwitchPanel } from './SwitchPanel'
import { ItemPanel } from './ItemPanel'
import { BattleResultPanel } from './BattleResultPanel'
import { MoveLearnPanel } from './MoveLearnPanel'
import type { BattleState, PlayerAction } from '../battle/types'

type Phase =
	| 'config'
	| 'battle'
	| 'switch'
	| 'item'
	| 'result'
	| 'learnMoves'
	| 'evolution'
	| 'done'

interface BattleFlowProps {
	buddyData: BuddyData
	onClose: () => void
}

export function BattleFlow({ buddyData: initialData, onClose }: BattleFlowProps) {
	const [phase, setPhase] = useState<Phase>('config')
	const [buddyData, setBuddyData] = useState(initialData)
	const [battleInit, setBattleInit] = useState<BattleInit | null>(null)
	const [battleState, setBattleState] = useState<BattleState | null>(null)
	const [opponentSpeciesId, setOpponentSpeciesId] = useState<SpeciesId>('pikachu')
	const [opponentLevel, setOpponentLevel] = useState(5)
	const [pendingMoves, setPendingMoves] = useState<{ creatureId: string; moveId: string; moveName: string }[]>([])
	const [pendingEvos, setPendingEvos] = useState<{ creatureId: string; from: SpeciesId; to: SpeciesId }[]>([])
	const [replaceIndex, setReplaceIndex] = useState(0)

	// Evolution phase input — must be at top level (React hooks rule)
	useInput((_input: string, key: { return?: boolean }) => {
		if (phase === 'evolution' && key.return) {
			handleEvolutionConfirm()
		}
	})

	// Config phase: start battle
	const handleStartBattle = useCallback((speciesId: SpeciesId, level: number) => {
		setOpponentSpeciesId(speciesId)
		setOpponentLevel(level)

		const creatures = buddyData.party
			.filter((id): id is string => id !== null)
			.map(id => buddyData.creatures.find(c => c.id === id))
			.filter((c): c is Creature => c !== undefined)

		if (creatures.length === 0) return

		const bagItems = buddyData.bag.items
		const init = createBattle(creatures, speciesId, level, bagItems)
		setBattleInit(init)
		setBattleState(init.state)
		setPhase('battle')
	}, [buddyData])

	// Battle phase: handle action
	const handleAction = useCallback((action: PlayerAction) => {
		if (!battleInit) return
		const state = executeTurn(battleInit, action)
		setBattleState(state)

		if (state.finished && state.result) {
			const participants = buddyData.party.filter((id): id is string => id !== null)
			const result = { ...state.result, participantIds: participants }
			const settled = settleBattle(buddyData, result, opponentSpeciesId, opponentLevel)

			setBuddyData(settled.data)
			setPendingMoves(settled.learnableMoves)
			setPendingEvos(settled.pendingEvolutions)
			setBattleState({ ...state, result })
			setPhase('result')
		}
	}, [battleInit, buddyData, opponentSpeciesId, opponentLevel])

	// Result phase: continue to move learning
	const handleResultContinue = useCallback(() => {
		if (pendingMoves.length > 0) {
			setPhase('learnMoves')
		} else if (pendingEvos.length > 0) {
			setPhase('evolution')
		} else {
			saveBuddyData(buddyData)
			setPhase('done')
			onClose()
		}
	}, [pendingMoves, pendingEvos, buddyData, onClose])

	// Move learning
	const handleMoveLearn = useCallback((idx: number) => {
		if (pendingMoves.length === 0) return
		const move = pendingMoves[0]!
		const updated = applyMoveLearn(buddyData, move.creatureId, move.moveId, idx)
		setBuddyData(updated)
		const remaining = pendingMoves.slice(1)
		setPendingMoves(remaining)
		if (remaining.length === 0) {
			if (pendingEvos.length > 0) {
				setPhase('evolution')
			} else {
				saveBuddyData(updated)
				setPhase('done')
				onClose()
			}
		}
	}, [pendingMoves, pendingEvos, buddyData, onClose])

	const handleMoveSkip = useCallback(() => {
		const remaining = pendingMoves.slice(1)
		setPendingMoves(remaining)
		if (remaining.length === 0) {
			if (pendingEvos.length > 0) {
				setPhase('evolution')
			} else {
				saveBuddyData(buddyData)
				setPhase('done')
				onClose()
			}
		}
	}, [pendingMoves, pendingEvos, buddyData, onClose])

	// Evolution
	const handleEvolutionConfirm = useCallback(() => {
		if (pendingEvos.length === 0) return
		const evo = pendingEvos[0]!
		const updated = applyEvolution(buddyData, evo.creatureId, evo.to)
		setBuddyData(updated)
		const remaining = pendingEvos.slice(1)
		setPendingEvos(remaining)
		if (remaining.length === 0) {
			saveBuddyData(updated)
			setPhase('done')
			onClose()
		}
	}, [pendingEvos, buddyData, onClose])

	// Switch: convert BattlePokemon to Creature for SwitchPanel
	const partyCreatures = buddyData.party
		.filter((id): id is string => id !== null)
		.map(id => buddyData.creatures.find(c => c.id === id))
		.filter((c): c is Creature => c !== undefined)

	// Render by phase
	switch (phase) {
		case 'config':
			return (
				<BattleConfigPanel
					party={partyCreatures}
					onSubmit={handleStartBattle}
					onCancel={onClose}
				/>
			)

		case 'battle': {
			if (!battleState) return null
			return (
				<BattleView
					state={battleState}
					onAction={handleAction}
				/>
			)
		}

		case 'switch': {
			if (!battleState) return null
			return (
				<SwitchPanel
					party={partyCreatures}
					activeId={battleState.playerPokemon.id}
					onSelect={(creatureId) => {
						handleAction({ type: 'switch', creatureId })
						setPhase('battle')
					}}
					onCancel={() => setPhase('battle')}
				/>
			)
		}

		case 'item': {
			if (!battleState) return null
			return (
				<ItemPanel
					items={battleState.usableItems}
					onSelect={(itemId) => {
						handleAction({ type: 'item', itemId })
						setPhase('battle')
					}}
					onCancel={() => setPhase('battle')}
				/>
			)
		}

		case 'result': {
			if (!battleState?.result) return null
			return (
				<BattleResultPanel
					result={battleState.result}
					playerPokemon={battleState.playerPokemon}
					onContinue={handleResultContinue}
				/>
			)
		}

		case 'learnMoves': {
			if (pendingMoves.length === 0) return null
			const move = pendingMoves[0]!
			const creature = buddyData.creatures.find(c => c.id === move.creatureId)
			if (!creature) return null
			return (
				<MoveLearnPanel
					creature={creature}
					newMoveId={move.moveId}
					replaceIndex={replaceIndex}
					onLearn={handleMoveLearn}
					onSkip={handleMoveSkip}
					onSelectReplace={setReplaceIndex}
				/>
			)
		}

		case 'evolution': {
			if (pendingEvos.length === 0) return null
			const evo = pendingEvos[0]!
			return (
				<Box flexDirection="column" borderStyle="round" paddingX={1}>
					<Text bold color="ansi:yellow"> 进化！</Text>
					<Text>  {evo.from} 正在进化为 {evo.to}！</Text>
					<Text color="ansi:white">  [Enter] 继续</Text>
				</Box>
			)
		}

		case 'done':
			return null

		default:
			return null
	}
}
