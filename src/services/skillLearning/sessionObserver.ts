import type { StoredSkillObservation } from './observationStore.js'
import {
  candidateFromObservation,
  createInstinct,
  type InstinctCandidate,
  type StoredInstinct,
} from './instinctParser.js'
import type { InstinctDomain, SkillObservationOutcome } from './types.js'
import {
  analyzeWithActiveBackend,
  getActiveObserverBackend,
  registerObserverBackend,
  type ObserverBackend,
  type ObserverBackendContext,
} from './observerBackend.js'
import { llmObserverBackend } from './llmObserverBackend.js'

export type SessionObserverOptions = {
  minRepeatedSequenceCount?: number
}

const DEFAULT_MIN_REPEATED_SEQUENCE_COUNT = 2

export function heuristicAnalyze(
  observations: StoredSkillObservation[],
  options?: SessionObserverOptions,
): InstinctCandidate[] {
  return [
    ...extractUserCorrections(observations),
    ...extractToolErrorResolutions(observations),
    ...extractRepeatedToolSequences(observations, options),
    ...extractProjectConventions(observations),
  ]
}

export const heuristicObserverBackend: ObserverBackend = {
  name: 'heuristic',
  analyze(
    observations: StoredSkillObservation[],
    _ctx?: ObserverBackendContext,
  ): InstinctCandidate[] {
    return heuristicAnalyze(observations)
  },
}

registerObserverBackend(heuristicObserverBackend)
registerObserverBackend(llmObserverBackend)

export function analyzeObservations(
  observations: StoredSkillObservation[],
  options?: SessionObserverOptions,
): StoredInstinct[] {
  const backend = getActiveObserverBackend()
  const candidates =
    backend.name === 'heuristic'
      ? heuristicAnalyze(observations, options)
      : ensureSyncCandidates(backend.analyze(observations))
  return candidates.map(candidate => createInstinct(candidate))
}

export async function analyzeObservationsAsync(
  observations: StoredSkillObservation[],
  ctx?: ObserverBackendContext,
): Promise<StoredInstinct[]> {
  const candidates = await analyzeWithActiveBackend(observations, ctx)
  return candidates.map(candidate => createInstinct(candidate))
}

export const observeSession = analyzeObservations

function ensureSyncCandidates(
  result: InstinctCandidate[] | Promise<InstinctCandidate[]>,
): InstinctCandidate[] {
  if (Array.isArray(result)) return result
  throw new Error(
    'Active observer backend returned a Promise; use analyzeObservationsAsync instead',
  )
}

function extractUserCorrections(
  observations: StoredSkillObservation[],
): InstinctCandidate[] {
  return observations.flatMap((observation, index) => {
    if (observation.event !== 'user_message' || !observation.messageText) {
      return []
    }

    const text = observation.messageText.trim()
    const correction = parseCorrection(text)
    if (!correction) return []

    const base = candidateFromObservation(observation)
    return [
      {
        ...base,
        trigger: correction.trigger,
        action: correction.action,
        confidence: 0.7,
        domain: inferDomain(text),
        source: 'session-observation',
        scope: 'project',
        evidence: [text],
        evidenceOutcome: recentOutcomeBefore(observations, index),
        observationIds: [observation.id],
      },
    ]
  })
}

function extractToolErrorResolutions(
  observations: StoredSkillObservation[],
): InstinctCandidate[] {
  const candidates: InstinctCandidate[] = []

  for (let i = 0; i < observations.length; i++) {
    const current = observations[i]
    if (current.event !== 'tool_complete' || current.outcome !== 'failure') {
      continue
    }

    const laterSuccess = observations.slice(i + 1, i + 6).find(next => {
      return (
        next.event === 'tool_complete' &&
        next.outcome === 'success' &&
        next.toolName === current.toolName
      )
    })

    if (!laterSuccess || !current.toolName) continue

    candidates.push({
      ...candidateFromObservation(current),
      trigger: `When ${current.toolName} fails during this project`,
      action: `Use the follow-up successful ${current.toolName} invocation as the resolution pattern before retrying blindly.`,
      confidence: 0.5,
      domain: 'debugging',
      source: 'session-observation',
      scope: 'project',
      evidence: [
        current.toolOutput ?? `${current.toolName} failed`,
        laterSuccess.toolOutput ?? `${laterSuccess.toolName} succeeded`,
      ],
      evidenceOutcome: 'success',
      observationIds: [current.id, laterSuccess.id],
    })
  }

  return candidates
}

