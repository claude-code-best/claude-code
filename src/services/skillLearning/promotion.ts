import { readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Instinct, StoredInstinct } from './instinctParser.js'
import {
  getInstinctsDir,
  loadInstincts,
  saveInstinct,
  type InstinctStoreOptions,
} from './instinctStore.js'
import { getSkillLearningRoot } from './observationStore.js'
import type { SkillLearningProjectContext } from './types.js'

export type PromotionCandidate = {
  instinctId: string
  averageConfidence: number
  projectIds: string[]
}

export type PromotionOptions = {
  rootDir?: string
  minProjects?: number
  minConfidence?: number
}

const sessionPromotedIds = new Set<string>()

export function resetPromotionBookkeeping(): void {
  sessionPromotedIds.clear()
}

export function findPromotionCandidates(
  instincts: Instinct[],
  minProjects = 2,
  minConfidence = 0.8,
): PromotionCandidate[] {
  const grouped = new Map<string, Instinct[]>()
  for (const instinct of instincts) {
    if (instinct.scope !== 'project') continue
    const group = grouped.get(instinct.id) ?? []
    group.push(instinct)
    grouped.set(instinct.id, group)
  }

  return Array.from(grouped.entries()).flatMap(([instinctId, group]) => {
    const projectIds = Array.from(
      new Set(group.map(instinct => instinct.projectId).filter(Boolean)),
    ) as string[]
    const averageConfidence =
      group.reduce((sum, instinct) => sum + instinct.confidence, 0) /
      group.length
    if (
      projectIds.length >= minProjects &&
      averageConfidence >= minConfidence
    ) {
      return [
        {
          instinctId,
          projectIds,
          averageConfidence: Number(averageConfidence.toFixed(2)),
        },
      ]
    }
    return []
  })
}

export async function checkPromotion(
  options: PromotionOptions = {},
): Promise<PromotionCandidate[]> {
  const minProjects = options.minProjects ?? 2
  const minConfidence = options.minConfidence ?? 0.8
  const allProjectInstincts = await loadAllProjectInstincts(options.rootDir)

  const candidates = findPromotionCandidates(
    allProjectInstincts,
    minProjects,
    minConfidence,
  )
  const promoted: PromotionCandidate[] = []

  for (const candidate of candidates) {
    if (sessionPromotedIds.has(candidate.instinctId)) continue

    const source = allProjectInstincts.find(
      instinct => instinct.id === candidate.instinctId,
    )
    if (!source) continue

    const globalInstinct: StoredInstinct = {
      ...source,
      scope: 'global',
      projectId: undefined,
      projectName: undefined,
      confidence: candidate.averageConfidence,
      updatedAt: new Date().toISOString(),
    }

    const globalOptions: InstinctStoreOptions = {
      rootDir: options.rootDir,
      scope: 'global',
      project: globalProjectContext(options.rootDir),
    }
    await saveInstinct(globalInstinct, globalOptions)

    sessionPromotedIds.add(candidate.instinctId)
    promoted.push(candidate)
  }

  return promoted
}

async function loadAllProjectInstincts(
  rootDir?: string,
): Promise<StoredInstinct[]> {
  const root = getSkillLearningRoot(rootDir ? { rootDir } : undefined)
  const projectsRoot = join(root, 'projects')
  if (!existsSync(projectsRoot)) return []

  const entries = await readdir(projectsRoot, { withFileTypes: true })
  const instincts: StoredInstinct[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const project: SkillLearningProjectContext = {
      projectId: entry.name,
      projectName: entry.name,
      scope: 'project',
      source: 'git_root',
      cwd: projectsRoot,
      storageDir: join(projectsRoot, entry.name),
    }
    const projectInstincts = await loadInstincts({
      rootDir,
      project,
      scope: 'project',
    })
    instincts.push(...projectInstincts)
  }
  return instincts
}

function globalProjectContext(rootDir?: string): SkillLearningProjectContext {
  const root = getSkillLearningRoot(rootDir ? { rootDir } : undefined)
  return {
    projectId: 'global',
    projectName: 'Global',
    scope: 'global',
    source: 'global',
    cwd: root,
    storageDir: join(root, 'global'),
  }
}

// Re-export for consumers that need to inspect the global instincts directory.
export function getGlobalInstinctsDir(rootDir?: string): string {
  return getInstinctsDir({
    rootDir,
    scope: 'global',
    project: globalProjectContext(rootDir),
  })
}
