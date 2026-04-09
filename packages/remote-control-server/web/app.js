/**
 * Remote Control — Main App (Router + Orchestrator)
 * UUID-based auth — no login required
 */
import { getUuid, setUuid, apiBind, apiFetchSessions, apiFetchAllSessions, apiFetchEnvironments, apiFetchSession, apiFetchSessionHistory, apiSendEvent, apiSendControl, apiInterrupt, apiCreateSession } from "./api.js";
import { connectSSE, disconnectSSE } from "./sse.js";
import { appendEvent, renderPermissionRequest, showLoading, isLoading, resetReplayState, renderReplayPendingRequests } from "./render.js";
import { initTaskPanel, toggleTaskPanel, resetTaskState } from "./task-panel.js";
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

function getPathSessionId() {
  const match = window.location.pathname.match(/^\/code\/([^/]+)/);
  return match ? match[1] : null;
}

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function showPage(name) {
  const pages = ["dashboard", "session"];
  for (const p of pages) {
    const el = document.getElementById(`page-${p}`);
    if (el) el.classList.toggle("hidden", p !== name);
  }
}

function navigate(path) {
  history.pushState(null, "", path);
  handleRoute();
}
window.navigate = navigate;

async function handleRoute() {
  // Ensure we have a UUID
  getUuid();

  // Check for UUID import from QR scan (?uuid=xxx)
  const importUuid = getUrlParam("uuid");
  if (importUuid) {
    setUuid(importUuid);
    const url = new URL(window.location);
    url.searchParams.delete("uuid");
    history.replaceState(null, "", url);
  }

  // Check for CLI session bind (?sid=xxx)
  const sid = getUrlParam("sid");
  if (sid) {
    try {
      await apiBind(sid);
      const url = new URL(window.location);
      url.searchParams.delete("sid");
      history.replaceState(null, "", `/code/${sid}`);
      showPage("session");
      stopDashboardRefresh();
      renderSessionDetail(sid);
      return;
    } catch (err) {
      console.error("Failed to bind session:", err);
      alert("Session not found or bind failed: " + err.message);
      history.replaceState(null, "", "/code/");
    }
  }

  // Path-based routing: /code/session_xxx → session detail
  const pathSessionId = getPathSessionId();
  if (pathSessionId) {
    try { await apiBind(pathSessionId); } catch { /* may already be bound */ }
    showPage("session");
    stopDashboardRefresh();
    renderSessionDetail(pathSessionId);
    return;
  }

  // Default: /code → dashboard
  showPage("dashboard");
  disconnectSSE();
  renderDashboard();
  startDashboardRefresh();
}

window.addEventListener("popstate", handleRoute);

// ============================================================
// Dashboard
// ============================================================

async function renderDashboard() {
  try {
    const [sessions, envs] = await Promise.all([apiFetchAllSessions(), apiFetchEnvironments()]);
    cachedEnvs = envs || [];
    renderEnvironmentList(cachedEnvs);
    renderSessionList(sessions);
  } catch (err) {
    console.error("Dashboard render error:", err);
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
    <div class="session-card" onclick="navigate('/code/${esc(s.id)}')">
      <div>
        <div class="session-title-text">${esc(s.title || s.id)}</div>
        <div class="session-id-text">${esc(s.id)}</div>
      </div>
      <span class="status-badge status-${statusClass(s.status)}">${esc(s.status)}</span>
      <span class="meta-item">${formatTime(s.created_at || s.updated_at)}</span>
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

  // Reset task state for new session and init panel
  resetTaskState();
  const taskPanelEl = document.getElementById("task-panel");
  if (taskPanelEl) initTaskPanel(taskPanelEl);

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
    alert("Failed to load session: " + err.message);
    navigate("/code/");
    return;
  }
  document.getElementById("event-stream").innerHTML = "";
  document.getElementById("permission-area").innerHTML = "";
  document.getElementById("permission-area").classList.add("hidden");

  // Load historical events before connecting to live stream
  resetReplayState();
  let lastSeqNum = 0;
  try {
    const { events } = await apiFetchSessionHistory(id);
    if (events && events.length > 0) {
      for (const event of events) {
        appendEvent(event, { replay: true });
        if (event.seqNum && event.seqNum > lastSeqNum) lastSeqNum = event.seqNum;
      }
    }
  } catch (err) {
    console.warn("Failed to load session history:", err);
  }
  // Re-render any still-unresolved permission prompts from history
  renderReplayPendingRequests();

  connectSSE(id, appendEvent, lastSeqNum);
}

// ============================================================
// Control Bar
// ============================================================

