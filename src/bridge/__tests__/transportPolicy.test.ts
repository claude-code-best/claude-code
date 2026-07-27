import { describe, expect, test } from 'bun:test'
import { shouldUseCcrV2ForSession } from '../transportPolicy.js'

describe('bridge transport policy', () => {
  test('forces Code sessions onto CCR without flags', () => {
    expect(shouldUseCcrV2ForSession('code', false, false)).toBe(true)
  })

  test('keeps Chat legacy-compatible unless CCR is explicitly enabled', () => {
    expect(shouldUseCcrV2ForSession('chat', false, false)).toBe(false)
    expect(shouldUseCcrV2ForSession('chat', true, false)).toBe(true)
    expect(shouldUseCcrV2ForSession('chat', false, true)).toBe(true)
  })
})
