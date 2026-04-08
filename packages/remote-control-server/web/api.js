/**
 * Remote Control — API Client
 */

const BASE = ""; // same origin

function getToken() {
  return localStorage.getItem("rcs_token");
}

export function setToken(token) {
  localStorage.setItem("rcs_token", token);
}

export function clearToken() {
  localStorage.removeItem("rcs_token");
  localStorage.removeItem("rcs_username");
}

export function setUsername(username) {
  localStorage.setItem("rcs_username", username);
}

export function getUsername() {
  return localStorage.getItem("rcs_username");
}

export function isLoggedIn() {
  const token = getToken();
  // Force re-login for old-format tokens (raw API keys, not rct_* tokens)
  if (token && !token.startsWith("rct_")) {
    clearToken();
    return false;
  }
  return !!token;
}

async function api(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    const err = data.error || { type: "unknown", message: res.statusText };
    throw new Error(err.message || err.type);
  }
  return data;
}

export function apiLogin(apiKey, username) {
  return api("POST", "/web/auth/login", { apiKey, username });
}
export function apiFetchSessions() {
  return api("GET", "/web/sessions");
}
export function apiFetchSession(id) {
  return api("GET", `/web/sessions/${id}`);
}
export function apiFetchEnvironments() {
  return api("GET", "/web/environments");
}
export function apiSendEvent(sessionId, body) {
  return api("POST", `/web/sessions/${sessionId}/events`, body);
}
export function apiSendControl(sessionId, body) {
  return api("POST", `/web/sessions/${sessionId}/control`, body);
}
export function apiInterrupt(sessionId) {
  return api("POST", `/web/sessions/${sessionId}/interrupt`);
}
export function apiCreateSession(body) {
  return api("POST", "/web/sessions", body);
}
