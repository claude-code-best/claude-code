import { afterEach, describe, expect, test } from 'bun:test'
import { resolveOllamaModel } from '../modelMapping.js'

const envKeys = [
  'OLLAMA_MODEL',
  'OLLAMA_DEFAULT_HAIKU_MODEL',
  'OLLAMA_DEFAULT_SONNET_MODEL',
  'OLLAMA_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
] as const

const savedEnv: Record<string, string | undefined> = {}

for (const key of envKeys) {
  savedEnv[key] = process.env[key]
  delete process.env[key]
}

afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = savedEnv[key]
    }
  }
})

describe('resolveOllamaModel', () => {
  test('keeps direct Ollama model names selected from /model', () => {
    expect(resolveOllamaModel('qwen3-coder')).toBe('qwen3-coder')
    expect(resolveOllamaModel('glm-4.7:cloud')).toBe('glm-4.7:cloud')
  })

  test('maps Claude family model ids to Ollama defaults', () => {
    process.env.OLLAMA_DEFAULT_SONNET_MODEL = 'qwen3-coder'

    expect(resolveOllamaModel('claude-sonnet-4-6')).toBe('qwen3-coder')
  })

  test('does not fall back to Anthropic model env vars for Ollama', () => {
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'claude-sonnet-custom'

    expect(resolveOllamaModel('claude-sonnet-4-6')).toBe('qwen3-coder')
  })

  test('ignores legacy OLLAMA_MODEL global override', () => {
    process.env.OLLAMA_MODEL = 'legacy-global-model'

    expect(resolveOllamaModel('claude-sonnet-4-6')).toBe('qwen3-coder')
  })
})
