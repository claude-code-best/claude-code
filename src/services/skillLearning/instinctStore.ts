import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import {
  getSkillLearningRoot,
  type ObservationStoreOptions,
  type SkillLearningProjectContext,
  type SkillLearningScope,
} from './observationStore.js'
import {
  clampConfidence,
  isContradictingInstinct,
  normalizeInstinct,
  parseInstinct,
  serializeInstinct,
  type StoredInstinct,
} from './instinctParser.js'

let upsertQueue: Promise<unknown> = Promise.resolve()

export type InstinctStoreOptions = ObservationStoreOptions & {
  project?: SkillLearningProjectContext
  scope?: SkillLearningScope
}

export function getInstinctsDir(options?: InstinctStoreOptions): string {
  const root = getSkillLearningRoot(options)
  const project = options?.project
  const scope = options?.scope ?? project?.scope ?? 'project'

  if (scope === 'global' || !project || project.projectId === 'global') {
    return join(root, 'global', 'instincts', 'personal')
  }
  return join(root, 'projects', project.projectId, 'instincts', 'personal')
}

export async function saveInstinct(
  instinct: StoredInstinct,
  options?: InstinctStoreOptions,
): Promise<StoredInstinct> {
  const normalized = normalizeInstinct(instinct)
  const dir = getInstinctsDir(options)
  await mkdir(dir, { recursive: true })
  const target = instinctPath(normalized.id, options)
  const tmp = `${target}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(tmp, serializeInstinct(normalized))
  await rename(tmp, target)
  return normalized
}

export async function loadInstincts(
  options?: InstinctStoreOptions,
): Promise<StoredInstinct[]> {
  const dir = getInstinctsDir(options)
  let files: string[] = []
  try {
    files = await readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }

  const instincts: StoredInstinct[] = []
  for (const file of files.filter(file => file.endsWith('.json'))) {
    const content = await readFile(join(dir, file), 'utf8')
    instincts.push(parseInstinct(content))
  }

  return instincts.sort((a, b) => a.id.localeCompare(b.id))
}

export function upsertInstinct(
  incoming: StoredInstinct,
  options?: InstinctStoreOptions,
): Promise<StoredInstinct> {
  const result = upsertQueue.then(() => doUpsertInstinct(incoming, options))
  upsertQueue = result.catch(() => {})
  return result
}

async function doUpsertInstinct(
  incoming: StoredInstinct,
  options?: InstinctStoreOptions,
): Promise<StoredInstinct> {
  const existing = await loadInstincts(options)
  // Match by ID first; fall back to (same trigger + contradicting action) so
  // that a contradictory instinct with a slightly different ID (differing
  // action/scope) still merges and can drive the conflict-hold transition
  // instead of silently accumulating as a separate record.
  const match =
    existing.find(instinct => instinct.id === incoming.id) ??
    existing.find(
      instinct =>
        instinct.trigger.toLowerCase() === incoming.trigger.toLowerCase() &&
        isContradictingInstinct(instinct, incoming),
    )
  const now = new Date().toISOString()

  if (!match) return saveInstinct(incoming, options)

  const contradiction = isContradictingInstinct(match, incoming)
  const confidenceDelta = contradiction
    ? -0.1
    : outcomeConfidenceDelta(incoming.evidenceOutcome)
  const nextConfidence = clampConfidence(match.confidence + confidenceDelta)
  const nextStatus = resolveNextStatus(
    match.status,
    nextConfidence,
    contradiction,
  )
  const merged = normalizeInstinct({
    ...match,
    confidence: nextConfidence,
    evidence: [...match.evidence, ...incoming.evidence],
    evidenceOutcome: incoming.evidenceOutcome ?? match.evidenceOutcome,
    observationIds: [
      ...(match.observationIds ?? []),
      ...(incoming.observationIds ?? []),
    ],
    updatedAt: now,
    status: nextStatus,
  })

  return saveInstinct(merged, options)
}

function resolveNextStatus(
  current: StoredInstinct['status'],
  nextConfidence: number,
  contradiction: boolean,
): StoredInstinct['status'] {
  if (contradiction && nextConfidence < 0.3) return 'conflict-hold'
  if (current === 'conflict-hold' && nextConfidence >= 0.5) return 'active'
  if (current === 'pending' && nextConfidence >= 0.8) return 'active'
  return current
}

const DECAY_PER_WEEK = 0.02
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

/**
 * Apply time-based confidence decay to all instincts (ECC parity: -0.02/week).
 * Only decays `pending` and `active` instincts; terminal states
 * (stale/superseded/retired/archived/conflict-hold) do not decay.
 */
export async function decayInstinctConfidence(
  options?: InstinctStoreOptions,
): Promise<number> {
  const instincts = await loadInstincts(options)
  const now = Date.now()
  let decayed = 0

  for (const instinct of instincts) {
    if (instinct.status !== 'pending' && instinct.status !== 'active') continue
    const updatedAtMs = Date.parse(instinct.updatedAt)
    if (Number.isNaN(updatedAtMs)) continue
    const weeksElapsed = Math.floor((now - updatedAtMs) / MS_PER_WEEK)
    if (weeksElapsed < 1) continue

    const delta = -DECAY_PER_WEEK * weeksElapsed
    const nextConfidence = clampConfidence(instinct.confidence + delta)
    if (nextConfidence === instinct.confidence) continue

    // Bump updatedAt so subsequent maintenance runs don't re-apply the same
    // elapsed-week delta.
    await saveInstinct(
      normalizeInstinct({
        ...instinct,
        confidence: nextConfidence,
        updatedAt: new Date(now).toISOString(),
      }),
      options,
    )
    decayed += 1
  }

  return decayed
}

function outcomeConfidenceDelta(
  outcome: StoredInstinct['evidenceOutcome'],
): number {
  if (outcome === 'failure') return -0.05
  return 0.05
}

export async function updateConfidence(
  instinctId: string,
  delta: number,
  options?: InstinctStoreOptions,
): Promise<StoredInstinct | null> {
  const instincts = await loadInstincts(options)
  const target = instincts.find(instinct => instinct.id === instinctId)
  if (!target) return null

  const updated = normalizeInstinct({
    ...target,
    confidence: clampConfidence(target.confidence + delta),
    updatedAt: new Date().toISOString(),
  })
  return saveInstinct(updated, options)
}

export async function exportInstincts(
  outputPath: string,
  options?: InstinctStoreOptions,
): Promise<StoredInstinct[]> {
  const instincts = await loadInstincts(options)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(instincts, null, 2)}\n`)
  return instincts
}

export async function importInstincts(
  inputPath: string,
  options?: InstinctStoreOptions,
): Promise<StoredInstinct[]> {
  const parsed = JSON.parse(
    await readFile(inputPath, 'utf8'),
  ) as StoredInstinct[]
  const saved: StoredInstinct[] = []
  for (const instinct of parsed) {
    saved.push(await upsertInstinct(normalizeInstinct(instinct), options))
  }
  return saved
}

export async function prunePendingInstincts(
  maxAgeDays: number,
  options?: InstinctStoreOptions,
): Promise<StoredInstinct[]> {
  const instincts = await loadInstincts(options)
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
  const pruned: StoredInstinct[] = []

  for (const instinct of instincts) {
    if (
      instinct.status === 'pending' &&
      Date.parse(instinct.updatedAt) < cutoff
    ) {
      await unlink(instinctPath(instinct.id, options))
      pruned.push(instinct)
    }
  }

  return pruned
}

function instinctPath(id: string, options?: InstinctStoreOptions): string {
  return join(getInstinctsDir(options), `${id}.json`)
}
