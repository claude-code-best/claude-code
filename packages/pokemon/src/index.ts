// Types
export type {
  StatName,
  NatureName,
  NatureStat,
  NatureEffect,
  MoveSlot,
  ItemId,
  PCBox,
  BagEntry,
  Bag,
  SpeciesId,
  Gender,
  EvolutionTrigger,
  EvolutionCondition,
  GrowthRate,
  SpeciesData,
  Creature,
  Egg,
  DexEntry,
  BuddyData,
  StatsResult,
  EvolutionResult,
  SpriteCache,
  AnimMode,
} from './types'
export { STAT_NAMES, STAT_LABELS, ALL_SPECIES_IDS, EMPTY_MOVE } from './types'

// Data
export { SPECIES_DATA, DEX_TO_SPECIES, getSpeciesData, getAllSpeciesData, ensureSpeciesData, refreshAllSpeciesData } from './dex/species'
export { DEFAULT_EV_MAPPING, getEVForTool, MAX_EV_PER_STAT, MAX_EV_TOTAL } from './dex/evMapping'
export { xpForLevel, levelFromXp, xpToNextLevel } from './dex/xpTable'
export { SPECIES_NAMES, SPECIES_I18N, SPECIES_PERSONALITY } from './dex/names'
export { getAllNatureNames, randomNature, getNatureEffect } from './dex/nature'
export { getNextEvolution } from './dex/evolution'
export { getDefaultMoveset, getDefaultAbility, getNewLearnableMoves } from './dex/learnsets'
export { FROM_DEX_STAT, TO_DEX_STAT } from './dex/pkmn'

// Battle
export type { BattleState, BattlePokemon, BattleEvent, BattleResult, PlayerAction, MoveOption, StatusCondition } from './battle/types'
export { createBattle, executeTurn, type BattleInit } from './battle/engine'
export { settleBattle, applyMoveLearn, applyEvolution } from './battle/settlement'
export { chooseAIMove } from './battle/ai'

// Core
export { generateCreature, calculateStats, getCreatureName, recalculateLevel, getActiveCreature, getTotalEV } from './core/creature'
export { determineGender, getGenderSymbol } from './core/gender'
export { awardXP, getXpProgress } from './core/experience'
export { awardEV, awardTurnEV, getEVSummary, resetEVCooldowns } from './core/effort'
export { checkEvolution, evolve, canEvolveFurther } from './core/evolution'
export { checkEggEligibility, generateEgg, advanceEggSteps, isEggReadyToHatch, hatchEgg, EGG_REQUIRED_DAYS } from './core/egg'
export {
  loadBuddyData, saveBuddyData, getDefaultBuddyData, migrateFromLegacy,
  updateDailyStats, incrementTurns,
  addToParty, removeFromParty, swapPartySlots, setActivePartyMember,
  depositToBox, withdrawFromBox, moveInBox, renameBox,
  findCreatureLocation, releaseCreature, getTotalCreatureCount, getAllCreatureIds,
  addItemToBag, removeItemFromBag, getItemCount,
} from './core/storage'
export { loadSprite, fetchAndCacheSprite, getSpeciesDisplay } from './core/spriteCache'

// Sprites
export { renderAnimatedSprite, getIdleAnimMode, getPetOverlay } from './sprites/renderer'
export { getFallbackSprite } from './sprites/fallback'

// UI Components
export { CompanionCard } from './ui/CompanionCard'
export { PokedexView } from './ui/PokedexView'
export { EggView } from './ui/EggView'
export { EvolutionAnim } from './ui/EvolutionAnim'
export { StatBar } from './ui/StatBar'
export { SpeciesDetail } from './ui/SpeciesDetail'
export { SpriteAnimator } from './ui/SpriteAnimator'
export { BattleConfigPanel } from './ui/BattleConfigPanel'
export { BattleView } from './ui/BattleView'
export { SwitchPanel } from './ui/SwitchPanel'
export { ItemPanel } from './ui/ItemPanel'
export { BattleResultPanel } from './ui/BattleResultPanel'
export { MoveLearnPanel } from './ui/MoveLearnPanel'
export { BattleFlow } from './ui/BattleFlow'
