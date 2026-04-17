/**
 * Remote Control — Automation helpers
 *
 * Centralizes detection of non-human inputs so the web UI can hide
 * internal prompts while still surfacing session state.
 */

export const PROACTIVE_ENABLED_TEXT =
  "Proactive mode enabled — model will work autonomously between ticks";
export const PROACTIVE_DISABLED_TEXT = "Proactive mode disabled";

const CLOSED_SESSION_STATUSES = new Set(["archived", "inactive"]);

const HIDDEN_AUTOMATION_TAGS = new Set([
  "bash-input",
  "bash-stderr",
  "bash-stdout",
  "channel",
  "channel-message",
  "command-args",
  "command-message",
  "command-name",
  "cross-session-message",
  "fork-boilerplate",
  "local-command-caveat",
  "local-command-stderr",
  "local-command-stdout",
  "output-file",
  "reason",
  "remote-review",
  "remote-review-progress",
  "status",
  "summary",
  "system-reminder",
  "task-id",
  "task-notification",
  "task-type",
  "teammate-message",
  "tick",
  "tool-use-id",
  "ultraplan",
  "worktree",
  "worktreeBranch",
  "worktreePath",
]);

const PRIMARY_AUTOMATION_TAGS = new Set([
  "bash-input",
  "bash-stderr",
  "bash-stdout",
  "channel-message",
  "command-args",
  "command-message",
  "command-name",
  "cross-session-message",
  "fork-boilerplate",
  "local-command-caveat",
  "local-command-stderr",
  "local-command-stdout",
  "remote-review",
  "remote-review-progress",
  "system-reminder",
  "task-notification",
  "teammate-message",
  "tick",
  "ultraplan",
]);

const WORKING_AUTOMATION_TAGS = new Set(
  [...PRIMARY_AUTOMATION_TAGS].filter(
    (tag) => tag !== "local-command-caveat" && tag !== "system-reminder",
  ),
);

const XML_ONLY_BLOCK_PATTERN =
  /^(?:\s*<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\s*)+$/;
const XML_BLOCK_PATTERN =
  /\s*<([a-z][\w-]*)(?:\s[^>]*)?>[\s\S]*?<\/\1>\s*/gy;

function normalizeAutomationStatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      enabled: false,
      phase: null,
      next_tick_at: null,
      sleep_until: null,
    };
  }

  return {
    enabled: payload.enabled === true,
    phase: payload.phase === "standby" || payload.phase === "sleeping" ? payload.phase : null,
    next_tick_at: typeof payload.next_tick_at === "number" ? payload.next_tick_at : null,
    sleep_until: typeof payload.sleep_until === "number" ? payload.sleep_until : null,
  };
}

export function extractEventText(payload) {
  if (!payload) return "";

  if (typeof payload.content === "string" && payload.content) return payload.content;

  const msg = payload.message;
  if (msg && typeof msg === "object") {
    const mc = msg.content;
    if (typeof mc === "string") return mc;
    if (Array.isArray(mc)) {
      return mc
        .filter((block) => block && typeof block === "object" && block.type === "text")
        .map((block) => block.text || "")
        .join("");
    }
  }

  return typeof payload === "string" ? payload : JSON.stringify(payload);
}

function getOpeningTagNames(text) {
  const trimmed = String(text).trim();
  if (!trimmed) return [];

  XML_BLOCK_PATTERN.lastIndex = 0;
  const tags = [];
  while (XML_BLOCK_PATTERN.lastIndex < trimmed.length) {
    const match = XML_BLOCK_PATTERN.exec(trimmed);
    if (!match) return [];
    tags.push(match[1]);
  }
  return tags;
}

export function isAutomationEnvelopeText(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  if (!trimmed) return false;
  if (!XML_ONLY_BLOCK_PATTERN.test(trimmed)) return false;

  const tagNames = getOpeningTagNames(trimmed);
  return (
    tagNames.length > 0 &&
    tagNames.every((tagName) => HIDDEN_AUTOMATION_TAGS.has(tagName)) &&
    tagNames.some((tagName) => PRIMARY_AUTOMATION_TAGS.has(tagName))
  );
}

