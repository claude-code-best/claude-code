/**
 * Remote Control — Event Rendering
 *
 * Renders session events into DOM elements for the event stream.
 */

import { esc } from "./utils.js";
import {
  extractEventText,
  renderAutomationIcon,
  shouldHideAutomationUserEvent,
  shouldStartAutomationWorkFromUserEvent,
} from "./automation.js";
import { applyTaskStateEvent, processAssistantEvent } from "./task-panel.js";

// ============================================================
// Replay state — tracks unresolved permission requests during history replay
// ============================================================

const replayPendingRequests = new Map();   // request_id → event data (unresolved)
const replayRespondedRequests = new Set(); // request_ids that have a response
const renderedUserUuids = new Set();
const traceHostElements = new Map(); // host_id → DOM refs for inline tool traces

export function createToolTraceState() {
  return {
    nextHostId: 1,
    activeHostId: null,
    hosts: [],
  };
}

function cloneToolTraceState(state) {
  return {
    nextHostId: state.nextHostId,
    activeHostId: state.activeHostId,
    hosts: state.hosts.map((host) => ({
      ...host,
      entryKinds: [...host.entryKinds],
    })),
  };
}

function createToolTraceHost(nextState, kind, assistantContent = "") {
  const host = {
    id: `trace-${nextState.nextHostId}`,
    kind,
    assistantContent,
    entryKinds: [],
  };
  nextState.nextHostId += 1;
  nextState.activeHostId = host.id;
  nextState.hosts.push(host);
  return host;
}

export function addAssistantToolTraceHost(state, content) {
  const nextState = cloneToolTraceState(state);
  const host = createToolTraceHost(nextState, "assistant", content);
  return { state: nextState, host };
}

export function clearActiveToolTraceHost(state) {
  if (!state.activeHostId) return state;
  const nextState = cloneToolTraceState(state);
  nextState.activeHostId = null;
  return nextState;
}

export function addToolTraceEntry(state, entryKind) {
  const nextState = cloneToolTraceState(state);
  let host = nextState.hosts.find((item) => item.id === nextState.activeHostId);
  let createdHost = null;

  if (!host) {
    createdHost = createToolTraceHost(nextState, "orphan");
    host = createdHost;
  }

  host.entryKinds.push(entryKind);
  return { state: nextState, host, createdHost };
}

let toolTraceState = createToolTraceState();

function resetToolTraceRuntime() {
  toolTraceState = createToolTraceState();
  traceHostElements.clear();
}

/** Clear replay tracking state (call before each history load) */
export function resetReplayState() {
  replayPendingRequests.clear();
  replayRespondedRequests.clear();
  renderedUserUuids.clear();
  resetToolTraceRuntime();
}

export function isConversationClearedStatus(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.status === "conversation_cleared") return true;
  const raw = payload.raw;
  return !!raw && typeof raw === "object" && raw.status === "conversation_cleared";
}

function clearTranscriptView() {
  const stream = document.getElementById("event-stream");
  if (!stream) return;

  let preservedClearCommand = null;
  for (let i = stream.children.length - 1; i >= 0; i -= 1) {
    const row = stream.children[i];
    if (!row || typeof row.textContent !== "string") continue;
    if (row.textContent.trim() === "/clear") {
      preservedClearCommand = row.cloneNode(true);
      break;
    }
  }

  stream.innerHTML = "";
  if (preservedClearCommand) {
    stream.appendChild(preservedClearCommand);
  }

  const permissionArea = document.getElementById("permission-area");
  if (permissionArea) {
    permissionArea.innerHTML = "";
    permissionArea.classList.add("hidden");
  }

  removeLoading();
  resetReplayState();
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
export const extractText = extractEventText;

function formatInlineContent(content) {
  let html = esc(content);
  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-tool-card);padding:2px 5px;border-radius:3px;font-family:var(--font-mono);font-size:0.85em;">$1</code>');
  // Bold: **...**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html;
}

function formatAssistantContent(content) {
  let html = esc(content);
  // Code blocks: ```...```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre style="background:var(--bg-tool-card);padding:10px;border-radius:6px;overflow-x:auto;margin:6px 0;font-family:var(--font-mono);font-size:0.82rem;">${code.trim()}</pre>`;
  });
  html = formatInlineContent(html);
  return html;
}