function extractRepeatedToolSequences(
  observations: StoredSkillObservation[],
  options?: SessionObserverOptions,
): InstinctCandidate[] {
  const minCount =
    options?.minRepeatedSequenceCount ?? DEFAULT_MIN_REPEATED_SEQUENCE_COUNT
  const toolEvents = observations.filter(
    observation =>
      observation.event === 'tool_start' ||
      observation.event === 'tool_complete',
  )
  const names = toolEvents.map(observation => observation.toolName ?? '')
  const sequence = ['Grep', 'Read', 'Edit']
  const matchedIds: string[] = []
  let count = 0

  for (let i = 0; i <= names.length - sequence.length; i++) {
    if (sequence.every((name, offset) => names[i + offset] === name)) {
      count++
      matchedIds.push(
        ...toolEvents.slice(i, i + sequence.length).map(o => o.id),
      )
    }
  }

  if (count < minCount) return []

  const evidence = `Observed ${count} repeated Grep -> Read -> Edit workflow sequences.`
  const first = toolEvents.find(event => matchedIds.includes(event.id))
  const lastMatchedId = matchedIds[matchedIds.length - 1]
  const lastEvent = toolEvents.find(event => event.id === lastMatchedId)
  const sequenceOutcome =
    lastEvent?.event === 'tool_complete' ? lastEvent.outcome : undefined

  return [
    {
      ...candidateFromObservation(first ?? observations[0]),
      trigger: 'When changing code in this project',
      action:
        'Prefer the Grep -> Read -> Edit workflow: locate symbols, inspect context, then apply the smallest edit.',
      confidence: count >= 3 ? 0.65 : 0.5,
      domain: 'workflow',
      source: 'session-observation',
      scope: 'project',
      evidence: [evidence],
      evidenceOutcome: normalizeOutcome(sequenceOutcome),
      observationIds: Array.from(new Set(matchedIds)),
    },
  ]
}

function extractProjectConventions(
  observations: StoredSkillObservation[],
): InstinctCandidate[] {
  return observations.flatMap((observation, index) => {
    if (observation.event !== 'user_message' || !observation.messageText) {
      return []
    }
    const text = observation.messageText.trim()
    if (!/(项目约定|规范|必须|convention|always|must)/i.test(text)) {
      return []
    }

    return [
      {
        ...candidateFromObservation(observation),
        trigger: 'When working in this project',
        action: `Follow the project convention: ${text}`,
        // Single occurrence gets 0.4 so it stays below the 0.75 promotion
        // threshold. Promotion requires corroborating high-confidence evidence
        // (e.g. two 0.4s still average 0.4 — other signals must raise the mean).
        confidence: 0.4,
        domain: 'project',
        source: 'session-observation',
        scope: 'project',
        evidence: [text],
        evidenceOutcome: recentOutcomeBefore(observations, index),
        observationIds: [observation.id],
      },
    ]
  })
}

function recentOutcomeBefore(
  observations: StoredSkillObservation[],
  index: number,
): SkillObservationOutcome | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const prior = observations[i]
    if (prior.event !== 'tool_complete') continue
    return normalizeOutcome(prior.outcome)
  }
  return undefined
}

function normalizeOutcome(
  outcome: StoredSkillObservation['outcome'],
): SkillObservationOutcome | undefined {
  if (outcome === 'success' || outcome === 'failure' || outcome === 'unknown') {
    return outcome
  }
  return undefined
}

function parseCorrection(
  text: string,
): { trigger: string; action: string } | null {
  const noUsePattern =
    /(?:不要|别|不应(?:该)?|不要再)\s*(?<avoid>[^，,。.;；]+)[，,\s]*(?:用|使用|改用|应该用|要用)\s*(?<prefer>[^，,。.;；]+)/i
  const englishPattern =
    /(?:do not|don't|avoid)\s+(?<avoid>[^,.;]+)[,;\s]+(?:use|prefer)\s+(?<prefer>[^,.;]+)/i
  const shouldPattern =
    /(?:你应该|应该先|must|should)\s*(?<prefer>[^，,。.;；]+)/i

  const noUse = text.match(noUsePattern) ?? text.match(englishPattern)
  if (noUse?.groups) {
    const avoid = noUse.groups.avoid.trim()
    const prefer = noUse.groups.prefer.trim()
    return {
      trigger: `When choosing between ${avoid} and ${prefer}`,
      action: `Prefer ${prefer}; avoid ${avoid}.`,
    }
  }

  const should = text.match(shouldPattern)
  if (should?.groups) {
    const prefer = should.groups.prefer.trim()
    return {
      trigger: 'When this user gives a corrective instruction',
      action: `Prefer this corrected action: ${prefer}.`,
    }
  }

  return null
}

function inferDomain(text: string): InstinctDomain {
  const lowered = text.toLowerCase()
  if (/test|mock|testing-library|vitest|jest|bun test/.test(lowered)) {
    return 'testing'
  }
  if (/git|commit|branch/.test(lowered)) return 'git'
  if (/security|secret|token|password/.test(lowered)) return 'security'
  if (/style|format|lint|naming/.test(lowered)) return 'code-style'
  return 'project'
}
