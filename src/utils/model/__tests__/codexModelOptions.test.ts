import { afterEach, describe, expect, test } from 'bun:test'

const { getModelOptions } = await import('../modelOptions.js')
const { getDefaultSonnetModel } = await import('../model.js')

describe('Codex model options', () => {
  const savedEnv = {
    CLAUDE_CODE_USE_CODEX: process.env.CLAUDE_CODE_USE_CODEX,
    CODEX_MODEL: process.env.CODEX_MODEL,
    OPENAI_AUTH_MODE: process.env.OPENAI_AUTH_MODE,
    CODEX_AUTH_MODE: process.env.CODEX_AUTH_MODE,
  }

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  test('shows GPT Codex models even when CODEX_MODEL sets a custom default', () => {
    process.env.CLAUDE_CODE_USE_CODEX = '1'
    process.env.CODEX_MODEL = 'deepseek-v4-pro[1m]'
    delete process.env.OPENAI_AUTH_MODE
    delete process.env.CODEX_AUTH_MODE

    const values = getModelOptions().map(option => option.value)
    expect(values).toContain('gpt-5.5')
    expect(values).toContain('gpt-5.4')
    expect(values).toContain('deepseek-v4-pro[1m]')
  })

  test('uses CODEX_MODEL as the default model when no explicit model is selected', () => {
    process.env.CLAUDE_CODE_USE_CODEX = '1'
    process.env.CODEX_MODEL = 'deepseek-v4-pro[1m]'

    expect(getDefaultSonnetModel()).toBe('deepseek-v4-pro[1m]')
  })
})
