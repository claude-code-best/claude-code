import {
  createFileJournalStore,
  type ProgressEvent,
  type WorkflowPorts,
} from '@claude-code-best/workflow-engine'
import { logForDebugging } from '../utils/debug.js'
import { getProjectRoot } from '../bootstrap/state.js'
import { getRunsDir } from './persistence.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../services/analytics/index.js'
import {
  completeWorkflowTask,
  failWorkflowTask,
  killWorkflowTask,
  registerLocalWorkflowTask,
} from '../tasks/LocalWorkflowTask/LocalWorkflowTask.js'
import {
  buildHostBundle,
  makeHostHandle,
  readHostBundle,
  type WorkflowHostBundle,
} from './hostHandle.js'
import { buildRegistry } from './registry.js'
import type { ProgressBus } from './progress/bus.js'
import type { ProgressStore } from './progress/store.js'
import type { SetAppState } from '../Task.js'
import type { AssistantMessage } from '../types/message.js'

type RunBinding = {
  runId: string
  taskId: string
  setAppState: SetAppState
  abortController: AbortController
  workflowName: string
  /** agentId → AbortController. Registered when backend starts an agent; killAgent uses it for precise abort. */
  agentAbortControllers: Map<number, AbortController>
}

/** Constructs a WorkflowHostContext from toolUseContext on each tool invocation. */
function makeHostFactory(): WorkflowPorts['hostFactory'] {
  return ({ context, canUseTool, parentMessage }) => {
    const ctx = context as WorkflowHostBundle['toolUseContext'] & {
      agentId?: string
    }
    return {
      handle: makeHostHandle(
        buildHostBundle(
          ctx,
          canUseTool as WorkflowHostBundle['canUseTool'],
          parentMessage as AssistantMessage | undefined,
        ),
      ),
      // Use projectRoot rather than getCwd(): shares the same root as journalStore's runsDir,
      // otherwise named workflow resolution and journal persistence diverge when the user
      // enters a worktree/sub-directory. The engine's internal ctx.cwd is only used for
      // resolution (scriptPath/name) and does not affect the agent's execution cwd
      // (the agent gets its own cwd via the toolUseContext inside the host bundle).
      cwd: getProjectRoot(),
      budgetTotal: null, // turn-level budget injection point (read from settings in the future)
      ...(ctx.toolUseId ? { toolUseId: ctx.toolUseId } : {}),
    }
  }
}

/**
 * Assembles the complete WorkflowPorts. bus/store are passed in by the caller (shared via the service singleton).
 * taskRegistrar maintains runId → RunBinding for kill routing.
 */
export function createWorkflowPorts(opts: {
  bus: ProgressBus
  store: ProgressStore
}): WorkflowPorts {
  const bindings = new Map<string, RunBinding>()
  const runsDir = getRunsDir()
  const registry = buildRegistry()

  // Telemetry subscription (independent of store). LogEventMetadata only accepts boolean/number/undefined,
  // and runId is a string — use the brand cast provided by the analytics module (verified non-code/path) to pass it through.
  opts.bus.subscribe((e: ProgressEvent) => {
    if (e.type === 'run_done') {
      logEvent('tengu_workflow_done', {
        status: e.status === 'completed' ? 0 : e.status === 'failed' ? 1 : 2,
        runId:
          e.runId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }
  })

  const taskRegistrar: WorkflowPorts['taskRegistrar'] = {
    register(regOpts, host) {
      const bundle = readHostBundle(host)
      const setAppState =
        bundle.toolUseContext.setAppStateForTasks ??
        bundle.toolUseContext.setAppState
      const abortController = new AbortController()
      const taskId = registerLocalWorkflowTask(setAppState, {
        description: regOpts.summary ?? regOpts.workflowName,
        workflowName: regOpts.workflowName,
        workflowFile: regOpts.workflowFile ?? '',
        summary: regOpts.summary,
        ...(regOpts.toolUseId ? { toolUseId: regOpts.toolUseId } : {}),
        abortController,
      })
      const runId = regOpts.runId ?? taskId
      bindings.set(runId, {
        runId,
        taskId,
        setAppState,
        abortController,
        workflowName: regOpts.workflowName,
        agentAbortControllers: new Map(),
      })
      logForDebugging(
        `workflow task registered: ${runId} (${regOpts.workflowName})`,
      )
      return { runId, signal: abortController.signal }
    },
    complete(runId, summary) {
      const b = bindings.get(runId)
      if (!b) return
      completeWorkflowTask(b.taskId, b.setAppState)
      logForDebugging(`workflow ${runId} completed: ${summary ?? ''}`)
      bindings.delete(runId)
    },
    fail(runId, error) {
      const b = bindings.get(runId)
      if (!b) return
      failWorkflowTask(b.taskId, b.setAppState, error)
      logForDebugging(`workflow ${runId} failed: ${error}`)
      bindings.delete(runId)
    },
    kill(runId) {
      const b = bindings.get(runId)
      if (!b) return
      killWorkflowTask(b.taskId, b.setAppState) // internal abort controller
      // Killing the run also aborts all in-flight agents (guards against the edge timing where the backend misses the task abort)
      for (const ac of b.agentAbortControllers.values()) {
        try {
          ac.abort()
        } catch {
          // no-op: abort won't throw internally, but fail-closed
        }
      }
      b.agentAbortControllers.clear()
      bindings.delete(runId)
    },
    registerAgentAbort(runId, agentId, ac) {
      const b = bindings.get(runId)
      if (!b) return
      b.agentAbortControllers.set(agentId, ac)
    },
    unregisterAgentAbort(runId, agentId) {
      const b = bindings.get(runId)
      if (!b) return
      b.agentAbortControllers.delete(agentId)
    },
    killAgent(runId, agentId) {
      const b = bindings.get(runId)
      if (!b) return false
      const ac = b.agentAbortControllers.get(agentId)
      if (!ac) return false
      try {
        ac.abort()
      } catch {
        // no-op
      }
      b.agentAbortControllers.delete(agentId)
      return true
    },
    pendingAction() {
      return null // v1: skip/retry not wired (seam retained)
    },
  }

  return {
    hostFactory: makeHostFactory(),
    agentAdapterRegistry: registry,
    agentRunner: {
      // Dead-code fallback: hooks always go through agentAdapterRegistry (required on ports). Reaching here means the registry was not registered — fail-fast.
      async runAgentToResult() {
        throw new Error(
          'workflow agentRunner fallback reached — agentAdapterRegistry must be set on ports',
        )
      },
    },
    progressEmitter: {
      emit(event) {
        opts.bus.emit(event) // → store reducer + telemetry
      },
    },
    taskRegistrar,
    journalStore: createFileJournalStore(runsDir),
    permissionGate: { isAborted: () => false }, // engine uses ctx.signal to check abort
    logger: {
      debug: msg => logForDebugging(msg),
      warn: msg => logForDebugging(`[workflow warn] ${msg}`),
      event: name => logForDebugging(`workflow event: ${name}`),
    },
  }
}
