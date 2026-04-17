/**
 * Remote Control — Shared Utilities
 */

const HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function esc(str) {
  if (!str) return "";
  const value = String(str);
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

export function formatTime(ts) {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

export function statusClass(status) {
  const map = {
    active: "active",
    running: "running",
    idle: "idle",
    inactive: "inactive",
    requires_action: "requires_action",
    archived: "archived",
    error: "error",
  };
  return map[status] || "default";
}

export function isClosedSessionStatus(status) {
  return status === "archived" || status === "inactive";
}
