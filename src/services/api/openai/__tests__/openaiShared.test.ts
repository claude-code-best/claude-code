import { describe, expect, test } from 'bun:test'
import {
  getOfficialOpenAIPromptCacheKey,
  isOfficialOpenAIBaseURL,
} from '../openaiShared.js'

describe('isOfficialOpenAIBaseURL', () => {
  test('treats the SDK default endpoint as official OpenAI', () => {
    expect(isOfficialOpenAIBaseURL(undefined)).toBe(true)
    expect(isOfficialOpenAIBaseURL('')).toBe(true)
  })

  test('accepts global and regional official OpenAI endpoints', () => {
    expect(isOfficialOpenAIBaseURL('https://api.openai.com/v1')).toBe(true)
    expect(isOfficialOpenAIBaseURL('https://eu.api.openai.com/v1')).toBe(true)
    expect(isOfficialOpenAIBaseURL('https://api.openai.com:443/v1')).toBe(true)
  })

  test('rejects OpenAI-compatible and spoofed endpoints', () => {
    expect(isOfficialOpenAIBaseURL('https://api.deepseek.com/v1')).toBe(false)
    expect(isOfficialOpenAIBaseURL('http://api.openai.com/v1')).toBe(false)
    expect(isOfficialOpenAIBaseURL('https://api.openai.com.evil.test/v1')).toBe(
      false,
    )
    expect(isOfficialOpenAIBaseURL('https://api.openai.com:8443/v1')).toBe(
      false,
    )
    expect(isOfficialOpenAIBaseURL('not-a-url')).toBe(false)
  })
})

describe('getOfficialOpenAIPromptCacheKey', () => {
  test('returns a session key for the SDK default and official endpoint', () => {
    expect(getOfficialOpenAIPromptCacheKey(undefined, 'session-1')).toBe(
      'ccb:session-1',
    )
    expect(
      getOfficialOpenAIPromptCacheKey('https://api.openai.com/v1', 'session-2'),
    ).toBe('ccb:session-2')
  })

  test('returns undefined for compatible endpoints', () => {
    expect(
      getOfficialOpenAIPromptCacheKey(
        'https://api.deepseek.com/v1',
        'session-1',
      ),
    ).toBeUndefined()
  })
})
