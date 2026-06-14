// 深度集成后端：从活会话解析 agent/model/tools，委托核心 runAgent。
// 实现 AgentAdapter 接口，由 registry（U5）注册并路由。
import {
  type AgentAdapter,
  type AgentAdapterContext,
  type AgentRunParams,
  type AgentRunResult,
  WorkflowAbortedError,
} from '@claude-code-best/workflow-engine'
import { assembleToolPool } from '../../tools.js'
import { finalizeAgentTool } from '@claude-code-best/builtin-tools/tools/AgentTool/agentToolUtils.js'
import { runAgent } from '@claude-code-best/builtin-tools/tools/AgentTool/runAgent.js'
import {
  isBuiltInAgent,
  type AgentDefinition,
  type BuiltInAgentDefinition,
} from '@claude-code-best/builtin-tools/tools/AgentTool/loadAgentsDir.js'
import { createUserMessage, extractTextContent } from '../../utils/messages.js'
import { getTokenCountFromUsage } from '../../utils/tokens.js'
import { createHash } from 'node:crypto'
import { createAgentId } from '../../utils/uuid.js'
import { logForDebugging } from '../../utils/debug.js'
import { runWithCwdOverride } from '../../utils/cwd.js'
import {
  createAgentWorktree,
  hasWorktreeChanges,
  removeAgentWorktree,
} from '../../utils/worktree.js'
import { logEvent } from '../../services/analytics/index.js'
import type { ModelAlias } from '../../utils/model/aliases.js'
import type { Message } from '../../types/message.js'
import type { ToolUseContext } from '../../Tool.js'
import { readHostBundle } from '../hostHandle.js'

/** workflow 子 agent 的兜底定义（agentType 未命中真实注册表时用）。 */
export const WORKFLOW_AGENT: BuiltInAgentDefinition = {
  agentType: 'workflow-worker',
  whenToUse: 'workflow 脚本内 agent() 钩子派发的子任务',
  tools: ['*'],
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: () =>
    'You are a workflow sub-agent. Complete the task concisely; your final text is the return value relayed to the workflow.',
}

/** agentType → 真实 agent 注册表（activeAgents 命中即用，否则兜底）。已导出便于单测。 */
export function resolveAgentDefinition(
  agentType: string | undefined,
  toolUseContext: ToolUseContext,
): AgentDefinition {
  if (!agentType) return WORKFLOW_AGENT
  const found = toolUseContext.options.agentDefinitions.activeAgents.find(
    a => a.agentType === agentType,
  )
  return found ?? WORKFLOW_AGENT
}

/** model 别名 → 当前 provider 实际 model id。v1 直传（保留映射扩展点）。已导出便于单测。 */
export function mapWorkflowModel(
  model: string | undefined,
): string | undefined {
  return model
}

/** 从 agent 最终消息中提取 StructuredOutput 产出的 JSON 对象；失败返回 null。已导出便于单测。 */
export function extractStructuredOutput(
  content: Array<{ type: string; text?: string }>,
): unknown | null {
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      const trimmed = block.text.trim()
      const start = trimmed.indexOf('{')
      const end = trimmed.lastIndexOf('}')
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(trimmed.slice(start, end + 1))
        } catch {
          // 继续尝试下一个文本块
        }
      }
    }
  }
  return null
}

type WorkflowWorktreeInfo = Awaited<ReturnType<typeof createAgentWorktree>>

/**
 * 为 workflow agent 的 worktree 隔离生成 slug：sha256(runId:agentId) 派生 hex 段，
 * 匹配 cleanupStaleAgentWorktrees 的清理正则 `^wf_[0-9a-f]{8}-[0-9a-f]{3}-\d+$`。
 * taskId 是 `w`+base36（非 UUID），不能直接塞 runId 进正则段；sha256 是确定性映射，
 * agentId 保证同 runId 多 agent 的 slug 唯一（无共享计数器，无线程安全问题）。
 */
function makeWorkflowWorktreeSlug(runId: string, agentId: string): string {
  const h = createHash('sha256').update(`${runId}:${agentId}`).digest('hex')
  return `wf_${h.slice(0, 8)}-${h.slice(8, 11)}-${parseInt(h.slice(11, 17), 16) % 100000}`
}

/**
 * agent 完成后清理 worktree：hookBased 保留（无法检测 VCS 变更）；否则用
 * hasWorktreeChanges（fail-closed）检测，无变更 auto-remove，有变更/检测失败保留
 * 并 log 路径（v1 用日志而非扩 AgentRunResult，避免动 journal 序列化）。
 */
