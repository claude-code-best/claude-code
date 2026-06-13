import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { WORKFLOW_DIR_NAME } from '../constants.js'
import type { HostHandle, WorkflowPorts } from '../ports.js'
import type { JournalEntry, WorkflowRunResult } from '../types.js'
import { createEngineContext } from './context.js'
import { WorkflowAbortedError, WorkflowError } from './errors.js'
import { makeHooks, type SubWorkflowRunner } from './hooks.js'
import { resolveNamedWorkflow } from './namedWorkflows.js'
import { parseScript, type ParsedScript } from './script.js'

export type RunWorkflowOptions = {
  /** 已解析好的脚本源码。 */
  script: string
  args?: unknown
  runId: string
  workflowName?: string
  ports: WorkflowPorts
  host: HostHandle
  signal: AbortSignal
  cwd: string
  budgetTotal: number | null
  /** resume：true 时载入既有 journal 重放。 */
  resume?: boolean
  /** resume 时脚本源码 hash 是否变化。true 则忽略 journal 全重跑。 */
  scriptChanged?: boolean
}

export async function runWorkflow(
  opts: RunWorkflowOptions,
): Promise<WorkflowRunResult> {
  const { ports } = opts

  let parsed: ParsedScript
  try {
    parsed = parseScript(opts.script)
  } catch (e) {
    const error = (e as Error).message
    ports.progressEmitter.emit({
      type: 'run_done',
      runId: opts.runId,
      status: 'failed',
      error,
    })
    return { status: 'failed', error }
  }

  const workflowName = opts.workflowName ?? parsed.meta?.name ?? 'workflow'

  // 载入 journal（仅 resume 且脚本未变）
  let journal: JournalEntry[] = []
  let journalInvalidated = false
  if (opts.resume && !opts.scriptChanged) {
    journal = await ports.journalStore.read(opts.runId)
  } else if (opts.scriptChanged) {
    await ports.journalStore.truncate(opts.runId)
    journalInvalidated = true
  }

  const ctx = createEngineContext({
    ports,
    host: opts.host,
    signal: opts.signal,
    runId: opts.runId,
    workflowName,
    cwd: opts.cwd,
    budgetTotal: opts.budgetTotal,
    journal,
  })
  if (journalInvalidated) ctx.journalInvalidated = true

  ports.progressEmitter.emit({
    type: 'run_started',
    runId: opts.runId,
    workflowName,
    meta: parsed.meta,
  })

  // 子 workflow 执行器：复用同一 ctx（共享 journal/并发/预算/计数），临时 +1 depth
  const runSubWorkflow: SubWorkflowRunner = async sub => {
    const script = await resolveSubScript(sub, opts.cwd)
    let subParsed: ParsedScript
    try {
      subParsed = parseScript(script)
    } catch (e) {
      throw new WorkflowError(`子 workflow 脚本错误：${(e as Error).message}`)
    }
    const prevDepth = ctx.resources.depth
    ctx.resources.depth += 1
    try {
      const subHooks = makeHooks(ctx, runSubWorkflow)
      return await subParsed.execute(subHooks, sub.args, ctx.resources.budget)
    } finally {
      ctx.resources.depth = prevDepth
    }
  }

  const hooks = makeHooks(ctx, runSubWorkflow)

  try {
    const returnValue = await parsed.execute(
      hooks,
      opts.args,
      ctx.resources.budget,
    )
    ports.progressEmitter.emit({
      type: 'run_done',
      runId: opts.runId,
      status: 'completed',
      returnValue,
    })
    return { status: 'completed', returnValue }
  } catch (e) {
    if (e instanceof WorkflowAbortedError) {
      ports.progressEmitter.emit({
        type: 'run_done',
        runId: opts.runId,
        status: 'killed',
      })
      return { status: 'killed' }
    }
    const error = (e as Error).message
    ports.progressEmitter.emit({
      type: 'run_done',
      runId: opts.runId,
      status: 'failed',
      error,
    })
    return { status: 'failed', error }
  }
}

async function resolveSubScript(
  sub: { name?: string; scriptPath?: string; script?: string },
  cwd: string,
): Promise<string> {
  if (sub.script) return sub.script
  if (sub.scriptPath) return await readFile(sub.scriptPath, 'utf-8')
  if (sub.name) {
    const found = await resolveNamedWorkflow(
      join(cwd, WORKFLOW_DIR_NAME),
      sub.name,
    )
    if (!found) throw new WorkflowError(`子 workflow "${sub.name}" 未找到`)
    return found.content
  }
  throw new WorkflowError('workflow() 需要 name 或 scriptPath')
}
