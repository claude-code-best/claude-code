import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { clearCommandsCache } from '../../commands.js'
import type { Instinct } from './instinctParser.js'
import { normalizeSkillName } from './learningPolicy.js'
import type { SkillLearningScope } from './types.js'

export type CommandGeneratorOptions = {
  cwd?: string
  globalCommandsDir?: string
  outputRoot?: string
  name?: string
  description?: string
  scope?: SkillLearningScope
}

export type LearnedCommandDraft = {
  name: string
  description: string
  scope: SkillLearningScope
  sourceInstinctIds: string[]
  confidence: number
  content: string
  outputPath: string
}

export function generateCommandDraft(
  instincts: Instinct[],
  options?: CommandGeneratorOptions,
): LearnedCommandDraft {
  if (instincts.length === 0) {
    throw new Error('Cannot generate a command draft without instincts')
  }

  const scope = options?.scope ?? instincts[0]?.scope ?? 'project'
  const rawName = options?.name ?? buildCommandName(instincts)
  const name = normalizeSkillName(rawName)
  const confidence = averageConfidence(instincts)
  const description = options?.description ?? buildDescription(instincts)
  const outputPath = getLearnedCommandPath(name, scope, options)
  const content = buildCommandContent({
    name,
    description,
    confidence,
    instincts,
  })

  return {
    name,
    description,
    scope,
    sourceInstinctIds: instincts.map(instinct => instinct.id),
    confidence: Number(confidence.toFixed(2)),
    content,
    outputPath,
  }
}

export async function writeLearnedCommand(
  draft: LearnedCommandDraft,
): Promise<string> {
  await mkdir(draft.outputPath, { recursive: true })
  const filePath = join(draft.outputPath, `${draft.name}.md`)
  if (existsSync(filePath)) return filePath
  await writeFile(filePath, draft.content, 'utf8')
  clearCommandsCache()
  return filePath
}

export function getLearnedCommandPath(
  _name: string,
  scope: SkillLearningScope,
  options?: CommandGeneratorOptions,
): string {
  if (options?.outputRoot) return options.outputRoot
  if (scope === 'project') {
    return join(options?.cwd ?? process.cwd(), '.claude', 'commands')
  }
  return (
    options?.globalCommandsDir ?? join(getClaudeConfigHomeDir(), 'commands')
  )
}

function buildCommandName(instincts: Instinct[]): string {
  const words = extractWords(instincts, 4)
  const name = ['learned', ...words].join('-')
  return normalizeSkillName(name) || 'learned-command'
}

function buildDescription(instincts: Instinct[]): string {
  const trigger = instincts[0]?.trigger ?? 'Reuse the learned workflow'
  return trigger.replace(/\s+/g, ' ').slice(0, 120)
}

function buildCommandContent(params: {
  name: string
  description: string
  confidence: number
  instincts: Instinct[]
}): string {
  const { name, description, confidence, instincts } = params
  return [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    'origin: skill-learning',
    `confidence: ${Number(confidence.toFixed(2))}`,
    `evolved_from: [${instincts.map(instinct => JSON.stringify(instinct.id)).join(', ')}]`,
    '---',
    '',
    `# /${name}`,
    '',
    '## When to use',
    '',
    instincts.map(instinct => `- ${instinct.trigger}`).join('\n'),
    '',
    '## Steps',
    '',
    instincts.map(instinct => `- ${instinct.action}`).join('\n'),
    '',
    '## Evidence',
    '',
    instincts
      .flatMap(instinct => instinct.evidence.map(evidence => `- ${evidence}`))
      .join('\n'),
    '',
  ].join('\n')
}

function averageConfidence(instincts: Instinct[]): number {
  return (
    instincts.reduce((sum, instinct) => sum + instinct.confidence, 0) /
    instincts.length
  )
}

function extractWords(instincts: Instinct[], max: number): string[] {
  const stopWords = new Set([
    'when',
    'with',
    'this',
    'that',
    'user',
    'asks',
    'for',
    'the',
    'and',
    'run',
    'use',
    'prefer',
    'avoid',
  ])
  const words: string[] = []
  for (const instinct of instincts) {
    for (const token of `${instinct.trigger} ${instinct.action}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (token.length > 2 && !stopWords.has(token) && !words.includes(token)) {
        words.push(token)
      }
      if (words.length >= max) return words
    }
  }
  return words
}