function renderPlanCodeBlock(code) {
  return `<pre><code>${esc(code.trim())}</code></pre>`;
}

function formatPlanTextBlock(content) {
  const blocks = [];
  const lines = content.split(/\r?\n/);
  let paragraph = [];
  let listType = null;
  let listItems = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(`<p>${paragraph.map(line => formatInlineContent(line)).join("<br>")}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listType || listItems.length === 0) return;
    blocks.push(`<${listType}>${listItems.map(item => `<li>${item}</li>`).join("")}</${listType}>`);
    listType = null;
    listItems = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      blocks.push(`<h${level}>${formatInlineContent(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(formatInlineContent(unorderedMatch[1]));
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(formatInlineContent(orderedMatch[1]));
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks.join("");
}

export function formatPlanContent(content) {
  const parts = [];
  const codeBlockPattern = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockPattern.exec(content)) !== null) {
    const precedingText = content.slice(lastIndex, match.index);
    if (precedingText.trim()) {
      parts.push(formatPlanTextBlock(precedingText));
    }
    parts.push(renderPlanCodeBlock(match[2]));
    lastIndex = codeBlockPattern.lastIndex;
  }

  const trailingText = content.slice(lastIndex);
  if (trailingText.trim()) {
    parts.push(formatPlanTextBlock(trailingText));
  }

  return parts.join("");
}

function getUserUuid(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.uuid === "string" && payload.uuid) return payload.uuid;
  if (payload.raw && typeof payload.raw === "object" && typeof payload.raw.uuid === "string" && payload.raw.uuid) {
    return payload.raw.uuid;
  }
  return null;
}

function shouldProcessUserEvent(payload, direction) {
  const uuid = getUserUuid(payload);
  if (uuid) {
    if (renderedUserUuids.has(uuid)) return false;
    renderedUserUuids.add(uuid);
    return true;
  }

  // Legacy fallback with no uuid: inbound human messages are usually echoes
  // of a web-sent prompt, but hidden automation inputs still need to drive
  // loading state and the session status marker.
  return direction === "outbound" || shouldHideAutomationUserEvent(payload, direction);
}

function getMessageContentBlocks(payload) {
  if (!payload || typeof payload !== "object") return [];
  const msg = payload.message;
  if (!msg || typeof msg !== "object" || !Array.isArray(msg.content)) return [];
  return msg.content.filter((block) => block && typeof block === "object");
}