async function cleanupWorkflowWorktree(
  info: WorkflowWorktreeInfo,
  agentType: string,
): Promise<void> {
  if (info.hookBased || !info.headCommit) return
  let changed = true
  try {
    changed = await hasWorktreeChanges(info.worktreePath, info.headCommit)
  } catch (e) {
    logForDebugging(
      `workflow worktree change-detect failed (${agentType}): ${(e as Error).message}`,
    )
    changed = true
  }
  if (!changed) {
    try {
      await removeAgentWorktree(
        info.worktreePath,
        info.worktreeBranch,
        info.gitRoot,
      )
    } catch (e) {
      logForDebugging(
        `workflow worktree remove failed (${agentType}): ${(e as Error).message}`,
      )
    }
  } else {
    logForDebugging(
      `workflow worktree retained (has changes, ${agentType}): ${info.worktreePath}`,
    )
  }
}

/** 深度集成后端：从活会话解析 agent/model/tools，委托核心 runAgent。 */
export const claudeCodeBackend: AgentAdapter = {
  id: 'claude-code',
  capabilities: { structuredOutput: true, tools: true },

  async run(
    params: AgentRunParams,
    ctx: AgentAdapterContext,
  ): Promise<AgentRunResult> {
    const { toolUseContext, canUseTool } = readHostBundle(ctx.host)
    const appState = toolUseContext.getAppState()
    const agentDef = resolveAgentDefinition(params.agentType, toolUseContext)
    const model = mapWorkflowModel(params.model)
    // coreAgentId：core 层子 agent 跟踪 ID（字符串，runAgent 内部用）。
    // 与 ctx.agentId（引擎 number seq，用于面板/killAgent 路由）是两个不同概念，不可混用。
    const coreAgentId = createAgentId()

    // isolation:'worktree' — 在独立 git worktree 里跑 agent，并发写互不冲突。
    let worktreeInfo: WorkflowWorktreeInfo | null = null
    if (params.isolation === 'worktree') {
      try {
        worktreeInfo = await createAgentWorktree(
          makeWorkflowWorktreeSlug(ctx.runId, coreAgentId),
        )
      } catch (e) {
        // fail-closed：隔离未达成不静默退化为共享 cwd（否则并发写数据竞争）
        const detail = (e as Error).message
        logForDebugging(
          `workflow worktree creation failed (${agentDef.agentType}): ${detail}`,
        )
        return { kind: 'dead', reason: 'worktree-failed', detail }
      }
    }
    // runWithCwdOverride 让 agent 内的 Bash/Read 等工具看到 worktree 路径
    // （AsyncLocalStorage 跨 await 保持）；runAgent 的 worktreePath 参数仅写 metadata。
    const runInCwd = worktreeInfo
      ? <T>(fn: () => T): T =>
          runWithCwdOverride(worktreeInfo!.worktreePath, fn)
      : <T>(fn: () => T): T => fn()

    // 桥接 ctx.signal → runAgent.override.abortController。否则 workflow 被 kill
    // 时 runAgent 不知道（'x' 无效根因）：abort 信号到不了内部 fetch，agent 跑到完成。
    // 单 agent kill 走 service.kill(runId, agentId) → ports.taskRegistrar.killAgent →
    // agentAbortControllers.get(agentId).abort()；同一 controller 接管两条路径。
    const agentAbort = new AbortController()
    const onParentAbort = (): void => agentAbort.abort()
    if (ctx.signal.aborted) {
      agentAbort.abort()
    } else {
      ctx.signal.addEventListener('abort', onParentAbort, { once: true })
    }
    if (typeof ctx.registerAgentAbort === 'function') {
      ctx.registerAgentAbort(ctx.agentId, agentAbort)
    }

    const workerPermissionContext = {
      ...appState.toolPermissionContext,
      mode: agentDef.permissionMode ?? 'acceptEdits',
    }
    const workerTools = assembleToolPool(
      workerPermissionContext,
      appState.mcp.tools,
    )

    // schema → prompt 首尾各放一份 StructuredOutput 强制要求（sonnet 长 tool chain 后
    // 易忘记收尾，是 8/12 dead 的主因）。原版只在尾部追加，sonnet 跑到第 N 个工具时
    // 早就把"必须调 StructuredOutput"挤出注意力了。新版：头部放任务上下文 + 收尾契约，
    // 尾部再强制提醒一次，让 agent 任何时刻调头都能看到收尾要求。
    const promptText = params.schema
      ? [
          '[STRUCTURED OUTPUT MODE — read before starting]',
          'Your ENTIRE final response MUST be a single call to the `StructuredOutput` tool with a value matching this JSON Schema:',
          JSON.stringify(params.schema),
          '',
          'Rules:',
          '- Call `StructuredOutput` exactly once as your LAST action.',
          '- NEVER end your turn with plain text. If you have not called the tool, your entire response is discarded and the workflow sees no result.',
          '- If you need to investigate first (read files, run tests), do so via other tools, then finish with `StructuredOutput`.',
          '',
          '--- task ---',
          params.prompt,
          '',
          '--- end task ---',
          '',
          '[FINAL REMINDER] Before stopping: verify you have called `StructuredOutput`. If not, call it now with your conclusion. Plain-text endings are treated as failure.',
        ].join('\n')
      : params.prompt

    const promptMessages = [createUserMessage({ content: promptText })]
    const messages: Message[] = []
    const startTime = Date.now()
    // 运行中进度累计（onProgress 推送 → agent_progress 事件 → 面板实时刷新 token/tool）。
    let tokenCount = 0
    let toolCount = 0

    try {
      await runInCwd(async () => {
        for await (const msg of runAgent({
          agentDefinition: agentDef,
          promptMessages,
          toolUseContext,
          canUseTool,
          isAsync: true,
          querySource: toolUseContext.options.querySource ?? 'workflow',
          availableTools: workerTools,
          // override 同一对象：coreAgentId（core 子 agent 跟踪）+ abortController（kill 桥接）。
          // runAgent 的 model 是顶层 ModelAlias；workflow 的 model 是任意别名串，
          // 类型上不兼容，运行时由 provider 层解析。双重断言透传（优于 as any/never）。
          override: { agentId: coreAgentId, abortController: agentAbort },
          ...(model ? { model: model as unknown as ModelAlias } : {}),
          ...(worktreeInfo ? { worktreePath: worktreeInfo.worktreePath } : {}),
        })) {
          messages.push(msg as Message)
          // 累计运行中进度：assistant message 带 usage（累积值→覆盖）、content 内 tool_use（增量）。
          if (msg.type === 'assistant' && msg.message) {
            const usage = msg.message.usage as
              | Parameters<typeof getTokenCountFromUsage>[0]
              | undefined
            if (usage) tokenCount = getTokenCountFromUsage(usage)
            const content = msg.message.content as
              | Array<{ type: string }>
              | undefined
            if (content)
              toolCount += content.filter(b => b.type === 'tool_use').length
          }
          ctx.onProgress?.({ tokenCount, toolCount })
        }
      })
    } catch (e) {
      // abort（kill workflow / kill agent）：识别后必须重抛 WorkflowAbortedError，
      // 否则 hooks.agent 会把 abort 当作普通失败吞成 dead，workflow 不知道被 kill
      // （kill 路径 'x' 无效的另一面：信号虽然到了，但结果被伪装成正常完成）。
      if (agentAbort.signal.aborted || (e as Error)?.name === 'AbortError') {
        throw new WorkflowAbortedError()
      }
      const detail = (e as Error).message
      logForDebugging(
        `workflow sub-agent error (${agentDef.agentType}): ${detail}`,
      )
      logEvent('tengu_workflow_agent', { ok: 0 })
      return { kind: 'dead', reason: 'runagent-threw', detail }
    } finally {
      // 清理（幂等）：listener removeEventListener / Map.delete 重复调用安全。
      if (typeof ctx.unregisterAgentAbort === 'function') {
        ctx.unregisterAgentAbort(ctx.agentId)
      }
      ctx.signal.removeEventListener('abort', onParentAbort)
      if (worktreeInfo) {
        const info = worktreeInfo
        worktreeInfo = null
        await cleanupWorkflowWorktree(info, agentDef.agentType)
      }
    }

    const finalized = finalizeAgentTool(messages, coreAgentId, {
      prompt: params.prompt,
      resolvedAgentModel: toolUseContext.options.mainLoopModel,
      isBuiltInAgent: isBuiltInAgent(agentDef),
      startTime,
      agentType: agentDef.agentType,
      isAsync: true,
    })
    const outputTokens =
      finalized.usage?.output_tokens ?? finalized.totalTokens ?? 0
    // 面板展示用：完成时 context 总 token、工具调用次数、解析后 model id。
    const finalTokenCount = finalized.totalTokens ?? 0
    const finalToolCount = finalized.totalToolUseCount ?? 0
    const resolvedModel = model ?? toolUseContext.options.mainLoopModel
    logEvent('tengu_workflow_agent', { ok: 1, outputTokens })

    if (params.schema) {
      const structured = extractStructuredOutput(finalized.content)
      if (structured === null) {
        // agent 跑完所有工具调用但既没调 StructuredOutput 工具、也没在文本里产 JSON。
        // 把最后文本预览进 detail，让 hooks 重试日志和面板能立刻看到 agent 实际说了什么。
        // 8/12 dead 在最近一次 audit workflow 都落这里——sonnet 长 tool chain 后忘了收尾。
        const preview = extractTextContent(finalized.content, '\n').slice(
          0,
          200,
        )
        logForDebugging(
          `workflow sub-agent produced no StructuredOutput (${agentDef.agentType}); preview: ${preview}`,
        )
        return {
          kind: 'dead',
          reason: 'no-structured-output',
          detail: preview,
        }
      }
      return {
        kind: 'ok',
        output: structured as object,
        usage: { outputTokens },
        model: resolvedModel,
        toolCount: finalToolCount,
        tokenCount: finalTokenCount,
      }
    }
    const text = extractTextContent(finalized.content, '\n')
    return {
      kind: 'ok',
      output: text,
      usage: { outputTokens },
      model: resolvedModel,
      toolCount: finalToolCount,
      tokenCount: finalTokenCount,
    }
  },
}
