import {
  storeCreateSession,
  storeGetSession,
  storeIsSessionOwner,
  storeGetSessionOwners,
  storeBindSession,
  storeUpdateSession,
  storeListSessions,
  storeListSessionsByUsername,
  storeListSessionsByEnvironment,
  storeListSessionsByOwnerUuid,
} from '../store'
import { randomUUID } from 'node:crypto'
import { getAllEventBuses, removeEventBus } from '../transport/event-bus'
import type {
  CreateSessionRequest,
  CreateCodeSessionRequest,
  SessionResponse,
  SessionSummaryResponse,
} from '../types/api'

const CODE_SESSION_PREFIX = 'cse_'
const WEB_SESSION_PREFIX = 'session_'
const CLOSED_SESSION_STATUSES = new Set(['archived', 'inactive'])

function toResponse(row: {
  id: string
  environmentId: string | null
  title: string | null
  status: string
  source: string
  permissionMode: string | null
  workerEpoch: number
  username: string | null
  createdAt: Date
  updatedAt: Date
}): SessionResponse {
  return {
    id: row.id,
    environment_id: row.environmentId,
    title: row.title,
    status: row.status,
    source: row.source,
    permission_mode: row.permissionMode,
    worker_epoch: row.workerEpoch,
    username: row.username,
    created_at: row.createdAt.getTime() / 1000,
    updated_at: row.updatedAt.getTime() / 1000,
  }
}

export function toWebSessionId(sessionId: string): string {
  if (!sessionId.startsWith(CODE_SESSION_PREFIX)) return sessionId
  return `${WEB_SESSION_PREFIX}${sessionId.slice(CODE_SESSION_PREFIX.length)}`
}

function toCompatibleCodeSessionId(sessionId: string): string | null {
  if (!sessionId.startsWith(WEB_SESSION_PREFIX)) return null
  return `${CODE_SESSION_PREFIX}${sessionId.slice(WEB_SESSION_PREFIX.length)}`
}

export function toWebSessionResponse(
  session: SessionResponse,
): SessionResponse {
  return { ...session, id: toWebSessionId(session.id) }
}

function toWebSessionSummaryResponse(
  session: SessionSummaryResponse,
): SessionSummaryResponse {
  return { ...session, id: toWebSessionId(session.id) }
}

export function createSession(
  req: CreateSessionRequest & { username?: string },
): SessionResponse {
  const record = storeCreateSession({
    environmentId: req.environment_id,
    title: req.title,
    source: req.source,
    permissionMode: req.permission_mode,
    username: req.username,
  })
  return toResponse(record)
}

export function createCodeSession(
  req: CreateCodeSessionRequest,
): SessionResponse {
  const record = storeCreateSession({
    idPrefix: 'cse_',
    title: req.title,
    source: req.source,
    permissionMode: req.permission_mode,
  })
  return toResponse(record)
}

export function getSession(sessionId: string): SessionResponse | null {
  const record = storeGetSession(sessionId)
  return record ? toResponse(record) : null
}

export function isSessionClosedStatus(
  status: string | null | undefined,
): boolean {
  return !!status && CLOSED_SESSION_STATUSES.has(status)
}

export function resolveExistingSessionId(sessionId: string): string | null {
  if (storeGetSession(sessionId)) {
    return sessionId
  }

  const compatibleCodeSessionId = toCompatibleCodeSessionId(sessionId)
  if (compatibleCodeSessionId && storeGetSession(compatibleCodeSessionId)) {
    return compatibleCodeSessionId
  }

  return null
}

export function resolveExistingWebSessionId(sessionId: string): string | null {
  return resolveExistingSessionId(sessionId)
}

export function resolveOwnedWebSessionId(
  sessionId: string,
  uuid: string,
): string | null {
  if (storeIsSessionOwner(sessionId, uuid)) {
    return sessionId
  }

  const compatibleCodeSessionId = toCompatibleCodeSessionId(sessionId)
  if (
    compatibleCodeSessionId &&
    storeIsSessionOwner(compatibleCodeSessionId, uuid)
  ) {
    return compatibleCodeSessionId
  }

  // Auto-bind: if the session exists but has no owner, claim it for the requesting user
  const existingId = resolveExistingSessionId(sessionId)
  if (existingId) {
    const owners = storeGetSessionOwners(existingId)
    if (!owners || owners.size === 0) {
      storeBindSession(existingId, uuid)
      return existingId
    }
  }

  return null
}

export function listWebSessionsByOwnerUuid(uuid: string): SessionResponse[] {
  return storeListSessionsByOwnerUuid(uuid)
    .filter(session => !isSessionClosedStatus(session.status))
    .map(toResponse)
    .map(toWebSessionResponse)
}

export function listWebSessionSummariesByOwnerUuid(
  uuid: string,
): SessionSummaryResponse[] {
  return storeListSessionsByOwnerUuid(uuid)
    .filter(session => !isSessionClosedStatus(session.status))
    .map(toSummaryResponse)
    .map(toWebSessionSummaryResponse)
}

export function updateSessionTitle(sessionId: string, title: string) {
  storeUpdateSession(sessionId, { title })
}

export function updateSessionStatus(sessionId: string, status: string) {
  storeUpdateSession(sessionId, { status })
  const bus = getAllEventBuses().get(sessionId)
  if (!bus) return

  bus.publish({
    id: randomUUID(),
    sessionId,
    type: 'session_status',
    payload: { status },
    direction: 'inbound',
  })
}

export function touchSession(sessionId: string) {
  storeUpdateSession(sessionId, {})
}

export function archiveSession(sessionId: string) {
  updateSessionStatus(sessionId, 'archived')
  removeEventBus(sessionId)
}

export function incrementEpoch(sessionId: string): number {
  const record = storeGetSession(sessionId)
  if (!record) throw new Error('Session not found')
  const newEpoch = record.workerEpoch + 1
  storeUpdateSession(sessionId, { workerEpoch: newEpoch })
  return newEpoch
}

export function listSessions() {
  return storeListSessions().map(toResponse)
}

function toSummaryResponse(row: {
  id: string
  title: string | null
  status: string
  username: string | null
  updatedAt: Date
}): SessionSummaryResponse {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    username: row.username,
    updated_at: row.updatedAt.getTime() / 1000,
  }
}

export function listSessionSummaries(): SessionSummaryResponse[] {
  return storeListSessions().map(toSummaryResponse)
}

export function listSessionSummariesByOwnerUuid(
  uuid: string,
): SessionSummaryResponse[] {
  return storeListSessionsByOwnerUuid(uuid).map(toSummaryResponse)
}

export function listSessionSummariesByUsername(
  username: string,
): SessionSummaryResponse[] {
  return storeListSessionsByUsername(username).map(toSummaryResponse)
}

export function listSessionsByEnvironment(envId: string) {
  return storeListSessionsByEnvironment(envId).map(toResponse)
}
