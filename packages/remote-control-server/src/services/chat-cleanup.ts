import {
  storeDeleteProject,
  storeGetProject,
  storeGetSession,
  storeIsSessionOwner,
  storeListSessionsByProject,
} from '../store'
import { getPersistence } from '../persistence/runtime'
import { deleteSession } from './session'
import { runEnvironmentCommand } from './environment-command'

async function runCleanup(tombstone: {
  sessionId: string
  environmentId: string
  dataDirectory: string
  browserScopeId: string
  attemptCount: number
  createdAt: number
}): Promise<boolean> {
  try {
    await runEnvironmentCommand({
      environmentId: tombstone.environmentId,
      ownerId: tombstone.sessionId,
      kind: 'cleanup_chat_session',
      payload: {
        dataDirectory: tombstone.dataDirectory,
        browserScopeId: tombstone.browserScopeId,
      },
    })
    getPersistence().deleteCleanupTombstone(tombstone.sessionId)
    return true
  } catch (error) {
    getPersistence().upsertCleanupTombstone({
      ...tombstone,
      attemptCount: tombstone.attemptCount + 1,
      lastError: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    })
    return false
  }
}

export async function deleteChatSession(
  sessionId: string,
  ownerId: string,
): Promise<{ cleanupPending: boolean }> {
  const session = storeGetSession(sessionId)
  if (
    !session ||
    session.product !== 'chat' ||
    !storeIsSessionOwner(sessionId, ownerId)
  ) {
    throw new Error('Chat session not found')
  }
  if (!session.runtimeEnvironmentId || !session.dataDirectory) {
    throw new Error('Chat session cleanup metadata is incomplete')
  }
  const now = Date.now()
  const tombstone = {
    sessionId,
    environmentId: session.runtimeEnvironmentId,
    dataDirectory: session.dataDirectory,
    browserScopeId: sessionId,
    attemptCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  }
  getPersistence().upsertCleanupTombstone(tombstone)
  deleteSession(sessionId)
  return { cleanupPending: !(await runCleanup(tombstone)) }
}

export async function deleteChatProject(
  projectId: string,
  ownerId: string,
): Promise<{ cleanupPending: boolean }> {
  const project = storeGetProject(projectId)
  if (!project || project.product !== 'chat' || project.ownerId !== ownerId) {
    throw new Error('Chat project not found')
  }
  const results = await Promise.all(
    storeListSessionsByProject(project.id).map(session =>
      deleteChatSession(session.id, ownerId),
    ),
  )
  storeDeleteProject(project.id)
  return { cleanupPending: results.some(result => result.cleanupPending) }
}

export async function retryChatCleanupTombstones(): Promise<void> {
  for (const tombstone of getPersistence().listCleanupTombstones()) {
    await runCleanup(tombstone)
  }
}
