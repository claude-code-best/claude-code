import { Dex } from '@pkmn/sim'
import type { BattlePokemon } from './types'

/**
 * AI move selection: prefers super-effective moves, avoids resisted moves,
 * falls back to random among usable moves.
 */
export function chooseAIMove(pokemon: BattlePokemon, opponentTypes?: string[]): number {
  const usable = pokemon.moves
    .map((m, i) => ({ move: m, index: i }))
    .filter(({ move }) => move.pp > 0 && !move.disabled)

  if (usable.length === 0) return 0 // Struggle

  // If no opponent type info, pick randomly
  if (!opponentTypes || opponentTypes.length === 0) {
    return usable[Math.floor(Math.random() * usable.length)]!.index
  }

  // Classify moves by effectiveness against opponent
  const superEffective: number[] = []
  const neutral: number[] = []
  const resisted: number[] = []
  const statusMoves: number[] = [] // Lowest priority

  for (const { move, index } of usable) {
    const dexMove = Dex.moves.get(move.id)
    if (!dexMove?.type) {
      neutral.push(index)
      continue
    }

    const moveType = dexMove.type // Keep original case for Dex.getEffectiveness
    // Status moves and charge moves are lowest priority
    if (dexMove.category === 'Status' || dexMove.flags?.charge) {
      statusMoves.push(index)
      continue
    }

    // Check effectiveness against all opponent types using Dex.getEffectiveness
    let totalEffectiveness = 0
    for (const rawOppType of opponentTypes) {
      // Dex.getEffectiveness expects capitalized type names
      const oppType = rawOppType.charAt(0).toUpperCase() + rawOppType.slice(1)
      totalEffectiveness += Dex.getEffectiveness(moveType, oppType)
    }

    if (totalEffectiveness > 0) {
      superEffective.push(index)
    } else if (totalEffectiveness < 0) {
      resisted.push(index)
    } else {
      neutral.push(index)
    }
  }

  // Priority: super-effective (70%) > neutral > super-effective (30%) > resisted > status
  const rand = Math.random()
  if (superEffective.length > 0 && rand < 0.7) {
    return superEffective[Math.floor(Math.random() * superEffective.length)]!
  }
  if (neutral.length > 0) {
    return neutral[Math.floor(Math.random() * neutral.length)]!
  }
  if (superEffective.length > 0) {
    return superEffective[Math.floor(Math.random() * superEffective.length)]!
  }
  if (resisted.length > 0) {
    return resisted[Math.floor(Math.random() * resisted.length)]!
  }
  // Only status moves available
  return statusMoves[Math.floor(Math.random() * statusMoves.length)]!
}
