import { Battle, Teams, toID } from '@pkmn/sim'
import { Dex } from '@pkmn/sim'
import type { Creature, SpeciesId } from '../types'
import { TO_DEX_STAT, FROM_DEX_STAT } from '../data/pkmn'
import { STAT_NAMES } from '../types'
import type { BattleState, BattlePokemon, BattleEvent, PlayerAction, StatusCondition } from './types'
import { chooseAIMove } from './ai'

// ─── Adapter: Creature → Showdown Set ───

function creatureToSetString(creature: Creature): string {
	const species = Dex.species.get(creature.speciesId)
	if (!species) throw new Error(`Species ${creature.speciesId} not found`)

	const natureName = creature.nature.charAt(0).toUpperCase() + creature.nature.slice(1)
	const abilityName = creature.ability ? (Dex.abilities.get(creature.ability)?.name ?? creature.ability) : ''

	const moves = creature.moves
		.filter(m => m.id)
		.map(m => Dex.moves.get(m.id)?.name ?? m.id)

	const DEX_DISPLAY: Record<string, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' }
	const formatStatLine = (vals: Record<string, number>) =>
		STAT_NAMES.map(s => `${vals[s]} ${DEX_DISPLAY[TO_DEX_STAT[s]]}`).join(' / ')
	const ivs = formatStatLine(creature.iv)
	const evs = formatStatLine(creature.ev)

	const lines = [
		species.name,
		`Level: ${creature.level}`,
		`Ability: ${abilityName}`,
		`Nature: ${natureName}`,
		`IVs: ${ivs}`,
		`EVs: ${evs}`,
	]
	if (creature.heldItem) lines.push(`Item: ${Dex.items.get(creature.heldItem)?.name ?? creature.heldItem}`)
	for (const move of moves) lines.push(`- ${move}`)

	return lines.join('\n')
}

function wildPokemonToSetString(speciesId: SpeciesId, level: number): string {
	const species = Dex.species.get(speciesId)
	if (!species) throw new Error(`Species ${speciesId} not found`)
	const ability = species.abilities['0'] ?? ''
	// Get first 4 level-up moves (from species data)
	const moves = getSpeciesMoves(speciesId, level)
	return [species.name, `Level: ${level}`, `Ability: ${ability}`, ...moves.map(m => `- ${m}`)].join('\n')
}

function getSpeciesMoves(speciesId: string, _level: number): string[] {
	// In @pkmn/sim, Dex.species doesn't expose learnsets directly.
	// Use common moves that exist in the sim's data for basic battles.
	// The actual move pool is resolved by the Battle engine during construction.
	const species = Dex.species.get(speciesId)
	if (!species) return ['Tackle']
	// Use type-appropriate basic moves as fallback
	const type = species.types[0]?.toLowerCase() ?? 'normal'
	const basicMoves: Record<string, string[]> = {
		normal: ['Tackle', 'Scratch'],
		fire: ['Ember', 'FireSpin'],
		water: ['WaterGun', 'Bubble'],
		grass: ['VineWhip', 'RazorLeaf'],
		electric: ['ThunderShock', 'Spark'],
		poison: ['PoisonSting', 'Smog'],
		ice: ['IceShard', 'PowderSnow'],
		fighting: ['KarateChop', 'LowKick'],
		ground: ['MudSlap', 'SandAttack'],
		flying: ['Gust', 'WingAttack'],
		psychic: ['Confusion', 'Psybeam'],
		bug: ['BugBite', 'StringShot'],
		rock: ['RockThrow', 'SandAttack'],
		ghost: ['Lick', 'ShadowSneak'],
		dragon: ['DragonRage', 'Twister'],
		dark: ['Bite', 'Pursuit'],
		steel: ['MetalClaw', 'IronTail'],
		fairy: ['FairyWind', 'DisarmingVoice'],
	}
	return basicMoves[type] ?? ['Tackle', 'Scratch']
}

// ─── State Projection ───

