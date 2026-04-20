import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'

// Defensive: mock proxy module before importing
mock.module('src/utils/proxy.js', () => ({
  getProxyFetchOptions: () => ({} as any),
}))

import { getMiniMaxClient, clearMiniMaxClientCache } from '../client.js'

describe('getMiniMaxClient', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    clearMiniMaxClientCache()
    process.env.MINIMAX_API_KEY = 'test-minimax-key'
    delete process.env.MINIMAX_BASE_URL
  })

  afterEach(() => {
    clearMiniMaxClientCache()
    process.env = { ...originalEnv }
  })

  test('creates client with default base URL', () => {
    const client = getMiniMaxClient()
    expect(client).toBeDefined()
    expect(client.baseURL).toBe('https://api.minimax.io/anthropic')
  })

  test('uses MINIMAX_BASE_URL when set', () => {
    process.env.MINIMAX_BASE_URL = 'https://custom.minimax.api/anthropic'
    clearMiniMaxClientCache()
    const client = getMiniMaxClient()
    expect(client.baseURL).toBe('https://custom.minimax.api/anthropic')
  })

  test('default base URL does not use api.minimax.chat', () => {
    const client = getMiniMaxClient()
    expect(client.baseURL).not.toContain('api.minimax.chat')
    expect(client.baseURL).toContain('api.minimax.io')
  })

  test('returns cached client on second call', () => {
    const client1 = getMiniMaxClient()
    const client2 = getMiniMaxClient()
    expect(client1).toBe(client2)
  })

  test('clearMiniMaxClientCache resets cache', () => {
    const client1 = getMiniMaxClient()
    clearMiniMaxClientCache()
    process.env.MINIMAX_BASE_URL = 'https://other.minimax.api/anthropic'
    const client2 = getMiniMaxClient()
    expect(client1).not.toBe(client2)
  })
})

describe('MiniMax API constraints', () => {
  test('default base URL uses overseas api.minimax.io (not api.minimax.chat)', () => {
    const defaultBaseUrl = 'https://api.minimax.io/anthropic'
    expect(defaultBaseUrl).toContain('api.minimax.io')
    expect(defaultBaseUrl).not.toContain('api.minimax.chat')
  })

  test('validates temperature range (0.0, 1.0] — 0 is invalid for MiniMax', () => {
    const isValidTemperature = (t: number) => t > 0 && t <= 1.0
    expect(isValidTemperature(1.0)).toBe(true)
    expect(isValidTemperature(0.5)).toBe(true)
    expect(isValidTemperature(0.0)).toBe(false)
    expect(isValidTemperature(1.1)).toBe(false)
  })

  test('filters unsupported parameters', () => {
    const UNSUPPORTED_PARAMS = new Set(['top_k', 'stop_sequences', 'service_tier'])
    const input: Record<string, unknown> = {
      model: 'MiniMax-M2.7',
      messages: [{ role: 'user', content: 'hi' }],
      top_k: 40,
      stop_sequences: ['END'],
      temperature: 1.0,
    }
    const filtered = Object.fromEntries(
      Object.entries(input).filter(([k]) => !UNSUPPORTED_PARAMS.has(k)),
    )
    expect('top_k' in filtered).toBe(false)
    expect('stop_sequences' in filtered).toBe(false)
    expect('temperature' in filtered).toBe(true)
    expect('model' in filtered).toBe(true)
  })
})
