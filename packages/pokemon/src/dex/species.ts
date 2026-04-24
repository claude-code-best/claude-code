import { Dex } from '@pkmn/sim'
import type { SpeciesData, SpeciesId, GrowthRate } from '../types'
import { getSpecies, mapBaseStats, mapGenderRatio } from './pkmn'
import { getNextEvolution } from './evolution'
import { SPECIES_PERSONALITY } from './names'
import { getGrowthRate, getCaptureRate, getBaseHappiness } from './pokedex-data'

// ─── Dynamic species list from @pkmn/sim Dex ───

const _rawSpecies = Dex.data.Species as Record<string, { num: number; forme?: string }>
const _ids: string[] = []
for (const [id, s] of Object.entries(_rawSpecies)) {
  if (s.num > 0 && Number.isInteger(s.num) && !s.forme) {
    _ids.push(id)
  }
}
_ids.sort((a, b) => (_rawSpecies[a]?.num ?? 9999) - (_rawSpecies[b]?.num ?? 9999))

/** All base species IDs from @pkmn/sim Dex (sorted by dex number) */
export const ALL_SPECIES_IDS: SpeciesId[] = _ids

// ─── Supplementary data (fields not provided by @pkmn/sim) ───
// Only curated entries for species with known data; defaults used for others.

interface SupplementEntry {
  flavorText: string
}

const SUPPLEMENT: Partial<Record<string, SupplementEntry>> = {
  bulbasaur: {
    flavorText: 'A strange seed was planted on its back at birth. The plant sprouts and grows with this Pokémon.',
  },
  ivysaur: {
    flavorText: 'When the bulb on its back grows large, it appears to lose the ability to stand on its hind legs.',
  },
  venusaur: {
    flavorText: 'The plant blooms when it is absorbing solar energy. It stays on the move to seek sunlight.',
  },
  charmander: {
    flavorText: 'Obviously prefers hot places. When it rains, steam is said to spout from the tip of its tail.',
  },
  charmeleon: {
    flavorText: 'Tough fights could excite this Pokémon. When excited, it may blow out bluish-white flames.',
  },
  charizard: {
    flavorText: 'Spits fire that is hot enough to melt boulders. Known to cause forest fires unintentionally.',
  },
  squirtle: {
    flavorText: 'After birth, its back swells and hardens into a shell. Powerfully sprays foam from its mouth.',
  },
  wartortle: {
    flavorText: 'Often hides in water to stalk unwary prey. For swimming fast, it moves its ears to maintain balance.',
  },
  blastoise: {
    flavorText: 'It crushes its foe under its heavy body to cause fainting. In a pinch, it will withdraw inside its shell.',
  },
  pikachu: {
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
  const personality = SPECIES_PERSONALITY[id]

  if (!dex) {
    throw new Error(`Species ${id} not found in @pkmn/sim Dex`)
  }

  return {
    id,
    name: dex.name,
    names: { en: dex.name },
    dexNumber: dex.num,
    genderRate: mapGenderRatio(dex.genderRatio as { M: number; F: number } | undefined),
    baseStats: mapBaseStats(dex.baseStats),
    types: dex.types.map((t: string) => t.toLowerCase()) as [string, string?],
    baseHappiness: getBaseHappiness(id),
    growthRate: getGrowthRate(id) as GrowthRate,
    captureRate: getCaptureRate(id),
    personality: personality ?? '',
    evolutionChain: buildEvolutionChain(id),
    shinyChance: 1 / 4096,
    flavorText: SUPPLEMENT[id]?.flavorText ?? '',
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

// ─── Dex number mapping (dynamic) ───

export const DEX_TO_SPECIES: Record<number, SpeciesId> = (() => {
  const map: Record<number, SpeciesId> = {}
  for (const id of ALL_SPECIES_IDS) {
    const s = _rawSpecies[id]
    if (s) map[s.num] = id
  }
  return map
})()
