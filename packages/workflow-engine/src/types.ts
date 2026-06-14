// Pure type definitions. No runtime dependencies.
// WorkflowInput has been migrated to tool/schema.ts and derived via z.infer to avoid drift from the schema.

/** Shape of the script's `export const meta = {...}` (must be a plain literal). */
export type WorkflowMeta = {
  name: string
  description: string
  whenToUse?: string
  phases?: Array<{ title: string; detail?: string }>
}

/** Parameters passed by agent() to the AgentRunner. */
export type AgentRunParams = {
  prompt: string
  /** JSON Schema; when provided, agent returns a validated object instead of text. */
  schema?: object
  model?: string
  /** Output token cap (passed through to the agent backend, e.g. LLM max_tokens). */
  maxTokens?: number
  /** Custom subagent type (resolved from the registry). */
  agentType?: string
  isolation?: 'worktree'
  allowedTools?: string[]
  /** Display-only; not part of the journal key. */
  label?: string
  /** Display-only; not part of the journal key. */
  phase?: string
}

/** Progress snapshot while the agent is running (onProgress callback payload; backend loop accumulates tokens/tools). */
export type AgentProgressUpdate = {
  tokenCount: number
  toolCount: number
}

/**
 * Returned by AgentRunner. The ok variant carries model/toolCount for panel display (optional; standalone backends may leave them blank).
 *
 * dead carries optional reason/detail: the journal history only records `{kind:"dead"}` with no info,
 * so during debugging you cannot distinguish "agent finished but produced no StructuredOutput" from "runAgent threw".
 * reason lets the hooks retry log, the panel, and post-hoc auditing see the cause of death immediately.
 */
export type AgentRunResult =
  | {
      kind: 'ok'
      output: string | object
      usage: { outputTokens: number }
      /** The actually-resolved model id (display-only). */
      model?: string
      /** Number of tool calls during the agent run. */
      toolCount?: number
      /** Total context tokens at completion (display-only; same basis as the real-time agent_progress). */
      tokenCount?: number
    }
  | { kind: 'skipped' }
  | {
      kind: 'dead'
      /**
       * Cause-of-death classification for log aggregation / post-hoc auditing. Optional for backward compatibility with old journals.
       * - no-structured-output: agent finished but finalize content has no StructuredOutput (neither called tools nor produced JSON in text)
       * - runagent-threw: runAgent threw a non-abort error (API failure / context overflow / runtime error)
       * - worktree-failed: isolation:'worktree' creation failed (fail-closed degradation)
       * - unknown: unclassified (compatible with old backends / third-party adapters)
       */
      reason?:
        | 'no-structured-output'
        | 'runagent-threw'
        | 'worktree-failed'
        | 'unknown'
      /** Detail (error message / text preview) for logs; not shown to end users. */
      detail?: string
    }

/** A single record in the journal. seq = agent() call sequence number; read() re-sorts by it to stabilize resume. */
export type JournalEntry = {
  key: string
  /** agent() call order (from agentIdSeq; monotonically increasing across sub-workflows). */
  seq: number
  result: AgentRunResult
}

/** Progress events. All variants carry runId so the adapter can route to the corresponding task (multiple concurrent workflows). */
export type ProgressEvent =
  | {
      type: 'run_started'
      runId: string
      workflowName: string
      meta: WorkflowMeta | null
    }
  | { type: 'phase_started'; runId: string; phase: string }
  | { type: 'phase_done'; runId: string; phase: string }
  | {
      type: 'agent_started'
      runId: string
      agentId: number
      label?: string
      phase?: string
    }
  | {
      type: 'agent_done'
      runId: string
      agentId: number
      label?: string
      phase?: string
      result: AgentRunResult
    }
  | {
      type: 'agent_progress'
      runId: string
      agentId: number
      label?: string
      phase?: string
      tokenCount: number
      toolCount: number
    }
  | { type: 'log'; runId: string; message: string }
  | {
      type: 'run_done'
      runId: string
      status: 'completed' | 'failed' | 'killed'
      returnValue?: unknown
      error?: string
    }

/** Engine run result. */
export type WorkflowRunResult = {
  status: 'completed' | 'failed' | 'killed'
  returnValue?: unknown
  error?: string
}
