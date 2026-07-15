import { describe, expect, test } from 'bun:test'
import { ApiError } from '../api/client'
import {
  ProviderCatalogModel,
  parseProviderCatalogResponse,
} from '../lib/provider-catalog-model'

function response(revision: number) {
  return {
    stale: false,
    catalog: {
      version: 1,
      revision,
      defaultModel: null,
      providers: [],
      features: {
        catalogWrite: true,
        sessionPersistence: true,
        runtimeSwitch: true,
        secretControl: false,
      },
    },
  }
}

describe('ProviderCatalogModel', () => {
  test('rejects any catalog response containing a secret-shaped field', () => {
    expect(() =>
      parseProviderCatalogResponse({
        ...response(1),
        catalog: { ...response(1).catalog, api_key: 'sk-secret' },
      }),
    ).toThrow('provider_catalog_contains_secret_field')
  })

  test('does not let an old environment response replace the selected one', async () => {
    const resolvers = new Map<string, (value: unknown) => void>()
    const model = new ProviderCatalogModel(
      id =>
        new Promise(resolve => {
          resolvers.set(id, resolve)
        }),
    )
    const oldRequest = model.selectEnvironment('environment-old')
    const newRequest = model.selectEnvironment('environment-new')
    resolvers.get('environment-new')!(response(2))
    await newRequest
    resolvers.get('environment-old')!(response(1))
    await oldRequest

    expect(model.snapshot().environmentId).toBe('environment-new')
    expect(model.snapshot().catalog?.revision).toBe(2)
  })

  test('updates the catalog on conflict and disables stale mutations', async () => {
    const model = new ProviderCatalogModel(async () => response(2))
    await model.selectEnvironment('environment-1')
    const conflict = await model.mutate(async () => {
      throw new ApiError('conflict', 409, {
        error: { type: 'provider_revision_conflict' },
        catalog: response(3).catalog,
      })
    })
    expect(conflict).toEqual({
      ok: false,
      conflict: true,
      error: 'provider_revision_conflict',
    })
    expect(model.snapshot().catalog?.revision).toBe(3)

    const stale = new ProviderCatalogModel(async () => ({
      ...response(4),
      stale: true,
    }))
    await stale.selectEnvironment('environment-2')
    expect(await stale.mutate(async () => response(5))).toEqual({
      ok: false,
      conflict: false,
      error: 'provider_catalog_readonly',
    })
  })
})
