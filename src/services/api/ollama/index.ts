import type {
  BetaRawMessageStreamEvent,
  BetaToolUnion,
  BetaUsage,
} from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
  UserMessage,
} from '../../../types/message.js'
import type { AgentId } from '../../../types/ids.js'
import { toolMatchesName, type Tools } from '../../../Tool.js'
import { toolToAPISchema } from '../../../utils/api.js'
import { logForDebugging } from '../../../utils/debug.js'
import {
  createAssistantAPIErrorMessage,
  createUserMessage,
  normalizeContentFromAPI,
  normalizeMessagesForAPI,
  stripToolReferenceBlocksFromUserMessage,
} from '../../../utils/messages.js'
import type { SDKAssistantMessageError } from '../../../entrypoints/agentSdkTypes.js'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import { addToTotalSessionCost } from '../../../cost-tracker.js'
import { calculateUSDCost } from '../../../utils/modelCost.js'
import { getModelMaxOutputTokens } from '../../../utils/context.js'
import {
  resolveAppliedEffort,
  type EffortValue,
} from '../../../utils/effort.js'
import { isEnvTruthy } from '../../../utils/envUtils.js'
import type { ThinkingConfig } from '../../../utils/thinking.js'
import { recordLLMObservation } from '../../../services/langfuse/tracing.js'
import {
  convertMessagesToLangfuse,
  convertOutputToLangfuse,
  convertToolsToLangfuse,
} from '../../../services/langfuse/convert.js'
import type { Options } from '../claude.js'
import {
  extractDiscoveredToolNames,
  isDeferredToolsDeltaEnabled,
  isToolSearchEnabled,
} from '../../../utils/toolSearch.js'
import {
  formatDeferredToolLine,
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME,
} from '@claude-code-best/builtin-tools/tools/ToolSearchTool/prompt.js'
import {
  adaptOllamaStreamToAnthropic,
  anthropicMessagesToOllama,
  anthropicToolsToOllama,
  resolveOllamaModel,
  type OllamaChatChunk,
  type OllamaChatRequest,
} from '@ant/model-provider'
import { getOllamaClient, getOllamaContextLength } from './client.js'

function isOllamaConvertibleMessage(
  msg: Message,
): msg is AssistantMessage | UserMessage {
  return msg.type === 'assistant' || msg.type === 'user'
}

function prependDeferredToolListIfNeeded(
  messages: (AssistantMessage | UserMessage)[],
  tools: Tools,
  deferredToolNames: Set<string>,
  useToolSearch: boolean,
): (AssistantMessage | UserMessage)[] {
  if (!useToolSearch || isDeferredToolsDeltaEnabled()) return messages

  const deferredToolList = tools
    .filter(tool => deferredToolNames.has(tool.name))
    .map(formatDeferredToolLine)
    .sort()
    .join('\n')

  if (!deferredToolList) return messages

  return [
    createUserMessage({
      content: `<available-deferred-tools>\n${deferredToolList}\n</available-deferred-tools>`,
      isMeta: true,
    }),
    ...messages,
  ]
}

type StreamMessageStartEvent = BetaRawMessageStreamEvent & {
  message?: { usage?: Partial<BetaUsage> }
}

type StreamContentBlockEvent = BetaRawMessageStreamEvent & {
  index?: number
  content_block?: Record<string, unknown>
}

type StreamContentDeltaEvent = BetaRawMessageStreamEvent & {
  index?: number
  delta?: {
    type?: string
    text?: string
    partial_json?: string
    thinking?: string
    signature?: string
  }
}

type StreamMessageDeltaEvent = BetaRawMessageStreamEvent & {
  delta?: { stop_reason?: string | null }
  usage?: Partial<BetaUsage>
}

type OllamaThinkLevel = NonNullable<OllamaChatRequest['think']>

function isGptOssModel(model: string): boolean {
  return model.toLowerCase().startsWith('gpt-oss')
}

