import { Dex } from '@pkmn/sim'
import type { SpeciesId } from '../types'

export interface EvolutionChainStep {
  from: SpeciesId
  to: SpeciesId
  trigger: 'level_up' | 'item' | 'trade' | 'friendship'
  minLevel?: number
}

/** Find the next evolution for a species, dynamically from Dex */
export function getNextEvolution(speciesId: SpeciesId): EvolutionChainStep | undefined {
  const dex = Dex.species.get(speciesId)
  if (!dex?.evos?.length) return undefined

  // Take the first evolution target (most species have single evo path)
  const target = dex.evos[0]!.toLowerCase()

  const targetDex = Dex.species.get(target)
  if (!targetDex?.exists) return undefined

  const trigger = dex.evoType === 'trade' ? 'trade'
    : dex.evoType === 'useItem' ? 'item'
    : dex.evoType === 'levelFriendship' ? 'friendship'
    : 'level_up'

  return {
    from: speciesId,
    to: target as SpeciesId,
    trigger,
    minLevel: targetDex.evoLevel ?? undefined,
  }
}
