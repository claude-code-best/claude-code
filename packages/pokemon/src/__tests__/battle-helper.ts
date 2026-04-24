/**
 * Battle Test Framework
 *
 * Fluent API for testing Pokémon battle scenarios:
 *
 *   const s = await battleScenario()
 *     .party('charmander', 50, ['flamethrower'])
 *     .party('bulbasaur', 30, ['vinewhip'])
 *     .opponent('squirtle', 50)
 *     .start()
 *
 *   const state = await s.useMove(0).runTurn()
 *   s.expect(state).hasDamage('opponent')
 */

import { describe, test, expect } from 'bun:test'
import { createBattle, executeTurn, executeSwitch } from '../battle/engine'
import type { BattleState } from '../battle/types'
import type { BattleInit } from '../battle/engine'
import type { BattleEvent } from '../battle/types'
import type { Creature, SpeciesId, StatName } from '../types'

// ─── Creature Builder ───

interface CreatureSpec {
  id: string
  speciesId: SpeciesId
  level: number
  moves: string[]
  ability?: string
  nature?: string
  ev?: Partial<Record<StatName, number>>
  iv?: Partial<Record<StatName, number>>
}

function buildCreature(spec: CreatureSpec, index: number): Creature {
  return {
    id: spec.id ?? `test-${index}`,
    speciesId: spec.speciesId,
    gender: 'male',
    level: spec.level,
    xp: 0,
    totalXp: 0,
    nature: (spec.nature ?? 'adamant') as Creature['nature'],
    ev: {
      hp: spec.ev?.hp ?? 0,
      attack: spec.ev?.attack ?? 0,
      defense: spec.ev?.defense ?? 0,
      spAtk: spec.ev?.spAtk ?? 0,
      spDef: spec.ev?.spDef ?? 0,
      speed: spec.ev?.speed ?? 0,
    },
    iv: {
      hp: spec.iv?.hp ?? 31,
      attack: spec.iv?.attack ?? 31,
      defense: spec.iv?.defense ?? 31,
      spAtk: spec.iv?.spAtk ?? 31,
      spDef: spec.iv?.spDef ?? 31,
      speed: spec.iv?.speed ?? 31,
    },
    moves: [
      ...spec.moves.map(m => ({ id: m, pp: 15, maxPp: 15 })),
      ...Array(Math.max(0, 4 - spec.moves.length)).fill({ id: '', pp: 0, maxPp: 0 }),
    ] as [import('../types').MoveSlot, import('../types').MoveSlot, import('../types').MoveSlot, import('../types').MoveSlot],
    ability: spec.ability ?? 'blaze',
    heldItem: null,
    friendship: 70,
    isShiny: false,
    hatchedAt: Date.now(),
    pokeball: 'pokeball',
  }
}

// ─── Scenario Builder ───

export interface BattleScenario {
  /** Add a party member (first = lead) */
  party(species: SpeciesId, level: number, moves: string[], opts?: Partial<CreatureSpec>): BattleScenario
  /** Set opponent (wild Pokémon) */
  opponent(species: SpeciesId, level: number): BattleScenario
  /** Create the battle and return runner */
  start(): Promise<BattleRunner>
}

export interface BattleRunner {
  /** Queue a move action (0-indexed) */
  useMove(index: number): BattleRunner
  /** Queue a switch action (party slot index, 0-indexed) */
  switchTo(partyIndex: number): BattleRunner
  /** Execute one turn with queued action, return state */
  runTurn(): Promise<BattleState>
  /** Keep using move 0 until battle ends or max turns reached */
  runUntilEnd(maxTurns?: number): Promise<BattleState>
  /** Execute forced switch after faint */
  doSwitch(partyIndex: number): Promise<BattleState>
  /** Get current battle state (re-projected from Battle object) */
  readonly state: BattleState
  /** Assertion helpers */
  expect(state: BattleState): BattleAssertions
}

