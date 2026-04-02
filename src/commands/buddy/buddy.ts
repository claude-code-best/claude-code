import {
  getCompanion,
  rollWithSeed,
  generateSeed,
} from '../../buddy/companion.js'
import {
  type StoredCompanion,
  RARITY_STARS,
  STAT_NAMES,
} from '../../buddy/types.js'
import { renderSprite } from '../../buddy/sprites.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import type { LocalCommandCall } from '../../types/command.js'

// Species → default name fragments for hatch (no API needed)
const SPECIES_NAMES: Record<string, string> = {
  duck: 'Waddles',
  goose: 'Goosberry',
  blob: 'Gooey',
  cat: 'Whiskers',
  dragon: 'Ember',
  octopus: 'Inky',
  owl: 'Hoots',
  penguin: 'Waddleford',
  turtle: 'Shelly',
  snail: 'Trailblazer',
  ghost: 'Casper',
  axolotl: 'Axie',
  capybara: 'Chill',
  cactus: 'Spike',
  robot: 'Byte',
  rabbit: 'Flops',
  mushroom: 'Spore',
  chonk: 'Chonk',
}

const SPECIES_PERSONALITY: Record<string, string> = {
  duck: 'Quirky and easily amused. Leaves rubber duck debugging tips everywhere.',
  goose: 'Assertive and honks at bad code. Takes no prisoners in code reviews.',
  blob: 'Adaptable and goes with the flow. Sometimes splits into two when confused.',
  cat: 'Independent and judgmental. Watches you type with mild disdain.',
  dragon: 'Fiery and passionate about architecture. Hoards good variable names.',
  octopus: 'Multitasker extraordinaire. Wraps tentacles around every problem at once.',
  owl: 'Wise but verbose. Always says "let me think about that" for exactly 3 seconds.',
  penguin: 'Cool under pressure. Slides gracefully through merge conflicts.',
  turtle: 'Patient and thorough. Believes slow and steady wins the deploy.',
  snail: 'Methodical and leaves a trail of useful comments. Never rushes.',
  ghost: 'Ethereal and appears at the worst possible moments with spooky insights.',
  axolotl: 'Regenerative and cheerful. Recovers from any bug with a smile.',
  capybara: 'Zen master. Remains calm while everything around is on fire.',
  cactus: 'Prickly on the outside but full of good intentions. Thrives on neglect.',
  robot: 'Efficient and literal. Processes feedback in binary.',
  rabbit: 'Energetic and hops between tasks. Finishes before you start.',
  mushroom: 'Quietly insightful. Grows on you over time.',
  chonk: 'Big, warm, and takes up the whole couch. Prioritizes comfort over elegance.',
}

function speciesLabel(species: string): string {
  return species.charAt(0).toUpperCase() + species.slice(1)
}

function renderStats(stats: Record<string, number>): string {
  const lines = STAT_NAMES.map(name => {
    const val = stats[name] ?? 0
    const filled = Math.round(val / 5)
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
    return `  ${name.padEnd(10)} ${bar} ${val}`
  })
  return lines.join('\n')
}

