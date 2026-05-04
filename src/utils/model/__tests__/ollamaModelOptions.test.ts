import { afterEach, describe, expect, test } from 'bun:test'
import { getOllamaConfiguredModelOption } from '../modelOptions.js'

const envKeys = [
  'OLLAMA_DEFAULT_HAIKU_MODEL',
  'OLLAMA_DEFAULT_HAIKU_MODEL_NAME',
  'OLLAMA_DEFAULT_HAIKU_MODEL_DESCRIPTION',
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

describe('getOllamaConfiguredModelOption', () => {
  test('uses Ollama model env vars saved by /login', () => {
    process.env.OLLAMA_DEFAULT_HAIKU_MODEL = 'qwen3:cloud'
    process.env.OLLAMA_DEFAULT_HAIKU_MODEL_NAME = 'Qwen Cloud'
    process.env.OLLAMA_DEFAULT_HAIKU_MODEL_DESCRIPTION = 'Fast Ollama model'

    expect(getOllamaConfiguredModelOption('HAIKU')).toEqual({
      value: 'haiku',
      label: 'Qwen Cloud',
      description: 'Fast Ollama model',
      descriptionForModel: 'Fast Ollama model (qwen3:cloud)',
    })
  })

  test('does not read Anthropic model env vars for Ollama options', () => {
    process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = 'claude-sonnet-custom'

    expect(getOllamaConfiguredModelOption('SONNET')).toBeUndefined()
  })
})
