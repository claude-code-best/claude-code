import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { mock } from 'bun:test'

let mockedModelType: 'gemini' | undefined

mock.module('../../settings/settings.js', () => ({
  getInitialSettings: () =>
    mockedModelType ? { modelType: mockedModelType } : {},
}))

const { getAPIProvider, isFirstPartyAnthropicBaseUrl } = await import(
  '../providers'
)

describe('getAPIProvider', () => {
  const envKeys = [
    'CLAUDE_CODE_USE_GEMINI',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDE_CODE_USE_VERTEX',
    'CLAUDE_CODE_USE_FOUNDRY',
    'CLAUDE_CODE_USE_OPENAI',
  ] as const
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    // Save and clear environment variables
    mockedModelType = undefined
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    // Restore environment variables
    mockedModelType = undefined
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  test('returns "firstParty" by default', () => {
    expect(getAPIProvider()).toBe('firstParty')
  })

  test('returns "gemini" when modelType is gemini', () => {
    mockedModelType = 'gemini'
    expect(getAPIProvider()).toBe('gemini')
  })

  test('modelType takes precedence over environment variables', () => {
    mockedModelType = 'gemini'
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(getAPIProvider()).toBe('gemini')
  })

  test('returns "gemini" when CLAUDE_CODE_USE_GEMINI is set', () => {
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    expect(getAPIProvider()).toBe('gemini')
  })

  test('returns "bedrock" when CLAUDE_CODE_USE_BEDROCK is set', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(getAPIProvider()).toBe('bedrock')
  })

  test('returns "vertex" when CLAUDE_CODE_USE_VERTEX is set', () => {
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(getAPIProvider()).toBe('vertex')
  })

  test('returns "foundry" when CLAUDE_CODE_USE_FOUNDRY is set', () => {
    process.env.CLAUDE_CODE_USE_FOUNDRY = '1'
    expect(getAPIProvider()).toBe('foundry')
  })

  test('bedrock takes precedence over gemini', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.CLAUDE_CODE_USE_GEMINI = '1'
    expect(getAPIProvider()).toBe('bedrock')
  })

  test('bedrock takes precedence over vertex', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(getAPIProvider()).toBe('bedrock')
  })

  test('bedrock wins when all three env vars are set', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    process.env.CLAUDE_CODE_USE_FOUNDRY = '1'
    expect(getAPIProvider()).toBe('bedrock')
  })

  test('"true" is truthy', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = 'true'
    expect(getAPIProvider()).toBe('bedrock')
  })

  test('"0" is not truthy', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '0'
    expect(getAPIProvider()).toBe('firstParty')
  })

  test('empty string is not truthy', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = ''
    expect(getAPIProvider()).toBe('firstParty')
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
    expect(isFirstPartyAnthropicBaseUrl()).toBe(true)
  })

  test('returns true for api.anthropic.com', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com'
    expect(isFirstPartyAnthropicBaseUrl()).toBe(true)
  })

  test('returns false for custom URL', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://my-proxy.com'
    expect(isFirstPartyAnthropicBaseUrl()).toBe(false)
  })

  test('returns false for invalid URL', () => {
    process.env.ANTHROPIC_BASE_URL = 'not-a-url'
    expect(isFirstPartyAnthropicBaseUrl()).toBe(false)
  })

  test('returns true for staging URL when USER_TYPE is ant', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api-staging.anthropic.com'
    process.env.USER_TYPE = 'ant'
    expect(isFirstPartyAnthropicBaseUrl()).toBe(true)
  })

  test('returns true for URL with path', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1'
    expect(isFirstPartyAnthropicBaseUrl()).toBe(true)
  })

  test('returns true for trailing slash', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com/'
    expect(isFirstPartyAnthropicBaseUrl()).toBe(true)
  })

  test('returns false for subdomain attack', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://evil-api.anthropic.com'
    expect(isFirstPartyAnthropicBaseUrl()).toBe(false)
  })
})
