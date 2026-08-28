import { MAX_ITEMS_PER_CALL, MAX_TOTAL_AGENTS } from '../constants.js'
import type {
  AgentProgressUpdate,
  AgentRunParams,
  AgentRunResult,
  JournalEntry,
  ProgressEvent,
} from '../types.js'
import type { EngineContext } from './context.js'
import { WorkflowAbortedError, WorkflowError } from './errors.js'
import { agentCallKey } from './journal.js'
import type { WorkflowHooks } from './script.js'
import {
  assertValidJsonSchema,
  validateAgainstSchema,
} from './structuredOutput.js'

/** Sub-workflow executor for the workflow() hook (injected by runWorkflow to avoid circular dependencies). */
export type SubWorkflowRunner = (opts: {
  name?: string
  scriptPath?: string
  script?: string
  args?: unknown
}) => Promise<unknown>

type HookProgressInit =
  | { type: 'phase_started'; phase: string }
  | { type: 'phase_done'; phase: string }
  | { type: 'agent_started'; agentId: number; label?: string; phase?: string }
  | {
      type: 'agent_done'
      agentId: number
      label?: string
      phase?: string
      result: AgentRunResult
    }
  | {
      type: 'agent_progress'
      agentId: number
      label?: string
      phase?: string
      tokenCount: number
      toolCount: number
    }
  | { type: 'log'; message: string }

