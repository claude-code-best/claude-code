import {
  storeDeleteProjectWithSessions,
  storeGetProject,
  storeListActiveEnvironments,
  storeListProjects,
  storeListSessionsByProject,
  storeUpdateProject,
} from '../store'
import { removeEventBus } from '../transport/event-bus'
import { runEnvironmentCommand } from './environment-command'

export const MISSING_RECHECK_MS = 5 * 60_000

export async function recordWorkspaceProbe(
  projectId: string,
  result: { online: boolean; exists: boolean },
  checkedAt = Date.now(),
): Promise<'ignored' | 'confirmed' | 'deleted'> {
  const project = storeGetProject(projectId)
  if (!project || project.product !== 'code' || project.state === 'active') {
    return 'ignored'
  }
  if (!result.online) return 'ignored'
  if (result.exists) {
    storeUpdateProject(project.id, {
      state: 'archived',
      missingConfirmedAt: null,
    })
    return 'confirmed'
  }

  if (project.missingConfirmedAt === null) {
    storeUpdateProject(project.id, {
      state: 'missing',
      missingConfirmedAt: new Date(checkedAt),
    })
    return 'confirmed'
  }
  if (checkedAt - project.missingConfirmedAt.getTime() < MISSING_RECHECK_MS) {
    return 'confirmed'
  }

  const deletedSessionIds = storeDeleteProjectWithSessions(project.id)
  for (const sessionId of deletedSessionIds ?? []) removeEventBus(sessionId)
  return deletedSessionIds ? 'deleted' : 'ignored'
}

export async function probeArchivedCodeProjects(): Promise<void> {
  const environments = storeListActiveEnvironments()
  const projects = storeListProjects().filter(
    project => project.product === 'code' && project.state !== 'active',
  )
  for (const project of projects) {
    const projectEnvironmentIds = new Set(
      storeListSessionsByProject(project.id).flatMap(session =>
        session.environmentId ? [session.environmentId] : [],
      ),
    )
    const environment = environments.find(
      candidate =>
        projectEnvironmentIds.has(candidate.id) &&
        candidate.deviceId === project.deviceId,
    )
    if (!environment || !project.canonicalPath) continue
    try {
      const result = await runEnvironmentCommand<{
        kind: 'probe_workspace'
        value: { exists: boolean; canonicalPath: string | null }
      }>({
        environmentId: environment.id,
        ownerId: project.ownerId,
        kind: 'probe_workspace',
        payload: { path: project.canonicalPath },
      })
      await recordWorkspaceProbe(project.id, {
        online: true,
        exists: result.value.exists,
      })
    } catch {
      await recordWorkspaceProbe(project.id, {
        online: false,
        exists: false,
      })
    }
  }
}
