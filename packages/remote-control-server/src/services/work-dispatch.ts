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
import type { ProviderEnvironmentCommandWorkData } from '../types/api'
import { getPersistence } from '../persistence/runtime'
import type { PersistedEnvironmentCommand } from '../persistence/types'
import {
  readEnvironmentProviderCatalog,
  toSessionModelSelectionPayload,
} from './provider-catalog'
import { recoverLegacySessionModel } from './session-model'
import { providerSecretRelay } from './provider-secret-relay'
import {
  getWorkSignalGeneration,
  notifyWorkAvailable,
  waitForWorkSignal,
} from './work-signal'

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
  if (existing?.environmentId === environmentId) {
    notifyWorkAvailable(environmentId)
    return existing.id
  }
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
  notifyWorkAvailable(environmentId)
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

  while (true) {
    const generation = getWorkSignalGeneration(environmentId)
    const work = takeAvailableWork(environmentId)
    if (work) return work

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) return null
    await waitForWorkSignal(environmentId, generation, remainingMs)
  }
}

function takeAvailableWork(environmentId: string): WorkResponse | null {
  while (true) {
    const command =
      getPersistence().listPendingEnvironmentCommands(environmentId)[0]
    if (
      command &&
      getPersistence().markEnvironmentCommandDispatched(command.id, Date.now())
    ) {
      try {
        return environmentCommandToWork(command)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'environment_command_dispatch_failed'
        getPersistence().completeEnvironmentCommand(
          command.id,
          null,
          message,
          Date.now(),
        )
        logError(
          `[RCS] Failed to dispatch environment command ${command.id}: ${message}`,
        )
        continue
      }
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

    return null
  }
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
    case 'get_provider_catalog':
      data = { type: command.kind }
      break
    case 'save_provider_profile':
      data = {
        type: command.kind,
        operation_id: requiredString(command.payload, 'operationId'),
        expected_revision: requiredInteger(command.payload, 'expectedRevision'),
        provider: providerWorkPayload(command.payload['provider']),
      }
      break
    case 'archive_provider_profile':
      data = {
        type: command.kind,
        operation_id: requiredString(command.payload, 'operationId'),
        expected_revision: requiredInteger(command.payload, 'expectedRevision'),
        provider_id: requiredString(command.payload, 'providerId'),
      }
      break
    case 'save_model_profile':
      data = {
        type: command.kind,
        operation_id: requiredString(command.payload, 'operationId'),
        expected_revision: requiredInteger(command.payload, 'expectedRevision'),
        provider_id: requiredString(command.payload, 'providerId'),
        model: modelWorkPayload(command.payload['model']),
      }
      break
    case 'archive_model_profile':
      data = {
        type: command.kind,
        operation_id: requiredString(command.payload, 'operationId'),
        expected_revision: requiredInteger(command.payload, 'expectedRevision'),
        provider_id: requiredString(command.payload, 'providerId'),
        model_profile_id: requiredString(command.payload, 'modelProfileId'),
      }
      break
    case 'set_default_model': {
      const model = command.payload['model']
      data = {
        type: command.kind,
        operation_id: requiredString(command.payload, 'operationId'),
        expected_revision: requiredInteger(command.payload, 'expectedRevision'),
        model:
          model === null
            ? null
            : {
                provider_id: requiredString(
                  requiredRecord(model),
                  'providerId',
                ),
                model_profile_id: requiredString(
                  requiredRecord(model),
                  'modelProfileId',
                ),
              },
        allow_unverified: optionalBoolean(
          command.payload,
          'allowUnverified',
          false,
        ),
      }
      break
    }
    case 'validate_provider_model':
      data = {
        type: command.kind,
        operation_id: requiredString(command.payload, 'operationId'),
        expected_revision: requiredInteger(command.payload, 'expectedRevision'),
        provider_id: requiredString(command.payload, 'providerId'),
        model_profile_id: requiredString(command.payload, 'modelProfileId'),
      }
      break
    case 'begin_provider_auth':
    case 'remove_provider_auth':
    case 'refresh_provider_auth':
      data = providerAuthWorkPayload(command.kind, command.payload)
      break
    case 'begin_provider_secret':
      data = providerSecretWorkPayload(command)
      break
    case 'get_provider_auth_status':
    case 'cancel_provider_auth':
      data = {
        type: command.kind,
        auth_operation_id: requiredString(command.payload, 'authOperationId'),
      }
      break
    case 'submit_provider_auth_code':
      data = {
        type: command.kind,
        auth_operation_id: requiredString(command.payload, 'authOperationId'),
        code: requiredString(command.payload, 'code'),
      }
      break
    default:
      assertNever(command.kind)
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

function assertNever(value: never): never {
  throw new Error(`unsupported environment command: ${String(value)}`)
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid environment command payload')
  }
  return value as Record<string, unknown>
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('invalid environment command payload')
  }
  return value
}