function getEmbeddedToolBlocks(payload, blockType) {
  return getMessageContentBlocks(payload).filter((block) => block.type === blockType);
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
          const toolResultBlocks = getEmbeddedToolBlocks(payload, "tool_result");
          if (toolResultBlocks.length > 0) {
            for (const block of toolResultBlocks) {
              appendToolEntryToActiveTrace(
                "result",
                {
                  content: block.content || "",
                  output: block.content || "",
                  is_error: !!block.is_error,
                },
                histEls,
              );
            }
            break;
          }
          if (shouldProcessUserEvent(payload, direction)) {
            if (shouldHideAutomationUserEvent(payload, direction)) {
              break;
            }
            toolTraceState = clearActiveToolTraceHost(toolTraceState);
            histEls.push(renderUserMessage(payload, direction));
          }
        }
        break;
      case "assistant":
        {
          const text = extractText(payload);
          const toolUseBlocks = getEmbeddedToolBlocks(payload, "tool_use");
          if (text && text.trim()) histEls.push(renderAssistantMessage(payload));
          for (const block of toolUseBlocks) {
            appendToolEntryToActiveTrace(
              "use",
              {
                tool_name: block.name || "tool",
                tool_input: block.input || {},
              },
              histEls,
            );
          }
          processAssistantEvent(payload);
        }
        break;
      case "task_state":
        applyTaskStateEvent(payload);
        return;
      case "automation_state":
        return;
      case "status":
        if (isConversationClearedStatus(payload)) {
          clearTranscriptView();
        }
        return;
      case "tool_use":
        appendToolEntryToActiveTrace("use", payload, histEls);
        break;
      case "tool_result":
        appendToolEntryToActiveTrace("result", payload, histEls);
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
        const toolResultBlocks = getEmbeddedToolBlocks(payload, "tool_result");
        if (toolResultBlocks.length > 0) {
          for (const block of toolResultBlocks) {
            appendToolEntryToActiveTrace(
              "result",
              {
                content: block.content || "",
                output: block.content || "",
                is_error: !!block.is_error,
              },
              els,
            );
          }
          break;
        }
        if (!shouldProcessUserEvent(payload, direction)) return;
        if (!shouldHideAutomationUserEvent(payload, direction)) {
          toolTraceState = clearActiveToolTraceHost(toolTraceState);
          els.push(renderUserMessage(payload, direction));
          needLoading = true;
        } else {
          needLoading = shouldStartAutomationWorkFromUserEvent(payload, direction);
        }
      }
      break;
    case "partial_assistant":
      // Skip partial assistant — wait for the final "assistant" event
      // to avoid blank/duplicate messages during streaming
      return;
    case "assistant":
      {
        const text = extractText(payload);
        const toolUseBlocks = getEmbeddedToolBlocks(payload, "tool_use");
        if (text && text.trim()) {
          removeLoading();
          els.push(renderAssistantMessage(payload));
        }
        for (const block of toolUseBlocks) {
          appendToolEntryToActiveTrace(
            "use",
            {
              tool_name: block.name || "tool",
              tool_input: block.input || {},
            },
            els,
          );
        }
        processAssistantEvent(payload);
      }
      break;
    case "task_state":
      applyTaskStateEvent(payload);
      return;
    case "automation_state":
      return;
    case "result":
    case "result_success":
      removeLoading();
      // Skip result — it just repeats the assistant message content
      return;
    case "tool_use":
      appendToolEntryToActiveTrace("use", payload, els);
      break;
    case "tool_result":
      appendToolEntryToActiveTrace("result", payload, els);
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
      if (isConversationClearedStatus(payload)) {
        clearTranscriptView();
        return;
      }
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

function renderTraceToggleGlyph() {
  return `
    <span class="assistant-trace-glyph" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </span>`;
}

function bindTraceToggle(toggleEl, panelEl, traceEl) {
  if (!toggleEl || !panelEl || !traceEl) return;
  toggleEl.addEventListener("click", () => {
    const expanded = toggleEl.getAttribute("aria-expanded") === "true";
    toggleEl.setAttribute("aria-expanded", expanded ? "false" : "true");
    toggleEl.classList.toggle("is-open", !expanded);
    traceEl.classList.toggle("is-expanded", !expanded);
    panelEl.classList.toggle("hidden", expanded);
  });
}

function updateTraceHostDisplay(refs) {
  if (!refs) return;
  refs.traceEl.classList.toggle("hidden", refs.entryCount === 0);
  refs.countEl.textContent = String(refs.entryCount);
  refs.toggleEl.classList.toggle("has-error", refs.hasError);
  refs.row.classList.toggle("has-tool-error", refs.hasError);
  refs.toggleEl.title = refs.hasError ? "Tool trace (contains errors)" : "Tool trace";
}

function createTraceHostRow(host, content = "") {
  const row = document.createElement("div");
  row.className = host.kind === "assistant" ? "msg-row assistant" : "msg-row tool-trace-row";
  row.dataset.traceHostId = host.id;
  row.innerHTML = `
    <div class="assistant-turn${host.kind === "orphan" ? " assistant-turn-orphan" : ""}">
      ${content ? `<div class="msg-bubble">${formatAssistantContent(content)}</div>` : ""}
      <div class="assistant-trace hidden">
        <button type="button" class="assistant-trace-toggle" aria-expanded="false">
          ${renderTraceToggleGlyph()}
          <span class="assistant-trace-count">0</span>
          <span class="assistant-trace-chevron" aria-hidden="true">›</span>
        </button>
        <div class="assistant-trace-panel hidden"></div>
      </div>
    </div>`;

  const traceEl = row.querySelector(".assistant-trace");
  const panelEl = row.querySelector(".assistant-trace-panel");
  const toggleEl = row.querySelector(".assistant-trace-toggle");
  const countEl = row.querySelector(".assistant-trace-count");

  bindTraceToggle(toggleEl, panelEl, traceEl);

  const refs = {
    hostId: host.id,
    row,
    traceEl,
    panelEl,
    toggleEl,
    countEl,
    entryCount: host.entryKinds.length,
    hasError: false,
  };

  traceHostElements.set(host.id, refs);
  updateTraceHostDisplay(refs);
  return row;
}