function projectPokemon(pkm: any): BattlePokemon {
	if (!pkm) throw new Error('No active pokemon')
	const species = pkm.species
	const hp = pkm.hp ?? 0
	const maxHp = pkm.maxhp ?? 1

	return {
		id: pkm.name, // sim doesn't store our UUID, use name as temp id
		speciesId: toID(species.name) as SpeciesId,
		name: species.name,
		level: pkm.level,
		hp,
		maxHp,
		types: species.types?.map((t: string) => t.toLowerCase()) ?? [],
		moves: (pkm.moveSlots ?? pkm.baseMoveset ?? []).filter(Boolean).map((m: any) => ({
			id: toID(m.name ?? m),
			name: m.name ?? m,
			type: m.type ?? 'Normal',
			pp: m.pp ?? 0,
			maxPp: m.maxPp ?? m.pp ?? 0,
			disabled: m.disabled ?? false,
		})),
		ability: pkm.ability ?? '',
		heldItem: pkm.item ?? null,
		status: mapStatus(pkm.status),
		statStages: projectBoosts(pkm.boosts),
	}
}

function mapStatus(status: string): StatusCondition {
	if (!status) return 'none'
	const s = status.toLowerCase()
	if (s === 'psn') return 'poison'
	if (s === 'tox') return 'bad_poison'
	if (s === 'brn') return 'burn'
	if (s === 'par') return 'paralysis'
	if (s === 'frz') return 'freeze'
	if (s === 'slp') return 'sleep'
	return 'none'
}

function projectBoosts(boosts: Record<string, number> | undefined): Record<string, number> {
	if (!boosts) return {}
	const result: Record<string, number> = {}
	for (const [k, v] of Object.entries(boosts)) {
		const mapped = FROM_DEX_STAT[k]
		if (mapped) result[mapped] = v
		else result[k] = v
	}
	return result
}

// ─── Log Parsing ───

function parseLogToEvents(log: string[]): BattleEvent[] {
	const events: BattleEvent[] = []
	const parseSide = (s: string | undefined): 'player' | 'opponent' =>
		s?.startsWith('p1a') ? 'player' : 'opponent'

	for (const line of log) {
		const parts = line.split('|')
		const side = parseSide(parts[2])

		if (line.startsWith('|move|')) {
			events.push({ type: 'move', side, move: parts[3], user: parts[2] })
		} else if (line.startsWith('|-damage|')) {
			const [cur, max] = parseHpString(parts[3])
			events.push({ type: 'damage', side, amount: 0, percentage: Math.round((1 - cur / max) * 100) })
		} else if (line.startsWith('|-heal|')) {
			const [cur, max] = parseHpString(parts[3])
			events.push({ type: 'heal', side, amount: 0, percentage: Math.round(cur / max * 100) })
		} else if (line.startsWith('|faint|')) {
			events.push({ type: 'faint', side, speciesId: toID(parts[2]?.split(': ')?.[1] ?? '') })
		} else if (line.startsWith('|switch|')) {
			const speciesPart = parts[3]?.split(',')[0]?.split(': ')
			events.push({ type: 'switch', side, speciesId: toID(speciesPart?.[1] ?? ''), name: speciesPart?.[1] ?? '' })
		} else if (line.startsWith('|-supereffective|')) {
			events.push({ type: 'effectiveness', multiplier: 2 })
		} else if (line.startsWith('|-resisted|')) {
			events.push({ type: 'effectiveness', multiplier: 0.5 })
		} else if (line.startsWith('|-crit|')) {
			events.push({ type: 'crit' })
		} else if (line.startsWith('|-miss|')) {
			events.push({ type: 'miss', side } as any)
		} else if (line.startsWith('|-status|')) {
			events.push({ type: 'status', side, status: mapStatus(parts[3]) })
		} else if (line.startsWith('|-boost|') || line.startsWith('|-unboost|')) {
			const stages = line.startsWith('|-boost|') ? parseInt(parts[4]) : -parseInt(parts[4])
			events.push({ type: 'statChange', side, stat: parts[3], stages })
		} else if (line.startsWith('|-ability|')) {
			events.push({ type: 'ability', side, ability: parts[3] })
		} else if (line.startsWith('|turn|')) {
			events.push({ type: 'turn', number: parseInt(parts[2]) })
		}
	}
	return events
}

