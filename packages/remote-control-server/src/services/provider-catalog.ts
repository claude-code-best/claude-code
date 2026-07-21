import type { SessionModelSelection } from '../persistence/types'
import type { SessionModelSelectionPayload } from '../types/api'

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
const COMPAT_RULES = new Set([
  'cerebras',
  'groq',
  'deepseek',
  'strict-openai',
  'permissive',
])
const VALIDATION_STATUSES = new Set(['unverified', 'valid', 'invalid'])
const STABLE_ID = /^[a-z0-9-]+$/
const ENVIRONMENT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

type CatalogModel = {
  id: string
  displayName: string
  remoteModelId: string
  enabled: boolean
  archived: boolean
  validation: { status: 'unverified' | 'valid' | 'invalid' }
}

type CatalogProvider = {
  id: string
  displayName: string
  kind: string
  baseUrl?: string
  auth: {
    scheme: string
    source: string
    envName?: string
    configured: boolean
    expiresAt?: number
    lastErrorCode?: string
  }
  compatRule?: string
  enabled: boolean
  archived: boolean
  models: CatalogModel[]
}

export type EnvironmentProviderCatalog = {
  version: 1
  revision: number
  defaultModel: { providerId: string; modelProfileId: string } | null
  providers: CatalogProvider[]
  features: {
    catalogWrite: boolean
    sessionPersistence: boolean
    runtimeSwitch: boolean
    secretControl: boolean
  }
}

