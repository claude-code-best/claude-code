import {
  listNamedWorkflows,
  parseScript,
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
 * WorkflowService：工具（U7）与面板（U9）共享的唯一入口。
 *
 * - `ports`：共享的 WorkflowPorts，工具描述符透传给引擎。
 * - `launch`：解析脚本 → parseScript 快速校验 → taskRegistrar.register（拿 runId+signal）
 *   → detached runWorkflow → 结束后 complete/fail/kill。
 * - `kill/listRuns/getRun/subscribe/listNamed`：面板与工具的辅助查询。
 */
export type WorkflowService = {
  /** 共享端口（工具描述符用）。 */
  ports: WorkflowPorts
  /** 面板/工具启动 workflow：解析脚本 → register → detached runWorkflow。 */
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
    >,
    toolUseContext: ToolUseContext,
    canUseTool: CanUseToolFn,
  ): Promise<{ runId: string }>
  kill(runId: string): void
  /**
   * 进程退出 / 配置卸载时清理：杀掉所有 running run，避免孤儿 task。
   * 已完成/失败的 run 不受影响。幂等——多次调用安全。
   */
  shutdown(): void
  listRuns(): RunProgress[]
  getRun(runId: string): RunProgress | undefined
  subscribe(listener: () => void): () => void
  listNamed(workflowDir?: string): Promise<string[]>
}

let cached: WorkflowService | null = null

/** 进程单例。工具与面板共享同一 ports/registry/store。 */
export function getWorkflowService(): WorkflowService {
  if (cached) return cached
  const bus = createProgressBus()
  const store = createProgressStoreFromBus(bus)
  const ports = createWorkflowPorts({ bus, store })
  const service = makeService(ports, store)
  // 安装状态变更通知桥接（commit 0768d4dc 承诺但旧实现落空的"完成时自动通知"）
  installWorkflowNotifications(service)
  cached = service
  return cached
}

/**
 * 构造 service（注入 ports + store）。
 *
 * 生产路径用 {@link getWorkflowService}；测试用本函数直接注入 fake ports，
 * 避免触碰真实的 getProjectRoot/getCwd/analytics 等模块级副作用。
 */
export function makeService(
  ports: WorkflowPorts,
  store: ProgressStore,
): WorkflowService {
  const buildHost = (
    toolUseContext: ToolUseContext,
    canUseTool: CanUseToolFn,
  ): WorkflowHostContext => ({
    handle: makeHostHandle(buildHostBundle(toolUseContext, canUseTool)),
    // 用 projectRoot 与 ports.ts hostFactory / journalStore 保持同根；
    // 进入 worktree/子目录时不会让命名 workflow 解析与 journal 落盘不同步。
    cwd: getProjectRoot(),
    budgetTotal: null, // turn 级预算注入点（未来从 settings 读）
    toolUseId: toolUseContext.toolUseId,
  })

  async function resolveSource(input: {
    script?: string
    name?: string
    scriptPath?: string
  }): Promise<{
    script: string
    workflowFile?: string
    workflowName: string
  }> {
    if (input.script) {
      return { script: input.script, workflowName: 'workflow' }
    }
    if (input.scriptPath) {
      return {
        script: await readFile(input.scriptPath, 'utf-8'),
        workflowFile: input.scriptPath,
        workflowName: 'workflow',
      }
    }
    if (input.name) {
      const dir = join(getProjectRoot(), WORKFLOW_DIR_NAME)
      const found = await resolveNamedWorkflow(dir, input.name)
      if (!found) {
        throw new Error(
          `命名 workflow "${input.name}" 未找到（查找 ${WORKFLOW_DIR_NAME}/）`,
        )
      }
      return {
        script: found.content,
        workflowFile: found.path,
        workflowName: input.name,
      }
    }
    throw new Error('必须提供 script、name 或 scriptPath 之一')
  }

  return {
    ports,

    async launch(input, toolUseContext, canUseTool) {
      const { script, workflowFile, workflowName } = await resolveSource(input)
      try {
        parseScript(script)
      } catch (e) {
        throw new Error(`脚本校验失败：${(e as Error).message}`)
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

      // detached：不 await，让调用方立即拿到 runId；结束路由到 registrar。
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
      return { runId }
    },

    kill(runId) {
      ports.taskRegistrar.kill(runId)
    },

    shutdown() {
      // 仅杀 running：已完成/失败的 run taskRegistrar 已回收 binding，kill 是 no-op。
      // taskRegistrar.kill 对未知 runId 安全 no-op，因此幂等——多次 shutdown 不重复抛错。
      for (const run of store.list()) {
        if (run.status === 'running') ports.taskRegistrar.kill(run.runId)
      }
    },

    listRuns: () => store.list(),
    getRun: id => store.get(id),
    subscribe: fn => store.subscribe(fn),

    async listNamed(workflowDir) {
      return listNamedWorkflows(
        workflowDir ?? join(getProjectRoot(), WORKFLOW_DIR_NAME),
      )
    },
  }
}

/** 测试用：重置单例（避免跨用例污染）。 */
export function __resetWorkflowServiceForTests(): void {
  cached = null
}

/**
 * 返回已实例化的 service（不创建）。进程退出 / 配置卸载时用本函数 peek，
 * 没用过 workflow 则 cached 仍为 null——避免在 exit hook 里副作用地创建 bus/ports。
 */
export function peekWorkflowService(): WorkflowService | null {
  return cached
}
