import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import { isModelAllowed } from '../../utils/model/modelAllowlist.js'
import { providerAuthService } from '../providerAuth/authService.js'
import { ProviderSecretControlService } from '../providerAuth/secretControl.js'
import type { ProviderAuthMethod } from '../providerAuth/types.js'
import { resolveProviderRuntimeSnapshot } from '../providerRuntime/resolveSnapshot.js'
import {
  ProviderCatalogError,
  ProviderCatalogService,
} from './catalogService.js'
import { buildProviderCatalogCapability } from './catalogCapability.js'
import {
  detectExistingProviderProfiles,
  type DetectedProviderProfile,
} from './existingProviderDetector.js'
import { ProviderRevisionConflictError } from './loader.js'
import {
  ModelProfileSchema,
  ProviderProfileSchema,
  type ModelProfile,
  type ProviderProfile,
} from './types.js'
import { saveProviderCredentialSettings } from './providerSettingsWriter.js'

export type ProviderEnvironmentCommand =
  | { type: 'get_provider_catalog' }
  | {
      type: 'save_provider_profile'
      operation_id: string
      expected_revision: number
      provider: Record<string, unknown>
    }
  | {
      type: 'archive_provider_profile'
      operation_id: string
      expected_revision: number
      provider_id: string
    }
  | {
      type: 'save_model_profile'
      operation_id: string
      expected_revision: number
      provider_id: string
      model: Record<string, unknown>
    }
  | {
      type: 'archive_model_profile'
      operation_id: string
      expected_revision: number
      provider_id: string
      model_profile_id: string
    }
  | {
      type: 'set_default_model'
      operation_id: string
      expected_revision: number
      model: { provider_id: string; model_profile_id: string } | null
      allow_unverified: boolean
    }
  | {
      type: 'validate_provider_model'
      operation_id: string
      expected_revision: number
      provider_id: string
      model_profile_id: string
    }
  | {
      type:
        | 'begin_provider_auth'
        | 'remove_provider_auth'
        | 'refresh_provider_auth'
      provider_id: string
      operation_id: string
      method?: string
      action?: string
    }
  | {
      type: 'begin_provider_secret'
      provider_id: string
      operation_id: string
      method?: string
      secret_envelope?: Record<string, unknown>
    }
  | {
      type: 'get_provider_auth_status' | 'cancel_provider_auth'
      auth_operation_id: string
    }
  | {
      type: 'submit_provider_auth_code'
      auth_operation_id: string
      code: string
    }

export type ProviderEnvironmentCommandResult = {
  kind: ProviderEnvironmentCommand['type']
  ok: boolean
  catalog?: ReturnType<typeof buildProviderCatalogCapability>
  errorCode?: string
  value?: unknown
}

export type ProviderEnvironmentCommandDependencies = {
  catalogService: ProviderCatalogService
  detectedProfiles: () => DetectedProviderProfile[]
  validateModel?: (providerId: string, modelProfileId: string) => Promise<void>
  executeAuth?: (
    command: Exclude<
      ProviderEnvironmentCommand,
      | { type: 'get_provider_catalog' }
      | { type: 'save_provider_profile' }
      | { type: 'archive_provider_profile' }
      | { type: 'save_model_profile' }
      | { type: 'archive_model_profile' }
      | { type: 'set_default_model' }
      | { type: 'validate_provider_model' }
    >,
  ) => Promise<unknown>
}

const catalogService = new ProviderCatalogService()
const providerSecretControlService = new ProviderSecretControlService({
  install: async (providerId, credential) => {
    const provider = catalogService
      .read()
      .providers.find(candidate => candidate.id === providerId)
    if (!provider) throw new Error('provider_not_found')
    await saveProviderCredentialSettings({ provider, credential })
  },
  now: Date.now,
})

const AUTH_METHODS = new Set<ProviderAuthMethod>([
  'claude-subscription-oauth',
  'anthropic-console-oauth',
  'chatgpt-device-oauth',
  'api-key',
  'bearer-token',
  'aws-iam',
  'gcp-adc',
  'azure-ad',
  'proxy',
])

function providerAuthMethod(providerId: string): ProviderAuthMethod {
  const provider = catalogService
    .read()
    .providers.find(candidate => candidate.id === providerId)
  if (!provider) throw new Error('provider_not_found')
  if (provider.kind === 'chatgpt') return 'chatgpt-device-oauth'
  if (provider.auth.scheme === 'oauth') return 'claude-subscription-oauth'
  if (provider.auth.scheme === 'api-key') return 'api-key'
  if (provider.auth.scheme === 'bearer') return 'bearer-token'
  return provider.auth.scheme
}

