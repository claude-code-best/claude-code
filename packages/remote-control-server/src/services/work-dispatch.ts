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
import { reconcileSessionModelSelection } from './session-model'
import { providerSecretRelay } from './provider-secret-relay'
import { publishSessionEvent } from './transport'
import {
  getWorkSignalGeneration,
  notifyWorkAvailable,
  waitForWorkSignal,
} from './work-signal'

const controlLaneReadyAt = new Map<string, number>()
const workRetryNotBefore = new Map<string, number>()
const workRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()

const SESSION_START_RETRY_DELAY_MS = 1000

export function markControlLaneReady(environmentId: string): void {
  controlLaneReadyAt.set(environmentId, Date.now())
}

export function isControlLaneReady(
  environmentId: string,
  maxAgeMs = config.pollTimeout * 2000 + 1000,
): boolean {
  const readyAt = controlLaneReadyAt.get(environmentId)
  return readyAt !== undefined && Date.now() - readyAt <= maxAgeMs
}

export function clearControlLaneReady(environmentId: string): void {
  controlLaneReadyAt.delete(environmentId)
}

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
    notifyWorkAvailable(environmentId, 'session')
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
  notifyWorkAvailable(environmentId, 'session')
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
  lane: 'mixed' | 'control' | 'session' = 'mixed',
): Promise<WorkResponse | null> {
  const deadline = Date.now() + timeoutSeconds * 1000

  while (true) {
    const generation = getWorkSignalGeneration(environmentId, lane)
    const work = takeAvailableWork(environmentId, lane)
    if (work) return work

    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) return null
    await waitForWorkSignal(environmentId, generation, remainingMs, lane)
  }
}

