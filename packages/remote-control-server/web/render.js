/**
 * Remote Control — Event Rendering
 *
 * Renders session events into DOM elements for the event stream.
 */

import { esc } from "./utils.js";
import { processAssistantEvent } from "./task-panel.js";

// ============================================================
// Replay state — tracks unresolved permission requests during history replay
// ============================================================

const replayPendingRequests = new Map();   // request_id → event data (unresolved)
const replayRespondedRequests = new Set(); // request_ids that have a response
const renderedUserUuids = new Set();

/** Clear replay tracking state (call before each history load) */
export function resetReplayState() {
  replayPendingRequests.clear();
  replayRespondedRequests.clear();
  renderedUserUuids.clear();
}

/** After replay finishes, render any still-unresolved permission prompts */
export function renderReplayPendingRequests() {
  if (replayPendingRequests.size === 0) return;

  // Sort by seqNum to maintain order
  const sorted = [...replayPendingRequests.entries()].sort((a, b) => (a[1].seqNum || 0) - (b[1].seqNum || 0));
  for (const [, data] of sorted) {
    // Re-invoke appendEvent without replay flag to go through the normal interactive path
    appendEvent(data, { replay: false });
  }
  replayPendingRequests.clear();
}

// ============================================================
// Helpers
// ============================================================

function truncate(str, max) {
  if (!str) return "";
  const s = String(str);
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/**
 * Extract plain text from an event payload.
 * Server-side normalization guarantees payload.content is a string.
 * Falls back to raw/message parsing for backward compat.
 */
export function extractText(payload) {
  if (!payload) return "";

  // Normalized format (server standardized)
  if (typeof payload.content === "string" && payload.content) return payload.content;

  // Fallback: raw message.content (child process format)
  const msg = payload.message;
  if (msg && typeof msg === "object") {
    const mc = msg.content;
    if (typeof mc === "string") return mc;
    if (Array.isArray(mc)) {
      return mc
        .filter((b) => b && typeof b === "object" && b.type === "text")
        .map((b) => b.text || "")
        .join("");
    }
  }

  // Final fallback
  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

function formatAssistantContent(content) {
  let html = esc(content);
  // Code blocks: ```...```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre style="background:var(--bg-tool-card);padding:10px;border-radius:6px;overflow-x:auto;margin:6px 0;font-family:var(--font-mono);font-size:0.82rem;">${code.trim()}</pre>`;
  });
  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-tool-card);padding:2px 5px;border-radius:3px;font-family:var(--font-mono);font-size:0.85em;">$1</code>');
  // Bold: **...**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function getUserUuid(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.uuid === "string" && payload.uuid) return payload.uuid;
  if (payload.raw && typeof payload.raw === "object" && typeof payload.raw.uuid === "string" && payload.raw.uuid) {
    return payload.raw.uuid;
  }
  return null;
}

function shouldRenderUserEvent(payload, direction, replay) {
  const uuid = getUserUuid(payload);
  if (uuid) {
    if (renderedUserUuids.has(uuid)) return false;
    renderedUserUuids.add(uuid);
    return true;
  }

  // Legacy fallback with no uuid: keep the previous no-duplicate behavior.
  // Live inbound user events without a uuid are most likely echoes of a web-
  // sent message; replay keeps the prior "outbound only" rule as well.
  return direction === "outbound";
}

function getMessageContentBlocks(payload) {
  if (!payload || typeof payload !== "object") return [];
  const msg = payload.message;
  if (!msg || typeof msg !== "object" || !Array.isArray(msg.content)) return [];
  return msg.content.filter((block) => block && typeof block === "object");
}

function renderEmbeddedToolUseBlocks(payload) {
  return getMessageContentBlocks(payload)
    .filter((block) => block.type === "tool_use")
    .map((block) =>
      renderToolUse({
        tool_name: block.name || "tool",
        tool_input: block.input || {},
      }),
    );
}

function renderEmbeddedToolResultBlocks(payload) {
  return getMessageContentBlocks(payload)
    .filter((block) => block.type === "tool_result")
    .map((block) =>
      renderToolResult({
        content: block.content || "",
        output: block.content || "",
        is_error: !!block.is_error,
      }),
    );
}

// ============================================================
// Event Router
// ============================================================

