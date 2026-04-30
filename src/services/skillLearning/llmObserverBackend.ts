import { queryHaiku } from '../api/claude.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'
import { getSkillLearningConfig } from './config.js'
import type { InstinctCandidate } from './instinctParser.js'
import type { StoredSkillObservation } from './observationStore.js'
import type {
  ObserverBackend,
  ObserverBackendContext,
} from './observerBackend.js'
import {
  INSTINCT_DOMAINS,
  type InstinctDomain,
  type SkillLearningScope,
} from './types.js'

/**
 * LLM-based observer backend.
 *
 * Runs the small fast model (Haiku) through the project's `queryHaiku`
 * helper, feeds it a compact summary of recent observations, and asks for
 * up to three atomic reusable instincts in JSON. Output is validated and
 * mapped to `InstinctCandidate[]` so the existing evolution pipeline
 * consumes LLM output the same way it consumes heuristic output.
 *
 * Design notes:
 * - Reuses `queryHaiku` (goes through the full Claude Code API stack:
 *   OAuth, beta headers, providers, VCR in tests). No new auth code.
 * - Caps input to the tail of the observation buffer so the prompt stays
 *   small and predictable, and runs under a 10-second abort signal so a
 *   slow Haiku round-trip never blocks the REPL turn end.
 * - On ANY failure (abort, parse error, empty output) returns `[]` —
 *   the backend is opt-in via `SKILL_LEARNING_OBSERVER_BACKEND=llm` and
 *   must never destabilise skill-learning when the API is unavailable.
 */

const MAX_OBSERVATIONS_PER_CALL = 30
const MAX_CANDIDATES_PER_CALL = 3

// --- Circuit breaker state ---
let consecutiveFailures = 0
let circuitOpenUntil = 0

export function resetCircuitBreaker(): void {
  consecutiveFailures = 0
  circuitOpenUntil = 0
}

const LLM_OBSERVER_SYSTEM_PROMPT = `You analyse a short sequence of observations from a coding-assistant session (user messages, tool invocations with outcomes, assistant messages) and extract atomic, reusable "instincts" — behavioural patterns that would help the assistant act correctly in future similar situations.

Respond with ONLY a JSON array (no prose, no code fences, no commentary). Each item must match this schema:

{
  "trigger": string,        // <= 80 chars, short phrase describing WHEN the instinct applies
  "action": string,         // <= 120 chars, short phrase describing WHAT to do
  "confidence": number,     // 0..1 — how strongly these observations support the pattern
  "domain": "workflow"|"testing"|"debugging"|"code-style"|"security"|"git"|"project",
  "scope": "project"|"global",
  "evidence": string[]      // 1..3 short excerpts copied/paraphrased from the observations
}

Rules:
- Return [] if nothing clearly reusable. No guessing.
- At most 3 items, highest confidence first.
- confidence > 0.7 only when observations show the pattern in action (a correction followed by a successful retry, a repeated sequence, an explicit rule).
- Never include secrets, tokens, full file contents, or personally-identifying data.
- Scope "global" only when the pattern is obviously project-agnostic (generic testing, git hygiene); default to "project".`

export const llmObserverBackend: ObserverBackend = {
  name: 'llm',
  analyze(
    observations: StoredSkillObservation[],
    ctx?: ObserverBackendContext,
  ): Promise<InstinctCandidate[]> {
    return analyseWithHaiku(observations, ctx)
  },
}

