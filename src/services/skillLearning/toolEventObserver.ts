import { randomUUID } from 'node:crypto'
import {
  appendObservation,
  type StoredSkillObservation,
} from './observationStore.js'
import type {
  SkillLearningProjectContext,
  SkillObservationOutcome,
} from './types.js'

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

const emittedTurns = new Map<string, Set<number>>()

function markTurn(sessionId: string, turn: number): void {
  const seen = emittedTurns.get(sessionId) ?? new Set<number>()
  seen.add(turn)
  emittedTurns.set(sessionId, seen)
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

/**
 * Wrap a tool.call invocation with deterministic tool-event observation.
 *
 * Designed for the single call site in `toolExecution.ts:1221`. All hook
 * work is fire-and-forget (awaited but with per-call try/catch) so that
 * tool execution never blocks or fails because of skill-learning plumbing.
 */
export async function runToolCallWithSkillLearningHooks<T>(
  toolName: string,
  input: unknown,
  callContext: { sessionId?: string; turn?: number },
  invoke: () => Promise<T>,
): Promise<T> {
  let ctx: ToolHookContext | undefined
  try {
    const { resolveProjectContext } = await import('./projectContext.js')
    const { isSkillLearningEnabled } = await import('./featureCheck.js')
    const { RUNTIME_SESSION_ID, getRuntimeTurn } = await import(
      './runtimeObserver.js'
    )
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
    await recordToolStart(ctx, toolName, input)
  } catch {
    // Never let observation errors affect tool execution.
  }
  try {
    const result = await invoke()
    if (ctx) {
      try {
        await recordToolComplete(ctx, toolName, result, 'success')
      } catch {
        // swallow
      }
    }
    return result
  } catch (error) {
    if (ctx) {
      try {
        await recordToolError(ctx, toolName, error)
      } catch {
        // swallow
      }
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
