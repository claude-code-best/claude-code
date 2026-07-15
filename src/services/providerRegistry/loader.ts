import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { basename, dirname, join } from 'path'
import { createHash, randomBytes } from 'node:crypto'
import { logError } from '../../utils/log.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import {
  ProviderConfigurationV2Schema,
  ProvidersFileSchema,
  type ModelRef,
  type ProviderConfig,
  type ProviderConfigurationV2,
  type ProviderProfile,
} from './types.js'

/** The four built-in OpenAI-compatible providers. */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'cerebras',
    kind: 'openai-compat',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    defaultModel: 'llama-3.3-70b',
    compatRule: 'cerebras',
  },
  {
    id: 'groq',
    kind: 'openai-compat',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    compatRule: 'groq',
  },
  {
    id: 'qwen',
    kind: 'openai-compat',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    defaultModel: 'qwen-max',
    compatRule: 'strict-openai',
  },
  {
    id: 'deepseek',
    kind: 'openai-compat',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
    compatRule: 'deepseek',
  },
]

export type ProviderLoadResult = {
  configuration: ProviderConfigurationV2
  sourceFormat: 'missing' | 'legacy-array' | 'v2'
  error?: string
}

export class ProviderRevisionConflictError extends Error {
  constructor(readonly current: ProviderConfigurationV2) {
    super('provider configuration revision conflict')
    this.name = 'ProviderRevisionConflictError'
  }
}

/** Returns the providers.json path in the Claude config directory. */
export function getProvidersFilePath(): string {
  return join(getClaudeConfigHomeDir(), 'providers.json')
}

let cachedProviders: ProviderConfig[] | null = null
let cachedConfiguration: ProviderLoadResult | null = null

/** Invalidate both compatibility and v2 in-process caches. */
export function _invalidateProviderCache(): void {
  cachedProviders = null
  cachedConfiguration = null
}

function mergeLegacyProviders(providers: ProviderConfig[]): ProviderConfig[] {
  const merged = new Map<string, ProviderConfig>()
  for (const provider of DEFAULT_PROVIDERS) merged.set(provider.id, provider)
  for (const provider of providers) merged.set(provider.id, provider)
  return Array.from(merged.values())
}

