import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import type {
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
  AssistantMessage,
} from '../../../types/message.js'
import type { AgentId } from '../../../types/ids.js'
import type { Tools } from '../../../Tool.js'
import { getOpenAIClient } from './client.js'
import {
  anthropicMessagesToOpenAIResponses,
  resolveOpenAIModel,
  adaptOpenAIResponsesStreamToAnthropic,
  anthropicToolsToOpenAIResponses,
  anthropicToolChoiceToOpenAIResponses,
  type OpenAIResponsesMetadataEvent,
  type OpenAIResponsesReasoningItem,
} from '@ant/model-provider'
import { normalizeMessagesForAPI } from '../../../utils/messages.js'
import { toolToAPISchema } from '../../../utils/api.js'
import {
  getEmptyToolPermissionContext,
  toolMatchesName,
} from '../../../Tool.js'
import { logForDebugging } from '../../../utils/debug.js'
import { addToTotalSessionCost } from '../../../cost-tracker.js'
import { calculateUSDCost } from '../../../utils/modelCost.js'
import { resolveOpenAIMaxTokens } from './requestBody.js'
import { buildOpenAIResponsesRequestBody } from './responsesRequestBody.js'
import { recordLLMObservation } from '../../../services/langfuse/tracing.js'
import { convertMessagesToLangfuse, convertOutputToLangfuse, convertToolsToLangfuse } from '../../../services/langfuse/convert.js'
import { getModelMaxOutputTokens } from '../../../utils/context.js'
import type { Options } from '../claude.js'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import {
  createAssistantAPIErrorMessage,
  normalizeContentFromAPI,
} from '../../../utils/messages.js'
import type { SDKAssistantMessageError } from '../../../entrypoints/agentSdkTypes.js'
import {
  isToolSearchEnabled,
  extractDiscoveredToolNames,
} from '../../../utils/toolSearch.js'
import {
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME,
} from '@claude-code-best/builtin-tools/tools/ToolSearchTool/prompt.js'
import { resolveAppliedEffort } from '../../../utils/effort.js'
import { tmpdir } from 'os'
import { join } from 'path'

function assembleFinalAssistantOutputs(params: {
  partialMessage: any
  contentBlocks: Record<number, any>
  tools: Tools
  agentId: string | undefined
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }
  stopReason: string | null
  maxTokens: number
  reasoningItems: OpenAIResponsesReasoningItem[]
}): (AssistantMessage | SystemAPIErrorMessage)[] {
  const {
    partialMessage,
    contentBlocks,
    tools,
    agentId,
    usage,
    stopReason,
    maxTokens,
    reasoningItems,
  } = params
  const outputs: (AssistantMessage | SystemAPIErrorMessage)[] = []

  const allBlocks = Object.keys(contentBlocks)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => contentBlocks[Number(k)])
    .filter(Boolean)

  if (allBlocks.length > 0 || reasoningItems.length > 0) {
    outputs.push({
      message: {
        ...partialMessage,
        content: normalizeContentFromAPI(allBlocks, tools, agentId as AgentId | undefined),
        usage,
        stop_reason: stopReason,
        stop_sequence: null,
      },
      openaiReasoningItems: reasoningItems,
      requestId: undefined,
      type: 'assistant',
      uuid: randomUUID(),
      timestamp: new Date().toISOString(),
    } as AssistantMessage)
  }

  if (stopReason === 'max_tokens') {
    outputs.push(createAssistantAPIErrorMessage({
      content: `Output truncated: response exceeded the ${maxTokens} token limit. ` +
        `Set OPENAI_MAX_TOKENS or CLAUDE_CODE_MAX_OUTPUT_TOKENS to override.`,
      apiError: 'max_output_tokens',
      error: 'max_output_tokens',
    }))
  }

  return outputs
}

function systemPromptToText(systemPrompt: SystemPrompt): string {
  if (!systemPrompt || systemPrompt.length === 0) return ''
  return systemPrompt.filter(Boolean).join('\n\n')
}

export async function* queryModelOpenAIResponses(
  messages: Message[],
  systemPrompt: SystemPrompt,
  tools: Tools,
  signal: AbortSignal,
  options: Options,
): AsyncGenerator<
  StreamEvent | AssistantMessage | SystemAPIErrorMessage,
  void
