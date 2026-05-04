import { startObservation, LangfuseOtelSpanAttributes } from '@langfuse/tracing'
import type {
  LangfuseSpan,
  LangfuseGeneration,
  LangfuseAgent,
} from '@langfuse/tracing'
import { isLangfuseEnabled } from './client.js'
import { sanitizeToolInput, sanitizeToolOutput } from './sanitize.js'
import { logForDebugging } from 'src/utils/debug.js'
import { getCoreUserData } from 'src/utils/user.js'

export type { LangfuseSpan }

// 根追踪是一种代理观测——代表一个完整的代理轮次/会话
type RootTrace = LangfuseAgent & { _sessionId?: string; _userId?: string }

/** 解析 Langfuse 追踪的用户 ID：显式参数 > 环境变量 > 邮箱 > deviceId */
function resolveLangfuseUserId(username?: string): string | undefined {
  return (
    username ??
    process.env.LANGFUSE_USER_ID ??
    getCoreUserData().email ??
    getCoreUserData().deviceId
  )
}

export function createTrace(params: {
  sessionId: string
  model: string
  provider: string
  input?: unknown
  name?: string
  querySource?: string
  username?: string
}): LangfuseSpan | null {
  if (!isLangfuseEnabled()) return null
  try {
    const traceName =
      params.name ??
      (params.querySource ? `agent-run:${params.querySource}` : 'agent-run')
    const rootSpan = startObservation(
      traceName,
      {
        input: params.input,
        metadata: {
          provider: params.provider,
          model: params.model,
          agentType: 'main',
          ...(params.querySource && { querySource: params.querySource }),
        },
      },
      { asType: 'agent' },
    ) as RootTrace
    rootSpan.otelSpan.setAttribute(
      LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
      params.sessionId,
    )
    rootSpan._sessionId = params.sessionId
    const userId = resolveLangfuseUserId(params.username)
    if (userId) {
      rootSpan.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        userId,
      )
      rootSpan._userId = userId
    }
    logForDebugging(`[langfuse] 追踪已创建：${rootSpan.id}`)
    return rootSpan as unknown as LangfuseSpan
  } catch (e) {
    logForDebugging(`[langfuse] createTrace 失败：${e}`, { level: 'error' })
    return null
  }
}

const PROVIDER_GENERATION_NAMES: Record<string, string> = {
  firstParty: 'ChatAnthropic',
  bedrock: 'ChatBedrockAnthropic',
  vertex: 'ChatVertexAnthropic',
  foundry: 'ChatFoundry',
  openai: 'ChatOpenAI',
  gemini: 'ChatGoogleGenerativeAI',
  grok: 'ChatXAI',
}

export function recordLLMObservation(
  rootSpan: LangfuseSpan | null,
  params: {
    model: string
    provider: string
    input: unknown
    output: unknown
    usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
    startTime?: Date
    endTime?: Date
    completionStartTime?: Date
    tools?: unknown
    /** Thinking depth configuration used for this request.
     * Accepts the full API thinking config object. Fields:
     * - type: thinking mode ("enabled", "adaptive", "disabled")
     * - budget_tokens (snake_case, from Anthropic API) or budgetTokens (camelCase)
     */
    thinking?: {
      type: string
      budget_tokens?: number
      budgetTokens?: number
    }
  },
): void {
  if (!rootSpan || !isLangfuseEnabled()) return
  try {
    const genName =
      PROVIDER_GENERATION_NAMES[params.provider] ?? `Chat${params.provider}`

    // 直接使用全局 startObservation 而非 rootSpan.startObser
    // vation()。实例方法仅将 asType 转发给全局函数，并丢弃了 startTime，这会
    // 导致 TTFT 为负值，因为 OTel span 的 startTime 默认为“现在”。
    const gen: LangfuseGeneration = startObservation(
      genName,
      {
        model: params.model,
        input: params.tools
          ? { messages: params.input, tools: params.tools }
          : params.input,
        metadata: {
          provider: params.provider,
          model: params.model,
          ...(params.thinking && { thinking: params.thinking }),
        },
        ...(params.completionStartTime && {
          completionStartTime: params.completionStartTime,
        }),
      },
      {
        asType: 'generation',
        ...(params.startTime && { startTime: params.startTime }),
        parentSpanContext: rootSpan.otelSpan.spanContext(),
      },
    )

    // 将会话 ID 和用户 ID 传播到生成 span，以便 Langfuse 正确关联
    const sessionId = (rootSpan as unknown as RootTrace)._sessionId
    if (sessionId) {
      gen.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
        sessionId,
      )
    }
    const userId = (rootSpan as unknown as RootTrace)._userId
    if (userId) {
      gen.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        userId,
      )
    }

    // Anthropic 将输入拆分为 uncached + cache_read + cache
    // _creation。Langfuse 的“input”应为总提示词 token 数，以确保成本计算正确。
    const cacheRead = params.usage.cache_read_input_tokens ?? 0
    const cacheCreation = params.usage.cache_creation_input_tokens ?? 0
    gen.update({
      output: params.output,
      usageDetails: {
        input: params.usage.input_tokens + cacheCreation + cacheRead,
        output: params.usage.output_tokens,
        ...(cacheRead > 0 && { cache_read: cacheRead }),
        ...(cacheCreation > 0 && { cache_creation: cacheCreation }),
      },
    })

    gen.end(params.endTime)
    logForDebugging(`[langfuse] LLM 观测已记录：${gen.id}`)
  } catch (e) {
    logForDebugging(`[langfuse] recordLLMObservation failed: ${e}`, {
      level: 'error',
    })
  }
}

