import { startObservation, LangfuseOtelSpanAttributes } from '@langfuse/tracing'
import type { LangfuseSpan, LangfuseGeneration, LangfuseAgent } from '@langfuse/tracing'
import { isLangfuseEnabled } from './client.js'
import { sanitizeToolInput, sanitizeToolOutput } from './sanitize.js'
import { logForDebugging } from 'src/utils/debug.js'

export type { LangfuseSpan }

// Root trace is an agent observation — represents one full agentic turn/session
type RootTrace = LangfuseAgent & { _sessionId?: string }

export function createTrace(params: {
  sessionId: string
  model: string
  provider: string
  input?: unknown
  name?: string
  querySource?: string
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
    usage: { input_tokens: number; output_tokens: number }
    startTime?: Date
    endTime?: Date
    completionStartTime?: Date
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
        input: params.input,
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

    // Propagate session ID to generation span so Langfuse links it correctly
    const sessionId = (rootSpan as unknown as RootTrace)._sessionId
    if (sessionId) {
      gen.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, sessionId)
    }

    gen.update({
      output: params.output,
      usageDetails: {
        input: params.usage.input_tokens,
        output: params.usage.output_tokens,
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
  },
): void {
  if (!rootSpan || !isLangfuseEnabled()) return
  try {
    // Use the global startObservation directly instead of rootSpan.startObservation().
    // The instance method only forwards asType and drops startTime,
    // causing tool execution duration to be 0.
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
        parentSpanContext: rootSpan.otelSpan.spanContext(),
      },
    )

    // Propagate session ID to tool span so Langfuse links it correctly
    const sessionId = (rootSpan as unknown as RootTrace)._sessionId
    if (sessionId) {
      toolObs.otelSpan.setAttribute(LangfuseOtelSpanAttributes.TRACE_SESSION_ID, sessionId)
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

export function createSubagentTrace(params: {
  sessionId: string
  agentType: string
  agentId: string
  model: string
  provider: string
  input?: unknown
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
    logForDebugging(`[langfuse] Sub-agent trace created: ${rootSpan.id} (type=${params.agentType})`)
    return rootSpan as unknown as LangfuseSpan
  } catch (e) {
    logForDebugging(`[langfuse] createSubagentTrace failed: ${e}`, { level: 'error' })
    return null
  }
}

export function endTrace(rootSpan: LangfuseSpan | null, output?: unknown): void {
  if (!rootSpan) return
  try {
    if (output !== undefined) {
      rootSpan.update({ output })
    }
    rootSpan.end()
    logForDebugging(`[langfuse] Trace ended: ${rootSpan.id}`)
  } catch (e) {
    logForDebugging(`[langfuse] endTrace failed: ${e}`, { level: 'error' })
  }
}
