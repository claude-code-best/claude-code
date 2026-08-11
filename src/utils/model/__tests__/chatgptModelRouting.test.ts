import { describe, expect, test } from 'bun:test'
import {
  CHATGPT_CODEX_MODELS_BY_TIER,
  resolveChatGPTCodexModelForTier,
} from '../chatgptModels.js'

describe('resolveChatGPTCodexModelForTier', () => {
  test('maps CCB capability tiers to the matching GPT-5.6 models', () => {
    expect(
      resolveChatGPTCodexModelForTier({
        tier: 'opus',
        isChatGPTAuth: true,
      }),
    ).toBe('gpt-5.6-sol')
    expect(
      resolveChatGPTCodexModelForTier({
        tier: 'sonnet',
        isChatGPTAuth: true,
      }),
    ).toBe('gpt-5.6-terra')
    expect(
      resolveChatGPTCodexModelForTier({
        tier: 'haiku',
        isChatGPTAuth: true,
      }),
    ).toBe('gpt-5.6-luna')
  })

  test('keeps the tier map as the single source of default assignments', () => {
    expect(CHATGPT_CODEX_MODELS_BY_TIER).toEqual({
      opus: 'gpt-5.6-sol',
      sonnet: 'gpt-5.6-terra',
      haiku: 'gpt-5.6-luna',
    })
  })

  test('prefers family overrides over OAuth defaults', () => {
    expect(
      resolveChatGPTCodexModelForTier({
        tier: 'haiku',
        isChatGPTAuth: true,
        tierOverride: 'custom-haiku',
      }),
    ).toBe('custom-haiku')
  })

  test('prefers a task-specific override over the family override', () => {
    expect(
      resolveChatGPTCodexModelForTier({
        tier: 'haiku',
        isChatGPTAuth: true,
        tierOverride: 'custom-haiku',
        taskOverride: 'custom-small-fast',
      }),
    ).toBe('custom-small-fast')
  })

  test('does not apply GPT defaults outside ChatGPT OAuth mode', () => {
    expect(
      resolveChatGPTCodexModelForTier({
        tier: 'opus',
        isChatGPTAuth: false,
      }),
    ).toBeUndefined()
  })

  test('preserves explicit compatible-provider tier configuration', () => {
    expect(
      resolveChatGPTCodexModelForTier({
        tier: 'sonnet',
        isChatGPTAuth: false,
        tierOverride: 'compatible-provider-model',
      }),
    ).toBe('compatible-provider-model')
  })
})
