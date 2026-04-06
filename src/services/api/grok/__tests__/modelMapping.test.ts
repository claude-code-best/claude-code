import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { resolveGrokModel } from '../modelMapping.js'

describe('resolveGrokModel', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.GROK_MODEL
    delete process.env.ANTHROPIC_DEFAULT_SONNET_MODEL
    delete process.env.ANTHROPIC_DEFAULT_OPUS_MODEL
    delete process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  test('GROK_MODEL env var takes highest priority', () => {
    process.env.GROK_MODEL = 'grok-custom'
    expect(resolveGrokModel('claude-sonnet-4-6')).toBe('grok-custom')
  })

  test('maps sonnet models to grok-3', () => {
    expect(resolveGrokModel('claude-sonnet-4-6')).toBe('grok-3')
  })

  test('maps opus models to grok-3', () => {
    expect(resolveGrokModel('claude-opus-4-6')).toBe('grok-3')
  })

  test('maps haiku models to grok-3-mini', () => {
    expect(resolveGrokModel('claude-haiku-4-5-20251001')).toBe('grok-3-mini')
  })

  test('ANTHROPIC_DEFAULT_SONNET_MODEL overrides default map', () => {
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'grok-2'
    expect(resolveGrokModel('claude-sonnet-4-6')).toBe('grok-2')
  })

  test('passes through unknown model names', () => {
    expect(resolveGrokModel('some-unknown-model')).toBe('some-unknown-model')
  })

  test('strips [1m] suffix before lookup', () => {
    expect(resolveGrokModel('claude-sonnet-4-6[1m]')).toBe('grok-3')
  })
})
