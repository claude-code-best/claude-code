import { describe, expect, test } from 'bun:test'
import {
  ORCAROUTER_BASE_URL,
  ORCAROUTER_DEFAULT_MODELS,
  ORCAROUTER_KEY_PREFIX,
  getOrcaRouterLoginDefaults,
} from '../orcarouterProvider'

describe('OrcaRouter constants', () => {
  test('base URL points at the OpenAI-compatible endpoint', () => {
    expect(ORCAROUTER_BASE_URL).toBe('https://api.orcarouter.ai/v1')
  })

  test('key prefix is the OrcaRouter one, not the OpenAI one', () => {
    expect(ORCAROUTER_KEY_PREFIX).toBe('sk-orca-')
  })

  test('every default model id is namespaced', () => {
    for (const id of Object.values(ORCAROUTER_DEFAULT_MODELS)) {
      expect(id).toContain('/')
    }
  })

  test('auto router is not used as a tier default', () => {
    for (const id of Object.values(ORCAROUTER_DEFAULT_MODELS)) {
      expect(id).not.toBe('orcarouter/auto')
    }
  })
})

describe('getOrcaRouterLoginDefaults', () => {
  test('prefills base URL and all three model tiers', () => {
    const defaults = getOrcaRouterLoginDefaults({})
    expect(defaults).toEqual({
      baseUrl: ORCAROUTER_BASE_URL,
      apiKey: '',
      haikuModel: ORCAROUTER_DEFAULT_MODELS.haiku,
      sonnetModel: ORCAROUTER_DEFAULT_MODELS.sonnet,
      opusModel: ORCAROUTER_DEFAULT_MODELS.opus,
    })
  })

  test('environment variables override the built-in defaults', () => {
    const defaults = getOrcaRouterLoginDefaults({
      ORCAROUTER_BASE_URL: 'https://gateway.internal/v1',
      ORCAROUTER_API_KEY: 'sk-orca-test',
      ORCAROUTER_DEFAULT_HAIKU_MODEL: 'openai/gpt-5.5',
      ORCAROUTER_DEFAULT_SONNET_MODEL: 'z-ai/glm-5.2',
      ORCAROUTER_DEFAULT_OPUS_MODEL: 'anthropic/claude-opus-4.8',
    })
    expect(defaults).toEqual({
      baseUrl: 'https://gateway.internal/v1',
      apiKey: 'sk-orca-test',
      haikuModel: 'openai/gpt-5.5',
      sonnetModel: 'z-ai/glm-5.2',
      opusModel: 'anthropic/claude-opus-4.8',
    })
  })

  test('does not fall back to OPENAI_* variables', () => {
    const defaults = getOrcaRouterLoginDefaults({
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      OPENAI_API_KEY: 'sk-openai',
    })
    expect(defaults.baseUrl).toBe(ORCAROUTER_BASE_URL)
    expect(defaults.apiKey).toBe('')
  })
})
