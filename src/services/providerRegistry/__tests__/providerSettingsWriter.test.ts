import { describe, expect, test } from 'bun:test'
import { saveCompatibleProviderSettings } from '../providerSettingsWriter.js'
import type {
  ProviderSettingsPatch,
  ProviderSettingsWriterDependencies,
} from '../providerSettingsWriter.js'

function createDependencies(options?: { updateError?: Error }) {
  const updates: ProviderSettingsPatch[] = []
  const env: Record<string, string | undefined> = {
    OPENAI_AUTH_MODE: 'chatgpt',
    CLAUDE_CODE_USE_BEDROCK: '1',
  }
  let clearOpenAICount = 0
  let clearGrokCount = 0
  let removeChatGPTCount = 0
  const dependencies: ProviderSettingsWriterDependencies = {
    env,
    update: (_source, patch) => {
      updates.push(patch)
      return { error: options?.updateError ?? null }
    },
    clearOpenAI: () => {
      clearOpenAICount += 1
    },
    clearGrok: () => {
      clearGrokCount += 1
    },
    removeChatGPT: async () => {
      removeChatGPTCount += 1
    },
  }
  return {
    dependencies,
    updates,
    env,
    getClearOpenAICount: () => clearOpenAICount,
    getClearGrokCount: () => clearGrokCount,
    getRemoveChatGPTCount: () => removeChatGPTCount,
  }
}

describe('saveCompatibleProviderSettings', () => {
  test('switches from ChatGPT OAuth to OpenAI compatible atomically', async () => {
    const state = createDependencies()

    await saveCompatibleProviderSettings(
      {
        kind: 'openai-compatible',
        baseUrl: 'https://api.example/v1',
        credential: 'secret',
        models: ['m1'],
      },
      state.dependencies,
    )

    expect(state.updates).toEqual([
      {
        modelType: 'openai',
        env: expect.objectContaining({
          OPENAI_AUTH_MODE: undefined,
          OPENAI_BASE_URL: 'https://api.example/v1',
          OPENAI_API_KEY: 'secret',
          OPENAI_DEFAULT_HAIKU_MODEL: 'm1',
          OPENAI_DEFAULT_SONNET_MODEL: 'm1',
          OPENAI_DEFAULT_OPUS_MODEL: 'm1',
        }),
      },
    ])
    expect(state.env.OPENAI_AUTH_MODE).toBeUndefined()
    expect(state.env.CLAUDE_CODE_USE_BEDROCK).toBeUndefined()
    expect(state.getClearOpenAICount()).toBe(1)
    expect(state.getRemoveChatGPTCount()).toBe(1)
  })

  test('does not change runtime state when settings persistence fails', async () => {
    const state = createDependencies({ updateError: new Error('disk full') })

    await expect(
      saveCompatibleProviderSettings(
        {
          kind: 'openai-compatible',
          baseUrl: 'https://api.example/v1',
          credential: 'new-secret',
          models: ['new-model'],
        },
        state.dependencies,
      ),
    ).rejects.toThrow('disk full')

    expect(state.env.OPENAI_AUTH_MODE).toBe('chatgpt')
    expect(state.env.OPENAI_API_KEY).toBeUndefined()
    expect(state.getClearOpenAICount()).toBe(0)
    expect(state.getRemoveChatGPTCount()).toBe(0)
  })

  test('maps Anthropic and Gemini model aliases to their current settings', async () => {
    const anthropic = createDependencies()
    const gemini = createDependencies()

    await saveCompatibleProviderSettings(
      {
        kind: 'anthropic-compatible',
        baseUrl: 'https://anthropic.example',
        credential: 'anthropic-secret',
        models: ['haiku-x', 'sonnet-x', 'opus-x'],
      },
      anthropic.dependencies,
    )
    await saveCompatibleProviderSettings(
      {
        kind: 'gemini',
        baseUrl: 'https://gemini.example',
        credential: 'gemini-secret',
        models: ['flash', 'pro', 'ultra'],
      },
      gemini.dependencies,
    )

    expect(anthropic.updates[0]).toMatchObject({
      modelType: 'anthropic',
      env: {
        ANTHROPIC_BASE_URL: 'https://anthropic.example',
        ANTHROPIC_AUTH_TOKEN: 'anthropic-secret',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: 'haiku-x',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'sonnet-x',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus-x',
      },
    })
    expect(gemini.updates[0]).toMatchObject({
      modelType: 'gemini',
      env: {
        GEMINI_BASE_URL: 'https://gemini.example',
        GEMINI_API_KEY: 'gemini-secret',
        GEMINI_DEFAULT_HAIKU_MODEL: 'flash',
        GEMINI_DEFAULT_SONNET_MODEL: 'pro',
        GEMINI_DEFAULT_OPUS_MODEL: 'ultra',
      },
    })
  })

  test('activates ChatGPT auth without deleting its stored credential', async () => {
    const state = createDependencies()

    await saveCompatibleProviderSettings(
      { kind: 'chatgpt', models: [] },
      state.dependencies,
    )

    expect(state.updates[0]).toMatchObject({
      modelType: 'openai',
      env: { OPENAI_AUTH_MODE: 'chatgpt' },
    })
    expect(state.getClearOpenAICount()).toBe(1)
    expect(state.getRemoveChatGPTCount()).toBe(0)
  })

  test('clears the Grok client only for Grok settings', async () => {
    const state = createDependencies()

    await saveCompatibleProviderSettings(
      {
        kind: 'grok',
        credential: 'grok-secret',
        baseUrl: 'https://api.x.ai/v1',
        models: ['grok-4'],
      },
      state.dependencies,
    )

    expect(state.updates[0]).toMatchObject({
      modelType: 'grok',
      env: {
        GROK_API_KEY: 'grok-secret',
        GROK_BASE_URL: 'https://api.x.ai/v1',
        GROK_MODEL: 'grok-4',
      },
    })
    expect(state.getClearGrokCount()).toBe(1)
    expect(state.getClearOpenAICount()).toBe(0)
  })
})
