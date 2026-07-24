import { ApiError } from '../api/client'
import type {
  ProviderCatalogProfile,
  ProviderCatalogResponse,
  ProviderModelDiscovery,
  ProviderModelCatalog,
} from '../types'
import { generateMessageUuid } from './utils'

const PROVIDER_KINDS = new Set([
  'anthropic',
  'anthropic-compatible',
  'openai-compatible',
  'chatgpt',
  'gemini',
  'grok',
  'bedrock',
  'vertex',
  'foundry',
])
const AUTH_SCHEMES = new Set([
  'oauth',
  'api-key',
  'bearer',
  'aws-iam',
  'gcp-adc',
  'azure-ad',
  'proxy',
])
const AUTH_SOURCES = new Set([
  'secure-storage',
  'settings',
  'environment',
  'helper',
  'cloud-chain',
])
const VALIDATION_STATUSES = new Set(['unverified', 'valid', 'invalid'])
const SECRET_KEYS = new Set([
  'apikey',
  'api_key',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'credential',
])
const CATALOG_CACHE_PREFIX = 'rcs-provider-catalog:'

function catalogCacheKey(environmentId: string): string {
  return `${CATALOG_CACHE_PREFIX}${environmentId}`
}

function readCachedCatalog(environmentId: string): ProviderModelCatalog | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(catalogCacheKey(environmentId))
    return raw === null ? null : parseProviderModelCatalog(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeCachedCatalog(
  environmentId: string,
  catalog: ProviderModelCatalog,
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      catalogCacheKey(environmentId),
      JSON.stringify(catalog),
    )
  } catch {
    // localStorage may be unavailable or full; the RCS cache remains authoritative.
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function rejectSecretKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(rejectSecretKeys)
    return
  }
  const input = record(value)
  if (!input) return
  for (const [key, child] of Object.entries(input)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      throw new Error('provider_catalog_contains_secret_field')
    }
    rejectSecretKeys(child)
  }
}

function validModel(value: unknown): boolean {
  const model = record(value)
  const validation = record(model?.validation)
  return Boolean(
    model &&
      typeof model.id === 'string' &&
      typeof model.displayName === 'string' &&
      typeof model.remoteModelId === 'string' &&
      typeof model.enabled === 'boolean' &&
      typeof model.archived === 'boolean' &&
      validation &&
      typeof validation.status === 'string' &&
      VALIDATION_STATUSES.has(validation.status),
  )
}

function validProvider(value: unknown): value is ProviderCatalogProfile {
  const provider = record(value)
  const auth = record(provider?.auth)
  return Boolean(
    provider &&
      typeof provider.id === 'string' &&
      typeof provider.displayName === 'string' &&
      typeof provider.kind === 'string' &&
      PROVIDER_KINDS.has(provider.kind) &&
      (provider.baseUrl === undefined ||
        typeof provider.baseUrl === 'string') &&
      auth &&
      typeof auth.scheme === 'string' &&
      AUTH_SCHEMES.has(auth.scheme) &&
      typeof auth.source === 'string' &&
      AUTH_SOURCES.has(auth.source) &&
      typeof auth.configured === 'boolean' &&
      typeof provider.enabled === 'boolean' &&
      typeof provider.archived === 'boolean' &&
      Array.isArray(provider.models) &&
      provider.models.every(validModel),
  )
}

export function parseProviderModelCatalog(
  value: unknown,
): ProviderModelCatalog {
  rejectSecretKeys(value)
  const catalog = record(value)
  const features = record(catalog?.features)
  if (
    !catalog ||
    catalog.version !== 1 ||
    !Number.isSafeInteger(catalog.revision) ||
    (catalog.revision as number) < 0 ||
    !Array.isArray(catalog.providers) ||
    !catalog.providers.every(validProvider) ||
    !features ||
    typeof features.catalogWrite !== 'boolean' ||
    typeof features.sessionPersistence !== 'boolean' ||
    typeof features.runtimeSwitch !== 'boolean' ||
    typeof features.secretControl !== 'boolean'
  ) {
    throw new Error('invalid_provider_catalog_response')
  }
  if (catalog.defaultModel !== null) {
    const selected = record(catalog.defaultModel)
    if (
      !selected ||
      typeof selected.providerId !== 'string' ||
      typeof selected.modelProfileId !== 'string'
    ) {
      throw new Error('invalid_provider_catalog_response')
    }
  }
  return catalog as unknown as ProviderModelCatalog
}

export function parseProviderCatalogResponse(
  value: unknown,
): ProviderCatalogResponse {
  rejectSecretKeys(value)
  const response = record(value)
  if (!response || typeof response.stale !== 'boolean') {
    throw new Error('invalid_provider_catalog_response')
  }
  return {
    catalog: parseProviderModelCatalog(response.catalog),
    stale: response.stale,
    ...(response.value === undefined ? {} : { value: response.value }),
  }
}

