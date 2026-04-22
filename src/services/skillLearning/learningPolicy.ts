import { getSkillLearningConfig } from './config.js'
import type { Instinct } from './instinctParser.js'
import type { InstinctDomain, SkillLearningScope } from './types.js'

export const MIN_CONFIDENCE_TO_GENERATE_SKILL = 0.75
export const MAX_SKILL_NAME_LENGTH = 64

const DOMAIN_PREFIXES: Record<InstinctDomain, string> = {
  workflow: 'workflow',
  testing: 'testing',
  debugging: 'debugging',
  'code-style': 'style',
  security: 'security',
  git: 'git',
  project: 'project',
}

const GENERIC_NAMES = new Set([
  'learned-skill',
  'better-skill',
  'new-skill',
  'project-skill',
  'workflow-skill',
])

export function shouldGenerateSkillFromInstincts(
  instincts: readonly Instinct[],
): boolean {
  if (instincts.length === 0) return false
  const avg =
    instincts.reduce((sum, instinct) => sum + instinct.confidence, 0) /
    instincts.length
  return avg >= getSkillLearningConfig().minConfidence
}

export function buildLearnedSkillName(instincts: readonly Instinct[]): string {
  const domain = instincts[0]?.domain ?? 'project'
  const prefix = DOMAIN_PREFIXES[domain]
  const words = new Set<string>()
  for (const instinct of instincts) {
    for (const word of `${instinct.trigger} ${instinct.action}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (isUsefulNameWord(word)) words.add(word)
      if (words.size >= 5) break
    }
    if (words.size >= 5) break
  }

  const name = normalizeSkillName([prefix, ...words].join('-'))
  return isGenericSkillName(name) ? `${prefix}-learned-pattern` : name
}

export function normalizeSkillName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SKILL_NAME_LENGTH)
    .replace(/-$/g, '')
  return normalized || 'learned-skill'
}

export function isValidLearnedSkillName(value: string): boolean {
  return (
    value === normalizeSkillName(value) &&
    value.length > 0 &&
    value.length <= MAX_SKILL_NAME_LENGTH &&
    !isGenericSkillName(value)
  )
}

export function isGenericSkillName(value: string): boolean {
  return GENERIC_NAMES.has(value)
}

export function decideDefaultScope(
  instincts: readonly Instinct[],
): SkillLearningScope {
  if (instincts.length === 0) return 'project'
  const globalFriendly = instincts.every(instinct =>
    ['security', 'git', 'workflow'].includes(instinct.domain),
  )
  return globalFriendly && instincts.length >= 2 ? 'global' : 'project'
}

function isUsefulNameWord(word: string): boolean {
  return (
    word.length > 2 &&
    ![
      'when',
      'with',
      'this',
      'that',
      'user',
      'project',
      'prefer',
      'avoid',
      'use',
      'using',
      'the',
      'and',
      'for',
    ].includes(word)
  )
}
