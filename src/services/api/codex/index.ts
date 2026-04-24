import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses.mjs'
import { appendFileSync } from 'fs'
import type { SystemPrompt } from '../../../utils/systemPromptType.js'
import type {
  AssistantMessage,
  Message,
  StreamEvent,
  SystemAPIErrorMessage,
} from '../../../types/message.js'
import type { Tools } from '../../../Tool.js'
import type { SDKAssistantMessageError } from '../../../entrypoints/agentSdkTypes.js'
import { toolToAPISchema } from '../../../utils/api.js'
import {
  createAssistantAPIErrorMessage,
  normalizeMessagesForAPI,
} from '../../../utils/messages.js'
import { logForDebugging } from '../../../utils/debug.js'
import { getModelMaxOutputTokens } from '../../../utils/context.js'
import type { Options } from '../claude.js'
import { recordLLMObservation } from '../../../services/langfuse/tracing.js'
import {
  convertMessagesToLangfuse,
  convertOutputToLangfuse,
  convertToolsToLangfuse,
} from '../../../services/langfuse/convert.js'
import { anthropicMessagesToCodexInput } from './convertMessages.js'
import { anthropicToolsToCodex } from './convertTools.js'
import { getCodexClient } from './client.js'
import { uploadCodexBase64Image } from './imageUpload.js'
import {
  getCodexConfigurationError,
  normalizeCodexError,
} from './errors.js'
import { resolveCodexMaxTokens, resolveCodexModel } from './model.js'
import { sanitizeCodexRequest } from './preflight.js'
import {
  addCodexUsage,
  type CodexStreamResult,
  type CodexUsage,
  rawAssistantBlocksToAssistantMessage,
  type RawAssistantBlock,
  streamCodexAttempt,
} from './streaming.js'

const MAX_CODEX_CONTINUATIONS = 3

function dumpCodexPayload(
  body: ResponseCreateParamsNonStreaming,
): void {
  const path = process.env.CODEX_DEBUG_PAYLOADS
  if (!path) {
    return
  }

  appendFileSync(
    path,
    `${JSON.stringify({ timestamp: new Date().toISOString(), body }, null, 2)}\n`,
  )
}

function appendRawAssistantBlocks(
  target: RawAssistantBlock[],
  source: RawAssistantBlock[],
): void {
  for (const block of source) {
    const lastBlock = target.at(-1)

    if (lastBlock?.type === 'text' && block.type === 'text') {
      lastBlock.text += block.text
      continue
    }

    if (
      lastBlock?.type === 'tool_use' &&
      block.type === 'tool_use' &&
      lastBlock.id === block.id &&
      lastBlock.name === block.name &&
      block.input.startsWith(lastBlock.input)
    ) {
      lastBlock.input = block.input
      continue
    }

    target.push({ ...block })
  }
}

