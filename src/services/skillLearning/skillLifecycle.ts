import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { clearSkillIndexCache } from '../skillSearch/localSearch.js'
import type { LearnedSkillDraft } from './types.js'
import { writeLearnedSkill } from './skillGenerator.js'

export type ExistingSkill = {
  name: string
  path: string
  description: string
  content: string
  confidence?: number
  status?: 'active' | 'superseded' | 'archived' | 'deleted'
  referencedBy?: string[]
  safeToDelete?: boolean
  quality?: 'low' | 'medium' | 'high'
}

export type SkillLifecycleDecision =
  | { type: 'create'; draft: LearnedSkillDraft; reason: string }
  | { type: 'merge'; targetSkill: ExistingSkill; patch: string; reason: string }
  | {
      type: 'replace'
      targetSkill: ExistingSkill
      draft: LearnedSkillDraft
      reason: string
      hardDelete?: boolean
    }
  | { type: 'archive'; targetSkill: ExistingSkill; reason: string }
  | {
      type: 'delete'
      targetSkill: ExistingSkill
      reason: string
      confirmed?: boolean
    }

export type ReplacementManifest = {
  oldSkill: string
  oldPath: string
  newSkill?: string
  newPath?: string
  action: 'archive' | 'delete'
  reason: string
  replacedAt: string
  recoverable: boolean
}

export type SkillLifecycleOptions = {
  allowHardDelete?: boolean
  archiveRoot?: string
  manifestRoot?: string
  now?: Date
}

export type LearnedArtifactKind = 'skill' | 'command' | 'agent'

export type ArtifactDraft = {
  name: string
  description: string
  content: string
}

export async function compareExistingArtifacts(
  kind: LearnedArtifactKind,
  draft: ArtifactDraft,
  rootsOrSkills: string[] | ExistingSkill[],
): Promise<ExistingSkill[]> {
  const existing =
    rootsOrSkills.length > 0 && typeof rootsOrSkills[0] === 'string'
      ? await loadExistingArtifacts(kind, rootsOrSkills as string[])
      : (rootsOrSkills as ExistingSkill[])
  const draftTerms = terms(
    `${draft.name} ${draft.description} ${draft.content}`,
  )
  return existing
    .map(skill => ({
      skill,
      score: overlapScore(
        draftTerms,
        terms(`${skill.name} ${skill.description} ${skill.content}`),
      ),
    }))
    .filter(item => item.score >= 0.18)
    .sort((a, b) => b.score - a.score)
    .map(item => item.skill)
}

export async function compareExistingSkills(
  draft: LearnedSkillDraft,
  rootsOrSkills: string[] | ExistingSkill[],
): Promise<ExistingSkill[]> {
  return compareExistingArtifacts('skill', draft, rootsOrSkills)
}

export async function loadExistingArtifacts(
  kind: LearnedArtifactKind,
  roots: string[],
): Promise<ExistingSkill[]> {
  if (kind === 'skill') return loadExistingSkills(roots)
  const results: ExistingSkill[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    await collectArtifactFiles(root, results)
  }
  return results
}

export function decideSkillLifecycle(
  draft: LearnedSkillDraft,
  existingSkills: ExistingSkill[],
  options: Pick<SkillLifecycleOptions, 'allowHardDelete'> = {},
): SkillLifecycleDecision {
  const deletable = existingSkills.find(skill => isSafeToHardDelete(skill))
  if (options.allowHardDelete && deletable) {
    return {
      type: 'delete',
      targetSkill: deletable,
      reason:
        'Existing skill is low quality, unreferenced, and safe to delete.',
      confirmed: true,
    }
  }

  const target = existingSkills[0]
  if (!target) {
    return {
      type: 'create',
      draft,
      reason: 'No overlapping active skill found.',
    }
  }

  const draftTerms = terms(
    `${draft.name} ${draft.description} ${draft.content}`,
  )
  const existingTerms = terms(
    `${target.name} ${target.description} ${target.content}`,
  )
  const score = overlapScore(draftTerms, existingTerms)

  if (
    score >= 0.72 &&
    draft.confidence >= 0.75 &&
    shouldReplaceSkill(draft, target)
  ) {
    return {
      type: 'replace',
      targetSkill: target,
      draft,
      reason: `New learned skill has high overlap (${score.toFixed(2)}) and higher confidence.`,
    }
  }

  if (score >= 0.35) {
    return {
      type: 'merge',
      targetSkill: target,
      patch: buildMergePatch(draft),
      reason: `Existing skill overlaps with the learned pattern (${score.toFixed(2)}).`,
    }
  }

  return { type: 'create', draft, reason: 'Overlap is too low to merge.' }
}