export function appendEvent(data, { replay = false } = {}) {
  const stream = document.getElementById("event-stream");
  if (!stream) return;

  const type = data.type || "unknown";
  const payload = data.payload || {};
  const direction = data.direction || "inbound";

  // Early filter: skip bridge init noise regardless of event type
  const serialized = JSON.stringify(data);
  if (/Remote Control connecting/i.test(serialized)) return;

  // During history replay, only render messages & tools — skip interactive/stateful events
  // Exception: unresolved permission/control requests are re-shown as pending prompts.
  if (replay) {
    const histEls = [];
    switch (type) {
      case "user":
        {
          const toolResultEls = renderEmbeddedToolResultBlocks(payload);
          if (toolResultEls.length > 0) {
            histEls.push(...toolResultEls);
            break;
          }
          if (shouldRenderUserEvent(payload, direction, true)) {
            histEls.push(renderUserMessage(payload, direction));
          }
        }
        break;
      case "assistant":
        {
          const toolUseEls = renderEmbeddedToolUseBlocks(payload);
          const text = extractText(payload);
          if (text && text.trim()) histEls.push(renderAssistantMessage(payload));
          if (toolUseEls.length > 0) histEls.push(...toolUseEls);
          processAssistantEvent(payload);
        }
        break;
      case "tool_use":
        histEls.push(renderToolUse(payload));
        break;
      case "tool_result":
        histEls.push(renderToolResult(payload));
        break;
      case "error":
        histEls.push(renderSystemMessage(`Error: ${payload.message || payload.content || "Unknown error"}`));
        break;
      case "session_status":
        if (payload.status === "archived" || payload.status === "inactive") {
          histEls.push(renderSystemMessage(`Session ${payload.status}`));
        }
        break;
      case "control_request":
      case "permission_request":
        // Track unanswered permission/control requests for replay
        if (payload.request && payload.request.subtype === "can_use_tool" && direction === "inbound") {
          const rid = payload.request_id || data.id;
          if (rid && !replayRespondedRequests.has(rid)) {
            replayPendingRequests.set(rid, data);
          }
        }
        return;
      case "control_response":
      case "permission_response":
        // Mark the corresponding request as resolved
        {
          const respRid = payload.request_id;
          if (respRid) {
            replayRespondedRequests.add(respRid);
            replayPendingRequests.delete(respRid);
          }
        }
        return;
      // Skip: partial_assistant, result, status, interrupt, system, user inbound echoes
      default:
        return;
    }
    for (const histEl of histEls) {
      stream.appendChild(histEl);
      stream.scrollTop = stream.scrollHeight;
    }
    return;
  }

  const els = [];
  let needLoading = false;

  switch (type) {
    case "user":
      {
        const toolResultEls = renderEmbeddedToolResultBlocks(payload);
        if (toolResultEls.length > 0) {
          els.push(...toolResultEls);
          break;
        }
        if (!shouldRenderUserEvent(payload, direction, false)) return;
        els.push(renderUserMessage(payload, direction));
        needLoading = true;
      }
      break;
    case "partial_assistant":
      // Skip partial assistant — wait for the final "assistant" event
      // to avoid blank/duplicate messages during streaming
      return;
    case "assistant":
      {
        const toolUseEls = renderEmbeddedToolUseBlocks(payload);
        const text = extractText(payload);
        if (text && text.trim()) {
          removeLoading();
          els.push(renderAssistantMessage(payload));
        }
        if (toolUseEls.length > 0) els.push(...toolUseEls);
        processAssistantEvent(payload);
      }
      break;
    case "result":
    case "result_success":
      removeLoading();
      // Skip result — it just repeats the assistant message content
      return;
    case "tool_use":
      els.push(renderToolUse(payload));
      break;
    case "tool_result":
      els.push(renderToolResult(payload));
      break;
    case "control_request":
    case "permission_request":
      if (payload.request && payload.request.subtype === "can_use_tool") {
        const toolName = payload.request.tool_name || "unknown";
        const toolInput = payload.request.input || payload.request.tool_input || {};
        if (toolName === "AskUserQuestion") {
          els.push(renderAskUserQuestion({
            request_id: payload.request_id || data.id,
            tool_input: toolInput,
            description: payload.request.description || "",
          }));
        } else if (toolName === "ExitPlanMode") {
          els.push(renderExitPlanMode({
            request_id: payload.request_id || data.id,
            tool_input: toolInput,
            description: payload.request.description || "",
          }));
        } else {
          els.push(renderPermissionRequest({
            request_id: payload.request_id || data.id,
            tool_name: toolName,
            tool_input: toolInput,
            description: payload.request.description || "",
          }));
        }
      } else {
        els.push(renderSystemMessage(`Control: ${payload.request?.subtype || "unknown"}`));
      }
      break;
    case "control_response":
    case "permission_response":
      // Skip — these are just acknowledgments, no need to show in stream
      return;
    case "status":
      // Skip connecting/waiting status noise from bridge
      {
        const msg = payload.message || payload.content || "";
        const fullText = typeof payload === "string" ? payload : JSON.stringify(payload);
        if (/connecting|waiting|initializing|Remote Control/i.test(msg + " " + fullText)) return;
        if (!msg.trim()) return;
        els.push(renderSystemMessage(msg));
      }
      break;
    case "error":
      removeLoading();
      els.push(renderSystemMessage(`Error: ${payload.message || payload.content || "Unknown error"}`));
      break;
    case "session_status":
      if (payload.status === "archived" || payload.status === "inactive") {
        removeLoading();
        els.push(renderSystemMessage(`Session ${payload.status}`));
      }
      break;
    case "interrupt":
      removeLoading();
      els.push(renderSystemMessage("Session interrupted"));
      break;
    case "system":
      // Skip raw system/init messages — they're noise
      return;
    default: {
      // Skip noise from bridge init
      const raw = JSON.stringify(payload);
      if (/Remote Control connecting/i.test(raw)) return;
      els.push(renderSystemMessage(`${type}: ${truncate(raw, 200)}`));
    }
  }

  for (const el of els) {
    stream.appendChild(el);
    stream.scrollTop = stream.scrollHeight;
  }

  // Show loading after the message element is in the DOM so it renders below
  if (needLoading) showLoading();
}

