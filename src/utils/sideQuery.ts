import type Anthropic from '@anthropic-ai/sdk'
import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages.js'
import {
  getLastApiCompletionTimestamp,
  getSessionId,
  setLastApiCompletionTimestamp,
} from '../bootstrap/state.js'
import { STRUCTURED_OUTPUTS_BETA_HEADER } from '../constants/betas.js'
import type { QuerySource } from '../constants/querySource.js'
import {
  getAttributionHeader,
  getCLISyspromptPrefix,
} from '../constants/system.js'
import { logEvent } from '../services/analytics/index.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../services/analytics/metadata.js'
import { getAPIMetadata } from '../services/api/claude.js'
import { getAnthropicClient } from '../services/api/client.js'
import {
  createTrace,
  createChildSpan,
  endTrace,
  recordLLMObservation,
} from '../services/langfuse/index.js'
import type { LangfuseSpan } from '../services/langfuse/index.js'
import {
  convertMessagesToLangfuse,
  convertOutputToLangfuse,
  convertToolsToLangfuse,
} from '../services/langfuse/convert.js'
import { getModelBetas, modelSupportsStructuredOutputs } from './betas.js'
import { logForDebugging } from './debug.js'
import { errorMessage } from './errors.js'
import { getAPIProvider } from './model/providers.js'
import { normalizeModelStringForAPI } from './model/model.js'
import { getOpenAIClient } from '../services/api/openai/client.js'
import { getGrokClient } from '../services/api/grok/client.js'
import { isChatGPTAuthEnabled } from '../services/api/openai/chatgptAuth.js'
import {
  adaptResponsesStreamToAnthropic,
  buildResponsesRequest,
  createChatGPTResponsesStream,
} from '../services/api/openai/responsesAdapter.js'
import {
  formatOpenAIPromptCacheKey,
  getOfficialOpenAIPromptCacheKey,
} from '../services/api/openai/openaiShared.js'
import {
  anthropicMessagesToOpenAI,
  resolveOpenAIModel,
  anthropicToolsToOpenAI,
  anthropicToolChoiceToOpenAI,
  resolveGrokModel,
  resolveGeminiModel,
  anthropicToolsToGemini,
  anthropicToolChoiceToGemini,
  normalizeOpenAIUsage,
} from '@ant/model-provider'
import type { SystemPrompt } from './systemPromptType.js'
import type { BetaRawMessageStreamEvent } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'

type MessageParam = Anthropic.MessageParam
type TextBlockParam = Anthropic.TextBlockParam
type Tool = Anthropic.Tool
type ToolChoice = Anthropic.ToolChoice
type BetaMessage = Anthropic.Beta.Messages.BetaMessage
type BetaJSONOutputFormat = Anthropic.Beta.Messages.BetaJSONOutputFormat
type BetaThinkingConfigParam = Anthropic.Beta.Messages.BetaThinkingConfigParam

export type SideQueryOptions = {
  /** Model to use for the query */
  model: string
  /**
   * System prompt - string or array of text blocks (will be prefixed with CLI attribution).
   *
   * The attribution header is always placed in its own TextBlockParam block to ensure
   * server-side parsing correctly extracts the cc_entrypoint value without including
   * system prompt content.
   */
  system?: string | TextBlockParam[]
  /** Messages to send (supports cache_control on content blocks) */
  messages: MessageParam[]
  /** Optional tools (supports both standard Tool[] and BetaToolUnion[] for custom tool types) */
  tools?: Tool[] | BetaToolUnion[]
  /** Optional tool choice (use { type: 'tool', name: 'x' } for forced output) */
  tool_choice?: ToolChoice
  /** Optional JSON output format for structured responses */
  output_format?: BetaJSONOutputFormat
  /** Max tokens (default: 1024) */
  max_tokens?: number
  /** Max retries (default: 2) */
  maxRetries?: number
  /** Abort signal */
  signal?: AbortSignal
  /** Skip CLI system prompt prefix (keeps attribution header for OAuth). For internal classifiers that provide their own prompt. */
  skipSystemPromptPrefix?: boolean
  /** Temperature override */
  temperature?: number
  /** Thinking budget (enables thinking), or `false` to send `{ type: 'disabled' }`. */
  thinking?: number | false
  /** Stop sequences — generation stops when any of these strings is emitted */
  stop_sequences?: string[]
  /** Attributes this call in tengu_api_success for COGS joining against reporting.sampling_calls. */
  querySource: QuerySource
  /** Parent Langfuse span to nest this side query under the main agent trace. */
  parentSpan?: LangfuseSpan | null
  /** When true, API failures are recorded as WARNING instead of ERROR in Langfuse.
   *  Use for optional/best-effort queries where failure is expected and handled gracefully. */
  optional?: boolean
}