function optionalString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('invalid environment command payload')
  }
  return value
}

function requiredInteger(
  payload: Record<string, unknown>,
  key: string,
): number {
  const value = payload[key]
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error('invalid environment command payload')
  }
  return value as number
}

function optionalBoolean(
  payload: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = payload[key]
  if (value === undefined) return fallback
  if (typeof value !== 'boolean') {
    throw new Error('invalid environment command payload')
  }
  return value
}

function modelWorkPayload(value: unknown): Record<string, unknown> {
  const model = requiredRecord(value)
  const validation = requiredRecord(model['validation'])
  return {
    id: requiredString(model, 'id'),
    display_name: requiredString(model, 'displayName'),
    remote_model_id: requiredString(model, 'remoteModelId'),
    enabled: optionalBoolean(model, 'enabled', true),
    archived: optionalBoolean(model, 'archived', false),
    validation: { status: requiredString(validation, 'status') },
  }
}

function providerWorkPayload(value: unknown): Record<string, unknown> {
  const provider = requiredRecord(value)
  const auth = requiredRecord(provider['auth'])
  const models = provider['models']
  if (!Array.isArray(models))
    throw new Error('invalid environment command payload')
  return {
    id: requiredString(provider, 'id'),
    display_name: requiredString(provider, 'displayName'),
    kind: requiredString(provider, 'kind'),
    ...(optionalString(provider, 'baseUrl') === undefined
      ? {}
      : { base_url: optionalString(provider, 'baseUrl') }),
    auth: {
      scheme: requiredString(auth, 'scheme'),
      source: requiredString(auth, 'source'),
      ...(optionalString(auth, 'envName') === undefined
        ? {}
        : { env_name: optionalString(auth, 'envName') }),
    },
    ...(optionalString(provider, 'compatRule') === undefined
      ? {}
      : { compat_rule: optionalString(provider, 'compatRule') }),
    enabled: optionalBoolean(provider, 'enabled', true),
    archived: optionalBoolean(provider, 'archived', false),
    models: models.map(modelWorkPayload),
  }
}

function providerAuthWorkPayload(
  type:
    | 'begin_provider_auth'
    | 'remove_provider_auth'
    | 'refresh_provider_auth',
  payload: Record<string, unknown>,
): ProviderEnvironmentCommandWorkData {
  return {
    type,
    provider_id: requiredString(payload, 'providerId'),
    operation_id: requiredString(payload, 'operationId'),
    ...(optionalString(payload, 'method') === undefined
      ? {}
      : { method: optionalString(payload, 'method') }),
    ...(optionalString(payload, 'action') === undefined
      ? {}
      : { action: optionalString(payload, 'action') }),
  }
}