// ============================================================
// Renderers
// ============================================================

function renderUserMessage(payload, direction) {
  const content = extractText(payload);
  const row = document.createElement("div");
  row.className = "msg-row user";
  row.innerHTML = `<div class="msg-bubble">${esc(content)}</div>`;
  return row;
}

function renderAssistantMessage(payload) {
  const content = extractText(payload);
  const row = document.createElement("div");
  row.className = "msg-row assistant";
  row.innerHTML = `<div class="msg-bubble">${formatAssistantContent(content)}</div>`;
  return row;
}

function renderResult(payload) {
  const text = payload.result || payload.subtype || "Session completed";
  const row = document.createElement("div");
  row.className = "msg-row system result";
  row.innerHTML = `<div class="msg-bubble">✓ ${esc(text)}</div>`;
  return row;
}

function renderToolUse(payload) {
  const name = payload.tool_name || payload.name || "tool";
  const input = payload.tool_input || payload.input || {};
  const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);

  const card = document.createElement("div");
  card.className = "msg-row tool";
  card.innerHTML = `
    <div class="tool-card">
      <div class="tool-card-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <span class="tool-icon">&#9654;</span> Tool: <strong>${esc(name)}</strong>
      </div>
      <div class="tool-card-body collapsed">${esc(truncate(inputStr, 2000))}</div>
    </div>`;
  return card;
}

function renderToolResult(payload) {
  const content = payload.content || payload.output || "";
  const contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);

  const card = document.createElement("div");
  card.className = "msg-row tool";
  card.innerHTML = `
    <div class="tool-card">
      <div class="tool-card-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <span class="tool-icon">&#9654;</span> Tool Result
      </div>
      <div class="tool-card-body collapsed">${esc(truncate(contentStr, 2000))}</div>
    </div>`;
  return card;
}

export function renderPermissionRequest(payload) {
  const requestId = payload.request_id || payload.id || "";
  const toolName = payload.tool_name || "unknown";
  const toolInput = payload.tool_input || payload.input || {};
  const description = payload.description || "";
  const inputStr = typeof toolInput === "string" ? toolInput : JSON.stringify(toolInput, null, 2);

  const area = document.getElementById("permission-area");
  area.classList.remove("hidden");

  const el = document.createElement("div");
  el.className = "permission-prompt";
  el.dataset.requestId = requestId;
  el.innerHTML = `
    <div class="perm-title">Permission Request</div>
    ${description ? `<div class="perm-desc">${esc(description)}</div>` : ""}
    <div class="perm-tool-name"><strong>${esc(toolName)}</strong></div>
    ${toolName !== "AskUserQuestion" ? `<div class="perm-tool">${esc(truncate(inputStr, 500))}</div>` : ""}
    <div class="perm-actions">
      <button class="btn-approve" onclick="window._approvePerm('${esc(requestId)}', this)">Approve</button>
      <button class="btn-reject" onclick="window._rejectPerm('${esc(requestId)}', this)">Reject</button>
    </div>`;
  area.appendChild(el);

  return renderSystemMessage(`Permission requested: ${toolName}`);
}

