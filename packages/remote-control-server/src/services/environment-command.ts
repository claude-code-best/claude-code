import { randomUUID } from 'node:crypto'
import type {
  EnvironmentCommandKind,
  ResolvedWorkspace,
} from '../domain/product'
import type { PersistedEnvironmentCommand } from '../persistence/types'
import { getPersistence } from '../persistence/runtime'
import {
  storeGetEnvironment,
  storeUpdateEnvironment,
  storeGetSession,
  storeUpdateSession,
  storeUpsertSessionWorker,
} from '../store'
import { readEnvironmentProviderCatalog } from './provider-catalog'
import { notifyWorkAvailable } from './work-signal'

const PROVIDER_COMMAND_KINDS = new Set<EnvironmentCommandKind>([
  'get_provider_catalog',
  'discover_provider_models',
  'save_provider_profile',
  'archive_provider_profile',
  'delete_provider_profile',
  'save_model_profile',
  'archive_model_profile',
  'delete_model_profile',
  'set_default_model',
  'validate_provider_model',
  'begin_provider_auth',
  'get_provider_auth_status',
  'submit_provider_auth_code',
  'cancel_provider_auth',
  'remove_provider_auth',
  'refresh_provider_auth',
  'begin_provider_secret',
])

export function isProviderEnvironmentCommandKind(
  kind: EnvironmentCommandKind,
): boolean {
  return PROVIDER_COMMAND_KINDS.has(kind)
}

export type RemoteDirectoryListing = {
  path: string
  entries: Array<{
    name: string
    kind: 'directory' | 'file'
  }>
}

export type EnvironmentCommandResult =
  | { kind: 'list_directory'; value: RemoteDirectoryListing }
  | { kind: 'resolve_workspace'; value: ResolvedWorkspace }
  | {
      kind: 'cleanup_chat_session'
      value: { removed: boolean; closedTabIds: number[] }
    }
  | {
      kind: 'probe_workspace'
      value: { exists: boolean; canonicalPath: string | null }
    }
  | ProviderEnvironmentCommandResult

export type ProviderEnvironmentCommandResult = {
  kind:
    | 'get_provider_catalog'
    | 'discover_provider_models'
    | 'save_provider_profile'
    | 'archive_provider_profile'
    | 'delete_provider_profile'
    | 'save_model_profile'
    | 'archive_model_profile'
    | 'delete_model_profile'
    | 'set_default_model'
    | 'validate_provider_model'
    | 'begin_provider_auth'
    | 'get_provider_auth_status'
    | 'submit_provider_auth_code'
    | 'cancel_provider_auth'
    | 'remove_provider_auth'
    | 'refresh_provider_auth'
    | 'begin_provider_secret'
  ok: boolean
  catalog?: unknown
  errorCode?: string
  value?: unknown
}

export type EnvironmentCommandInput = {
  environmentId: string
  ownerId: string
  kind: EnvironmentCommandKind
  payload: Record<string, unknown>
  operationId?: string
  dedupeKey?: string
  priority?: number
  expiresAt?: number
  maxAttempts?: number
  /** Keep an asynchronous operation pending when the HTTP wait window ends. */
  expireOnTimeout?: boolean
}

export function createEnvironmentCommand(
  input: EnvironmentCommandInput,
): PersistedEnvironmentCommand {
  const now = Date.now()
  const command: PersistedEnvironmentCommand = {
    id: `cmd_${randomUUID().replaceAll('-', '')}`,
    environmentId: input.environmentId,
    ownerId: input.ownerId,
    kind: input.kind,
    payload: input.payload,
    state: 'pending',
    result: null,
    error: null,
    attemptCount: 0,
    operationId: input.operationId ?? null,
    dedupeKey: input.dedupeKey ?? null,
    priority:
      input.priority ??
      (input.kind === 'terminate_session'
        ? 0
        : input.kind === 'cleanup_chat_session'
          ? 10
          : 100),
    expiresAt:
      input.expiresAt ??
      now + (input.kind === 'terminate_session' ? 30_000 : 120_000),
    maxAttempts:
      input.maxAttempts ?? (input.kind === 'terminate_session' ? 3 : 2),
    createdAt: now,
    updatedAt: now,
  }
  getPersistence().createEnvironmentCommand(command)
  notifyWorkAvailable(input.environmentId, 'control')
  return command
}

