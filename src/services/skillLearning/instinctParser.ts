import { createHash } from 'node:crypto'
import type {
  SkillLearningProjectContext,
  SkillLearningScope,
  StoredSkillObservation,
} from './observationStore.js'
import type { Instinct as BaseInstinct, InstinctStatus } from './types.js'

export type { Instinct } from './types.js'

export type StoredInstinct = BaseInstinct & {
  observationIds?: string[]
}

export type InstinctCandidate = Omit<
  StoredInstinct,
  'id' | 'createdAt' | 'updatedAt' | 'status'
> & {
  id?: string
  status?: InstinctStatus
}

export function createInstinct(
  candidate: InstinctCandidate,
  now = new Date().toISOString(),
): StoredInstinct {
  return normalizeInstinct({
    id:
      candidate.id ??
      buildInstinctId(candidate.trigger, candidate.action, candidate.scope),
    ...candidate,
    createdAt: now,
    updatedAt: now,
    status: candidate.status ?? 'pending',
  })
}

export function normalizeInstinct(instinct: StoredInstinct): StoredInstinct {
  return {
    ...instinct,
    id: instinct.id || buildInstinctId(instinct.trigger, instinct.action),
    confidence: clampConfidence(instinct.confidence),
    evidence: Array.from(new Set(instinct.evidence.filter(Boolean))),
    evidenceOutcome: instinct.evidenceOutcome,
    observationIds: instinct.observationIds
      ? Array.from(new Set(instinct.observationIds))
      : undefined,
  }
}

export function serializeInstinct(instinct: StoredInstinct): string {
  return `${JSON.stringify(normalizeInstinct(instinct), null, 2)}\n`
}

export function parseInstinct(content: string): StoredInstinct {
  return normalizeInstinct(JSON.parse(content) as StoredInstinct)
}

export function buildInstinctId(
  trigger: string,
  action: string,
  scope: SkillLearningScope = 'project',
): string {
  const slug = `${trigger} ${action}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  const hash = createHash('sha1')
    .update(`${scope}\n${trigger}\n${action}`)
    .digest('hex')
    .slice(0, 10)
  return `${slug || 'instinct'}-${hash}`
}

export function candidateFromObservation(
  observation: StoredSkillObservation,
  project?: SkillLearningProjectContext,
): Partial<InstinctCandidate> {
  return {
    scope: project?.scope ?? 'project',
    projectId: project?.projectId ?? observation.projectId,
    projectName: project?.projectName ?? observation.projectName,
    source: 'session-observation',
    evidence: [
      observation.messageText ??
        observation.toolOutput ??
        observation.toolInput ??
        observation.toolName ??
        observation.id,
    ],
    observationIds: [observation.id],
  }
}

export function isContradictingInstinct(
  existing: StoredInstinct,
  incoming: StoredInstinct,
): boolean {
  const existingTrigger = existing.trigger.toLowerCase()
  const incomingTrigger = incoming.trigger.toLowerCase()
  if (existingTrigger !== incomingTrigger) return false

  const existingAction = existing.action.toLowerCase()
  const incomingAction = incoming.action.toLowerCase()
  return (
    existingAction.includes('avoid') !== incomingAction.includes('avoid') ||
    existingAction.includes('prefer') !== incomingAction.includes('prefer')
  )
}

export function clampConfidence(confidence: number): number {
  if (Number.isNaN(confidence)) return 0
  return Math.max(0, Math.min(1, Number(confidence.toFixed(2))))
}
