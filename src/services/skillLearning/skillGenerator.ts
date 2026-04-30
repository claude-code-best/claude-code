import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { clearSkillIndexCache } from '../skillSearch/localSearch.js'
import type { Instinct } from './instinctParser.js'
import { buildLearnedSkillName, normalizeSkillName } from './learningPolicy.js'
import {
  compareExistingArtifacts,
  scoreArtifactOverlap,
  type ExistingSkill,
} from './skillLifecycle.js'
import type { LearnedSkillDraft, SkillLearningScope } from './types.js'

export const DUPLICATE_SKILL_OVERLAP_THRESHOLD = 0.8
const MAX_EVIDENCE_LINES_PER_APPEND = 20
const MAX_EVIDENCE_LINES_IN_SKILL = 20
const MAX_SKILL_FILE_BYTES = 50_000

export type SkillGeneratorOptions = {
  cwd?: string
  globalSkillsDir?: string
  outputRoot?: string
  name?: string
  description?: string
}

export function generateSkillDraft(
  instincts: Instinct[],
  options?: SkillGeneratorOptions & { scope?: SkillLearningScope },
): LearnedSkillDraft {
  if (instincts.length === 0) {
    throw new Error('Cannot generate a skill draft without instincts')
  }

  const scope = options?.scope ?? instincts[0]?.scope ?? 'project'
  const name = options?.name
    ? normalizeSkillName(options.name)
    : buildSkillName(instincts)
  const confidence =
    instincts.reduce((sum, instinct) => sum + instinct.confidence, 0) /
    instincts.length
  const description = options?.description ?? buildDescription(instincts)
  const outputPath = getLearnedSkillPath(name, scope, options)
  const content = buildSkillContent({
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

export type SkillDedupOutcome =
  | { action: 'create'; draft: LearnedSkillDraft }
  | {
      action: 'append-evidence'
      target: ExistingSkill
      overlap: number
      appendedPath: string
    }

export async function generateOrMergeSkillDraft(
  instincts: Instinct[],
  options: SkillGeneratorOptions & { scope?: SkillLearningScope },
  existingRoots: string[],
): Promise<SkillDedupOutcome> {
  const draft = generateSkillDraft(instincts, options)
  const candidates = await compareExistingArtifacts(
    'skill',
    draft,
    existingRoots,
  )
  for (const candidate of candidates) {
    const overlap = scoreArtifactOverlap(draft, candidate)
    if (overlap >= DUPLICATE_SKILL_OVERLAP_THRESHOLD) {
      const appendedPath = await appendInstinctEvidenceToSkill(
        candidate,
        instincts,
      )
      return {
        action: 'append-evidence',
        target: candidate,
        overlap,
        appendedPath,
      }
    }
  }
  return { action: 'create', draft }
}

export async function appendInstinctEvidenceToSkill(
  target: ExistingSkill,
  instincts: Instinct[],
): Promise<string> {
  const existing = await readFile(target.path, 'utf8').catch(
    () => target.content,
  )

  // Skip if the file already exceeds the size cap
  if (Buffer.byteLength(existing, 'utf8') >= MAX_SKILL_FILE_BYTES) {
    return target.path
  }

  const allEvidence = instincts.flatMap(instinct =>
    instinct.evidence.map(evidence => `- ${evidence}`),
  )
  const evidenceLines = allEvidence.slice(0, MAX_EVIDENCE_LINES_PER_APPEND)
  if (evidenceLines.length < allEvidence.length) {
    evidenceLines.push(
      `- [... ${allEvidence.length - evidenceLines.length} more evidence entries omitted]`,
    )
  }

  const now = new Date().toISOString()
  const block = [
    '',
    `## Learned evidence (${now})`,
    '',
    ...evidenceLines,
    '',
  ].join('\n')
  const merged = existing.endsWith('\n')
    ? existing + block
    : `${existing}\n${block}`

  // Final guard: truncate if merged exceeds size cap
  const finalContent =
    Buffer.byteLength(merged, 'utf8') > MAX_SKILL_FILE_BYTES
      ? merged.slice(0, MAX_SKILL_FILE_BYTES)
      : merged

  await writeFile(target.path, finalContent, 'utf8')
  clearSkillIndexCache()
  return target.path
}

export async function writeLearnedSkill(
  draft: LearnedSkillDraft,
): Promise<string> {
  await mkdir(draft.outputPath, { recursive: true })
  const filePath = join(draft.outputPath, 'SKILL.md')
  await writeFile(filePath, draft.content, 'utf8')
  clearSkillIndexCache()
  try {
    const { clearCommandsCache } = await import('../../commands.js')
    clearCommandsCache()
  } catch {
    // Best effort: the next process will see the generated skill even if the
    // in-process command cache cannot be cleared due to import timing.
  }
  return filePath
}

export function getLearnedSkillPath(
  name: string,
  scope: SkillLearningScope,
  options?: SkillGeneratorOptions,
): string {
  if (options?.outputRoot) return join(options.outputRoot, name)
  if (scope === 'project') {
    return join(options?.cwd ?? process.cwd(), '.claude', 'skills', name)
  }
  return join(
    options?.globalSkillsDir ?? join(getClaudeConfigHomeDir(), 'skills'),
    name,
  )
}

function buildSkillName(instincts: Instinct[]): string {
  return buildLearnedSkillName(instincts)
}

function buildDescription(instincts: Instinct[]): string {
  const action = instincts[0]?.action ?? 'Apply a learned project pattern'
  const short = action.replace(/\s+/g, ' ').slice(0, 120)
  return short.length > 0 ? short : 'Apply learned project patterns'
}

function buildSkillContent(params: {
  name: string
  description: string
  confidence: number
  instincts: Instinct[]
}): string {
  const { name, description, confidence, instincts } = params
  const lines = [
    '---',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
    'origin: skill-learning',
    `confidence: ${Number(confidence.toFixed(2))}`,
    `evolved_from: [${instincts.map(instinct => JSON.stringify(instinct.id)).join(', ')}]`,
    '---',
    '',
    `# ${titleCase(name)}`,
    '',
    '## Trigger',
    '',
    instincts.map(instinct => `- ${instinct.trigger}`).join('\n'),
    '',
    '## Action',
    '',
    instincts.map(instinct => `- ${instinct.action}`).join('\n'),
    '',
    '## Evidence',
    '',
    instincts
      .flatMap(instinct => instinct.evidence.map(evidence => `- ${evidence}`))
      .slice(0, MAX_EVIDENCE_LINES_IN_SKILL)
      .join('\n'),
    '',
  ]
  return lines.join('\n')
}

function titleCase(value: string): string {
  return value
    .split('-')
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}
