import { createHash, randomUUID } from 'node:crypto'
import { config } from '../config'
import {
  storeCreateEnvironment,
  storeCreateSession,
  storeGetEnvironment,
  storeUpdateEnvironment,
  storeListActiveEnvironments,
  storeListActiveEnvironmentsByAccountId,
  storeListActiveEnvironmentsByUsername,
  storeListSessionsByEnvironment,
  storeFindEnvironmentByIdentity,
  storeGetSession,
  storeUpdateSession,
} from '../store'
import { ensureWorkItem } from './work-dispatch'
import type {
  RegisterEnvironmentRequest,
  EnvironmentResponse,
} from '../types/api'
import type { EnvironmentRecord } from '../store'

function toResponse(row: EnvironmentRecord): EnvironmentResponse {
  return {
    id: row.id,
    device_id: row.deviceId,
    device_name: row.deviceName,
    workspace_key: row.workspaceKey,
    machine_name: row.machineName,
    directory: row.directory,
    branch: row.branch,
    status: row.status,
    username: row.username,
    last_poll_at: row.lastPollAt ? row.lastPollAt.getTime() / 1000 : null,
    worker_type: row.workerType,
    channel_group_id: row.bridgeId,
    capabilities: row.capabilities,
    lease_epoch: row.leaseEpoch,
  }
}

export function registerEnvironment(
  req: RegisterEnvironmentRequest & {
    metadata?: { worker_type?: string }
    username?: string
    accountId?: string
  },
) {
  const secret = config.apiKeys[0] || ''
  const workerType = req.worker_type || req.metadata?.worker_type
  const accountId =
    req.accountId ?? (req.username ? `user:${req.username}` : 'legacy')
  const stableRegistration =
    workerType !== 'acp' &&
    !!req.device_id &&
    !!req.workspace_key &&
    !!req.connection_id
  const leaseToken = stableRegistration ? randomUUID() : undefined
  const leaseTokenHash = leaseToken
    ? createHash('sha256').update(leaseToken).digest('hex')
    : undefined
  const identityExisting = stableRegistration
    ? storeFindEnvironmentByIdentity(
        accountId,
        req.device_id!,
        req.workspace_key!,
        workerType ?? 'claude_code',
      )
    : undefined
  const legacyCandidate =
    stableRegistration && !identityExisting && req.legacy_environment_id
      ? storeGetEnvironment(req.legacy_environment_id)
      : undefined
  const legacyOwned =
    legacyCandidate &&
    (accountId === 'single-user' ||
      legacyCandidate.accountId === accountId ||
      (!!req.username && legacyCandidate.username === req.username))
      ? legacyCandidate
      : undefined
  const existing = identityExisting ?? legacyOwned
  const reused = !!existing
  let record: EnvironmentRecord

  if (existing) {
    storeUpdateEnvironment(existing.id, {
      status: 'active',
      accountId,
      deviceId: req.device_id,
      workspaceKey: req.workspace_key,
      workerType: workerType ?? existing.workerType,
      username: req.username ?? existing.username,
      lastPollAt: new Date(),
      machineName: req.machine_name ?? existing.machineName,
      deviceName: req.device_name ?? req.machine_name ?? existing.deviceName,
      directory: req.directory ?? existing.directory,
      branch: req.branch ?? existing.branch,
      gitRepoUrl: req.git_repo_url ?? existing.gitRepoUrl,
      maxSessions: req.max_sessions ?? existing.maxSessions,
      capabilities: req.capabilities ?? existing.capabilities,
      connectionId: req.connection_id,
      leaseTokenHash,
      leaseEpoch: existing.leaseEpoch + 1,
    })
    record = storeGetEnvironment(existing.id)!
  } else {
    record = storeCreateEnvironment({
      secret,
      accountId,
      deviceId: req.device_id,
      deviceName: req.device_name,
      workspaceKey: req.workspace_key,
      machineName: req.machine_name,
      directory: req.directory,
      branch: req.branch,
      gitRepoUrl: req.git_repo_url,
      maxSessions: req.max_sessions,
      workerType,
      bridgeId: req.bridge_id,
      username: req.username,
      capabilities: req.capabilities,
      connectionId: req.connection_id,
      leaseTokenHash,
      leaseEpoch: stableRegistration ? 1 : 0,
    })
  }

  let sessionId: string | undefined
  let migratedSessionId: string | undefined
  // ACP agents: reuse existing session or create one
  if (workerType === 'acp') {
    const existing = storeListSessionsByEnvironment(record.id)
    if (existing.length > 0) {
      sessionId = existing[0].id
    } else {
      const session = storeCreateSession({
        environmentId: record.id,
        title: req.machine_name || 'ACP Agent',
        source: 'acp',
      })
      sessionId = session.id
    }
  }

  if (stableRegistration && req.resume_session_id) {
    const resumed = storeGetSession(req.resume_session_id)
    const canRebind =
      resumed &&
      resumed.status !== 'archived' &&
      resumed.product !== 'chat' &&
      resumed.projectId === null &&
      (accountId === 'single-user' ||
        (!!req.username && resumed.username === req.username))
    if (canRebind && resumed) {
      storeUpdateSession(resumed.id, {
        environmentId: record.id,
        status: resumed.status === 'inactive' ? 'idle' : resumed.status,
      })
      ensureWorkItem(record.id, resumed.id)
      migratedSessionId = resumed.id
    }
  }

  return {
    environment_id: record.id,
    // The API key is configuration, not durable environment identity. Hydrated
    // environments intentionally do not persist it, so always return the
    // currently configured credential for the new connection lease.
    environment_secret: secret,
    status: record.status as 'active',
    session_id: sessionId,
    ...(migratedSessionId ? { migrated_session_id: migratedSessionId } : {}),
    ...(leaseToken
      ? {
          lease_token: leaseToken,
          lease_epoch: record.leaseEpoch,
          reused,
        }
      : {}),
  }
}

export function deregisterEnvironment(envId: string) {
  storeUpdateEnvironment(envId, { status: 'deregistered' })
}

export function getEnvironment(envId: string) {
  return storeGetEnvironment(envId)
}

export function updatePollTime(envId: string) {
  storeUpdateEnvironment(envId, {
    status: 'active',
    lastPollAt: new Date(),
  })
}

export function listActiveEnvironments() {
  return storeListActiveEnvironments()
}

export function listActiveEnvironmentsResponse(): EnvironmentResponse[] {
  return storeListActiveEnvironments().map(toResponse)
}

export function listActiveEnvironmentsByAccountIdResponse(
  accountId: string,
): EnvironmentResponse[] {
  return storeListActiveEnvironmentsByAccountId(accountId).map(toResponse)
}

export function listActiveEnvironmentsByUsername(
  username: string,
): EnvironmentResponse[] {
  return storeListActiveEnvironmentsByUsername(username).map(toResponse)
}

export function reconnectEnvironment(envId: string) {
  storeUpdateEnvironment(envId, { status: 'active' })
}
