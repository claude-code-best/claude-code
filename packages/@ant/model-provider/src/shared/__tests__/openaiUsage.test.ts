import { describe, expect, test } from 'bun:test'
import { normalizeOpenAIUsage } from '../openaiUsage.js'

describe('normalizeOpenAIUsage', () => {
  test('partitions total input into ordinary, cache-read, and cache-write tokens', () => {
    expect(
      normalizeOpenAIUsage({
        totalInputTokens: 1000,
        outputTokens: 50,
        cacheReadTokens: 600,
        cacheWriteTokens: 250,
      }),
    ).toEqual({
      input_tokens: 150,
      output_tokens: 50,
      cache_creation_input_tokens: 250,
      cache_read_input_tokens: 600,
    })
  })

  test('clamps overlapping cache segments to the total input', () => {
    expect(
      normalizeOpenAIUsage({
        totalInputTokens: 5000,
        outputTokens: 10,
        cacheReadTokens: 4000,
        cacheWriteTokens: 4000,
      }),
    ).toEqual({
      input_tokens: 0,
      output_tokens: 10,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 4000,
    })
  })

  test('clamps negative provider values to zero', () => {
    expect(
      normalizeOpenAIUsage({
        totalInputTokens: -1,
        outputTokens: -2,
        cacheReadTokens: -3,
        cacheWriteTokens: -4,
      }),
    ).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    })
  })
})