export const call: LocalCommandCall = async (args, _context) => {
  const sub = args.trim().toLowerCase()
  const config = getGlobalConfig()

  // /buddy — show current companion or hint to hatch
  if (sub === '') {
    const companion = getCompanion()
    if (!companion) {
      return {
        type: 'text',
        value:
          "You don't have a companion yet! Use /buddy hatch to get one.",
      }
    }
    const stars = RARITY_STARS[companion.rarity]
    const sprite = renderSprite(companion, 0)
    const shiny = companion.shiny ? '  ✨ Shiny!' : ''

    const lines = [
      sprite.join('\n'),
      '',
      `  ${companion.name} the ${speciesLabel(companion.species)}${shiny}`,
      `  Rarity: ${stars} (${companion.rarity})`,
      `  Eye: ${companion.eye}  Hat: ${companion.hat}`,
      companion.personality ? `\n  "${companion.personality}"` : '',
      '',
      '  Stats:',
      renderStats(companion.stats),
      '',
      '  Commands: /buddy pet  /buddy off  /buddy on  /buddy hatch  /buddy rehatch',
    ]
    return { type: 'text', value: lines.join('\n') }
  }

  // /buddy hatch — create a new companion
  if (sub === 'hatch') {
    if (config.companion) {
      return {
        type: 'text',
        value: `You already have a companion! Use /buddy to see it.\n(Tip: /buddy hatch again will re-roll a new one.)`,
      }
    }

    const seed = generateSeed()
    const r = rollWithSeed(seed)
    const name = SPECIES_NAMES[r.bones.species] ?? 'Buddy'
    const personality =
      SPECIES_PERSONALITY[r.bones.species] ?? 'Mysterious and code-savvy.'

    const stored: StoredCompanion = {
      name,
      personality,
      seed,
      hatchedAt: Date.now(),
    }

    saveGlobalConfig(cfg => ({ ...cfg, companion: stored }))

    const stars = RARITY_STARS[r.bones.rarity]
    const sprite = renderSprite(r.bones, 0)
    const shiny = r.bones.shiny ? '  ✨ Shiny!' : ''

    const lines = [
      '  🎉 A wild companion appeared!',
      '',
      sprite.join('\n'),
      '',
      `  ${name} the ${speciesLabel(r.bones.species)}${shiny}`,
      `  Rarity: ${stars} (${r.bones.rarity})`,
      `  "${personality}"`,
      '',
      '  Your companion will now appear beside your input box!',
    ]
    return { type: 'text', value: lines.join('\n') }
  }

  // /buddy pet — trigger heart animation
  if (sub === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      return {
        type: 'text',
        value:
          "You don't have a companion yet! Use /buddy hatch to get one.",
      }
    }

    try {
      const { setAppState } = await import('../../state/AppStateStore.js')
      setAppState(prev => ({
        ...prev,
        companionPetAt: Date.now(),
      }))
    } catch {
      // non-interactive mode — AppState not available
    }

    return {
      type: 'text',
      value: `  ${renderSprite(companion, 0).join('\n')}\n\n  ${companion.name} purrs happily! ♥`,
    }
  }

  // /buddy mute | /buddy off
  if (sub === 'mute' || sub === 'off') {
    if (config.companionMuted) {
      return { type: 'text', value: '  Companion is already muted.' }
    }
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: true }))
    return { type: 'text', value: '  Companion muted. It will hide quietly. Use /buddy unmute to bring it back.' }
  }

  // /buddy unmute | /buddy on
  if (sub === 'unmute' || sub === 'on') {
    if (!config.companionMuted) {
      return { type: 'text', value: '  Companion is not muted.' }
    }
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    return { type: 'text', value: '  Companion unmuted! Welcome back.' }
  }

  // /buddy rehatch — re-roll a new companion (replaces existing)
  if (sub === 'rehatch') {
    const seed = generateSeed()
    const r = rollWithSeed(seed)
    const name = SPECIES_NAMES[r.bones.species] ?? 'Buddy'
    const personality =
      SPECIES_PERSONALITY[r.bones.species] ?? 'Mysterious and code-savvy.'

    const stored: StoredCompanion = {
      name,
      personality,
      seed,
      hatchedAt: Date.now(),
    }

    saveGlobalConfig(cfg => ({ ...cfg, companion: stored }))

    const stars = RARITY_STARS[r.bones.rarity]
    const sprite = renderSprite(r.bones, 0)
    const shiny = r.bones.shiny ? '  ✨ Shiny!' : ''

    const lines = [
      '  🎉 A new companion appeared!',
      '',
      sprite.join('\n'),
      '',
      `  ${name} the ${speciesLabel(r.bones.species)}${shiny}`,
      `  Rarity: ${stars} (${r.bones.rarity})`,
      `  "${personality}"`,
      '',
      '  Your old companion has been replaced!',
    ]
    return { type: 'text', value: lines.join('\n') }
  }

  // Unknown subcommand
  return {
    type: 'text',
    value:
      '  Unknown command: /buddy ' +
      sub +
      '\n  Commands: /buddy (info)  /buddy hatch  /buddy rehatch  /buddy pet  /buddy off  /buddy on',
  }
}
