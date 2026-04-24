import { describe, test, expect, beforeEach } from 'bun:test'
import { anthropicAdapter } from '../adapters/anthropic.js'
import { openaiAdapter } from '../adapters/openai.js'
import { bedrockAdapter } from '../adapters/bedrock.js'
import {
  getProviderUsage,
  resetProviderUsage,
  setProviderBalance,
  subscribeProviderUsage,
  updateProviderBuckets,
} from '../store.js'

function headers(pairs: Record<string, string>): Headers {
  const h = new Headers()
  for (const [k, v] of Object.entries(pairs)) h.set(k, v)
  return h
}

describe('anthropicAdapter', () => {
  test('parses both 5h and 7d buckets', () => {
    const h = headers({
      'anthropic-ratelimit-unified-5h-utilization': '0.42',
      'anthropic-ratelimit-unified-5h-reset': '1800000000',
      'anthropic-ratelimit-unified-7d-utilization': '0.1',
      'anthropic-ratelimit-unified-7d-reset': '1800100000',
    })
    const out = anthropicAdapter.parseHeaders(h)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      kind: 'session',
      label: 'Session',
      utilization: 0.42,
      resetsAt: 1800000000,
    })
    expect(out[1]).toMatchObject({
      kind: 'weekly',
      label: 'Weekly',
      utilization: 0.1,
      resetsAt: 1800100000,
    })
  })

  test('returns [] when headers absent (API key user)', () => {
    expect(anthropicAdapter.parseHeaders(new Headers())).toEqual([])
  })

  test('drops bucket with non-numeric utilization', () => {
    const h = headers({
      'anthropic-ratelimit-unified-5h-utilization': 'xx',
      'anthropic-ratelimit-unified-5h-reset': '0',
    })
    expect(anthropicAdapter.parseHeaders(h)).toEqual([])
  })
})

describe('openaiAdapter', () => {
  test('computes RPM and TPM utilization from limit+remaining', () => {
    const h = headers({
      'x-ratelimit-limit-requests': '1000',
      'x-ratelimit-remaining-requests': '250',
      'x-ratelimit-limit-tokens': '100000',
      'x-ratelimit-remaining-tokens': '25000',
      'x-ratelimit-reset-requests': '6m',
    })
    const out = openaiAdapter.parseHeaders(h)
    expect(out).toHaveLength(2)
    expect(out[0].kind).toBe('requests')
    expect(out[0].label).toBe('RPM')
    expect(out[0].utilization).toBeCloseTo(0.75, 5)
    expect(out[1].kind).toBe('tokens')
    expect(out[1].utilization).toBeCloseTo(0.75, 5)
  })

  test('returns [] when no relevant headers', () => {
    expect(openaiAdapter.parseHeaders(new Headers())).toEqual([])
  })
})

describe('bedrockAdapter', () => {
  test('inverts quota-remaining into utilization', () => {
    const h = headers({
      'x-amzn-bedrock-quota-remaining': '0.3',
      'x-amzn-bedrock-quota-reset': '1800000000',
    })
    const out = bedrockAdapter.parseHeaders(h)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('throttle')
    expect(out[0].utilization).toBeCloseTo(0.7, 5)
    expect(out[0].resetsAt).toBe(1800000000)
  })

  test('returns [] without header', () => {
    expect(bedrockAdapter.parseHeaders(new Headers())).toEqual([])
  })
})

describe('providerUsage store', () => {
  beforeEach(() => {
    resetProviderUsage()
  })

  test('updateProviderBuckets replaces buckets and notifies', () => {
    const seen: string[] = []
    const unsub = subscribeProviderUsage(u => seen.push(u.providerId))
    updateProviderBuckets('openai', [
      { kind: 'tokens', label: 'TPM', utilization: 0.5 },
    ])
    expect(getProviderUsage().providerId).toBe('openai')
    expect(getProviderUsage().buckets).toHaveLength(1)
    expect(seen).toEqual(['openai'])
    unsub()
  })

  test('setProviderBalance stores and clears', () => {
    setProviderBalance('deepseek', { currency: 'USD', remaining: 3.5 })
    expect(getProviderUsage().balance?.remaining).toBe(3.5)
    setProviderBalance('deepseek', null)
    expect(getProviderUsage().balance).toBeUndefined()
  })
})