export function parseProviderModelDiscovery(
  value: unknown,
): ProviderModelDiscovery {
  rejectSecretKeys(value)
  const discovery = record(value)
  if (
    !discovery ||
    typeof discovery.providerId !== 'string' ||
    !Number.isSafeInteger(discovery.fetchedAt) ||
    (discovery.fetchedAt as number) < 0 ||
    !Array.isArray(discovery.models) ||
    !discovery.models.every(item => {
      const model = record(item)
      return Boolean(
        model &&
          typeof model.remoteModelId === 'string' &&
          model.remoteModelId.length > 0 &&
          typeof model.displayName === 'string' &&
          model.displayName.length > 0 &&
          (model.ownedBy === undefined || typeof model.ownedBy === 'string'),
      )
    })
  ) {
    throw new Error('invalid_model_discovery_response')
  }
  return discovery as unknown as ProviderModelDiscovery
}

export type ProviderCatalogState = {
  environmentId: string | null
  catalog: ProviderModelCatalog | null
  loading: boolean
  stale: boolean
  error: string | null
}

export type ProviderCatalogMutationResult =
  | { ok: true }
  | { ok: false; conflict: boolean; error: string }

type Listener = (state: ProviderCatalogState) => void

export class ProviderCatalogModel {
  private generation = 0
  private controller: AbortController | null = null
  private listeners = new Set<Listener>()
  private state: ProviderCatalogState = {
    environmentId: null,
    catalog: null,
    loading: false,
    stale: false,
    error: null,
  }

  constructor(
    private readonly fetchCatalog: (
      environmentId: string,
      signal: AbortSignal,
    ) => Promise<unknown>,
  ) {}

  snapshot(): ProviderCatalogState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private publish(patch: Partial<ProviderCatalogState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach(listener => listener(this.state))
  }

  async selectEnvironment(environmentId: string | null): Promise<void> {
    this.controller?.abort()
    this.controller = null
    const generation = ++this.generation
    if (environmentId === null) {
      this.publish({
        environmentId: null,
        catalog: null,
        loading: false,
        stale: false,
        error: null,
      })
      return
    }
    const controller = new AbortController()
    this.controller = controller
    const cached = readCachedCatalog(environmentId)
    this.publish({
      environmentId,
      catalog: cached,
      loading: true,
      stale: cached !== null,
      error: null,
    })
    try {
      const response = parseProviderCatalogResponse(
        await this.fetchCatalog(environmentId, controller.signal),
      )
      if (generation !== this.generation || controller.signal.aborted) return
      writeCachedCatalog(environmentId, response.catalog)
      this.publish({
        catalog: response.catalog,
        loading: false,
        stale: response.stale,
        error: null,
      })
    } catch (error) {
      if (generation !== this.generation || controller.signal.aborted) return
      const fallback = readCachedCatalog(environmentId)
      this.publish({
        catalog: fallback,
        loading: false,
        stale: fallback !== null,
        error:
          error instanceof Error ? error.message : 'provider_catalog_failed',
      })
    }
  }

  cancel(): void {
    this.generation += 1
    this.controller?.abort()
    this.controller = null
  }

  async mutate(
    mutation: (revision: number, operationId: string) => Promise<unknown>,
  ): Promise<ProviderCatalogMutationResult> {
    if (!this.state.catalog || this.state.stale) {
      return { ok: false, conflict: false, error: 'provider_catalog_readonly' }
    }
    try {
      const response = parseProviderCatalogResponse(
        await mutation(this.state.catalog.revision, generateMessageUuid()),
      )
      if (this.state.environmentId !== null) {
        writeCachedCatalog(this.state.environmentId, response.catalog)
      }
      this.publish({
        catalog: response.catalog,
        stale: response.stale,
        error: null,
      })
      return { ok: true }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const payload = record(error.body)
        try {
          const catalog = parseProviderModelCatalog(payload?.catalog)
          if (this.state.environmentId !== null) {
            writeCachedCatalog(this.state.environmentId, catalog)
          }
          this.publish({
            catalog,
            stale: false,
            error: 'provider_revision_conflict',
          })
        } catch {
          this.publish({ error: 'provider_revision_conflict' })
        }
        return {
          ok: false,
          conflict: true,
          error: 'provider_revision_conflict',
        }
      }
      const message =
        error instanceof Error ? error.message : 'provider_mutation_failed'
      this.publish({ error: message })
      return { ok: false, conflict: false, error: message }
    }
  }
}