export async function* queryModelCodex(
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
    const configurationError = getCodexConfigurationError()
    if (configurationError) {
      yield createAssistantAPIErrorMessage({
        content: configurationError.content,
        apiError: 'api_error',
        error: configurationError.error,
      })
      return
    }

    const model = resolveCodexModel(options.model)
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
    const codexTools = anthropicToolsToCodex(toolSchemas as BetaToolUnion[])
    const { upperLimit } = getModelMaxOutputTokens(model)
    const maxTokens = resolveCodexMaxTokens(
      upperLimit,
      options.maxOutputTokensOverride,
    )

    const client = getCodexClient({
      maxRetries: 0,
      fetchOverride: options.fetchOverride as typeof fetch | undefined,
    })
    const start = Date.now()
    const collectedMessages: AssistantMessage[] = []
    let totalUsage: CodexUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }

    const aggregateBlocks: RawAssistantBlock[] = []
    let replayMessages = messagesForAPI
    let partialMessage: AssistantMessage['message'] | undefined
    let finalResponse: Response | undefined
    let terminalIncompleteResponse: Response | undefined

    for (
      let attempt = 0;
      attempt <= MAX_CODEX_CONTINUATIONS;
      attempt += 1
    ) {
      const input = await anthropicMessagesToCodexInput(replayMessages, {
        resolveBase64ImageUrl: uploadCodexBase64Image,
      })
      const requestBody = sanitizeCodexRequest({
        model,
        input,
        store: false,
        parallel_tool_calls: false,
        max_output_tokens: maxTokens,
        ...(systemPrompt.length > 0 && {
          instructions: systemPrompt.join('\n\n'),
        }),
        ...(codexTools.length > 0 && {
          tools: codexTools,
        }),
        ...(options.temperatureOverride !== undefined && {
          temperature: options.temperatureOverride,
        }),
      } satisfies ResponseCreateParamsNonStreaming)

      if (attempt === 0) {
        logForDebugging(
          `[Codex] Calling model=${model}, inputItems=${input.length}, tools=${codexTools.length}`,
        )
        dumpCodexPayload(requestBody)
      } else {
        logForDebugging(
          `[Codex] Continuing incomplete response attempt ${attempt}/${MAX_CODEX_CONTINUATIONS}`,
        )
      }

      const attemptStream = streamCodexAttempt({
        client,
        requestBody,
        signal,
        start,
        emitPrimaryEvents: attempt === 0,
      })

      let attemptResult: CodexStreamResult | undefined
      while (true) {
        const next = await attemptStream.next()
        if (next.done) {
          attemptResult = next.value
          break
        }
        yield next.value
      }

      if (!attemptResult?.response) {
        continue
      }

      partialMessage = partialMessage ?? attemptResult.partialMessage
      finalResponse = attemptResult.response
      terminalIncompleteResponse = attemptResult.incompleteResponse
      totalUsage = addCodexUsage(totalUsage, attemptResult.response)

      if (attemptResult.assistantBlocks.length === 0) {
        break
      }

      appendRawAssistantBlocks(aggregateBlocks, attemptResult.assistantBlocks)

      const shouldContinue =
        attemptResult.incompleteResponse !== undefined &&
        attempt < MAX_CODEX_CONTINUATIONS

      if (!shouldContinue) {
        break
      }

      const continuationMessage = rawAssistantBlocksToAssistantMessage(
        attemptResult.assistantBlocks,
        attemptResult.response,
        tools,
        options.agentId,
      )
      replayMessages = [...replayMessages, continuationMessage]
    }

    if (finalResponse) {
      if (aggregateBlocks.length === 0) {
        yield createAssistantAPIErrorMessage({
          content: 'Codex returned an empty streamed response.',
          apiError: 'api_error',
          error: 'unknown',
        })
        return
      }

      const assistantMessage = rawAssistantBlocksToAssistantMessage(
        aggregateBlocks,
        finalResponse,
        tools,
        options.agentId,
      )
      assistantMessage.message.usage = totalUsage as any
      collectedMessages.push(assistantMessage)
      yield assistantMessage

      recordLLMObservation(options.langfuseTrace ?? null, {
        model,
        provider: 'codex',
        input: convertMessagesToLangfuse(messagesForAPI, systemPrompt),
        output: convertOutputToLangfuse(collectedMessages),
        usage: totalUsage,
        startTime: new Date(start),
        endTime: new Date(),
        completionStartTime:
          partialMessage !== undefined ? new Date(start) : undefined,
        tools: convertToolsToLangfuse(toolSchemas as unknown[]),
      })
    } else {
      yield createAssistantAPIErrorMessage({
        content: 'Codex returned an empty streamed response.',
        apiError: 'api_error',
        error: 'unknown',
      })
      return
    }

    if (
      terminalIncompleteResponse?.incomplete_details?.reason ===
      'max_output_tokens'
    ) {
      yield createAssistantAPIErrorMessage({
        content: `Output truncated: response exceeded the ${maxTokens} token limit. Set CODEX_MAX_TOKENS or CLAUDE_CODE_MAX_OUTPUT_TOKENS to override.`,
        apiError: 'max_output_tokens',
        error: 'max_output_tokens' as unknown as SDKAssistantMessageError,
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const normalizedError = normalizeCodexError(error)
    logForDebugging(`[Codex] Error: ${errorMessage}`, { level: 'error' })
    yield createAssistantAPIErrorMessage({
      content: normalizedError.content,
      apiError: 'api_error',
      error: normalizedError.error,
    })
  }
}