export interface BattleAssertions {
  /** Battle has not ended */
  ongoing(): BattleAssertions
  /** Battle has ended */
  finished(): BattleAssertions
  /** Player won */
  playerWon(): BattleAssertions
  /** Opponent won */
  opponentWon(): BattleAssertions
  /** Player's active HP is full */
  playerHpFull(): BattleAssertions
  /** Player's active HP is below threshold (absolute) */
  playerHpBelow(hp: number): BattleAssertions
  /** Player's active HP percentage is below threshold */
  playerHpPctBelow(pct: number): BattleAssertions
  /** Opponent's active HP is full */
  opponentHpFull(): BattleAssertions
  /** Opponent's active HP is below threshold */
  opponentHpBelow(hp: number): BattleAssertions
  /** Player needs to switch (active fainted, bench alive) */
  needsSwitch(): BattleAssertions
  /** Player's active Pokémon has fainted */
  playerFainted(): BattleAssertions
  /** Opponent's active Pokémon has fainted */
  opponentFainted(): BattleAssertions
  /** Player's active species matches */
  playerSpecies(species: SpeciesId): BattleAssertions
  /** Opponent's active species matches */
  opponentSpecies(species: SpeciesId): BattleAssertions
  /** Events contain at least one of given type (optionally for given side) */
  hasEvent(type: BattleEvent['type'], side?: 'player' | 'opponent'): BattleAssertions
  /** Events contain damage for given side */
  hasDamage(side: 'player' | 'opponent'): BattleAssertions
  /** Events contain a move event for given side */
  hasMove(side: 'player' | 'opponent'): BattleAssertions
  /** Events contain a faint event for given side */
  hasFaint(side: 'player' | 'opponent'): BattleAssertions
  /** Events contain super-effective hit */
  hasSuperEffective(): BattleAssertions
  /** Events contain resisted hit */
  hasResisted(): BattleAssertions
  /** Events contain critical hit */
  hasCrit(): BattleAssertions
  /** Turn number matches */
  turnIs(n: number): BattleAssertions
  /** Player party has N alive (hp > 0) Pokémon */
  aliveInParty(n: number): BattleAssertions
  /** Player's move at index has expected pp and maxPp */
  playerMovePp(moveIndex: number, pp: number, maxPp: number): BattleAssertions
  /** Generic assertion */
  satisfies(fn: (state: BattleState) => boolean, msg?: string): BattleAssertions
}

// ─── Implementation ───

class BattleScenarioImpl implements BattleScenario {
  private _party: CreatureSpec[] = []
  private _opponentSpecies: SpeciesId = 'pikachu'
  private _opponentLevel = 5

  party(species: SpeciesId, level: number, moves: string[], opts?: Partial<CreatureSpec>): BattleScenario {
    this._party.push({
      id: opts?.id ?? `p${this._party.length + 1}`,
      speciesId: species,
      level,
      moves,
      ...opts,
    })
    return this
  }

  opponent(species: SpeciesId, level: number): BattleScenario {
    this._opponentSpecies = species
    this._opponentLevel = level
    return this
  }

  async start(): Promise<BattleRunner> {
    if (this._party.length === 0) {
      this._party.push({ id: 'p1', speciesId: 'charmander', level: 50, moves: ['tackle'] })
    }
    const creatures = this._party.map((s, i) => buildCreature(s, i))
    const init = await createBattle(creatures, this._opponentSpecies, this._opponentLevel)
    return new BattleRunnerImpl(init)
  }
}

class BattleRunnerImpl implements BattleRunner {
  private _init: BattleInit
  private _pendingAction: { type: 'move'; index: number } | { type: 'switch'; partyIndex: number } | null = null

  constructor(init: BattleInit) {
    this._init = init
  }

  get state(): BattleState {
    return this._init.state
  }

  useMove(index: number): BattleRunner {
    this._pendingAction = { type: 'move', index }
    return this
  }

  switchTo(partyIndex: number): BattleRunner {
    this._pendingAction = { type: 'switch', partyIndex }
    return this
  }

  async runTurn(): Promise<BattleState> {
    const action = this._pendingAction
    this._pendingAction = null

    if (!action) {
      // Default: use move 0
      return executeTurn(this._init, { type: 'move', moveIndex: 0 })
    }

    if (action.type === 'move') {
      return executeTurn(this._init, { type: 'move', moveIndex: action.index })
    } else {
      return executeTurn(this._init, { type: 'switch', partyIndex: action.partyIndex })
    }
  }

  async runUntilEnd(maxTurns = 100): Promise<BattleState> {
    let state = this._init.state
    for (let i = 0; i < maxTurns && !state.finished; i++) {
      if (state.needsSwitch) {
        // Auto-switch to first alive bench
        const alive = state.playerParty.findIndex((p: any, idx: any) => idx > 0 && p.hp > 0)
        if (alive >= 0) {
          state = await executeSwitch(this._init, alive)
        } else break
      }
      state = await executeTurn(this._init, { type: 'move', moveIndex: 0 })
    }
    return state
  }