export type EnvironmentProviderCatalogResult =
  | { supported: true; catalog: EnvironmentProviderCatalog }
  | {
      supported: false
      reason: 'missing' | 'unsupported_version' | 'invalid'
    }

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  const allowed = new Set([...required, ...optional])
  return (
    required.every(key => Object.hasOwn(value, key)) &&
    keys.every(key => allowed.has(key))
  )
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function stableId(value: unknown): value is string {
  return nonEmptyString(value) && STABLE_ID.test(value)
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function parseModel(value: unknown): CatalogModel | null {
  const model = record(value)
  if (
    model === null ||
    !hasOnlyKeys(model, [
      'id',
      'displayName',
      'remoteModelId',
      'enabled',
      'archived',
      'validation',
    ]) ||
    !stableId(model['id']) ||
    !nonEmptyString(model['displayName']) ||
    !nonEmptyString(model['remoteModelId']) ||
    typeof model['enabled'] !== 'boolean' ||
    typeof model['archived'] !== 'boolean'
  ) {
    return null
  }
  const validation = record(model['validation'])
  if (
    validation === null ||
    !hasOnlyKeys(validation, ['status']) ||
    typeof validation['status'] !== 'string' ||
    !VALIDATION_STATUSES.has(validation['status'])
  ) {
    return null
  }
  return {
    id: model['id'],
    displayName: model['displayName'],
    remoteModelId: model['remoteModelId'],
    enabled: model['enabled'],
    archived: model['archived'],
    validation: {
      status: validation['status'] as CatalogModel['validation']['status'],
    },
  }
}

function parseAuth(value: unknown): CatalogProvider['auth'] | null {
  const auth = record(value)
  if (
    auth === null ||
    !hasOnlyKeys(
      auth,
      ['scheme', 'source', 'configured'],
      ['envName', 'expiresAt', 'lastErrorCode'],
    ) ||
    typeof auth['scheme'] !== 'string' ||
    !AUTH_SCHEMES.has(auth['scheme']) ||
    typeof auth['source'] !== 'string' ||
    !AUTH_SOURCES.has(auth['source']) ||
    typeof auth['configured'] !== 'boolean' ||
    (auth['envName'] !== undefined &&
      (typeof auth['envName'] !== 'string' ||
        !ENVIRONMENT_NAME.test(auth['envName']))) ||
    (auth['expiresAt'] !== undefined &&
      !nonNegativeInteger(auth['expiresAt'])) ||
    (auth['lastErrorCode'] !== undefined &&
      !nonEmptyString(auth['lastErrorCode']))
  ) {
    return null
  }
  return {
    scheme: auth['scheme'],
    source: auth['source'],
    configured: auth['configured'],
    ...(auth['envName'] === undefined ? {} : { envName: auth['envName'] }),
    ...(auth['expiresAt'] === undefined
      ? {}
      : { expiresAt: auth['expiresAt'] }),
    ...(auth['lastErrorCode'] === undefined
      ? {}
      : { lastErrorCode: auth['lastErrorCode'] }),
  }
}

function parseProvider(value: unknown): CatalogProvider | null {
  const provider = record(value)
  if (
    provider === null ||
    !hasOnlyKeys(
      provider,
      ['id', 'displayName', 'kind', 'auth', 'enabled', 'archived', 'models'],
      ['baseUrl', 'compatRule'],
    ) ||
    !stableId(provider['id']) ||
    !nonEmptyString(provider['displayName']) ||
    typeof provider['kind'] !== 'string' ||
    !PROVIDER_KINDS.has(provider['kind']) ||
    typeof provider['enabled'] !== 'boolean' ||
    typeof provider['archived'] !== 'boolean' ||
    !Array.isArray(provider['models']) ||
    (provider['baseUrl'] !== undefined &&
      !nonEmptyString(provider['baseUrl'])) ||
    (provider['compatRule'] !== undefined &&
      (typeof provider['compatRule'] !== 'string' ||
        !COMPAT_RULES.has(provider['compatRule'])))
  ) {
    return null
  }
  if (provider['baseUrl'] !== undefined) {
    try {
      new URL(provider['baseUrl'])
    } catch {
      return null
    }
  }
  const auth = parseAuth(provider['auth'])
  const models = provider['models'].map(parseModel)
  if (auth === null || models.some(model => model === null)) return null
  const parsedModels = models as CatalogModel[]
  if (
    new Set(parsedModels.map(model => model.id)).size !== parsedModels.length
  ) {
    return null
  }
  return {
    id: provider['id'],
    displayName: provider['displayName'],
    kind: provider['kind'],
    ...(provider['baseUrl'] === undefined
      ? {}
      : { baseUrl: provider['baseUrl'] }),
    auth,
    ...(provider['compatRule'] === undefined
      ? {}
      : { compatRule: provider['compatRule'] }),
    enabled: provider['enabled'],
    archived: provider['archived'],
    models: parsedModels,
  }
}

function parseCatalog(value: unknown): EnvironmentProviderCatalog | null {
  const catalog = record(value)
  if (
    catalog === null ||
    !hasOnlyKeys(catalog, [
      'version',
      'revision',
      'defaultModel',
      'providers',
      'features',
    ]) ||
    catalog['version'] !== 1 ||
    !nonNegativeInteger(catalog['revision']) ||
    !Array.isArray(catalog['providers'])
  ) {
    return null
  }
  let defaultModel: EnvironmentProviderCatalog['defaultModel'] = null
  if (catalog['defaultModel'] !== null) {
    const value = record(catalog['defaultModel'])
    if (
      value === null ||
      !hasOnlyKeys(value, ['providerId', 'modelProfileId']) ||
      !stableId(value['providerId']) ||
      !stableId(value['modelProfileId'])
    ) {
      return null
    }
    defaultModel = {
      providerId: value['providerId'],
      modelProfileId: value['modelProfileId'],
    }
  }
  const providers = catalog['providers'].map(parseProvider)
  if (providers.some(provider => provider === null)) return null
  const parsedProviders = providers as CatalogProvider[]
  if (
    new Set(parsedProviders.map(provider => provider.id)).size !==
    parsedProviders.length
  ) {
    return null
  }
  const features = record(catalog['features'])
  const featureKeys = [
    'catalogWrite',
    'sessionPersistence',
    'runtimeSwitch',
    'secretControl',
  ] as const
  if (
    features === null ||
    !hasOnlyKeys(features, featureKeys) ||
    featureKeys.some(key => typeof features[key] !== 'boolean')
  ) {
    return null
  }
  return {
    version: 1,
    revision: catalog['revision'],
    defaultModel,
    providers: parsedProviders,
    features: {
      catalogWrite: features['catalogWrite'] as boolean,
      sessionPersistence: features['sessionPersistence'] as boolean,
      runtimeSwitch: features['runtimeSwitch'] as boolean,
      secretControl: features['secretControl'] as boolean,
    },
  }
}

export function readEnvironmentProviderCatalog(
  capabilities: Record<string, unknown> | null | undefined,
): EnvironmentProviderCatalogResult {
  if (capabilities === null || capabilities === undefined) {
    return { supported: false, reason: 'missing' }
  }
  const value = capabilities['provider_model_catalog_v1']
  if (value === undefined) return { supported: false, reason: 'missing' }
  const candidate = record(value)
  if (candidate?.['version'] !== 1) {
    return { supported: false, reason: 'unsupported_version' }
  }
  const catalog = parseCatalog(value)
  return catalog === null
    ? { supported: false, reason: 'invalid' }
    : { supported: true, catalog }
}

export function resolveDefaultSessionModel(environment: {
  capabilities: Record<string, unknown> | null
}): SessionModelSelection | null {
  const result = readEnvironmentProviderCatalog(environment.capabilities)
  if (!result.supported || result.catalog.defaultModel === null) return null
  const provider = result.catalog.providers.find(
    candidate => candidate.id === result.catalog.defaultModel?.providerId,
  )
  const model = provider?.models.find(
    candidate => candidate.id === result.catalog.defaultModel?.modelProfileId,
  )
  if (
    provider === undefined ||
    model === undefined ||
    !provider.enabled ||
    provider.archived ||
    !model.enabled ||
    model.archived ||
    model.validation.status === 'invalid'
  ) {
    return null
  }
  return {
    providerId: provider.id,
    modelProfileId: model.id,
    resolvedModelId: model.remoteModelId,
    providerConfigRevision: result.catalog.revision,
    updatedAt: Date.now(),
  }
}

export function toSessionModelSelectionPayload(
  selection: SessionModelSelection | null,
): SessionModelSelectionPayload | null {
  if (selection === null) return null
  return {
    provider_id: selection.providerId,
    model_profile_id: selection.modelProfileId,
    resolved_model_id: selection.resolvedModelId,
    provider_config_revision: selection.providerConfigRevision,
    updated_at: selection.updatedAt,
  }
}
