// 6 attributes (mapped to programming scenarios)
export type StatName = 'hp' | 'attack' | 'defense' | 'spAtk' | 'spDef' | 'speed'
export const STAT_NAMES: StatName[] = ['hp', 'attack', 'defense', 'spAtk', 'spDef', 'speed']
export const STAT_LABELS: Record<StatName, string> = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  spAtk: 'SPA',
  spDef: 'SPD',
  speed: 'SPE',
}

// Species IDs (MVP 10 species)
export type SpeciesId =
  | 'bulbasaur'
  | 'ivysaur'
  | 'venusaur'
  | 'charmander'
  | 'charmeleon'
  | 'charizard'
  | 'squirtle'
  | 'wartortle'
  | 'blastoise'
  | 'pikachu'

export const ALL_SPECIES_IDS: SpeciesId[] = [
  'bulbasaur',
  'ivysaur',
  'venusaur',
  'charmander',
  'charmeleon',
  'charizard',
  'squirtle',
  'wartortle',
  'blastoise',
  'pikachu',
]

// Nature (delegated to @pkmn/sim Dex.natures)
export type NatureName = string
export type NatureStat = 'attack' | 'defense' | 'spAtk' | 'spDef' | 'speed'
export type NatureEffect = { plus: NatureStat | null; minus: NatureStat | null }

// Move slot
export type MoveSlot = { id: string; pp: number; maxPp: number }
export const EMPTY_MOVE: MoveSlot = { id: '', pp: 0, maxPp: 0 }

// Item ID (Showdown format string)
export type ItemId = string

// PC box (fixed 30 slots)
export type PCBox = { name: string; slots: (string | null)[] }

// Bag
export type BagEntry = { id: ItemId; count: number }
export type Bag = { items: BagEntry[] }

// Gender
export type Gender = 'male' | 'female' | 'genderless'

// Evolution trigger types
export type EvolutionTrigger = 'level_up' | 'item' | 'trade' | 'friendship'

export type EvolutionCondition = {
  trigger: EvolutionTrigger
  level?: number // Level evolution: target level
  minFriendship?: number // Friendship evolution
  item?: string // Item evolution
  into: SpeciesId // Evolves into
}

// Growth rate types (from PokeAPI)
export type GrowthRate = 'slow' | 'medium-slow' | 'medium-fast' | 'fast' | 'erratic' | 'fluctuating'

// Species base data
export type SpeciesData = {
  id: SpeciesId
  name: string // English name
  names: Record<string, string> // Multilingual names { ja, en, zh }
  dexNumber: number // Pokédex number (1-10 MVP)
  genderRate: number // Female probability (0-8, -1 = genderless). femaleChance = genderRate / 8
  baseStats: Record<StatName, number>
  types: [string, string?] // Types (grass/poison, fire, water etc.)
  baseHappiness: number // Base friendship
  growthRate: GrowthRate
  captureRate: number
  personality: string // Default personality description
  evolutionChain?: EvolutionCondition[]
  shinyChance: number // Shiny probability (default 1/4096)
  flavorText?: string // Pokédex description
}

// Instantiated creature (stored in buddy-data.json)
export type Creature = {
  id: string // UUID
  speciesId: SpeciesId
  nickname?: string // User-defined name
  gender: Gender
  level: number
  xp: number // Current level progress XP
  totalXp: number // Total accumulated XP
  nature: NatureName // Character nature
  ev: Record<StatName, number> // Effort values
  iv: Record<StatName, number> // Individual values (0-31)
  moves: [MoveSlot, MoveSlot, MoveSlot, MoveSlot] // 4 move slots
  ability: string // Showdown ability ID
  heldItem: ItemId | null // Held item
  friendship: number // Friendship (0-255)
  isShiny: boolean
  hatchedAt: number // Timestamp when obtained
  pokeball: string // Pokeball type
}

// Egg
export type Egg = {
  id: string
  obtainedAt: number
  stepsRemaining: number // Remaining hatch steps
  totalSteps: number // Original total steps (for progress calc)
  speciesId: SpeciesId // Pre-determined species
}

// Pokédex entry
export type DexEntry = {
  speciesId: SpeciesId
  discoveredAt: number
  caughtCount: number // Number caught
  bestLevel: number // Highest level record
}

// buddy-data.json complete structure
export type BuddyData = {
  version: 2
  party: (string | null)[] // Always length 6, party[0] = active buddy
  boxes: PCBox[] // PC storage (default 8 boxes × 30 slots)
  creatures: Creature[]
  eggs: Egg[]
  dex: DexEntry[]
  bag: Bag
  stats: {
    totalTurns: number
    consecutiveDays: number
    lastActiveDate: string // ISO date
    totalEggsObtained: number
    totalEvolutions: number
    battlesWon: number
    battlesLost: number
  }
}

// Calculated stats result
export type StatsResult = Record<StatName, number>

// Evolution result
export type EvolutionResult = {
  from: SpeciesId
  to: SpeciesId
  newLevel: number
}

// Sprite cache entry
export type SpriteCache = {
  speciesId: SpeciesId
  lines: string[]
  width: number
  height: number
  fetchedAt: number
}

// Animation mode
export type AnimMode =
  | 'idle'
  | 'breathe'
  | 'blink'
  | 'fidget'
  | 'bounce'
  | 'walkLeft'
  | 'walkRight'
  | 'flip'
  | 'excited'
  | 'pet'