export function renderAskUserQuestion(payload) {
  const requestId = payload.request_id || payload.id || "";
  const questions = payload.tool_input?.questions || [];
  const description = payload.description || "";

  const area = document.getElementById("permission-area");
  area.classList.remove("hidden");

  const el = document.createElement("div");
  el.className = "ask-panel";
  el.dataset.requestId = requestId;

  // Single question — no tabs needed
  if (questions.length <= 1) {
    const q = questions[0] || {};
    const multiSelect = q.multiSelect || false;
    el.innerHTML = `
      <div class="ask-title">${esc(description || q.question || "Question")}</div>
      <div class="ask-options">
        ${(q.options || []).map((opt, j) => `
          <button class="ask-option${multiSelect ? " ask-multi" : ""}" data-qidx="0" data-oidx="${j}"
            onclick="window._selectOption(this, 0, ${j}, ${multiSelect})">
            <span class="ask-option-label">${esc(opt.label || "")}</span>
            ${opt.description ? `<span class="ask-option-desc">${esc(opt.description)}</span>` : ""}
          </button>
        `).join("")}
        <div class="ask-other-row">
          <input type="text" class="ask-other-input" data-qidx="0" placeholder="Other..." />
          <button class="ask-other-btn" onclick="window._submitOther(this, 0)">Send</button>
        </div>
      </div>
      <div class="ask-actions">
        <button class="btn-approve" onclick="window._submitAnswers('${esc(requestId)}', this)">Submit</button>
        <button class="btn-reject" onclick="window._rejectPerm('${esc(requestId)}', this)">Skip</button>
      </div>`;
  } else {
    // Multiple questions — tab layout
    const tabs = questions.map((q, i) => {
      const multiSelect = q.multiSelect || false;
      return `
        <div class="ask-tab-page${i === 0 ? " active" : ""}" data-tab="${i}">
          <div class="ask-question-text">${esc(q.question || "")}</div>
          ${q.header ? `<div class="ask-header">${esc(q.header)}</div>` : ""}
          <div class="ask-options">
            ${(q.options || []).map((opt, j) => `
              <button class="ask-option${multiSelect ? " ask-multi" : ""}" data-qidx="${i}" data-oidx="${j}"
                onclick="window._selectOption(this, ${i}, ${j}, ${multiSelect})">
                <span class="ask-option-label">${esc(opt.label || "")}</span>
                ${opt.description ? `<span class="ask-option-desc">${esc(opt.description)}</span>` : ""}
              </button>
            `).join("")}
            <div class="ask-other-row">
              <input type="text" class="ask-other-input" data-qidx="${i}" placeholder="Other..." />
              <button class="ask-other-btn" onclick="window._submitOther(this, ${i})">Send</button>
            </div>
          </div>
        </div>`;
    }).join("");

    const tabBar = questions.map((q, i) =>
      `<button class="ask-tab${i === 0 ? " active" : ""}" onclick="window._switchAskTab(this, ${i})">${esc(q.header || `Q${i + 1}`)}</button>`
    ).join("");

    el.innerHTML = `
      <div class="ask-title">${esc(description || "Questions")}</div>
      <div class="ask-tabs">${tabBar}</div>
      ${tabs}
      <div class="ask-tab-footer">
        <span class="ask-progress">1 / ${questions.length}</span>
        <div class="ask-actions">
          <button class="btn-approve" onclick="window._submitAnswers('${esc(requestId)}', this)">Submit All</button>
          <button class="btn-reject" onclick="window._rejectPerm('${esc(requestId)}', this)">Skip</button>
        </div>
      </div>`;
  }
  area.appendChild(el);

  // Track selected options and store original questions for answer mapping
  el._answers = {};
  el._questions = questions;

  return renderSystemMessage("Waiting for your response...");
}

