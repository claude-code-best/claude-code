import { randomUUID } from 'node:crypto'
import {
  appendObservation,
  type StoredSkillObservation,
} from './observationStore.js'
import type {
  SkillLearningProjectContext,
  SkillObservationOutcome,
} from './types.js'
import { logForDebugging } from '../../utils/debug.js'
import { logError } from '../../utils/log.js'

/**
 * Tool event hook layer.
 *
 * Preferred observation pathway: consumers (tool dispatcher, REPL turn loop,
 * or integration tests) call `recordToolStart` / `recordToolComplete` /
 * `recordToolError` / `recordUserCorrection` as tool-level events happen,
 * producing deterministic observations with `source: 'tool-hook'`.
 *
 * Post-sampling reconstruction (runtimeObserver.observationsFromMessages)
 * is retained as a fallback for environments where the caller cannot emit
 * tool events directly.
 *
 * @todo Wire these functions into `src/Tool.ts`'s public dispatch so the
 *       main REPL tool loop produces tool-hook observations automatically.
 *       Until then, callers that do have tool-level signal (integration
 *       tests, custom harness code, future tool middleware) can use the
 *       functions here directly.
 */

export type ToolHookContext = {
  sessionId: string
  turn: number
  projectId: string
  projectName: string
  cwd: string
  project?: SkillLearningProjectContext
}

/** Maximum number of turns tracked per session before pruning. */
const EMITTED_TURNS_SET_MAX = 500
/** How many turns to retain after pruning a session Set. */
const EMITTED_TURNS_SET_KEEP = 250
/** Maximum number of sessions tracked in the Map before pruning. */
const EMITTED_TURNS_MAP_MAX = 50
/** How many sessions to retain after pruning the Map. */
const EMITTED_TURNS_MAP_KEEP = 25

const emittedTurns = new Map<string, Set<number>>()

/**
 * Prune `emittedTurns` to stay within memory bounds.
 *
 * - If any session's Set exceeds `EMITTED_TURNS_SET_MAX` entries, retain only
 *   the most recent `EMITTED_TURNS_SET_KEEP` turn numbers (FIFO trim).
 * - If the Map itself exceeds `EMITTED_TURNS_MAP_MAX` entries, delete the
 *   oldest `EMITTED_TURNS_MAP_MAX - EMITTED_TURNS_MAP_KEEP` sessions
 *   (insertion-order LRU).
 *
 * Exported so tests and `resetToolHookBookkeeping` callers can invoke it
 * directly.
 */
export function pruneEmittedTurns(): void {
  // Prune over-sized Sets first. FIFO by insertion order — NOT by turn
  // number magnitude. Non-monotonic turn ordering (e.g. replayed transcripts
  // or nested tool chains) should not cause us to evict the wrong entries.
  for (const [sessionId, turns] of emittedTurns) {
    if (turns.size > EMITTED_TURNS_SET_MAX) {
      const iter = turns.values()
      const toDrop = turns.size - EMITTED_TURNS_SET_KEEP
      for (let i = 0; i < toDrop; i++) {
        const next = iter.next()
        if (next.done) break
        turns.delete(next.value)
      }
    }
  }
  // Prune over-sized Map (delete oldest insertion-order entries).
  if (emittedTurns.size > EMITTED_TURNS_MAP_MAX) {
    const toDelete = emittedTurns.size - EMITTED_TURNS_MAP_KEEP
    let deleted = 0
    for (const key of emittedTurns.keys()) {
      if (deleted >= toDelete) break
      emittedTurns.delete(key)
      deleted++
    }
  }
}

function markTurn(sessionId: string, turn: number): void {
  // Refresh Map insertion order: delete + re-set so a recently-touched
  // session is treated as "youngest" for the LRU-ish Map eviction.
  const seen = emittedTurns.get(sessionId) ?? new Set<number>()
  seen.add(turn)
  emittedTurns.delete(sessionId)
  emittedTurns.set(sessionId, seen)
  pruneEmittedTurns()
}

export function hasToolHookObservationsForTurn(
  sessionId: string,
  turn: number,
): boolean {
  return emittedTurns.get(sessionId)?.has(turn) ?? false
}

export function resetToolHookBookkeeping(): void {
  emittedTurns.clear()
}

function baseObservation(
  ctx: ToolHookContext,
): Pick<
  StoredSkillObservation,
  | 'id'
  | 'sessionId'
  | 'projectId'
  | 'projectName'
  | 'cwd'
  | 'timestamp'
  | 'source'
  | 'turn'
> {
  return {
    id: randomUUID(),
    sessionId: ctx.sessionId,
    projectId: ctx.projectId,
    projectName: ctx.projectName,
    cwd: ctx.cwd,
    timestamp: new Date().toISOString(),
    source: 'tool-hook',
    // Persist turn so runtimeObserver can filter tool-hook observations by
    // the current turn rather than sweeping all historical tool-hook data
    // (codex review Q1).
    turn: ctx.turn,
  }
}

