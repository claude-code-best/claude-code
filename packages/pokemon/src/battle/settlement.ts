import type { StatName, SpeciesId } from '../types'
import { STAT_NAMES } from '../types'
import { TO_DEX_STAT } from '../dex/pkmn'
import type { BattleResult } from './types'
import type { BuddyData } from '../types'
import { levelFromXp } from '../dex/xpTable'
import { getSpeciesData } from '../dex/species'
import { MAX_EV_PER_STAT, MAX_EV_TOTAL } from '../dex/evMapping'
import { Dex } from '@pkmn/sim'
import { getBaseExperience, getEvYield as getPokedexEvYield } from '../dex/pokedex-data'

/**
 * Settle battle results: XP, EV, level ups, move learning, evolution detection.
 */
export async function settleBattle(
  data: BuddyData,
  result: BattleResult,
  opponentSpeciesId: SpeciesId,
  opponentLevel: number,
): Promise<{
  data: BuddyData
  learnableMoves: { creatureId: string; moveId: string; moveName: string }[]
  pendingEvolutions: { creatureId: string; from: SpeciesId; to: SpeciesId }[]
}> {
  if (result.winner !== 'player') {
    return { data, learnableMoves: [], pendingEvolutions: [] }
  }

  // Calculate XP reward using real base_experience from PokeAPI
  const baseXp = getBaseExperience(opponentSpeciesId)
  const xpGained = Math.max(1, Math.floor(baseXp * opponentLevel / 7))

  // Calculate EV reward using real EV yield from PokeAPI
  const evGained: Record<StatName, number> = { hp: 0, attack: 0, defense: 0, spAtk: 0, spDef: 0, speed: 0 }
  const evYield = getPokedexEvYield(opponentSpeciesId)
  for (const stat of STAT_NAMES) {
    evGained[stat] = evYield[TO_DEX_STAT[stat]] ?? 0
  }

  // Award XP/EV to participant creatures
  const learnableMoves: { creatureId: string; moveId: string; moveName: string }[] = []
  const pendingEvolutions: { creatureId: string; from: SpeciesId; to: SpeciesId }[] = []
  const participantIds = new Set(result.participantIds.length > 0 ? result.participantIds : data.party.filter((id): id is string => id !== null))

  const updatedCreatures: typeof data.creatures = []
  for (const creature of data.creatures) {
    if (!participantIds.has(creature.id)) {
      updatedCreatures.push(creature)
      continue
    }

    // Award EVs (capped)
    const newEv = { ...creature.ev }
    let totalEV = STAT_NAMES.reduce((sum, s) => sum + newEv[s], 0)
    for (const stat of STAT_NAMES) {
      if (totalEV >= MAX_EV_TOTAL) break
      const gain = Math.min(evGained[stat], MAX_EV_PER_STAT - newEv[stat], MAX_EV_TOTAL - totalEV)
      newEv[stat] += gain
      totalEV += gain
    }

    // Award XP
    const oldLevel = creature.level
    const newTotalXp = creature.totalXp + xpGained
    const species = getSpeciesData(creature.speciesId)
    const newLevel = Math.min(100, levelFromXp(newTotalXp, species.growthRate))

    // Detect new learnable moves on level up
    if (newLevel > oldLevel) {
      const learnset = await Dex.learnsets.get(creature.speciesId)
      if (learnset?.learnset) {
        for (const [moveId, sources] of Object.entries(learnset.learnset)) {
          for (const src of sources as string[]) {
            if (src.startsWith('9L')) {
              const moveLevel = parseInt(src.slice(2))
              if (moveLevel > oldLevel && moveLevel <= newLevel) {
                const dexMove = Dex.moves.get(moveId)
                learnableMoves.push({
                  creatureId: creature.id,
                  moveId,
                  moveName: dexMove?.name ?? moveId,
                })
              }
              break
            }
          }
        }
      }
    }

    // Detect evolution — check ALL evolution targets (handles branch evolutions)
    if (newLevel > oldLevel) {
      const species = Dex.species.get(creature.speciesId)
      if (species?.evos?.length) {
        for (const evoId of species.evos) {
          const targetId = evoId.toLowerCase()
          const target = Dex.species.get(targetId)
          if (!target?.exists) continue
          const trigger = species.evoType
          // Level-up evolutions
          if ((!trigger || trigger === 'levelUp') && target.evoLevel && newLevel >= target.evoLevel) {
            pendingEvolutions.push({
              creatureId: creature.id,
              from: creature.speciesId,
              to: targetId as SpeciesId,
            })
            break // Only evolve into one target per level-up
          }
          // Friendship evolutions (friendship >= 220)
          if (trigger === 'levelFriendship' && creature.friendship >= 220) {
            pendingEvolutions.push({
              creatureId: creature.id,
              from: creature.speciesId,
              to: targetId as SpeciesId,
            })
            break
          }
        }
      }
    }

    updatedCreatures.push({
      ...creature,
      level: newLevel,
      totalXp: newTotalXp,
      ev: newEv,
    })
  }

  // Update data
  const updatedData: BuddyData = {
    ...data,
    creatures: updatedCreatures,
    stats: {
      ...data.stats,
      battlesWon: data.stats.battlesWon + (result.winner === 'player' ? 1 : 0),
      battlesLost: data.stats.battlesLost + (result.winner !== 'player' ? 1 : 0),
    },
  }

  return { data: updatedData, learnableMoves, pendingEvolutions }
}

/**
 * Apply move learning - replace a move at the given index.
 */
export function applyMoveLearn(
  data: BuddyData,
  creatureId: string,
  moveId: string,
  replaceIndex: number,
): BuddyData {
  return {
    ...data,
    creatures: data.creatures.map(c => {
      if (c.id !== creatureId) return c
      const dexMove = Dex.moves.get(moveId)
      const newMoves = [...c.moves] as typeof c.moves
      newMoves[replaceIndex] = {
        id: moveId,
        pp: dexMove?.pp ?? 10,
        maxPp: dexMove?.pp ?? 10,
      }
      return { ...c, moves: newMoves as typeof c.moves }
    }),
  }
}

/**
 * Apply evolution to a creature.
 */
export function applyEvolution(
  data: BuddyData,
  creatureId: string,
  newSpeciesId: SpeciesId,
): BuddyData {
  return {
    ...data,
    creatures: data.creatures.map(c =>
      c.id === creatureId
        ? { ...c, speciesId: newSpeciesId, friendship: Math.min(255, c.friendship + 10) }
        : c,
    ),
    stats: {
      ...data.stats,
      totalEvolutions: data.stats.totalEvolutions + 1,
    },
  }
}