async function executeDefaultAuthCommand(
  command: Exclude<
    ProviderEnvironmentCommand,
    | { type: 'get_provider_catalog' }
    | { type: 'save_provider_profile' }
    | { type: 'archive_provider_profile' }
    | { type: 'save_model_profile' }
    | { type: 'archive_model_profile' }
    | { type: 'set_default_model' }
    | { type: 'validate_provider_model' }
  >,
): Promise<unknown> {
  switch (command.type) {
    case 'begin_provider_auth': {
      if (
        !command.method ||
        !AUTH_METHODS.has(command.method as ProviderAuthMethod)
      ) {
        throw new Error('invalid_provider_auth_method')
      }
      return providerAuthService.begin({
        operationId: command.operation_id,
        providerId: command.provider_id,
        method: command.method as ProviderAuthMethod,
      })
    }
    case 'get_provider_auth_status':
      return providerAuthService.get(command.auth_operation_id)
    case 'submit_provider_auth_code':
      return providerAuthService.submitCode(
        command.auth_operation_id,
        command.code,
      )
    case 'cancel_provider_auth':
      return providerAuthService.cancel(command.auth_operation_id)
    case 'remove_provider_auth':
      await providerAuthService.remove(providerAuthMethod(command.provider_id))
      return { configured: false }
    case 'refresh_provider_auth': {
      const method = providerAuthMethod(command.provider_id)
      await providerAuthService.refresh({ method, action: command.action })
      return { configured: true }
    }
    case 'begin_provider_secret': {
      const method = providerAuthMethod(command.provider_id)
      if (
        (method !== 'api-key' && method !== 'bearer-token') ||
        (command.method !== undefined && command.method !== method)
      ) {
        throw new Error('provider_secret_method_unsupported')
      }
      if (command.secret_envelope !== undefined) {
        return providerSecretControlService.submit({
          operationId: command.operation_id,
          providerId: command.provider_id,
          envelope: command.secret_envelope,
        })
      }
      return providerSecretControlService.begin({
        operationId: command.operation_id,
        providerId: command.provider_id,
      })
    }
  }
}

const defaultDependencies: ProviderEnvironmentCommandDependencies = {
  catalogService,
  detectedProfiles: () =>
    detectExistingProviderProfiles(getSettings_DEPRECATED() ?? {}, process.env),
  executeAuth: executeDefaultAuthCommand,
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_provider_command')
  }
  return value as Record<string, unknown>
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate = value[key]
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : undefined
}

function modelFromWork(value: unknown): ModelProfile {
  const input = record(value)
  const validation = record(input['validation'])
  return ModelProfileSchema.parse({
    id: input['id'],
    displayName: input['display_name'],
    remoteModelId: input['remote_model_id'],
    enabled: input['enabled'],
    archived: input['archived'],
    validation: { status: validation['status'] },
  })
}

function providerFromWork(value: unknown): ProviderProfile {
  const input = record(value)
  const auth = record(input['auth'])
  if (!Array.isArray(input['models']))
    throw new Error('invalid_provider_command')
  return ProviderProfileSchema.parse({
    id: input['id'],
    displayName: input['display_name'],
    kind: input['kind'],
    ...(optionalString(input, 'base_url') === undefined
      ? {}
      : { baseUrl: input['base_url'] }),
    auth: {
      scheme: auth['scheme'],
      source: auth['source'],
      ...(optionalString(auth, 'env_name') === undefined
        ? {}
        : { envName: auth['env_name'] }),
    },
    ...(optionalString(input, 'compat_rule') === undefined
      ? {}
      : { compatRule: input['compat_rule'] }),
    enabled: input['enabled'],
    archived: input['archived'],
    models: input['models'].map(modelFromWork),
  })
}

function buildCatalog(dependencies: ProviderEnvironmentCommandDependencies) {
  return buildProviderCatalogCapability(
    dependencies.catalogService.read(),
    dependencies.detectedProfiles(),
  )
}

async function defaultValidateModel(
  dependencies: ProviderEnvironmentCommandDependencies,
  providerId: string,
  modelProfileId: string,
): Promise<void> {
  const configuration = dependencies.catalogService.read()
  const provider = configuration.providers.find(item => item.id === providerId)
  const model = provider?.models.find(item => item.id === modelProfileId)
  if (provider === undefined)
    throw new ProviderCatalogError('provider_not_found')
  if (model === undefined) throw new ProviderCatalogError('model_not_found')
  resolveProviderRuntimeSnapshot(
    configuration,
    {
      providerId,
      modelProfileId,
      resolvedModelId: model.remoteModelId,
      providerConfigRevision: configuration.revision,
      updatedAt: Date.now(),
    },
    process.env,
    { isModelAllowed },
  )
}

function assertNever(value: never): never {
  throw new Error(`unsupported_provider_command:${JSON.stringify(value)}`)
}