/**
 * Extract system prompt text from the `system` option.
 */
function extractSystemText(system?: string | TextBlockParam[]): string {
  if (!system) return ''
  if (typeof system === 'string') return system
  return system
    .filter((b): b is { type: 'text'; text: string } => 'text' in b && !!b.text)
    .map(b => b.text)
    .join('\n\n')
}

/**
 * Convert Anthropic MessageParam[] to a list of {role, content} objects
 * suitable for OpenAI-compatible chat.completions APIs.
 */
function messageParamsToOpenAIRoleContent(
  messages: MessageParam[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const text =
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .filter(
                (b): b is { type: 'text'; text: string } => b.type === 'text',
              )
              .map(b => b.text)
              .join('\n')
          : ''
    if (text) {
      result.push({ role: m.role as 'user' | 'assistant', content: text })
    }
  }
  return result
}

/**
 * Lightweight API wrapper for "side queries" outside the main conversation loop.
 *
 * Use this instead of direct client.beta.messages.create() calls to ensure
 * proper OAuth token validation with fingerprint attribution headers.
 *
 * This handles:
 * - Fingerprint computation for OAuth validation
 * - Attribution header injection
 * - CLI system prompt prefix
 * - Proper betas for the model
 * - API metadata
 * - Model string normalization (strips [1m] suffix for API)
 * - Third-party provider routing (OpenAI, Grok, Gemini)
 *
 * @example
 * // Permission explainer
 * await sideQuery({ querySource: 'permission_explainer', model, system: SYSTEM_PROMPT, messages, tools, tool_choice })
 *
 * @example
 * // Session search
 * await sideQuery({ querySource: 'session_search', model, system: SEARCH_PROMPT, messages })
 *
 * @example
 * // Model validation
 * await sideQuery({ querySource: 'model_validation', model, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] })
 */