function providerSecretWorkPayload(
  command: PersistedEnvironmentCommand,
): ProviderEnvironmentCommandWorkData {
  const providerId = requiredString(command.payload, 'providerId')
  const operationId = requiredString(command.payload, 'operationId')
  const method = optionalString(command.payload, 'method')
  const relayId = optionalString(command.payload, 'action')
  return {
    type: 'begin_provider_secret',
    provider_id: providerId,
    operation_id: operationId,
    ...(method === undefined ? {} : { method }),
    ...(relayId === undefined
      ? {}
      : {
          secret_envelope: providerSecretRelay.consume(relayId, {
            environmentId: command.environmentId,
            providerId,
            operationId,
          }),
        }),
  }
}

export function ackWork(workId: string) {
  storeUpdateWorkItem(workId, { state: 'acked' })
}

export function stopWork(workId: string) {
  // Look up before completing — environment-command work ids miss the map
  // (their completion goes through completeEnvironmentCommand) and skip the
  // session normalization below.
  const item = storeGetWorkItem(workId)
  storeUpdateWorkItem(workId, { state: 'completed' })
  // The worker for this session exited: park the session as idle so the web
  // UI shows resumable history instead of a stale "running" entry. The next
  // user message re-dispatches work on demand (dispatchWorkForUserInput).
  if (item) {
    const session = storeGetSession(item.sessionId)
    if (session && session.status !== 'archived') {
      if (session.status !== 'idle') {
        storeUpdateSession(item.sessionId, { status: 'idle' })
      }
      storeUpsertSessionWorker(item.sessionId, { workerStatus: 'offline' })
    }
  }
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

/**
 * Reconnect: normalize the environment's sessions and re-queue only those
 * with pending user input.
 *
 * Dispatching work for every non-archived session here (the old behavior)
 * made each bridge restart respawn a child CLI per historical session — up
 * to maxSessions concurrent processes — which forced the bridge to archive
 * everything on shutdown just to keep restarts cheap. Instead, sessions are
 * parked as idle/offline and respawn lazily: reconnect only dispatches when
 * a durable outbound event (user message accepted while the worker was
 * offline) is still unprocessed, or when an undispatched work item is
 * already queued. Everything else waits for dispatchWorkForUserInput on the
 * next message.
 */
export function reconnectWorkForEnvironment(envId: string) {
  const requeuedCommands =
    getPersistence().requeueDispatchedEnvironmentCommands(envId, Date.now())
  if (requeuedCommands > 0) notifyWorkAvailable(envId)
  const resumableSessions = storeListSessionsByEnvironment(envId).filter(
    session => session.status !== 'archived',
  )
  const promises: Promise<string>[] = []
  for (const session of resumableSessions) {
    const oldWork = storeGetOpenWorkItemForSession(session.id)
    // Non-pending work belonged to the previous lease's worker, which is
    // gone — complete it. Pending work was never taken and stays dispatchable.
    if (oldWork && oldWork.state !== 'pending') {
      storeUpdateWorkItem(oldWork.id, { state: 'completed' })
    }
    if (session.status !== 'idle') {
      storeUpdateSession(session.id, { status: 'idle' })
    }
    storeUpsertSessionWorker(session.id, { workerStatus: 'offline' })
    const hasPendingInput =
      getPersistence().getEarliestUnprocessedOutboundSeq(session.id) !==
      undefined
    if (hasPendingInput || oldWork?.state === 'pending') {
      promises.push(createWorkItem(envId, session.id))
    }
  }
  return Promise.all(promises)
}

/**
 * Dispatch-on-demand: give a session a worker because the web just accepted
 * a durable user message for it. No-op (returns null) when the session is
 * archived, has no bound environment, or the environment is offline or an
 * ACP agent (ACP delivers over its own WebSocket relay, not work polling).
 * ensureWorkItem is idempotent, so calling this while a worker is already
 * live just re-notifies the poll loop.
 */
export function dispatchWorkForUserInput(sessionId: string): string | null {
  const session = storeGetSession(sessionId)
  if (!session || session.status === 'archived') return null
  const envId = session.environmentId
  if (!envId) return null
  const env = storeGetEnvironment(envId)
  if (!env || env.status !== 'active' || env.workerType === 'acp') return null
  return ensureWorkItem(envId, sessionId)
}
