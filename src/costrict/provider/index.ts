/**
 * CoStrict 查询入口
 * 复用 OpenAI 兼容路径，注入 CoStrict 自定义 fetch 和 baseURL
 */

import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type { SDKAssistantMessageError } from '../../entrypoints/agentSdkTypes.js'
import type { SystemPrompt } from '../../utils/systemPromptType.js'
import type {
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
  AssistantMessage,
} from '../../types/message.js'
import type { Tools } from '../../Tool.js'
import type { Options } from '../../services/api/claude.js'
import OpenAI from 'openai'
import { getProxyFetchOptions } from '../../utils/proxy.js'
import { anthropicMessagesToOpenAI } from '../../services/api/openai/convertMessages.js'
import {
  anthropicToolsToOpenAI,
  anthropicToolChoiceToOpenAI,
} from '../../services/api/openai/convertTools.js'
import { adaptOpenAIStreamToAnthropic } from '../../services/api/openai/streamAdapter.js'
import { normalizeMessagesForAPI } from '../../utils/messages.js'
import { toolToAPISchema } from '../../utils/api.js'
import { logForDebugging } from '../../utils/debug.js'
import { addToTotalSessionCost } from '../../cost-tracker.js'
import { calculateUSDCost } from '../../utils/modelCost.js'
import {
  createAssistantAPIErrorMessage,
  normalizeContentFromAPI,
} from '../../utils/messages.js'
import { randomUUID } from 'crypto'
import { createCoStrictFetch } from './fetch.js'
import { resolveCoStrictModel } from './modelMapping.js'
import { getCoStrictBaseURL } from './auth.js'
import { loadCoStrictCredentials } from './credentials.js'

/**
 * CoStrict 查询路径
 * 与 queryModelOpenAI 结构相同，使用 CoStrict 自定义 fetch 和 baseURL
 */
export async function* queryModelCoStrict(
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
    // 1. 解析模型名
    const costrictModel = resolveCoStrictModel(options.model)

    // 2. 获取 CoStrict base URL
    const creds = await loadCoStrictCredentials()
    const baseUrl = getCoStrictBaseURL(creds?.base_url)
    const chatBaseURL = `${baseUrl}/chat-rag/api/v1`

    // 3. 规范化消息
    const messagesForAPI = normalizeMessagesForAPI(messages, tools)

    // 4. 构建工具 schema
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
    const standardTools = toolSchemas.filter(
      (t): t is BetaToolUnion & { type: string } => {
        const anyT = t as unknown as Record<string, unknown>
        return (
          anyT.type !== 'advisor_20260301' && anyT.type !== 'computer_20250124'
        )
      },
    )

    // 5. 转换为 OpenAI 格式
    const openaiMessages = anthropicMessagesToOpenAI(
      messagesForAPI,
      systemPrompt,
      { enableThinking: true },
    )
    const openaiTools = anthropicToolsToOpenAI(standardTools)
    const openaiToolChoice = anthropicToolChoiceToOpenAI(options.toolChoice)

    // 6. 创建专用的 CoStrict OpenAI 客户端（不缓存，每次使用新的 fetch）
    const costrictFetch = createCoStrictFetch()
    const client = new OpenAI({
      apiKey: 'costrict-managed', // 实际 token 由 createCoStrictFetch 注入
      baseURL: chatBaseURL,
      maxRetries: 0,
      timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
      dangerouslyAllowBrowser: true,
      fetchOptions: getProxyFetchOptions({
        forAnthropicAPI: false,
      }) as any,
      fetch: costrictFetch as any,
    })

    logForDebugging(
      `[CoStrict] model=${costrictModel}, baseURL=${chatBaseURL}, messages=${openaiMessages.length}, tools=${openaiTools.length}`,
    )

    // 7. 调用 API（流式）
    const stream = await client.chat.completions.create(
      {
        model: costrictModel,
        messages: openaiMessages,
        ...(openaiTools.length > 0 && {
          tools: openaiTools,
          ...(openaiToolChoice && {
            tool_choice:
              openaiToolChoice as OpenAI.Chat.Completions.ChatCompletionToolChoiceOption,
          }),
        }),
        stream: true,
        stream_options: { include_usage: true },
        ...(options.temperatureOverride !== undefined && {
          temperature: options.temperatureOverride,
        }),
      },
      { signal },
    )

    // 8. 转换流并 yield 事件
    const adaptedStream = adaptOpenAIStreamToAnthropic(stream, costrictModel)

    const contentBlocks: Record<number, any> = {}
    // 跟踪已 yield 的 assistant messages，用于 message_delta 时回写 usage
    const yieldedMessages: AssistantMessage[] = []
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
        case 'message_start': {
          partialMessage = (event as any).message
          ttftMs = Date.now() - start
          if ((event as any).message?.usage) {
            usage = { ...usage, ...(event as any).message.usage }
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
              usage,
            },
            requestId: undefined,
            type: 'assistant',
            uuid: randomUUID(),
            timestamp: new Date().toISOString(),
          }
          yieldedMessages.push(m)
          yield m
          break
        }
        case 'message_delta': {
          const deltaUsage = (event as any).usage
          if (deltaUsage) usage = { ...usage, ...deltaUsage }
          // 回写 usage 到已 yield 的 assistant messages
          // 与 Anthropic 原生路径 claude.ts:2298 保持一致
          for (const msg of yieldedMessages) {
            msg.message.usage = usage
          }
          // 记录 stop_reason，回写到最后的 message
          if ((event as any).delta?.stop_reason != null) {
            stopReason = (event as any).delta.stop_reason
            const lastMsg = yieldedMessages[yieldedMessages.length - 1]
            if (lastMsg) {
              lastMsg.message.stop_reason = stopReason
            }
          }
          break
        }
        case 'message_stop':
          break
      }

      if (
        event.type === 'message_stop' &&
        usage.input_tokens + usage.output_tokens > 0
      ) {
        const costUSD = calculateUSDCost(costrictModel, usage as any)
        addToTotalSessionCost(costUSD, usage as any, options.model)
      }

      yield {
        type: 'stream_event',
        event,
        ...(event.type === 'message_start' ? { ttftMs } : undefined),
      } as StreamEvent
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logForDebugging(`[CoStrict] Error: ${errorMsg}`, { level: 'error' })
    yield createAssistantAPIErrorMessage({
      content: `CoStrict API Error: ${errorMsg}`,
      apiError: 'api_error',
      error:
        error instanceof Error
          ? (error as unknown as SDKAssistantMessageError)
          : undefined,
    })
  }
}
