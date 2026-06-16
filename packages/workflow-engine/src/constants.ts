// Engine-level constants. No runtime dependencies.

/**
 * Workflow tool name. PascalCase matches the system's other tools (Agent/Bash/CronCreate…),
 * otherwise the case-sensitive toolMatchesName would fail on the model's natural select:Workflow.
 */
export const WORKFLOW_TOOL_NAME = 'Workflow'

/** Directory for user-named workflow files (relative to project root). */
export const WORKFLOW_DIR_NAME = '.claude/workflows'

/** Persistence directory for workflow runs (journal + run records). */
export const WORKFLOW_RUNS_DIR = '.claude/workflow-runs'

/** Supported script extensions for named workflows (in priority order). */
export const WORKFLOW_SCRIPT_EXTENSIONS = ['.ts', '.js', '.mjs'] as const

/**
 * Concurrency: default semaphore permits per workflow run.
 * History: previously used min(CAP, cpuCores - 2); changed to a fixed default of 3 — to avoid fanning out a dozen agents at once on multi-core machines.
 * A single run can override this via the Workflow tool's maxConcurrency input (still clamped by CAP).
 */
export const DEFAULT_MAX_CONCURRENCY = 3

/** Absolute cap on user-supplied maxConcurrency (anti-abuse). */
export const MAX_CONCURRENCY_CAP = 16

/** Total cap on agent() calls within a single workflow lifecycle. */
export const MAX_TOTAL_AGENTS = 1000

/** Items cap per single parallel()/pipeline() call. */
export const MAX_ITEMS_PER_CALL = 4096