export function resolveOllamaThink(
  thinkingConfig: ThinkingConfig,
  effortValue: EffortValue | undefined,
  model: string,
  disableThinking: boolean = false,
): OllamaThinkLevel | undefined {
  if (disableThinking || thinkingConfig.type === 'disabled') {
    return isGptOssModel(model) ? 'low' : false
  }

  const resolvedLevel = toOllamaThinkLevel(effortValue)
  if (resolvedLevel) {
    return resolvedLevel
  }

  if (isGptOssModel(model)) {
    return 'medium'
  }

  return true
}

function toOllamaThinkLevel(
  effortValue: EffortValue | undefined,
): 'low' | 'medium' | 'high' | undefined {
  if (effortValue === 'low') return 'low'
  if (effortValue === 'medium') return 'medium'
  if (effortValue === 'high') return 'high'
  if (effortValue === 'xhigh' || effortValue === 'max') return 'high'
  if (typeof effortValue === 'number') return 'high'
  return undefined
}

export async function* queryModelOllama(
  messages: Message[],
  systemPrompt: SystemPrompt,
  tools: Tools,
  signal: AbortSignal,
  options: Options,
  thinkingConfig: ThinkingConfig,
): AsyncGenerator<
  StreamEvent | AssistantMessage | SystemAPIErrorMessage,
  void
