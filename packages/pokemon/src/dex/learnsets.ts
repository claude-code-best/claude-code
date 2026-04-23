import { Dex } from '@pkmn/sim'
import type { SpeciesId, MoveSlot } from '../types'
import { EMPTY_MOVE } from '../types'

const GEN = 9

/** Get raw learnset data from Dex.data (synchronous, always available) */
function getLearnsetData(speciesId: SpeciesId): Record<string, string[]> | null {
  const entry = Dex.data.Learnsets[speciesId]
  return entry?.learnset ?? null
}

/**
 * Get level-up moves for a species.
 * Prefers the current gen (9L), falls back to the latest available gen.
 */
function getLevelUpMoves(learnset: Record<string, string[]>): { id: string; level: number }[] {
  // Collect level-up moves, preferring highest-gen data per move
  const moveMap = new Map<string, { id: string; level: number; gen: number }>()
  for (const [moveId, sources] of Object.entries(learnset)) {
    for (const src of sources) {
      const match = src.match(/^(\d+)L(\d+)$/)
      if (match) {
        const gen = parseInt(match[1]!)
        const level = parseInt(match[2]!)
        const existing = moveMap.get(moveId)
        if (!existing || gen > existing.gen) {
          moveMap.set(moveId, { id: moveId, level, gen })
        }
      }
    }
  }
  return Array.from(moveMap.values()).sort((a, b) => a.level - b.level)
}

/** Get the default moveset for a species at a given level (last 4 level-up moves) */
export async function getDefaultMoveset(speciesId: SpeciesId, level: number): Promise<[MoveSlot, MoveSlot, MoveSlot, MoveSlot]> {
  const learnset = getLearnsetData(speciesId)
  if (!learnset) return [EMPTY_MOVE, EMPTY_MOVE, EMPTY_MOVE, EMPTY_MOVE]

  const levelUpMoves = getLevelUpMoves(learnset)
  const available = levelUpMoves.filter(m => m.level <= level).slice(-4)

  const slots: MoveSlot[] = available.map(m => {
    const dexMove = Dex.moves.get(m.id)
    return { id: m.id, pp: dexMove?.pp ?? 10, maxPp: dexMove?.pp ?? 10 }
  })

  while (slots.length < 4) slots.push(EMPTY_MOVE)
  return slots as [MoveSlot, MoveSlot, MoveSlot, MoveSlot]
}

/** Get the default ability for a species (first non-hidden ability) */
export function getDefaultAbility(speciesId: SpeciesId): string {
  const species = Dex.species.get(speciesId)
  return species?.abilities?.['0']?.toLowerCase() ?? ''
}

/** Get newly learnable moves when leveling up */
export async function getNewLearnableMoves(speciesId: SpeciesId, oldLevel: number, newLevel: number): Promise<{ id: string; name: string }[]> {
  const learnset = getLearnsetData(speciesId)
  if (!learnset) return []

  const levelUpMoves = getLevelUpMoves(learnset)
  return levelUpMoves
    .filter(m => m.level > oldLevel && m.level <= newLevel)
    .map(m => {
      const dexMove = Dex.moves.get(m.id)
      return { id: m.id, name: dexMove?.name ?? m.id }
    })
}
