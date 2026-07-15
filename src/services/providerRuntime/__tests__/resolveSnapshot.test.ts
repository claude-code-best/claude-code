import { describe, expect, test } from 'bun:test'
import {
  projectRuntimeEnvironment,
  resolveProviderRuntimeSnapshot,
} from '../resolveSnapshot.js'
import type { ProviderRuntimeSelection } from '../types.js'
import type {
  ProviderConfigurationV2,
  ProviderKind,
} from '../../providerRegistry/types.js'
import type { APIProvider } from '../../../utils/model/providers.js'

const mappings: Array<[ProviderKind, APIProvider]> = [
  ['anthropic', 'firstParty'],
  ['anthropic-compatible', 'firstParty'],
  ['openai-compatible', 'openai'],
  ['chatgpt', 'openai'],
  ['gemini', 'gemini'],
  ['grok', 'grok'],
  ['bedrock', 'bedrock'],
  ['vertex', 'vertex'],
  ['foundry', 'foundry'],
]

function configuration(): ProviderConfigurationV2 {
  return {
    version: 2,
    revision: 4,
    defaultModel: null,
    providers: mappings.map(([kind], index) => ({
      id: `${kind}-provider`,
      displayName: `${kind} Provider`,
      kind,
      ...(kind.includes('compatible')
        ? { baseUrl: `https://${kind}.example/v1` }
        : {}),
      auth: { scheme: 'proxy', source: 'helper' },
      enabled: true,
      archived: false,
      models: [
        {
          id: `model-${index}`,
          displayName: `Model ${index}`,
          remoteModelId: `remote-${index}`,
          enabled: true,
          archived: false,
          validation: { status: 'valid' },
        },
      ],
    })),
  }
}

function selection(index: number): ProviderRuntimeSelection {
  const [kind] = mappings[index]
  return {
    providerId: `${kind}-provider`,
    modelProfileId: `model-${index}`,
    resolvedModelId: `remote-${index}`,
    providerConfigRevision: 4,
    updatedAt: 1,
  }
}

describe('resolveProviderRuntimeSnapshot', () => {
  test.each(
    mappings,
  )('maps provider kind %s to %s', (kind, expectedProvider) => {
    const index = mappings.findIndex(([candidate]) => candidate === kind)
    const snapshot = resolveProviderRuntimeSnapshot(
      configuration(),
      selection(index),
      {},
    )

    expect(snapshot.apiProvider).toBe(expectedProvider)
    expect(snapshot.resolvedModelId).toBe(`remote-${index}`)
  })

  test('uses the session model instead of global provider model variables', () => {
    const value = configuration()
    const openAIIndex = mappings.findIndex(
      ([kind]) => kind === 'openai-compatible',
    )
    const provider = value.providers[openAIIndex]
    provider.auth = {
      scheme: 'api-key',
      source: 'environment',
      envName: 'CUSTOM_OPENAI_API_KEY',
    }
    const snapshot = resolveProviderRuntimeSnapshot(
      value,
      selection(openAIIndex),
      {
        OPENAI_MODEL: 'global-model',
        CUSTOM_OPENAI_API_KEY: 'secret-value',
      },
    )
    const baseEnv = {
      OPENAI_MODEL: 'global-model',
      ANTHROPIC_MODEL: 'global-anthropic',
      CUSTOM_OPENAI_API_KEY: 'secret-value',
      UNRELATED_VALUE: 'preserved',
    }

    const childEnv = projectRuntimeEnvironment(snapshot, baseEnv)

    expect(snapshot.resolvedModelId).toBe(`remote-${openAIIndex}`)
    expect(childEnv.OPENAI_MODEL).toBe(`remote-${openAIIndex}`)
    expect(childEnv.OPENAI_API_KEY).toBe('secret-value')
    expect(childEnv.ANTHROPIC_MODEL).toBeUndefined()
    expect(childEnv.UNRELATED_VALUE).toBe('preserved')
    expect(baseEnv.OPENAI_MODEL).toBe('global-model')
    expect(JSON.stringify(snapshot)).not.toContain('secret-value')
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.environmentTemplate)).toBe(true)
  })

  test('rejects a managed model allowlist mismatch', () => {
    expect(() =>
      resolveProviderRuntimeSnapshot(
        configuration(),
        selection(0),
        {},
        {
          isModelAllowed: () => false,
        },
      ),
    ).toThrow('model_not_allowed')
  })

  test('rejects stale revisions and mismatched resolved model ids', () => {
    expect(() =>
      resolveProviderRuntimeSnapshot(
        configuration(),
        { ...selection(0), providerConfigRevision: 3 },
        {},
      ),
    ).toThrow('provider_revision_conflict')
    expect(() =>
      resolveProviderRuntimeSnapshot(
        configuration(),
        { ...selection(0), resolvedModelId: 'forged-model' },
        {},
      ),
    ).toThrow('resolved_model_mismatch')
  })

  test('rejects a missing referenced credential', () => {
    const value = configuration()
    value.providers[0].auth = {
      scheme: 'api-key',
      source: 'environment',
      envName: 'MISSING_API_KEY',
    }

    expect(() =>
      resolveProviderRuntimeSnapshot(value, selection(0), {}),
    ).toThrow('authentication_required')
  })

  test('does not mutate configuration or selection inputs', () => {
    const value = configuration()
    const selected = selection(0)
    const beforeConfiguration = JSON.stringify(value)
    const beforeSelection = JSON.stringify(selected)

    resolveProviderRuntimeSnapshot(value, selected, {})

    expect(JSON.stringify(value)).toBe(beforeConfiguration)
    expect(JSON.stringify(selected)).toBe(beforeSelection)
  })
})