function parseHpString(hpStr: string): [number, number] {
	if (!hpStr) return [0, 1]
	// Remove status suffix like "[1]"
	const clean = hpStr.replace(/\[.*\]/, '')
	const parts = clean.split('/')
	if (parts.length !== 2) return [0, 1]
	return [parseInt(parts[0]) || 0, parseInt(parts[1]) || 1]
}

// ─── Engine ───

export type BattleInit = {
	battle: any  // @pkmn/sim Battle instance
	state: BattleState
}

export function createBattle(
	partyCreatures: Creature[],
	opponentSpeciesId: SpeciesId,
	opponentLevel: number,
	_bagItems?: { id: string; count: number }[],
): BattleInit {
	const p1Sets = partyCreatures.map(c => creatureToSetString(c))
	const p2Set = wildPokemonToSetString(opponentSpeciesId, opponentLevel)

	const p1Team = Teams.import(p1Sets.join('\n\n'))
	const p2Team = Teams.import(p2Set)

	// Create battle
	const battle = new Battle({
		formatid: 'gen9customgame' as any,
		p1: { name: 'Player', team: p1Team },
		p2: { name: 'Opponent', team: p2Team },
	})

	// Handle team preview → auto-select leads
	battle.makeChoices('team 1', 'team 1')

	// Project initial state
	const state = projectState(battle, _bagItems)
	return { battle, state }
}

export function executeTurn(
	battleInit: BattleInit,
	action: PlayerAction,
): BattleState {
	const { battle } = battleInit
	const prevLogLen = battle.log.length

	// Build choice string
	let p1Choice: string
	switch (action.type) {
		case 'move':
			p1Choice = `move ${action.moveIndex + 1}`
			break
		case 'switch':
			p1Choice = `switch ${action.creatureId}`
			break
		case 'item':
			p1Choice = 'move 1' // Items handled via settlement
			break
		default:
			p1Choice = 'move 1'
	}

	// AI choice
	const aiPokemon = projectPokemon(battle.p2.active[0])
	const aiMoveIndex = chooseAIMove(aiPokemon)
	const p2Choice = `move ${aiMoveIndex + 1}`

	// Execute
	battle.makeChoices(p1Choice, p2Choice)

	// Parse new log entries
	const newLog = battle.log.slice(prevLogLen)
	const newEvents = parseLogToEvents(newLog)

	// Project new state
	const state = projectState(battle, battleInit.state.usableItems)
	state.events = [...battleInit.state.events, ...newEvents]

	// Check for battle end
	if (battle.ended) {
		state.finished = true
		const winner = battle.winner === 'Player' ? 'player' : 'opponent'
		state.result = {
			winner,
			turns: state.turn,
			xpGained: 0, // calculated in settlement
			evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
			participantIds: [],
		}
	}

	battleInit.state = state
	return state
}

function projectState(battle: any, bagItems?: { id: string; count: number }[]): BattleState {
	const p1 = battle.p1
	const p2 = battle.p2

	return {
		playerPokemon: projectPokemon(p1.active[0]),
		opponentPokemon: projectPokemon(p2.active[0]),
		playerParty: p1.pokemon.map((p: any) => projectPokemon(p)),
		opponentParty: p2.pokemon.map((p: any) => projectPokemon(p)),
		turn: battle.turn ?? 1,
		events: [],
		finished: battle.ended,
		usableItems: bagItems?.filter(i => i.count > 0).map(i => ({ id: i.id, name: i.id, count: i.count })) ?? [],
	}
}
