import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function esc(str: string | null | undefined): string {
  if (!str) return "";
  const value = String(str);
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

export function formatTime(ts: number | null | undefined): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

export function statusClass(status: string | null | undefined): string {
  const map: Record<string, string> = {
    active: "active",
    running: "running",
    idle: "idle",
    inactive: "inactive",
    requires_action: "requires_action",
    archived: "archived",
    error: "error",
  };
  return map[status || ""] || "default";
}

export function isClosedSessionStatus(status: string | null | undefined): boolean {
  return status === "archived" || status === "inactive";
}

export function truncate(str: string | null | undefined, max: number): string {
  if (!str) return "";
  const s = String(str);
  return s.length > max ? s.slice(0, max) + "..." : s;
}

export function generateMessageUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function extractEventText(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.content === "string") return payload.content;
  const msg = payload.message as Record<string, unknown> | undefined;
  if (msg && typeof msg === "object" && Array.isArray(msg.content)) {
    const texts = msg.content
      .filter((b: Record<string, unknown>) => b && b.type === "text" && typeof b.text === "string")
      .map((b: Record<string, unknown>) => b.text as string);
    if (texts.length > 0) return texts.join("\n");
  }
  return "";
}

export function isConversationClearedStatus(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  if (!payload || typeof payload !== "object") return false;
  if (payload.status === "conversation_cleared") return true;
  const raw = payload.raw as Record<string, unknown> | undefined;
  return !!raw && typeof raw === "object" && raw.status === "conversation_cleared";
}
