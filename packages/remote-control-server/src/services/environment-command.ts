import { randomUUID } from 'node:crypto'
import type {
  EnvironmentCommandKind,
  ResolvedWorkspace,
} from '../domain/product'
import type { PersistedEnvironmentCommand } from '../persistence/types'
import { getPersistence } from '../persistence/runtime'
import { storeGetEnvironment, storeUpdateEnvironment } from '../store'
import { readEnvironmentProviderCatalog } from './provider-catalog'
import { notifyWorkAvailable } from './work-signal'

const PROVIDER_COMMAND_KINDS = new Set<EnvironmentCommandKind>([
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
])

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
    | 'save_provider_profile'
    | 'archive_provider_profile'
    | 'save_model_profile'
    | 'archive_model_profile'
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
    createdAt: now,
    updatedAt: now,
  }
  getPersistence().createEnvironmentCommand(command)
  notifyWorkAvailable(input.environmentId)
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
    },
  })
}

export async function runEnvironmentCommand<T extends EnvironmentCommandResult>(
  input: EnvironmentCommandInput,
  timeoutMs = 5_000,
): Promise<T> {
  const command = createEnvironmentCommand(input)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const current = getPersistence().getEnvironmentCommand(command.id)
    if (!current) throw new Error('environment command disappeared')
    if (current.state === 'completed') return current.result as T
    if (current.state === 'failed') {
      throw new Error(current.error ?? 'environment command failed')
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(25, timeoutMs)))
  }

  getPersistence().completeEnvironmentCommand(
    command.id,
    null,
    `Environment command timed out after ${timeoutMs}ms`,
    Date.now(),
  )
  throw new Error(`Environment command timed out after ${timeoutMs}ms`)
}
