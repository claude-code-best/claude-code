import { describe, test, expect } from 'bun:test'
import { createBattle, executeTurn } from '../battle/engine'
import { settleBattle, applyMoveLearn, applyEvolution } from '../battle/settlement'
import { chooseAIMove } from '../battle/ai'
import type { Creature, BuddyData } from '../types'

function makeTestCreature(overrides: Partial<Creature> = {}): Creature {
  return {
    id: overrides.id ?? 'test-1',
    speciesId: overrides.speciesId ?? 'charmander',
    gender: overrides.gender ?? 'male',
    level: overrides.level ?? 50,
    xp: 0,
    totalXp: 0,
    nature: overrides.nature ?? 'adamant',
    ev: overrides.ev ?? { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
    iv: overrides.iv ?? { hp: 31, attack: 31, defense: 31, spAtk: 31, spDef: 31, speed: 31 },
    moves: overrides.moves ?? [
      { id: 'flamethrower', pp: 15, maxPp: 15 },
      { id: 'airslash', pp: 15, maxPp: 15 },
      { id: 'dragontail', pp: 10, maxPp: 10 },
      { id: 'slash', pp: 20, maxPp: 20 },
    ],
    ability: overrides.ability ?? 'blaze',
    heldItem: null,
    friendship: overrides.friendship ?? 70,
    isShiny: false,
    hatchedAt: Date.now(),
    pokeball: 'pokeball',
  }
}

function makeTestBuddyData(creatures: Creature[] = [makeTestCreature()]): BuddyData {
  return {
    version: 2,
    party: [creatures[0]!.id, null, null, null, null, null],
    boxes: [],
    creatures: creatures,
    eggs: [],
    dex: [],
    bag: { items: [] },
    stats: {
      totalTurns: 0,
      consecutiveDays: 0,
      lastActiveDate: '',
      totalEggsObtained: 0,
      totalEvolutions: 0,
      battlesWon: 0,
      battlesLost: 0,
    },
  }
}

describe('createBattle', () => {
  test('creates battle with valid initial state', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'squirtle', 50)
    expect(init.state).toBeDefined()
    expect(init.state.playerPokemon).toBeDefined()
    expect(init.state.opponentPokemon).toBeDefined()
    expect(init.state.finished).toBe(false)
  })

  test('player pokemon has correct species', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'bulbasaur', 30)
    expect(init.state.playerPokemon.speciesId).toBe('charmander')
    expect(init.state.opponentPokemon.speciesId).toBe('bulbasaur')
  })

  test('player pokemon has moves', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'squirtle', 50)
    expect(init.state.playerPokemon.moves.length).toBeGreaterThan(0)
  })
})

describe('executeTurn', () => {
  test('move action generates events', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'squirtle', 50)
    const initialEventCount = init.state.events.length

    const newState = executeTurn(init, { type: 'move', moveIndex: 0 })
    expect(newState.events.length).toBeGreaterThanOrEqual(initialEventCount)
  })

  test('battle eventually ends within 50 turns', () => {
    const creature = makeTestCreature({ level: 100, ev: { hp: 252, attack: 252, defense: 0, spAtk: 0, spDef: 0, speed: 252 } })
    const init = createBattle([creature], 'squirtle', 5)

    let state = init.state
    for (let i = 0; i < 50 && !state.finished; i++) {
      state = executeTurn(init, { type: 'move', moveIndex: 0 })
    }

    expect(state.finished).toBe(true)
  })
})