> {
  try {
    const ollamaModel = resolveOllamaModel(options.model)
    let useToolSearch = await isToolSearchEnabled(
      options.model,
      tools,
      options.getToolPermissionContext,
      options.agents,
      options.querySource,
    )

    const deferredToolNames = new Set<string>()
    if (useToolSearch) {
      for (const tool of tools) {
        if (isDeferredTool(tool)) deferredToolNames.add(tool.name)
      }
    }

    if (
      useToolSearch &&
      deferredToolNames.size === 0 &&
      !options.hasPendingMcpServers
    ) {
      logForDebugging(
        '[Ollama] Tool search disabled: no deferred tools available to search',
      )
      useToolSearch = false
    }

    let filteredTools = tools
    if (useToolSearch && deferredToolNames.size > 0) {
      const discoveredToolNames = extractDiscoveredToolNames(messages)
      filteredTools = tools.filter(tool => {
        if (!deferredToolNames.has(tool.name)) return true
        if (toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME)) return true
        return discoveredToolNames.has(tool.name)
      })
    } else if (!useToolSearch) {
      filteredTools = tools.filter(
        tool => !toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME),
      )
    }

    let messagesForAPI = normalizeMessagesForAPI(messages, filteredTools)
    messagesForAPI = messagesForAPI.map(msg => {
      if (msg.type === 'user') {
        return stripToolReferenceBlocksFromUserMessage(msg)
      }
      return msg
    })

    const toolSchemas = await Promise.all(
      filteredTools.map(tool =>
        toolToAPISchema(tool, {
          getToolPermissionContext: options.getToolPermissionContext,
          tools: filteredTools,
          agents: options.agents,
          allowedAgentTypes: options.allowedAgentTypes,
          model: options.model,
        }),
      ),
    )

    const standardTools = toolSchemas.filter(
      (tool): tool is BetaToolUnion & { type: string } => {
        const anyTool = tool as unknown as Record<string, unknown>
        return (
          anyTool.type !== 'advisor_20260301' &&
          anyTool.type !== 'computer_20250124'
        )
      },
    )

    const ollamaMessages = anthropicMessagesToOllama(
      prependDeferredToolListIfNeeded(
        messagesForAPI.filter(isOllamaConvertibleMessage),
        tools,
        deferredToolNames,
        useToolSearch,
      ),
      systemPrompt,
    )
    const ollamaTools = anthropicToolsToOllama(standardTools)
    const contextLength = await getOllamaContextLength({
      model: ollamaModel,
      signal,
      fetchOverride: options.fetchOverride as typeof fetch | undefined,
    }).catch(error => {
      logForDebugging(
        `[Ollama] Failed to fetch model context length for ${ollamaModel}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return undefined
    })
    const { upperLimit } = getModelMaxOutputTokens(ollamaModel)
    const maxTokens = resolveOllamaMaxTokens(
      contextLength !== undefined
        ? Math.min(upperLimit, contextLength)
        : upperLimit,
      options.maxOutputTokensOverride,
    )
    const ollamaThink = resolveOllamaThink(
      thinkingConfig,
      resolveAppliedEffort(ollamaModel, options.effortValue),
      ollamaModel,
      isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_THINKING),
    )

    const requestBody: OllamaChatRequest = {
      model: ollamaModel,
      messages: ollamaMessages,
      stream: true,
      ...(ollamaTools.length > 0 && { tools: ollamaTools }),
      ...(ollamaThink !== undefined && { think: ollamaThink }),
      options: {
        num_predict: maxTokens,
        ...(options.temperatureOverride !== undefined && {
          temperature: options.temperatureOverride,
        }),
      },
    }

    const client = getOllamaClient({
      maxRetries: 0,
      fetchOverride: options.fetchOverride as typeof fetch | undefined,
      source: options.querySource,
    })

    logForDebugging(
      `[Ollama] Calling ${client.baseURL.replace(/\/$/, '')}/chat model=${ollamaModel}, messages=${ollamaMessages.length}, tools=${ollamaTools.length}, think=${String(ollamaThink)}`,
    )

    const response = await client.chat(requestBody, { signal })
    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `HTTP ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`,
      )
    }

    const adaptedStream = adaptOllamaStreamToAnthropic(
      parseOllamaStream(response.body),
      ollamaModel,
    )

    const contentBlocks: Record<number, any> = {}
    const collectedMessages: AssistantMessage[] = []
    let partialMessage: any
    let stopReason: string | null = null
    let usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }
    let ttftMs = 0
    const start = Date.now()

    for await (const event of adaptedStream) {
      switch (event.type) {
        case 'message_start':
          partialMessage = (event as StreamMessageStartEvent).message
          ttftMs = Date.now() - start
          if ((event as StreamMessageStartEvent).message?.usage) {
            usage = mergeUsage(
              usage,
              (event as StreamMessageStartEvent).message?.usage,
            )
          }
          break
        case 'content_block_start': {
          const idx = (event as StreamContentBlockEvent).index
          const block = (event as StreamContentBlockEvent).content_block
          if (idx === undefined || !block) break
          if (block.type === 'tool_use') {
            contentBlocks[idx] = { ...block, input: '' }
          } else if (block.type === 'text') {
            contentBlocks[idx] = { ...block, text: '' }
          } else if (block.type === 'thinking') {
            contentBlocks[idx] = { ...block, thinking: '', signature: '' }
          } else {
            contentBlocks[idx] = { ...block }
          }
          break
        }
        case 'content_block_delta': {
          const idx = (event as StreamContentDeltaEvent).index
          const delta = (event as StreamContentDeltaEvent).delta
          if (idx === undefined || !delta) break
          const block = contentBlocks[idx]
          if (!block) break

          if (delta.type === 'text_delta' && delta.text !== undefined) {
            block.text = (block.text || '') + delta.text
          } else if (
            delta.type === 'input_json_delta' &&
            delta.partial_json !== undefined
          ) {
            block.input = (block.input || '') + delta.partial_json
          } else if (
            delta.type === 'thinking_delta' &&
            delta.thinking !== undefined
          ) {
            block.thinking = (block.thinking || '') + delta.thinking
          } else if (
            delta.type === 'signature_delta' &&
            delta.signature !== undefined
          ) {
            block.signature = delta.signature
          }
          break
        }
        case 'content_block_stop':
          break
        case 'message_delta': {
          const eventUsage = (event as StreamMessageDeltaEvent).usage
          if (eventUsage) {
            usage = mergeUsage(usage, eventUsage)
          }
          if ((event as StreamMessageDeltaEvent).delta?.stop_reason != null) {
            stopReason =
              (event as StreamMessageDeltaEvent).delta?.stop_reason ?? null
          }
          break
        }
        case 'message_stop': {
          if (partialMessage) {
            const message = assembleAssistantMessage({
              partialMessage,
              contentBlocks,
              tools,
              agentId: options.agentId as AgentId | undefined,
              usage,
              stopReason,
            })
            if (message) {
              collectedMessages.push(message)
              yield message
            }
            partialMessage = null
          }
          if (usage.input_tokens + usage.output_tokens > 0) {
            const costUSD = calculateUSDCost(
              ollamaModel,
              usage as unknown as BetaUsage,
            )
            addToTotalSessionCost(
              costUSD,
              usage as unknown as BetaUsage,
              options.model,
            )
          }
          break
        }
      }

      yield {
        type: 'stream_event',
        event,
        ...(event.type === 'message_start' ? { ttftMs } : undefined),
      } as StreamEvent
    }

    recordLLMObservation(options.langfuseTrace ?? null, {
      model: ollamaModel,
      provider: 'ollama',
      input: convertMessagesToLangfuse(messagesForAPI, systemPrompt),
      output: convertOutputToLangfuse(collectedMessages),
      usage,
      startTime: new Date(start),
      endTime: new Date(),
      completionStartTime: ttftMs > 0 ? new Date(start + ttftMs) : undefined,
      tools: convertToolsToLangfuse(toolSchemas as unknown[]),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const baseURL = process.env.OLLAMA_BASE_URL || 'https://ollama.com/api'
    const requestURL = `${baseURL.replace(/\/$/, '')}/chat`
    logForDebugging(`[Ollama] Error calling ${requestURL}: ${errorMessage}`, {
      level: 'error',
    })

    yield createAssistantAPIErrorMessage({
      content: `[Ollama] API Error: ${errorMessage}\n\nRequest URL: ${requestURL}`,
      apiError: 'api_error',
      error: (error instanceof Error
        ? error
        : new Error(String(error))) as unknown as SDKAssistantMessageError,
    })
  }
}

async function* parseOllamaStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<OllamaChatChunk, void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        yield JSON.parse(trimmed) as OllamaChatChunk
      }
    }

    buffer += decoder.decode()
    const tail = buffer.trim()
    if (tail) {
      yield JSON.parse(tail) as OllamaChatChunk
    }
  } finally {
    reader.releaseLock()
  }
}

function assembleAssistantMessage(params: {
  partialMessage: any
  contentBlocks: Record<number, any>
  tools: Tools
  agentId: AgentId | undefined
  usage: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  }
  stopReason: string | null
}): AssistantMessage | undefined {
  const blocks = Object.keys(params.contentBlocks)
    .sort((a, b) => Number(a) - Number(b))
    .map(key => params.contentBlocks[Number(key)])
    .filter(Boolean)

  if (blocks.length === 0) return undefined

  return {
    message: {
      ...params.partialMessage,
      content: normalizeContentFromAPI(blocks, params.tools, params.agentId),
      usage: params.usage,
      stop_reason: params.stopReason,
      stop_sequence: null,
    },
    requestId: undefined,
    type: 'assistant',
    uuid: randomUUID(),
    timestamp: new Date().toISOString(),
  } as AssistantMessage
}

function resolveOllamaMaxTokens(
  defaultMaxTokens: number,
  override?: number,
): number {
  if (override !== undefined) {
    return clampOllamaMaxTokens(defaultMaxTokens, override)
  }

  const envValue =
    process.env.OLLAMA_MAX_TOKENS || process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return clampOllamaMaxTokens(defaultMaxTokens, parsed)
    }
  }

  return defaultMaxTokens
}

function clampOllamaMaxTokens(
  defaultMaxTokens: number,
  requestedMaxTokens: number,
): number {
  if (!Number.isFinite(requestedMaxTokens) || requestedMaxTokens <= 0) {
    return defaultMaxTokens
  }
  return Math.min(requestedMaxTokens, defaultMaxTokens)
}

function mergeUsage(
  current: {
    input_tokens: number
    output_tokens: number
    cache_creation_input_tokens: number
    cache_read_input_tokens: number
  },
  next: Partial<BetaUsage> | undefined,
): typeof current {
  if (!next) return current
  return {
    input_tokens:
      typeof next.input_tokens === 'number'
        ? next.input_tokens
        : current.input_tokens,
    output_tokens:
      typeof next.output_tokens === 'number'
        ? next.output_tokens
        : current.output_tokens,
    cache_creation_input_tokens:
      typeof next.cache_creation_input_tokens === 'number'
        ? next.cache_creation_input_tokens
        : current.cache_creation_input_tokens,
    cache_read_input_tokens:
      typeof next.cache_read_input_tokens === 'number'
        ? next.cache_read_input_tokens
        : current.cache_read_input_tokens,
  }
}
