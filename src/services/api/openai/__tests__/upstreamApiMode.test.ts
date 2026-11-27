import { describe, expect, test } from 'bun:test'
import { getUpstreamApiMode } from '../upstreamApiMode.js'

describe('getUpstreamApiMode', () => {
  test('defaults to chat_completions when unset', () => {
    expect(getUpstreamApiMode(undefined)).toBe('chat_completions')
  })

  test('selects responses when explicitly configured', () => {
    expect(getUpstreamApiMode('responses')).toBe('responses')
  })

  test('rejects an unsupported protocol mode', () => {
    expect(() => getUpstreamApiMode('completion')).toThrow(
      'Invalid UPSTREAM_API_MODEL: completion. Expected "chat_completions" or "responses".',
    )
  })
})