export async function sideQuery(opts: SideQueryOptions): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    output_format,
    max_tokens = 1024,
    maxRetries = 2,
    signal,
    skipSystemPromptPrefix,
    temperature,
    thinking,
    stop_sequences,
  } = opts

  const provider = getAPIProvider()
  if (provider === 'openai' || provider === 'grok') {
    return sideQueryViaOpenAICompatible(opts)
  }
  if (provider === 'gemini') {
    return sideQueryViaGemini(opts)
  }

  const client = await getAnthropicClient({
    maxRetries,
    model,
    source: 'side_query',
  })
  const betas = [...getModelBetas(model)]
  // Add structured-outputs beta if using output_format and provider supports it
  if (
    output_format &&
    modelSupportsStructuredOutputs(model) &&
    !betas.includes(STRUCTURED_OUTPUTS_BETA_HEADER)
  ) {
    betas.push(STRUCTURED_OUTPUTS_BETA_HEADER)
  }

  const attributionHeader = getAttributionHeader()

  // Build system as array to keep attribution header in its own block
  // (prevents server-side parsing from including system content in cc_entrypoint)
  const systemBlocks: TextBlockParam[] = [
    attributionHeader ? { type: 'text', text: attributionHeader } : null,
    // Skip CLI system prompt prefix for internal classifiers that provide their own prompt
    ...(skipSystemPromptPrefix
      ? []
      : [
          {
            type: 'text' as const,
            text: getCLISyspromptPrefix({
              isNonInteractive: false,
              hasAppendSystemPrompt: false,
            }),
          },
        ]),
    ...(Array.isArray(system)
      ? system
      : system
        ? [{ type: 'text' as const, text: system }]
        : []),
  ].filter((block): block is TextBlockParam => block !== null)

  let thinkingConfig: BetaThinkingConfigParam | undefined
  if (thinking === false) {
    thinkingConfig = { type: 'disabled' }
  } else if (thinking !== undefined) {
    thinkingConfig = {
      type: 'enabled',
      budget_tokens: Math.min(thinking, max_tokens - 1),
    }
  }

  const normalizedModel = normalizeModelStringForAPI(model)
  const start = Date.now()
  const traceName = `side-query:${opts.querySource}`

  // When parentSpan is provided, create a child span nested under the
  // main agent trace; otherwise create a standalone root trace.
  const _ps = opts.parentSpan
  // eslint-disable-next-line no-constant-condition
  if (opts.querySource === 'auto_mode') {
    logForDebugging(
      `[sideQuery] auto_mode parentSpan=${_ps ? `id=${(_ps as unknown as Record<string, unknown>).id ?? 'present'}` : 'null/undefined'} querySource=${opts.querySource}`,
    )
  }
  // When parentSpan is provided, create a child span nested under the
  // main agent trace. For auto_mode queries, we must always nest under
  // a parent span — never create a standalone root trace (agent type),
  // as auto_mode observations should appear as spans within the parent.
  // For other query sources without a parent, create a standalone trace.
  const langfuseTrace = _ps
    ? createChildSpan(_ps, {
        name: traceName,
        sessionId: getSessionId(),
        model: normalizedModel,
        provider,
        querySource: opts.querySource,
      })
    : opts.querySource === 'auto_mode'
      ? null
      : createTrace({
          sessionId: getSessionId(),
          model: normalizedModel,
          provider,
          name: traceName,
          querySource: opts.querySource,
        })

  let response: BetaMessage
  try {
    response = await client.beta.messages.create(
      {
        model: normalizedModel,
        max_tokens,
        system: systemBlocks,
        messages,
        ...(tools && { tools }),
        ...(tool_choice && { tool_choice }),
        ...(output_format && { output_config: { format: output_format } }),
        ...(temperature !== undefined && { temperature }),
        ...(stop_sequences && { stop_sequences }),
        ...(thinkingConfig && { thinking: thinkingConfig }),
        ...(betas.length > 0 && { betas }),
        metadata: getAPIMetadata(),
      },
      { signal },
    )
  } catch (error) {
    endTrace(
      langfuseTrace,
      { error: errorMessage(error) },
      opts.optional ? 'interrupted' : 'error',
    )
    throw error
  }

  const requestId =
    (response as { _request_id?: string | null })._request_id ?? undefined
  const now = Date.now()
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId:
      requestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource:
      opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      normalizedModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
    uncachedInputTokens: response.usage.cache_creation_input_tokens ?? 0,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs:
      lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)

  // Record LLM observation in Langfuse (no-op if not configured).
  // Wrap SDK types into the internal message format expected by converters.
  const wrappedInput = messages.map(m => ({
    type: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    message: { role: m.role, content: m.content },
  })) as unknown as Parameters<typeof convertMessagesToLangfuse>[0]
  const wrappedOutput = [
    {
      type: 'assistant' as const,
      message: { role: 'assistant' as const, content: response.content },
    },
  ] as unknown as Parameters<typeof convertOutputToLangfuse>[0]
  recordLLMObservation(langfuseTrace, {
    model: normalizedModel,
    provider,
    input: convertMessagesToLangfuse(
      wrappedInput,
      systemBlocks.length > 0 ? systemBlocks.map(b => b.text) : undefined,
    ),
    output: convertOutputToLangfuse(wrappedOutput),
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens:
        response.usage.cache_creation_input_tokens ?? undefined,
      cache_read_input_tokens:
        response.usage.cache_read_input_tokens ?? undefined,
    },
    startTime: new Date(start),
    endTime: new Date(),
    ...(tools && { tools: convertToolsToLangfuse(tools as unknown[]) }),
    ...(thinkingConfig &&
      thinkingConfig.type !== 'disabled' && {
        thinking: {
          type: thinkingConfig.type,
          ...(thinkingConfig.type === 'enabled' && {
            budgetTokens: thinkingConfig.budget_tokens,
          }),
        },
      }),
  })
  endTrace(langfuseTrace)

  return response
}

