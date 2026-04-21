import type { StatName, SpeciesId } from '../types'

export type StatusCondition = 'poison' | 'bad_poison' | 'burn' | 'paralysis' | 'freeze' | 'sleep' | 'none'

export type BattlePokemon = {
	id: string                        // creature ID
	speciesId: SpeciesId
	name: string
	level: number
	hp: number                        // current HP in battle
	maxHp: number
	types: string[]
	moves: MoveOption[]
	ability: string
	heldItem: string | null
	status: StatusCondition
	statStages: Record<string, number> // -6 to +6
}

export type MoveOption = {
	id: string
	name: string
	type: string
	pp: number
	maxPp: number
	disabled: boolean
}

export type PlayerAction =
	| { type: 'move'; moveIndex: number }
	| { type: 'switch'; creatureId: string }
	| { type: 'item'; itemId: string }

export type BattleEvent =
	| { type: 'move'; side: 'player' | 'opponent'; move: string; user: string }
	| { type: 'damage'; side: 'player' | 'opponent'; amount: number; percentage: number }
	| { type: 'heal'; side: 'player' | 'opponent'; amount: number; percentage: number }
	| { type: 'faint'; side: 'player' | 'opponent'; speciesId: string }
	| { type: 'switch'; side: 'player' | 'opponent'; speciesId: string; name: string }
	| { type: 'effectiveness'; multiplier: number }
	| { type: 'crit' }
	| { type: 'miss' }
	| { type: 'status'; side: 'player' | 'opponent'; status: StatusCondition }
	| { type: 'statChange'; side: 'player' | 'opponent'; stat: string; stages: number }
	| { type: 'ability'; side: 'player' | 'opponent'; ability: string }
	| { type: 'item'; side: 'player' | 'opponent'; item: string }
	| { type: 'fail'; reason: string }
	| { type: 'turn'; number: number }

export type BattleResult = {
	winner: 'player' | 'opponent'
	turns: number
	xpGained: number
	evGained: Record<StatName, number>
	participantIds: string[]
}

export type BattleState = {
	playerPokemon: BattlePokemon
	opponentPokemon: BattlePokemon
	playerParty: BattlePokemon[]
	opponentParty: BattlePokemon[]
	turn: number
	events: BattleEvent[]
	finished: boolean
	result?: BattleResult
	usableItems: { id: string; name: string; count: number }[]
}
