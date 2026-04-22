import { BattleStreams, Teams, Dex, toID } from '@pkmn/sim'
import { Protocol } from '@pkmn/protocol'
import type { Creature, SpeciesId } from '../types'
import { TO_DEX_STAT, FROM_DEX_STAT } from '../dex/pkmn'
import { STAT_NAMES } from '../types'
import type { BattleState, BattlePokemon, BattleEvent, PlayerAction, StatusCondition, WeatherKind, FieldCondition } from './types'
import { chooseAIMove } from './ai'

// ─── Types ───

export type BattleInit = {
  streams: {
    omniscient: { write(data: string): void; read(): Promise<string | null | undefined> }
    spectator: { read(): Promise<string | null | undefined> }
    p1: { write(data: string): void; read(): Promise<string | null | undefined> }
    p2: { write(data: string): void; read(): Promise<string | null | undefined> }
  }
  /** Underlying stream — access .battle for Battle object */
  stream: BattleStreams.BattleStream
  state: BattleState
}

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
  const moves = getSpeciesMoves(speciesId, level)
  return [species.name, `Level: ${level}`, `Ability: ${ability}`, ...moves.map(m => `- ${m}`)].join('\n')
}

function getSpeciesMoves(speciesId: string, _level: number): string[] {
  const species = Dex.species.get(speciesId)
  if (!species) return ['Tackle']
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

// ─── State Projection (from Battle object) ───

function projectPokemon(pkm: any): BattlePokemon {
  if (!pkm) throw new Error('No active pokemon')
  const species = pkm.species
  const hp = pkm.hp ?? 0
  const maxHp = pkm.maxhp ?? 1

  return {
    id: pkm.name,
    speciesId: toID(species.name) as SpeciesId,
    name: species.name,
    level: pkm.level,
    hp,
    maxHp,
    types: species.types?.map((t: string) => t.toLowerCase()) ?? [],
    moves: (pkm.moveSlots ?? pkm.baseMoveset ?? []).filter(Boolean).map((m: any) => {
      const moveName = typeof m === 'string' ? m : (m.name ?? m.move?.name ?? Dex.moves.get(m.id ?? m.move)?.name ?? String(m.id ?? '???'))
      return {
        id: toID(moveName),
        name: moveName,
        type: m.type ?? Dex.moves.get(m.id ?? toID(moveName))?.type?.toLowerCase() ?? 'normal',
        pp: m.pp ?? 0,
        maxPp: m.maxPp ?? m.pp ?? 0,
        disabled: m.disabled ?? false,
      }
    }),
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

function projectState(battle: any, bagItems?: { id: string; count: number }[], prevConditions?: { player: FieldCondition[]; opponent: FieldCondition[] }): BattleState {
  const p1 = battle.p1
  const p2 = battle.p2
  // Extract weather from battle field
  const weatherRaw = battle.field?.weather ?? ''
  const weather = mapWeather(weatherRaw)

  return {
    playerPokemon: projectPokemon(p1.active[0]),
    opponentPokemon: projectPokemon(p2.active[0]),
    playerParty: p1.pokemon.map((p: any) => projectPokemon(p)),
    opponentParty: p2.pokemon.map((p: any) => projectPokemon(p)),
    turn: battle.turn ?? 1,
    events: [],
    finished: battle.ended,
    usableItems: bagItems?.filter(i => i.count > 0).map(i => ({ id: i.id, name: i.id, count: i.count })) ?? [],
    weather,
    playerConditions: prevConditions?.player ?? projectSideConditions(p1),
    opponentConditions: prevConditions?.opponent ?? projectSideConditions(p2),
  }
}

function mapWeather(raw: string): WeatherKind | undefined {
  if (!raw) return undefined
  const w = raw.toLowerCase()
  if (w.includes('sun') || w.includes('desolateland')) return 'sun'
  if (w.includes('rain') || w.includes('primordialsea')) return 'rain'
  if (w.includes('sandstorm')) return 'sandstorm'
  if (w.includes('hail')) return 'hail'
  if (w.includes('snow')) return 'snow'
  if (w.includes('deltastream')) return 'deltastream'
  return undefined
}

/** Extract field conditions from a side object */
function projectSideConditions(side: any): FieldCondition[] {
  const conditions: FieldCondition[] = []
  if (!side) return conditions
  const sr = side.sideConditions?.stealthrock
  if (sr) conditions.push({ id: 'Stealth Rock', side: side === side.battle?.p1 ? 'player' as const : 'opponent' as const, level: 1 })
  const spikes = side.sideConditions?.spikes
  if (spikes) conditions.push({ id: 'Spikes', side: side === side.battle?.p1 ? 'player' as const : 'opponent' as const, level: spikes.levels ?? 1 })
  const tspikes = side.sideConditions?.toxicspikes
  if (tspikes) conditions.push({ id: 'Toxic Spikes', side: side === side.battle?.p1 ? 'player' as const : 'opponent' as const, level: tspikes.levels ?? 1 })
  const webs = side.sideConditions?.stickyweb
  if (webs) conditions.push({ id: 'Sticky Web', side: side === side.battle?.p1 ? 'player' as const : 'opponent' as const, level: 1 })
  return conditions
}

// ─── Protocol Event Parsing (from spectator chunks) ───

function parseChunkToEvents(chunk: string, prevHp?: { player: { hp: number; maxHp: number }; opponent: { hp: number; maxHp: number } }): BattleEvent[] {
  const events: BattleEvent[] = []
  // Track HP through the chunk to compute damage/heal amounts
  const hp = prevHp ? { player: { ...prevHp.player }, opponent: { ...prevHp.opponent } } : { player: { hp: 0, maxHp: 1 }, opponent: { hp: 0, maxHp: 1 } }

  for (const line of chunk.split('\n')) {
    if (!line.startsWith('|')) continue
    // Skip non-battle lines (but NOT |upkeep| anymore!)
    if (line.startsWith('|t:|') || line === '|' || line.startsWith('|gametype|') || line.startsWith('|player|') ||
        line.startsWith('|gen|') || line.startsWith('|tier|') || line.startsWith('|clearpoke|') ||
        line.startsWith('|poke|') || line.startsWith('|teampreview|') || line.startsWith('|teamsize|') ||
        line.startsWith('|start|') || line.startsWith('|done|')) continue

    const parts = line.split('|')
    const cmd = parts[1]
    if (!cmd) continue
    const side = parts[2]?.startsWith('p1a') ? 'player' as const : 'opponent' as const

    switch (cmd) {
      case 'move':
        events.push({ type: 'move', side, move: parts[3] ?? '', user: parts[2] ?? '' })
        break
      case '-damage': {
        const newHp = parseHpValue(parts[3])
        const prev = hp[side].hp
        const maxHp = hp[side].maxHp || 1
        if (newHp !== null) {
          const amount = Math.max(0, prev - newHp)
          const percentage = maxHp > 0 ? Math.round((amount / maxHp) * 100) : 0
          hp[side].hp = newHp
          hp[side].maxHp = Math.max(hp[side].maxHp, parseMaxHp(parts[3]) ?? maxHp)
          events.push({ type: 'damage', side, amount, percentage })
        } else {
          events.push({ type: 'damage', side, amount: 0, percentage: 0 })
        }
        break
      }
      case '-heal': {
        const newHp = parseHpValue(parts[3])
        const prev = hp[side].hp
        const maxHp = hp[side].maxHp || 1
        if (newHp !== null) {
          const amount = Math.max(0, newHp - prev)
          const percentage = maxHp > 0 ? Math.round((amount / maxHp) * 100) : 0
          hp[side].hp = newHp
          hp[side].maxHp = Math.max(hp[side].maxHp, parseMaxHp(parts[3]) ?? maxHp)
          events.push({ type: 'heal', side, amount, percentage })
        } else {
          events.push({ type: 'heal', side, amount: 0, percentage: 0 })
        }
        break
      }
      case 'faint':
        events.push({ type: 'faint', side, speciesId: toID(parts[2]?.split(': ')?.[1] ?? '') })
        break
      case 'switch': {
        const name = parts[3]?.split(',')[0] ?? ''
        // Parse HP from switch: "Squirtle, L5, 100/100"
        const hpStr = parts[3] ?? ''
        const hpMatch = hpStr.match(/(\d+)\/(\d+)/)
        if (hpMatch) {
          hp[side].hp = parseInt(hpMatch[1], 10)
          hp[side].maxHp = parseInt(hpMatch[2], 10)
        }
        events.push({ type: 'switch', side, speciesId: toID(name), name })
        break
      }
      case '-supereffective':
        events.push({ type: 'effectiveness', multiplier: 2 })
        break
      case '-resisted':
        events.push({ type: 'effectiveness', multiplier: 0.5 })
        break
      case '-crit':
        events.push({ type: 'crit' })
        break
      case '-miss':
        events.push({ type: 'miss', side })
        break
      case '-status':
        events.push({ type: 'status', side, status: mapStatus(parts[3]) })
        break
      case '-curestatus':
        // Pokémon cured of status — represent as status 'none'
        events.push({ type: 'status', side, status: 'none' })
        break
      case '-boost':
      case '-unboost': {
        const stages = cmd === '-boost' ? Number(parts[4]) : -Number(parts[4])
        events.push({ type: 'statChange', side, stat: parts[3] ?? '', stages })
        break
      }
      case '-ability':
        events.push({ type: 'ability', side, ability: parts[3] ?? '' })
        break
      case '-item':
        events.push({ type: 'item', side, item: parts[3] ?? '' })
        break
      case 'fail':
        events.push({ type: 'fail', side, reason: parts[3] ?? '' })
        break
      case '-fail':
        events.push({ type: 'fail', side, reason: parts[3] ?? '' })
        break
      case '-weather': {
        const weatherRaw = parts[2] ?? ''
        if (weatherRaw === 'none' || weatherRaw === '') {
          events.push({ type: 'weather', weather: 'none' })
        } else {
          const weather = mapWeather(weatherRaw)
          events.push({ type: 'weather', weather: weather ?? 'none', source: parts[3] ?? undefined })
        }
        break
      }
      case '-fieldstart':
      case '-fieldend': {
        const fieldId = parts[2] ?? ''
        const action = cmd === '-fieldstart' ? 'add' as const : 'remove' as const
        // Terrains etc. — map to fieldCondition
        events.push({ type: 'fieldCondition', side: 'player', id: fieldId, level: 1, action })
        break
      }
      case '-sidestart': {
        const conditionId = parts[3] ?? ''
        const condSide = parts[2]?.startsWith('p1') ? 'player' as const : 'opponent' as const
        const level = conditionId.match(/\d/) ? parseInt(conditionId.match(/\d/)![0], 10) : 1
        const cleanId = conditionId.replace(/\d+$/, '').trim()
        events.push({ type: 'fieldCondition', side: condSide, id: cleanId, level, action: 'add' })
        break
      }
      case '-sideend': {
        const conditionId = parts[3] ?? ''
        const condSide = parts[2]?.startsWith('p1') ? 'player' as const : 'opponent' as const
        events.push({ type: 'fieldCondition', side: condSide, id: conditionId, level: 0, action: 'remove' })
        break
      }
      case '-activate': {
        const effect = parts[3] ?? parts[2] ?? ''
        events.push({ type: 'activate', side, effect })
        break
      }
      case '-immune':
        events.push({ type: 'immune', side })
        break
      case 'upkeep':
        events.push({ type: 'upkeep' })
        break
      case 'turn':
        events.push({ type: 'turn', number: Number(parts[2]) })
        break
    }
  }
  return events
}

/** Parse current HP from protocol HP string like "80/100" or "80/100brn" */
function parseHpValue(hpStr?: string): number | null {
  if (!hpStr) return null
  const match = hpStr.match(/^(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

/** Parse max HP from protocol HP string like "80/100" or "80/100brn" */
function parseMaxHp(hpStr?: string): number | null {
  if (!hpStr) return null
  const match = hpStr.match(/\/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

// ─── Engine API ───

export async function createBattle(
  partyCreatures: Creature[],
  opponentSpeciesId: SpeciesId,
  opponentLevel: number,
  _bagItems?: { id: string; count: number }[],
): Promise<BattleInit> {
  const stream = new BattleStreams.BattleStream()
  const streams = BattleStreams.getPlayerStreams(stream)

  const p1Sets = partyCreatures.map(c => creatureToSetString(c))
  const p2Set = wildPokemonToSetString(opponentSpeciesId, opponentLevel)
  const p1Team = Teams.import(p1Sets.join('\n\n'))
  const p2Team = Teams.import(p2Set)

  const spec = { formatid: 'gen9customgame' }
  const p1spec = { name: 'Player', team: Teams.pack(p1Team) }
  const p2spec = { name: 'Opponent', team: Teams.pack(p2Team) }

  // Initialize battle
  streams.omniscient.write(
    `>start ${JSON.stringify(spec)}\n` +
    `>player p1 ${JSON.stringify(p1spec)}\n` +
    `>player p2 ${JSON.stringify(p2spec)}`
  )

  // Drain team preview from omniscient and spectator streams
  await streams.omniscient.read()
  await streams.spectator.read()

  // Accept team preview — lead with first Pokémon
  streams.omniscient.write(`>p1 team 1\n>p2 team 1`)

  // Read battle start from spectator (clean, no |split|)
  const startChunk = (await streams.spectator.read()) ?? ''

  // Parse initial events (switches + turn)
  const initialEvents = parseChunkToEvents(startChunk)

  // Use Battle object for rich state projection
  const battle = stream.battle!
  const state = projectState(battle, _bagItems, { player: [], opponent: [] })
  state.events = initialEvents

  return { streams, stream, state }
}

export async function executeTurn(
  battleInit: BattleInit,
  action: PlayerAction,
): Promise<BattleState> {
  const { streams, stream } = battleInit
  const prevState = battleInit.state
  const battle = stream.battle!

  // Build p1 choice
  let p1Choice: string
  switch (action.type) {
    case 'move':
      p1Choice = `move ${action.moveIndex + 1}`
      break
    case 'switch': {
      // Use partyIndex directly (1-indexed for showdown protocol)
      const idx = action.partyIndex
      const p1Pokemon: any[] = battle.p1.pokemon
      p1Choice = idx >= 0 && idx < p1Pokemon.length ? `switch ${idx + 1}` : 'move 1'
      break
    }
    case 'item':
      p1Choice = 'move 1'
      break
    default:
      p1Choice = 'move 1'
  }

  // AI choice
  const aiMoveIndex = chooseAIMove(prevState.opponentPokemon)
  const p2Choice = `move ${aiMoveIndex + 1}`

  // Submit choices via stream
  streams.omniscient.write(`>p1 ${p1Choice}\n>p2 ${p2Choice}`)

  // Read turn result from spectator (no |split| issues)
  const turnChunk = (await streams.spectator.read()) ?? ''
  const newEvents = parseChunkToEvents(turnChunk, {
    player: { hp: prevState.playerPokemon.hp, maxHp: prevState.playerPokemon.maxHp },
    opponent: { hp: prevState.opponentPokemon.hp, maxHp: prevState.opponentPokemon.maxHp },
  })

  // Project rich state from Battle object, preserving field conditions
  const state = projectState(battle, prevState.usableItems, {
    player: prevState.playerConditions,
    opponent: prevState.opponentConditions,
  })
  state.events = [...prevState.events, ...newEvents]

  // Forced switch detection via Battle object
  const p1Active = battle.p1.active[0]
  const hasAliveBench = battle.p1.pokemon.some((p: any, i: number) => i > 0 && !p.fainted && p.hp > 0)
  if (p1Active?.fainted && hasAliveBench && !battle.ended) {
    state.needsSwitch = true
  }

  // Battle end detection
  if (battle.ended) {
    state.finished = true
    const winner = battle.winner === 'Player' ? 'player' as const : 'opponent' as const
    state.result = {
      winner,
      turns: state.turn,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [],
    }
  }

  battleInit.state = state
  return state
}

export async function executeSwitch(
  battleInit: BattleInit,
  partyIndex: number,
): Promise<BattleState> {
  const { streams, stream } = battleInit
  const prevState = battleInit.state
  const battle = stream.battle!

  // Validate slot index
  const p1Pokemon: any[] = battle.p1.pokemon
  if (partyIndex < 0 || partyIndex >= p1Pokemon.length) return prevState

  // Build p2 command: switch if fainted, otherwise use AI move
  let p2Cmd = ''
  const p2Active = battle.p2.active[0]
  if (p2Active?.fainted || p2Active?.hp === 0) {
    const p2Pkm: any[] = battle.p2.pokemon
    const nextAlive = p2Pkm.findIndex((p: any, i: number) => i > 0 && !p.fainted && p.hp > 0)
    p2Cmd = nextAlive >= 0 ? `\n>p2 switch ${nextAlive + 1}` : '\n>p2 pass'
  } else {
    // p2's active is alive — submit AI move choice
    const aiMoveIndex = chooseAIMove(prevState.opponentPokemon)
    p2Cmd = `\n>p2 move ${aiMoveIndex + 1}`
  }

  // Submit switch (1-indexed for showdown protocol)
  streams.omniscient.write(`>p1 switch ${partyIndex + 1}${p2Cmd}`)

  // Read result
  const switchChunk = (await streams.spectator.read()) ?? ''
  const newEvents = parseChunkToEvents(switchChunk, {
    player: { hp: prevState.playerPokemon.hp, maxHp: prevState.playerPokemon.maxHp },
    opponent: { hp: prevState.opponentPokemon.hp, maxHp: prevState.opponentPokemon.maxHp },
  })

  // Project state
  const state = projectState(battle, prevState.usableItems, {
    player: prevState.playerConditions,
    opponent: prevState.opponentConditions,
  })
  state.events = [...prevState.events, ...newEvents]

  // Forced switch detection via Battle object
  const p1Active = battle.p1.active[0]
  const hasAliveBench = battle.p1.pokemon.some((p: any, i: number) => i > 0 && !p.fainted && p.hp > 0)
  if (p1Active?.fainted && hasAliveBench && !battle.ended) {
    state.needsSwitch = true
  }

  if (battle.ended) {
    state.finished = true
    const winner = battle.winner === 'Player' ? 'player' as const : 'opponent' as const
    state.result = {
      winner,
      turns: state.turn,
      xpGained: 0,
      evGained: { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 },
      participantIds: [],
    }
  }

  battleInit.state = state
  return state
}
