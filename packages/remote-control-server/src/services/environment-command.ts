import { randomUUID } from 'node:crypto'
import type {
  EnvironmentCommandKind,
  ResolvedWorkspace,
} from '../domain/product'
import type { PersistedEnvironmentCommand } from '../persistence/types'
import { getPersistence } from '../persistence/runtime'

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
    throw new Error('environment command is already complete')
  }
  return persistence.getEnvironmentCommand(command.id)!
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
