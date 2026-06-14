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
      | 'maxConcurrency'
    >,
    toolUseContext: ToolUseContext,
    canUseTool: CanUseToolFn,
  ): Promise<{ runId: string; scriptPath?: string }>
  kill(runId: string): void
  /**
   * 中断单个 agent（不影响同 run 其他 agent，workflow 继续跑）。
   * 返回是否命中（false = agent 已完成/不存在）。agent 被 abort 后返回 dead → null。
   */
  killAgent(runId: string, agentId: number): boolean
  /**
   * 进程退出 / 配置卸载时清理：杀掉所有 running run，避免孤儿 task。
   * 已完成/失败的 run 不受影响。幂等——多次调用安全。
   */
  shutdown(): void
  listRuns(): RunProgress[]
  getRun(runId: string): RunProgress | undefined
  /**
   * 异步按 runId 查：内存命中则返回；miss 读盘 state.json（不注入内存）。
   * 供"按 runId 取历史 return"场景；面板展示请走 loadPersistedRuns + listRuns。
   */
  getRunAsync(runId: string): Promise<RunProgress | undefined>
  /**
   * 扫盘把所有历史 run 的 state.json hydrate 进 store（已存在 runId 跳过）。
   * 进程单例内仅实际扫盘一次（persistedLoaded flag）；重复调用立即返回。
   */
  loadPersistedRuns(): Promise<void>
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
  // 订阅 run_done 写终态快照到磁盘（completed/failed/killed 三态共用入口，shutdown-kill 也走此路径）。
  // store 先于本订阅注册到 bus，故 listener 执行时 store.get(runId) 已是终态。
  attachRunStatePersistence(bus, store)
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
 *
 * @param cwdOverride 仅供测试注入临时目录（避免 inline 持久化写真实项目目录）。
 * @param runsDirProvider 仅供测试注入 tmpdir（Bun ESM 模块命名空间只读，无法 monkey-patch getRunsDir）。
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
    // 用 projectRoot 与 ports.ts hostFactory / journalStore 保持同根；
    // 进入 worktree/子目录时不会让命名 workflow 解析与 journal 落盘不同步。
    // cwdOverride 仅供测试注入临时目录（避免 inline 持久化写真实项目目录）。
    cwd: cwdOverride ?? getProjectRoot(),
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

  // loadPersistedRuns 的进程单例 flag：首次调用后置 true，后续重复调用立即返回。
  // 扫盘失败时复位允许下次重试。每个 makeService 调用独立闭包变量（测试构造新 service 时重置）。
  let persistedLoaded = false

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

      // inline 入口持久化脚本到 run 目录（与 WorkflowTool 对称），返回可复用路径。
      // 写盘失败降级（log），不阻断 run（script 已在内存）。
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
      // 仅杀 running：已完成/失败的 run taskRegistrar 已回收 binding，kill 是 no-op。
      // taskRegistrar.kill 对未知 runId 安全 no-op，因此幂等——多次 shutdown 不重复抛错。
      // 每个 kill 单独 try/catch：kill 内部走 setAppState，进程 exit 阶段触发 React 重渲染
      // 可能抛错（render 已卸载等）；单个失败不应阻断其他 run 的清理。
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
        const runs = await listPersistedRuns(runsDirProvider())
        for (const run of runs) store.hydrate(run)
      } catch (e) {
        // 扫盘失败不阻断面板：log + 复位 flag 允许下次重试
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
