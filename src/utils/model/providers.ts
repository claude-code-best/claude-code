import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../services/analytics/index.js'
import { getInitialSettings } from '../settings/settings.js'
import { isEnvTruthy } from '../envUtils.js'

export type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'openai'
  | 'gemini'
  | 'grok'
  | 'costrict'

export function getAPIProvider(): APIProvider {
  const modelType = getInitialSettings().modelType
  if (modelType === 'openai') return 'openai'
  if (modelType === 'gemini') return 'gemini'
  if (modelType === 'grok') return 'grok'
  if (modelType === 'costrict') return 'costrict'

  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK)) return 'bedrock'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) return 'vertex'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) return 'foundry'

  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_OPENAI)) return 'openai'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_GEMINI)) return 'gemini'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_GROK)) return 'grok'
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_COSTRICT)) return 'costrict'

  return 'firstParty'
}

export function getAPIProviderForStatsig(): AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS {
  return getAPIProvider() as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
}

/**
 * Get a human-readable display name for the current API provider
 */
export function getProviderDisplayName(provider: APIProvider): string {
  switch (provider) {
    case 'firstParty':
      return 'Anthropic'
    case 'bedrock':
      return 'AWS Bedrock'
    case 'vertex':
      return 'Google Vertex'
    case 'foundry':
      return 'Foundry'
    case 'openai':
      return 'OpenAI'
    case 'gemini':
      return 'Google Gemini'
    case 'grok':
      return 'xAI Grok'
    case 'costrict':
      return 'CoStrict'
    default:
      return provider
  }
}

/**
 * Check if ANTHROPIC_BASE_URL is a first-party Anthropic API URL.
 * Returns true if not set (default API) or points to api.anthropic.com
 * (or api-staging.anthropic.com for ant users).
 */
export function isFirstPartyAnthropicBaseUrl(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  // TODO: 这里会有问题, 只配置了 openai 协议的用户, 按理说会为 true 导致问题
  if (!baseUrl) {
    return true
  }
  try {
    const host = new URL(baseUrl).host
    const allowedHosts = ['api.anthropic.com']
    if (process.env.USER_TYPE === 'ant') {
      allowedHosts.push('api-staging.anthropic.com')
    }
    return allowedHosts.includes(host)
  } catch {
    return false
  }
}
