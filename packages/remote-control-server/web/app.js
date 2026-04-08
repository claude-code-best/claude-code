/**
 * Remote Control — Main App (Router + Orchestrator)
 */
import { setToken, clearToken, setUsername, getUsername, isLoggedIn, apiLogin, apiFetchSessions, apiFetchEnvironments, apiFetchSession, apiSendEvent, apiSendControl, apiInterrupt, apiCreateSession } from "./api.js";
import { connectSSE, disconnectSSE } from "./sse.js";
import { appendEvent, renderPermissionRequest } from "./render.js";
import { esc, formatTime, statusClass } from "./utils.js";

// ============================================================
// State
// ============================================================

let currentSessionId = null;
let dashboardInterval = null;
let cachedEnvs = [];

// ============================================================
// Router
// ============================================================

const pages = ["login", "dashboard", "session"];

function getPathSessionId() {
  const match = window.location.pathname.match(/^\/code\/([^/]+)/);
  return match ? match[1] : null;
}

function getBridgeEnvId() {
  return new URLSearchParams(window.location.search).get("bridge");
}

function showPage(name) {
  for (const p of pages) {
    const el = document.getElementById(`page-${p}`);
    if (el) el.classList.toggle("hidden", p !== name);
  }
  const navbar = document.getElementById("navbar");
  navbar.classList.toggle("hidden", name === "login");
}

function navigate(hash) {
  window.location.hash = hash;
}

function handleRoute() {
  const hash = window.location.hash.slice(1) || "";

  if (!isLoggedIn()) {
    showPage("login");
    stopDashboardRefresh();
    disconnectSSE();
    return;
  }

  // Show username in navbar
  const navUsername = document.getElementById("nav-username");
  if (navUsername) navUsername.textContent = getUsername() || "";

  const pathSessionId = getPathSessionId();
  if (pathSessionId) {
    showPage("session");
    stopDashboardRefresh();
    renderSessionDetail(pathSessionId);
    return;
  }

  if (hash.startsWith("session/")) {
    const id = hash.slice("session/".length);
    if (id) {
      showPage("session");
      stopDashboardRefresh();
      renderSessionDetail(id);
      return;
    }
  }

  showPage("dashboard");
  disconnectSSE();
  renderDashboard();
  startDashboardRefresh();
}

window.addEventListener("hashchange", handleRoute);

// ============================================================
// Login
// ============================================================

function setupLogin() {
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");
    const keyInput = document.getElementById("api-key-input");
    const userInput = document.getElementById("username-input");
    const btn = document.getElementById("login-btn");
    const key = keyInput.value.trim();
    const username = userInput.value.trim();
    if (!key || !username) {
      errorEl.textContent = "Username and API key are required";
      errorEl.classList.remove("hidden");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Signing in...";
    try {
      const res = await apiLogin(key, username);
      setToken(res.token);
      setUsername(username);
      navigate("#dashboard");
    } catch (err) {
      errorEl.textContent = err.message || "Login failed";
      errorEl.classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  });

  document.getElementById("nav-logout").addEventListener("click", () => {
    clearToken();
    stopDashboardRefresh();
    disconnectSSE();
    navigate("#login");
  });
}

// ============================================================
// Dashboard
// ============================================================

async function renderDashboard() {
  try {
    const [sessions, envs] = await Promise.all([apiFetchSessions(), apiFetchEnvironments()]);
    cachedEnvs = envs || [];
    renderEnvironmentList(cachedEnvs);
    renderSessionList(sessions);
  } catch (err) {
    if (err.message.includes("unauthorized") || err.message.includes("401")) {
      clearToken();
      navigate("#login");
    }
  }
}

function renderEnvironmentList(envs) {
  const container = document.getElementById("env-list");
  if (!envs || envs.length === 0) {
    container.innerHTML = '<div class="empty-state">No active environments</div>';
    return;
  }
  container.innerHTML = envs.map((e) => `
    <div class="env-card">
      <div>
        <div class="env-name">${esc(e.machine_name || e.id)}</div>
        <div class="env-dir">${esc(e.directory || "")}</div>
      </div>
      <div style="text-align:right">
        <span class="status-badge status-${statusClass(e.status)}">${esc(e.status)}</span>
        <div class="env-branch">${e.branch ? esc(e.branch) : ""}</div>
      </div>
    </div>`).join("");
}

function renderSessionList(sessions) {
  const container = document.getElementById("session-list");
  if (!sessions || sessions.length === 0) {
    container.innerHTML = '<div class="empty-state">No sessions</div>';
    return;
  }
  sessions.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  container.innerHTML = sessions.map((s) => `
    <div class="session-card" onclick="navigate('#session/${esc(s.id)}')">
      <div>
        <div class="session-title-text">${esc(s.title || s.id)}</div>
        <div class="session-id-text">${esc(s.id)}</div>
      </div>
      <span class="status-badge status-${statusClass(s.status)}">${esc(s.status)}</span>
      <span class="meta-item">${formatTime(s.created_at)}</span>
    </div>`).join("");
}

