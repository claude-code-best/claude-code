// 深度集成后端：从活会话解析 agent/model/tools，委托核心 runAgent。
// 实现 AgentAdapter 接口，由 registry（U5）注册并路由。
import {
  type AgentAdapter,
  type AgentAdapterContext,
  type AgentRunParams,
  type AgentRunResult,
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
import { createAgentId } from '../../utils/uuid.js'
import { logForDebugging } from '../../utils/debug.js'
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
    const agentId = createAgentId()

    const workerPermissionContext = {
      ...appState.toolPermissionContext,
      mode: agentDef.permissionMode ?? 'acceptEdits',
    }
    const workerTools = assembleToolPool(
      workerPermissionContext,
      appState.mcp.tools,
    )

    // schema → 通过 prompt 追加 JSON Schema 指令（非交互模式 StructuredOutput 已启用）
    const promptText = params.schema
      ? `${params.prompt}\n\nYou MUST return your final answer by calling the StructuredOutput tool with a value matching this JSON Schema:\n${JSON.stringify(params.schema)}`
      : params.prompt

    const promptMessages = [createUserMessage({ content: promptText })]
    const messages: Message[] = []
    const startTime = Date.now()

    try {
      for await (const msg of runAgent({
        agentDefinition: agentDef,
        promptMessages,
        toolUseContext,
        canUseTool,
        isAsync: true,
        querySource: toolUseContext.options.querySource ?? 'workflow',
        availableTools: workerTools,
        override: { agentId },
        // runAgent 的 model 是顶层 ModelAlias；workflow 的 model 是任意别名串，
        // 类型上不兼容，运行时由 provider 层解析。双重断言透传（优于 as any/never）。
        ...(model ? { model: model as unknown as ModelAlias } : {}),
      })) {
        messages.push(msg as Message)
      }
    } catch (e) {
      logForDebugging(
        `workflow sub-agent error (${agentDef.agentType}): ${(e as Error).message}`,
      )
      logEvent('tengu_workflow_agent', { ok: 0 })
      return { kind: 'dead' }
    }

    const finalized = finalizeAgentTool(messages, agentId, {
      prompt: params.prompt,
      resolvedAgentModel: toolUseContext.options.mainLoopModel,
      isBuiltInAgent: isBuiltInAgent(agentDef),
      startTime,
      agentType: agentDef.agentType,
      isAsync: true,
    })
    const outputTokens =
      finalized.usage?.output_tokens ?? finalized.totalTokens ?? 0
    logEvent('tengu_workflow_agent', { ok: 1, outputTokens })

    if (params.schema) {
      const structured = extractStructuredOutput(finalized.content)
      if (structured === null) return { kind: 'dead' }
      return {
        kind: 'ok',
        output: structured as object,
        usage: { outputTokens },
      }
    }
    const text = extractTextContent(finalized.content, '\n')
    return { kind: 'ok', output: text, usage: { outputTokens } }
  },
}
