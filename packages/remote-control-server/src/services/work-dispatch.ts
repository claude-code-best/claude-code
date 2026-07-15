import { log, error as logError } from '../logger'
import {
  storeCreateWorkItem,
  storeGetWorkItem,
  storeGetPendingWorkItem,
  storeGetSession,
  storeUpdateWorkItem,
  storeListSessionsByEnvironment,
  storeGetEnvironment,
  storeGetOpenWorkItemForSession,
  storeUpdateSession,
  storeUpsertSessionWorker,
  storeGetProject,
} from '../store'
import { config } from '../config'
import { getBaseUrl } from '../config'
import type { WorkResponse } from '../types/api'
import { getPersistence } from '../persistence/runtime'
import type { PersistedEnvironmentCommand } from '../persistence/types'
import {
  readEnvironmentProviderCatalog,
  toSessionModelSelectionPayload,
} from './provider-catalog'
import { recoverLegacySessionModel } from './session-model'

/** Encode work secret as base64 JSON (no JWT — just API key as token) */
function encodeWorkSecret(useCodeSessions = false): string {
  const payload = {
    version: 1,
    session_ingress_token: config.apiKeys[0] || '',
    api_base_url: getBaseUrl(),
    sources: [] as string[],
    auth: [] as string[],
    use_code_sessions: useCodeSessions,
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export async function createWorkItem(
  environmentId: string,
  sessionId: string,
): Promise<string> {
  return ensureWorkItem(environmentId, sessionId)
}

export function ensureWorkItem(
  environmentId: string,
  sessionId: string,
): string {
  const existing = storeGetOpenWorkItemForSession(sessionId)
  if (existing?.environmentId === environmentId) return existing.id
  if (existing) storeUpdateWorkItem(existing.id, { state: 'completed' })

  // Validate environment exists and is active
  const env = storeGetEnvironment(environmentId)
  if (!env) {
    throw new Error(`Environment ${environmentId} not found`)
  }
  if (env.status !== 'active') {
    throw new Error(
      `Environment ${environmentId} is not active (status: ${env.status})`,
    )
  }

  const session = storeGetSession(sessionId)
  const secret = encodeWorkSecret(session?.product === 'code')
  const record = storeCreateWorkItem({ environmentId, sessionId, secret })
  log(
    `[RCS] Work item created: ${record.id} for env=${environmentId} session=${sessionId}`,
  )
  return record.id
}

/** Long-poll for work — blocks until work is available or timeout.
 *  Returns null when no work is available, matching the CLI bridge client protocol. */
export async function pollWork(
  environmentId: string,
  timeoutSeconds = config.pollTimeout,
): Promise<WorkResponse | null> {
  const deadline = Date.now() + timeoutSeconds * 1000

  while (Date.now() < deadline) {
    const command =
      getPersistence().listPendingEnvironmentCommands(environmentId)[0]
    if (
      command &&
      getPersistence().markEnvironmentCommandDispatched(command.id, Date.now())
    ) {
      return environmentCommandToWork(command)
    }

    const item = storeGetPendingWorkItem(environmentId)

    if (item) {
      // Per-session working-directory override (web "choose folder" flow) —
      // delivered with the work item so the bridge spawns the child CLI there.
      const session = storeGetSession(item.sessionId)
      const secret = encodeWorkSecret(session?.product === 'code')
      storeUpdateWorkItem(item.id, { state: 'dispatched', secret })
      const projectPrompt = session?.projectId
        ? storeGetProject(session.projectId)?.projectPrompt
        : undefined
      let persistedModelSelection = session?.modelSelection ?? null
      if (session && persistedModelSelection === null) {
        const environment = storeGetEnvironment(environmentId)
        const catalog = readEnvironmentProviderCatalog(
          environment?.capabilities,
        )
        if (catalog.supported) {
          const recovered = recoverLegacySessionModel(
            session,
            catalog.catalog,
            getPersistence().getLatestSessionInitEvent(session.id),
          )
          if (recovered.persistedSelection !== null) {
            persistedModelSelection = recovered.persistedSelection
            storeUpdateSession(session.id, {
              modelSelection: recovered.persistedSelection,
            })
          }
        }
      }
      const modelSelection = persistedModelSelection
        ? toSessionModelSelectionPayload(persistedModelSelection)
        : null

      return {
        id: item.id,
        type: 'work',
        environment_id: environmentId,
        state: 'dispatched',
        data: {
          type: 'session',
          id: item.sessionId,
          ...(session?.directory ? { directory: session.directory } : {}),
          ...(session
            ? {
                product: session.product,
                project_id: session.projectId,
                ...(session.dataDirectory
                  ? { artifact_directory: session.dataDirectory }
                  : {}),
                ...(projectPrompt ? { project_prompt: projectPrompt } : {}),
                ...(modelSelection ? { model_selection: modelSelection } : {}),
              }
            : {}),
        },
        secret,
        created_at: item.createdAt.toISOString(),
      }
    }

    await new Promise(r => setTimeout(r, 500))
  }

  return null
}

function environmentCommandToWork(
  command: PersistedEnvironmentCommand,
): WorkResponse {
  let data: WorkResponse['data']
  switch (command.kind) {
    case 'list_directory':
      data = {
        type: command.kind,
        path: String(command.payload.path ?? ''),
      }
      break
    case 'resolve_workspace':
      data = {
        type: command.kind,
        path: String(command.payload.path ?? ''),
        device_id: String(command.payload.deviceId ?? ''),
      }
      break
    case 'cleanup_chat_session':
      data = {
        type: command.kind,
        data_directory: String(command.payload.dataDirectory ?? ''),
        browser_scope_id: String(command.payload.browserScopeId ?? ''),
      }
      break
    case 'probe_workspace':
      data = {
        type: command.kind,
        path: String(command.payload.path ?? ''),
      }
      break
  }

  return {
    id: command.id,
    type: 'work',
    environment_id: command.environmentId,
    state: 'dispatched',
    data,
    secret: encodeWorkSecret(),
    created_at: new Date(command.createdAt).toISOString(),
  }
}

export function ackWork(workId: string) {
  storeUpdateWorkItem(workId, { state: 'acked' })
}

export function stopWork(workId: string) {
  storeUpdateWorkItem(workId, { state: 'completed' })
}

export function heartbeatWork(workId: string): {
  lease_extended: boolean
  state: string
  last_heartbeat: string
  ttl_seconds: number
} {
  storeUpdateWorkItem(workId, {} as any) // just bump updatedAt
  const item = storeGetWorkItem(workId)
  const now = new Date()
  return {
    lease_extended: true,
    state: item?.state ?? 'acked',
    last_heartbeat: now.toISOString(),
    ttl_seconds: config.heartbeatInterval * 2,
  }
}

/** Reconnect: re-queue sessions associated with an environment */
export function reconnectWorkForEnvironment(envId: string) {
  getPersistence().requeueDispatchedEnvironmentCommands(envId, Date.now())
  const resumableSessions = storeListSessionsByEnvironment(envId).filter(
    session => session.status !== 'archived',
  )
  const promises = resumableSessions.map(session => {
    const oldWork = storeGetOpenWorkItemForSession(session.id)
    if (oldWork && oldWork.state !== 'pending') {
      storeUpdateWorkItem(oldWork.id, { state: 'completed' })
    }
    if (session.status !== 'idle') {
      storeUpdateSession(session.id, { status: 'idle' })
    }
    storeUpsertSessionWorker(session.id, { workerStatus: 'offline' })
    return createWorkItem(envId, session.id)
  })
  return Promise.all(promises)
}