function setupControlBar() {
  const input = document.getElementById("msg-input");
  const actionBtn = document.getElementById("action-btn");
  const iconSend = document.getElementById("action-icon-send");
  const iconStop = document.getElementById("action-icon-stop");

  function setBtnState(loading) {
    actionBtn.classList.toggle("loading", loading);
    actionBtn.setAttribute("aria-label", loading ? "Stop" : "Send");
    iconSend.classList.toggle("hidden", loading);
    iconStop.classList.toggle("hidden", !loading);
  }

  window.__updateActionBtn = setBtnState;

  actionBtn.addEventListener("click", () => {
    if (isLoading()) {
      doInterrupt();
    } else {
      sendMessage();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
  });
}

async function doInterrupt() {
  if (!currentSessionId) return;
  const btn = document.getElementById("action-btn");
  btn.disabled = true;
  try {
    await apiInterrupt(currentSessionId);
    appendEvent({ type: "interrupt", payload: { message: "Session interrupted" } });
  } catch (err) {
    alert("Interrupt failed: " + err.message);
  } finally {
    btn.disabled = false;
  }
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
    showLoading();
  } catch (err) { alert("Failed to approve: " + err.message); btn.disabled = false; }
};

window._rejectPerm = async function (requestId, btn) {
  btn.disabled = true;
  try {
    await apiSendControl(currentSessionId, { type: "permission_response", approved: false, request_id: requestId });
    removePermissionPrompt(btn);
  } catch (err) { alert("Failed to reject: " + err.message); btn.disabled = false; }
};

// ============================================================
// AskUserQuestion interactions
// ============================================================

window._selectOption = function (btn, qIdx, oIdx, multiSelect) {
  const panel = btn.closest(".ask-panel");
  if (!panel) return;
  if (!panel._answers) panel._answers = {};

  if (multiSelect) {
    // Toggle multi-select
    btn.classList.toggle("selected");
    if (!panel._answers[qIdx]) panel._answers[qIdx] = [];
    const arr = panel._answers[qIdx];
    const pos = arr.indexOf(oIdx);
    if (pos >= 0) arr.splice(pos, 1);
    else arr.push(oIdx);
  } else {
    // Single select — deselect siblings
    const siblings = panel.querySelectorAll(`.ask-option[data-qidx="${qIdx}"]`);
    siblings.forEach((s) => s.classList.remove("selected"));
    btn.classList.add("selected");
    panel._answers[qIdx] = oIdx;
  }
};

window._submitOther = function (btn, qIdx) {
  const row = btn.closest(".ask-other-row");
  const input = row.querySelector(".ask-other-input");
  const text = input.value.trim();
  if (!text) return;
  const panel = btn.closest(".ask-panel");
  if (!panel) return;
  if (!panel._answers) panel._answers = {};
  panel._answers[qIdx] = text;
  // Deselect any option buttons
  panel.querySelectorAll(`.ask-option[data-qidx="${qIdx}"]`).forEach((s) => s.classList.remove("selected"));
  input.value = "";
  btn.textContent = "Sent!";
  setTimeout(() => { btn.textContent = "Send"; }, 1000);
};

window._switchAskTab = function (btn, idx) {
  const panel = btn.closest(".ask-panel");
  if (!panel) return;
  panel.querySelectorAll(".ask-tab").forEach((t) => t.classList.remove("active"));
  panel.querySelectorAll(".ask-tab-page").forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  const page = panel.querySelector(`.ask-tab-page[data-tab="${idx}"]`);
  if (page) page.classList.add("active");
  const total = panel.querySelectorAll(".ask-tab").length;
  const prog = panel.querySelector(".ask-progress");
  if (prog) prog.textContent = `${idx + 1} / ${total}`;
};

window._submitAnswers = async function (requestId, btn) {
  btn.disabled = true;
  const panel = btn.closest(".ask-panel");
  const rawAnswers = panel?._answers || {};
  const questions = panel?._questions || [];

  // Build updatedInput: merge original input with user's answers
  const answers = {};
  for (const [qIdx, val] of Object.entries(rawAnswers)) {
    const q = questions[parseInt(qIdx)];
    if (!q) continue;
    if (typeof val === "string") {
      // "Other" free-text answer
      answers[qIdx] = val;
    } else if (typeof val === "number") {
      // Selected option index — use label text
      const opt = q.options?.[val];
      answers[qIdx] = opt?.label || String(val);
    } else if (Array.isArray(val)) {
      // Multi-select — join labels
      answers[qIdx] = val.map((i) => q.options?.[i]?.label || String(i));
    }
  }

  try {
    await apiSendControl(currentSessionId, {
      type: "permission_response",
      approved: true,
      request_id: requestId,
      updated_input: { questions, answers },
    });
    removePermissionPrompt(btn);
    showLoading();
  } catch (err) { alert("Failed to submit: " + err.message); btn.disabled = false; }
};

function removePermissionPrompt(btn) {
  const prompt = btn.closest(".permission-prompt, .ask-panel, .plan-panel");
  if (prompt) prompt.remove();
  const area = document.getElementById("permission-area");
  if (area && area.children.length === 0) area.classList.add("hidden");
}

// ============================================================
// ExitPlanMode interactions
// ============================================================