export function isHiddenAutomationUserPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.isSynthetic === true) return true;
  return isAutomationEnvelopeText(extractEventText(payload));
}

export function shouldHideAutomationUserEvent(payload, direction = "inbound") {
  return direction === "inbound" && isHiddenAutomationUserPayload(payload);
}

export function shouldStartAutomationWorkFromUserEvent(payload, direction = "inbound") {
  if (!shouldHideAutomationUserEvent(payload, direction)) {
    return false;
  }

  const text = extractEventText(payload).trim();
  if (!text || !XML_ONLY_BLOCK_PATTERN.test(text)) {
    return payload?.isSynthetic === true;
  }

  const tagNames = getOpeningTagNames(text);
  return tagNames.some((tagName) => WORKING_AUTOMATION_TAGS.has(tagName));
}

export function createAutomationState() {
  return {
    proactive: false,
    autoRun: false,
    hasAuthority: false,
    enabled: false,
    phase: null,
    nextTickAt: null,
    sleepUntil: null,
  };
}

function applyAuthoritativeAutomationState(state, payload) {
  const normalized = normalizeAutomationStatePayload(payload);
  state.hasAuthority = true;
  state.enabled = normalized.enabled;
  state.phase = normalized.phase;
  state.nextTickAt = normalized.next_tick_at;
  state.sleepUntil = normalized.sleep_until;
  state.proactive = normalized.enabled;
  state.autoRun = false;
  return state;
}

export function reduceAutomationState(state, event) {
  const next = state ? { ...state } : createAutomationState();
  if (!event || typeof event !== "object") return next;

  const type = event.type || "unknown";
  const payload = event.payload || {};
  const direction = event.direction || "inbound";

  if (type === "automation_state") {
    return applyAuthoritativeAutomationState(next, payload);
  }

  if (type === "session_status") {
    if (CLOSED_SESSION_STATUSES.has(payload.status)) {
      if (next.hasAuthority) {
        return applyAuthoritativeAutomationState(next, null);
      }
      next.proactive = false;
      next.autoRun = false;
    }
    return next;
  }

  if (next.hasAuthority) {
    return next;
  }

  if (type === "assistant") {
    const text = extractEventText(payload).trim();
    if (text === PROACTIVE_ENABLED_TEXT) {
      next.proactive = true;
      next.autoRun = false;
      return next;
    }
    if (text === PROACTIVE_DISABLED_TEXT) {
      next.proactive = false;
      next.autoRun = false;
      return next;
    }
    next.autoRun = false;
    return next;
  }

  if (type === "result" || type === "result_success" || type === "error" || type === "interrupt") {
    next.autoRun = false;
    return next;
  }

  if (type === "user" && shouldHideAutomationUserEvent(payload, direction)) {
    next.autoRun = true;
  }

  return next;
}

export function shouldPulseAutomationIndicator(event) {
  if (!event || typeof event !== "object") return false;

  if (event.type === "automation_state") {
    return event.payload?.enabled === true;
  }

  if (event.type === "assistant") {
    const text = extractEventText(event.payload || {}).trim();
    return text === PROACTIVE_ENABLED_TEXT;
  }

  return event.type === "user" && shouldHideAutomationUserEvent(event.payload || {}, event.direction || "inbound");
}