function takeAvailableWork(
  environmentId: string,
  lane: 'mixed' | 'control' | 'session' = 'mixed',
): WorkResponse | null {
  while (true) {
    if (lane !== 'session') {
      const commands =
        getPersistence().listPendingEnvironmentCommands(environmentId)
      for (const command of commands) {
        if (
          command.expiresAt !== null &&
          command.expiresAt !== undefined &&
          command.expiresAt <= Date.now()
        ) {
          getPersistence().expireEnvironmentCommand(
            command.id,
            'environment command expired',
            Date.now(),
          )
          continue
        }
        if (
          getPersistence().markEnvironmentCommandDispatched(
            command.id,
            Date.now(),
          )
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
          }
        }
      }
    }

    if (lane === 'control') return null

    const item = storeGetPendingWorkItem(environmentId)

    if (item) {
      const retryNotBefore = workRetryNotBefore.get(item.id)
      if (retryNotBefore !== undefined) {
        if (retryNotBefore > Date.now()) return null
        workRetryNotBefore.delete(item.id)
      }
      // Per-session working-directory override (web "choose folder" flow) —
      // delivered with the work item so the bridge spawns the child CLI there.
      const session = storeGetSession(item.sessionId)
      const secret = encodeWorkSecret(session?.product === 'code')
      storeUpdateWorkItem(item.id, { state: 'dispatched', secret })
      const projectPrompt = session?.projectId
        ? storeGetProject(session.projectId)?.projectPrompt
        : undefined
      let persistedModelSelection =
        session?.desiredModelSelection ?? session?.modelSelection ?? null
      if (session) {
        const environment = storeGetEnvironment(environmentId)
        const catalog = readEnvironmentProviderCatalog(
          environment?.capabilities,
        )
        if (catalog.supported) {
          const reconciled = reconcileSessionModelSelection(
            session,
            catalog.catalog,
            getPersistence().getLatestSessionInitEvent(session.id),
          )
          if (reconciled.selection !== null) {
            persistedModelSelection = reconciled.selection
            if (
              reconciled.recovered ||
              session.desiredModelSelection === null ||
              session.desiredModelSelection?.providerConfigRevision !==
                reconciled.selection.providerConfigRevision
            ) {
              publishSessionEvent(
                session.id,
                'model_selection_recovered',
                {
                  old_selection:
                    session.desiredModelSelection ?? session.modelSelection,
                  new_selection: reconciled.selection,
                  reason: reconciled.reason,
                },
                'inbound',
                {
                  producer: 'system',
                  sourceEventId: `${item.id}:model-recovered`,
                },
              )
            }
            storeUpdateSession(session.id, {
              modelSelection: reconciled.selection,
              desiredModelSelection: reconciled.selection,
              actualModelSelection: null,
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
    case 'terminate_session':
      data = {
        type: command.kind,
        session_id: requiredString(command.payload, 'sessionId'),
        grace_ms: requiredInteger(command.payload, 'graceMs'),
        operation_id: requiredString(command.payload, 'operationId'),
      }
      break
    case 'get_provider_catalog':
      data = { type: command.kind }
      break
    case 'discover_provider_models':
      data = {
        type: command.kind,
        provider_id: requiredString(command.payload, 'providerId'),
      }
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
    case 'delete_provider_profile':
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
    case 'delete_model_profile':
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
        storeUpdateSession(item.sessionId, {
          status: 'idle',
          actualModelSelection: null,
          modelOperationId: null,
        })
      } else {
        storeUpdateSession(item.sessionId, {
          actualModelSelection: null,
          modelOperationId: null,
        })
      }
      storeUpsertSessionWorker(item.sessionId, { workerStatus: 'offline' })
    }
  }
}

/**
 * Return a session work item to the queue after startup/preflight failure.
 * This is intentionally separate from stopWork: stopWork means the CLI has
 * finished and the message may be consumed, while releaseWork means the CLI
 * never took ownership of the message.
 */
export function releaseWork(
  workId: string,
  failure: { code: string; message: string; retryable: boolean },
): boolean {
  const item = storeGetWorkItem(workId)
  if (!item) return false
  if (item.state === 'completed' || item.state === 'cancelled') return false

  if (failure.retryable) {
    storeUpdateWorkItem(workId, { state: 'pending' })
    scheduleWorkRetry(item)
  } else {
    // Keep the user message unconsumed, but do not spin on a permanent
    // configuration/authentication failure. A later user message will create
    // a fresh open work item and can retry after the issue is repaired.
    storeUpdateWorkItem(workId, { state: 'failed' })
  }
  const session = storeGetSession(item.sessionId)
  if (session && session.status !== 'archived') {
    storeUpdateSession(item.sessionId, {
      status: 'idle',
      actualModelSelection: null,
      modelOperationId: null,
    })
    storeUpsertSessionWorker(item.sessionId, { workerStatus: 'offline' })
    publishSessionEvent(
      item.sessionId,
      'session_start_failed',
      {
        code: failure.code,
        message: failure.message.slice(0, 500),
        retryable: failure.retryable,
      },
      'inbound',
      { producer: 'system', sourceEventId: `${workId}:${failure.code}` },
    )
  }
  if (failure.retryable) notifyWorkAvailable(item.environmentId, 'session')
  logError(
    `[RCS] Released session work ${workId} code=${failure.code} retryable=${failure.retryable}`,
  )
  return true
}

function scheduleWorkRetry(item: { id: string; environmentId: string }): void {
  const retryAt = Date.now() + SESSION_START_RETRY_DELAY_MS
  workRetryNotBefore.set(item.id, retryAt)
  const previousTimer = workRetryTimers.get(item.id)
  if (previousTimer !== undefined) clearTimeout(previousTimer)
  const timer = setTimeout(() => {
    workRetryTimers.delete(item.id)
    workRetryNotBefore.delete(item.id)
    notifyWorkAvailable(item.environmentId, 'session')
  }, SESSION_START_RETRY_DELAY_MS)
  workRetryTimers.set(item.id, timer)
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
  if (requeuedCommands > 0) notifyWorkAvailable(envId, 'control')
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
      storeUpdateSession(session.id, {
        status: 'idle',
        actualModelSelection: null,
        modelOperationId: null,
      })
    } else {
      storeUpdateSession(session.id, {
        actualModelSelection: null,
        modelOperationId: null,
      })
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
 * a durable event for it. No-op (returns null) when the session is archived,
 * has no bound environment, or the environment is offline or an ACP agent
 * (ACP delivers over its own WebSocket relay, not work polling).
 * ensureWorkItem is idempotent, so calling this while a worker is already
 * live just re-notifies the poll loop.
 */
export function dispatchWorkForSessionEvent(sessionId: string): string | null {
  const session = storeGetSession(sessionId)
  if (!session || session.status === 'archived') return null
  const envId = session.environmentId
  if (!envId) return null
  const env = storeGetEnvironment(envId)
  if (!env || env.status !== 'active' || env.workerType === 'acp') return null
  return ensureWorkItem(envId, sessionId)
}

/** Dispatch work after the web accepts a durable user message. */
export function dispatchWorkForUserInput(sessionId: string): string | null {
  return dispatchWorkForSessionEvent(sessionId)
}