async function analyseWithHaiku(
  observations: StoredSkillObservation[],
  ctx?: ObserverBackendContext,
): Promise<InstinctCandidate[]> {
  if (observations.length === 0) return []

  // Circuit breaker: if the circuit is open, skip queryHaiku entirely.
  if (Date.now() < circuitOpenUntil) {
    return runHeuristicFallback(observations, ctx)
  }

  const capped = observations.slice(-MAX_OBSERVATIONS_PER_CALL)
  const userPrompt = buildUserPrompt(capped)
  const signal = makeTimeoutSignal(getSkillLearningConfig().llm.timeoutMs)

  let responseText: string
  try {
    const response = await queryHaiku({
      systemPrompt: asSystemPrompt([LLM_OBSERVER_SYSTEM_PROMPT]),
      userPrompt,
      signal,
      options: {
        querySource: 'skill_learning_observer',
        enablePromptCaching: true,
        agents: [],
        isNonInteractiveSession: true,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })
    // Success: reset failure counter.
    consecutiveFailures = 0
    responseText = extractResponseText(response.message?.content)
  } catch {
    // Haiku failure (timeout / rate limit / bad response) — increment failure
    // counter and potentially open the circuit breaker.
    consecutiveFailures++
    if (consecutiveFailures >= getSkillLearningConfig().llm.failureThreshold) {
      circuitOpenUntil =
        Date.now() + getSkillLearningConfig().llm.circuitCooldownMs
    }
    return runHeuristicFallback(observations, ctx)
  }

  const parsed = parseInstinctCandidates(responseText, ctx, capped)
  if (parsed.length === 0) {
    // Empty / malformed LLM output — count as a failure so the circuit
    // breaker opens if Haiku is systematically returning garbage (e.g. the
    // model version drifted and no longer emits the expected JSON).
    consecutiveFailures++
    if (consecutiveFailures >= getSkillLearningConfig().llm.failureThreshold) {
      circuitOpenUntil =
        Date.now() + getSkillLearningConfig().llm.circuitCooldownMs
    }
    return runHeuristicFallback(observations, ctx)
  }
  return parsed
}

async function runHeuristicFallback(
  observations: StoredSkillObservation[],
  ctx?: ObserverBackendContext,
): Promise<InstinctCandidate[]> {
  try {
    const { heuristicObserverBackend } = await import('./sessionObserver.js')
    const result = heuristicObserverBackend.analyze(observations, ctx)
    return Array.isArray(result) ? result : await result
  } catch {
    return []
  }
}

function buildUserPrompt(observations: StoredSkillObservation[]): string {
  const rendered = observations
    .map((observation, index) => renderObservation(observation, index))
    .join('\n')
  return `Observations (chronological, newest last):\n${rendered}\n\nExtract up to ${MAX_CANDIDATES_PER_CALL} atomic instincts. JSON array only.`
}

function renderObservation(
  observation: StoredSkillObservation,
  index: number,
): string {
  const segments: string[] = [`#${index + 1}`, `event=${observation.event}`]
  if (observation.toolName) segments.push(`tool=${observation.toolName}`)
  if (observation.outcome) segments.push(`outcome=${observation.outcome}`)
  if (observation.messageText) {
    segments.push(
      `text=${JSON.stringify(truncate(observation.messageText, 200))}`,
    )
  }
  if (observation.toolInput) {
    segments.push(`in=${JSON.stringify(truncate(observation.toolInput, 120))}`)
  }
  if (observation.toolOutput) {
    segments.push(
      `out=${JSON.stringify(truncate(observation.toolOutput, 120))}`,
    )
  }
  return segments.join(' | ')
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

function extractResponseText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type !== 'text') continue
    if (typeof record.text === 'string') parts.push(record.text)
  }
  return parts.join('').trim()
}

function parseInstinctCandidates(
  raw: string,
  ctx: ObserverBackendContext | undefined,
  observations: StoredSkillObservation[],
): InstinctCandidate[] {
  const json = extractJsonArray(raw)
  if (!json) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const observationIds = observations.map(observation => observation.id)
  const candidates: InstinctCandidate[] = []

  for (const item of parsed.slice(0, MAX_CANDIDATES_PER_CALL)) {
    const candidate = normaliseCandidate(item, ctx, observationIds)
    if (candidate) candidates.push(candidate)
  }

  return candidates
}

function extractJsonArray(raw: string): string | undefined {
  if (!raw) return undefined
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return undefined
  return raw.slice(start, end + 1)
}

function normaliseCandidate(
  item: unknown,
  ctx: ObserverBackendContext | undefined,
  observationIds: string[],
): InstinctCandidate | undefined {
  if (!item || typeof item !== 'object') return undefined
  const record = item as Record<string, unknown>

  const trigger = stringField(record.trigger, 80)
  const action = stringField(record.action, 120)
  if (!trigger || !action) return undefined

  const evidence = evidenceField(record.evidence)
  if (evidence.length === 0) return undefined

  return {
    trigger,
    action,
    confidence: clampUnitInterval(record.confidence),
    domain: domainField(record.domain),
    source: 'session-observation',
    scope: scopeField(record.scope),
    projectId: ctx?.project?.projectId,
    projectName: ctx?.project?.projectName,
    evidence,
    observationIds,
  }
}

function stringField(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function clampUnitInterval(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function domainField(value: unknown): InstinctDomain {
  if (typeof value !== 'string') return 'project'
  return (INSTINCT_DOMAINS as readonly string[]).includes(value)
    ? (value as InstinctDomain)
    : 'project'
}

function scopeField(value: unknown): SkillLearningScope {
  return value === 'global' ? 'global' : 'project'
}

function evidenceField(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const entries: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    entries.push(trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed)
    if (entries.length === 3) break
  }
  return entries
}

function makeTimeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}
