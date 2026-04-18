import type { Session, Environment, ControlResponse, SessionEvent } from "../types";

const BASE = "";

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
  );
}

export function getUuid(): string {
  let uuid = localStorage.getItem("rcs_uuid");
  if (!uuid) {
    uuid = generateUuid();
    localStorage.setItem("rcs_uuid", uuid);
  }
  return uuid;
}

export function setUuid(uuid: string): void {
  localStorage.setItem("rcs_uuid", uuid);
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const uuid = getUuid();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE}${path}${sep}uuid=${encodeURIComponent(uuid)}`;
  const opts: RequestInit = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    const err = data.error || { type: "unknown", message: res.statusText };
    throw new Error(err.message || err.type);
  }
  return data as T;
}

export function apiBind(sessionId: string) {
  return api<void>("POST", "/web/bind", { sessionId });
}

export function apiFetchSessions() {
  return api<Session[]>("GET", "/web/sessions");
}

export function apiFetchAllSessions() {
  return api<Session[]>("GET", "/web/sessions/all");
}

export function apiFetchSession(id: string) {
  return api<Session>("GET", `/web/sessions/${id}`);
}

export function apiFetchSessionHistory(id: string) {
  return api<{ events: SessionEvent[] }>("GET", `/web/sessions/${id}/history`);
}

export function apiFetchEnvironments() {
  return api<Environment[]>("GET", "/web/environments");
}

export function apiSendEvent(sessionId: string, body: Record<string, unknown>) {
  return api<void>("POST", `/web/sessions/${sessionId}/events`, body);
}

export function apiSendControl(sessionId: string, body: ControlResponse) {
  return api<void>("POST", `/web/sessions/${sessionId}/control`, body);
}

export function apiInterrupt(sessionId: string) {
  return api<void>("POST", `/web/sessions/${sessionId}/interrupt`);
}

export function apiCreateSession(body: { title?: string; environment_id?: string }) {
  return api<Session>("POST", "/web/sessions", body);
}
