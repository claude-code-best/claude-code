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
  SPECIES_DATA,
  type BuddyData,
  type Creature,
} from '@claude-code-best/pokemon'
import { BuddyPanel } from './BuddyPanel.js'

/**
 * Load or initialize Pokémon buddy data.
 * Migrates from legacy buddy system if needed.
 */
function getOrInitBuddyData(): BuddyData {
  let data = loadBuddyData()

  // If no active creature, check for legacy companion to migrate
  if (!data.activeCreatureId || data.creatures.length === 0) {
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

  // ── /buddy switch — switch active creature ──
  if (sub === 'switch') {
    const data = getOrInitBuddyData()
    if (data.creatures.length <= 1) {
      onDone('You only have one buddy!', { display: 'system' })
      return null
    }
    const lines = data.creatures.map((c, i) => {
      const name = getCreatureName(c)
      const species = SPECIES_DATA[c.speciesId]
      const active = c.id === data.activeCreatureId ? ' ← active' : ''
      return `${i + 1}. ${name} (${species.names.zh ?? species.name}) Lv.${c.level}${active}`
    })
    onDone(
      ['Switch buddy:', ...lines, '', 'Use: /buddy switch <number>'].join('\n'),
      { display: 'system' },
    )
    return null
  }

  if (sub.startsWith('switch ')) {
    const num = parseInt(sub.slice(7).trim(), 10)
    const data = getOrInitBuddyData()
    if (isNaN(num) || num < 1 || num > data.creatures.length) {
      onDone('Invalid number. Use /buddy switch to see list.', {
        display: 'system',
      })
      return null
    }
    const creature = data.creatures[num - 1]!
    data.activeCreatureId = creature.id
    saveBuddyData(data)
    onDone(`Switched to ${getCreatureName(creature)}!`, { display: 'system' })
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
