import {
  listNamedWorkflows,
  parseScript,
  persistInlineScript,
  resolveNamedWorkflow,
  runWorkflow,
  WORKFLOW_DIR_NAME,
  type WorkflowHostContext,
  type WorkflowInput,
  type WorkflowPorts,
} from '@claude-code-best/workflow-engine'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getProjectRoot } from '../bootstrap/state.js'
import { logForDebugging } from '../utils/debug.js'
import { buildHostBundle, makeHostHandle } from './hostHandle.js'
import { installWorkflowNotifications } from './notifications.js'
import {
  attachRunStatePersistence,
  getRunsDir,
  listPersistedRuns,
  readRunState,
} from './persistence.js'

/**
 * How many newest persisted runs to hydrate into the store on panel open. Tuned to cover a normal
 * day's worth of workflow iterations without overrunning the panel tab row; anything older stays
 * on disk and is still resumable via getRunAsync until cleanupOldRuns reclaims it.
 */
const LOAD_PERSISTED_LIMIT = 20
import { createProgressBus } from './progress/bus.js'
import {
  createProgressStoreFromBus,
  type ProgressStore,
  type RunProgress,
} from './progress/store.js'
import { createWorkflowPorts } from './ports.js'
import type { CanUseToolFn } from '../hooks/useCanUseTool.js'
import type { ToolUseContext } from '../Tool.js'

/**
 * WorkflowService: the single entry shared by the tool (U7) and panel (U9).
 *
 * - `ports`: shared WorkflowPorts; tool descriptors are passed through to the engine.
 * - `launch`: parse script → parseScript quick validation → taskRegistrar.register (gets runId+signal)
 *   → detached runWorkflow → on completion routes to complete/fail/kill.
 * - `kill/listRuns/getRun/subscribe/listNamed`: auxiliary queries for panel and tool.
 */
export type WorkflowService = {
  /** Shared ports (used by tool descriptors). */
  ports: WorkflowPorts
  /** Panel/tool launches a workflow: parse script → register → detached runWorkflow. */
  launch(
    input: Pick<
      WorkflowInput,
      | 'script'
      | 'name'
      | 'scriptPath'
      | 'args'
      | 'description'
      | 'resumeFromRunId'
      | 'title'
      | 'maxConcurrency'
    >,
    toolUseContext: ToolUseContext,
    canUseTool: CanUseToolFn,
  ): Promise<{ runId: string; scriptPath?: string }>
  kill(runId: string): void
  /**
   * Aborts a single agent (does not affect other agents in the same run; workflow keeps running).
   * Returns whether the agent was hit (false = agent already finished/does not exist). An aborted agent returns dead → null.
   */
  killAgent(runId: string, agentId: number): boolean
  /**
   * Cleanup on process exit / config unload: kill all running runs to avoid orphan tasks.
   * Completed/failed runs are unaffected. Idempotent — safe to call multiple times.
   */
  shutdown(): void
  listRuns(): RunProgress[]
  getRun(runId: string): RunProgress | undefined
  /**
   * Async lookup by runId: return on memory hit; on miss read state.json from disk (not injected into memory).
   * Used by the "get historical return by runId" scenario; for panel display use loadPersistedRuns + listRuns.
   */
  getRunAsync(runId: string): Promise<RunProgress | undefined>
  /**
   * Scans the disk and hydrates state.json of all historical runs into the store (skips existing runIds).
   * The process singleton only scans the disk once (persistedLoaded flag); repeated calls return immediately.
   */
  loadPersistedRuns(): Promise<void>
  subscribe(listener: () => void): () => void
  listNamed(workflowDir?: string): Promise<string[]>
}

let cached: WorkflowService | null = null

/** Process singleton. Tool and panel share the same ports/registry/store. */
export function getWorkflowService(): WorkflowService {
  if (cached) return cached
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  const service = makeService(ports, store)
  // Subscribe to run_done to write the terminal snapshot to disk (shared entry for completed/failed/killed; shutdown-kill also routes here).
  // The store registers to the bus before this subscription, so when the listener runs store.get(runId) is already terminal.
  attachRunStatePersistence(bus, store)
  // Install the state-change notification bridge (commit 0768d4dc promised "auto-notify on completion" but the old implementation left it unfulfilled)
  installWorkflowNotifications(service)
  cached = service
  return cached
}

