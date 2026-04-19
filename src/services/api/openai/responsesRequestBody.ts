import { createHash } from 'crypto'
import { getProjectRoot } from 'src/bootstrap/state.js'
import type { EffortValue } from '../../../utils/effort.js'

export type OpenAIResponsesReasoningEffort =
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'

export function buildOpenAIResponsesRequestBody(params: {
  model: string
  instructions: string
  input: unknown[]
  tools: unknown[]
  toolChoice: unknown
  maxTokens: number
  effort: EffortValue | undefined
  temperatureOverride?: number
}): Record<string, unknown> {
  const {
    model,
    instructions,
    input,
    tools,
    toolChoice,
    maxTokens,
    effort,
    temperatureOverride,
  } = params

  const reasoningEffort = mapEffortToOpenAIResponses(effort)

  return {
    model,
    instructions,
    input,
    store: false,
    stream: true,
    include: ['reasoning.encrypted_content'],
    max_output_tokens: maxTokens,
    prompt_cache_key: buildOpenAIPromptCacheKey(model),
    prompt_cache_retention: getOpenAIPromptCacheRetention(model),
    reasoning: {
      effort: reasoningEffort,
    },
    ...(tools.length > 0 && {
      tools,
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    }),
    ...(temperatureOverride !== undefined && { temperature: temperatureOverride }),
  }
}

export function buildOpenAIPromptCacheKey(
  model: string,
  baseURL = process.env.OPENAI_BASE_URL,
): string {
  const host = getProviderHost(baseURL)
  const projectRoot = getProjectRoot()
  const fingerprint = `${host}|${model}|${projectRoot}`
  const digest = createHash('sha256').update(fingerprint).digest('hex')
  return `ccb:${digest}`
}

export function getOpenAIPromptCacheRetention(model: string): 'in_memory' | '24h' {
  const explicit = process.env.OPENAI_PROMPT_CACHE_RETENTION?.trim().toLowerCase()
  if (explicit === '24h') return '24h'
  if (explicit === 'in_memory') return 'in_memory'

  return model.toLowerCase().includes('gpt-5.4') ? '24h' : 'in_memory'
}

export function mapEffortToOpenAIResponses(
  effort: EffortValue | undefined,
): OpenAIResponsesReasoningEffort {
  switch (effort) {
    case 'low':
      return 'low'
    case 'medium':
      return 'medium'
    case 'max':
      return 'xhigh'
    case 'high':
    default:
      return 'high'
  }
}

function getProviderHost(baseURL = process.env.OPENAI_BASE_URL): string {
  if (!baseURL) return 'api.openai.com'
  try {
    const url = new URL(baseURL)
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return baseURL.replace(/\/+$/, '')
  }
}