export function renderExitPlanMode(payload) {
  const requestId = payload.request_id || payload.id || "";
  const toolInput = payload.tool_input || {};
  const description = payload.description || "";
  const planContent = toolInput.plan || "";

  const area = document.getElementById("permission-area");
  area.classList.remove("hidden");

  const el = document.createElement("div");
  el.className = "plan-panel";
  el.dataset.requestId = requestId;

  const isEmpty = !planContent || !planContent.trim();

  if (isEmpty) {
    el.innerHTML = `
      <div class="plan-title">Exit plan mode?</div>
      <div class="plan-options">
        <button class="plan-option" data-value="yes-default" onclick="window._selectPlanOption(this, 'yes-default')">
          <span class="plan-option-label">Yes</span>
        </button>
        <button class="plan-option" data-value="no" onclick="window._selectPlanOption(this, 'no')">
          <span class="plan-option-label">No</span>
        </button>
      </div>
      <div class="plan-actions">
        <button class="btn-plan-submit" onclick="window._submitPlanResponse('${esc(requestId)}', this)">Submit</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="plan-title">Ready to code?</div>
      <div class="plan-content">${formatAssistantContent(planContent)}</div>
      <div class="plan-options">
        <button class="plan-option" data-value="yes-accept-edits" onclick="window._selectPlanOption(this, 'yes-accept-edits')">
          <span class="plan-option-label">Yes, auto-accept edits</span>
          <span class="plan-option-desc">Approve plan and auto-accept file edits</span>
        </button>
        <button class="plan-option" data-value="yes-default" onclick="window._selectPlanOption(this, 'yes-default')">
          <span class="plan-option-label">Yes, manually approve edits</span>
          <span class="plan-option-desc">Approve plan but confirm each edit</span>
        </button>
        <button class="plan-option" data-value="no" onclick="window._selectPlanOption(this, 'no')">
          <span class="plan-option-label">No, keep planning</span>
          <span class="plan-option-desc">Provide feedback to refine the plan</span>
        </button>
      </div>
      <div class="plan-feedback-area" data-for="no">
        <textarea class="plan-feedback-input" placeholder="Tell Claude what to change..."></textarea>
      </div>
      <div class="plan-actions">
        <button class="btn-plan-submit" onclick="window._submitPlanResponse('${esc(requestId)}', this)">Submit</button>
      </div>`;
  }

  area.appendChild(el);

  el._selectedValue = null;
  el._planContent = planContent;
  el._isEmpty = isEmpty;

  return renderSystemMessage("Waiting for your response...");
}

function renderSystemMessage(text) {
  const row = document.createElement("div");
  row.className = "msg-row system";
  row.innerHTML = `<div class="msg-bubble">${esc(text)}</div>`;
  return row;
}

// ============================================================
// Loading Indicator — TUI star spinner style
// ============================================================

const LOADING_ID = "loading-indicator";

// TUI star spinner frames (same as Claude Code CLI)
const SPINNER_FRAMES = ["·", "✢", "✳", "✶", "✻", "✽"];
const SPINNER_CYCLE = [...SPINNER_FRAMES, ...SPINNER_FRAMES.slice().reverse()];