function ensureTraceHostRow(host, rows = null, content = "") {
  const existing = traceHostElements.get(host.id);
  if (existing) return existing.row;
  const row = createTraceHostRow(host, content || host.assistantContent || "");
  if (Array.isArray(rows)) {
    rows.push(row);
  }
  return row;
}

function renderAssistantMessage(payload) {
  const content = extractText(payload).trim();
  const result = addAssistantToolTraceHost(toolTraceState, content);
  toolTraceState = result.state;
  return ensureTraceHostRow(result.host, null, content);
}

function renderResult(payload) {
  const text = payload.result || payload.subtype || "Session completed";
  const row = document.createElement("div");
  row.className = "msg-row system result";
  row.innerHTML = `<div class="msg-bubble">✓ ${esc(text)}</div>`;
  return row;
}

function renderToolCard({ titleHtml, body, isError = false }) {
  const card = document.createElement("div");
  card.className = `tool-card assistant-trace-card${isError ? " assistant-trace-card-error" : ""}`;
  card.innerHTML = `
    <div class="tool-card-header">
      <span class="tool-icon">&#9654;</span>
      ${titleHtml}
    </div>
    <div class="tool-card-body collapsed">${esc(body)}</div>`;

  const header = card.querySelector(".tool-card-header");
  const bodyEl = card.querySelector(".tool-card-body");
  header?.addEventListener("click", () => {
    bodyEl?.classList.toggle("collapsed");
    header.classList.toggle("is-open", !bodyEl?.classList.contains("collapsed"));
  });

  return card;
}

function renderToolUse(payload) {
  const name = payload.tool_name || payload.name || "tool";
  const input = payload.tool_input || payload.input || {};
  const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  return renderToolCard({
    titleHtml: `Tool: <strong>${esc(name)}</strong>`,
    body: inputStr || "",
  });
}

function renderToolResult(payload) {
  const content = payload.content || payload.output || "";
  const contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  return renderToolCard({
    titleHtml: payload.is_error ? "<strong>Tool Error</strong>" : "Tool Result",
    body: contentStr || "",
    isError: !!payload.is_error,
  });
}