function modelIdSlug(remoteModelId: string): string {
  return remoteModelId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createStableModelId(
  remoteModelId: string,
  usedIds: Set<string>,
): string {
  const hash = createHash('sha256')
    .update(remoteModelId)
    .digest('hex')
    .slice(0, 8)
  const slug = modelIdSlug(remoteModelId) || `model-${hash}`
  if (!usedIds.has(slug)) {
    usedIds.add(slug)
    return slug
  }

  let candidate = `${slug}-${hash}`
  let sequence = 2
  while (usedIds.has(candidate)) {
    candidate = `${slug}-${hash}-${sequence}`
    sequence += 1
  }
  usedIds.add(candidate)
  return candidate
}

function displayNameFromId(id: string): string {
  return id
    .split('-')
    .filter(Boolean)
    .map(part => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

/** Convert legacy provider entries to the non-secret v2 domain model. */
export function migrateLegacyProviders(
  providers: ProviderConfig[],
): ProviderConfigurationV2 {
  return {
    version: 2,
    revision: 0,
    defaultModel: null,
    providers: providers.map(provider => {
      const usedModelIds = new Set<string>()
      return {
        id: provider.id,
        displayName: displayNameFromId(provider.id),
        kind: 'openai-compatible',
        baseUrl: provider.baseUrl,
        auth: {
          scheme: 'api-key',
          source: 'environment',
          envName: provider.apiKeyEnv,
        },
        compatRule: provider.compatRule,
        enabled: true,
        archived: false,
        models: [
          {
            id: createStableModelId(provider.defaultModel, usedModelIds),
            displayName: provider.defaultModel,
            remoteModelId: provider.defaultModel,
            enabled: true,
            archived: false,
            validation: { status: 'unverified' },
          },
        ],
      }
    }),
  }
}

function defaultConfiguration(): ProviderConfigurationV2 {
  return migrateLegacyProviders(DEFAULT_PROVIDERS)
}

function fallbackWithError(message: string): ProviderLoadResult {
  logError(new Error(message))
  return {
    configuration: defaultConfiguration(),
    sourceFormat: 'missing',
    error: message,
  }
}

function loadProviderConfigurationFromDisk(): ProviderLoadResult {
  const filePath = getProvidersFilePath()
  if (!existsSync(filePath)) {
    return {
      configuration: defaultConfiguration(),
      sourceFormat: 'missing',
    }
  }

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error: unknown) {
    return fallbackWithError(
      `loadProviders: failed to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  if (!raw.trim()) {
    return {
      configuration: defaultConfiguration(),
      sourceFormat: 'missing',
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fallbackWithError(
      `loadProviders: ${filePath} is not valid JSON. Using default providers.`,
    )
  }

  const v2Result = ProviderConfigurationV2Schema.safeParse(parsed)
  if (v2Result.success) {
    return { configuration: v2Result.data, sourceFormat: 'v2' }
  }

  const legacyResult = ProvidersFileSchema.safeParse(parsed)
  if (legacyResult.success) {
    const providers =
      legacyResult.data.length === 0
        ? DEFAULT_PROVIDERS
        : mergeLegacyProviders(legacyResult.data)
    return {
      configuration: migrateLegacyProviders(providers),
      sourceFormat: 'legacy-array',
    }
  }

  return fallbackWithError(
    `loadProviders: ${filePath} failed schema validation: ${v2Result.error.message}. Using default providers.`,
  )
}

/** Load a v2 view without rewriting missing or legacy configuration files. */
export function loadProviderConfiguration(): ProviderLoadResult {
  if (cachedConfiguration !== null) return cachedConfiguration
  cachedConfiguration = loadProviderConfigurationFromDisk()
  return cachedConfiguration
}

function findAvailableModel(
  provider: ProviderProfile,
  preferredRef: ModelRef | null,
) {
  const preferred =
    preferredRef?.providerId === provider.id
      ? provider.models.find(model => model.id === preferredRef.modelProfileId)
      : undefined
  if (
    preferred?.enabled &&
    !preferred.archived &&
    preferred.validation.status !== 'invalid'
  ) {
    return preferred
  }
  return provider.models.find(
    model =>
      model.enabled && !model.archived && model.validation.status !== 'invalid',
  )
}

function projectLegacyProviders(
  configuration: ProviderConfigurationV2,
): ProviderConfig[] {
  const providers: ProviderConfig[] = []
  for (const provider of configuration.providers) {
    if (
      provider.kind !== 'openai-compatible' ||
      provider.archived ||
      !provider.enabled ||
      provider.baseUrl === undefined ||
      provider.auth.envName === undefined
    ) {
      continue
    }
    const model = findAvailableModel(provider, configuration.defaultModel)
    if (model === undefined) continue
    providers.push({
      id: provider.id,
      kind: 'openai-compat',
      baseUrl: provider.baseUrl,
      apiKeyEnv: provider.auth.envName,
      defaultModel: model.remoteModelId,
      compatRule: provider.compatRule ?? 'permissive',
    })
  }
  return providers
}

/** Compatibility loader for the terminal provider switcher. */
export function loadProviders(): ProviderConfig[] {
  if (cachedProviders !== null) return cachedProviders
  cachedProviders = projectLegacyProviders(
    loadProviderConfiguration().configuration,
  )
  return cachedProviders
}

/** Compatibility loader with diagnostic information. */
export function loadProvidersWithDiagnostic(): {
  providers: ProviderConfig[]
  error?: string
} {
  const result = loadProviderConfigurationFromDisk()
  cachedConfiguration = result
  cachedProviders = projectLegacyProviders(result.configuration)
  return { providers: cachedProviders, error: result.error }
}

/** Find a legacy provider by ID. */
export function findProvider(
  id: string,
  providers?: ProviderConfig[],
): ProviderConfig | undefined {
  return (providers ?? loadProviders()).find(provider => provider.id === id)
}

function writeConfigurationAtomically(
  filePath: string,
  configuration: ProviderConfigurationV2,
): void {
  const tmpPath = join(
    dirname(filePath),
    `.${basename(filePath)}-${process.pid}-${randomBytes(8).toString('hex')}.tmp`,
  )
  let descriptor: number | undefined

  try {
    descriptor = openSync(tmpPath, 'wx', 0o600)
    writeFileSync(descriptor, JSON.stringify(configuration, null, 2), 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(tmpPath, filePath)
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // Preserve the original write error.
      }
    }
    try {
      unlinkSync(tmpPath)
    } catch {
      // The temp file may not exist or may already have been renamed.
    }
    throw error
  }
}

/**
 * Persist v2 configuration with compare-and-swap revision semantics.
 * The on-disk state is always re-read to prevent cache-based lost updates.
 */
export function saveProviderConfiguration(
  configuration: ProviderConfigurationV2,
  expectedRevision: number,
): ProviderConfigurationV2 {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new RangeError('expectedRevision must be a non-negative integer')
  }

  const current = loadProviderConfigurationFromDisk().configuration
  if (current.revision !== expectedRevision) {
    throw new ProviderRevisionConflictError(current)
  }

  const next = ProviderConfigurationV2Schema.parse({
    ...configuration,
    version: 2,
    revision: expectedRevision + 1,
  })
  writeConfigurationAtomically(getProvidersFilePath(), next)

  cachedConfiguration = { configuration: next, sourceFormat: 'v2' }
  cachedProviders = projectLegacyProviders(next)
  return next
}

function defaultRefStillExists(
  configuration: ProviderConfigurationV2,
  providers: ProviderProfile[],
): ModelRef | null {
  if (configuration.defaultModel === null) return null
  const provider = providers.find(
    candidate => candidate.id === configuration.defaultModel?.providerId,
  )
  const model = provider?.models.find(
    candidate =>
      candidate.id === configuration.defaultModel?.modelProfileId &&
      candidate.enabled &&
      !candidate.archived &&
      candidate.validation.status !== 'invalid',
  )
  return provider?.enabled && !provider.archived && model !== undefined
    ? configuration.defaultModel
    : null
}

/**
 * Compatibility save API. Calling it is an explicit upgrade to v2 while
 * preserving provider kinds that the legacy shape cannot represent.
 */
export function saveProviders(providers: ProviderConfig[]): ProviderConfig[] {
  const merged = mergeLegacyProviders(providers)
  const current = loadProviderConfigurationFromDisk().configuration
  const migrated = migrateLegacyProviders(merged)
  const migratedIds = new Set(migrated.providers.map(provider => provider.id))
  const retained = current.providers.filter(
    provider =>
      provider.kind !== 'openai-compatible' && !migratedIds.has(provider.id),
  )
  const nextProviders = [...migrated.providers, ...retained]
  const next = {
    ...migrated,
    defaultModel: defaultRefStillExists(current, nextProviders),
    providers: nextProviders,
  }

  saveProviderConfiguration(next, current.revision)
  return merged
}