/**
 * Collect Anthropic stream events from the ChatGPT Responses adapter into a
 * single BetaMessage for side-query callers (classifiers, explainers, etc.).
 */
async function collectAnthropicStreamToBetaMessage(
  stream: AsyncIterable<BetaRawMessageStreamEvent>,
  fallbackModel: string,
): Promise<BetaMessage> {
  let messageId = `msg_side_${Date.now()}`
  let model = fallbackModel
  let stopReason: BetaMessage['stop_reason'] = 'end_turn'
  let usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  }
  const contentBlocks: Record<number, Record<string, unknown>> = {}

  for await (const event of stream) {
    switch (event.type) {
      case 'message_start': {
        messageId = event.message.id
        model = event.message.model || model
        if (event.message.usage) {
          usage = {
            input_tokens: event.message.usage.input_tokens ?? 0,
            output_tokens: event.message.usage.output_tokens ?? 0,
            cache_creation_input_tokens:
              event.message.usage.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens:
              event.message.usage.cache_read_input_tokens ?? 0,
          }
        }
        break
      }
      case 'content_block_start': {
        const cb = event.content_block as unknown as Record<string, unknown>
        if (cb.type === 'tool_use') {
          contentBlocks[event.index] = { ...cb, input: '' }
        } else if (cb.type === 'text') {
          contentBlocks[event.index] = { ...cb, text: '' }
        } else if (cb.type === 'thinking') {
          contentBlocks[event.index] = {
            ...cb,
            thinking: '',
            signature: '',
          }
        } else {
          contentBlocks[event.index] = { ...cb }
        }
        break
      }
      case 'content_block_delta': {
        const block = contentBlocks[event.index]
        if (!block) break
        const delta = event.delta as {
          type: string
          text?: string
          partial_json?: string
          thinking?: string
          signature?: string
        }
        if (delta.type === 'text_delta') {
          block.text = String(block.text ?? '') + String(delta.text ?? '')
        } else if (delta.type === 'input_json_delta') {
          block.input =
            String(block.input ?? '') + String(delta.partial_json ?? '')
        } else if (delta.type === 'thinking_delta') {
          block.thinking =
            String(block.thinking ?? '') + String(delta.thinking ?? '')
        } else if (delta.type === 'signature_delta') {
          block.signature = delta.signature
        }
        break
      }
      case 'message_delta': {
        const delta = event.delta as {
          stop_reason?: BetaMessage['stop_reason']
        }
        if (delta.stop_reason != null) {
          stopReason = delta.stop_reason
        }
        const deltaUsage = (
          event as {
            usage?: {
              input_tokens?: number
              output_tokens?: number
              cache_creation_input_tokens?: number
              cache_read_input_tokens?: number
            }
          }
        ).usage
        if (deltaUsage) {
          if (typeof deltaUsage.input_tokens === 'number') {
            usage.input_tokens = deltaUsage.input_tokens
          }
          if (typeof deltaUsage.output_tokens === 'number') {
            usage.output_tokens = deltaUsage.output_tokens
          }
          if (
            typeof deltaUsage.cache_creation_input_tokens === 'number' &&
            deltaUsage.cache_creation_input_tokens > 0
          ) {
            usage.cache_creation_input_tokens =
              deltaUsage.cache_creation_input_tokens
          }
          if (
            typeof deltaUsage.cache_read_input_tokens === 'number' &&
            deltaUsage.cache_read_input_tokens > 0
          ) {
            usage.cache_read_input_tokens = deltaUsage.cache_read_input_tokens
          }
        }
        break
      }
      default:
        break
    }
  }

  const content = Object.keys(contentBlocks)
    .map(Number)
    .sort((a, b) => a - b)
    .map(index => {
      const block = contentBlocks[index]!
      if (block.type === 'tool_use') {
        const rawInput = block.input
        let parsed: unknown = {}
        if (typeof rawInput === 'string' && rawInput.length > 0) {
          try {
            parsed = JSON.parse(rawInput)
          } catch {
            parsed = {}
          }
        } else if (rawInput && typeof rawInput === 'object') {
          parsed = rawInput
        }
        return {
          type: 'tool_use' as const,
          id: String(block.id ?? `toolu_${index}`),
          name: String(block.name ?? ''),
          input: parsed,
        }
      }
      if (block.type === 'thinking') {
        return {
          type: 'thinking' as const,
          thinking: String(block.thinking ?? ''),
          signature: String(block.signature ?? ''),
        }
      }
      return {
        type: 'text' as const,
        text: String(block.text ?? ''),
      }
    })

  // Forced tool_choice classifiers care about tool_use blocks, not stop_reason
  // from the Responses adapter (which often reports end_turn even with tools).
  if (content.some(b => b.type === 'tool_use') && stopReason === 'end_turn') {
    stopReason = 'tool_use'
  }

  return {
    id: messageId,
    type: 'message',
    role: 'assistant',
    content: content as BetaMessage['content'],
    model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  } as BetaMessage
}