describe('settleBattle', () => {
  test('player win increments battlesWon', async () => {
    const creature = makeTestCreature()
    const data: BuddyData = {
      version: 2,
      party: [creature.id, null, null, null, null, null],
      boxes: [],
      creatures: [creature],
      eggs: [],
      dex: [],
      bag: { items: [] },
      stats: {
        totalTurns: 0,
        consecutiveDays: 0,
        lastActiveDate: '',
        totalEggsObtained: 0,
        totalEvolutions: 0,
        battlesWon: 0,
        battlesLost: 0,
      },
    }
    const result = {
      winner: 'player' as const,
      turns: 5,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [creature.id],
    }

    const settlement = await settleBattle(data, result, 'squirtle', 20)
    expect(settlement.data.stats.battlesWon).toBe(1)
  })

  test('player loss returns unchanged data', async () => {
    const creature = makeTestCreature()
    const data: BuddyData = {
      version: 2,
      party: [creature.id, null, null, null, null, null],
      boxes: [],
      creatures: [creature],
      eggs: [],
      dex: [],
      bag: { items: [] },
      stats: {
        totalTurns: 0,
        consecutiveDays: 0,
        lastActiveDate: '',
        totalEggsObtained: 0,
        totalEvolutions: 0,
        battlesWon: 0,
        battlesLost: 0,
      },
    }
    const result = {
      winner: 'opponent' as const,
      turns: 3,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [creature.id],
    }

    const settlement = await settleBattle(data, result, 'squirtle', 20)
    // Loss early-returns unchanged data
    expect(settlement.data.creatures[0]!.totalXp).toBe(creature.totalXp)
    expect(settlement.learnableMoves).toEqual([])
    expect(settlement.pendingEvolutions).toEqual([])
  })
})

describe('applyMoveLearn', () => {
  test('replaces move at given index', () => {
    const creature = makeTestCreature()
    const data: BuddyData = {
      version: 2,
      party: [creature.id, null, null, null, null, null],
      boxes: [],
      creatures: [creature],
      eggs: [],
      dex: [],
      bag: { items: [] },
      stats: {
        totalTurns: 0,
        consecutiveDays: 0,
        lastActiveDate: '',
        totalEggsObtained: 0,
        totalEvolutions: 0,
        battlesWon: 0,
        battlesLost: 0,
      },
    }
    const updated = applyMoveLearn(data, creature.id, 'fireblast', 3)
    expect(updated.creatures[0]!.moves[3]!.id).toBe('fireblast')
  })
})

describe('applyEvolution', () => {
  test('evolves charmander to charmeleon and increments counter', () => {
    const creature = makeTestCreature({ speciesId: 'charmander' })
    const data: BuddyData = {
      version: 2,
      party: [creature.id, null, null, null, null, null],
      boxes: [],
      creatures: [creature],
      eggs: [],
      dex: [],
      bag: { items: [] },
      stats: {
        totalTurns: 0,
        consecutiveDays: 0,
        lastActiveDate: '',
        totalEggsObtained: 0,
        totalEvolutions: 0,
        battlesWon: 0,
        battlesLost: 0,
      },
    }
    const updated = applyEvolution(data, creature.id, 'charmeleon')
    expect(updated.creatures[0]!.speciesId).toBe('charmeleon')
    expect(updated.stats.totalEvolutions).toBe(1)
  })
})

describe('chooseAIMove', () => {
  test('returns a valid move index', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'squirtle', 50)
    const aiPokemon = init.state.opponentPokemon
    const idx = chooseAIMove(aiPokemon)
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(aiPokemon.moves.length)
  })

  test('returns 0 when all moves have 0 PP', () => {
    const pokemon = {
      ...makeTestCreature(),
      moves: [
        { id: 'tackle', name: 'Tackle', type: 'Normal', pp: 0, maxPp: 35, disabled: false },
      ],
    }
    const idx = chooseAIMove(pokemon as any)
    expect(idx).toBe(0) // Struggle fallback
  })

  test('skips disabled moves', () => {
    const pokemon = {
      ...makeTestCreature(),
      moves: [
        { id: 'tackle', name: 'Tackle', type: 'Normal', pp: 35, maxPp: 35, disabled: true },
        { id: 'scratch', name: 'Scratch', type: 'Normal', pp: 35, maxPp: 35, disabled: false },
      ],
    }
    const idx = chooseAIMove(pokemon as any)
    expect(idx).toBe(1) // Only non-disabled move
  })
})

