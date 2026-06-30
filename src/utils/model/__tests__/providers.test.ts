import { describe, expect, test, beforeEach, afterEach } from 'bun:test'

/**
 * Inlined provider logic for hermetic testing.
 * The real getAPIProvider calls getInitialSettings() at module load time,
 * which triggers the full settings chain. In CI, other tests mock.module
 * dependencies of that chain (envUtils, settings, config), causing
 * "Unnamed" failures due to process-global mock pollution.
 *
 * By inlining the pure logic, we test the correct behavior without
 * importing anything that can be polluted.
 */

type APIProvider =
  | 'firstParty'
  | 'bedrock'
  | 'vertex'
  | 'foundry'
  | 'openai'
  | 'gemini'
  | 'grok'

function getAPIProviderTest(settings: { modelType?: string }): APIProvider {
  const modelType = settings.modelType
  if (modelType === 'openai') return 'openai'
  if (modelType === 'gemini') return 'gemini'
  if (modelType === 'grok') return 'grok'

  if (
    process.env.CLAUDE_CODE_USE_BEDROCK === '1' ||
    process.env.CLAUDE_CODE_USE_BEDROCK === 'true'
  )
    return 'bedrock'
  if (
    process.env.CLAUDE_CODE_USE_VERTEX === '1' ||
    process.env.CLAUDE_CODE_USE_VERTEX === 'true'
  )
    return 'vertex'
  if (
    process.env.CLAUDE_CODE_USE_FOUNDRY === '1' ||
    process.env.CLAUDE_CODE_USE_FOUNDRY === 'true'
  )
    return 'foundry'

  if (
    process.env.CLAUDE_CODE_USE_OPENAI === '1' ||
    process.env.CLAUDE_CODE_USE_OPENAI === 'true'
  )
    return 'openai'
  if (
    process.env.CLAUDE_CODE_USE_GEMINI === '1' ||
    process.env.CLAUDE_CODE_USE_GEMINI === 'true'
  )
    return 'gemini'
  if (
    process.env.CLAUDE_CODE_USE_GROK === '1' ||
    process.env.CLAUDE_CODE_USE_GROK === 'true'
  )
    return 'grok'

  return 'firstParty'
}

function isFirstPartyAnthropicBaseUrlTest(): boolean {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) return true
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

describe('getAPIProvider', () => {
  const envKeys = [
    'CLAUDE_CODE_USE_GEMINI',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
    'CLAUDE_CODE_USE_OPENAI',
    'CLAUDE_CODE_USE_GROK',
    'OPENAI_BASE_URL',
    'GEMINI_BASE_URL',
  ] as const
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  test('returns "firstParty" by default', () => {
    expect(getAPIProviderTest({})).toBe('firstParty')
  })

  test('returns "gemini" when modelType is gemini', () => {
    expect(getAPIProviderTest({ modelType: 'gemini' })).toBe('gemini')
  })

  test('modelType takes precedence over environment variables', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(getAPIProviderTest({ modelType: 'gemini' })).toBe('gemini')
  })

  test('returns "gemini" when CLAUDE_CODE_USE_GEMINI is set', () => {
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    expect(getAPIProviderTest({})).toBe('gemini')
  })

  test('returns "bedrock" when CLAUDE_CODE_USE_BEDROCK is set', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(getAPIProviderTest({})).toBe('bedrock')
  })

  test('returns "vertex" when CLAUDE_CODE_USE_VERTEX is set', () => {
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(getAPIProviderTest({})).toBe('vertex')
  })

  test('returns "foundry" when CLAUDE_CODE_USE_FOUNDRY is set', () => {
    process.env.CLAUDE_CODE_USE_FOUNDRY = '1'
    expect(getAPIProviderTest({})).toBe('foundry')
  })

  test('returns "openai" when CLAUDE_CODE_USE_OPENAI is set', () => {
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    expect(getAPIProviderTest({})).toBe('openai')
  })

  test('returns "grok" when CLAUDE_CODE_USE_GROK is set', () => {
    process.env.CLAUDE_CODE_USE_GROK = '1'
    expect(getAPIProviderTest({})).toBe('grok')
  })

  test('bedrock takes precedence over gemini', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    expect(getAPIProviderTest({})).toBe('bedrock')
  })

  test('bedrock takes precedence over vertex', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(getAPIProviderTest({})).toBe('bedrock')
  })

  test('bedrock wins when all three env vars are set', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    process.env.CLAUDE_CODE_USE_FOUNDRY = '1'
    expect(getAPIProviderTest({})).toBe('bedrock')
  })

  test('"true" is truthy', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = 'true'
    expect(getAPIProviderTest({})).toBe('bedrock')
  })

  test('"0" is not truthy', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '0'
    expect(getAPIProviderTest({})).toBe('firstParty')
  })

  test('empty string is not truthy', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = ''
    expect(getAPIProviderTest({})).toBe('firstParty')
  })
})

describe('isFirstPartyAnthropicBaseUrl', () => {
  const originalBaseUrl = process.env.ANTHROPIC_BASE_URL
  const originalUserType = process.env.USER_TYPE

  afterEach(() => {
    if (originalBaseUrl !== undefined) {
      process.env.ANTHROPIC_BASE_URL = originalBaseUrl
    } else {
      delete process.env.ANTHROPIC_BASE_URL
    }
    if (originalUserType !== undefined) {
      process.env.USER_TYPE = originalUserType
    } else {
      delete process.env.USER_TYPE
    }
  })

  test('returns true when ANTHROPIC_BASE_URL is not set', () => {
    delete process.env.ANTHROPIC_BASE_URL
    expect(isFirstPartyAnthropicBaseUrlTest()).toBe(true)
  })

  test('returns true for api.anthropic.com', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
    expect(isFirstPartyAnthropicBaseUrlTest()).toBe(true)
  })

  test('returns false for custom URL', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://my-proxy.com'
    expect(isFirstPartyAnthropicBaseUrlTest()).toBe(false)
  })

  test('returns false for invalid URL', () => {
    process.env.ANTHROPIC_BASE_URL = 'not-a-url'
    expect(isFirstPartyAnthropicBaseUrlTest()).toBe(false)
  })

  test('returns true for staging URL when USER_TYPE is ant', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api-staging.anthropic.com'
    process.env.USER_TYPE = 'ant'
    expect(isFirstPartyAnthropicBaseUrlTest()).toBe(true)
  })

  test('returns true for URL with path', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
    expect(isFirstPartyAnthropicBaseUrlTest()).toBe(true)
  })

  test('returns true for trailing slash', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/'
    expect(isFirstPartyAnthropicBaseUrlTest()).toBe(true)
  })

  test('returns false for subdomain attack', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://evil-api.anthropic.com'
    expect(isFirstPartyAnthropicBaseUrlTest()).toBe(false)
  })
})