/**
 * ChatGPT OAuth side query via the Codex Responses API.
 *
 * Must not use getOpenAIClient() — that path only reads OPENAI_API_KEY and
 * yields 401 under OPENAI_AUTH_MODE=chatgpt (no API key configured).
 */
async function sideQueryViaChatGPTResponses(
  opts: SideQueryOptions,
  openaiModel: string,
  openaiMessages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }>,
  openaiTools: unknown[] | undefined,
  openaiToolChoice: unknown,
): Promise<BetaMessage> {
  const start = Date.now()
  const request = buildResponsesRequest({
    model: openaiModel,
    messages: openaiMessages,
    tools: openaiTools ?? [],
    toolChoice: openaiToolChoice,
    promptCacheKey: formatOpenAIPromptCacheKey(getSessionId()),
  })

  const rawStream = await createChatGPTResponsesStream({
    request,
    signal: opts.signal ?? new AbortController().signal,
  })
  const adapted = adaptResponsesStreamToAnthropic(rawStream, openaiModel)
  const betaMessage = await collectAnthropicStreamToBetaMessage(
    adapted,
    openaiModel,
  )

  const now = Date.now()
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId:
      betaMessage.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource:
      opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      openaiModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: betaMessage.usage.input_tokens,
    outputTokens: betaMessage.usage.output_tokens,
    cachedInputTokens: betaMessage.usage.cache_read_input_tokens ?? 0,
    uncachedInputTokens: betaMessage.usage.input_tokens,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs:
      lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)

  return betaMessage
}

/**
 * OpenAI-compatible side query for OpenAI and Grok providers.
 * Both use the OpenAI SDK with different base URLs.
 *
 * Converts Anthropic-format params to OpenAI Chat Completions, sends a
 * non-streaming request, and wraps the response back into a BetaMessage
 * shape so callers remain provider-agnostic.
 *
 * When OPENAI_AUTH_MODE=chatgpt, OpenAI side queries use the ChatGPT OAuth
 * Responses API path (same auth/transport as the main loop) instead of the
 * API-key Chat Completions client.
 *
 * Supports tools and tool_choice for structured output (e.g. yoloClassifier,
 * permissionExplainer).
 */