// Cached import promise — resolved once so the hot path pays no repeated
// dynamic-import overhead after the first invocation.
let _depImportCache:
  | Promise<{
      resolveProjectContext: (cwd: string) => SkillLearningProjectContext
      isSkillLearningEnabled: () => boolean
      RUNTIME_SESSION_ID: string
      getRuntimeTurn: () => number
    }>
  | undefined

function _getDeps() {
  if (!_depImportCache) {
    _depImportCache = Promise.all([
      import('./projectContext.js'),
      import('./featureCheck.js'),
      import('./runtimeObserver.js'),
    ]).then(([pc, fc, ro]) => ({
      resolveProjectContext: pc.resolveProjectContext,
      isSkillLearningEnabled: fc.isSkillLearningEnabled,
      RUNTIME_SESSION_ID: ro.RUNTIME_SESSION_ID,
      getRuntimeTurn: ro.getRuntimeTurn,
    }))
  }
  return _depImportCache
}

/** Reset the cached dep import (for test isolation). */
export function resetToolHookDepsCache(): void {
  _depImportCache = undefined
}

/**
 * Wrap a tool.call invocation with deterministic tool-event observation.
 *
 * Designed for the single call site in `toolExecution.ts`. The hook calls
 * (`recordToolStart`, `recordToolComplete`, `recordToolError`) are true
 * fire-and-forget: the tool invoke result is returned immediately without
 * waiting for the observation to persist. Errors in observation are caught
 * and logged so they never surface to the caller.
 */
export async function runToolCallWithSkillLearningHooks<T>(
  toolName: string,
  input: unknown,
  callContext: { sessionId?: string; turn?: number },
  invoke: () => Promise<T>,
): Promise<T> {
  let ctx: ToolHookContext | undefined
  try {
    const {
      resolveProjectContext,
      isSkillLearningEnabled,
      RUNTIME_SESSION_ID,
      getRuntimeTurn,
    } = await _getDeps()
    if (!isSkillLearningEnabled()) {
      return invoke()
    }
    const project = resolveProjectContext(process.cwd())
    // Always emit under the runtime observer's sessionId so the post-sampling
    // consumer can find our records. The prior default `'cli'` fell outside
    // the observer's sessionId filter and made tool-hook observations
    // structurally unconsumable (codex second-pass audit AC1).
    ctx = {
      sessionId: callContext.sessionId ?? RUNTIME_SESSION_ID,
      turn: callContext.turn ?? getRuntimeTurn(),
      projectId: project.projectId,
      projectName: project.projectName,
      cwd: project.cwd,
      project,
    }
    // Fire-and-forget: do NOT await — tool invoke must not be blocked.
    void recordToolStart(ctx, toolName, input).catch(e => {
      logForDebugging('skill-learning: recordToolStart error')
      logError(e)
    })
  } catch (e) {
    // Never let observation setup errors affect tool execution.
    logForDebugging('skill-learning: hook setup error')
    logError(e)
  }
  try {
    const result = await invoke()
    if (ctx) {
      // Fire-and-forget: do NOT await.
      void recordToolComplete(ctx, toolName, result, 'success').catch(e => {
        logForDebugging('skill-learning: recordToolComplete error')
        logError(e)
      })
    }
    return result
  } catch (error) {
    if (ctx) {
      // Fire-and-forget: do NOT await.
      void recordToolError(ctx, toolName, error).catch(e => {
        logForDebugging('skill-learning: recordToolError error')
        logError(e)
      })
    }
    throw error
  }
}

export async function recordToolStart(
  ctx: ToolHookContext,
  toolName: string,
  input?: unknown,
): Promise<StoredSkillObservation> {
  markTurn(ctx.sessionId, ctx.turn)
  const observation: StoredSkillObservation = {
    ...baseObservation(ctx),
    event: 'tool_start',
    toolName,
    toolInput: stringify(input),
  }
  return appendObservation(observation, { project: ctx.project })
}

export async function recordToolComplete(
  ctx: ToolHookContext,
  toolName: string,
  output?: unknown,
  outcome: SkillObservationOutcome = 'success',
): Promise<StoredSkillObservation> {
  markTurn(ctx.sessionId, ctx.turn)
  const observation: StoredSkillObservation = {
    ...baseObservation(ctx),
    event: 'tool_complete',
    toolName,
    toolOutput: stringify(output),
    outcome,
  }
  return appendObservation(observation, { project: ctx.project })
}

export async function recordToolError(
  ctx: ToolHookContext,
  toolName: string,
  error: unknown,
): Promise<StoredSkillObservation> {
  markTurn(ctx.sessionId, ctx.turn)
  const observation: StoredSkillObservation = {
    ...baseObservation(ctx),
    event: 'tool_complete',
    toolName,
    toolOutput: stringify(error),
    outcome: 'failure',
  }
  return appendObservation(observation, { project: ctx.project })
}

export async function recordUserCorrection(
  ctx: ToolHookContext,
  messageText: string,
): Promise<StoredSkillObservation> {
  markTurn(ctx.sessionId, ctx.turn)
  const observation: StoredSkillObservation = {
    ...baseObservation(ctx),
    event: 'user_message',
    messageText,
  }
  return appendObservation(observation, { project: ctx.project })
}

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
