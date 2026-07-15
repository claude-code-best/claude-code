import type { Product, ResolvedWorkspace } from '../domain/product'
import {
  type SessionRecord,
  storeBindSession,
  storeCreateSession,
  storeGetProject,
  storeGetEnvironment,
  storeGetSession,
  storeIsSessionOwner,
  storeListSessionsByOwnerUuid,
  storeListActiveEnvironmentsByAccountId,
  storeUpdateSession,
} from '../store'
import { ensureWorkItem } from './work-dispatch'
import { upsertCodeProject } from './project'
import {
  runEnvironmentCommand,
  type EnvironmentCommandResult,
} from './environment-command'
import { resolveDefaultSessionModel } from './provider-catalog'

export interface CreateProductSessionInput {
  ownerId: string
  product: Product
  projectId: string | null
  environmentId: string | null
  runtimeEnvironmentId?: string | null
  directory: string | null
  dataDirectory: string | null
  title: string | null
  permissionMode: string | null
}

function assertProjectForSession(
  ownerId: string,
  product: Product,
  projectId: string | null,
): void {
  if (projectId === null) {
    if (product === 'code') return
    return
  }
  const project = storeGetProject(projectId)
  if (!project || project.ownerId !== ownerId)
    throw new Error('project not found')
  if (project.product !== product) throw new Error('project product mismatch')
}

export function createProductSession(
  input: CreateProductSessionInput,
): SessionRecord {
  assertProjectForSession(input.ownerId, input.product, input.projectId)
  const project = input.projectId ? storeGetProject(input.projectId) : undefined
  const runtimeEnvironmentId =
    input.runtimeEnvironmentId ?? input.environmentId ?? null
  const runtimeEnvironment = runtimeEnvironmentId
    ? storeGetEnvironment(runtimeEnvironmentId)
    : undefined
  const session = storeCreateSession({
    environmentId: input.environmentId,
    title: input.title,
    source: 'web',
    permissionMode: input.permissionMode,
    directory: input.directory,
    product: input.product,
    projectId: input.projectId,
    runtimeEnvironmentId,
    dataDirectory: input.dataDirectory,
    projectPromptRevision: project?.promptRevision ?? null,
    modelSelection: runtimeEnvironment
      ? resolveDefaultSessionModel(runtimeEnvironment)
      : null,
  })
  storeBindSession(session.id, input.ownerId)
  return session
}

export type CreateCodeProductSessionInput = {
  ownerId: string
  accountId: string
  environmentId: string
  requestedDirectory: string
  title: string | null
  permissionMode: string | null
}

export type CreateCodeProductSessionDependencies = {
  resolveWorkspace: (
    environmentId: string,
    requestedDirectory: string,
  ) => Promise<ResolvedWorkspace>
}

function remoteSessionDataDirectory(
  workspace: string,
  sessionId: string,
): string {
  const separator = workspace.includes('\\') ? '\\' : '/'
  return [
    workspace.replace(/[\\/]+$/, ''),
    '.real-agentc',
    'sessions',
    sessionId,
  ].join(separator)
}

async function resolveWorkspaceThroughEnvironment(
  environmentId: string,
  requestedDirectory: string,
): Promise<ResolvedWorkspace> {
  const environment = storeGetEnvironment(environmentId)
  if (!environment?.deviceId) {
    throw new Error('environment does not support workspace inspection')
  }
  const result = await runEnvironmentCommand<EnvironmentCommandResult>({
    environmentId,
    ownerId: environment.accountId,
    kind: 'resolve_workspace',
    payload: {
      path: requestedDirectory,
      deviceId: environment.deviceId,
    },
  })
  if (result.kind !== 'resolve_workspace') {
    throw new Error('invalid workspace resolution result')
  }
  return result.value
}

export async function createCodeProductSession(
  input: CreateCodeProductSessionInput,
  dependencies: CreateCodeProductSessionDependencies = {
    resolveWorkspace: resolveWorkspaceThroughEnvironment,
  },
): Promise<SessionRecord> {
  const environment = storeGetEnvironment(input.environmentId)
  if (
    !environment ||
    environment.status !== 'active' ||
    environment.accountId !== input.accountId
  ) {
    throw new Error('environment not found or offline')
  }
  if (!input.requestedDirectory.trim()) {
    throw new Error('requested directory is required')
  }

  const workspace = await dependencies.resolveWorkspace(
    input.environmentId,
    input.requestedDirectory,
  )
  if (environment.deviceId && workspace.deviceId !== environment.deviceId) {
    throw new Error('workspace device mismatch')
  }
  const project = upsertCodeProject(input.ownerId, workspace)
  const session = createProductSession({
    ownerId: input.ownerId,
    product: 'code',
    projectId: project.id,
    environmentId: input.environmentId,
    runtimeEnvironmentId: input.environmentId,
    directory: workspace.canonicalPath,
    dataDirectory: null,
    title: input.title,
    permissionMode: input.permissionMode,
  })
  storeUpdateSession(session.id, {
    dataDirectory: remoteSessionDataDirectory(
      workspace.canonicalPath,
      session.id,
    ),
  })
  ensureWorkItem(input.environmentId, session.id)
  return storeGetSession(session.id)!
}

export function assignChatSessionProject(
  sessionId: string,
  projectId: string | null,
  ownerId: string,
): SessionRecord {
  const session = storeGetSession(sessionId)
  if (!session || !storeIsSessionOwner(sessionId, ownerId)) {
    throw new Error('session not found')
  }
  if (session.product !== 'chat') throw new Error('session product mismatch')
  assertProjectForSession(ownerId, 'chat', projectId)
  const project = projectId ? storeGetProject(projectId) : undefined
  storeUpdateSession(sessionId, {
    projectId,
    projectPromptRevision: project?.promptRevision ?? null,
  })
  return storeGetSession(sessionId)!
}

export function createChatProductSession(input: {
  ownerId: string
  accountId: string
  projectId: string | null
  title: string | null
}): SessionRecord {
  const environment = storeListActiveEnvironmentsByAccountId(
    input.accountId,
  ).find(
    candidate =>
      candidate.workerType !== 'acp' &&
      candidate.capabilities?.chat === true &&
      candidate.capabilities?.chat_sandbox === true,
  )
  if (!environment) throw new Error('no Chat runtime is online')

  const session = createProductSession({
    ownerId: input.ownerId,
    product: 'chat',
    projectId: input.projectId,
    environmentId: environment.id,
    runtimeEnvironmentId: environment.id,
    directory: null,
    dataDirectory: null,
    title: input.title,
    permissionMode: 'default',
  })
  storeUpdateSession(session.id, {
    dataDirectory: `~/.real-agentc/chat-sessions/${session.id}`,
  })
  ensureWorkItem(environment.id, session.id)
  return storeGetSession(session.id)!
}

export function listSessionsByProduct(
  ownerId: string,
  product: Product,
  includeArchived = false,
): SessionRecord[] {
  return storeListSessionsByOwnerUuid(ownerId).filter(
    session =>
      session.product === product &&
      (includeArchived || session.status !== 'archived'),
  )
}