/**
 * Construct the service (inject ports + store).
 *
 * Production path uses {@link getWorkflowService}; tests use this function to inject fake ports directly,
 * avoiding touching real getProjectRoot/getCwd/analytics and other module-level side effects.
 *
 * @param cwdOverride For tests only: inject a temp directory (avoids inline persistence writing to the real project directory).
 * @param runsDirProvider For tests only: inject a tmpdir (Bun ESM module namespace is read-only, cannot monkey-patch getRunsDir).
 */
export function makeService(
  ports: WorkflowPorts,
  store: ProgressStore,
  cwdOverride?: string,
  runsDirProvider: () => string = getRunsDir,
): WorkflowService {
  const buildHost = (
    toolUseContext: ToolUseContext,
    canUseTool: CanUseToolFn,
  ): WorkflowHostContext => ({
    handle: makeHostHandle(buildHostBundle(toolUseContext, canUseTool)),
    // Use projectRoot to stay in sync with ports.ts hostFactory / journalStore;
    // entering a worktree/subdirectory will not desync named workflow resolution from journal persistence.
    // cwdOverride is for tests only: inject a temp directory (avoids inline persistence writing to the real project directory).
    cwd: cwdOverride ?? getProjectRoot(),
    budgetTotal: null, // turn-level budget injection point (in future read from settings)
    toolUseId: toolUseContext.toolUseId,
  })

  async function resolveSource(input: {
    script?: string
    name?: string
    scriptPath?: string
    title?: string
  }): Promise<{
    script: string
    workflowFile?: string
    workflowName: string
  }> {
    // Mirrors WorkflowTool.ts: name takes priority over title; only fall back to the literal
    // 'workflow' when neither is supplied (so /workflows tabs don't pile up under a same default name).
    const workflowName = input.name ?? input.title ?? 'workflow'
    if (input.script) {
      return { script: input.script, workflowName }
    }
    if (input.scriptPath) {
      return {
        script: await readFile(input.scriptPath, 'utf-8'),
        workflowFile: input.scriptPath,
        workflowName,
      }
    }
    if (input.name) {
      const dir = join(getProjectRoot(), WORKFLOW_DIR_NAME)
      const found = await resolveNamedWorkflow(dir, input.name)
      if (!found) {
        throw new Error(
          `Named workflow "${input.name}" not found (looked in ${WORKFLOW_DIR_NAME}/)`,
        )
      }
      return {
        script: found.content,
        workflowFile: found.path,
        workflowName: input.name,
      }
    }
    throw new Error('One of script, name, or scriptPath must be provided')
  }

  // Process-singleton flag for loadPersistedRuns: set to true on first call, subsequent calls return immediately.
  // Reset on scan failure to allow next retry. Each makeService call has its own closure variable (reset when tests build a new service).
  let persistedLoaded = false

  return {
    ports,

    async launch(input, toolUseContext, canUseTool) {
      const { script, workflowFile, workflowName } = await resolveSource(input)
      try {
        parseScript(script)
      } catch (e) {
        throw new Error(`Script validation failed: ${(e as Error).message}`)
      }

      const host = buildHost(toolUseContext, canUseTool)
      const { runId, signal } = ports.taskRegistrar.register(
        {
          workflowName,
          ...(workflowFile ? { workflowFile } : {}),
          ...(input.description ? { summary: input.description } : {}),
          ...(host.toolUseId ? { toolUseId: host.toolUseId } : {}),
          ...(input.resumeFromRunId ? { runId: input.resumeFromRunId } : {}),
        },
        host.handle,
      )

      // Inline entry: persist script to the run directory (symmetric with WorkflowTool), return a reusable path.
      // Degrade on write failure (log), do not block the run (script is already in memory).
      let persistedScriptPath: string | undefined
      if (!workflowFile && input.script) {
        try {
          persistedScriptPath = await persistInlineScript(
            input.script,
            runId,
            host.cwd,
          )
        } catch (e) {
          logForDebugging(
            `workflow inline script persist failed: ${(e as Error).message}`,
          )
        }
      }

      // detached: do not await, let the caller get runId immediately; on completion route to the registrar.
      void runWorkflow({
        script,
        ...(input.args !== undefined ? { args: input.args } : {}),
        runId,
        workflowName,
        ports,
        host: host.handle,
        signal,
        cwd: host.cwd,
        budgetTotal: host.budgetTotal,
        ...(input.maxConcurrency !== undefined
          ? { maxConcurrency: input.maxConcurrency }
          : {}),
        ...(input.resumeFromRunId ? { resume: true } : {}),
      })
        .then(result => {
          if (result.status === 'completed') {
            ports.taskRegistrar.complete(runId)
          } else if (result.status === 'failed') {
            ports.taskRegistrar.fail(runId, result.error ?? 'failed')
          } else {
            ports.taskRegistrar.kill(runId)
          }
        })
        .catch(e => ports.taskRegistrar.fail(runId, (e as Error).message))

      logForDebugging(`workflow launched: ${runId} (${workflowName})`)
      return {
        runId,
        ...(persistedScriptPath ? { scriptPath: persistedScriptPath } : {}),
      }
    },

    kill(runId) {
      ports.taskRegistrar.kill(runId)
    },
    killAgent(runId, agentId) {
      return ports.taskRegistrar.killAgent?.(runId, agentId) ?? false
    },

    shutdown() {
      // Only kill running: for completed/failed runs the taskRegistrar has already reclaimed the binding, kill is a no-op.
      // taskRegistrar.kill is a safe no-op for unknown runIds, hence idempotent — multiple shutdowns do not throw repeatedly.
      // Each kill is wrapped in its own try/catch: kill internally routes through setAppState, and process-exit phase triggers a React re-render
      // which may throw (render already unmounted, etc.); a single failure should not block cleanup of other runs.
      for (const run of store.list()) {
        if (run.status !== 'running') continue
        try {
          ports.taskRegistrar.kill(run.runId)
        } catch (e) {
          logForDebugging(
            `workflow shutdown: kill ${run.runId} failed: ${(e as Error).message}`,
          )
        }
      }
    },

    listRuns: () => store.list(),
    getRun: id => store.get(id),
    async getRunAsync(id) {
      const mem = store.get(id)
      if (mem) return mem
      return (await readRunState(runsDirProvider(), id)) ?? undefined
    },
    async loadPersistedRuns() {
      if (persistedLoaded) return
      persistedLoaded = true
      try {
        // Cap hydration at LOAD_PERSISTED_LIMIT newest runs so the panel tab row doesn't drown
        // under accumulated history. Older state.json files stay on disk (within KEEP_MAX_RUNS,
        // maintained by cleanupOldRuns) and remain resumable via getRunAsync.
        const runs = await listPersistedRuns(
          runsDirProvider(),
          LOAD_PERSISTED_LIMIT,
        )
        for (const run of runs) store.hydrate(run)
      } catch (e) {
        // Scan failure does not block the panel: log + reset flag to allow next retry
        logForDebugging(
          `[workflow warn] loadPersistedRuns failed: ${(e as Error).message}`,
        )
        persistedLoaded = false
      }
    },
    subscribe: fn => store.subscribe(fn),

    async listNamed(workflowDir) {
      return listNamedWorkflows(
        workflowDir ?? join(getProjectRoot(), WORKFLOW_DIR_NAME),
      )
    },
  }
}

/** For tests: reset the singleton (avoid cross-case contamination). */
export function __resetWorkflowServiceForTests(): void {
  cached = null
}

/**
 * Returns the already-instantiated service (does not create one). Used on process exit / config unload to peek;
 * if workflow was never used, cached is still null — avoids side-effecting bus/ports creation in the exit hook.
 */
export function peekWorkflowService(): WorkflowService | null {
  return cached
}
