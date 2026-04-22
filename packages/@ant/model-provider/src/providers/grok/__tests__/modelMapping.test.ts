import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { resolveGrokModel } from '../modelMapping.js'

describe('resolveGrokModel', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.GROK_MODEL
    delete process.env.GROK_MODEL_MAP
    delete process.env.GROK_DEFAULT_SONNET_MODEL
    delete process.env.GROK_DEFAULT_OPUS_MODEL
    delete process.env.GROK_DEFAULT_HAIKU_MODEL
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

  test('maps opus models to grok-4.20-reasoning', () => {
    expect(resolveGrokModel('claude-opus-4-6')).toBe('grok-4.20-reasoning')
  })

  test('maps sonnet models to grok-3-mini-fast', () => {
    expect(resolveGrokModel('claude-sonnet-4-6')).toBe('grok-3-mini-fast')
  })

  test('maps haiku models to grok-3-mini-fast', () => {
    expect(resolveGrokModel('claude-haiku-4-5-20251001')).toBe(
      'grok-3-mini-fast',
    )
  })

  test('GROK_MODEL_MAP overrides family mapping', () => {
    process.env.GROK_MODEL_MAP =
      '{"opus":"grok-4","sonnet":"grok-3","haiku":"grok-mini"}'
    expect(resolveGrokModel('claude-opus-4-6')).toBe('grok-4')
    expect(resolveGrokModel('claude-sonnet-4-6')).toBe('grok-3')
    expect(resolveGrokModel('claude-haiku-4-5-20251001')).toBe('grok-mini')
  })

  test('GROK_MODEL_MAP ignores invalid JSON', () => {
    process.env.GROK_MODEL_MAP = 'not-json'
    expect(resolveGrokModel('claude-opus-4-6')).toBe('grok-4.20-reasoning')
  })

  test('GROK_DEFAULT_{FAMILY}_MODEL overrides default map', () => {
    process.env.GROK_DEFAULT_OPUS_MODEL = 'grok-2-latest'
    expect(resolveGrokModel('claude-opus-4-6')).toBe('grok-2-latest')
  })

  test('passes through unknown model names', () => {
    expect(resolveGrokModel('some-unknown-model')).toBe('some-unknown-model')
  })

  test('strips [1m] suffix before lookup', () => {
    expect(resolveGrokModel('claude-sonnet-4-6[1m]')).toBe('grok-3-mini-fast')
  })

  test('falls back to family default for unlisted model', () => {
    expect(resolveGrokModel('claude-opus-99-20300101')).toBe(
      'grok-4.20-reasoning',
    )
  })
})
