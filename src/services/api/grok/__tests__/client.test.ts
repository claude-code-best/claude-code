import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test'

// Defensive: agent.test.ts can corrupt Bun's src/* path alias at runtime.
mock.module('src/utils/proxy.js', () => ({
  getProxyFetchOptions: () => ({}) as any,
}))

import { getGrokClient, clearGrokClientCache } from '../client.js'

describe('getGrokClient', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    clearGrokClientCache()
    process.env.GROK_API_KEY = 'test-key'
    delete process.env.GROK_BASE_URL
  })

  afterEach(() => {
    clearGrokClientCache()
    process.env = { ...originalEnv }
  })

  test('creates client with default base URL', () => {
    const client = getGrokClient()
    expect(client).toBeDefined()
    expect(client.baseURL).toBe('https://api.x.ai/v1')
  })

  test('uses GROK_BASE_URL when set', () => {
    process.env.GROK_BASE_URL = 'https://custom.grok.api/v1'
    clearGrokClientCache()
    const client = getGrokClient()
    expect(client.baseURL).toBe('https://custom.grok.api/v1')
  })

  test('returns cached client on second call', () => {
    const client1 = getGrokClient()
    const client2 = getGrokClient()
    expect(client1).toBe(client2)
  })

  test('clearGrokClientCache resets cache', () => {
    const client1 = getGrokClient()
    clearGrokClientCache()
    process.env.GROK_BASE_URL = 'https://other.api/v1'
    const client2 = getGrokClient()
    expect(client1).not.toBe(client2)
  })
})