export function recordToolObservation(
  rootSpan: LangfuseSpan | null,
  params: {
    toolName: string
    toolUseId: string
    input: unknown
    output: string
    startTime?: Date
    isError?: boolean
    parentBatchSpan?: LangfuseSpan | null
  },
): void {
  if (!rootSpan || !isLangfuseEnabled()) return
  try {
    // 直接使用全局 startObservation 而非 rootSpan.startOb
    // servation()。实例方法仅转发 asType 并丢弃 st
    // artTime，导致工具执行持续时间为 0。
    const parentSpan = params.parentBatchSpan ?? rootSpan
    const toolObs = startObservation(
      params.toolName,
      {
        input: sanitizeToolInput(params.toolName, params.input),
        metadata: {
          toolUseId: params.toolUseId,
          isError: String(params.isError ?? false),
        },
      },
      {
        asType: 'tool',
        ...(params.startTime && { startTime: params.startTime }),
        parentSpanContext: parentSpan.otelSpan.spanContext(),
      },
    )

    // 将会话 ID 和用户 ID 传播到工具 span，以便 Langfuse 正确关联
    const sessionId = (rootSpan as unknown as RootTrace)._sessionId
    if (sessionId) {
      toolObs.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
        sessionId,
      )
    }
    const userId = (rootSpan as unknown as RootTrace)._userId
    if (userId) {
      toolObs.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        userId,
      )
    }

    toolObs.update({
      output: sanitizeToolOutput(params.toolName, params.output),
      ...(params.isError && { level: 'ERROR' as const }),
    })

    toolObs.end()
    logForDebugging(
      `[langfuse] Tool observation recorded: ${params.toolName} (${toolObs.id})`,
    )
  } catch (e) {
    logForDebugging(`[langfuse] recordToolObservation failed: ${e}`, {
      level: 'error',
    })
  }
}

/** 创建一个包装一批并发工具调用的 span。
返回批次 span（需作为 parentBatchSpan 传递给 recordToolObservation），
并且必须在所有工具完成后调用 endToolBatchSpan() 结束。 */
export function createToolBatchSpan(
  rootSpan: LangfuseSpan | null,
  params: { toolNames: string[]; batchIndex: number },
): LangfuseSpan | null {
  if (!rootSpan || !isLangfuseEnabled()) return null
  try {
    const batchSpan = startObservation(
      `tools`,
      {
        metadata: {
          toolNames: params.toolNames.join(', '),
          toolCount: String(params.toolNames.length),
          batchIndex: String(params.batchIndex),
        },
      },
      {
        asType: 'span',
        parentSpanContext: rootSpan.otelSpan.spanContext(),
      },
    ) as LangfuseSpan

    const sessionId = (rootSpan as unknown as RootTrace)._sessionId
    if (sessionId) {
      batchSpan.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
        sessionId,
      )
    }
    const userId = (rootSpan as unknown as RootTrace)._userId
    if (userId) {
      batchSpan.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        userId,
      )
    }

    logForDebugging(
      `[langfuse] Tool batch span created: ${batchSpan.id} (tools=${params.toolNames.join(',')})`,
    )
    return batchSpan
  } catch (e) {
    logForDebugging(`[langfuse] createToolBatchSpan failed: ${e}`, {
      level: 'error',
    })
    return null
  }
}

