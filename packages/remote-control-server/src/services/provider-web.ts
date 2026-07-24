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

const PROVIDER_CATALOG_TTL_MS = 5 * 60 * 1000

export class ProviderWebError extends Error {
  constructor(
    readonly code: string,
    readonly status: 202 | 400 | 403 | 404 | 409 | 422 | 502 | 503 | 504,
    readonly catalog?: EnvironmentProviderCatalog,
    readonly operationId?: string,
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
    | 'delete_model_profile'
  >
  payload: Record<string, unknown>
  write?: boolean
  forceRefresh?: boolean
}

function readCatalog(environment: EnvironmentRecord) {
  return readEnvironmentProviderCatalog(environment.capabilities)
}

function catalogIsStale(environment: EnvironmentRecord): boolean {
  if (environment.status !== 'active') return true
  const refreshedAt =
    environment.capabilities?.['provider_model_catalog_refreshed_at_ms']
  return (
    typeof refreshedAt === 'number' &&
    Date.now() - refreshedAt > PROVIDER_CATALOG_TTL_MS
  )
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
  if (write && environment.status !== 'active') {
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
    code === 'authentication_failed' ||
    code === 'model_discovery_unsupported_provider' ||
    code === 'model_list_unsupported' ||
    code === 'model_discovery_rate_limited' ||
    code === 'invalid_model_discovery_response' ||
    code === 'model_not_allowed' ||
    code === 'invalid_model' ||
    code === 'provider_unavailable' ||
    code === 'model_unavailable' ||
    code === 'unverified_model_confirmation_required'
  ) {
    return 422
  }
  if (code === 'provider_unreachable') return 502
  if (code === 'model_discovery_timeout') return 504
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
  // Catalog reads are cache-first. They never consume a Worker slot and do
  // not create a durable command when registration has already supplied a
  // capability snapshot. The stale marker is deliberate: the web UI can
  // render immediately while an explicit refresh/write updates the snapshot.
  if (
    !input.write &&
    !input.forceRefresh &&
    input.kind === 'get_provider_catalog'
  ) {
    const cached = readCatalog(environment)
    if (cached.supported) {
      const stale = catalogIsStale(environment)
      if (stale && environment.status === 'active') {
        // Refresh in the background. The dedupe key in
        // runEnvironmentCommand guarantees one active catalog refresh per
        // environment even when many GETs arrive at once.
        void runEnvironmentCommand<ProviderEnvironmentCommandResult>(
          {
            environmentId: environment.id,
            ownerId: input.ownerId,
            kind: 'get_provider_catalog',
            payload: {},
            dedupeKey: `provider-catalog:${environment.id}`,
            expireOnTimeout: true,
          },
          5_000,
        ).catch(() => undefined)
      }
      return { catalog: cached.catalog, stale }
    }
    // A normal GET is never allowed to turn into a five-second Worker wait.
    // Callers that explicitly request refresh=1 may opt into a remote probe.
    if (!input.forceRefresh || environment.status !== 'active') {
      throw new ProviderWebError('catalog_unavailable', 503)
    }
  }
  const operationId =
    input.write && typeof input.payload.operationId === 'string'
      ? input.payload.operationId
      : input.write
        ? randomUUID()
        : undefined
  try {
    const result =
      await runEnvironmentCommand<ProviderEnvironmentCommandResult>(
        {
          environmentId: environment.id,
          ownerId: input.ownerId,
          kind: input.kind,
          payload:
            operationId === undefined
              ? input.payload
              : { ...input.payload, operationId },
          operationId,
          dedupeKey:
            input.kind === 'get_provider_catalog'
              ? `provider-catalog:${environment.id}`
              : undefined,
          expireOnTimeout: !input.write,
        },
        input.write ? 1_500 : 5_000,
      )
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
    if (input.write && isTimeout(error)) {
      const cached = readCatalog(environment)
      throw new ProviderWebError(
        'provider_operation_pending',
        202,
        cached.supported ? cached.catalog : undefined,
        operationId,
      )
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