  async doSwitch(partyIndex: number): Promise<BattleState> {
    return executeSwitch(this._init, partyIndex)
  }

  expect(state: BattleState): BattleAssertions {
    return new BattleAssertionsImpl(state)
  }
}

class BattleAssertionsImpl implements BattleAssertions {
  constructor(private s: BattleState) {}

  ongoing() { expect(this.s.finished).toBe(false); return this }
  finished() { expect(this.s.finished).toBe(true); return this }
  playerWon() { expect(this.s.result?.winner).toBe('player'); return this }
  opponentWon() { expect(this.s.result?.winner).toBe('opponent'); return this }

  playerHpFull() { expect(this.s.playerPokemon.hp).toBe(this.s.playerPokemon.maxHp); return this }
  playerHpBelow(hp: number) { expect(this.s.playerPokemon.hp).toBeLessThan(hp); return this }
  playerHpPctBelow(pct: number) {
    const actual = this.s.playerPokemon.maxHp > 0 ? (this.s.playerPokemon.hp / this.s.playerPokemon.maxHp) * 100 : 0
    expect(actual).toBeLessThan(pct)
    return this
  }
  opponentHpFull() { expect(this.s.opponentPokemon.hp).toBe(this.s.opponentPokemon.maxHp); return this }
  opponentHpBelow(hp: number) { expect(this.s.opponentPokemon.hp).toBeLessThan(hp); return this }

  needsSwitch() { expect(this.s.needsSwitch).toBe(true); return this }
  playerFainted() { expect(this.s.playerPokemon.hp).toBe(0); return this }
  opponentFainted() { expect(this.s.opponentPokemon.hp).toBe(0); return this }

  playerSpecies(sp: SpeciesId) { expect(this.s.playerPokemon.speciesId).toBe(sp); return this }
  opponentSpecies(sp: SpeciesId) { expect(this.s.opponentPokemon.speciesId).toBe(sp); return this }

  hasEvent(type: BattleEvent['type'], side?: 'player' | 'opponent') {
    const has = this.s.events.some(e =>
      e.type === type && (side === undefined || ('side' in e && e.side === side))
    )
    expect(has).toBe(true)
    return this
  }
  hasDamage(side: 'player' | 'opponent') { return this.hasEvent('damage', side) }
  hasMove(side: 'player' | 'opponent') { return this.hasEvent('move', side) }
  hasFaint(side: 'player' | 'opponent') { return this.hasEvent('faint', side) }
  hasSuperEffective() { return this.hasEvent('effectiveness') }

  hasResisted() {
    const has = this.s.events.some(e => e.type === 'effectiveness' && 'multiplier' in e && e.multiplier < 1)
    expect(has).toBe(true)
    return this
  }
  hasCrit() { return this.hasEvent('crit') }

  turnIs(n: number) { expect(this.s.turn).toBe(n); return this }
  aliveInParty(n: number) {
    const alive = this.s.playerParty.filter(p => p.hp > 0).length
    expect(alive).toBe(n)
    return this
  }

  playerMovePp(moveIndex: number, pp: number, maxPp: number) {
    const move = this.s.playerPokemon.moves[moveIndex]
    expect(move).toBeDefined()
    expect(move!.pp).toBe(pp)
    expect(move!.maxPp).toBe(maxPp)
    return this
  }

  satisfies(fn: (state: BattleState) => boolean, msg?: string) {
    expect(fn(this.s), msg).toBe(true)
    return this
  }
}

// ─── Public API ───

/** Create a new battle scenario */
export function battleScenario(): BattleScenario {
  return new BattleScenarioImpl()
}

/** Quick creature builder for raw Creature objects */
export function makeCreature(
  species: SpeciesId,
  level: number,
  moves: string[] = ['tackle'],
  opts?: Partial<CreatureSpec>,
): Creature {
  return buildCreature({
    id: opts?.id ?? 'test-1',
    speciesId: species,
    level,
    moves,
    ...opts,
  }, 0)
}

/** Shorthand for describe/test wrapper */
export function battleSuite(name: string, fn: (b: typeof battleScenario) => void) {
  describe(name, () => fn(battleScenario))
}

/** Shorthand for a single battle test */
export function battleTest(name: string, fn: () => Promise<void>) {
  test(name, fn)
}