async function sideQueryViaOpenAICompatible(
  opts: SideQueryOptions,
): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    max_tokens = 1024,
    temperature,
    signal,
  } = opts

  const provider = getAPIProvider()
  const normalizedModel = normalizeModelStringForAPI(model)

  // Resolve model name per provider
  const openaiModel =
    provider === 'grok'
      ? resolveGrokModel(normalizedModel)
      : resolveOpenAIModel(normalizedModel)

  // Build system prompt text
  const systemText = extractSystemText(system)

  // Build OpenAI messages: system first, then user/assistant
  const openaiMessages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
  }> = []
  if (systemText) {
    openaiMessages.push({ role: 'system', content: systemText })
  }
  openaiMessages.push(...messageParamsToOpenAIRoleContent(messages))

  // Convert tools and tool_choice if provided
  const openaiTools =
    tools && tools.length > 0
      ? anthropicToolsToOpenAI(tools as BetaToolUnion[])
      : undefined
  const openaiToolChoice = tool_choice
    ? anthropicToolChoiceToOpenAI(tool_choice)
    : undefined

  // ChatGPT subscription auth: use Responses API + OAuth, never empty API key.
  if (provider === 'openai' && isChatGPTAuthEnabled()) {
    return sideQueryViaChatGPTResponses(
      opts,
      openaiModel,
      openaiMessages,
      openaiTools,
      openaiToolChoice,
    )
  }

  // API-key / OpenAI-compatible / Grok: Chat Completions
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  const client: import('openai').default =
    provider === 'grok'
      ? getGrokClient({ maxRetries: opts.maxRetries ?? 2 })
      : getOpenAIClient({ maxRetries: opts.maxRetries ?? 2 })

  const start = Date.now()

  const requestParams: Record<string, unknown> = {
    model: openaiModel,
    messages: openaiMessages,
    max_tokens,
  }
  const promptCacheKey =
    provider === 'openai'
      ? getOfficialOpenAIPromptCacheKey(
          process.env.OPENAI_BASE_URL,
          getSessionId(),
        )
      : undefined
  if (promptCacheKey) requestParams.prompt_cache_key = promptCacheKey
  if (temperature !== undefined) requestParams.temperature = temperature
  if (openaiTools && openaiTools.length > 0) {
    requestParams.tools = openaiTools
    if (openaiToolChoice) requestParams.tool_choice = openaiToolChoice
  }

  const response = await client.chat.completions.create(
    requestParams as unknown as import('openai/resources/chat/completions/completions.mjs').ChatCompletionCreateParamsNonStreaming,
    { signal },
  )

  const choice = response.choices[0]
  const message = choice?.message

  // Build content blocks for BetaMessage
  const contentBlocks: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  > = []

  if (message?.content) {
    contentBlocks.push({ type: 'text', text: message.content })
  }

  if (message?.tool_calls) {
    for (const tc of message.tool_calls) {
      // ChatCompletionMessageToolCall is a union — only function-type has .function
      if (tc.type === 'function' && 'function' in tc) {
        const fn = (tc as { function: { name: string; arguments: string } })
          .function
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id ?? `toolu_${Date.now()}`,
          name: fn.name,
          input: JSON.parse(fn.arguments || '{}'),
        })
      }
    }
  }

  const responseUsage = response.usage
  const usageRecord = responseUsage as unknown as
    | Record<string, unknown>
    | undefined
  const detailsValue = usageRecord?.prompt_tokens_details
  const details =
    detailsValue && typeof detailsValue === 'object'
      ? (detailsValue as Record<string, unknown>)
      : undefined
  const usage = normalizeOpenAIUsage({
    totalInputTokens: responseUsage?.prompt_tokens ?? 0,
    outputTokens: responseUsage?.completion_tokens ?? 0,
    cacheReadTokens:
      typeof details?.cached_tokens === 'number' ? details.cached_tokens : 0,
    cacheWriteTokens:
      promptCacheKey && typeof details?.cache_write_tokens === 'number'
        ? details.cache_write_tokens
        : 0,
  })

  const now = Date.now()
  const requestId = response.id
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId:
      requestId as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource:
      opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      openaiModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens: usage.cache_read_input_tokens,
    uncachedInputTokens: usage.cache_creation_input_tokens,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs:
      lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)

  const stopReason =
    choice?.finish_reason === 'tool_calls'
      ? 'tool_use'
      : choice?.finish_reason === 'length'
        ? 'max_tokens'
        : 'end_turn'

  return {
    id: response.id,
    type: 'message',
    role: 'assistant',
    content: contentBlocks as BetaMessage['content'],
    model: openaiModel,
    stop_reason: stopReason as BetaMessage['stop_reason'],
    stop_sequence: null,
    usage,
  } as BetaMessage
}

/**
 * Gemini side query. Converts Anthropic-format params to Gemini
 * generateContent format, sends a non-streaming request via fetch,
 * and wraps the response back into a BetaMessage shape.
 */
