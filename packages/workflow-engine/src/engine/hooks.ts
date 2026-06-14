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

/** workflow() 钩子的子 workflow 执行器（由 runWorkflow 注入，避免循环依赖）。 */
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
  // 所有进度事件自动注入 runId，供 adapter 路由到对应 task（多并发 workflow）
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
        `workflow 超过 agent 总数上限 (${MAX_TOTAL_AGENTS})`,
      )
    }

    // 每次 agent() 调用分配唯一 id（含 journal 命中），盖戳 started/done 供 reducer 精确关联
    const agentId = r.agentIdSeq.value++

    const params: AgentRunParams = { prompt, ...opts }
    const key = agentCallKey(prompt, params)
    const label = opts.label as string | undefined
    const phase =
      (opts.phase as string | undefined) ?? ctx.currentPhase ?? undefined

    // journal 命中 → 直接返回缓存
    if (!ctx.journalInvalidated && ctx.journalIndex < ctx.journal.length) {
      const entry = ctx.journal[ctx.journalIndex]!
      if (entry.key === key) {
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
      // 发散：丢弃后续 journal，后续全部现场跑
      ctx.journalInvalidated = true
      ctx.journal = ctx.journal.slice(0, ctx.journalIndex)
      await ctx.ports.journalStore.truncate(ctx.runId)
    }

    let release: () => void
    try {
      release = await ctx.resources.semaphore.acquire(ctx.signal)
    } catch {
      // abort 期间在队列中等待：semaphore 已把 waiter 移除、未消耗 permit
      throw new WorkflowAbortedError()
    }
    try {
      if (ctx.signal.aborted) throw new WorkflowAbortedError()
      // 预算检查在 semaphore 临界区内：queued waiter 被唤醒后看到最新 spent，
      // 否则 N 个 waiter 入队时 spent=0 全过检，唤醒后无 re-check 全部超支。
      // journal 命中路径不扣预算，无需检查。
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
      // onProgress 闭包：后端循环累计 token/tool → 发 agent_progress 事件（带 agentId 关联）
      const onProgress = (update: AgentProgressUpdate): void => {
        emit({ type: 'agent_progress', agentId, label, phase, ...update })
      }
      // 注入 agent 级 AbortController 注册/注销：backend 创建 controller 后调
      // registerAgentAbort 注入 ports 层 bindings，service.kill(runId, agentId) 据此
      // 精确中断单个 agent。registry 不存在（agentRunner 兜底路径）时无 backend 中间层，
      // ports 层 agentAbortControllers 永远空——单 agent kill 在该路径降级为 no-op。
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
      // resolve 在 try 外：配置错（AdapterNotFoundError 等）直接上抛，不走重试——
      // 这是 workflow 配置问题而非 backend 临时故障，重试无意义且掩盖 bug。
      const adapter = registry ? registry.resolve(params) : null
      const invokeBackend = (): Promise<AgentRunResult> =>
        adapter
          ? adapter.run(params, adapterCtx!)
          : ctx.ports.agentRunner.runAgentToResult(params, ctx.host)

      // 失败一次自动重试：dead（terminal API error after retries）或 非 abort 抛错
      // 都给一次重试机会；WorkflowAbortedError（kill）不重试——是用户意图。
      // 重试仍失败：dead 保持 dead；throw 降级为 dead（不让一个 agent 击穿 workflow）。
      // budget 不重复扣：dead 不 addOutputTokens；重试 ok 才扣一次（最终 ok 时）。
      // dead.reason 透传到日志（审计 8/12 dead 都是 no-structured-output 时直接可见）。
      let result: AgentRunResult
      try {
        result = await invokeBackend()
        if (result.kind === 'dead') {
          ctx.ports.logger.warn?.(
            `agent "${label ?? `#${agentId}`}" returned dead` +
              (result.reason ? ` (${result.reason})` : '') +
              (result.detail ? `: ${result.detail.slice(0, 150)}` : '') +
              '; retrying once',
          )
          result = await invokeBackend()
        }
      } catch (e) {
        if (e instanceof WorkflowAbortedError) throw e
        ctx.ports.logger.warn?.(
          `agent "${label ?? `#${agentId}`}" threw (${(e as Error).message}); retrying once`,
        )
        try {
          result = await invokeBackend()
        } catch (e2) {
          if (e2 instanceof WorkflowAbortedError) throw e2
          // 重试仍抛：降级 dead（保持 workflow 继续；hooks.agent 返 null）
          result = {
            kind: 'dead',
            reason: 'runagent-threw',
            detail: (e2 as Error).message,
          }
        }
      }
      if (result.kind === 'ok') {
        ctx.resources.budget.addOutputTokens(result.usage.outputTokens)
      }
      emit({ type: 'agent_done', agentId, label, phase, result })

      const entry: JournalEntry = { key, seq: agentId, result }
      // 关键：push 顺序 = 完成顺序（非调用顺序）；read() 已按 seq 重排，
      // 因此 resume 时调用顺序与 journal 顺序对齐，key 索引稳定。
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
        `parallel 超过单次调用 items 上限 (${MAX_ITEMS_PER_CALL})`,
      )
    }
    return Promise.all(
      thunks.map(async (t, i) => {
        try {
          return await t()
        } catch (e) {
          // "null on error"契约不变，但应 log——否则 workflow 作者无法定位为何 agent 失败
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
        `pipeline 超过单次调用 items 上限 (${MAX_ITEMS_PER_CALL})`,
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
      throw new WorkflowError('workflow() 嵌套仅允许一层')
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
