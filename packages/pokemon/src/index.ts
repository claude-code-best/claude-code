// Types
export type {
	StatName,
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
export { STAT_NAMES, STAT_LABELS, ALL_SPECIES_IDS } from './types'

// Data
export { SPECIES_DATA, DEX_TO_SPECIES } from './data/species'
export { DEFAULT_EV_MAPPING, getEVForTool, MAX_EV_PER_STAT, MAX_EV_TOTAL } from './data/evMapping'
export { xpForLevel, levelFromXp, xpToNextLevel } from './data/xpTable'
export { SPECIES_NAMES, SPECIES_I18N, SPECIES_PERSONALITY } from './data/names'
export { getNextEvolution, EVOLUTION_CHAINS } from './data/evolution'

// Core
export { generateCreature, calculateStats, getCreatureName, recalculateLevel, getActiveCreature, getTotalEV } from './core/creature'
export { determineGender, getGenderSymbol } from './core/gender'
export { awardXP, getXpProgress } from './core/experience'
export { awardEV, awardTurnEV, getEVSummary, resetEVCooldowns } from './core/effort'
export { checkEvolution, evolve, canEvolveFurther } from './core/evolution'
export { checkEggEligibility, generateEgg, advanceEggSteps, isEggReadyToHatch, hatchEgg } from './core/egg'
export { loadBuddyData, saveBuddyData, getDefaultBuddyData, migrateFromLegacy, updateDailyStats, incrementTurns } from './core/storage'
export { loadSprite, fetchAndCacheSprite, getSpeciesDisplay } from './core/spriteCache'

// Sprites
export { renderAnimatedSprite, getIdleAnimMode } from './sprites/renderer'
export { getFallbackSprite } from './sprites/fallback'

// UI Components
export { CompanionCard } from './ui/CompanionCard'
export { PokedexView } from './ui/PokedexView'
export { EggView } from './ui/EggView'
export { EvolutionAnim } from './ui/EvolutionAnim'
export { StatBar } from './ui/StatBar'
export { SpeciesDetail } from './ui/SpeciesDetail'