describe('settleBattle - advanced', () => {
  test('player win awards XP to creature', async () => {
    const creature = makeTestCreature({ level: 5 })
    const data = makeTestBuddyData([creature])
    const result = {
      winner: 'player' as const,
      turns: 3,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [creature.id],
    }
    const settlement = await settleBattle(data, result, 'squirtle', 20)
    expect(settlement.data.creatures[0]!.totalXp).toBeGreaterThan(0)
  })

  test('player win awards EVs (capped at 252 per stat)', async () => {
    const creature = makeTestCreature({
      level: 5,
      ev: { hp: 250, attack: 250, defense: 250, spAtk: 250, spDef: 250, speed: 250 },
    })
    const data = makeTestBuddyData([creature])
    const result = {
      winner: 'player' as const,
      turns: 3,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [creature.id],
    }
    const settlement = await settleBattle(data, result, 'squirtle', 20)
    for (const stat of ['hp', 'attack', 'defense', 'spAtk', 'spDef', 'speed'] as const) {
      expect(settlement.data.creatures[0]!.ev[stat]).toBeLessThanOrEqual(252)
    }
  })

  test('player loss does not increment battlesWon', async () => {
    const creature = makeTestCreature()
    const data = makeTestBuddyData([creature])
    const result = {
      winner: 'opponent' as const,
      turns: 3,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [creature.id],
    }
    const settlement = await settleBattle(data, result, 'squirtle', 20)
    expect(settlement.data.stats.battlesWon).toBe(0)
  })
})

describe('createBattle - extended', () => {
  test('battle state has turn initialized', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'squirtle', 50)
    expect(init.state.turn).toBeGreaterThanOrEqual(1)
  })

  test('player pokemon has correct level', () => {
    const creature = makeTestCreature({ level: 25 })
    const init = createBattle([creature], 'bulbasaur', 10)
    expect(init.state.playerPokemon.level).toBe(25)
  })

  test('opponent pokemon has correct level', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'squirtle', 15)
    expect(init.state.opponentPokemon.level).toBe(15)
  })

  test('battle state has player party', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'squirtle', 50)
    expect(init.state.playerParty.length).toBeGreaterThan(0)
  })

  test('battle state has usable items (empty bag)', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'squirtle', 50)
    expect(init.state.usableItems).toEqual([])
  })
})

describe('executeTurn - extended', () => {
  test('item action defaults to move 1', () => {
    const creature = makeTestCreature()
    const init = createBattle([creature], 'squirtle', 50)
    const state = executeTurn(init, { type: 'item', itemId: 'potion' })
    expect(state).toBeDefined()
    expect(state.events.length).toBeGreaterThan(0)
  })

  test('battle produces damage or heal events', () => {
    const creature = makeTestCreature({ level: 100, ev: { hp: 252, attack: 252, defense: 0, spAtk: 0, spDef: 4, speed: 252 } })
    const init = createBattle([creature], 'squirtle', 5)
    const state = executeTurn(init, { type: 'move', moveIndex: 0 })
    const hasDamageOrHeal = state.events.some(e => e.type === 'damage' || e.type === 'heal')
    expect(hasDamageOrHeal).toBe(true)
  })
})

