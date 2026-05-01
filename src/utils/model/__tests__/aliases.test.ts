import { describe, expect, test } from 'bun:test'
import { isModelAlias, isModelFamilyAlias } from '../aliases'

describe('isModelAlias', () => {
  test('returns true for "sonnet"', () => {
    expect(isModelAlias('sonnet')).toBe(true)
  })

  test('returns true for "opus"', () => {
    expect(isModelAlias('opus')).toBe(true)
  })

  test('returns true for "haiku"', () => {
    expect(isModelAlias('haiku')).toBe(true)
  })

  test('returns true for "best"', () => {
    expect(isModelAlias('best')).toBe(true)
  })

  test('returns true for "sonnet[1m]"', () => {
    expect(isModelAlias('sonnet[1m]')).toBe(true)
  })

  test('returns true for "opus[1m]"', () => {
    expect(isModelAlias('opus[1m]')).toBe(true)
  })

  test('returns true for "opusplan"', () => {
    expect(isModelAlias('opusplan')).toBe(true)
  })

  test('returns false for full model ID', () => {
    expect(isModelAlias('claude-sonnet-4-6-20250514')).toBe(false)
  })

  test('returns false for unknown string', () => {
    expect(isModelAlias('gpt-4')).toBe(false)
  })

  test('is case-sensitive', () => {
    expect(isModelAlias('Sonnet')).toBe(false)
  })
})

describe('isModelFamilyAlias', () => {
  test('returns true for "sonnet"', () => {
    expect(isModelFamilyAlias('sonnet')).toBe(true)
  })

  test('returns true for "opus"', () => {
    expect(isModelFamilyAlias('opus')).toBe(true)
  })

  test('returns true for "haiku"', () => {
    expect(isModelFamilyAlias('haiku')).toBe(true)
  })

  test('returns false for "best"', () => {
    expect(isModelFamilyAlias('best')).toBe(false)
  })

  test('returns false for "opusplan"', () => {
    expect(isModelFamilyAlias('opusplan')).toBe(false)
  })

  test('returns false for "sonnet[1m]"', () => {
    expect(isModelFamilyAlias('sonnet[1m]')).toBe(false)
  })
})
