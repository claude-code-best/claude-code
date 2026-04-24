import type { SpeciesId } from '../types'

/** Curated English names (Dex provides default names for all species) */
export const SPECIES_NAMES: Partial<Record<string, string>> = {
  bulbasaur: 'Bulbasaur',
  ivysaur: 'Ivysaur',
  venusaur: 'Venusaur',
  charmander: 'Charmander',
  charmeleon: 'Charmeleon',
  charizard: 'Charizard',
  squirtle: 'Squirtle',
  wartortle: 'Wartortle',
  blastoise: 'Blastoise',
  pikachu: 'Pikachu',
}

/** Curated multilingual names (falls back to English from Dex) */
const CURATED_I18N: Partial<Record<string, Record<string, string>>> = {
  bulbasaur: { en: 'Bulbasaur', ja: 'フシギダネ', zh: '妙蛙种子' },
  ivysaur: { en: 'Ivysaur', ja: 'フシギソウ', zh: '妙蛙草' },
  venusaur: { en: 'Venusaur', ja: 'フシギバナ', zh: '妙蛙花' },
  charmander: { en: 'Charmander', ja: 'ヒトカゲ', zh: '小火龙' },
  charmeleon: { en: 'Charmeleon', ja: 'リザード', zh: '火恐龙' },
  charizard: { en: 'Charizard', ja: 'リザードン', zh: '喷火龙' },
  squirtle: { en: 'Squirtle', ja: 'ゼニガメ', zh: '杰尼龟' },
  wartortle: { en: 'Wartortle', ja: 'カメール', zh: '卡咪龟' },
  blastoise: { en: 'Blastoise', ja: 'カメックス', zh: '水箭龟' },
  pikachu: { en: 'Pikachu', ja: 'ピカチュウ', zh: '皮卡丘' },
}

// Try loading auto-generated multilingual data (from fetch-species-names.ts)
let generatedI18n: Record<string, Record<string, string>> = {}
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./species-names.ts') as { SPECIES_I18N_DATA?: Record<string, { en: string; ja: string; zh: string }> }
  if (mod.SPECIES_I18N_DATA) {
    generatedI18n = mod.SPECIES_I18N_DATA
  }
} catch {
  // species-names.ts not generated yet — use curated fallback
}

/** Get multilingual name for a species. Falls back to Dex English name. */
export function getSpeciesI18nName(speciesId: SpeciesId, lang: string): string {
  const generated = generatedI18n[speciesId]
  if (generated) return generated[lang] ?? generated.en ?? speciesId
  const curated = CURATED_I18N[speciesId]
  if (curated) return curated[lang] ?? curated.en ?? speciesId
  return speciesId
}

/** All available multilingual names (curated + auto-generated) */
export const SPECIES_I18N: Partial<Record<string, Record<string, string>>> = {
  ...CURATED_I18N,
  ...generatedI18n,
}

/** Curated personality descriptions (falls back to empty string) */
export const SPECIES_PERSONALITY: Partial<Record<string, string>> = {
  bulbasaur: 'Calm and collected, a reliable partner',
  ivysaur: 'Steady growth, patient and resilient',
  venusaur: 'Majestic and powerful, a natural leader',
  charmander: 'Energetic and curious, loves adventure',
  charmeleon: 'Fierce and determined, always pushing forward',
  charizard: 'Proud and strong-willed, a formidable ally',
  squirtle: 'Cheerful and playful, adapts easily',
  wartortle: 'Loyal and protective, wise beyond years',
  blastoise: 'Steadfast and powerful, a defensive fortress',
  pikachu: 'Friendly and energetic, always by your side',
}
