import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { get3PModelCapabilityOverride } from '../modelSupportOverrides.js'

const ENV_KEYS = [
  'CLAUDE_CODE_USE_OPENAI',
  'OPENAI_DEFAULT_SONNET_MODEL',
  'OPENAI_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES',
] as const

const savedEnv: Record<string, string | undefined> = {}

describe('get3PModelCapabilityOverride', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
    process.env.CLAUDE_CODE_USE_OPENAI = '1'
    process.env.OPENAI_DEFAULT_SONNET_MODEL = 'cache-test-model'
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  test('re-evaluates capabilities after environment changes', () => {
    process.env.OPENAI_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES = 'thinking'
    expect(get3PModelCapabilityOverride('cache-test-model', 'thinking')).toBe(
      true,
    )

    process.env.OPENAI_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES = ''
    expect(get3PModelCapabilityOverride('cache-test-model', 'thinking')).toBe(
      false,
    )
  })
})
