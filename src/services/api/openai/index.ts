import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import type {
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
  AssistantMessage,
} from '../../../types/message.js'
import type { Tools } from '../../../Tool.js'
import type { Stream } from 'openai/streaming.mjs'
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions/completions.mjs'
import { getOpenAIClient } from './client.js'
import { anthropicMessagesToOpenAI } from './convertMessages.js'
import {
  anthropicToolsToOpenAI,
  anthropicToolChoiceToOpenAI,
} from './convertTools.js'
import { adaptOpenAIStreamToAnthropic } from './streamAdapter.js'
import { resolveOpenAIModel } from './modelMapping.js'
import { normalizeMessagesForAPI } from '../../../utils/messages.js'
import { toolToAPISchema } from '../../../utils/api.js'
import {
  getEmptyToolPermissionContext,
  toolMatchesName,
} from '../../../Tool.js'
import { logForDebugging } from '../../../utils/debug.js'
import { addToTotalSessionCost } from '../../../cost-tracker.js'
import { calculateUSDCost } from '../../../utils/modelCost.js'
import { isEnvTruthy, isEnvDefinedFalsy } from '../../../utils/envUtils.js'
import type { Options } from '../claude.js'
import { randomUUID } from 'crypto'
import {
  createAssistantAPIErrorMessage,
  normalizeContentFromAPI,
} from '../../../utils/messages.js'
import {
  isToolSearchEnabled,
  extractDiscoveredToolNames,
} from '../../../utils/toolSearch.js'
import {
  isDeferredTool,
  TOOL_SEARCH_TOOL_NAME,
} from '../../../tools/ToolSearchTool/prompt.js'

/**
 * Detect whether DeepSeek-style thinking mode should be enabled.
 *
 * Enabled when:
 * 1. OPENAI_ENABLE_THINKING=1 is set (explicit enable), OR
 * 2. Model name contains "deepseek-reasoner" OR "DeepSeek-V3.2" (auto-detect, case-insensitive)
 *
 * Disabled when:
 * - OPENAI_ENABLE_THINKING=0/false/no/off is explicitly set (overrides model detection)
 *
 * @param model - The resolved OpenAI model name
 * @internal Exported for testing purposes only
 */
export function isOpenAIThinkingEnabled(model: string): boolean {
  // Explicit disable takes priority (overrides model auto-detect)
  if (isEnvDefinedFalsy(process.env.OPENAI_ENABLE_THINKING)) return false
  // Explicit enable
  if (isEnvTruthy(process.env.OPENAI_ENABLE_THINKING)) return true
  // Auto-detect from model name (deepseek-reasoner and DeepSeek-V3.2 support thinking mode)
  const modelLower = model.toLowerCase()
  return modelLower.includes('deepseek-reasoner') || modelLower.includes('deepseek-v3.2')
}

/**
 * Build the request body for OpenAI chat.completions.create().
 * Extracted for testability — the thinking mode params are injected here.
 *
 * DeepSeek thinking mode: inject thinking params via request body.
 * Two formats are added simultaneously to support different deployments:
 * - Official DeepSeek API: `thinking: { type: 'enabled' }`
 * - Self-hosted DeepSeek-V3.2: `enable_thinking: true` + `chat_template_kwargs: { thinking: true }`
 * OpenAI SDK passes unknown keys through to the HTTP body.
 * Each endpoint will use the format it recognizes and ignore the others.
 * @internal Exported for testing purposes only
 */
export function buildOpenAIRequestBody(params: {
  model: string
  messages: any[]
  tools: any[]
  toolChoice: any
  enableThinking: boolean
  temperatureOverride?: number
}): ChatCompletionCreateParamsStreaming {
  const { model, messages, tools, toolChoice, enableThinking, temperatureOverride } = params
  return {
    model,
    messages,
    ...(tools.length > 0 && {
      tools,
      ...(toolChoice && { tool_choice: toolChoice }),
    }),
    stream: true,
    stream_options: { include_usage: true },
    // DeepSeek thinking mode: enable chain-of-thought output.
    // When active, temperature/top_p/presence_penalty/frequency_penalty are ignored by DeepSeek.
    ...(enableThinking && {
      // Official DeepSeek API format
      thinking: { type: 'enabled' },
      // Self-hosted DeepSeek-V3.2 format
      enable_thinking: true,
      chat_template_kwargs: { thinking: true },
    }),
    // Only send temperature when thinking mode is off (DeepSeek ignores it anyway,
    // but other providers may respect it)
    ...(!enableThinking && temperatureOverride !== undefined && {
      temperature: temperatureOverride,
    }),
  }
}

/**
 * OpenAI-compatible query path. Converts Anthropic-format messages/tools to
 * OpenAI format, calls the OpenAI-compatible endpoint, and converts the
 * SSE stream back to Anthropic BetaRawMessageStreamEvent for consumption
 * by the existing query pipeline.
 */
