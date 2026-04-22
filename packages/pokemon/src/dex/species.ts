import type { SpeciesData, SpeciesId, GrowthRate } from '../types'
import { ALL_SPECIES_IDS } from '../types'
import { getSpecies, mapBaseStats, mapGenderRatio } from './pkmn'
import { getNextEvolution } from './evolution'
import { SPECIES_I18N, SPECIES_PERSONALITY } from './names'

// ─── Supplementary data (fields not provided by @pkmn/sim) ───

const SUPPLEMENT: Record<SpeciesId, {
  growthRate: GrowthRate
  captureRate: number
  baseHappiness: number
  flavorText: string
}> = {
  bulbasaur: {
    growthRate: 'medium-slow',
    captureRate: 45,
    baseHappiness: 70,
    flavorText: 'A strange seed was planted on its back at birth. The plant sprouts and grows with this Pokémon.',
  },
  ivysaur: {
    growthRate: 'medium-slow',
    captureRate: 45,
    baseHappiness: 70,
    flavorText: 'When the bulb on its back grows large, it appears to lose the ability to stand on its hind legs.',
  },
  venusaur: {
    growthRate: 'medium-slow',
    captureRate: 45,
    baseHappiness: 70,
    flavorText: 'The plant blooms when it is absorbing solar energy. It stays on the move to seek sunlight.',
  },
  charmander: {
    growthRate: 'medium-slow',
    captureRate: 45,
    baseHappiness: 70,
    flavorText: 'Obviously prefers hot places. When it rains, steam is said to spout from the tip of its tail.',
  },
  charmeleon: {
    growthRate: 'medium-slow',
    captureRate: 45,
    baseHappiness: 70,
    flavorText: 'Tough fights could excite this Pokémon. When excited, it may blow out bluish-white flames.',
  },
  charizard: {
    growthRate: 'medium-slow',
    captureRate: 45,
    baseHappiness: 70,
    flavorText: 'Spits fire that is hot enough to melt boulders. Known to cause forest fires unintentionally.',
  },
  squirtle: {
    growthRate: 'medium-slow',
    captureRate: 45,
    baseHappiness: 70,
    flavorText: 'After birth, its back swells and hardens into a shell. Powerfully sprays foam from its mouth.',
  },
  wartortle: {
    growthRate: 'medium-slow',
    captureRate: 45,
    baseHappiness: 70,
    flavorText: 'Often hides in water to stalk unwary prey. For swimming fast, it moves its ears to maintain balance.',
  },
  blastoise: {
    growthRate: 'medium-slow',
    captureRate: 45,
    baseHappiness: 70,
    flavorText: 'It crushes its foe under its heavy body to cause fainting. In a pinch, it will withdraw inside its shell.',
  },
  pikachu: {
    growthRate: 'medium-fast',
    captureRate: 190,
    baseHappiness: 70,
    flavorText: 'When several of these Pokémon gather, their electricity can build and cause lightning storms.',
  },
}

// ─── Evolution chain builder (from Dex evos field) ───

function buildEvolutionChain(speciesId: SpeciesId): SpeciesData['evolutionChain'] {
  const evo = getNextEvolution(speciesId)
  if (!evo) return undefined
  return [{ trigger: evo.trigger, level: evo.minLevel, into: evo.to }]
}

// ─── Build SpeciesData from Dex + supplement ───

function buildSpeciesData(id: SpeciesId): SpeciesData {
  const dex = getSpecies(id)
  const sup = SUPPLEMENT[id]
  const i18n = SPECIES_I18N[id]
  const personality = SPECIES_PERSONALITY[id]

  if (!dex) {
    // Fallback if Dex somehow doesn't have the species (shouldn't happen for MVP)
    throw new Error(`Species ${id} not found in @pkmn/sim Dex`)
  }

  return {
    id,
    name: dex.name,
    names: i18n ?? { en: dex.name },
    dexNumber: dex.num,
    genderRate: mapGenderRatio(dex.genderRatio as { M: number; F: number } | undefined),
    baseStats: mapBaseStats(dex.baseStats),
    types: dex.types.map((t: string) => t.toLowerCase()) as [string, string?],
    baseHappiness: sup.baseHappiness,
    growthRate: sup.growthRate,
    captureRate: sup.captureRate,
    personality: personality ?? '',
    evolutionChain: buildEvolutionChain(id),
    shinyChance: 1 / 4096,
    flavorText: sup.flavorText,
  }
}

// ─── In-memory cache (built once, immutable) ───

const speciesCache = new Map<SpeciesId, SpeciesData>()

function getCached(id: SpeciesId): SpeciesData {
  let data = speciesCache.get(id)
  if (!data) {
    data = buildSpeciesData(id)
    speciesCache.set(id, data)
  }
  return data
}

// ─── Sync getters (used by all consumers) ───

/** Get species data by ID. */
export function getSpeciesData(id: SpeciesId): SpeciesData {
  return getCached(id)
}

/** Get all species data as a Record. */
export function getAllSpeciesData(): Record<SpeciesId, SpeciesData> {
  const result = {} as Record<SpeciesId, SpeciesData>
  for (const id of ALL_SPECIES_IDS) {
    result[id] = getCached(id)
  }
  return result
}

/**
 * Synchronous getter that returns the full map.
 * @deprecated Use getSpeciesData / getAllSpeciesData
 */
export const SPECIES_DATA: Record<SpeciesId, SpeciesData> = new Proxy({} as Record<SpeciesId, SpeciesData>, {
  get(_, prop: string) {
    return getSpeciesData(prop as SpeciesId)
  },
  ownKeys() {
    return ALL_SPECIES_IDS as unknown as string[]
  },
  has(_, prop) {
    return ALL_SPECIES_IDS.includes(prop as SpeciesId)
  },
  getOwnPropertyDescriptor(_, prop) {
    if (ALL_SPECIES_IDS.includes(prop as SpeciesId)) {
      return { configurable: true, enumerable: true, value: getSpeciesData(prop as SpeciesId) }
    }
    return undefined
  },
})

/** No-op — data is now built-in from @pkmn/sim */
export function ensureSpeciesData(): Promise<void> {
  return Promise.resolve()
}

/** No-op — data is now built-in from @pkmn/sim */
export async function refreshAllSpeciesData(): Promise<void> {
  // Clear cache to force rebuild
  speciesCache.clear()
}

// ─── Dex number mapping ───

export const DEX_TO_SPECIES: Record<number, SpeciesId> = {
  1: 'bulbasaur',
  2: 'ivysaur',
  3: 'venusaur',
  4: 'charmander',
  5: 'charmeleon',
  6: 'charizard',
  7: 'squirtle',
  8: 'wartortle',
  9: 'blastoise',
  25: 'pikachu',
}
