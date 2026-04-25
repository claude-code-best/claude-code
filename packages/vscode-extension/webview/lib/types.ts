// UI-side thread/entry types.
// Keep these flat and serialisable so the reducer remains predictable.

import type {
  AvailableCommand,
  ContentBlock,
  ElicitationRequestPayload,
  PermissionOption,
  PlanEntry,
  ToolCallContent,
} from "./acp/types";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export type ToolCallStatus =
  | "pending"
  | "running"
  | "complete"
  | "error"
  | "canceled"
  | "rejected"
  | "waiting_for_confirmation";

export interface ToolCallPermissionRequest {
  requestId: string;
  options: PermissionOption[];
}

export interface ToolCallData {
  id: string;
  title: string;
  status: ToolCallStatus;
  content?: ToolCallContent[];
  rawInput?: Record<string, unknown>;
  rawOutput?: unknown;
  permissionRequest?: ToolCallPermissionRequest;
  isStandalonePermission?: boolean;
}

export interface UserMessageImage {
  mimeType: string;
  data: string;
}

export interface UserMessageEntry {
  type: "user_message";
  id: string;
  content: string;
  images?: UserMessageImage[];
}

export type AssistantChunk =
  | { type: "message"; text: string }
  | { type: "thought"; text: string };

export interface AssistantMessageEntry {
  type: "assistant_message";
  id: string;
  chunks: AssistantChunk[];
}

export interface ToolCallEntry {
  type: "tool_call";
  toolCall: ToolCallData;
}

export interface PlanDisplayEntry {
  type: "plan";
  id: string;
  entries: PlanEntry[];
}

export interface SystemNoticeEntry {
  type: "system";
  id: string;
  level: "info" | "warning" | "error";
  text: string;
}

export type ThreadEntry =
  | UserMessageEntry
  | AssistantMessageEntry
  | ToolCallEntry
  | PlanDisplayEntry
  | SystemNoticeEntry;

export interface PendingPermission {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description?: string;
  options: PermissionOption[];
}

export type PendingElicitation = ElicitationRequestPayload;

// Convenience: map agent permission mode IDs to display labels.
export const PERMISSION_MODE_LABELS: Record<string, { label: string; description: string }> = {
  default: { label: "默认", description: "Manually approve every tool" },
  acceptEdits: { label: "Auto-accept edits", description: "Skip prompts for file edits" },
  bypassPermissions: { label: "Bypass", description: "Run all tools unattended" },
  plan: { label: "Plan", description: "Plan mode — read-only" },
  dontAsk: { label: "Don't ask", description: "Reject everything silently" },
  auto: { label: "Auto judge", description: "Agent decides whether to ask" },
};

export const FALLBACK_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "bypassPermissions",
] as const;

// Re-export shared types used by the chat UI so callers don't have to know the path.
export type { AvailableCommand, ContentBlock, ElicitationRequestPayload, PermissionOption, ToolCallContent };
