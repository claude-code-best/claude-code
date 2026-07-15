import {
  RedactedProviderModelCatalogSchema,
  RedactedProviderProfileSchema,
} from './types.js'
import type { DetectedProviderProfile } from './existingProviderDetector.js'
import type {
  ModelProfile,
  ProviderConfigurationV2,
  ProviderProfile,
  RedactedAuthReference,
  RedactedProviderProfile,
} from './types.js'

export type ProviderModelCatalogCapability = {
  version: 1
  revision: number
  defaultModel: ProviderConfigurationV2['defaultModel']
  providers: RedactedProviderProfile[]
  features: {
    catalogWrite: boolean
    sessionPersistence: boolean
    runtimeSwitch: boolean
    secretControl: boolean
  }
}

export type LegacyProviderCapability = {
  current: string
  configs: Array<{
    id: string
    kind: 'openai-compat'
    base_url: string
    default_model: string
    compat_rule: string
    key_env: string
    key_configured: boolean
  }>
}

export type BridgeProviderCapabilities = {
  provider_model_catalog_v1: ProviderModelCatalogCapability
  session_model_persistence_v1: false
  provider_runtime_switch_v1: false
  provider: LegacyProviderCapability
}

function publishedBaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return undefined
  }
}

function copyModels(models: ModelProfile[]): ModelProfile[] {
  return models.map(model => ({
    id: model.id,
    displayName: model.displayName,
    remoteModelId: model.remoteModelId,
    enabled: model.enabled,
    archived: model.archived,
    validation: { status: model.validation.status },
  }))
}

function detectionMatches(
  provider: ProviderProfile,
  detected: DetectedProviderProfile,
): boolean {
  if (provider.id === detected.id) return true
  if (
    provider.auth.envName !== undefined &&
    provider.auth.envName === detected.auth.envName
  ) {
    return true
  }
  return (
    provider.kind === detected.kind &&
    provider.auth.scheme === detected.auth.scheme &&
    provider.auth.source === detected.auth.source
  )
}

function mergeAuthStatus(
  provider: ProviderProfile,
  detected: DetectedProviderProfile | undefined,
): RedactedAuthReference {
  return {
    scheme: provider.auth.scheme,
    source: provider.auth.source,
    ...(provider.auth.envName === undefined
      ? {}
      : { envName: provider.auth.envName }),
    configured: detected?.auth.configured ?? false,
    ...(detected?.auth.expiresAt === undefined
      ? {}
      : { expiresAt: detected.auth.expiresAt }),
    ...(detected?.auth.lastErrorCode === undefined
      ? {}
      : { lastErrorCode: detected.auth.lastErrorCode }),
  }
}

function sanitizeFileProvider(
  provider: ProviderProfile,
  detected: DetectedProviderProfile | undefined,
): RedactedProviderProfile {
  const baseUrl = publishedBaseUrl(provider.baseUrl)
  return RedactedProviderProfileSchema.parse({
    id: provider.id,
    displayName: provider.displayName,
    kind: provider.kind,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    auth: mergeAuthStatus(provider, detected),
    ...(provider.compatRule === undefined
      ? {}
      : { compatRule: provider.compatRule }),
    enabled: provider.enabled,
    archived: provider.archived,
    models: copyModels(provider.models),
  })
}

function sanitizeDetectedProvider(
  provider: DetectedProviderProfile,
): RedactedProviderProfile {
  const baseUrl = publishedBaseUrl(provider.baseUrl)
  return RedactedProviderProfileSchema.parse({
    id: provider.id,
    displayName: provider.displayName,
    kind: provider.kind,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    auth: {
      scheme: provider.auth.scheme,
      source: provider.auth.source,
      ...(provider.auth.envName === undefined
        ? {}
        : { envName: provider.auth.envName }),
      configured: provider.auth.configured,
      ...(provider.auth.expiresAt === undefined
        ? {}
        : { expiresAt: provider.auth.expiresAt }),
      ...(provider.auth.lastErrorCode === undefined
        ? {}
        : { lastErrorCode: provider.auth.lastErrorCode }),
    },
    ...(provider.compatRule === undefined
      ? {}
      : { compatRule: provider.compatRule }),
    enabled: provider.enabled,
    archived: provider.archived,
    models: copyModels(provider.models),
  })
}

