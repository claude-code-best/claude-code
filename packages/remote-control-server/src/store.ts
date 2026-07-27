import { randomUUID } from 'node:crypto'
import type { Product, ProjectState } from './domain/product'
import { getPersistence } from './persistence/runtime'
import type {
  SessionModelSelection,
  PersistedSessionWorkItem,
} from './persistence/types'

// ---------- Types ----------

export interface UserRecord {
  username: string
  createdAt: Date
}

export interface EnvironmentRecord {
  id: string
  secret: string
  accountId: string
  deviceId: string | null
  deviceName: string | null
  workspaceKey: string | null
  machineName: string | null
  directory: string | null
  branch: string | null
  gitRepoUrl: string | null
  maxSessions: number
  workerType: string
  bridgeId: string | null
  capabilities: Record<string, unknown> | null
  status: string
  username: string | null
  leaseEpoch: number
  leaseTokenHash: string | null
  connectionId: string | null
  lastPollAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface SessionRecord {
  id: string
  environmentId: string | null
  title: string | null
  status: string
  source: string
  permissionMode: string | null
  directory: string | null
  product: Product
  projectId: string | null
  runtimeEnvironmentId: string | null
  dataDirectory: string | null
  projectPromptRevision: number | null
  modelSelection: SessionModelSelection | null
  desiredModelSelection: SessionModelSelection | null
  actualModelSelection: SessionModelSelection | null
  modelOperationId: string | null
  processedOutboundSeq: number
  workerEpoch: number
  username: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ProjectRecord {
  id: string
  ownerId: string
  product: Product
  name: string
  projectPrompt: string
  promptRevision: number
  state: ProjectState
  deviceId: string | null
  workspaceKey: string | null
  canonicalPath: string | null
  gitRoot: string | null
  gitRepoUrl: string | null
  missingConfirmedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface WorkItemRecord {
  id: string
  environmentId: string
  sessionId: string
  state: string
  secret: string
  createdAt: Date
  updatedAt: Date
}

export interface SessionWorkerRecord {
  sessionId: string
  workerStatus: string | null
  externalMetadata: Record<string, unknown> | null
  requiresActionDetails: Record<string, unknown> | null
  lastHeartbeatAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ---------- Stores (in-memory Maps) ----------

const users = new Map<string, UserRecord>()
const tokenToUser = new Map<string, { username: string; createdAt: Date }>()
const environments = new Map<string, EnvironmentRecord>()
const projects = new Map<string, ProjectRecord>()
const sessions = new Map<string, SessionRecord>()
const workItems = new Map<string, WorkItemRecord>()
const sessionWorkers = new Map<string, SessionWorkerRecord>()

// UUID → session ownership: sessionId → Set of UUIDs
const sessionOwners = new Map<string, Set<string>>()

function persistEnvironment(record: EnvironmentRecord): void {
  getPersistence().upsertEnvironment({
    ...record,
    lastPollAt: record.lastPollAt?.getTime() ?? null,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  })
}

function hydrateEnvironment(record: {
  id: string
  accountId: string
  deviceId: string | null
  deviceName: string | null
  workspaceKey: string | null
  machineName: string | null
  directory: string | null
  branch: string | null
  gitRepoUrl: string | null
  maxSessions: number
  workerType: string
  bridgeId: string | null
  capabilities: Record<string, unknown> | null
  status: string
  username: string | null
  leaseEpoch: number
  leaseTokenHash: string | null
  connectionId: string | null
  lastPollAt: number | null
  createdAt: number
  updatedAt: number
}): EnvironmentRecord {
  return {
    ...record,
    secret: '',
    status: 'offline',
    leaseTokenHash: null,
    connectionId: null,
    lastPollAt: record.lastPollAt === null ? null : new Date(record.lastPollAt),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  }
}

function persistSession(record: SessionRecord): void {
  getPersistence().upsertSession({
    ...record,
    archivedAt:
      record.status === 'archived' ? record.updatedAt.getTime() : null,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  })
}

function persistProject(record: ProjectRecord): void {
  getPersistence().upsertProject({
    ...record,
    missingConfirmedAt: record.missingConfirmedAt?.getTime() ?? null,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  })
}

function hydrateProject(record: {
  id: string
  ownerId: string
  product: Product
  name: string
  projectPrompt: string
  promptRevision: number
  state: ProjectState
  deviceId: string | null
  workspaceKey: string | null
  canonicalPath: string | null
  gitRoot: string | null
  gitRepoUrl: string | null
  missingConfirmedAt: number | null
  createdAt: number
  updatedAt: number
}): ProjectRecord {
  return {
    ...record,
    missingConfirmedAt:
      record.missingConfirmedAt === null
        ? null
        : new Date(record.missingConfirmedAt),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  }
}

function hydrateSession(record: {
  id: string
  environmentId: string | null
  title: string | null
  status: string
  source: string
  permissionMode: string | null
  directory: string | null
  product: Product
  projectId: string | null
  runtimeEnvironmentId: string | null
  dataDirectory: string | null
  projectPromptRevision: number | null
  modelSelection: SessionModelSelection | null
  desiredModelSelection: SessionModelSelection | null
  actualModelSelection: SessionModelSelection | null
  modelOperationId: string | null
  processedOutboundSeq: number
  workerEpoch: number
  username: string | null
  createdAt: number
  updatedAt: number
}): SessionRecord {
  return {
    id: record.id,
    environmentId: record.environmentId,
    title: record.title,
    status: record.status,
    source: record.source,
    permissionMode: record.permissionMode,
    directory: record.directory,
    product: record.product,
    projectId: record.projectId,
    runtimeEnvironmentId: record.runtimeEnvironmentId,
    dataDirectory: record.dataDirectory,
    projectPromptRevision: record.projectPromptRevision,
    modelSelection: record.modelSelection,
    desiredModelSelection: record.desiredModelSelection,
    actualModelSelection: record.actualModelSelection,
    modelOperationId: record.modelOperationId,
    processedOutboundSeq: record.processedOutboundSeq,
    workerEpoch: record.workerEpoch,
    username: record.username,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  }
}

function persistSessionWorker(record: SessionWorkerRecord): void {
  getPersistence().upsertWorker({
    ...record,
    lastHeartbeatAt: record.lastHeartbeatAt?.getTime() ?? null,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  })
}

function hydrateSessionWorker(record: {
  sessionId: string
  workerStatus: string | null
  externalMetadata: Record<string, unknown> | null
  requiresActionDetails: Record<string, unknown> | null
  lastHeartbeatAt: number | null
  createdAt: number
  updatedAt: number
}): SessionWorkerRecord {
  return {
    ...record,
    lastHeartbeatAt:
      record.lastHeartbeatAt === null ? null : new Date(record.lastHeartbeatAt),
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  }
}

// ---------- User ----------

export function storeCreateUser(username: string): UserRecord {
  const existing = users.get(username)
  if (existing) return existing
  const record: UserRecord = { username, createdAt: new Date() }
  users.set(username, record)
  return record
}

export function storeGetUser(username: string): UserRecord | undefined {
  return users.get(username)
}

export function storeCreateToken(username: string, token: string): void {
  tokenToUser.set(token, { username, createdAt: new Date() })
}

export function storeGetUserByToken(
  token: string,
): { username: string; createdAt: Date } | undefined {
  return tokenToUser.get(token)
}

export function storeDeleteToken(token: string): boolean {
  return tokenToUser.delete(token)
}

// ---------- Environment ----------

export function storeCreateEnvironment(req: {
  secret: string
  accountId?: string
  deviceId?: string
  deviceName?: string
  workspaceKey?: string
  machineName?: string
  directory?: string
  branch?: string
  gitRepoUrl?: string
  maxSessions?: number
  workerType?: string
  bridgeId?: string
  username?: string
  capabilities?: Record<string, unknown>
  connectionId?: string
  leaseTokenHash?: string
  leaseEpoch?: number
}): EnvironmentRecord {
  const id = `env_${randomUUID().replace(/-/g, '')}`
  const now = new Date()
  const capabilities =
    req.capabilities && req.capabilities.provider_model_catalog_v1 !== undefined
      ? {
          ...req.capabilities,
          provider_model_catalog_refreshed_at_ms:
            req.capabilities.provider_model_catalog_refreshed_at_ms ??
            now.getTime(),
        }
      : (req.capabilities ?? null)
  const record: EnvironmentRecord = {
    id,
    secret: req.secret,
    accountId:
      req.accountId ?? (req.username ? `user:${req.username}` : 'legacy'),
    deviceId: req.deviceId ?? null,
    deviceName: req.deviceName ?? req.machineName ?? null,
    workspaceKey: req.workspaceKey ?? null,
    machineName: req.machineName ?? null,
    directory: req.directory ?? null,
    branch: req.branch ?? null,
    gitRepoUrl: req.gitRepoUrl ?? null,
    maxSessions: req.maxSessions ?? 1,
    workerType: req.workerType ?? 'claude_code',
    bridgeId: req.bridgeId ?? null,
    capabilities,
    status: 'active',
    username: req.username ?? null,
    leaseEpoch:
      req.leaseEpoch ?? (req.connectionId || req.leaseTokenHash ? 1 : 0),
    leaseTokenHash: req.leaseTokenHash ?? null,
    connectionId: req.connectionId ?? null,
    lastPollAt: now,
    createdAt: now,
    updatedAt: now,
  }
  persistEnvironment(record)
  environments.set(id, record)
  return record
}

export function storeGetEnvironment(id: string): EnvironmentRecord | undefined {
  return environments.get(id)
}

export function storeUpdateEnvironment(
  id: string,
  patch: Partial<
    Pick<
      EnvironmentRecord,
      | 'status'
      | 'lastPollAt'
      | 'updatedAt'
      | 'capabilities'
      | 'machineName'
      | 'maxSessions'
      | 'bridgeId'
      | 'deviceName'
      | 'machineName'
      | 'directory'
      | 'branch'
      | 'gitRepoUrl'
      | 'leaseEpoch'
      | 'leaseTokenHash'
      | 'connectionId'
      | 'accountId'
      | 'deviceId'
      | 'workspaceKey'
      | 'workerType'
      | 'username'
    >
  >,
): boolean {
  const rec = environments.get(id)
  if (!rec) return false
  const nextPatch =
    patch.capabilities &&
    patch.capabilities.provider_model_catalog_v1 !== undefined
      ? {
          ...patch,
          capabilities: {
            ...patch.capabilities,
            provider_model_catalog_refreshed_at_ms:
              patch.capabilities.provider_model_catalog_refreshed_at_ms ??
              Date.now(),
          },
        }
      : patch
  Object.assign(rec, nextPatch, { updatedAt: new Date() })
  persistEnvironment(rec)
  return true
}

export function storeFindEnvironmentByIdentity(
  accountId: string,
  deviceId: string,
  workspaceKey: string,
  workerType: string,
): EnvironmentRecord | undefined {
  return [...environments.values()].find(
    environment =>
      environment.accountId === accountId &&
      environment.deviceId === deviceId &&
      environment.workspaceKey === workspaceKey &&
      environment.workerType === workerType,
  )
}

export function storeListActiveEnvironments(): EnvironmentRecord[] {
  return [...environments.values()].filter(e => e.status === 'active')
}

export function storeListActiveEnvironmentsByAccountId(
  accountId: string,
): EnvironmentRecord[] {
  return [...environments.values()].filter(
    environment =>
      environment.status === 'active' && environment.accountId === accountId,
  )
}

export function storeListActiveEnvironmentsByUsername(
  username: string,
): EnvironmentRecord[] {
  return [...environments.values()].filter(
    e => e.status === 'active' && e.username === username,
  )
}

// ---------- Project ----------

export function storeCreateProject(
  req: Omit<ProjectRecord, 'id' | 'createdAt' | 'updatedAt'>,
): ProjectRecord {
  const now = new Date()
  const record: ProjectRecord = {
    ...req,
    id: `project_${randomUUID().replace(/-/g, '')}`,
    createdAt: now,
    updatedAt: now,
  }
  persistProject(record)
  projects.set(record.id, record)
  return record
}

export function storeGetProject(id: string): ProjectRecord | undefined {
  return projects.get(id)
}

export function storeListProjects(): ProjectRecord[] {
  return [...projects.values()]
}

export function storeListProjectsByOwnerProduct(
  ownerId: string,
  product: Product,
): ProjectRecord[] {
  return [...projects.values()].filter(
    project => project.ownerId === ownerId && project.product === product,
  )
}

export function storeUpdateProject(
  id: string,
  patch: Partial<
    Pick<
      ProjectRecord,
      | 'name'
      | 'projectPrompt'
      | 'promptRevision'
      | 'state'
      | 'gitRoot'
      | 'gitRepoUrl'
      | 'missingConfirmedAt'
    >
  >,
): boolean {
  const record = projects.get(id)
  if (!record) return false
  const updated = { ...record, ...patch, updatedAt: new Date() }
  persistProject(updated)
  Object.assign(record, updated)
  return true
}

export function storeDeleteProject(id: string): boolean {
  if (!projects.has(id)) return false
  if (!getPersistence().deleteProject(id)) return false
  projects.delete(id)
  return true
}

export function storeDeleteProjectWithSessions(
  id: string,
): string[] | undefined {
  const sessionIds = getPersistence().deleteProjectWithSessions(id)
  if (!sessionIds) return undefined

  for (const sessionId of sessionIds) {
    sessionWorkers.delete(sessionId)
    sessionOwners.delete(sessionId)
    sessions.delete(sessionId)
    for (const [workItemId, workItem] of workItems) {
      if (workItem.sessionId === sessionId) workItems.delete(workItemId)
    }
  }
  projects.delete(id)
  return sessionIds
}

// ---------- Session ----------

export function storeCreateSession(req: {
  environmentId?: string | null
  title?: string | null
  source?: string
  permissionMode?: string | null
  directory?: string | null
  idPrefix?: string
  username?: string | null
  product?: Product
  projectId?: string | null
  runtimeEnvironmentId?: string | null
  dataDirectory?: string | null
  projectPromptRevision?: number | null
  modelSelection?: SessionModelSelection | null
}): SessionRecord {
  const id = `${req.idPrefix || 'session_'}${randomUUID().replace(/-/g, '')}`
  const now = new Date()
  const record: SessionRecord = {
    id,
    environmentId: req.environmentId ?? null,
    title: req.title ?? null,
    status: 'idle',
    source: req.source ?? 'remote-control',
    permissionMode: req.permissionMode ?? null,
    directory: req.directory ?? null,
    product: req.product ?? 'code',
    projectId: req.projectId ?? null,
    runtimeEnvironmentId: req.runtimeEnvironmentId ?? req.environmentId ?? null,
    dataDirectory: req.dataDirectory ?? null,
    projectPromptRevision: req.projectPromptRevision ?? null,
    modelSelection: req.modelSelection ?? null,
    desiredModelSelection: req.modelSelection ?? null,
    // A default is desired intent, not proof that a Worker has applied it.
    // The actual field is populated only by a worker init/confirmation event.
    actualModelSelection: null,
    modelOperationId: null,
    processedOutboundSeq: 0,
    workerEpoch: 0,
    username: req.username ?? null,
    createdAt: now,
    updatedAt: now,
  }
  persistSession(record)
  sessions.set(id, record)
  return record
}

export function storeGetSession(id: string): SessionRecord | undefined {
  return sessions.get(id)
}

export function storeUpdateSession(
  id: string,
  patch: Partial<
    Pick<
      SessionRecord,
      | 'environmentId'
      | 'title'
      | 'status'
      | 'workerEpoch'
      | 'updatedAt'
      | 'projectId'
      | 'runtimeEnvironmentId'
      | 'dataDirectory'
      | 'projectPromptRevision'
      | 'modelSelection'
      | 'desiredModelSelection'
      | 'actualModelSelection'
      | 'modelOperationId'
      | 'processedOutboundSeq'
    >
  >,
): boolean {
  const rec = sessions.get(id)
  if (!rec) return false
  const synchronizedPatch =
    patch.modelSelection !== undefined
      ? {
          ...patch,
          desiredModelSelection:
            patch.desiredModelSelection ?? patch.modelSelection,
          actualModelSelection:
            patch.actualModelSelection ??
            (patch.desiredModelSelection !== undefined
              ? rec.actualModelSelection
              : patch.modelSelection),
        }
      : patch.desiredModelSelection !== undefined &&
          patch.actualModelSelection === undefined
        ? { ...patch, actualModelSelection: rec.actualModelSelection }
        : patch
  const updated = { ...rec, ...synchronizedPatch, updatedAt: new Date() }
  persistSession(updated)
  Object.assign(rec, updated)
  return true
}

export function storeListSessions(): SessionRecord[] {
  return [...sessions.values()]
}

export function storeListSessionsByUsername(username: string): SessionRecord[] {
  return [...sessions.values()].filter(s => s.username === username)
}

export function storeListSessionsByEnvironment(envId: string): SessionRecord[] {
  return [...sessions.values()].filter(s => s.environmentId === envId)
}

export function storeListSessionsByProduct(product: Product): SessionRecord[] {
  return [...sessions.values()].filter(session => session.product === product)
}

export function storeListSessionsByProject(projectId: string): SessionRecord[] {
  return [...sessions.values()].filter(
    session => session.projectId === projectId,
  )
}

export function storeDeleteSession(id: string): boolean {
  if (!sessions.has(id)) return false
  if (!getPersistence().deleteSession(id)) return false
  sessionWorkers.delete(id)
  sessionOwners.delete(id)
  for (const [workItemId, workItem] of workItems) {
    if (workItem.sessionId === id) workItems.delete(workItemId)
  }
  sessions.delete(id)
  return true
}

// ---------- Session Worker ----------

export function storeGetSessionWorker(
  sessionId: string,
): SessionWorkerRecord | undefined {
  return sessionWorkers.get(sessionId)
}

export function storeUpsertSessionWorker(
  sessionId: string,
  patch: {
    workerStatus?: string | null
    externalMetadata?: Record<string, unknown> | null
    requiresActionDetails?: Record<string, unknown> | null
    lastHeartbeatAt?: Date | null
  },
): SessionWorkerRecord {
  const now = new Date()
  const existing = sessionWorkers.get(sessionId)
  const record: SessionWorkerRecord = existing
    ? { ...existing }
    : {
        sessionId,
        workerStatus: null,
        externalMetadata: null,
        requiresActionDetails: null,
        lastHeartbeatAt: null,
        createdAt: now,
        updatedAt: now,
      }

  if (patch.workerStatus !== undefined) {
    record.workerStatus = patch.workerStatus
  }
  if (patch.externalMetadata !== undefined) {
    if (patch.externalMetadata === null) {
      record.externalMetadata = null
    } else {
      record.externalMetadata = {
        ...(record.externalMetadata ?? {}),
        ...patch.externalMetadata,
      }
    }
  }
  if (patch.requiresActionDetails !== undefined) {
    record.requiresActionDetails = patch.requiresActionDetails
  }
  if (patch.lastHeartbeatAt !== undefined) {
    record.lastHeartbeatAt = patch.lastHeartbeatAt
  }
  record.updatedAt = now

  persistSessionWorker(record)
  if (existing) {
    Object.assign(existing, record)
    return existing
  }
  sessionWorkers.set(sessionId, record)
  return record
}

// ---------- Work Items ----------

// ---------- Session Ownership (UUID-based) ----------

export function storeBindSession(sessionId: string, uuid: string): void {
  getPersistence().bindOwner(sessionId, uuid, Date.now())
  let owners = sessionOwners.get(sessionId)
  if (!owners) {
    owners = new Set()
    sessionOwners.set(sessionId, owners)
  }
  owners.add(uuid)
}

export function storeIsSessionOwner(sessionId: string, uuid: string): boolean {
  const owners = sessionOwners.get(sessionId)
  return owners ? owners.has(uuid) : false
}

export function storeGetSessionOwners(
  sessionId: string,
): Set<string> | undefined {
  return sessionOwners.get(sessionId)
}

export function storeListSessionsByOwnerUuid(uuid: string): SessionRecord[] {
  const result: SessionRecord[] = []
  const resultIds = new Set<string>()

  // Collect sessions already owned by this UUID
  for (const [sessionId, owners] of sessionOwners) {
    if (owners.has(uuid)) {
      const session = sessions.get(sessionId)
      if (session) {
        result.push(session)
        resultIds.add(sessionId)
      }
    }
  }

  // Auto-bind orphaned sessions (no owner — typically ACP agent sessions created via REST registration)
  for (const [sessionId, session] of sessions) {
    if (resultIds.has(sessionId)) continue
    const owners = sessionOwners.get(sessionId)
    // No owners map entry at all, or empty owners set
    const isOrphaned = !owners || owners.size === 0
    if (isOrphaned) {
      storeBindSession(sessionId, uuid)
      result.push(session)
      resultIds.add(sessionId)
    }
  }

  return result
}

// ---------- Work Items (cont.) ----------

export function storeCreateWorkItem(req: {
  environmentId: string
  sessionId: string
  secret: string
}): WorkItemRecord {
  const id = `work_${randomUUID().replace(/-/g, '')}`
  const now = new Date()
  const record: WorkItemRecord = {
    id,
    environmentId: req.environmentId,
    sessionId: req.sessionId,
    state: 'pending',
    secret: req.secret,
    createdAt: now,
    updatedAt: now,
  }
  workItems.set(id, record)
  // The compatibility store is also used by unit tests and legacy callers
  // with synthetic IDs. Persist only when both durable parents exist; real
  // RCS sessions always satisfy this condition.
  if (
    getPersistence().getSession(record.sessionId) &&
    getPersistence().getEnvironment(record.environmentId)
  ) {
    getPersistence().createSessionWorkItem({
      id,
      environmentId: record.environmentId,
      sessionId: record.sessionId,
      state: 'pending',
      workerEpoch: 0,
      attemptCount: 0,
      leaseExpiresAt: null,
      stopReason: null,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
      startedAt: null,
      completedAt: null,
    })
  }
  return record
}

export function storeGetWorkItem(id: string): WorkItemRecord | undefined {
  const existing = workItems.get(id)
  if (existing) return existing
  const persisted = getPersistence().getSessionWorkItem(id)
  if (!persisted) return undefined
  const record = hydrateWorkItem(persisted)
  workItems.set(id, record)
  return record
}

export function storeGetOpenWorkItemForSession(
  sessionId: string,
): WorkItemRecord | undefined {
  const inMemory = [...workItems.values()].find(
    item =>
      item.sessionId === sessionId &&
      ['pending', 'dispatched', 'acked', 'stopping'].includes(item.state),
  )
  if (inMemory) return inMemory
  const persisted = getPersistence().getOpenSessionWorkItem(sessionId)
  if (!persisted) return undefined
  const record = hydrateWorkItem(persisted)
  workItems.set(record.id, record)
  return record
}

export function storeGetPendingWorkItem(
  environmentId: string,
): WorkItemRecord | undefined {
  for (const item of workItems.values()) {
    if (item.environmentId === environmentId && item.state === 'pending') {
      return item
    }
  }
  const persisted = getPersistence().getPendingSessionWorkItem(environmentId)
  if (!persisted) return undefined
  const record = hydrateWorkItem(persisted)
  workItems.set(record.id, record)
  return record
}

export function storeUpdateWorkItem(
  id: string,
  patch: Partial<Pick<WorkItemRecord, 'state' | 'secret' | 'updatedAt'>>,
): boolean {
  const rec = workItems.get(id)
  if (!rec) return false
  Object.assign(rec, patch, { updatedAt: new Date() })
  const now = rec.updatedAt.getTime()
  const persisted = getPersistence().getSessionWorkItem(id)
  if (!persisted) return true
  const startedAt =
    persisted.startedAt ??
    (rec.state === 'dispatched' || rec.state === 'acked' ? now : null)
  getPersistence().updateSessionWorkItem(id, {
    state: rec.state as PersistedSessionWorkItem['state'],
    // Keep lease/epoch/attempt metadata written by the worker protocol.  The
    // in-memory compatibility store only owns state and the one-time secret.
    workerEpoch: persisted.workerEpoch,
    attemptCount: persisted.attemptCount,
    leaseExpiresAt: persisted.leaseExpiresAt,
    stopReason: persisted.stopReason,
    createdAt: persisted.createdAt,
    updatedAt: now,
    startedAt,
    completedAt:
      rec.state === 'completed' || rec.state === 'cancelled'
        ? (persisted.completedAt ?? now)
        : persisted.completedAt,
  })
  return true
}

function hydrateWorkItem(item: PersistedSessionWorkItem): WorkItemRecord {
  return {
    id: item.id,
    environmentId: item.environmentId,
    sessionId: item.sessionId,
    state: item.state,
    secret: '',
    createdAt: new Date(item.createdAt),
    updatedAt: new Date(item.updatedAt),
  }
}

// ---------- ACP Agent (reuses EnvironmentRecord with workerType="acp") ----------

/** List all ACP agents (environments with workerType="acp") */
export function storeListAcpAgents(): EnvironmentRecord[] {
  return [...environments.values()].filter(e => e.workerType === 'acp')
}

/** List ACP agents by channel group (stored in bridgeId field) */
export function storeListAcpAgentsByChannelGroup(
  channelGroupId: string,
): EnvironmentRecord[] {
  return [...environments.values()].filter(
    e => e.workerType === 'acp' && e.bridgeId === channelGroupId,
  )
}

/** Mark an ACP agent as offline */
export function storeMarkAcpAgentOffline(id: string): boolean {
  const rec = environments.get(id)
  if (!rec || rec.workerType !== 'acp') return false
  Object.assign(rec, { status: 'offline', updatedAt: new Date() })
  return true
}

/** Mark an ACP agent as online (on reconnect) */
export function storeMarkAcpAgentOnline(id: string): boolean {
  const rec = environments.get(id)
  if (!rec || rec.workerType !== 'acp') return false
  Object.assign(rec, {
    status: 'active',
    lastPollAt: new Date(),
    updatedAt: new Date(),
  })
  return true
}

// ---------- Reset (for tests) ----------

export function storeClearPersistentCachesForTests(): void {
  environments.clear()
  projects.clear()
  sessions.clear()
  sessionWorkers.clear()
  sessionOwners.clear()
}

export function storeHydratePersistentState(): void {
  storeClearPersistentCachesForTests()

  const persistence = getPersistence()
  for (const persisted of persistence.listEnvironments()) {
    const environment = hydrateEnvironment(persisted)
    environments.set(environment.id, environment)
  }
  for (const persisted of persistence.listProjects()) {
    const project = hydrateProject(persisted)
    projects.set(project.id, project)
  }
  for (const persisted of persistence.listSessions()) {
    const session = hydrateSession(persisted)
    const wasInactive = session.status === 'inactive'
    if (wasInactive) {
      session.status = 'idle'
      persistSession(session)
    }
    sessions.set(session.id, session)

    const persistedWorker = persistence.getWorker(session.id)
    if (persistedWorker) {
      const worker = hydrateSessionWorker(persistedWorker)
      if (wasInactive) {
        worker.workerStatus = 'offline'
        persistSessionWorker(worker)
      }
      sessionWorkers.set(session.id, worker)
    } else if (wasInactive) {
      storeUpsertSessionWorker(session.id, { workerStatus: 'offline' })
    }
  }

  for (const owner of persistence.listOwners()) {
    let owners = sessionOwners.get(owner.sessionId)
    if (!owners) {
      owners = new Set()
      sessionOwners.set(owner.sessionId, owners)
    }
    owners.add(owner.ownerUuid)
  }
}

export function storeReset() {
  getPersistence().reset()
  users.clear()
  tokenToUser.clear()
  environments.clear()
  projects.clear()
  sessions.clear()
  workItems.clear()
  sessionWorkers.clear()
  sessionOwners.clear()
}
