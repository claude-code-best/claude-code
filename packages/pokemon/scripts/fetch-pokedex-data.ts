/**
 * Fetch base_experience, EV yield, and growth_rate for all species from PokeAPI.
 * Generates src/dex/pokedex-data.ts
 *
 * Usage: bun run scripts/fetch-pokedex-data.ts
 */
import { Dex } from '@pkmn/sim'

const GROWTH_RATE_MAP: Record<string, string> = {
  'slow-then-very-fast': 'erratic',
  'fast-then-very-slow': 'fluctuating',
  'medium': 'medium-fast',
  'medium-slow': 'medium-slow',
  'slow': 'slow',
  'fast': 'fast',
}

const STAT_MAP: Record<string, string> = {
  'hp': 'hp',
  'attack': 'atk',
  'defense': 'def',
  'special-attack': 'spa',
  'special-defense': 'spd',
  'speed': 'spe',
}

interface SpeciesPokedex {
  baseExperience: number
  evs: Record<string, number>
  growthRate: string
  captureRate: number
  baseHappiness: number
  hatchCounter: number
}

async function fetchSpeciesData(id: number): Promise<SpeciesPokedex | null> {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
    if (!res.ok) return null
    const data = await res.json() as any

    // Get growth rate from species endpoint
    const speciesRes = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`)
    if (!speciesRes.ok) return null
    const speciesData = await speciesRes.json() as any

    const evs: Record<string, number> = {}
    for (const stat of data.stats || []) {
      if (stat.effort > 0) {
        const statName = STAT_MAP[stat.stat.name]
        if (statName) evs[statName] = stat.effort
      }
    }

    const growthRateName = GROWTH_RATE_MAP[speciesData.growth_rate?.name] ?? 'medium-slow'

    return {
      baseExperience: data.base_experience ?? 50,
      evs,
      growthRate: growthRateName,
      captureRate: speciesData.capture_rate ?? 45,
      baseHappiness: speciesData.base_happiness ?? 70,
      hatchCounter: speciesData.hatch_counter ?? 20,
    }
  } catch {
    return null
  }
}

async function main() {
  // Get all base species IDs from Dex
  const rawSpecies = Dex.data.Species as Record<string, { num: number; forme?: string }>
  const species: { id: string; num: number }[] = []
  for (const [id, s] of Object.entries(rawSpecies)) {
    if (s.num > 0 && Number.isInteger(s.num) && !s.forme) {
      species.push({ id, num: s.num })
    }
  }
  species.sort((a, b) => a.num - b.num)

  console.log(`Fetching data for ${species.length} species from PokeAPI...`)

  const results: Record<string, SpeciesPokedex> = {}
  let fetched = 0
  const BATCH_SIZE = 20

  for (let i = 0; i < species.length; i += BATCH_SIZE) {
    const batch = species.slice(i, i + BATCH_SIZE)
    const promises = batch.map(async (s) => {
      const data = await fetchSpeciesData(s.num)
      if (data) results[s.id] = data
      fetched++
    })
    await Promise.all(promises)
    process.stdout.write(`\rFetched ${fetched}/${species.length}...`)
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\nFetched ${Object.keys(results).length} species.`)

  // Generate TypeScript file
  const lines: string[] = [
    '// Auto-generated from PokeAPI. Run: bun run scripts/fetch-pokedex-data.ts',
    '// eslint-disable-next-line @typescript-eslint/no-extraneous-class',
    'export interface PokedexEntry {',
    '  baseExperience: number',
    '  evs: Record<string, number>',
    '  growthRate: string',
    '  captureRate: number',
    '  baseHappiness: number',
    '  hatchCounter?: number',
    '}',
    '',
    'export const POKEDEX_DATA: Record<string, PokedexEntry> = {',
  ]

  for (const [id, data] of Object.entries(results)) {
    const evsStr = Object.keys(data.evs).length > 0
      ? `{ ${Object.entries(data.evs).map(([k, v]) => `${k}: ${v}`).join(', ')} }`
      : '{}'
    lines.push(`  '${id}': { baseExperience: ${data.baseExperience}, evs: ${evsStr}, growthRate: '${data.growthRate}', captureRate: ${data.captureRate}, baseHappiness: ${data.baseHappiness}, hatchCounter: ${data.hatchCounter} },`)
  }

  lines.push('}')
  lines.push('')

  const outputPath = new URL('../src/dex/pokedex-data.ts', import.meta.url)
  await Bun.write(outputPath, lines.join('\n'))
  console.log(`Written to ${outputPath.pathname}`)
}

main().catch(console.error)