function startDashboardRefresh() {
  stopDashboardRefresh();
  dashboardInterval = setInterval(renderDashboard, 10000);
}
function stopDashboardRefresh() {
  if (dashboardInterval) { clearInterval(dashboardInterval); dashboardInterval = null; }
}

// ============================================================
// Session Detail
// ============================================================

async function renderSessionDetail(id) {
  currentSessionId = id;
  try {
    const session = await apiFetchSession(id);
    document.getElementById("session-title").textContent = session.title || session.id;
    document.getElementById("session-id").textContent = session.id;
    document.getElementById("session-env").textContent = session.environment_id || "";
    document.getElementById("session-time").textContent = formatTime(session.created_at);
    const badge = document.getElementById("session-status");
    badge.textContent = session.status;
    badge.className = `status-badge status-${statusClass(session.status)}`;
  } catch (err) {
    if (err.message.includes("unauthorized") || err.message.includes("401")) {
      clearToken();
      navigate("#login");
      return;
    }
  }
  document.getElementById("event-stream").innerHTML = "";
  document.getElementById("permission-area").innerHTML = "";
  document.getElementById("permission-area").classList.add("hidden");
  connectSSE(id, appendEvent);
}

// ============================================================
// Control Bar
// ============================================================

function setupControlBar() {
  const input = document.getElementById("msg-input");
  const sendBtn = document.getElementById("send-btn");
  const interruptBtn = document.getElementById("interrupt-btn");

  sendBtn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  interruptBtn.addEventListener("click", async () => {
    if (!currentSessionId) return;
    interruptBtn.disabled = true;
    try {
      await apiInterrupt(currentSessionId);
      appendEvent({ type: "interrupt", payload: { message: "Session interrupted" } });
    } catch (err) {
      alert("Interrupt failed: " + err.message);
    } finally {
      interruptBtn.disabled = false;
    }
  });
}

async function sendMessage() {
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if (!text || !currentSessionId) return;
  input.value = "";
  try {
    await apiSendEvent(currentSessionId, { type: "user", content: text });
  } catch (err) {
    alert("Failed to send: " + err.message);
  }
}

// ============================================================
// Permission Actions (exposed globally for onclick)
// ============================================================

window._approvePerm = async function (requestId, btn) {
  btn.disabled = true;
  try {
    await apiSendControl(currentSessionId, { type: "permission_response", approved: true, request_id: requestId });
    removePermissionPrompt(btn);
  } catch (err) { alert("Failed to approve: " + err.message); btn.disabled = false; }
};

window._rejectPerm = async function (requestId, btn) {
  btn.disabled = true;
  try {
    await apiSendControl(currentSessionId, { type: "permission_response", approved: false, request_id: requestId });
    removePermissionPrompt(btn);
  } catch (err) { alert("Failed to reject: " + err.message); btn.disabled = false; }
};

function removePermissionPrompt(btn) {
  const prompt = btn.closest(".permission-prompt");
  if (prompt) prompt.remove();
  const area = document.getElementById("permission-area");
  if (area && area.children.length === 0) area.classList.add("hidden");
}

// ============================================================
// New Session Dialog
// ============================================================

function setupNewSessionDialog() {
  const btn = document.getElementById("new-session-btn");
  const dialog = document.getElementById("new-session-dialog");
  const cancelBtn = document.getElementById("ns-cancel");
  const createBtn = document.getElementById("ns-create");
  const errorEl = document.getElementById("ns-error");
  const titleInput = document.getElementById("ns-title");
  const envSelect = document.getElementById("ns-env");

  btn.addEventListener("click", () => {
    envSelect.innerHTML = '<option value="">-- None --</option>';
    for (const e of cachedEnvs) {
      const opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = `${e.machine_name || e.id} (${e.branch || "no branch"})`;
      envSelect.appendChild(opt);
    }
    const bridgeEnvId = getBridgeEnvId();
    if (bridgeEnvId) envSelect.value = bridgeEnvId;
    errorEl.classList.add("hidden");
    titleInput.value = "";
    dialog.classList.remove("hidden");
  });

  cancelBtn.addEventListener("click", () => dialog.classList.add("hidden"));

  createBtn.addEventListener("click", async () => {
    createBtn.disabled = true;
    errorEl.classList.add("hidden");
    try {
      const body = {};
      if (titleInput.value.trim()) body.title = titleInput.value.trim();
      if (envSelect.value) body.environment_id = envSelect.value;
      const session = await apiCreateSession(body);
      dialog.classList.add("hidden");
      navigate(`#session/${session.id}`);
    } catch (err) {
      errorEl.textContent = err.message || "Failed to create session";
      errorEl.classList.remove("hidden");
    } finally {
      createBtn.disabled = false;
    }
  });
}

// ============================================================
// Init
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  setupLogin();
  setupControlBar();
  setupNewSessionDialog();
  handleRoute();
});