export function endToolBatchSpan(batchSpan: LangfuseSpan | null): void {
  if (!batchSpan) return
  try {
    batchSpan.end()
    logForDebugging(`[langfuse] 工具批次 span 已结束：${batchSpan.id}`)
  } catch (e) {
    logForDebugging(`[langfuse] endToolBatchSpan failed: ${e}`, {
      level: 'error',
    })
  }
}

export function createSubagentTrace(params: {
  sessionId: string
  agentType: string
  agentId: string
  model: string
  provider: string
  input?: unknown
  username?: string
}): LangfuseSpan | null {
  if (!isLangfuseEnabled()) return null
  try {
    const rootSpan = startObservation(
      `agent:${params.agentType}`,
      {
        input: params.input,
        metadata: {
          provider: params.provider,
          model: params.model,
          agentType: params.agentType,
          agentId: params.agentId,
        },
      },
      { asType: 'agent' },
    ) as RootTrace
    rootSpan.otelSpan.setAttribute(
      LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
      params.sessionId,
    )
    rootSpan._sessionId = params.sessionId
    const userId = resolveLangfuseUserId(params.username)
    if (userId) {
      rootSpan.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        userId,
      )
      rootSpan._userId = userId
    }
    logForDebugging(
      `[langfuse] Sub-agent trace created: ${rootSpan.id} (type=${params.agentType})`,
    )
    return rootSpan as unknown as LangfuseSpan
  } catch (e) {
    logForDebugging(`[langfuse] createSubagentTrace failed: ${e}`, {
      level: 'error',
    })
    return null
  }
}

/** 在父追踪下创建一个子 span——用于应在 Langfuse 中嵌套在主代理追踪下的侧查询。 */
export function createChildSpan(
  parentSpan: LangfuseSpan | null,
  params: {
    name: string
    sessionId: string
    model: string
    provider: string
    input?: unknown
    querySource?: string
    username?: string
  },
): LangfuseSpan | null {
  if (!parentSpan || !isLangfuseEnabled()) return null
  try {
    const span = startObservation(
      params.name,
      {
        input: params.input,
        metadata: {
          provider: params.provider,
          model: params.model,
          querySource: params.querySource,
        },
      },
      {
        asType: 'span',
        parentSpanContext: parentSpan.otelSpan.spanContext(),
      },
    ) as LangfuseSpan

    // 从父级传播会话 ID 和用户 ID
    const parent = parentSpan as unknown as RootTrace
    const sessionId = parent._sessionId ?? params.sessionId
    if (sessionId) {
      span.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
        sessionId,
      )
      ;(span as unknown as RootTrace)._sessionId = sessionId
    }
    const userId = parent._userId ?? resolveLangfuseUserId(params.username)
    if (userId) {
      span.otelSpan.setAttribute(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        userId,
      )
      ;(span as unknown as RootTrace)._userId = userId
    }
    logForDebugging(
      `[langfuse] Child span created: ${span.id} (parent=${parentSpan.id})`,
    )
    return span
  } catch (e) {
    logForDebugging(`[langfuse] createChildSpan failed: ${e}`, {
      level: 'error',
    })
    return null
  }
}

export function endTrace(
  rootSpan: LangfuseSpan | null,
  output?: unknown,
  status?: 'interrupted' | 'error',
): void {
  if (!rootSpan) return
  try {
    const updatePayload: Record<string, unknown> = {}
    if (output !== undefined) updatePayload.output = output
    if (status === 'interrupted') updatePayload.level = 'WARNING'
    else if (status === 'error') updatePayload.level = 'ERROR'
    if (Object.keys(updatePayload).length > 0) rootSpan.update(updatePayload)
    rootSpan.end()
    logForDebugging(
      `[langfuse] Trace ended: ${rootSpan.id}${status ? ` (${status})` : ''}`,
    )
  } catch (e) {
    logForDebugging(`[langfuse] endTrace 失败：${e}`, { level: 'error' })
  }
}
