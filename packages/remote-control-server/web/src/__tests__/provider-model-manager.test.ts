import { describe, expect, test } from 'bun:test'
import {
  createModelProfileId,
  discoveredModelMutation,
  mergeManagedProviderModels,
} from '../lib/provider-model-manager'

describe('provider model manager', () => {
  test('merges discovered and configured models by remote ID', () => {
    const rows = mergeManagedProviderModels(
      [
        {
          remoteModelId: 'remote-one',
          displayName: 'Remote Name',
          ownedBy: 'vendor',
        },
        { remoteModelId: 'remote-two', displayName: 'Remote Two' },
      ],
      [
        {
          id: 'model-one',
          displayName: 'Configured Name',
          remoteModelId: 'remote-one',
          enabled: true,
          archived: false,
          validation: { status: 'valid' },
        },
        {
          id: 'manual-only',
          displayName: 'Manual Only',
          remoteModelId: 'manual-remote',
          enabled: false,
          archived: true,
          validation: { status: 'unverified' },
        },
      ],
    )

    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      displayName: 'Configured Name',
      discovered: true,
      ownedBy: 'vendor',
      configured: { id: 'model-one' },
    })
    expect(
      rows.find(row => row.remoteModelId === 'manual-remote'),
    ).toMatchObject({
      discovered: false,
      configured: { id: 'manual-only' },
    })
  })

  test('creates stable kebab-case IDs and resolves collisions', () => {
    expect(createModelProfileId('models/GPT 5.2:Pro', [])).toBe(
      'models-gpt-5-2-pro',
    )
    expect(
      createModelProfileId('models/GPT 5.2:Pro', ['models-gpt-5-2-pro']),
    ).toBe('models-gpt-5-2-pro-2')
  })

  test('builds an enabled unverified mutation for one-click add', () => {
    expect(
      discoveredModelMutation(
        { remoteModelId: 'vendor/model-v2', displayName: 'Model V2' },
        [],
      ),
    ).toEqual({
      id: 'vendor-model-v2',
      display_name: 'Model V2',
      remote_model_id: 'vendor/model-v2',
      enabled: true,
      archived: false,
      validation: { status: 'unverified' },
    })
  })
})
