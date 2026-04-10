import type Anthropic from '@anthropic-ai/sdk'
import type { BetaToolUnion } from '@anthropic-ai/sdk/resources/beta/messages.js'
import OpenAI from 'openai'
import {
  getLastApiCompletionTimestamp,
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
import { getOpenAIClient } from '../services/api/openai/client.js'
import { resolveOpenAIModel } from '../services/api/openai/modelMapping.js'
import { anthropicMessagesToOpenAI } from '../services/api/openai/convertMessages.js'
import { createCoStrictFetch } from '../costrict/provider/fetch.js'
import { loadCoStrictCredentials } from '../costrict/provider/credentials.js'
import { getCoStrictBaseURL } from '../costrict/provider/auth.js'
import { resolveCoStrictModel } from '../costrict/provider/modelMapping.js'
import { getProxyFetchOptions } from './proxy.js'
import { getModelBetas, modelSupportsStructuredOutputs } from './betas.js'
import { computeFingerprint } from './fingerprint.js'
import { normalizeModelStringForAPI } from './model/model.js'
import { getAPIProvider } from './model/providers.js'

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
}

/**
 * Extract text from first user message for fingerprint computation.
 */
function extractFirstUserMessageText(messages: MessageParam[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (!firstUserMessage) return ''

  const content = firstUserMessage.content
  if (typeof content === 'string') return content

  // Array of content blocks - find first text block
  const textBlock = content.find(block => block.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
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

  // Route to appropriate provider
  const provider = getAPIProvider()
  if (provider === 'costrict') {
    return sideQueryCoStrict(opts)
  }
  if (provider === 'openai') {
    return sideQueryOpenAI(opts)
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

  // Extract first user message text for fingerprint
  const messageText = extractFirstUserMessageText(messages)

  // Compute fingerprint for OAuth attribution
  const fingerprint = computeFingerprint(messageText, MACRO.VERSION)
  const attributionHeader = getAttributionHeader(fingerprint)

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
  // biome-ignore lint/plugin: this IS the wrapper that handles OAuth attribution
  const response = await client.beta.messages.create(
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

  return response
}

/**
 * CoStrict provider implementation for sideQuery
 */
async function sideQueryCoStrict(opts: SideQueryOptions): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    max_tokens = 1024,
    signal,
    skipSystemPromptPrefix,
    temperature,
    output_format,
  } = opts

  // Build system prompt
  const systemContent = skipSystemPromptPrefix
    ? (typeof system === 'string' ? system : '')
    : `${getCLISyspromptPrefix({ isNonInteractive: false, hasAppendSystemPrompt: false })}
${typeof system === 'string' ? system : ''}`

  // Resolve model and get base URL
  const costrictModel = resolveCoStrictModel(model)
  const creds = await loadCoStrictCredentials()
  const baseUrl = getCoStrictBaseURL(creds?.base_url)
  const chatBaseURL = `${baseUrl}/chat-rag/api/v1`

  // Create OpenAI client with CoStrict custom fetch
  const costrictFetch = createCoStrictFetch()
  const client = new OpenAI({
    apiKey: 'costrict-managed',
    baseURL: chatBaseURL,
    maxRetries: 0,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({ forAnthropicAPI: false }) as RequestInit,
    fetch: costrictFetch as any,
  })

  // Convert messages to OpenAI format
  const openaiMessages = anthropicMessagesToOpenAI(
    messages.map(m => ({
      ...m,
      content: typeof m.content === 'string' ? m.content : m.content,
    })),
    systemContent,
    { enableThinking: false }
  )

  // Build request
  const requestBody: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: costrictModel,
    messages: openaiMessages,
    max_tokens: max_tokens,
    ...(temperature !== undefined && { temperature }),
  }

  // Add response_format for JSON schema if specified
  if (output_format?.type === 'json_schema') {
    (requestBody as any).response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'response',
        schema: output_format.schema,
        strict: true,
      },
    }
  }

  const start = Date.now()
  const response = await client.chat.completions.create(requestBody, { signal })

  // Convert OpenAI response to Anthropic BetaMessage format
  const choice = response.choices[0]
  const content = choice?.message?.content || ''

  const betaMessage: BetaMessage = {
    id: response.id,
    type: 'message',
    role: 'assistant',
    model: costrictModel,
    content: [{ type: 'text', text: content }],
    stop_reason: choice?.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
    },
  } as BetaMessage

  // Log analytics
  const now = Date.now()
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId: response.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource: opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model: costrictModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    cachedInputTokens: 0,
    uncachedInputTokens: 0,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs: lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)

  return betaMessage
}

/**
 * OpenAI provider implementation for sideQuery
 */
async function sideQueryOpenAI(opts: SideQueryOptions): Promise<BetaMessage> {
  const {
    model,
    system,
    messages,
    max_tokens = 1024,
    signal,
    skipSystemPromptPrefix,
    temperature,
    output_format,
  } = opts

  // Build system prompt
  const systemContent = skipSystemPromptPrefix
    ? (typeof system === 'string' ? system : '')
    : `${getCLISyspromptPrefix({ isNonInteractive: false, hasAppendSystemPrompt: false })}
${typeof system === 'string' ? system : ''}`

  // Resolve model
  const openaiModel = resolveOpenAIModel(model)

  // Get OpenAI client
  const client = getOpenAIClient({ maxRetries: 0, source: 'side_query' })

  // Convert messages to OpenAI format
  const openaiMessages = anthropicMessagesToOpenAI(
    messages.map(m => ({
      ...m,
      content: typeof m.content === 'string' ? m.content : m.content,
    })),
    systemContent,
    { enableThinking: false }
  )

  // Build request
  const requestBody: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: openaiModel,
    messages: openaiMessages,
    max_tokens: max_tokens,
    ...(temperature !== undefined && { temperature }),
  }

  // Add response_format for JSON schema if specified
  if (output_format?.type === 'json_schema') {
    (requestBody as any).response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'response',
        schema: output_format.schema,
        strict: true,
      },
    }
  }

  const start = Date.now()
  const response = await client.chat.completions.create(requestBody, { signal })

  // Convert OpenAI response to Anthropic BetaMessage format
  const choice = response.choices[0]
  const content = choice?.message?.content || ''

  const betaMessage: BetaMessage = {
    id: response.id,
    type: 'message',
    role: 'assistant',
    model: openaiModel,
    content: [{ type: 'text', text: content }],
    stop_reason: choice?.finish_reason === 'stop' ? 'end_turn' : 'max_tokens',
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
    },
  } as BetaMessage

  // Log analytics
  const now = Date.now()
  const lastCompletion = getLastApiCompletionTimestamp()
  logEvent('tengu_api_success', {
    requestId: response.id as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    querySource: opts.querySource as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    model: openaiModel as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    cachedInputTokens: 0,
    uncachedInputTokens: 0,
    durationMsIncludingRetries: now - start,
    timeSinceLastApiCallMs: lastCompletion !== null ? now - lastCompletion : undefined,
  })
  setLastApiCompletionTimestamp(now)

  return betaMessage
}