async function sideQueryViaGemini(
  opts: SideQueryOptions,
): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    max_tokens = 1024,
    temperature,
    signal,
  } = opts

  const normalizedModel = normalizeModelStringForAPI(model)
  const geminiModel = resolveGeminiModel(normalizedModel)

  // Build Gemini contents from Anthropic MessageParam[]
  const contents: Array<{
    role: 'user' | 'model'
    parts: Array<{ text: string }>
  }> = []
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const text =
      typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .filter(
                (b): b is { type: 'text'; text: string } => b.type === 'text',
              )
              .map(b => b.text)
              .join('\n')
          : ''
    if (text) {
      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text }],
      })
    }
  }

  // Build system instruction
  const systemText = extractSystemText(system)
  const systemInstruction = systemText
    ? { parts: [{ text: systemText }] }
    : undefined

  // Convert tools and tool_choice
  const geminiTools =
    tools && tools.length > 0
      ? anthropicToolsToGemini(tools as BetaToolUnion[])
      : undefined
  const geminiToolConfig = tool_choice
    ? anthropicToolChoiceToGemini(tool_choice)
    : undefined

  const baseUrl = (
    process.env.GEMINI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta'
  ).replace(/\/+$/, '')
  const modelPath = geminiModel.startsWith('models/')
    ? geminiModel
    : `models/${geminiModel}`
  const url = `${baseUrl}/${modelPath}:generateContent`

  const body: Record<string, unknown> = {
    contents,
    ...(systemInstruction && { systemInstruction }),
    ...(geminiTools && geminiTools.length > 0 && { tools: geminiTools }),
    ...(geminiToolConfig && {
      toolConfig: { functionCallingConfig: geminiToolConfig },
    }),
    ...(temperature !== undefined && {
      generationConfig: { temperature },
    }),
    ...(max_tokens !== undefined && {
      generationConfig: {
        ...(temperature !== undefined && { temperature }),
        maxOutputTokens: max_tokens,
      },
    }),
  }

  // Merge generationConfig if both temperature and max_tokens are set
  if (temperature !== undefined && max_tokens !== undefined) {
    body.generationConfig = { temperature, maxOutputTokens: max_tokens }
  }

  const start = Date.now()

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY || '',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(
      `Gemini API request failed (${res.status} ${res.statusText}): ${errorBody || 'empty response body'}`,
    )
  }

  const geminiResponse = (await res.json()) as {
    candidates?: Array<{
      content?: {
        role?: string
        parts?: Array<{
          text?: string
          functionCall?: { name?: string; args?: Record<string, unknown> }
        }>
      }
      finishReason?: string
    }>
    usageMetadata?: {
      promptTokenCount?: number
      candidatesTokenCount?: number
      totalTokenCount?: number
    }
    id?: string
  }

  // Build content blocks from Gemini response
  const contentBlocks: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  > = []

  const candidate = geminiResponse.candidates?.[0]
  const parts = candidate?.content?.parts
  if (parts) {
    for (const part of parts) {
      if (part.text) {
        contentBlocks.push({ type: 'text', text: part.text })
      }
      if (part.functionCall) {
        contentBlocks.push({
          type: 'tool_use',
          id: `toolu_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall.name ?? '',
          input: part.functionCall.args ?? {},
        })
      }
    }
  }

  const now = Date.now()
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId: (geminiResponse.id ??
      '') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource:
      opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model:
      geminiModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: geminiResponse.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: geminiResponse.usageMetadata?.candidatesTokenCount ?? 0,
    cachedInputTokens: 0,
    uncachedInputTokens: geminiResponse.usageMetadata?.promptTokenCount ?? 0,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs:
      lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)

  const stopReason =
    candidate?.finishReason === 'STOP'
      ? 'end_turn'
      : candidate?.finishReason === 'MAX_TOKENS'
        ? 'max_tokens'
        : 'end_turn'

  return {
    id: geminiResponse.id ?? `gemini_${Date.now()}`,
    type: 'message',
    role: 'assistant',
    content: contentBlocks as BetaMessage['content'],
    model: geminiModel,
    stop_reason: stopReason as BetaMessage['stop_reason'],
    stop_sequence: null,
    usage: {
      input_tokens: geminiResponse.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: geminiResponse.usageMetadata?.candidatesTokenCount ?? 0,
    },
  } as BetaMessage
}