export async function* queryModelOpenAI(
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
    // 1. Resolve model name
    const openaiModel = resolveOpenAIModel(options.model)

    // 2. Normalize messages using shared preprocessing
    const messagesForAPI = normalizeMessagesForAPI(messages, tools)

    // 3. Check if tool search is enabled (similar to Anthropic path)
    const useToolSearch = await isToolSearchEnabled(
      options.model,
      tools,
      options.getToolPermissionContext ||
        (async () => getEmptyToolPermissionContext()),
      options.agents || [],
      options.querySource,
    )

    // 4. Build deferred tools set (similar to Anthropic path)
    const deferredToolNames = new Set<string>()
    if (useToolSearch) {
      for (const t of tools) {
        if (isDeferredTool(t)) deferredToolNames.add(t.name)
      }
    }

    // 5. Filter tools (similar to Anthropic path)
    let filteredTools = tools
    if (useToolSearch && deferredToolNames.size > 0) {
      const discoveredToolNames = extractDiscoveredToolNames(messages)

      filteredTools = tools.filter(tool => {
        // Always include non-deferred tools
        if (!deferredToolNames.has(tool.name)) return true
        // Always include ToolSearchTool (so it can discover more tools)
        if (toolMatchesName(tool, TOOL_SEARCH_TOOL_NAME)) return true
        // Only include deferred tools that have been discovered
        return discoveredToolNames.has(tool.name)
      })
    }

    // 6. Build tool schemas with deferLoading flag
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

    // 7. Filter out non-standard tools (server tools like advisor)
    const standardTools = toolSchemas.filter(
      (t): t is BetaToolUnion & { type: string } => {
        const anyT = t as unknown as Record<string, unknown>
        return (
          anyT.type !== 'advisor_20260301' && anyT.type !== 'computer_20250124'
        )
      },
    )

    // 8. Convert messages and tools to OpenAI format
    const enableThinking = isOpenAIThinkingEnabled(openaiModel)
    const openaiMessages = anthropicMessagesToOpenAI(messagesForAPI, systemPrompt, {
      enableThinking,
    })
    const openaiTools = anthropicToolsToOpenAI(standardTools)
    const openaiToolChoice = anthropicToolChoiceToOpenAI(options.toolChoice)

    // 9. Log tool filtering details
    if (useToolSearch) {
      const includedDeferredTools = filteredTools.filter(t =>
        deferredToolNames.has(t.name),
      ).length
      logForDebugging(
        `[OpenAI] Tool search enabled: ${includedDeferredTools}/${deferredToolNames.size} deferred tools included, total tools=${openaiTools.length}`,
      )
    } else {
      logForDebugging(
        `[OpenAI] Tool search disabled, total tools=${openaiTools.length}`,
      )
    }

    // 10. Get client and make streaming request
    const client = getOpenAIClient({
      maxRetries: 0,
      fetchOverride: options.fetchOverride,
      source: options.querySource,
    })

    logForDebugging(
      `[OpenAI] Calling model=${openaiModel}, messages=${openaiMessages.length}, tools=${openaiTools.length}, thinking=${enableThinking}`,
    )

    // 11. Call OpenAI API with streaming
    const requestBody = buildOpenAIRequestBody({
      model: openaiModel,
      messages: openaiMessages,
      tools: openaiTools,
      toolChoice: openaiToolChoice,
      enableThinking,
      temperatureOverride: options.temperatureOverride,
    })
    const stream = await client.chat.completions.create(
      requestBody,
      { signal },
    )

    // 12. Convert OpenAI stream to Anthropic events, then process into
    //     AssistantMessage + StreamEvent (matching the Anthropic path behavior)
    const adaptedStream = adaptOpenAIStreamToAnthropic(stream, openaiModel)

    // Accumulate content blocks and usage, same as the Anthropic path in claude.ts
    const contentBlocks: Record<number, any> = {}
    let partialMessage: any
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
        case 'content_block_stop': {
          const idx = (event as any).index
          const block = contentBlocks[idx]
          if (!block || !partialMessage) break

          const m: AssistantMessage = {
            message: {
              ...partialMessage,
              content: normalizeContentFromAPI([block], tools, options.agentId),
            },
            requestId: undefined,
            type: 'assistant',
            uuid: randomUUID(),
            timestamp: new Date().toISOString(),
          }
          yield m
          break
        }
        case 'message_delta': {
          const deltaUsage = (event as any).usage
          if (deltaUsage) {
            usage = { ...usage, ...deltaUsage }
          }
          // Update the stop_reason on the last yielded message
          // (we don't have a reference here, but the consumer handles this)
          break
        }
        case 'message_stop':
          break
      }

      // Track cost and token usage (matching the Anthropic path in claude.ts)
      if (
        event.type === 'message_stop' &&
        usage.input_tokens + usage.output_tokens > 0
      ) {
        const costUSD = calculateUSDCost(openaiModel, usage as any)
        addToTotalSessionCost(costUSD, usage as any, options.model)
      }

      // Also yield as StreamEvent for real-time display (matching Anthropic path)
      yield {
        type: 'stream_event',
        event,
        ...(event.type === 'message_start' ? { ttftMs } : undefined),
      } as StreamEvent
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logForDebugging(`[OpenAI] Error: ${errorMessage}`, { level: 'error' })
    yield createAssistantAPIErrorMessage({
      content: `API Error: ${errorMessage}`,
      apiError: 'api_error',
      error: (error instanceof Error ? error : new Error(String(error))) as Error,
    })
  }
}