/** Execute one allowlisted provider command without exposing credentials. */
export async function executeProviderEnvironmentCommand(
  command: ProviderEnvironmentCommand,
  dependencies: ProviderEnvironmentCommandDependencies = defaultDependencies,
): Promise<ProviderEnvironmentCommandResult> {
  try {
    switch (command.type) {
      case 'get_provider_catalog':
        return {
          kind: command.type,
          ok: true,
          catalog: buildCatalog(dependencies),
        }
      case 'save_provider_profile':
        dependencies.catalogService.mutate({
          operationId: command.operation_id,
          expectedRevision: command.expected_revision,
          mutation: {
            type: 'save_provider',
            provider: providerFromWork(command.provider),
          },
        })
        break
      case 'archive_provider_profile':
        dependencies.catalogService.mutate({
          operationId: command.operation_id,
          expectedRevision: command.expected_revision,
          mutation: {
            type: 'archive_provider',
            providerId: command.provider_id,
          },
        })
        break
      case 'save_model_profile':
        dependencies.catalogService.mutate({
          operationId: command.operation_id,
          expectedRevision: command.expected_revision,
          mutation: {
            type: 'save_model',
            providerId: command.provider_id,
            model: modelFromWork(command.model),
          },
        })
        break
      case 'archive_model_profile':
        dependencies.catalogService.mutate({
          operationId: command.operation_id,
          expectedRevision: command.expected_revision,
          mutation: {
            type: 'archive_model',
            providerId: command.provider_id,
            modelProfileId: command.model_profile_id,
          },
        })
        break
      case 'set_default_model':
        dependencies.catalogService.mutate({
          operationId: command.operation_id,
          expectedRevision: command.expected_revision,
          mutation: {
            type: 'set_default',
            model:
              command.model === null
                ? null
                : {
                    providerId: command.model.provider_id,
                    modelProfileId: command.model.model_profile_id,
                  },
            allowUnverified: command.allow_unverified,
          },
        })
        break
      case 'validate_provider_model': {
        await (
          dependencies.validateModel ??
          ((providerId, modelProfileId) =>
            defaultValidateModel(dependencies, providerId, modelProfileId))
        )(command.provider_id, command.model_profile_id)
        const configuration = dependencies.catalogService.read()
        const provider = configuration.providers.find(
          item => item.id === command.provider_id,
        )
        const model = provider?.models.find(
          item => item.id === command.model_profile_id,
        )
        if (provider === undefined)
          throw new ProviderCatalogError('provider_not_found')
        if (model === undefined)
          throw new ProviderCatalogError('model_not_found')
        dependencies.catalogService.mutate({
          operationId: command.operation_id,
          expectedRevision: command.expected_revision,
          mutation: {
            type: 'save_model',
            providerId: provider.id,
            model: { ...model, validation: { status: 'valid' } },
          },
        })
        break
      }
      case 'begin_provider_auth':
      case 'get_provider_auth_status':
      case 'submit_provider_auth_code':
      case 'cancel_provider_auth':
      case 'remove_provider_auth':
      case 'refresh_provider_auth':
      case 'begin_provider_secret':
        if (dependencies.executeAuth === undefined) {
          return {
            kind: command.type,
            ok: false,
            errorCode: 'provider_auth_unsupported',
            catalog: buildCatalog(dependencies),
          }
        }
        return {
          kind: command.type,
          ok: true,
          value: await dependencies.executeAuth(command),
          catalog: buildCatalog(dependencies),
        }
      default:
        assertNever(command)
    }
    return { kind: command.type, ok: true, catalog: buildCatalog(dependencies) }
  } catch (error) {
    if (error instanceof ProviderRevisionConflictError) {
      return {
        kind: command.type,
        ok: false,
        errorCode: 'provider_revision_conflict',
        catalog: buildProviderCatalogCapability(
          error.current,
          dependencies.detectedProfiles(),
        ),
      }
    }
    return {
      kind: command.type,
      ok: false,
      errorCode:
        error instanceof ProviderCatalogError
          ? error.code
          : error instanceof Error
            ? error.message
            : 'provider_command_failed',
      catalog: buildCatalog(dependencies),
    }
  }
}

export function isProviderEnvironmentCommand(command: {
  type: string
}): command is ProviderEnvironmentCommand {
  return new Set<ProviderEnvironmentCommand['type']>([
    'get_provider_catalog',
    'save_provider_profile',
    'archive_provider_profile',
    'save_model_profile',
    'archive_model_profile',
    'set_default_model',
    'validate_provider_model',
    'begin_provider_auth',
    'get_provider_auth_status',
    'submit_provider_auth_code',
    'cancel_provider_auth',
    'remove_provider_auth',
    'refresh_provider_auth',
    'begin_provider_secret',
  ]).has(command.type as ProviderEnvironmentCommand['type'])
}