export async function applySkillLifecycleDecision(
  decision: SkillLifecycleDecision,
  options: SkillLifecycleOptions = {},
): Promise<{
  activePath?: string
  archivedPath?: string
  deletedPath?: string
  manifestPath?: string
  tombstonePath?: string
}> {
  switch (decision.type) {
    case 'create': {
      return { activePath: await writeLearnedSkill(decision.draft) }
    }
    case 'merge': {
      if (!isSkillLearningGenerated(decision.targetSkill)) {
        process.stderr.write(
          `[skill-learning] skip user-authored skill: ${decision.targetSkill.path}\n`,
        )
        return {}
      }
      return {
        activePath: await writeMergePatch(decision.targetSkill, decision.patch),
      }
    }
    case 'replace': {
      if (!isSkillLearningGenerated(decision.targetSkill)) {
        process.stderr.write(
          `[skill-learning] skip user-authored skill: ${decision.targetSkill.path}\n`,
        )
        return {}
      }
      // Archive/delete the superseded skill before the replacement is
      // written so that any search-index refresh between the two steps can
      // never observe both skills active simultaneously. `decision.draft
      // .outputPath` is the exact path `writeLearnedSkill` will target.
      const predictedNewPath = decision.draft.outputPath
      if (decision.hardDelete) {
        const { deletedPath, manifestPath, tombstonePath } = await deleteSkill(
          decision.targetSkill,
          decision.reason,
          {
            newSkill: decision.draft.name,
            newPath: predictedNewPath,
          },
          { ...options, allowHardDelete: true },
        )
        const activePath = await writeLearnedSkill(decision.draft)
        return { activePath, deletedPath, manifestPath, tombstonePath }
      }
      const { archivedPath, manifestPath } = await archiveSkill(
        decision.targetSkill,
        decision.reason,
        {
          newSkill: decision.draft.name,
          newPath: predictedNewPath,
        },
        options,
      )
      const activePath = await writeLearnedSkill(decision.draft)
      return { activePath, archivedPath, manifestPath }
    }
    case 'archive':
      return await archiveSkill(
        decision.targetSkill,
        decision.reason,
        undefined,
        options,
      )
    case 'delete':
      return await deleteSkill(
        decision.targetSkill,
        decision.reason,
        undefined,
        {
          ...options,
          allowHardDelete:
            options.allowHardDelete && decision.confirmed !== false,
        },
      )
  }
}

export async function loadExistingSkills(
  roots: string[],
): Promise<ExistingSkill[]> {
  const skills: ExistingSkill[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    await collectSkillFiles(root, skills)
  }
  return skills
}

export async function archiveSkill(
  skill: ExistingSkill,
  reason: string,
  replacement?: { newSkill?: string; newPath?: string },
  options: SkillLifecycleOptions = {},
): Promise<{ archivedPath: string; manifestPath: string }> {
  const skillDir = dirname(skill.path)
  const archiveRoot = options.archiveRoot ?? join(dirname(skillDir), '.archive')
  const archivedPath = join(
    archiveRoot,
    `${basename(skillDir)}-${timestamp(options.now)}`,
  )
  await mkdir(archiveRoot, { recursive: true })
  await rename(skillDir, archivedPath)
  const manifestPath = await writeReplacementManifest(
    options.manifestRoot ?? archivedPath,
    {
      oldSkill: skill.name,
      oldPath: skill.path,
      newSkill: replacement?.newSkill,
      newPath: replacement?.newPath,
      action: 'archive',
      reason,
      replacedAt: (options.now ?? new Date()).toISOString(),
      recoverable: true,
    },
  )
  clearSkillIndexCache()
  return { archivedPath, manifestPath }
}