// 204 verbs from TUI src/constants/spinnerVerbs.ts
const SPINNER_VERBS = [
  "Accomplishing","Actioning","Actualizing","Architecting","Baking","Beaming",
  "Beboppin'","Befuddling","Billowing","Blanching","Bloviating","Boogieing",
  "Boondoggling","Booping","Bootstrapping","Brewing","Bunning","Burrowing",
  "Calculating","Canoodling","Caramelizing","Cascading","Catapulting","Cerebrating",
  "Channeling","Channelling","Choreographing","Churning","Clauding","Coalescing",
  "Cogitating","Combobulating","Composing","Computing","Concocting","Considering",
  "Contemplating","Cooking","Crafting","Creating","Crunching","Crystallizing",
  "Cultivating","Deciphering","Deliberating","Determining","Dilly-dallying",
  "Discombobulating","Doing","Doodling","Drizzling","Ebbing","Effecting",
  "Elucidating","Embellishing","Enchanting","Envisioning","Evaporating",
  "Fermenting","Fiddle-faddling","Finagling","Flambéing","Flibbertigibbeting",
  "Flowing","Flummoxing","Fluttering","Forging","Forming","Frolicking","Frosting",
  "Gallivanting","Galloping","Garnishing","Generating","Gesticulating",
  "Germinating","Gitifying","Grooving","Gusting","Harmonizing","Hashing",
  "Hatching","Herding","Honking","Hullaballooing","Hyperspacing","Ideating",
  "Imagining","Improvising","Incubating","Inferring","Infusing","Ionizing",
  "Jitterbugging","Julienning","Kneading","Leavening","Levitating","Lollygagging",
  "Manifesting","Marinating","Meandering","Metamorphosing","Misting","Moonwalking",
  "Moseying","Mulling","Mustering","Musing","Nebulizing","Nesting","Newspapering",
  "Noodling","Nucleating","Orbiting","Orchestrating","Osmosing","Perambulating",
  "Percolating","Perusing","Philosophising","Photosynthesizing","Pollinating",
  "Pondering","Pontificating","Pouncing","Precipitating","Prestidigitating",
  "Processing","Proofing","Propagating","Puttering","Puzzling","Quantumizing",
  "Razzle-dazzling","Razzmatazzing","Recombobulating","Reticulating","Roosting",
  "Ruminating","Sautéing","Scampering","Schlepping","Scurrying","Seasoning",
  "Shenaniganing","Shimmying","Simmering","Skedaddling","Sketching","Slithering",
  "Smooshing","Sock-hopping","Spelunking","Spinning","Sprouting","Stewing",
  "Sublimating","Swirling","Swooping","Symbioting","Synthesizing","Tempering",
  "Thinking","Thundering","Tinkering","Tomfoolering","Topsy-turvying",
  "Transfiguring","Transmuting","Twisting","Undulating","Unfurling","Unravelling",
  "Vibing","Waddling","Wandering","Warping","Whatchamacalliting","Whirlpooling",
  "Whirring","Whisking","Wibbling","Working","Wrangling","Zesting","Zigzagging",
];

// Animation state
let spinnerInterval = null;
let timerInterval = null;
let stalledCheckInterval = null;
let spinnerFrame = 0;
let loadingStartTime = 0;
let lastActivityTime = 0;
let isStalled = false;
let loadingActive = false;

export function isLoading() {
  return loadingActive;
}

function syncActionBtn(state) {
  if (typeof window.__updateActionBtn === "function") window.__updateActionBtn(state);
}

export function showLoading() {
  removeLoading();
  const stream = document.getElementById("event-stream");
  if (!stream) return;

  loadingActive = true;
  syncActionBtn(true);

  const verb = SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)];
  loadingStartTime = Date.now();
  lastActivityTime = Date.now();
  isStalled = false;

  const el = document.createElement("div");
  el.id = LOADING_ID;
  el.className = "msg-row loading-row";
  el.innerHTML = `<span class="tui-spinner">${SPINNER_CYCLE[0]}</span><span class="tui-verb glimmer-text">${esc(verb)}…</span><span class="tui-timer">0s</span>`;
  stream.appendChild(el);
  stream.scrollTop = stream.scrollHeight;

  const spinnerEl = el.querySelector(".tui-spinner");
  const timerEl = el.querySelector(".tui-timer");
  const loadingEl = el;

  // Spinner animation — 120ms interval, same as TUI
  spinnerFrame = 0;
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_CYCLE.length;
    if (spinnerEl) spinnerEl.textContent = SPINNER_CYCLE[spinnerFrame];
  }, 120);

  // Timer — update every second
  timerInterval = setInterval(() => {
    if (timerEl) {
      const elapsed = Math.floor((Date.now() - loadingStartTime) / 1000);
      timerEl.textContent = `${elapsed}s`;
    }
  }, 1000);

  // Stalled detection — check every 120ms (aligned with spinner)
  stalledCheckInterval = setInterval(() => {
    if (!isStalled && Date.now() - lastActivityTime > 3000) {
      isStalled = true;
      if (loadingEl) loadingEl.classList.add("stalled");
    }
  }, 120);
}

export function removeLoading() {
  if (spinnerInterval) { clearInterval(spinnerInterval); spinnerInterval = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (stalledCheckInterval) { clearInterval(stalledCheckInterval); stalledCheckInterval = null; }
  isStalled = false;
  loadingActive = false;
  syncActionBtn(false);
  const el = document.getElementById(LOADING_ID);
  if (el) el.remove();
}

/** Reset stalled timer — call when SSE events arrive */
export function refreshLoadingActivity() {
  lastActivityTime = Date.now();
  if (isStalled) {
    isStalled = false;
    const loadingEl = document.getElementById(LOADING_ID);
    if (loadingEl) loadingEl.classList.remove("stalled");
  }
}
