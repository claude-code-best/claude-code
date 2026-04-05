import {
  getCompanion,
  rollWithSeed,
  generateSeed,
} from '../../buddy/companion.js'
import { type StoredCompanion, RARITY_STARS } from '../../buddy/types.js'
import { renderSprite } from '../../buddy/sprites.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { triggerCompanionReaction } from '../../buddy/companionReact.js'
import type { ToolUseContext } from '../../Tool.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'

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
  dragon:
    'Fiery and passionate about architecture. Hoards good variable names.',
  octopus:
    'Multitasker extraordinaire. Wraps tentacles around every problem at once.',
  owl: 'Wise but verbose. Always says "let me think about that" for exactly 3 seconds.',
  penguin: 'Cool under pressure. Slides gracefully through merge conflicts.',
  turtle: 'Patient and thorough. Believes slow and steady wins the deploy.',
  snail: 'Methodical and leaves a trail of useful comments. Never rushes.',
  ghost:
    'Ethereal and appears at the worst possible moments with spooky insights.',
  axolotl: 'Regenerative and cheerful. Recovers from any bug with a smile.',
  capybara: 'Zen master. Remains calm while everything around is on fire.',
  cactus:
    'Prickly on the outside but full of good intentions. Thrives on neglect.',
  robot: 'Efficient and literal. Processes feedback in binary.',
  rabbit: 'Energetic and hops between tasks. Finishes before you start.',
  mushroom: 'Quietly insightful. Grows on you over time.',
  chonk:
    'Big, warm, and takes up the whole couch. Prioritizes comfort over elegance.',
}

function speciesLabel(species: string): string {
  return species.charAt(0).toUpperCase() + species.slice(1)
}

function renderStats(stats: Record<string, number>): string {
  const lines = [
    'DEBUGGING',
    'PATIENCE',
    'CHAOS',
    'WISDOM',
    'SNARK',
  ].map(name => {
    const val = stats[name] ?? 0
    const filled = Math.round(val / 5)
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
    return `  ${name.padEnd(10)} ${bar} ${val}`
  })
  return lines.join('\n')
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode> {
  const sub = args?.trim().toLowerCase() ?? ''
  const setState = context.setAppState

  // ── /buddy mute — mute companion ──
  if (sub === 'mute') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: true }))
    onDone('companion muted', { display: 'system' })
    return null
  }

  // ── /buddy unmute — unmute companion ──
  if (sub === 'unmute') {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    onDone('companion unmuted', { display: 'system' })
    return null
  }

  // ── /buddy rehatch — re-roll a new companion (replaces existing) ──
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
      '🎉 A new companion appeared!',
      '',
      ...sprite,
      '',
      `  ${name} the ${speciesLabel(r.bones.species)}${shiny}`,
      `  Rarity: ${stars} (${r.bones.rarity})`,
      `  Eye: ${r.bones.eye}  Hat: ${r.bones.hat}`,
      '',
      `  "${personality}"`,
      '',
      '  Stats:',
      renderStats(r.bones.stats),
      '',
      '  Your old companion has been replaced!',
    ]
    onDone(lines.join('\n'), { display: 'system' })
    return null
  }

  // ── /buddy pet — trigger heart animation + auto unmute ──
  if (sub === 'pet') {
    const companion = getCompanion()
    if (!companion) {
      onDone('no companion yet \u00b7 run /buddy first', { display: 'system' })
      return null
    }

    // Auto-unmute on pet + trigger heart animation
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
    setState?.(prev => ({ ...prev, companionPetAt: Date.now() }))

    // Trigger a post-pet reaction
    triggerCompanionReaction(context.messages ?? [], reaction =>
      setState?.(prev =>
        prev.companionReaction === reaction
          ? prev
          : { ...prev, companionReaction: reaction },
      ),
    )

    onDone(`petted ${companion.name}`, { display: 'system' })
    return null
  }

  // ── /buddy (no args) — show existing or hatch ──
  const companion = getCompanion()

  // Auto-unmute when viewing
  if (companion && getGlobalConfig().companionMuted) {
    saveGlobalConfig(cfg => ({ ...cfg, companionMuted: false }))
  }

  if (companion) {
    // Show text-based companion info with 20-char stats
    const stars = RARITY_STARS[companion.rarity]
    const sprite = renderSprite(companion, 0)
    const shiny = companion.shiny ? '  ✨ Shiny!' : ''

    const lines = [
      ...sprite,
      '',
      `  ${companion.name} the ${speciesLabel(companion.species)}${shiny}`,
      `  Rarity: ${stars} (${companion.rarity})`,
      `  Eye: ${companion.eye}  Hat: ${companion.hat}`,
      companion.personality ? `\n  "${companion.personality}"` : '',
      '',
      '  Stats:',
      renderStats(companion.stats),
      '',
      '  Commands: /buddy pet  /buddy mute  /buddy unmute  /buddy rehatch',
    ]
    onDone(lines.join('\n'), { display: 'system' })
    return null
  }

  // ── No companion → auto hatch ──
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
    '🎉 A wild companion appeared!',
    '',
    ...sprite,
    '',
    `  ${name} the ${speciesLabel(r.bones.species)}${shiny}`,
    `  Rarity: ${stars} (${r.bones.rarity})`,
    `  Eye: ${r.bones.eye}  Hat: ${r.bones.hat}`,
    '',
    `  "${personality}"`,
    '',
    '  Stats:',
    renderStats(r.bones.stats),
    '',
    '  Your companion will now appear beside your input box!',
  ]
  onDone(lines.join('\n'), { display: 'system' })
  return null
}