window._selectPlanOption = function (btn, value) {
  const panel = btn.closest(".plan-panel");
  if (!panel) return;

  // Deselect all siblings
  panel.querySelectorAll(".plan-option").forEach((o) => o.classList.remove("selected"));
  btn.classList.add("selected");
  panel._selectedValue = value;

  // Show/hide feedback textarea
  const feedbackArea = panel.querySelector(".plan-feedback-area");
  if (feedbackArea) {
    feedbackArea.classList.toggle("visible", value === "no");
  }
};

window._submitPlanResponse = async function (requestId, btn) {
  const panel = btn.closest(".plan-panel");
  if (!panel) return;

  const selectedValue = panel._selectedValue;
  if (!selectedValue) {
    alert("Please select an option first.");
    return;
  }

  btn.disabled = true;

  try {
    if (selectedValue === "no") {
      // Rejection with optional feedback
      const feedbackInput = panel.querySelector(".plan-feedback-input");
      const feedback = feedbackInput ? feedbackInput.value.trim() : "";
      await apiSendControl(currentSessionId, {
        type: "permission_response",
        approved: false,
        request_id: requestId,
        ...(feedback ? { message: feedback } : {}),
      });
      removePermissionPrompt(btn);
    } else {
      // Approval with permission mode
      const modeMap = {
        "yes-accept-edits": "acceptEdits",
        "yes-default": "default",
      };
      const mode = modeMap[selectedValue] || "default";
      const planContent = panel._planContent || "";

      await apiSendControl(currentSessionId, {
        type: "permission_response",
        approved: true,
        request_id: requestId,
        ...(planContent ? { updated_input: { plan: planContent } } : {}),
        updated_permissions: [
          { type: "setMode", mode, destination: "session" },
        ],
      });
      removePermissionPrompt(btn);
      showLoading();
    }
  } catch (err) {
    alert("Failed to submit: " + err.message);
    btn.disabled = false;
  }
};

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
      navigate(`/code/${session.id}`);
    } catch (err) {
      errorEl.textContent = err.message || "Failed to create session";
      errorEl.classList.remove("hidden");
    } finally {
      createBtn.disabled = false;
    }
  });
}

// ============================================================
// Identity Panel (QR code display + scan)
// ============================================================

function setupIdentityPanel() {
  const btn = document.getElementById("nav-identity");
  const panel = document.getElementById("identity-panel");
  const closeBtn = panel.querySelector(".panel-close");
  const uuidDisplay = document.getElementById("uuid-display");
  const qrContainer = document.getElementById("qr-display");

  // Show panel and generate QR code
  btn.addEventListener("click", () => {
    const uuid = getUuid();
    uuidDisplay.textContent = uuid;
    const qrUrl = `${window.location.origin}/code?uuid=${encodeURIComponent(uuid)}`;
    qrContainer.innerHTML = "";
    if (typeof QRCode !== "undefined") {
      new QRCode(qrContainer, { text: qrUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
      // qrcodejs generates both canvas and img, hide the duplicate img
      const img = qrContainer.querySelector("img");
      if (img) img.remove()
    }
    panel.classList.remove("hidden");
  });

  closeBtn.addEventListener("click", () => panel.classList.add("hidden"));

  // Click outside to close
  panel.addEventListener("click", (e) => {
    if (e.target === panel) panel.classList.add("hidden");
  });

  // Copy UUID to clipboard
  document.getElementById("uuid-copy-btn").addEventListener("click", () => {
    const uuid = getUuid();
    navigator.clipboard.writeText(uuid).then(() => {
      const btn = document.getElementById("uuid-copy-btn");
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy"; }, 2000);
    });
  });

  // Scan QR from uploaded image
  document.getElementById("qr-scan-btn").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (typeof jsQR !== "undefined") {
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code && code.data) {
            try {
              const url = new URL(code.data);
              const importedUuid = url.searchParams.get("uuid");
              if (importedUuid) {
                setUuid(importedUuid);
                panel.classList.add("hidden");
                navigate("/code/");
                renderDashboard();
                return;
              }
            } catch {
              // Not a valid URL — try using raw data as UUID
              if (code.data.length >= 32) {
                setUuid(code.data);
                panel.classList.add("hidden");
                navigate("/code/");
                renderDashboard();
                return;
              }
            }
            alert("No valid UUID found in QR code");
          } else {
            alert("No QR code found in image");
          }
        }
      };
      img.src = URL.createObjectURL(file);
    };
    input.click();
  });
}

// ============================================================
// Task Panel Toggle
// ============================================================

function setupTaskPanelToggle() {
  window.__toggleTaskPanel = toggleTaskPanel;
  const toggleBtn = document.getElementById("task-panel-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => toggleTaskPanel());
  }
}

// ============================================================
// Init
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  setupControlBar();
  setupNewSessionDialog();
  setupIdentityPanel();
  setupTaskPanelToggle();
  handleRoute();
});
