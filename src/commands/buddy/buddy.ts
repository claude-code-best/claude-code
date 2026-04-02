/**
 * /buddy command implementation — hatch, show, pet, mute/unmute a coding companion.
 *
 * Phase 1: local-only soul generation (no remote API / model calls).
 */
import type { ToolUseContext } from '../../Tool.js'
import { getCompanion, companionUserId, roll } from '../../buddy/companion.js'
import { renderSprite } from '../../buddy/sprites.js'
import {
  RARITY_STARS,
  STAT_NAMES,
  type Companion,
  type CompanionBones,
  type CompanionSoul,
} from '../../buddy/types.js'
import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

// ─── Local Soul Generation (Phase 1) ────────────────────────

// Deterministic name pool — keyed by species so each species has its own flavour.
const SPECIES_NAMES: Record<string, string[]> = {
  duck:     ['Quibble', 'Waddle', 'Brine', 'Preen', 'Ducky'],
  goose:    ['Honk', 'Gander', 'Hissy', 'Plume', 'Gouda'],
  blob:     ['Gloop', 'Ooze', 'Pudge', 'Squish', 'Bloop'],
  cat:      ['Miso', 'Kibble', 'Paws', 'Noodle', 'Soot'],
  dragon:   ['Cinder', 'Ember', 'Scorch', 'Flint', 'Ash'],
  octopus:  ['Inky', 'Squid', 'Tentsy', 'Coral', 'Depth'],
  owl:      ['Hoot', 'Sage', 'Dusk', 'Talon', 'Gloom'],
  penguin:  ['Waddle', 'Frost', 'Tux', 'Chill', 'Sleet'],
  turtle:   ['Shell', 'Mossy', 'Plod', 'Basalt', 'Crag'],
  snail:    ['Trail', 'Glide', 'Oozy', 'Spiral', 'Slick'],
  ghost:    ['Wisp', 'Shade', 'Haunt', 'Murk', 'Phan'],
  axolotl:  ['Gill', 'Lotl', 'Axle', 'Bubble', 'Frond'],
  capybara: ['Bara', 'Mellow', 'Loaf', 'Pudge', 'Cappy'],
  cactus:   ['Spike', 'Prick', 'Thorn', 'Verde', 'Dry'],
  robot:    ['Bolt', 'Beep', 'Cog', 'Sparky', 'Chip'],
  rabbit:   ['Thump', 'Clover', 'Hop', 'Flop', 'Bun'],
  mushroom: ['Spore', 'Cap', 'Morel', 'Fungi', 'Pith'],
  chonk:    ['Chunk', 'Lump', 'Fluff', 'Thicc', 'Plop'],
}

const STAT_PERSONALITIES: Record<string, string[]> = {
  DEBUGGING: [
    'Spots bugs before the linter does.',
    'Silently judges your error handling.',
    'Thinks every off-by-one is personal.',
  ],
  PATIENCE: [
    'Will wait for your build. Forever.',
    'Never rushes you, even at 3 AM.',
    'Watches long CI runs without blinking.',
  ],
  CHAOS: [
    'Encourages you to mass-rename things.',
    'Wants you to refactor during a deploy.',
    'Suggests deleting the tests "just to see".',
  ],
  WISDOM: [
    'Quotes the Gang of Four unprompted.',
    'Knows when to YAGNI and when not to.',
    'Has opinions about your architecture.',
  ],
  SNARK: [
    'Comments on your variable names.',
    'Rates your commits out of 10.',
    'Thinks your code "has character".',
  ],
}

export function buildLocalSoul(
  bones: CompanionBones,
  inspirationSeed: number,
): CompanionSoul {
  // Pick name deterministically from species pool
  const names = SPECIES_NAMES[bones.species] ?? ['Buddy']
  const nameIndex = Math.abs(inspirationSeed) % names.length
  const name = names[nameIndex]!

  // Pick personality from highest stat
  let topStat = STAT_NAMES[0]!
  let topVal = 0
  for (const s of STAT_NAMES) {
    if (bones.stats[s] > topVal) {
      topVal = bones.stats[s]
      topStat = s
    }
  }
  const personalityPool = STAT_PERSONALITIES[topStat] ?? STAT_PERSONALITIES.SNARK!
  const personalityIndex = Math.abs(inspirationSeed >> 8) % personalityPool.length
  const personality = personalityPool[personalityIndex]!

  return { name, personality }
}

export function hatchCompanion(): Companion {
  const userId = companionUserId()
  const { bones, inspirationSeed } = roll(userId)
  const soul = buildLocalSoul(bones, inspirationSeed)
  const hatchedAt = Date.now()

  saveGlobalConfig(current => ({
    ...current,
    companion: { name: soul.name, personality: soul.personality, hatchedAt },
    companionMuted: false,
  }))

  return { ...bones, ...soul, hatchedAt }
}

// ─── Card Formatting ─────────────────────────────────────────

export function formatCompanionCard(companion: Companion): string {
  const stars = RARITY_STARS[companion.rarity]
  const sprite = renderSprite(companion, 0)
  const shinyTag = companion.shiny ? ' ✨ SHINY' : ''

  const lines = [
    '',
    ...sprite,
    '',
    `  ${companion.name}`,
    `  ${companion.species} · ${companion.rarity.toUpperCase()} ${stars}${shinyTag}`,
    '',
    `  ${companion.personality}`,
    '',
    ...STAT_NAMES.map(stat => {
      const val = companion.stats[stat]
      const filled = Math.floor(val / 10)
      const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
      return `  ${stat.padEnd(12)} ${bar} ${val}`
    }),
    '',
    `  ${companion.name} is here · it'll chime in as you code`,
    `  say its name to get its take · /buddy pet · /buddy off`,
  ]
  return lines.join('\n')
}

export function formatHatchMessage(companion: Companion): string {
  return [
    'hatching a coding buddy…',
    "it'll watch you work and occasionally have opinions",
    formatCompanionCard(companion),
  ].join('\n')
}

// ─── Command Entry Point ─────────────────────────────────────

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: ToolUseContext & LocalJSXCommandContext,
  args: string,
): Promise<React.ReactNode | null> {
  const subcommand = (args ?? '').trim().toLowerCase()

  switch (subcommand) {
    case 'off': {
      saveGlobalConfig(current => ({ ...current, companionMuted: true }))
      onDone('companion muted', { display: 'system' })
      return null
    }

    case 'on': {
      saveGlobalConfig(current => ({ ...current, companionMuted: false }))
      onDone('companion unmuted', { display: 'system' })
      return null
    }

    case 'pet': {
      const companion = getCompanion()
      if (!companion) {
        onDone('no companion yet · run /buddy first', { display: 'system' })
        return null
      }
      // Auto-unmute when petting
      if (getGlobalConfig().companionMuted) {
        saveGlobalConfig(current => ({ ...current, companionMuted: false }))
      }
      context.setAppState(prev => ({ ...prev, companionPetAt: Date.now() }))
      onDone(undefined, { display: 'skip' })
      return null
    }

    case '': {
      // No args: hatch or show
      const existing = getCompanion()
      if (existing) {
        onDone(formatCompanionCard(existing), { display: 'system' })
      } else {
        const companion = hatchCompanion()
        onDone(formatHatchMessage(companion), { display: 'system' })
      }
      return null
    }

    default: {
      onDone('usage: /buddy [pet|off|on]', { display: 'system' })
      return null
    }
  }
}
