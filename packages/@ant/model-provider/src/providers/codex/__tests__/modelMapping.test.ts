import { describe, expect, test, beforeEach, afterEach } from 'bun:test'
import { resolveCodexModel } from '../modelMapping.js'

describe('resolveCodexModel', () => {
  const originalEnv = {
    CODEX_MODEL: process.env.CODEX_MODEL,
    CODEX_DEFAULT_HAIKU_MODEL: process.env.CODEX_DEFAULT_HAIKU_MODEL,
    CODEX_DEFAULT_SONNET_MODEL: process.env.CODEX_DEFAULT_SONNET_MODEL,
    CODEX_DEFAULT_OPUS_MODEL: process.env.CODEX_DEFAULT_OPUS_MODEL,
  }

  beforeEach(() => {
    delete process.env.CODEX_MODEL
    delete process.env.CODEX_DEFAULT_HAIKU_MODEL
    delete process.env.CODEX_DEFAULT_SONNET_MODEL
    delete process.env.CODEX_DEFAULT_OPUS_MODEL
  })

  afterEach(() => {
    Object.assign(process.env, originalEnv)
  })

  test('CODEX_MODEL env var overrides all', () => {
    process.env.CODEX_MODEL = 'my-custom-model'
    expect(resolveCodexModel('claude-sonnet-4-6')).toBe('my-custom-model')
  })

  test('CODEX_DEFAULT_SONNET_MODEL overrides default map', () => {
    process.env.CODEX_DEFAULT_SONNET_MODEL = 'my-sonnet'
    expect(resolveCodexModel('claude-sonnet-4-6')).toBe('my-sonnet')
  })

  test('CODEX_DEFAULT_HAIKU_MODEL overrides default map', () => {
    process.env.CODEX_DEFAULT_HAIKU_MODEL = 'my-haiku'
    expect(resolveCodexModel('claude-haiku-4-5-20251001')).toBe('my-haiku')
  })

  test('CODEX_DEFAULT_OPUS_MODEL overrides default map', () => {
    process.env.CODEX_DEFAULT_OPUS_MODEL = 'my-opus'
    expect(resolveCodexModel('claude-opus-4-6')).toBe('my-opus')
  })

  test('maps known sonnet model via DEFAULT_MODEL_MAP', () => {
    expect(resolveCodexModel('claude-sonnet-4-6')).toBe('gpt-5.4-mini')
  })

  test('maps known haiku model via DEFAULT_MODEL_MAP', () => {
    expect(resolveCodexModel('claude-haiku-4-5-20251001')).toBe('gpt-5.4-mini')
  })

  test('maps known opus model via DEFAULT_MODEL_MAP', () => {
    expect(resolveCodexModel('claude-opus-4-6')).toBe('gpt-5.4')
  })

  test('maps legacy sonnet models', () => {
    expect(resolveCodexModel('claude-sonnet-4-20250514')).toBe('gpt-5.4-mini')
    expect(resolveCodexModel('claude-3-5-sonnet-20241022')).toBe('gpt-5.4-mini')
  })

  test('maps legacy haiku models', () => {
    expect(resolveCodexModel('claude-3-5-haiku-20241022')).toBe('gpt-5.4-mini')
  })

  test('maps legacy opus models', () => {
    expect(resolveCodexModel('claude-opus-4-20250514')).toBe('gpt-5.4')
    expect(resolveCodexModel('claude-opus-4-5-20251101')).toBe('gpt-5.4')
  })

  test('uses family default for unrecognized haiku model', () => {
    expect(resolveCodexModel('claude-haiku-99')).toBe('gpt-5.4-mini')
  })

  test('uses family default for unrecognized sonnet model', () => {
    expect(resolveCodexModel('claude-sonnet-99')).toBe('gpt-5.4-mini')
  })

  test('uses family default for unrecognized opus model', () => {
    expect(resolveCodexModel('claude-opus-99')).toBe('gpt-5.4')
  })

  test('passes through unknown model name without family', () => {
    expect(resolveCodexModel('some-random-model')).toBe('some-random-model')
  })

  test('strips [1m] suffix', () => {
    expect(resolveCodexModel('claude-sonnet-4-6[1m]')).toBe('gpt-5.4-mini')
  })

  test('CODEX_MODEL takes precedence over family-specific vars', () => {
    process.env.CODEX_MODEL = 'global-override'
    process.env.CODEX_DEFAULT_SONNET_MODEL = 'family-override'
    expect(resolveCodexModel('claude-sonnet-4-6')).toBe('global-override')
  })
})
