import { Dex } from '@pkmn/sim'
import type { SpeciesId } from '../types'
import { getCaptureRate } from '../dex/pokedex-data'

/**
 * Gen 9 capture rate calculation.
 * Returns { captured: boolean, shakes: 0-3 }
 *
 * Formula:
 *   a = (3 * maxHP - 2 * currentHP) * catchRate * ballModifier / (3 * maxHP)
 *   b = 65536 / (255 / a) ^ (1/4)   (shake probability)
 *   For each of 4 shakes: if random(0,65535) < b → pass, else → break out
 */

/** Pokeball catch rate modifiers */
const BALL_MODIFIERS: Record<string, number> = {
  pokeball: 1,
  greatball: 1.5,
  ultraball: 2,
  masterball: 255, // always catches
  netball: 3.5, // bug/water bonus (applied below)
  diveball: 3.5, // underwater/surfing
  nestball: 1, // scales with level (applied below)
  repeatball: 3.5, // if already caught
  timerball: 1, // scales with turns (applied below)
  duskball: 3.5, // night/cave
  quickball: 5, // first turn
  luxuryball: 1,
  premierball: 1,
  cherishball: 1,
  healball: 1,
  friendball: 1,
  levelball: 1,
  lureball: 1,
  moonball: 1,
  loveball: 1,
  heavyball: 1,
  fastball: 1,
  sportball: 1,
  parkball: 255,
  beastball: 5, // Ultra Beasts
}

/** Status condition catch rate multiplier */
const STATUS_MODIFIERS: Record<string, number> = {
  none: 1,
  poison: 1.5,
  bad_poison: 1.5,
  burn: 1.5,
  paralysis: 1.5,
  freeze: 2,
  sleep: 2.5,
}

export interface CaptureResult {
  captured: boolean
  shakes: number // 0-3 (3 means captured)
  critical: boolean // critical capture (Gen 5+)
}

/**
 * Calculate capture attempt.
 * @param speciesId Opponent species
 * @param currentHp Opponent current HP
 * @param maxHp Opponent max HP
 * @param ballId Pokeball item ID
 * @param status Opponent status condition
 * @param turn Current battle turn number
 * @param isFirstTurn Whether it's the first turn of battle
 * @param isNight Whether it's nighttime (for Dusk Ball)
 * @param alreadyCaught Whether this species has been caught before (for Repeat Ball)
 * @param opponentLevel Opponent's level (for Nest Ball)
 */
export function attemptCapture(
  speciesId: SpeciesId,
  currentHp: number,
  maxHp: number,
  ballId: string,
  status: string = 'none',
  turn: number = 1,
  isFirstTurn: boolean = false,
  isNight: boolean = false,
  alreadyCaught: boolean = false,
  opponentLevel: number = 50,
): CaptureResult {
  const catchRate = getCaptureRate(speciesId)

  // Master Ball always catches
  if (ballId === 'masterball' || catchRate === 255) {
    return { captured: true, shakes: 3, critical: false }
  }

  // Calculate ball modifier with conditional bonuses
  let ballModifier = BALL_MODIFIERS[ballId.toLowerCase()] ?? 1

  // Quick Ball: 5x on first turn, 1x otherwise
  if (ballId === 'quickball') {
    ballModifier = isFirstTurn ? 5 : 1
  }

  // Timer Ball: up to 4x after 10 turns
  if (ballId === 'timerball') {
    ballModifier = Math.min(4, 1 + (turn - 1) * 3 / 10)
  }

  // Nest Ball: better for lower level wild Pokémon
  if (ballId === 'nestball') {
    ballModifier = Math.max(1, (40 - opponentLevel) / 10)
  }

  // Dusk Ball: 3.5x at night or in caves
  if (ballId === 'duskball') {
    ballModifier = isNight ? 3.5 : 1
  }

  // Repeat Ball: 3.5x if already caught
  if (ballId === 'repeatball') {
    ballModifier = alreadyCaught ? 3.5 : 1
  }

  // Net Ball: 3.5x for Bug or Water types
  if (ballId === 'netball') {
    const species = Dex.species.get(speciesId)
    if (species?.types?.some((t: string) => t.toLowerCase() === 'bug' || t.toLowerCase() === 'water')) {
      ballModifier = 3.5
    }
  }

  // Status modifier
  const statusMod = STATUS_MODIFIERS[status] ?? 1

  // Catch rate formula (Gen 9)
  const hpFactor = (3 * maxHp - 2 * currentHp) / (3 * maxHp)
  const catchValue = hpFactor * catchRate * ballModifier * statusMod
  const a = Math.min(255, Math.floor(catchValue))

  // Shake probability
  const b = Math.floor(65536 / Math.pow(255 / Math.max(1, a), 0.25))

  // Perform 3 shake checks (4th check is automatic if all 3 pass)
  let shakes = 0
  let captured = true
  for (let i = 0; i < 3; i++) {
    const roll = Math.floor(Math.random() * 65536)
    if (roll < b) {
      shakes++
    } else {
      captured = false
      break
    }
  }

  // Critical capture check (Gen 5+, rare)
  const dexCount = 0 // Could track Pokedex completion rate
  const criticalChance = Math.min(255, Math.floor(catchValue * dexCount / 256))
  const critical = criticalChance > 0 && Math.floor(Math.random() * 256) < criticalChance

  if (critical) {
    // Critical capture only needs 1 shake
    const roll = Math.floor(Math.random() * 65536)
    captured = roll < b
    return { captured, shakes: captured ? 1 : 0, critical: true }
  }

  return { captured, shakes, critical: false }
}
