import { createHash } from 'node:crypto'
import {
  ProviderRevisionConflictError,
  reloadProviderConfiguration,
  saveProviderConfiguration,
} from './loader.js'
import {
  ModelProfileSchema,
  ProviderConfigurationV2Schema,
  ProviderProfileSchema,
} from './types.js'
import type { ProviderLoadResult } from './loader.js'
import type {
  ModelProfile,
  ModelRef,
  ProviderConfigurationV2,
  ProviderProfile,
} from './types.js'

export type CatalogMutation =
  | { type: 'save_provider'; provider: ProviderProfile }
  | { type: 'archive_provider'; providerId: string }
  | { type: 'save_model'; providerId: string; model: ModelProfile }
  | {
      type: 'archive_model'
      providerId: string
      modelProfileId: string
    }
  | {
      type: 'set_default'
      model: ModelRef | null
      allowUnverified?: boolean
    }

export type CatalogMutationRequest = {
  operationId: string
  expectedRevision: number
  mutation: CatalogMutation
}

export type ProviderCatalogPersistence = {
  load: () => ProviderLoadResult
  save: (
    configuration: ProviderConfigurationV2,
    expectedRevision: number,
  ) => ProviderConfigurationV2
}

export type ProviderCatalogErrorCode =
  | 'provider_operation_conflict'
  | 'provider_not_found'
  | 'model_not_found'
  | 'provider_unavailable'
  | 'model_unavailable'
  | 'invalid_model'
  | 'unverified_model_confirmation_required'
  | 'default_model_conflict'
  | 'invalid_operation_id'

export class ProviderCatalogError extends Error {
  constructor(readonly code: ProviderCatalogErrorCode) {
    super(code)
    this.name = 'ProviderCatalogError'
  }
}

function cloneConfiguration(
  configuration: ProviderConfigurationV2,
): ProviderConfigurationV2 {
  return ProviderConfigurationV2Schema.parse(configuration)
}

function cloneProviders(providers: ProviderProfile[]): ProviderProfile[] {
  return providers.map(provider => ({
    ...provider,
    auth: { ...provider.auth },
    models: provider.models.map(model => ({
      ...model,
      validation: { ...model.validation },
    })),
  }))
}

function findProviderOrThrow(
  providers: ProviderProfile[],
  providerId: string,
): ProviderProfile {
  const provider = providers.find(candidate => candidate.id === providerId)
  if (provider === undefined) {
    throw new ProviderCatalogError('provider_not_found')
  }
  return provider
}

function findModelOrThrow(
  provider: ProviderProfile,
  modelProfileId: string,
): ModelProfile {
  const model = provider.models.find(
    candidate => candidate.id === modelProfileId,
  )
  if (model === undefined) {
    throw new ProviderCatalogError('model_not_found')
  }
  return model
}

function assertDefaultRemainsAvailable(
  defaultModel: ModelRef | null,
  provider: ProviderProfile,
): void {
  if (defaultModel?.providerId !== provider.id) return
  const model = provider.models.find(
    candidate => candidate.id === defaultModel.modelProfileId,
  )
  if (
    !provider.enabled ||
    provider.archived ||
    model === undefined ||
    !model.enabled ||
    model.archived ||
    model.validation.status === 'invalid'
  ) {
    throw new ProviderCatalogError('default_model_conflict')
  }
}

function mergeExistingModels(
  existing: ProviderProfile | undefined,
  input: ProviderProfile,
): ProviderProfile {
  if (existing === undefined) return input
  const inputIds = new Set(input.models.map(model => model.id))
  return {
    ...input,
    models: [
      ...input.models,
      ...existing.models.filter(model => !inputIds.has(model.id)),
    ],
  }
}

function assertNever(value: never): never {
  throw new Error(`unsupported catalog mutation: ${JSON.stringify(value)}`)
}

