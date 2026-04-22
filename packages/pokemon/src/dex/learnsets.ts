import { Dex } from '@pkmn/sim'
import type { SpeciesId, MoveSlot } from '../types'
import { EMPTY_MOVE } from '../types'

const GEN = 9

/** Get the default moveset for a species at a given level (last 4 level-up moves) */
export async function getDefaultMoveset(speciesId: SpeciesId, level: number): Promise<[MoveSlot, MoveSlot, MoveSlot, MoveSlot]> {
  const learnset = await Dex.learnsets.get(speciesId)
  if (!learnset?.learnset) return [EMPTY_MOVE, EMPTY_MOVE, EMPTY_MOVE, EMPTY_MOVE]

  const levelUpMoves: { id: string; level: number }[] = []
  for (const [moveId, sources] of Object.entries(learnset.learnset)) {
    for (const src of sources as string[]) {
      if (src.startsWith(`${GEN}L`)) {
        levelUpMoves.push({ id: moveId, level: parseInt(src.slice(2)) })
        break
      }
    }
  }

  levelUpMoves.sort((a, b) => a.level - b.level)
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
  const learnset = await Dex.learnsets.get(speciesId)
  if (!learnset?.learnset) return []

  const result: { id: string; name: string }[] = []
  for (const [moveId, sources] of Object.entries(learnset.learnset)) {
    for (const src of sources as string[]) {
      if (src.startsWith(`${GEN}L`)) {
        const moveLevel = parseInt(src.slice(2))
        if (moveLevel > oldLevel && moveLevel <= newLevel) {
          const dexMove = Dex.moves.get(moveId)
          result.push({ id: moveId, name: dexMove?.name ?? moveId })
        }
        break
      }
    }
  }
  return result
}