describe('settleBattle - EV limits', () => {
  test('EV total cannot exceed 510', async () => {
    const creature = makeTestCreature({
      level: 5,
      ev: { hp: 250, attack: 250, defense: 10, spAtk: 0, spDef: 0, speed: 0 },
    })
    const data = makeTestBuddyData([creature])
    const result = {
      winner: 'player' as const,
      turns: 3,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [creature.id],
    }
    const settlement = await settleBattle(data, result, 'squirtle', 20)
    const totalEV = Object.values(settlement.data.creatures[0]!.ev).reduce((a, b) => a + b, 0)
    expect(totalEV).toBeLessThanOrEqual(510)
  })

  test('non-participant creatures are unchanged', async () => {
    const participant = makeTestCreature({ id: 'p1', level: 5 })
    const bystander = makeTestCreature({ id: 'p2', level: 5, speciesId: 'bulbasaur' })
    const data = makeTestBuddyData([participant, bystander])
    data.party = [participant.id, bystander.id, null, null, null, null]
    const result = {
      winner: 'player' as const,
      turns: 3,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [participant.id],
    }
    const settlement = await settleBattle(data, result, 'squirtle', 20)
    const bystanderAfter = settlement.data.creatures.find(c => c.id === 'p2')!
    expect(bystanderAfter.totalXp).toBe(bystander.totalXp)
  })

  test('uses all party members as participants when participantIds is empty', async () => {
    const c1 = makeTestCreature({ id: 'p1', level: 5 })
    const c2 = makeTestCreature({ id: 'p2', level: 5, speciesId: 'bulbasaur' })
    const data = makeTestBuddyData([c1, c2])
    data.party = [c1.id, c2.id, null, null, null, null]
    const result = {
      winner: 'player' as const,
      turns: 3,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [] as string[],
    }
    const settlement = await settleBattle(data, result, 'squirtle', 20)
    expect(settlement.data.creatures.find(c => c.id === 'p1')!.totalXp).toBeGreaterThan(0)
    expect(settlement.data.creatures.find(c => c.id === 'p2')!.totalXp).toBeGreaterThan(0)
  })

  test('player win increments battlesWon but not battlesLost', async () => {
    const creature = makeTestCreature({ level: 5 })
    const data = makeTestBuddyData([creature])
    const result = {
      winner: 'player' as const,
      turns: 3,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [creature.id],
    }
    const settlement = await settleBattle(data, result, 'squirtle', 20)
    expect(settlement.data.stats.battlesWon).toBe(1)
    expect(settlement.data.stats.battlesLost).toBe(0)
  })
})

describe('applyMoveLearn - extended', () => {
  test('new move has correct PP from Dex', () => {
    const creature = makeTestCreature()
    const data = makeTestBuddyData([creature])
    const updated = applyMoveLearn(data, creature.id, 'fireblast', 0)
    const move = updated.creatures[0]!.moves[0]!
    expect(move.id).toBe('fireblast')
    expect(move.pp).toBeGreaterThan(0)
    expect(move.maxPp).toBeGreaterThan(0)
  })

  test('non-target creatures are unchanged', () => {
    const c1 = makeTestCreature({ id: 't1' })
    const c2 = makeTestCreature({ id: 't2', speciesId: 'bulbasaur' })
    const data = makeTestBuddyData([c1, c2])
    const updated = applyMoveLearn(data, 't1', 'fireblast', 0)
    const unchanged = updated.creatures.find(c => c.id === 't2')!
    expect(unchanged.moves[0]!.id).toBe('flamethrower')
  })
})

describe('applyEvolution - extended', () => {
  test('friendship increases by 10', () => {
    const creature = makeTestCreature({ speciesId: 'charmander', friendship: 70 })
    const data = makeTestBuddyData([creature])
    const updated = applyEvolution(data, creature.id, 'charmeleon')
    expect(updated.creatures[0]!.friendship).toBe(80)
  })

  test('friendship capped at 255', () => {
    const creature = makeTestCreature({ speciesId: 'charmander', friendship: 250 })
    const data = makeTestBuddyData([creature])
    const updated = applyEvolution(data, creature.id, 'charmeleon')
    expect(updated.creatures[0]!.friendship).toBe(255)
  })

  test('multiple evolutions increment counter correctly', () => {
    const c1 = makeTestCreature({ id: 't1', speciesId: 'charmander' })
    const c2 = makeTestCreature({ id: 't2', speciesId: 'bulbasaur' })
    const data = makeTestBuddyData([c1, c2])
    let updated = applyEvolution(data, 't1', 'charmeleon')
    updated = applyEvolution(updated, 't2', 'ivysaur')
    expect(updated.stats.totalEvolutions).toBe(2)
  })
})