function appendToolEntryToActiveTrace(entryKind, payload, rows) {
  const result = addToolTraceEntry(toolTraceState, entryKind);
  toolTraceState = result.state;

  if (result.createdHost) {
    ensureTraceHostRow(result.createdHost, rows);
  }

  const refs = traceHostElements.get(result.host.id);
  if (!refs) return;

  const card = entryKind === "use" ? renderToolUse(payload) : renderToolResult(payload);
  refs.panelEl.appendChild(card);
  refs.entryCount += 1;
  if (entryKind === "result" && payload.is_error) {
    refs.hasError = true;
  }
  updateTraceHostDisplay(refs);
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

  const status = renderSystemMessage("Waiting for your response...");
  status.dataset.pendingRequestId = requestId;
  return status;
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
      <div class="plan-content">${formatPlanContent(planContent)}</div>
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

  const status = renderSystemMessage("Waiting for your response...");
  status.dataset.pendingRequestId = requestId;
  return status;
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

const ACTIVITY_ID = "session-activity-indicator";

// TUI star spinner frames (same as Claude Code CLI)
const SPINNER_FRAMES = ["·", "✢", "✱", "✶", "✻", "✽"];
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
let activityCountdownInterval = null;
let spinnerFrame = 0;
let loadingStartTime = 0;
let lastActivityTime = 0;
let isStalled = false;
let workingActive = false;
let automationActivity = null;

export function resolveActivityMode(working, activity) {
  if (activity?.mode === "standby" || activity?.mode === "sleeping") {
    return activity.mode;
  }
  return working ? "working" : "idle";
}

export function shouldRenderTranscriptActivity(mode) {
  return mode === "working";
}

export function formatCountdownRemaining(endsAt, now = Date.now()) {
  if (typeof endsAt !== "number") return "";

  const remainingSeconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

function getActivityModeInternal() {
  return resolveActivityMode(workingActive, automationActivity);
}

export function isLoading() {
  return getActivityModeInternal() === "working";
}

export function getActivityMode() {
  return getActivityModeInternal();
}

function syncActionBtn(mode) {
  if (typeof window.__updateActionBtn === "function") window.__updateActionBtn(mode);
}

function clearWorkingTimers() {
  if (spinnerInterval) { clearInterval(spinnerInterval); spinnerInterval = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (stalledCheckInterval) { clearInterval(stalledCheckInterval); stalledCheckInterval = null; }
  isStalled = false;
}

function clearActivityCountdownTimer() {
  if (activityCountdownInterval) {
    clearInterval(activityCountdownInterval);
    activityCountdownInterval = null;
  }
}

function removeActivityElement() {
  const el = document.getElementById(ACTIVITY_ID);
  if (el) el.remove();
}

function renderWorkingIndicator(stream) {
  const verb = SPINNER_VERBS[Math.floor(Math.random() * SPINNER_VERBS.length)];
  loadingStartTime = Date.now();
  lastActivityTime = Date.now();
  isStalled = false;

  const el = document.createElement("div");
  el.id = ACTIVITY_ID;
  el.className = "msg-row loading-row";
  el.innerHTML = `<span class="tui-spinner">${SPINNER_CYCLE[0]}</span><span class="tui-verb glimmer-text">${esc(verb)}…</span><span class="tui-timer">0s</span>`;
  stream.appendChild(el);
  stream.scrollTop = stream.scrollHeight;

  const spinnerEl = el.querySelector(".tui-spinner");
  const timerEl = el.querySelector(".tui-timer");
  const loadingEl = el;

  spinnerFrame = 0;
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_CYCLE.length;
    if (spinnerEl) spinnerEl.textContent = SPINNER_CYCLE[spinnerFrame];
  }, 120);

  timerInterval = setInterval(() => {
    if (timerEl) {
      const elapsed = Math.floor((Date.now() - loadingStartTime) / 1000);
      timerEl.textContent = `${elapsed}s`;
    }
  }, 1000);

  stalledCheckInterval = setInterval(() => {
    if (!isStalled && Date.now() - lastActivityTime > 3000) {
      isStalled = true;
      if (loadingEl) loadingEl.classList.add("stalled");
    }
  }, 120);
}

function renderAutomationIndicator(stream, activity) {
  const el = document.createElement("div");
  el.id = ACTIVITY_ID;
  el.className = `msg-row automation-activity-row automation-activity-${activity.mode}`;
  el.innerHTML = `
    <div class="automation-activity-card">
      ${renderAutomationIcon(activity.iconVariant, { className: "automation-activity-icon" })}
      <div class="automation-activity-copy">
        <span class="automation-activity-label">${esc(activity.label)}</span>
      </div>
      <span class="automation-activity-countdown"></span>
    </div>`;
  stream.appendChild(el);
  stream.scrollTop = stream.scrollHeight;

  const countdownEl = el.querySelector(".automation-activity-countdown");
  const updateCountdown = () => {
    if (countdownEl) {
      countdownEl.textContent = formatCountdownRemaining(activity.endsAt);
    }
  };

  updateCountdown();
  activityCountdownInterval = setInterval(updateCountdown, 1000);
}

function renderActivityIndicator() {
  clearWorkingTimers();
  clearActivityCountdownTimer();
  removeActivityElement();

  const mode = getActivityModeInternal();
  syncActionBtn(mode);

  const stream = document.getElementById("event-stream");
  if (!stream) return;

  if (shouldRenderTranscriptActivity(mode)) {
    renderWorkingIndicator(stream);
  }
}

export function setAutomationActivity(activity) {
  automationActivity = activity ? { ...activity } : null;
  renderActivityIndicator();
}

export function showLoading() {
  automationActivity = null;
  workingActive = true;
  renderActivityIndicator();
}

export function removeLoading() {
  workingActive = false;
  renderActivityIndicator();
}

/** Reset stalled timer — call when SSE events arrive */
export function refreshLoadingActivity() {
  lastActivityTime = Date.now();
  if (isStalled) {
    isStalled = false;
    const loadingEl = document.getElementById(ACTIVITY_ID);
    if (loadingEl) loadingEl.classList.remove("stalled");
  }
}
