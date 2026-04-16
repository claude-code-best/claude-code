import { v4 as uuid } from "uuid";

// ---------- Types ----------

export interface UserRecord {
  username: string;
  createdAt: Date;
}

export interface EnvironmentRecord {
  id: string;
  secret: string;
  machineName: string | null;
  directory: string | null;
  branch: string | null;
  gitRepoUrl: string | null;
  maxSessions: number;
  workerType: string;
  bridgeId: string | null;
  status: string;
  username: string | null;
  lastPollAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionRecord {
  id: string;
  environmentId: string | null;
  title: string | null;
  status: string;
  source: string;
  permissionMode: string | null;
  workerEpoch: number;
  username: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkItemRecord {
  id: string;
  environmentId: string;
  sessionId: string;
  state: string;
  secret: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionWorkerRecord {
  sessionId: string;
  workerStatus: string | null;
  externalMetadata: Record<string, unknown> | null;
  requiresActionDetails: Record<string, unknown> | null;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------- Stores (in-memory Maps) ----------

const users = new Map<string, UserRecord>();
const tokenToUser = new Map<string, { username: string; createdAt: Date }>();
const environments = new Map<string, EnvironmentRecord>();
const sessions = new Map<string, SessionRecord>();
const workItems = new Map<string, WorkItemRecord>();
const sessionWorkers = new Map<string, SessionWorkerRecord>();

// UUID → session ownership: sessionId → Set of UUIDs
const sessionOwners = new Map<string, Set<string>>();

// ---------- User ----------

export function storeCreateUser(username: string): UserRecord {
  const existing = users.get(username);
  if (existing) return existing;
  const record: UserRecord = { username, createdAt: new Date() };
  users.set(username, record);
  return record;
}

export function storeGetUser(username: string): UserRecord | undefined {
  return users.get(username);
}

export function storeCreateToken(username: string, token: string): void {
  tokenToUser.set(token, { username, createdAt: new Date() });
}

export function storeGetUserByToken(token: string): { username: string; createdAt: Date } | undefined {
  return tokenToUser.get(token);
}

export function storeDeleteToken(token: string): boolean {
  return tokenToUser.delete(token);
}

// ---------- Environment ----------

export function storeCreateEnvironment(req: {
  secret: string;
  machineName?: string;
  directory?: string;
  branch?: string;
  gitRepoUrl?: string;
  maxSessions?: number;
  workerType?: string;
  bridgeId?: string;
  username?: string;
}): EnvironmentRecord {
  const id = `env_${uuid().replace(/-/g, "")}`;
  const now = new Date();
  const record: EnvironmentRecord = {
    id,
    secret: req.secret,
    machineName: req.machineName ?? null,
    directory: req.directory ?? null,
    branch: req.branch ?? null,
    gitRepoUrl: req.gitRepoUrl ?? null,
    maxSessions: req.maxSessions ?? 1,
    workerType: req.workerType ?? "claude_code",
    bridgeId: req.bridgeId ?? null,
    status: "active",
    username: req.username ?? null,
    lastPollAt: now,
    createdAt: now,
    updatedAt: now,
  };
  environments.set(id, record);
  return record;
}

export function storeGetEnvironment(id: string): EnvironmentRecord | undefined {
  return environments.get(id);
}

export function storeUpdateEnvironment(id: string, patch: Partial<Pick<EnvironmentRecord, "status" | "lastPollAt" | "updatedAt">>): boolean {
  const rec = environments.get(id);
  if (!rec) return false;
  Object.assign(rec, patch, { updatedAt: new Date() });
  return true;
}

export function storeListActiveEnvironments(): EnvironmentRecord[] {
  return [...environments.values()].filter((e) => e.status === "active");
}

export function storeListActiveEnvironmentsByUsername(username: string): EnvironmentRecord[] {
  return [...environments.values()].filter((e) => e.status === "active" && e.username === username);
}

// ---------- Session ----------

export function storeCreateSession(req: {
  environmentId?: string | null;
  title?: string | null;
  source?: string;
  permissionMode?: string | null;
  idPrefix?: string;
  username?: string | null;
}): SessionRecord {
  const id = `${req.idPrefix || "session_"}${uuid().replace(/-/g, "")}`;
  const now = new Date();
  const record: SessionRecord = {
    id,
    environmentId: req.environmentId ?? null,
    title: req.title ?? null,
    status: "idle",
    source: req.source ?? "remote-control",
    permissionMode: req.permissionMode ?? null,
    workerEpoch: 0,
    username: req.username ?? null,
    createdAt: now,
    updatedAt: now,
  };
  sessions.set(id, record);
  return record;
}

export function storeGetSession(id: string): SessionRecord | undefined {
  return sessions.get(id);
}

export function storeUpdateSession(id: string, patch: Partial<Pick<SessionRecord, "title" | "status" | "workerEpoch" | "updatedAt">>): boolean {
  const rec = sessions.get(id);
  if (!rec) return false;
  Object.assign(rec, patch, { updatedAt: new Date() });
  return true;
}

export function storeListSessions(): SessionRecord[] {
  return [...sessions.values()];
}

export function storeListSessionsByUsername(username: string): SessionRecord[] {
  return [...sessions.values()].filter((s) => s.username === username);
}

export function storeListSessionsByEnvironment(envId: string): SessionRecord[] {
  return [...sessions.values()].filter((s) => s.environmentId === envId);
}

export function storeDeleteSession(id: string): boolean {
  sessionWorkers.delete(id);
  return sessions.delete(id);
}

// ---------- Session Worker ----------

export function storeGetSessionWorker(sessionId: string): SessionWorkerRecord | undefined {
  return sessionWorkers.get(sessionId);
}

export function storeUpsertSessionWorker(sessionId: string, patch: {
  workerStatus?: string | null;
  externalMetadata?: Record<string, unknown> | null;
  requiresActionDetails?: Record<string, unknown> | null;
  lastHeartbeatAt?: Date | null;
}): SessionWorkerRecord {
  const now = new Date();
  const existing = sessionWorkers.get(sessionId);
  const record: SessionWorkerRecord = existing ?? {
    sessionId,
    workerStatus: null,
    externalMetadata: null,
    requiresActionDetails: null,
    lastHeartbeatAt: null,
    createdAt: now,
    updatedAt: now,
  };

  if (patch.workerStatus !== undefined) {
    record.workerStatus = patch.workerStatus;
  }
  if (patch.externalMetadata !== undefined) {
    if (patch.externalMetadata === null) {
      record.externalMetadata = null;
    } else {
      record.externalMetadata = {
        ...(record.externalMetadata ?? {}),
        ...patch.externalMetadata,
      };
    }
  }
  if (patch.requiresActionDetails !== undefined) {
    record.requiresActionDetails = patch.requiresActionDetails;
  }
  if (patch.lastHeartbeatAt !== undefined) {
    record.lastHeartbeatAt = patch.lastHeartbeatAt;
  }
  record.updatedAt = now;

  sessionWorkers.set(sessionId, record);
  return record;
}

// ---------- Work Items ----------

// ---------- Session Ownership (UUID-based) ----------

export function storeBindSession(sessionId: string, uuid: string): void {
  let owners = sessionOwners.get(sessionId);
  if (!owners) {
    owners = new Set();
    sessionOwners.set(sessionId, owners);
  }
  owners.add(uuid);
}

export function storeIsSessionOwner(sessionId: string, uuid: string): boolean {
  const owners = sessionOwners.get(sessionId);
  return owners ? owners.has(uuid) : false;
}

export function storeListSessionsByOwnerUuid(uuid: string): SessionRecord[] {
  const result: SessionRecord[] = [];
  for (const [sessionId, owners] of sessionOwners) {
    if (owners.has(uuid)) {
      const session = sessions.get(sessionId);
      if (session) result.push(session);
    }
  }
  return result;
}

// ---------- Work Items (cont.) ----------

export function storeCreateWorkItem(req: {
  environmentId: string;
  sessionId: string;
  secret: string;
}): WorkItemRecord {
  const id = `work_${uuid().replace(/-/g, "")}`;
  const now = new Date();
  const record: WorkItemRecord = {
    id,
    environmentId: req.environmentId,
    sessionId: req.sessionId,
    state: "pending",
    secret: req.secret,
    createdAt: now,
    updatedAt: now,
  };
  workItems.set(id, record);
  return record;
}

export function storeGetWorkItem(id: string): WorkItemRecord | undefined {
  return workItems.get(id);
}

export function storeGetPendingWorkItem(environmentId: string): WorkItemRecord | undefined {
  for (const item of workItems.values()) {
    if (item.environmentId === environmentId && item.state === "pending") {
      return item;
    }
  }
  return undefined;
}

export function storeUpdateWorkItem(id: string, patch: Partial<Pick<WorkItemRecord, "state" | "updatedAt">>): boolean {
  const rec = workItems.get(id);
  if (!rec) return false;
  Object.assign(rec, patch, { updatedAt: new Date() });
  return true;
}

// ---------- Reset (for tests) ----------

export function storeReset() {
  users.clear();
  tokenToUser.clear();
  environments.clear();
  sessions.clear();
  workItems.clear();
  sessionWorkers.clear();
  sessionOwners.clear();
}
