import type { Gender, SpeciesData } from '../types'

/**
 * Determine gender based on species gender ratio.
 * genderRate: -1 = genderless, 0 = always male, 1-7 = female chance = genderRate/8, 8 = always female
 *
 * Gen 3+ style: PID low byte (0-255) compared directly against genderRate * 32.
 * If value < genderRate * 32 → female, otherwise male.
 */
export function determineGender(speciesData: SpeciesData, seed: number): Gender {
  if (speciesData.genderRate === -1) return 'genderless'
  if (speciesData.genderRate === 0) return 'male'
  if (speciesData.genderRate === 8) return 'female'
  // Direct comparison: genderRate maps 0-8 to threshold 0-255 in steps of 32
  const threshold = speciesData.genderRate * 32
  return (seed % 256) < threshold ? 'female' : 'male'
}

/** Get gender symbol for display */
export function getGenderSymbol(gender: Gender): string {
  switch (gender) {
    case 'male':
      return '♂'
    case 'female':
      return '♀'
    case 'genderless':
      return ''
  }
}