function compareText(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function compareProviders(
  left: RedactedProviderProfile,
  right: RedactedProviderProfile,
): number {
  if (left.archived !== right.archived) return left.archived ? 1 : -1
  return (
    compareText(left.displayName, right.displayName) ||
    compareText(left.id, right.id)
  )
}

/** Merge file configuration and detected state into a stable redacted view. */
export function buildProviderCatalogCapability(
  configuration: ProviderConfigurationV2,
  detectedProfiles: DetectedProviderProfile[],
): ProviderModelCatalogCapability {
  const consumedDetected = new Set<number>()
  const providers = configuration.providers.map(provider => {
    const detectedIndex = detectedProfiles.findIndex(detected =>
      detectionMatches(provider, detected),
    )
    if (detectedIndex !== -1) consumedDetected.add(detectedIndex)
    return sanitizeFileProvider(
      provider,
      detectedIndex === -1 ? undefined : detectedProfiles[detectedIndex],
    )
  })
  const usedIds = new Set(providers.map(provider => provider.id))
  for (const [index, detected] of detectedProfiles.entries()) {
    if (consumedDetected.has(index) || usedIds.has(detected.id)) continue
    const sanitized = sanitizeDetectedProvider(detected)
    providers.push(sanitized)
    usedIds.add(sanitized.id)
  }
  providers.sort(compareProviders)

  const catalog = RedactedProviderModelCatalogSchema.parse({
    version: 1,
    revision: configuration.revision,
    defaultModel: configuration.defaultModel,
    providers,
  })
  return {
    ...catalog,
    features: {
      catalogWrite: false,
      sessionPersistence: false,
      runtimeSwitch: false,
      secretControl: false,
    },
  }
}

/** Project the same catalog into the legacy OpenAI-compatible capability. */
export function buildLegacyProviderCapability(
  catalog: ProviderModelCatalogCapability,
  current: string,
): LegacyProviderCapability {
  const configs: LegacyProviderCapability['configs'] = []
  for (const provider of catalog.providers) {
    if (
      provider.kind !== 'openai-compatible' ||
      !provider.enabled ||
      provider.archived ||
      provider.baseUrl === undefined ||
      provider.auth.envName === undefined
    ) {
      continue
    }
    const preferredModel =
      catalog.defaultModel?.providerId === provider.id
        ? provider.models.find(
            model => model.id === catalog.defaultModel?.modelProfileId,
          )
        : undefined
    const model =
      preferredModel ??
      provider.models.find(
        candidate => candidate.enabled && !candidate.archived,
      )
    if (model === undefined) continue
    configs.push({
      id: provider.id,
      kind: 'openai-compat',
      base_url: provider.baseUrl,
      default_model: model.remoteModelId,
      compat_rule: provider.compatRule ?? 'permissive',
      key_env: provider.auth.envName,
      key_configured: provider.auth.configured,
    })
  }
  return { current, configs }
}

/** Build every bridge key from one authoritative redacted catalog. */
export function buildBridgeProviderCapabilities(
  configuration: ProviderConfigurationV2,
  detectedProfiles: DetectedProviderProfile[],
  current: string,
): BridgeProviderCapabilities {
  const catalog = buildProviderCatalogCapability(
    configuration,
    detectedProfiles,
  )
  return {
    provider_model_catalog_v1: catalog,
    session_model_persistence_v1: false,
    provider_runtime_switch_v1: false,
    provider: buildLegacyProviderCapability(catalog, current),
  }
}
