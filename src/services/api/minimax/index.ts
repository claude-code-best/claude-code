import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import type { Message, StreamEvent, SystemAPIErrorMessage, AssistantMessage } from '../../../types/message.js'
import type { Tools } from '../../../Tool.js'
import { getMiniMaxClient } from './client.js'
import { normalizeMessagesForAPI } from '../../../utils/messages.js'
import type { SDKAssistantMessageError } from '../../../entrypoints/agentSdkTypes.js'
import { toolToAPISchema } from '../../../utils/api.js'
import { logForDebugging } from '../../../utils/debug.js'
import { addToTotalSessionCost } from '../../../cost-tracker.js'
import { calculateUSDCost } from '../../../utils/modelCost.js'
import { recordLLMObservation } from '../../../services/langfuse/tracing.js'
import { convertMessagesToLangfuse, convertOutputToLangfuse, convertToolsToLangfuse } from '../../../services/langfuse/convert.js'
import type { Options } from '../claude.js'
import { randomUUID } from 'crypto'
import {
  createAssistantAPIErrorMessage,
  normalizeContentFromAPI,
} from '../../../utils/messages.js'

// Parameters not supported by MiniMax's Anthropic-compatible API
const UNSUPPORTED_PARAMS = new Set([
  'top_k',
  'stop_sequences',
  'service_tier',
  'mcp_servers',
  'context_management',
  'container',
])

/**
 * MiniMax query path. MiniMax uses an Anthropic-compatible API, so we use
 * the Anthropic SDK directly with a MiniMax base URL.
 *
 * Key constraints:
 * - temperature must be in (0.0, 1.0] — 0.0 is invalid
 * - Some Anthropic-specific parameters are unsupported
 * - System message is accepted as a string
 */
export async function* queryModelMiniMax(
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
    const messagesForAPI = normalizeMessagesForAPI(messages, tools)

    const toolSchemas = await Promise.all(
      tools.map(tool =>
        toolToAPISchema(tool, {
          getToolPermissionContext: options.getToolPermissionContext,
          tools,
          agents: options.agents,
          allowedAgentTypes: options.allowedAgentTypes,
          model: options.model,
        }),
      ),
    )

    // Filter out unsupported tool types (computer use, etc.)
    const standardTools = toolSchemas.filter(
      (t): t is BetaToolUnion & { type: string } => {
        const anyT = t as unknown as Record<string, unknown>
        return anyT.type !== 'advisor_20260301' && anyT.type !== 'computer_20250124'
      },
    )

    // Join system prompt blocks into a single string
    const systemText = systemPrompt.filter(Boolean).join('\n\n')

    // MiniMax temperature constraint: must be in (0.0, 1.0], default 1.0
    const temperature =
      options.temperatureOverride !== undefined && options.temperatureOverride > 0
        ? options.temperatureOverride
        : 1.0

    const client = getMiniMaxClient({
      maxRetries: 0,
      fetchOverride: options.fetchOverride as typeof fetch | undefined,
    })

    logForDebugging(
      `[MiniMax] Calling model=${options.model}, messages=${messagesForAPI.length}, tools=${standardTools.length}`,
    )

    const stream = client.messages.stream(
      {
        model: options.model,
        messages: messagesForAPI as Parameters<typeof client.messages.stream>[0]['messages'],
        ...(systemText && { system: systemText }),
        ...(standardTools.length > 0 && {
          tools: standardTools as Parameters<typeof client.messages.stream>[0]['tools'],
        }),
        max_tokens: options.maxTokens ?? 16000,
        temperature,
        stream: true,
      },
      { signal },
    )

    const contentBlocks: Record<number, any> = {}
    const collectedMessages: AssistantMessage[] = []
    let partialMessage: any = undefined
    let usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }
    let ttftMs = 0
    const start = Date.now()

    for await (const event of stream) {
      switch (event.type) {
        case 'message_start': {
          partialMessage = (event as any).message
          ttftMs = Date.now() - start
          if ((event as any).message?.usage) {
            usage = { ...usage, ...((event as any).message.usage) }
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
          collectedMessages.push(m)
          yield m
          break
        }
        case 'message_delta': {
          const deltaUsage = (event as any).usage
          if (deltaUsage) {
            usage = { ...usage, ...deltaUsage }
          }
          break
        }
        case 'message_stop':
          break
      }

      if (event.type === 'message_stop' && usage.input_tokens + usage.output_tokens > 0) {
        const costUSD = calculateUSDCost(options.model, usage as any)
        addToTotalSessionCost(costUSD, usage as any, options.model)
      }

      yield {
        type: 'stream_event',
        event: event as any,
        ...(event.type === 'message_start' ? { ttftMs } : undefined),
      } as StreamEvent
    }

    // Record LLM observation in Langfuse (no-op if not configured)
    recordLLMObservation(options.langfuseTrace ?? null, {
      model: options.model,
      provider: 'minimax',
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logForDebugging(`[MiniMax] Error: ${errorMessage}`, { level: 'error' })
    yield createAssistantAPIErrorMessage({
      content: `API Error: ${errorMessage}`,
      apiError: 'api_error',
      error: (error instanceof Error ? error : new Error(String(error))) as unknown as SDKAssistantMessageError,
    })
  }
}