export function makeHooks(
  ctx: EngineContext,
  runSubWorkflow: SubWorkflowRunner,
): WorkflowHooks {
  // All progress events auto-inject runId so the adapter can route them to the corresponding task (multiple concurrent workflows)
  const emit = (init: HookProgressInit): void => {
    ctx.ports.progressEmitter.emit({
      runId: ctx.runId,
      ...init,
    } as ProgressEvent)
  }

  const agent: WorkflowHooks['agent'] = async (prompt, opts = {}) => {
    const r = ctx.resources
    if (r.agentCountBox.value >= MAX_TOTAL_AGENTS) {
      throw new WorkflowError(
        `workflow exceeds total agent cap (${MAX_TOTAL_AGENTS})`,
      )
    }

    // Assign a unique id to each agent() call (including journal hits); stamp started/done so the reducer can associate them precisely
    const agentId = r.agentIdSeq.value++

    const params: AgentRunParams = { prompt, ...opts }
    // Compile before consulting the journal or invoking a backend. An invalid schema is a workflow
    // configuration error, not a transient agent failure, so it must fail directly without retry.
    if (params.schema) assertValidJsonSchema(params.schema)
    const key = agentCallKey(prompt, params)
    const label = opts.label as string | undefined
    const phase =
      (opts.phase as string | undefined) ?? ctx.currentPhase ?? undefined

    const invalidateJournal = async (): Promise<void> => {
      ctx.journalInvalidated = true
      ctx.journal = ctx.journal.slice(0, ctx.journalIndex)
      await ctx.ports.journalStore.truncate(ctx.runId)
    }

    // Journal hit -> return a still-valid cached result directly. Old journal entries predate the
    // engine-level validation boundary, so validate structured output again before replaying it.
    if (!ctx.journalInvalidated && ctx.journalIndex < ctx.journal.length) {
      const entry = ctx.journal[ctx.journalIndex]!
      if (entry.key === key) {
        const cachedResult = validateStructuredResult(
          entry.result,
          params.schema,
        )
        if (entry.result.kind === 'ok' && cachedResult.kind === 'dead') {
          ctx.ports.logger.warn?.(
            `cached agent result for "${label ?? `#${agentId}`}" does not match its structured output schema; rerunning`,
          )
          await invalidateJournal()
        } else {
          ctx.journalIndex++
          emit({
            type: 'agent_done',
            agentId,
            label,
            phase,
            result: entry.result,
          })
          return resultToOutput(entry.result)
        }
      } else {
        // Divergence: discard subsequent journal entries; everything from here on runs live
        await invalidateJournal()
      }
    }

    let release: () => void
    try {
      release = await ctx.resources.semaphore.acquire(ctx.signal)
    } catch {
      // Queued wait during abort: the semaphore already removed the waiter and did not consume a permit
      throw new WorkflowAbortedError()
    }
    try {
      if (ctx.signal.aborted) throw new WorkflowAbortedError()
      // Budget check inside the semaphore critical section: a queued waiter sees the latest spent when woken,
      // otherwise N waiters enqueued while spent=0 all pass the check and overspend on wake-up without re-check.
      // Journal-hit path does not charge budget and needs no check.
      r.budget.assertCanSpend()

      const pending = ctx.ports.taskRegistrar.pendingAction(ctx.runId)
      if (pending?.kind === 'skip') {
        const result: AgentRunResult = { kind: 'skipped' }
        emit({ type: 'agent_done', agentId, label, phase, result })
        return null
      }

      ctx.resources.agentCountBox.value++
      emit({ type: 'agent_started', agentId, label, phase })
      const registry = ctx.ports.agentAdapterRegistry
      // onProgress closure: the backend loop accumulates token/tool counts -> emits an agent_progress event (carrying agentId for association)
      const onProgress = (update: AgentProgressUpdate): void => {
        emit({ type: 'agent_progress', agentId, label, phase, ...update })
      }
      // Inject agent-level AbortController register/unregister: the backend creates the controller then calls
      // registerAgentAbort to inject ports-layer bindings; service.kill(runId, agentId) uses this to
      // precisely abort a single agent. When the registry is absent (agentRunner fallback path), there is no backend middle layer,
      // and agentAbortControllers at the ports layer is always empty — single-agent kill degrades to a no-op on this path.
      const adapterCtx = registry
        ? {
            host: ctx.host,
            signal: ctx.signal,
            runId: ctx.runId,
            agentId,
            onProgress,
            ...(ctx.ports.taskRegistrar.registerAgentAbort
              ? {
                  registerAgentAbort: (
                    id: number,
                    ac: AbortController,
                  ): void => {
                    ctx.ports.taskRegistrar.registerAgentAbort?.(
                      ctx.runId,
                      id,
                      ac,
                    )
                  },
                }
              : {}),
            ...(ctx.ports.taskRegistrar.unregisterAgentAbort
              ? {
                  unregisterAgentAbort: (id: number): void => {
                    ctx.ports.taskRegistrar.unregisterAgentAbort?.(
                      ctx.runId,
                      id,
                    )
                  },
                }
              : {}),
          }
        : null
      // resolve is outside the try: configuration errors (e.g. AdapterNotFoundError) propagate directly without retry —
      // this is a workflow configuration problem, not a transient backend failure; retrying is meaningless and would mask the bug.
      const adapter = registry ? registry.resolve(params) : null
      const invokeBackend = async (): Promise<AgentRunResult> => {
        const rawResult = adapter
          ? adapter.run(params, adapterCtx!)
          : ctx.ports.agentRunner.runAgentToResult(params, ctx.host)
        return validateStructuredResult(await rawResult, params.schema)
      }

      // Auto-retry once on failure: dead (terminal API error after retries) or a non-abort throw
      // both get one retry chance; WorkflowAbortedError (kill) is not retried — it is the user's intent.
      // If retry still fails: dead stays dead; a throw degrades to dead (one agent must not take down the workflow).
      // budget is not double-charged: dead does not call addOutputTokens; retry-ok charges once (at the final ok).
      // dead.reason is passed through to the log: no-structured-output and invalid-structured-output
      // are high-frequency causes of death; logging detail makes the failed boundary visible immediately.
      // detail is wrapped with String() defensively: old journals or third-party adapters may write non-strings (corrupted data),
      // and calling .slice directly would throw a TypeError that pierces the logging path.
      type BackendAttempt =
        | { kind: 'result'; value: AgentRunResult }
        | { kind: 'error'; error: unknown }
      const attemptBackend = async (): Promise<BackendAttempt> => {
        try {
          return { kind: 'result', value: await invokeBackend() }
        } catch (error) {
          if (error instanceof WorkflowAbortedError) throw error
          return { kind: 'error', error }
        }
      }

      const first = await attemptBackend()
      let result: AgentRunResult
      if (first.kind === 'result' && first.value.kind !== 'dead') {
        result = first.value
      } else {
        if (first.kind === 'error') {
          const errorMessage =
            first.error instanceof Error
              ? first.error.message
              : String(first.error)
          ctx.ports.logger.warn?.(
            `agent "${label ?? `#${agentId}`}" threw (${errorMessage}); retrying once`,
          )
        } else if (first.value.kind === 'dead') {
          const detail =
            typeof first.value.detail === 'string' ? first.value.detail : ''
          ctx.ports.logger.warn?.(
            `agent "${label ?? `#${agentId}`}" returned dead` +
              (first.value.reason ? ` (${first.value.reason})` : '') +
              (detail ? `: ${detail.slice(0, 150)}` : '') +
              '; retrying once',
          )
        }

        const retry = await attemptBackend()
        result =
          retry.kind === 'result'
            ? retry.value
            : {
                kind: 'dead',
                reason: 'runagent-threw',
                detail:
                  retry.error instanceof Error
                    ? retry.error.message
                    : String(retry.error),
              }
      }
      if (result.kind === 'ok') {
        ctx.resources.budget.addOutputTokens(result.usage.outputTokens)
      }
      emit({ type: 'agent_done', agentId, label, phase, result })

      const entry: JournalEntry = { key, seq: agentId, result }
      // Key point: push order = completion order (not call order); read() already re-sorts by seq,
      // so during resume the call order aligns with the journal order and the key index stays stable.
      ctx.journal.push(entry)
      ctx.journalIndex++
      await ctx.ports.journalStore.append(ctx.runId, entry)
      return resultToOutput(result)
    } finally {
      release()
    }
  }

  const parallel: WorkflowHooks['parallel'] = async thunks => {
    if (thunks.length > MAX_ITEMS_PER_CALL) {
      throw new WorkflowError(
        `parallel exceeds the per-call items cap (${MAX_ITEMS_PER_CALL})`,
      )
    }
    return Promise.all(
      thunks.map(async (t, i) => {
        try {
          return await t()
        } catch (e) {
          // Cancellation is control flow for the entire run, not an item-level
          // failure. Swallowing it here makes runWorkflow persist a killed run
          // as successfully completed with a null item.
          if (e instanceof WorkflowAbortedError) throw e
          // The "null on error" contract is unchanged, but it should log — otherwise the workflow author cannot locate why an agent failed
          ctx.ports.logger.warn?.(
            `parallel thunk #${i} failed: ${(e as Error).message}`,
          )
          return null
        }
      }),
    )
  }

  const pipeline: WorkflowHooks['pipeline'] = async <T, R>(
    items: readonly T[],
    ...stages: Array<
      (prev: unknown, item: T, index: number) => Promise<unknown>
    >
  ): Promise<Array<R | null>> => {
    if (items.length > MAX_ITEMS_PER_CALL) {
      throw new WorkflowError(
        `pipeline exceeds the per-call items cap (${MAX_ITEMS_PER_CALL})`,
      )
    }
    return Promise.all(
      items.map(async (item, index): Promise<R | null> => {
        try {
          let prev: unknown = item
          for (const stage of stages) {
            prev = await stage(prev, item, index)
          }
          return prev as R
        } catch (e) {
          // Keep user cancellation observable by runWorkflow so it can emit
          // and persist the terminal `killed` state.
          if (e instanceof WorkflowAbortedError) throw e
          ctx.ports.logger.warn?.(
            `pipeline item #${index} failed: ${(e as Error).message}`,
          )
          return null
        }
      }),
    )
  }

  const phase: WorkflowHooks['phase'] = title => {
    if (ctx.currentPhase) {
      emit({ type: 'phase_done', phase: ctx.currentPhase })
    }
    ctx.currentPhase = title
    emit({ type: 'phase_started', phase: title })
  }

  const log: WorkflowHooks['log'] = message => {
    emit({ type: 'log', message })
  }

  const workflow: WorkflowHooks['workflow'] = async (nameOrRef, args) => {
    if (ctx.resources.depth >= 1) {
      throw new WorkflowError('workflow() nesting allows only one level')
    }
    const sub: Parameters<SubWorkflowRunner>[0] =
      typeof nameOrRef === 'string'
        ? { name: nameOrRef }
        : { scriptPath: nameOrRef.scriptPath }
    return runSubWorkflow({ ...sub, args })
  }

  return { agent, parallel, pipeline, phase, log, workflow }
}

function resultToOutput(result: AgentRunResult): unknown {
  return result.kind === 'ok' ? result.output : null
}

/** Enforce the caller-provided schema at the engine boundary for every adapter/runner implementation. */
function validateStructuredResult(
  result: AgentRunResult,
  schema?: object,
): AgentRunResult {
  if (!schema || result.kind !== 'ok') return result

  const { valid, errors } = validateAgainstSchema(result.output, schema)
  if (valid) return result

  return {
    kind: 'dead',
    reason: 'invalid-structured-output',
    detail:
      errors.length > 0
        ? errors.join('; ')
        : 'structured output does not match schema',
  }
}
