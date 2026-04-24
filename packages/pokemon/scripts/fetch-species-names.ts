/**
 * Fetch multilingual species names (en, ja, zh) from PokeAPI.
 * Generates src/dex/species-names.ts
 *
 * Usage: bun run scripts/fetch-species-names.ts
 */
import { Dex } from '@pkmn/sim'

interface SpeciesNames {
  en: string
  ja: string
  zh: string
}

async function fetchSpeciesNames(id: number): Promise<SpeciesNames | null> {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`)
    if (!res.ok) return null
    const data = await res.json() as any

    const names: SpeciesNames = { en: '', ja: '', zh: '' }
    for (const entry of data.names || []) {
      const lang = entry.language.name as string
      if (lang === 'en') names.en = entry.name
      else if (lang === 'ja') names.ja = entry.name
      else if (lang === 'zh-Hant' || lang === 'zh-Hans') names.zh = entry.name
    }
    // Fallback to English if zh/ja missing
    if (!names.zh) names.zh = names.en
    if (!names.ja) names.ja = names.en
    if (!names.en) return null

    return names
  } catch {
    return null
  }
}

async function main() {
  const rawSpecies = Dex.data.Species as Record<string, { num: number; forme?: string }>
  const species: { id: string; num: number }[] = []
  for (const [id, s] of Object.entries(rawSpecies)) {
    if (s.num > 0 && Number.isInteger(s.num) && !s.forme) {
      species.push({ id, num: s.num })
    }
  }
  species.sort((a, b) => a.num - b.num)

  console.log(`Fetching names for ${species.length} species from PokeAPI...`)

  const results: Record<string, SpeciesNames> = {}
  let fetched = 0
  const BATCH_SIZE = 20

  for (let i = 0; i < species.length; i += BATCH_SIZE) {
    const batch = species.slice(i, i + BATCH_SIZE)
    const promises = batch.map(async (s) => {
      const data = await fetchSpeciesNames(s.num)
      if (data) results[s.id] = data
      fetched++
    })
    await Promise.all(promises)
    process.stdout.write(`\rFetched ${fetched}/${species.length}...`)
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`\nFetched ${Object.keys(results).length} species names.`)

  // Generate TypeScript file
  const lines: string[] = [
    '// Auto-generated from PokeAPI. Run: bun run scripts/fetch-species-names.ts',
    '',
    'export interface SpeciesI18n { en: string; ja: string; zh: string }',
    '',
    'export const SPECIES_I18N_DATA: Record<string, SpeciesI18n> = {',
  ]

  for (const [id, data] of Object.entries(results)) {
    lines.push(`  '${id}': { en: '${data.en.replace(/'/g, "\\'")}', ja: '${data.ja}', zh: '${data.zh}' },`)
  }

  lines.push('}')
  lines.push('')

  const outputPath = new URL('../src/dex/species-names.ts', import.meta.url)
  await Bun.write(outputPath, lines.join('\n'))
  console.log(`Written to ${outputPath.pathname}`)
}

main().catch(console.error)
