/**
 * Remote Control — Shared Utilities
 */

export function esc(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
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
    requires_action: "requires_action",
    archived: "archived",
    error: "error",
  };
  return map[status] || "default";
}
