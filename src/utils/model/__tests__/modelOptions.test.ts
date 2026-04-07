import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mock } from 'bun:test'

let mockedModelType: 'openai' | 'gemini' | undefined

mock.module('../../settings/settings.js', () => ({
  getInitialSettings: () =>
    mockedModelType ? { modelType: mockedModelType } : {},
  getSettings_DEPRECATED: () => ({}),
  getSettingsForSource: () => ({}),
  updateSettingsForSource: () => {},
}))

const { getModelOptions } = await import('../modelOptions.js')

describe('getModelOptions', () => {
  const envKeys = [
    'ANTHROPIC_API_KEY',
    'OPENAI_MODEL',
    'OPENAI_DEFAULT_SONNET_MODEL',
    'OPENAI_DEFAULT_OPUS_MODEL',
    'OPENAI_DEFAULT_HAIKU_MODEL',
    'GEMINI_MODEL',
    'GEMINI_DEFAULT_SONNET_MODEL',
    'GEMINI_DEFAULT_OPUS_MODEL',
    'GEMINI_DEFAULT_HAIKU_MODEL',
  ] as const
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    mockedModelType = undefined
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  afterEach(() => {
    mockedModelType = undefined
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  test('shows resolved OpenAI model names in labels', () => {
    mockedModelType = 'openai'
    process.env.OPENAI_DEFAULT_SONNET_MODEL = 'gpt-5.4'
    process.env.OPENAI_DEFAULT_OPUS_MODEL = 'o3'
    process.env.OPENAI_DEFAULT_HAIKU_MODEL = 'gpt-4o-mini'

    const options = getModelOptions(false)

    expect(options.some(option => option.label === 'gpt-5.4')).toBe(true)
    expect(options.some(option => option.label === 'o3')).toBe(true)
    expect(options.some(option => option.label === 'gpt-4o-mini')).toBe(true)
  })

  test('shows forced OpenAI override model in labels when OPENAI_MODEL is set', () => {
    mockedModelType = 'openai'
    process.env.OPENAI_MODEL = 'gpt-5.4'

    const options = getModelOptions(false)

    expect(options.some(option => option.label === 'gpt-5.4 (Sonnet)')).toBe(
      true,
    )
    expect(options.some(option => option.label === 'gpt-5.4 (Opus 4.1)')).toBe(
      true,
    )
  })

  test('shows resolved Gemini model names in labels', () => {
    mockedModelType = 'gemini'
    process.env.GEMINI_DEFAULT_SONNET_MODEL = 'gemini-2.5-flash'
    process.env.GEMINI_DEFAULT_OPUS_MODEL = 'gemini-2.5-pro'
    process.env.GEMINI_DEFAULT_HAIKU_MODEL = 'gemini-2.5-flash-lite'

    const options = getModelOptions(false)

    expect(options.some(option => option.label === 'gemini-2.5-flash')).toBe(
      true,
    )
    expect(options.some(option => option.label === 'gemini-2.5-pro')).toBe(true)
    expect(
      options.some(option => option.label === 'gemini-2.5-flash-lite'),
    ).toBe(true)
  })
})
