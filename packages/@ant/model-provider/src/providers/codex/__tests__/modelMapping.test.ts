import { afterEach, describe, expect, test } from 'bun:test'
import { resolveCodexModel } from '../modelMapping.js'

describe('resolveCodexModel', () => {
  const savedCodexModel = process.env.CODEX_MODEL

  afterEach(() => {
    if (savedCodexModel === undefined) {
      delete process.env.CODEX_MODEL
    } else {
      process.env.CODEX_MODEL = savedCodexModel
    }
  })

  test('uses CODEX_MODEL as the default for family aliases', () => {
    process.env.CODEX_MODEL = 'deepseek-v4-pro[1m]'

    expect(resolveCodexModel('sonnet')).toBe('deepseek-v4-pro[1m]')
  })

  test('does not let CODEX_MODEL override an explicit model selection', () => {
    process.env.CODEX_MODEL = 'deepseek-v4-pro[1m]'

    expect(resolveCodexModel('gpt-5.5')).toBe('gpt-5.5')
  })
})