/** Apply one mutation without changing the input or incrementing its revision. */
export function applyCatalogMutation(
  current: ProviderConfigurationV2,
  mutation: CatalogMutation,
): ProviderConfigurationV2 {
  const parsedCurrent = cloneConfiguration(current)
  const providers = cloneProviders(parsedCurrent.providers)
  let defaultModel = parsedCurrent.defaultModel

  switch (mutation.type) {
    case 'save_provider': {
      const input = ProviderProfileSchema.parse(mutation.provider)
      const index = providers.findIndex(provider => provider.id === input.id)
      const saved = mergeExistingModels(
        index === -1 ? undefined : providers[index],
        input,
      )
      assertDefaultRemainsAvailable(defaultModel, saved)
      if (index === -1) providers.push(saved)
      else providers[index] = saved
      break
    }
    case 'archive_provider': {
      const index = providers.findIndex(
        provider => provider.id === mutation.providerId,
      )
      if (index === -1) {
        throw new ProviderCatalogError('provider_not_found')
      }
      if (defaultModel?.providerId === mutation.providerId) {
        throw new ProviderCatalogError('default_model_conflict')
      }
      providers[index] = {
        ...providers[index],
        enabled: false,
        archived: true,
      }
      break
    }
    case 'save_model': {
      const provider = findProviderOrThrow(providers, mutation.providerId)
      const input = ModelProfileSchema.parse(mutation.model)
      const index = provider.models.findIndex(model => model.id === input.id)
      if (index === -1) provider.models.push(input)
      else provider.models[index] = input
      assertDefaultRemainsAvailable(defaultModel, provider)
      break
    }
    case 'archive_model': {
      const provider = findProviderOrThrow(providers, mutation.providerId)
      const index = provider.models.findIndex(
        model => model.id === mutation.modelProfileId,
      )
      if (index === -1) {
        throw new ProviderCatalogError('model_not_found')
      }
      if (
        defaultModel?.providerId === mutation.providerId &&
        defaultModel.modelProfileId === mutation.modelProfileId
      ) {
        throw new ProviderCatalogError('default_model_conflict')
      }
      provider.models[index] = {
        ...provider.models[index],
        enabled: false,
        archived: true,
      }
      break
    }
    case 'set_default': {
      if (mutation.model === null) {
        defaultModel = null
        break
      }
      const provider = findProviderOrThrow(providers, mutation.model.providerId)
      if (!provider.enabled || provider.archived) {
        throw new ProviderCatalogError('provider_unavailable')
      }
      const model = findModelOrThrow(provider, mutation.model.modelProfileId)
      if (!model.enabled || model.archived) {
        throw new ProviderCatalogError('model_unavailable')
      }
      if (model.validation.status === 'invalid') {
        throw new ProviderCatalogError('invalid_model')
      }
      if (
        model.validation.status === 'unverified' &&
        mutation.allowUnverified !== true
      ) {
        throw new ProviderCatalogError('unverified_model_confirmation_required')
      }
      defaultModel = { ...mutation.model }
      break
    }
    default:
      assertNever(mutation)
  }

  return ProviderConfigurationV2Schema.parse({
    ...parsedCurrent,
    defaultModel,
    providers,
  })
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map(key => [key, canonicalize(record[key])]),
  )
}

function requestDigest(request: CatalogMutationRequest): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(request)))
    .digest('hex')
}

const diskPersistence: ProviderCatalogPersistence = {
  load: reloadProviderConfiguration,
  save: saveProviderConfiguration,
}

type OperationResult = {
  digest: string
  configuration: ProviderConfigurationV2
}

export class ProviderCatalogService {
  private readonly operations = new Map<string, OperationResult>()

  constructor(
    private readonly persistence: ProviderCatalogPersistence = diskPersistence,
    private readonly operationLimit = 256,
  ) {
    if (!Number.isInteger(operationLimit) || operationLimit < 1) {
      throw new RangeError('operationLimit must be a positive integer')
    }
  }

  read(): ProviderConfigurationV2 {
    return cloneConfiguration(this.persistence.load().configuration)
  }

  mutate(request: CatalogMutationRequest): ProviderConfigurationV2 {
    const operationId = request.operationId.trim()
    if (!operationId) {
      throw new ProviderCatalogError('invalid_operation_id')
    }

    const digest = requestDigest({ ...request, operationId })
    const cached = this.operations.get(operationId)
    if (cached !== undefined) {
      if (cached.digest !== digest) {
        throw new ProviderCatalogError('provider_operation_conflict')
      }
      return cloneConfiguration(cached.configuration)
    }

    const current = this.read()
    if (current.revision !== request.expectedRevision) {
      throw new ProviderRevisionConflictError(current)
    }

    const next = applyCatalogMutation(current, request.mutation)
    const saved = this.persistence.save(next, request.expectedRevision)
    this.remember(operationId, digest, saved)
    return cloneConfiguration(saved)
  }

  private remember(
    operationId: string,
    digest: string,
    configuration: ProviderConfigurationV2,
  ): void {
    if (this.operations.size >= this.operationLimit) {
      const oldest = this.operations.keys().next().value
      if (oldest !== undefined) this.operations.delete(oldest)
    }
    this.operations.set(operationId, {
      digest,
      configuration: cloneConfiguration(configuration),
    })
  }
}
