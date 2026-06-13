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
}

/** 每次工具调用从 toolUseContext 构造 WorkflowHostContext。 */
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
      // 用 projectRoot 而非 getCwd()：与 journalStore 的 runsDir 同根，
      // 否则用户进入 worktree/子目录时命名 workflow 解析与 journal 落盘不同步。
      // 引擎内部 ctx.cwd 仅用于解析（scriptPath/name），不影响 agent 执行 cwd
      // （agent 通过 host bundle 内的 toolUseContext 拿到自己的 cwd）。
      cwd: getProjectRoot(),
      budgetTotal: null, // turn 级预算注入点（未来从 settings 读）
      ...(ctx.toolUseId ? { toolUseId: ctx.toolUseId } : {}),
    }
  }
}

/**
 * 组装完整 WorkflowPorts。bus/store 由调用方传入（service 单例共享）。
 * taskRegistrar 维护 runId → RunBinding 供 kill 路由。
 */
export function createWorkflowPorts(opts: {
  bus: ProgressBus
  store: ProgressStore
}): WorkflowPorts {
  const bindings = new Map<string, RunBinding>()
  const runsDir = getRunsDir()
  const registry = buildRegistry()

  // 遥测订阅（独立于 store）。LogEventMetadata 只接受 boolean/number/undefined，
  // runId 为字符串——用 analytics 模块自带的 brand cast（已验证非代码/路径）放行。
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
      killWorkflowTask(b.taskId, b.setAppState) // 内部 abort controller
      bindings.delete(runId)
    },
    pendingAction() {
      return null // v1：skip/retry 不接线（seam 保留）
    },
  }

  return {
    hostFactory: makeHostFactory(),
    agentAdapterRegistry: registry,
    agentRunner: {
      // 死代码兜底：hooks 始终走 agentAdapterRegistry（ports 必设）。若到此说明 registry 未注册——fail-fast。
      async runAgentToResult() {
        throw new Error(
          'workflow agentRunner fallback reached — agentAdapterRegistry must be set on ports',
        )
      },
    },
    progressEmitter: {
      emit(event) {
        opts.bus.emit(event) // → store reducer + 遥测
      },
    },
    taskRegistrar,
    journalStore: createFileJournalStore(runsDir),
    permissionGate: { isAborted: () => false }, // 引擎用 ctx.signal 判 abort
    logger: {
      debug: msg => logForDebugging(msg),
      warn: msg => logForDebugging(`[workflow warn] ${msg}`),
      event: name => logForDebugging(`workflow event: ${name}`),
    },
  }
}