export function getAutomationIndicator(state) {
  if (state?.hasAuthority) {
    if (!state.enabled) {
      return {
        visible: false,
        label: "",
        tone: "",
        title: "",
        iconVariant: "active",
      };
    }

    if (state.phase === "sleeping") {
      return {
        visible: true,
        label: "Autopilot",
        tone: "sleeping",
        title: "Claude Code is in proactive mode and currently sleeping until the next wake-up or user message.",
        iconVariant: "sleeping",
      };
    }

    if (state.phase === "standby") {
      return {
        visible: true,
        label: "Autopilot",
        tone: "proactive",
        title: "Claude Code is in proactive mode and waiting for the next scheduled check-in.",
        iconVariant: "standby",
      };
    }

    return {
      visible: true,
      label: "Autopilot",
      tone: "proactive",
      title: "Claude Code is in proactive mode and may continue working between user messages.",
      iconVariant: "active",
    };
  }

  if (state?.proactive) {
    return {
      visible: true,
      label: "Autopilot",
      tone: "proactive",
      title: "Claude Code is in proactive mode and may continue working between user messages.",
      iconVariant: "active",
    };
  }

  if (state?.autoRun) {
    return {
      visible: true,
      label: "Auto Run",
      tone: "auto-run",
      title: "Claude Code is processing an automatic background trigger.",
      iconVariant: "active",
    };
  }

  return {
    visible: false,
    label: "",
    tone: "",
    title: "",
    iconVariant: "active",
  };
}

export function getAutomationActivity(state) {
  if (!state?.hasAuthority || !state.enabled) {
    return null;
  }

  if (state.phase === "standby") {
    return {
      mode: "standby",
      label: "standby",
      endsAt: state.nextTickAt,
      iconVariant: "standby",
    };
  }

  if (state.phase === "sleeping") {
    return {
      mode: "sleeping",
      label: "sleeping",
      endsAt: state.sleepUntil,
      iconVariant: "sleeping",
    };
  }

  return null;
}

export function renderAutomationIcon(variant = "active", { className = "", decorative = true } = {}) {
  const classes = ["clawd-icon", `clawd-icon-${variant}`, className].filter(Boolean).join(" ");
  const ariaAttrs = decorative ? 'aria-hidden="true"' : 'role="img" aria-label="Claude Code status"';

  return `
    <span class="${classes}" ${ariaAttrs}>
      <svg viewBox="0 0 40 30" fill="none">
        <path class="clawd-arm clawd-arm-left" d="M8.5 13.4C6.6 12.8 5.4 11.4 4.8 9.4C4.6 8.6 4.9 7.7 5.6 7.3C6.3 6.9 7.2 7 7.8 7.6L10.8 10.6L8.5 13.4Z" />
        <path class="clawd-arm clawd-arm-right" d="M31.5 13.4C33.4 12.8 34.6 11.4 35.2 9.4C35.4 8.6 35.1 7.7 34.4 7.3C33.7 6.9 32.8 7 32.2 7.6L29.2 10.6L31.5 13.4Z" />
        <path class="clawd-shell" d="M10 12.2C10 7.9 13.5 4.4 17.8 4.4H22.2C26.5 4.4 30 7.9 30 12.2V17.3C30 21 27 24 23.3 24H16.7C13 24 10 21 10 17.3V12.2Z" />
        <circle class="clawd-eye clawd-eye-left" cx="17.2" cy="13.4" r="1.55" />
        <circle class="clawd-eye clawd-eye-right" cx="22.8" cy="13.4" r="1.55" />
        <path class="clawd-eye-line clawd-eye-line-left" d="M15.9 13.6C16.3 12.8 17 12.4 17.9 12.4" />
        <path class="clawd-eye-line clawd-eye-line-right" d="M22.1 12.4C23 12.4 23.7 12.8 24.1 13.6" />
        <path class="clawd-foot clawd-foot-left" d="M14.3 25.1C14.3 24 15.2 23.1 16.3 23.1C17.4 23.1 18.3 24 18.3 25.1V25.8H14.3V25.1Z" />
        <path class="clawd-foot clawd-foot-right" d="M21.7 25.1C21.7 24 22.6 23.1 23.7 23.1C24.8 23.1 25.7 24 25.7 25.1V25.8H21.7V25.1Z" />
      </svg>
      <span class="clawd-z clawd-z-1">Z</span>
      <span class="clawd-z clawd-z-2">Z</span>
    </span>
  `;
}
