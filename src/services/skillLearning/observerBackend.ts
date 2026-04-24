import type { InstinctCandidate } from './instinctParser.js'
import type { StoredSkillObservation } from './observationStore.js'
import type { SkillLearningProjectContext } from './types.js'

export type ObserverBackendContext = {
  project?: SkillLearningProjectContext
}

export type ObserverBackendResult =
  | InstinctCandidate[]
  | Promise<InstinctCandidate[]>

export interface ObserverBackend {
  readonly name: string
  analyze(
    observations: StoredSkillObservation[],
    ctx?: ObserverBackendContext,
  ): ObserverBackendResult
}

const registry = new Map<string, ObserverBackend>()
let activeName: string | undefined

export function registerObserverBackend(backend: ObserverBackend): void {
  registry.set(backend.name, backend)
  if (!activeName) activeName = backend.name
}

export function setActiveObserverBackend(name: string): void {
  if (!registry.has(name)) {
    throw new Error(`Observer backend "${name}" is not registered`)
  }
  activeName = name
}

export function getActiveObserverBackend(): ObserverBackend {
  const backend = activeName ? registry.get(activeName) : undefined
  if (!backend) {
    throw new Error(
      'No observer backend is active — register one before analyzing observations',
    )
  }
  return backend
}

export function listObserverBackends(): string[] {
  return Array.from(registry.keys())
}

export function resetObserverBackendsForTest(): void {
  registry.clear()
  activeName = undefined
}

export async function analyzeWithActiveBackend(
  observations: StoredSkillObservation[],
  ctx?: ObserverBackendContext,
): Promise<InstinctCandidate[]> {
  return Promise.resolve(getActiveObserverBackend().analyze(observations, ctx))
}

function pickBackendFromEnv(): string | undefined {
  const raw = process.env.SKILL_LEARNING_OBSERVER_BACKEND?.trim()
  return raw && registry.has(raw) ? raw : undefined
}

export function resolveDefaultObserverBackend(): ObserverBackend {
  const preferred = pickBackendFromEnv()
  if (preferred) setActiveObserverBackend(preferred)
  return getActiveObserverBackend()
}
