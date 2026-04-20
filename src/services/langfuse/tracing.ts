import { startObservation, LangfuseOtelSpanAttributes } from '@langfuse/tracing'
import type { LangfuseSpan, LangfuseGeneration, LangfuseAgent } from '@langfuse/tracing'
import { isLangfuseEnabled } from './client.js'
import { sanitizeToolInput, sanitizeToolOutput } from './sanitize.js'
import { logForDebugging } from 'src/utils/debug.js'
import { getCoreUserData } from 'src/utils/user.js'

export type { LangfuseSpan }

// Root trace is an agent observation — represents one full agentic turn/session
type RootTrace = LangfuseAgent & { _sessionId?: string; _userId?: string }

/** Resolve the user ID for Langfuse traces: explicit param > env var > email > deviceId */
function resolveLangfuseUserId(username?: string): string | undefined {
  return username ?? process.env.LANGFUSE_USER_ID ?? getCoreUserData().email ?? getCoreUserData().deviceId
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
    const traceName = params.name ?? (params.querySource ? `agent-run:${params.querySource}` : 'agent-run')
    const rootSpan = startObservation(traceName, {
      input: params.input,
      metadata: {
        provider: params.provider,
        model: params.model,
        agentType: 'main',
        ...(params.querySource && { querySource: params.querySource }),
      },
    }, { asType: 'agent' }) as RootTrace
    rootSpan.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, params.sessionId)
    rootSpan._sessionId = params.sessionId
    const userId = resolveLangfuseUserId(params.username)
    if (userId) {
      rootSpan.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, userId)
      rootSpan._userId = userId
    }
    logForDebugging(`[langfuse] Trace created: ${rootSpan.id}`)
    return rootSpan as unknown as LangfuseSpan
  } catch (e) {
    logForDebugging(`[langfuse] createTrace failed: ${e}`, { level: 'error' })
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
  },
): void {
  if (!rootSpan || !isLangfuseEnabled()) return
  try {
    const genName = PROVIDER_GENERATION_NAMES[params.provider] ?? `Chat${params.provider}`

    // Use the global startObservation directly instead of rootSpan.startObservation().
    // The instance method only forwards asType to the global function and drops startTime,
    // which causes negative TTFT because the OTel span's start time defaults to "now".
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
        },
        ...(params.completionStartTime && { completionStartTime: params.completionStartTime }),
      },
      {
        asType: 'generation',
        ...(params.startTime && { startTime: params.startTime }),
        parentSpanContext: rootSpan.otelSpan.spanContext(),
      },
    )

    // Propagate session ID and user ID to generation span so Langfuse links it correctly
    const sessionId = (rootSpan as unknown as RootTrace)._sessionId
    if (sessionId) {
      gen.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, sessionId)
    }
    const userId = (rootSpan as unknown as RootTrace)._userId
    if (userId) {
      gen.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, userId)
    }

    // Anthropic splits input into uncached + cache_read + cache_creation.
    // Langfuse's "input" should be the total prompt tokens so cost calc is correct.
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
    logForDebugging(`[langfuse] LLM observation recorded: ${gen.id}`)
  } catch (e) {
    logForDebugging(`[langfuse] recordLLMObservation failed: ${e}`, { level: 'error' })
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
    // Use the global startObservation directly instead of rootSpan.startObservation().
    // The instance method only forwards asType and drops startTime,
    // causing tool execution duration to be 0.
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

    // Propagate session ID and user ID to tool span so Langfuse links it correctly
    const sessionId = (rootSpan as unknown as RootTrace)._sessionId
    if (sessionId) {
      toolObs.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, sessionId)
    }
    const userId = (rootSpan as unknown as RootTrace)._userId
    if (userId) {
      toolObs.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, userId)
    }

    toolObs.update({
      output: sanitizeToolOutput(params.toolName, params.output),
      ...(params.isError && { level: 'ERROR' as const }),
    })

    toolObs.end()
    logForDebugging(`[langfuse] Tool observation recorded: ${params.toolName} (${toolObs.id})`)
  } catch (e) {
    logForDebugging(`[langfuse] recordToolObservation failed: ${e}`, { level: 'error' })
  }
}

/**
 * Create a span that wraps a batch of concurrent tool calls.
 * Returns the batch span (to be passed as parentBatchSpan to recordToolObservation)
 * and must be ended with endToolBatchSpan() after all tools complete.
 */
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
      batchSpan.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, sessionId)
    }
    const userId = (rootSpan as unknown as RootTrace)._userId
    if (userId) {
      batchSpan.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, userId)
    }

    logForDebugging(`[langfuse] Tool batch span created: ${batchSpan.id} (tools=${params.toolNames.join(',')})`)
    return batchSpan
  } catch (e) {
    logForDebugging(`[langfuse] createToolBatchSpan failed: ${e}`, { level: 'error' })
    return null
  }
}

export function endToolBatchSpan(batchSpan: LangfuseSpan | null): void {
  if (!batchSpan) return
  try {
    batchSpan.end()
    logForDebugging(`[langfuse] Tool batch span ended: ${batchSpan.id}`)
  } catch (e) {
    logForDebugging(`[langfuse] endToolBatchSpan failed: ${e}`, { level: 'error' })
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
    const rootSpan = startObservation(`agent:${params.agentType}`, {
      input: params.input,
      metadata: {
        provider: params.provider,
        model: params.model,
        agentType: params.agentType,
        agentId: params.agentId,
      },
    }, { asType: 'agent' }) as RootTrace
    rootSpan.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, params.sessionId)
    rootSpan._sessionId = params.sessionId
    const userId = resolveLangfuseUserId(params.username)
    if (userId) {
      rootSpan.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, userId)
      rootSpan._userId = userId
    }
    logForDebugging(`[langfuse] Sub-agent trace created: ${rootSpan.id} (type=${params.agentType})`)
    return rootSpan as unknown as LangfuseSpan
  } catch (e) {
    logForDebugging(`[langfuse] createSubagentTrace failed: ${e}`, { level: 'error' })
    return null
  }
}

/**
 * Create a child span under a parent trace — used for side queries
 * that should be nested under the main agent trace in Langfuse.
 */
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

    // Propagate session ID and user ID from parent
    const parent = parentSpan as unknown as RootTrace
    const sessionId = parent._sessionId ?? params.sessionId
    if (sessionId) {
      span.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, sessionId)
      ;(span as unknown as RootTrace)._sessionId = sessionId
    }
    const userId = parent._userId ?? resolveLangfuseUserId(params.username)
    if (userId) {
      span.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_USER_ID, userId)
      ;(span as unknown as RootTrace)._userId = userId
    }
    logForDebugging(`[langfuse] Child span created: ${span.id} (parent=${parentSpan.id})`)
    return span
  } catch (e) {
    logForDebugging(`[langfuse] createChildSpan failed: ${e}`, { level: 'error' })
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
    logForDebugging(`[langfuse] Trace ended: ${rootSpan.id}${status ? ` (${status})` : ''}`)
  } catch (e) {
    logForDebugging(`[langfuse] endTrace failed: ${e}`, { level: 'error' })
  }
}