export function completeEnvironmentCommand(input: {
  commandId: string
  environmentId: string
  result?: unknown
  error?: string
}): PersistedEnvironmentCommand {
  const persistence = getPersistence()
  const command = persistence.getEnvironmentCommand(input.commandId)
  if (!command || command.environmentId !== input.environmentId) {
    throw new Error('environment command not found')
  }
  const hasResult = input.result !== undefined
  const hasError = input.error !== undefined
  if (hasResult === hasError) {
    throw new Error('environment command completion requires result or error')
  }

  const changed = persistence.completeEnvironmentCommand(
    command.id,
    hasResult ? input.result : null,
    hasError ? input.error! : null,
    Date.now(),
  )
  if (!changed) {
    return persistence.getEnvironmentCommand(command.id)!
  }
  if (hasResult && PROVIDER_COMMAND_KINDS.has(command.kind)) {
    updateEnvironmentProviderCapability(input.environmentId, input.result)
  }
  if (command.kind === 'terminate_session') {
    const sessionId =
      typeof command.payload.sessionId === 'string'
        ? command.payload.sessionId
        : null
    const session = sessionId ? storeGetSession(sessionId) : undefined
    if (session && session.status !== 'archived') {
      storeUpdateSession(session.id, {
        status: hasResult ? 'idle' : 'error',
      })
      storeUpsertSessionWorker(session.id, {
        workerStatus: hasResult ? 'offline' : 'error',
      })
    }
  }
  return persistence.getEnvironmentCommand(command.id)!
}

function updateEnvironmentProviderCapability(
  environmentId: string,
  result: unknown,
): void {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    return
  }
  const catalog = (result as Record<string, unknown>)['catalog']
  const parsed = readEnvironmentProviderCatalog({
    provider_model_catalog_v1: catalog,
  })
  if (!parsed.supported) return
  const environment = storeGetEnvironment(environmentId)
  if (!environment) return
  storeUpdateEnvironment(environmentId, {
    capabilities: {
      ...(environment.capabilities ?? {}),
      provider_model_catalog_v1: parsed.catalog,
      provider_model_catalog_refreshed_at_ms: Date.now(),
    },
  })
}

export async function runEnvironmentCommand<T extends EnvironmentCommandResult>(
  input: EnvironmentCommandInput,
  timeoutMs = 5_000,
): Promise<T> {
  const existingCommands = getPersistence().listEnvironmentCommands(
    input.environmentId,
  )
  const command =
    (input.operationId === undefined
      ? undefined
      : existingCommands.find(
          candidate => candidate.operationId === input.operationId,
        )) ??
    (input.dedupeKey === undefined
      ? undefined
      : existingCommands.find(
          candidate =>
            candidate.dedupeKey === input.dedupeKey &&
            (candidate.state === 'pending' || candidate.state === 'dispatched'),
        )) ??
    createEnvironmentCommand(input)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const current = getPersistence().getEnvironmentCommand(command.id)
    if (!current) throw new Error('environment command disappeared')
    if (current.state === 'completed') return current.result as T
    if (
      current.state === 'failed' ||
      current.state === 'expired' ||
      current.state === 'cancelled'
    ) {
      throw new Error(current.error ?? 'environment command failed')
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(25, timeoutMs)))
  }

  const persistence = getPersistence()
  const current = persistence.getEnvironmentCommand(command.id)
  if (
    input.expireOnTimeout !== false &&
    current &&
    (current.state === 'pending' || current.state === 'dispatched')
  ) {
    persistence.expireEnvironmentCommand(
      command.id,
      `Environment command timed out after ${timeoutMs}ms`,
      Date.now(),
    )
  }
  throw new Error(`Environment command timed out after ${timeoutMs}ms`)
}
