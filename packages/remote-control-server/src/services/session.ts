import {
  storeCreateSession,
  storeGetSession,
  storeUpdateSession,
  storeListSessions,
  storeListSessionsByUsername,
  storeListSessionsByEnvironment,
  storeListSessionsByOwnerUuid,
} from "../store";
import { removeEventBus } from "../transport/event-bus";
import type { CreateSessionRequest, CreateCodeSessionRequest, SessionResponse, SessionSummaryResponse } from "../types/api";

function toResponse(row: { id: string; environmentId: string | null; title: string | null; status: string; source: string; permissionMode: string | null; workerEpoch: number; username: string | null; createdAt: Date; updatedAt: Date }): SessionResponse {
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
  };
}

export function createSession(req: CreateSessionRequest & { username?: string }): SessionResponse {
  const record = storeCreateSession({
    environmentId: req.environment_id,
    title: req.title,
    source: req.source,
    permissionMode: req.permission_mode,
    username: req.username,
  });
  return toResponse(record);
}

export function createCodeSession(req: CreateCodeSessionRequest): SessionResponse {
  const record = storeCreateSession({
    idPrefix: "cse_",
    title: req.title,
    source: req.source,
    permissionMode: req.permission_mode,
  });
  return toResponse(record);
}

export function getSession(sessionId: string): SessionResponse | null {
  const record = storeGetSession(sessionId);
  return record ? toResponse(record) : null;
}

export function updateSessionTitle(sessionId: string, title: string) {
  storeUpdateSession(sessionId, { title });
}

export function updateSessionStatus(sessionId: string, status: string) {
  storeUpdateSession(sessionId, { status });
}

export function archiveSession(sessionId: string) {
  storeUpdateSession(sessionId, { status: "archived" });
  removeEventBus(sessionId);
}

export function incrementEpoch(sessionId: string): number {
  const record = storeGetSession(sessionId);
  if (!record) throw new Error("Session not found");
  const newEpoch = record.workerEpoch + 1;
  storeUpdateSession(sessionId, { workerEpoch: newEpoch });
  return newEpoch;
}

export function listSessions() {
  return storeListSessions().map(toResponse);
}

function toSummaryResponse(row: { id: string; title: string | null; status: string; username: string | null; updatedAt: Date }): SessionSummaryResponse {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    username: row.username,
    updated_at: row.updatedAt.getTime() / 1000,
  };
}

export function listSessionSummaries(): SessionSummaryResponse[] {
  return storeListSessions().map(toSummaryResponse);
}

export function listSessionSummariesByOwnerUuid(uuid: string): SessionSummaryResponse[] {
  return storeListSessionsByOwnerUuid(uuid).map(toSummaryResponse);
}

export function listSessionSummariesByUsername(username: string): SessionSummaryResponse[] {
  return storeListSessionsByUsername(username).map(toSummaryResponse);
}

export function listSessionsByEnvironment(envId: string) {
  return storeListSessionsByEnvironment(envId).map(toResponse);
}
