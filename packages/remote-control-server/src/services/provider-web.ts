import { randomUUID } from 'node:crypto'
import { storeGetEnvironment, type EnvironmentRecord } from '../store'
import {
  runEnvironmentCommand,
  type ProviderEnvironmentCommandResult,
} from './environment-command'
import {
  readEnvironmentProviderCatalog,
  type EnvironmentProviderCatalog,
} from './provider-catalog'
import type { EnvironmentCommandKind } from '../domain/product'

export class ProviderWebError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 403 | 404 | 409 | 422 | 502 | 504,
    readonly catalog?: EnvironmentProviderCatalog,
  ) {
    super(code)
    this.name = 'ProviderWebError'
  }
}

export type ProviderWebCommandInput = {
  environmentId: string
  accountId: string
  ownerId: string
  kind: Extract<
    EnvironmentCommandKind,
    | `${string}provider${string}`
    | 'set_default_model'
    | 'save_model_profile'
    | 'archive_model_profile'
  >
  payload: Record<string, unknown>
  write?: boolean
}

function readCatalog(environment: EnvironmentRecord) {
  return readEnvironmentProviderCatalog(environment.capabilities)
}

export function requireOwnedProviderEnvironment(
  environmentId: string,
  accountId: string,
  write = false,
): EnvironmentRecord {
  const environment = storeGetEnvironment(environmentId)
  if (!environment) throw new ProviderWebError('environment_not_found', 404)
  if (environment.accountId !== accountId) {
    throw new ProviderWebError('environment_forbidden', 403)
  }
  if (environment.status !== 'active') {
    throw new ProviderWebError('environment_offline', 409)
  }
  if (write) {
    const catalog = readCatalog(environment)
    if (!catalog.supported || !catalog.catalog.features.catalogWrite) {
      throw new ProviderWebError('provider_management_unsupported', 409)
    }
  }
  return environment
}

function parseWorkerCatalog(value: unknown): EnvironmentProviderCatalog {
  const parsed = readEnvironmentProviderCatalog({
    provider_model_catalog_v1: value,
  })
  if (!parsed.supported) {
    throw new ProviderWebError('invalid_provider_worker_response', 502)
  }
  return parsed.catalog
}

function statusForWorkerError(code: string): ProviderWebError['status'] {
  if (code === 'provider_not_found' || code === 'model_not_found') return 404
  if (
    code === 'provider_revision_conflict' ||
    code === 'provider_operation_conflict' ||
    code === 'default_model_conflict'
  ) {
    return 409
  }
  if (
    code === 'authentication_required' ||
    code === 'model_not_allowed' ||
    code === 'invalid_model' ||
    code === 'provider_unavailable' ||
    code === 'model_unavailable' ||
    code === 'unverified_model_confirmation_required'
  ) {
    return 422
  }
  return 400
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && /timed out/i.test(error.message)
}

export async function runProviderWebCommand(
  input: ProviderWebCommandInput,
): Promise<{
  catalog: EnvironmentProviderCatalog
  stale: boolean
  value?: unknown
}> {
  const environment = requireOwnedProviderEnvironment(
    input.environmentId,
    input.accountId,
    input.write,
  )
  try {
    const result =
      await runEnvironmentCommand<ProviderEnvironmentCommandResult>({
        environmentId: environment.id,
        ownerId: input.ownerId,
        kind: input.kind,
        payload: input.payload,
      })
    const catalog = parseWorkerCatalog(result.catalog)
    if (!result.ok) {
      const code = result.errorCode ?? 'provider_command_failed'
      throw new ProviderWebError(code, statusForWorkerError(code), catalog)
    }
    return {
      catalog,
      stale: false,
      ...(result.value === undefined ? {} : { value: result.value }),
    }
  } catch (error) {
    if (error instanceof ProviderWebError) throw error
    if (!input.write && isTimeout(error)) {
      const fallback = readCatalog(environment)
      if (fallback.supported) {
        return { catalog: fallback.catalog, stale: true }
      }
    }
    if (isTimeout(error)) {
      throw new ProviderWebError('provider_command_timeout', 504)
    }
    throw new ProviderWebError('provider_command_failed', 502)
  }
}

export function providerOperationId(value: unknown): string {
  if (value === undefined) return randomUUID()
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/i.test(value)) {
    throw new ProviderWebError('invalid_operation_id', 400)
  }
  return value
}

export function providerExpectedRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ProviderWebError('invalid_expected_revision', 400)
  }
  return value as number
}