> {
  try {
    const openaiModel = resolveOpenAIModel(options.model)
    const messagesForAPI = normalizeMessagesForAPI(messages, tools)

    const useToolSearch = await isToolSearchEnabled(
      options.model,
      tools,
      options.getToolPermissionContext ||
        (async () => getEmptyToolPermissionContext()),
      options.agents || [],
      options.querySource,
    )

    const deferredToolNames = new Set<string>()
    if (useToolSearch) {
      for (const t of tools) {
        if (isDeferredTool(t)) deferredToolNames.add(t.name)
      }
    }

    let filteredTools = tools
    if (useToolSearch && deferredToolNames.size > 0) {
      const discoveredToolNames = extractDiscoveredToolNames(messages)
      filteredTools = tools.filter(tool => {
        if (!deferredToolNames.has(tool.name)) return true
        if (toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME)) return true
        return discoveredToolNames.has(tool.name)
      })
    }

    const toolSchemas = await Promise.all(
      filteredTools.map(tool =>
        toolToAPISchema(tool, {
          getToolPermissionContext: options.getToolPermissionContext,
          tools,
          agents: options.agents,
          allowedAgentTypes: options.allowedAgentTypes,
          model: options.model,
          deferLoading: useToolSearch && deferredToolNames.has(tool.name),
        }),
      ),
    )

    const standardTools = toolSchemas.filter(
      (t): t is BetaToolUnion & { type: string } => {
        const anyT = t as unknown as Record<string, unknown>
        return (
          anyT.type !== 'advisor_20260301' && anyT.type !== 'computer_20250124'
        )
      },
    )

    const instructions = systemPromptToText(systemPrompt)
    const input = anthropicMessagesToOpenAIResponses(messagesForAPI)
    const openaiTools = anthropicToolsToOpenAIResponses(standardTools)
    const openaiToolChoice = anthropicToolChoiceToOpenAIResponses(options.toolChoice)

    const { upperLimit } = getModelMaxOutputTokens(openaiModel)
    const maxTokens = resolveOpenAIMaxTokens(
      upperLimit,
      options.maxOutputTokensOverride,
    )
    const effort = resolveAppliedEffort(openaiModel, options.effortValue)

    const client = getOpenAIClient({
      maxRetries: 0,
      fetchOverride: options.fetchOverride as unknown as typeof fetch,
      source: options.querySource,
    })

    logForDebugging(
      `[OpenAI:responses] Calling model=${openaiModel}, inputItems=${input.length}, tools=${openaiTools.length}`,
    )

    const requestBody = buildOpenAIResponsesRequestBody({
      model: openaiModel,
      instructions,
      input,
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      maxTokens,
      effort,
      temperatureOverride: options.temperatureOverride,
    })
    dumpOpenAIResponsesRequest({
      requestBody,
      model: openaiModel,
      querySource: options.querySource,
      toolCount: openaiTools.length,
    })
    const streamRequestBody = {
      ...requestBody,
    }
    const stream = await client.responses.create(
      streamRequestBody as never,
      { signal },
    ) as unknown as AsyncIterable<any>

    const adaptedStream = adaptOpenAIResponsesStreamToAnthropic(
      stream,
      openaiModel,
    )

    const contentBlocks: Record<number, any> = {}
    const collectedMessages: AssistantMessage[] = []
    let partialMessage: any
    let stopReason: string | null = null
    let reasoningItems: OpenAIResponsesReasoningItem[] = []
    let usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }
    let ttftMs = 0
    const start = Date.now()

    for await (const event of adaptedStream) {
      if (event.type === 'openai_responses_metadata') {
        reasoningItems = (event as OpenAIResponsesMetadataEvent).reasoningItems
        yield {
          type: 'stream_event',
          event,
        } as StreamEvent
        continue
      }

      switch (event.type) {
        case 'message_start': {
          partialMessage = (event as any).message
          ttftMs = Date.now() - start
          if ((event as any).message?.usage) {
            usage = {
              ...usage,
              ...(event as any).message.usage,
            }
          }
          break
        }
        case 'content_block_start': {
          const idx = (event as any).index
          const cb = (event as any).content_block
          if (cb.type === 'tool_use') {
            contentBlocks[idx] = { ...cb, input: '' }
          } else if (cb.type === 'text') {
            contentBlocks[idx] = { ...cb, text: '' }
          } else if (cb.type === 'thinking') {
            contentBlocks[idx] = { ...cb, thinking: '', signature: '' }
          } else {
            contentBlocks[idx] = { ...cb }
          }
          break
        }
        case 'content_block_delta': {
          const idx = (event as any).index
          const delta = (event as any).delta
          const block = contentBlocks[idx]
          if (!block) break
          if (delta.type === 'text_delta') {
            block.text = (block.text || '') + delta.text
          } else if (delta.type === 'input_json_delta') {
            block.input = (block.input || '') + delta.partial_json
          } else if (delta.type === 'thinking_delta') {
            block.thinking = (block.thinking || '') + delta.thinking
          } else if (delta.type === 'signature_delta') {
            block.signature = delta.signature
          }
          break
        }
        case 'message_delta': {
          const deltaUsage = (event as any).usage
          if (deltaUsage) {
            usage = { ...usage, ...deltaUsage }
          }
          if ((event as any).delta?.stop_reason != null) {
            stopReason = (event as any).delta.stop_reason
          }
          break
        }
        case 'message_stop': {
          if (partialMessage) {
            for (const output of assembleFinalAssistantOutputs({
              partialMessage,
              contentBlocks,
              tools,
              agentId: options.agentId,
              usage,
              stopReason,
              maxTokens,
              reasoningItems,
            })) {
              if (output.type === 'assistant') {
                collectedMessages.push(output)
              }
              yield output
            }
            partialMessage = null
          }

          if (usage.input_tokens + usage.output_tokens > 0) {
            const costUSD = calculateUSDCost(openaiModel, usage as any)
            addToTotalSessionCost(costUSD, usage as any, options.model)
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
      model: openaiModel,
      provider: 'openai',
      input: convertMessagesToLangfuse(messagesForAPI, systemPrompt),
      output: convertOutputToLangfuse(collectedMessages),
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
      },
      startTime: new Date(start),
      endTime: new Date(),
      completionStartTime: ttftMs > 0 ? new Date(start + ttftMs) : undefined,
      tools: convertToolsToLangfuse(toolSchemas as unknown[]),
    })

    if (partialMessage) {
      for (const output of assembleFinalAssistantOutputs({
        partialMessage,
        contentBlocks,
        tools,
        agentId: options.agentId,
        usage,
        stopReason,
        maxTokens,
        reasoningItems,
      })) {
        yield output
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logForDebugging(`[OpenAI:responses] Error: ${errorMessage}`, {
      level: 'error',
    })
    yield createAssistantAPIErrorMessage({
      content: `API Error: ${errorMessage}`,
      apiError: 'api_error',
      error: (error instanceof Error
        ? error
        : new Error(String(error))) as unknown as SDKAssistantMessageError,
    })
  }
}

function dumpOpenAIResponsesRequest(params: {
  requestBody: Record<string, unknown>
  model: string
  querySource: string
  toolCount: number
}): void {
  const dumpPath =
    process.env.CLAUDE_CODE_OPENAI_RESPONSES_DUMP ||
    process.env.OPENAI_RESPONSES_DUMP
  if (!dumpPath) return

  const resolvedPath =
    dumpPath === '1'
      ? join(tmpdir(), 'ccb-openai-responses-request.json')
      : dumpPath

  try {
    writeFileSync(
      resolvedPath,
      JSON.stringify(
        {
          model: params.model,
          querySource: params.querySource,
          toolCount: params.toolCount,
          requestBody: params.requestBody,
        },
        null,
        2,
      ),
      'utf8',
    )
    logForDebugging(
      `[OpenAI:responses] dumped request body to ${resolvedPath}`,
    )
  } catch (error) {
    logForDebugging(
      `[OpenAI:responses] failed to dump request body: ${error instanceof Error ? error.message : String(error)}`,
      { level: 'warn' },
    )
  }
}
