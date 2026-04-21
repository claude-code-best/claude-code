import React from 'react'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { triggerCompanionReaction } from '../../buddy/companionReact.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import {
  loadBuddyData,
  saveBuddyData,
  getDefaultBuddyData,
  migrateFromLegacy,
  getActiveCreature,
  getCreatureName,
  awardXP,
  advanceEggSteps,
  checkEvolution,
  checkEggEligibility,
  generateEgg,
  isEggReadyToHatch,
  hatchEgg,
  fetchAndCacheSprite,
  loadSprite,
  getFallbackSprite,
  getSpeciesData,
  generateCreature,
  addToParty,
  ALL_SPECIES_IDS,
  type BuddyData,
  type Creature,
  type SpeciesId,
} from '@claude-code-best/pokemon'
import { BuddyPanel } from './BuddyPanel.js'

/**
 * Load or initialize Pokémon buddy data.
 * Migrates from legacy buddy system if needed.
 */
function getOrInitBuddyData(): BuddyData {
  let data = loadBuddyData()

  // If no active creature (party empty), check for legacy companion to migrate
  if (!getActiveCreature(data) || data.creatures.length === 0) {
    const legacyCompanion = getGlobalConfig().companion
    if (legacyCompanion) {
      data = migrateFromLegacy(legacyCompanion)
      saveBuddyData(data)
    }
  }

  return data
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const sub = args?.trim().toLowerCase() ?? ''
  const setState = context.setAppState

  // ── /buddy off — mute companion ──
  if (sub === 'off') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: true }))
    onDone('companion muted', { display: 'system' })
    return null
  }

  // ── /buddy on — unmute companion ──
  if (sub === 'on') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    onDone('companion unmuted', { display: 'system' })
    return null
  }

  // ── /buddy pet — trigger heart animation + XP + egg steps ──
  if (sub === 'pet') {
    const data = getOrInitBuddyData()
    const creature = getActiveCreature(data)
    if (!creature) {
      onDone('no companion yet · run /buddy first', { display: 'system' })
      return null
    }

    // Auto-unmute + heart animation
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    setState?.(prev => ({ ...prev, companionPetAt: Date.now() }))

    // Award pet XP
    const result = awardXP(creature, 2)
    data.creatures = data.creatures.map(c =>
      c.id === creature.id ? result.creature : c,
    )

    // Advance egg steps
    if (data.eggs.length > 0) {
      data.eggs = data.eggs.map(egg => advanceEggSteps(egg, 5))

      // Check hatch
      const readyEgg = data.eggs.find(isEggReadyToHatch)
      if (readyEgg) {
        const { buddyData: updatedData, creature: newCreature } = hatchEgg(
          data,
          readyEgg,
        )
        Object.assign(data, updatedData)
        onDone(`🥚 Egg hatched! You got a ${getCreatureName(newCreature)}!`, {
          display: 'system',
        })
      }
    }

    saveBuddyData(data)

    // Trigger a post-pet reaction
    triggerCompanionReaction(context.messages ?? [], reaction =>
      setState?.(prev =>
        prev.companionReaction === reaction
          ? prev
          : { ...prev, companionReaction: reaction },
      ),
    )

    if (!data.eggs.find(isEggReadyToHatch)) {
      onDone(`petted ${getCreatureName(creature)} (+2 XP)`, {
        display: 'system',
      })
    }
    return null
  }

  // ── /buddy rename — rename current creature ──
  if (sub.startsWith('rename ')) {
    const nickname = sub.slice(7).trim()
    if (!nickname) {
      onDone('Usage: /buddy rename <name>', { display: 'system' })
      return null
    }
    const data = getOrInitBuddyData()
    const creature = getActiveCreature(data)
    if (!creature) {
      onDone('no companion yet · run /buddy first', { display: 'system' })
      return null
    }
    data.creatures = data.creatures.map(c =>
      c.id === creature.id ? { ...c, nickname } : c,
    )
    saveBuddyData(data)
    onDone(`renamed to "${nickname}"`, { display: 'system' })
    return null
  }

  // ── /buddy give-me-pokemon <species> [level] — admin: grant any Pokémon ──
  if (sub.startsWith('give-me-pokemon')) {
    const parts = sub.split(/\s+/)
    const speciesArg = parts[1]?.toLowerCase()
    const levelArg = parts[2] ? parseInt(parts[2], 10) : undefined

    if (!speciesArg) {
      const available = ALL_SPECIES_IDS.join(', ')
      onDone(`Usage: /buddy give-me-pokemon <species> [level]\nAvailable: ${available}`, { display: 'system' })
      return null
    }

    // Validate species (match by partial name or full id)
    const match = ALL_SPECIES_IDS.find(id =>
      id === speciesArg || id.includes(speciesArg),
    )
    if (!match) {
      onDone(`Unknown species "${speciesArg}". Available: ${ALL_SPECIES_IDS.join(', ')}`, { display: 'system' })
      return null
    }

    const data = getOrInitBuddyData()

    // Create the creature
    const creature = generateCreature(match)
    if (levelArg && !isNaN(levelArg) && levelArg >= 1 && levelArg <= 100) {
      creature.level = levelArg
    }

    // Add to creatures and dex
    data.creatures.push(creature)
    const existingDex = data.dex.find(d => d.speciesId === match)
    if (existingDex) {
      existingDex.caughtCount++
      existingDex.bestLevel = Math.max(existingDex.bestLevel, creature.level)
    } else {
      data.dex.push({
        speciesId: match,
        discoveredAt: Date.now(),
        caughtCount: 1,
        bestLevel: creature.level,
      })
    }

    // Try to add to party (first empty slot)
    const partyResult = addToParty(data, creature.id)
    if (partyResult.added) {
      Object.assign(data, partyResult.data)
    }
    // If party full, creature stays in creatures[] but not in party

    saveBuddyData(data)
    setState?.(prev => ({ ...prev, companionCreatureChangedAt: Date.now() }))

    const species = getSpeciesData(match)
    const name = creature.nickname ?? species.name
    onDone(`Got ${name} (${species.names.zh ?? species.name}) Lv.${creature.level}!`, { display: 'system' })
    return null
  }

  // ── /buddy (no args) — show unified BuddyPanel ──
  const data = getOrInitBuddyData()
  let creature = getActiveCreature(data)

  // Auto-unmute when viewing
  if (getGlobalConfig().companionMuted) {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
  }

  // No creature → initialize new one
  if (!creature) {
    const legacyCompanion = getGlobalConfig().companion
    if (legacyCompanion) {
      const migrated = migrateFromLegacy(legacyCompanion)
      saveBuddyData(migrated)
      creature = getActiveCreature(migrated)!
    } else {
      const defaultData = getDefaultBuddyData()
      saveBuddyData(defaultData)
      creature = getActiveCreature(defaultData)!
    }
  }

  // Pre-fetch sprite if not cached
  const spriteCached = loadSprite(creature.speciesId)
  if (!spriteCached) {
    fetchAndCacheSprite(creature.speciesId).catch(() => {})
  }

  const spriteLines =
    spriteCached?.lines ?? getFallbackSprite(creature.speciesId)

  // Reload data to get latest state after possible initialization
  const latestData = loadBuddyData()

  return React.createElement(BuddyPanel, {
    buddyData: latestData,
    spriteLines,
    onClose: () => {
      onDone('buddy panel closed', { display: 'system' })
    },
  })
}
