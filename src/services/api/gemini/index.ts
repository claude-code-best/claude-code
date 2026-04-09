import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
} from '../../../types/message.js'
import { getEmptyToolPermissionContext, type Tools } from '../../../Tool.js'
import { toolToAPISchema } from '../../../utils/api.js'
import { logForDebugging } from '../../../utils/debug.js'
import {
  createAssistantAPIErrorMessage,
  normalizeContentFromAPI,
  normalizeMessagesForAPI,
} from '../../../utils/messages.js'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import type { ThinkingConfig } from '../../../utils/thinking.js'
import type { Options } from '../claude.js'
import { streamGeminiGenerateContent } from './client.js'
import { anthropicMessagesToGemini } from './convertMessages.js'
import {
  anthropicToolChoiceToGemini,
  anthropicToolsToGemini,
} from './convertTools.js'
import { resolveGeminiModel } from './modelMapping.js'
import { adaptGeminiStreamToAnthropic } from './streamAdapter.js'
import { GEMINI_THOUGHT_SIGNATURE_FIELD } from './types.js'

export async function* queryModelGemini(
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
    const geminiModel = resolveGeminiModel(options.model)
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

    const standardTools = toolSchemas.filter(
      (t): t is BetaToolUnion & { type: string } => {
        const anyTool = t as unknown as Record<string, unknown>
        return (
          anyTool.type !== 'advisor_20260301' &&
          anyTool.type !== 'computer_20250124'
        )
      },
    )

    const { contents, systemInstruction } = anthropicMessagesToGemini(
      messagesForAPI,
      systemPrompt,
    )
    const geminiTools = anthropicToolsToGemini(standardTools)
    const toolChoice = anthropicToolChoiceToGemini(options.toolChoice)

    const stream = streamGeminiGenerateContent({
      model: geminiModel,
      signal,
      fetchOverride: options.fetchOverride as typeof fetch | undefined,
      body: {
        contents,
        ...(systemInstruction && { systemInstruction }),
        ...(geminiTools.length > 0 && { tools: geminiTools }),
        ...(toolChoice && {
          toolConfig: {
            functionCallingConfig: toolChoice,
          },
        }),
        generationConfig: {
          ...(options.temperatureOverride !== undefined && {
            temperature: options.temperatureOverride,
          }),
          ...(thinkingConfig.type !== 'disabled' && {
            thinkingConfig: {
              includeThoughts: true,
              ...(thinkingConfig.type === 'enabled' && {
                thinkingBudget: thinkingConfig.budgetTokens,
              }),
            },
          }),
        },
      },
    })

    logForDebugging(
      `[Gemini] Calling model=${geminiModel}, messages=${contents.length}, tools=${geminiTools.length}`,
    )

    const adaptedStream = adaptGeminiStreamToAnthropic(stream, geminiModel)
    const contentBlocks: Record<number, any> = {}
    let partialMessage: any = undefined
    let ttftMs = 0
    const start = Date.now()

    for await (const event of adaptedStream) {
      switch (event.type) {
        case 'message_start':
          partialMessage = (event as any).message
          ttftMs = Date.now() - start
          break
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
            if (block.type === 'thinking') {
              block.signature = delta.signature
            } else {
              block[GEMINI_THOUGHT_SIGNATURE_FIELD] = delta.signature
            }
          }
          break
        }
        case 'content_block_stop': {
          const idx = (event as any).index
          const block = contentBlocks[idx]
          if (!block || !partialMessage) break

          const message: AssistantMessage = {
            message: {
              ...partialMessage,
              content: normalizeContentFromAPI([block], tools, options.agentId),
            },
            requestId: undefined,
            type: 'assistant',
            uuid: randomUUID(),
            timestamp: new Date().toISOString(),
          }
          yield message
          break
        }
        case 'message_delta':
        case 'message_stop':
          break
      }

      yield {
        type: 'stream_event',
        event,
        ...(event.type === 'message_start' ? { ttftMs } : undefined),
      } as StreamEvent
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logForDebugging(`[Gemini] Error: ${errorMessage}`, { level: 'error' })
    yield createAssistantAPIErrorMessage({
      content: `API Error: ${errorMessage}`,
      apiError: 'api_error',
      error: (error instanceof Error ? error : new Error(String(error))) as Error,
    })
  }
}