export async function deleteSkill(
  skill: ExistingSkill,
  reason: string,
  replacement?: { newSkill?: string; newPath?: string },
  options: SkillLifecycleOptions = {},
): Promise<{
  deletedPath: string
  manifestPath: string
  tombstonePath: string
}> {
  if (!options.allowHardDelete) {
    throw new Error('Hard delete requires allowHardDelete=true')
  }

  const skillDir = dirname(skill.path)
  const content = existsSync(skill.path)
    ? await readFile(skill.path, 'utf8')
    : ''
  const manifestRoot =
    options.manifestRoot ?? join(dirname(skillDir), '.tombstones')
  const manifestPath = await writeReplacementManifest(manifestRoot, {
    oldSkill: skill.name,
    oldPath: skill.path,
    newSkill: replacement?.newSkill,
    newPath: replacement?.newPath,
    action: 'delete',
    reason,
    replacedAt: (options.now ?? new Date()).toISOString(),
    recoverable: false,
  })
  const tombstonePath = join(
    manifestRoot,
    `${skill.name}-${timestamp(options.now)}.tombstone.json`,
  )
  await writeFile(
    tombstonePath,
    `${JSON.stringify({ deletedSkill: skill.name, oldPath: skill.path, content }, null, 2)}\n`,
    'utf8',
  )
  await rm(skillDir, { recursive: true, force: true })
  clearSkillIndexCache()
  return { deletedPath: skill.path, manifestPath, tombstonePath }
}

export async function writeReplacementManifest(
  directory: string,
  manifest: ReplacementManifest,
): Promise<string> {
  await mkdir(directory, { recursive: true })
  const manifestPath = join(directory, 'replacement-manifest.json')
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )
  return manifestPath
}

async function writeMergePatch(
  skill: ExistingSkill,
  patch: string,
): Promise<string> {
  const patchPath = join(dirname(skill.path), 'learned-skill.patch.md')
  await writeFile(patchPath, patch, 'utf8')
  clearSkillIndexCache()
  return patchPath
}

function buildMergePatch(draft: LearnedSkillDraft): string {
  return [
    '# Learned Skill Merge Patch',
    '',
    `Target learned skill: ${draft.name}`,
    `Confidence: ${draft.confidence}`,
    '',
    '## Suggested additions',
    '',
    draft.content,
  ].join('\n')
}

function shouldReplaceSkill(
  draft: LearnedSkillDraft,
  target: ExistingSkill,
): boolean {
  if (target.status === 'superseded' || target.status === 'archived')
    return true
  const confidenceGap = draft.confidence - (target.confidence ?? 0.5)
  const contentGap = draft.content.length - target.content.length
  return confidenceGap >= 0.15 || contentGap > 160
}

function isSafeToHardDelete(skill: ExistingSkill): boolean {
  return (
    skill.safeToDelete === true &&
    (skill.referencedBy?.length ?? 0) === 0 &&
    skill.quality === 'low'
  )
}

function timestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-')
}

async function collectSkillFiles(
  root: string,
  results: ExistingSkill[],
): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '.archive') continue
      await collectSkillFiles(full, results)
      continue
    }
    if (entry.isFile() && entry.name === 'SKILL.md') {
      const content = await readFile(full, 'utf8')
      results.push({
        name: parseFrontmatter(content, 'name') ?? basename(dirname(full)),
        description: parseFrontmatter(content, 'description') ?? '',
        path: full,
        content,
      })
    }
  }
}

async function collectArtifactFiles(
  root: string,
  results: ExistingSkill[],
): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '.archive') continue
      await collectArtifactFiles(full, results)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const content = await readFile(full, 'utf8')
      results.push({
        name:
          parseFrontmatter(content, 'name') ?? entry.name.replace(/\.md$/, ''),
        description: parseFrontmatter(content, 'description') ?? '',
        path: full,
        content,
      })
    }
  }
}

function parseFrontmatter(content: string, key: string): string | undefined {
  // Restrict the search to the actual YAML frontmatter block between the
  // opening `---` and the next `---`. A naked body line like
  // `origin: skill-learning` in a user-authored doc must NOT be mistaken
  // for a generated-skill marker.
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) return undefined
  const match = fmMatch[1].match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, 'm'))
  return match?.[1]?.trim()
}

function isSkillLearningGenerated(skill: ExistingSkill): boolean {
  return parseFrontmatter(skill.content, 'origin') === 'skill-learning'
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(term => term.length > 2),
  )
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const term of a) {
    if (b.has(term)) intersection++
  }
  return intersection / Math.min(a.size, b.size)
}

export function scoreArtifactOverlap(
  draft: ArtifactDraft,
  existing: { name: string; description: string; content: string },
): number {
  const draftTerms = terms(
    `${draft.name} ${draft.description} ${draft.content}`,
  )
  const existingTerms = terms(
    `${existing.name} ${existing.description} ${existing.content}`,
  )
  return overlapScore(draftTerms, existingTerms)
}
