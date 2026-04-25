// Reducer that converts an ACP `SessionUpdate` into the flat `ThreadEntry[]`
// list rendered by the chat view. Mirrors the Zed/RCS approach: append-only
// stream, with tool calls UPSERTed by `toolCallId`.

import type { SessionUpdate } from "./acp/types";
import type {
  AssistantMessageEntry,
  PlanDisplayEntry,
  ThreadEntry,
  ToolCallData,
  ToolCallEntry,
  ToolCallStatus,
  UserMessageEntry,
} from "./types";

let entryIdCounter = 0;

function nextEntryId(prefix: string): string {
  entryIdCounter += 1;
  return `${prefix}-${Date.now()}-${entryIdCounter}`;
}

export function findToolCallIndex(entries: ThreadEntry[], toolCallId: string): number {
  // Search from the end — recent tool calls are far more likely targets.
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (e.type === "tool_call" && e.toolCall.id === toolCallId) return i;
  }
  return -1;
}

export function mapToolStatus(status: string | undefined): ToolCallStatus {
  switch (status) {
    case "pending":
      return "pending";
    case "in_progress":
      return "running";
    case "completed":
      return "complete";
    case "failed":
      return "error";
    case "canceled":
    case "cancelled":
      return "canceled";
    case "rejected":
      return "rejected";
    case "waiting_for_confirmation":
      return "waiting_for_confirmation";
    default:
      return "running";
  }
}

export function applySessionUpdate(prev: ThreadEntry[], update: SessionUpdate): ThreadEntry[] {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return appendAssistantChunk(prev, "message", textOf(update.content));

    case "agent_thought_chunk":
      return appendAssistantChunk(prev, "thought", textOf(update.content));

    case "user_message_chunk":
      return appendUserChunk(prev, textOf(update.content));

    case "tool_call":
      return upsertToolCall(prev, {
        id: update.toolCallId,
        title: update.title,
        status: mapToolStatus(update.status),
        content: update.content,
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      });

    case "tool_call_update":
      return mergeToolCall(prev, update.toolCallId, {
        status: update.status,
        title: update.title,
        content: update.content,
        rawInput: update.rawInput,
        rawOutput: update.rawOutput,
      });

    case "plan":
      return mergePlan(prev, update.entries);

    case "available_commands_update":
      // Handled by useACP at the connection layer; the reducer ignores it.
      return prev;

    case "current_mode_update":
      // Status bar handles this; no thread entry needed.
      return prev;

    default:
      return prev;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function textOf(content: { type?: string; text?: string } | undefined | null): string {
  if (content && content.type === "text" && typeof content.text === "string") return content.text;
  return "";
}

function appendAssistantChunk(
  prev: ThreadEntry[],
  kind: "message" | "thought",
  text: string,
): ThreadEntry[] {
  if (!text) return prev;
  const last = prev[prev.length - 1];
  if (last?.type === "assistant_message") {
    const lastChunk = last.chunks[last.chunks.length - 1];
    if (lastChunk?.type === kind) {
      return [
        ...prev.slice(0, -1),
        {
          ...last,
          chunks: [
            ...last.chunks.slice(0, -1),
            { type: kind, text: lastChunk.text + text },
          ],
        },
      ];
    }
    return [
      ...prev.slice(0, -1),
      { ...last, chunks: [...last.chunks, { type: kind, text }] },
    ];
  }
  const fresh: AssistantMessageEntry = {
    type: "assistant_message",
    id: nextEntryId("a"),
    chunks: [{ type: kind, text }],
  };
  return [...prev, fresh];
}

function appendUserChunk(prev: ThreadEntry[], text: string): ThreadEntry[] {
  if (!text) return prev;
  const last = prev[prev.length - 1];
  if (last?.type === "user_message") {
    return [
      ...prev.slice(0, -1),
      { ...last, content: last.content + text },
    ];
  }
  const fresh: UserMessageEntry = {
    type: "user_message",
    id: nextEntryId("u"),
    content: text,
  };
  return [...prev, fresh];
}

function upsertToolCall(prev: ThreadEntry[], data: ToolCallData): ThreadEntry[] {
  const idx = findToolCallIndex(prev, data.id);
  if (idx >= 0) {
    return prev.map((entry, i) => {
      if (i !== idx) return entry;
      if (entry.type !== "tool_call") return entry;
      return { type: "tool_call", toolCall: { ...entry.toolCall, ...data } };
    });
  }
  const fresh: ToolCallEntry = { type: "tool_call", toolCall: data };
  return [...prev, fresh];
}

function mergeToolCall(
  prev: ThreadEntry[],
  toolCallId: string,
  patch: {
    status?: string;
    title?: string;
    content?: ToolCallData["content"];
    rawInput?: Record<string, unknown>;
    rawOutput?: unknown;
  },
): ThreadEntry[] {
  const idx = findToolCallIndex(prev, toolCallId);
  if (idx < 0) {
    // Agent referenced a tool call we never saw — surface a placeholder so the
    // user understands an update was missed.
    const fallback: ToolCallEntry = {
      type: "tool_call",
      toolCall: {
        id: toolCallId,
        title: patch.title ?? "Tool call (orphan update)",
        status: "error",
        content: [
          {
            type: "content",
            content: { type: "text", text: "Received tool_call_update for an unknown tool call." },
          },
        ],
      },
    };
    return [...prev, fallback];
  }
  return prev.map((entry, i) => {
    if (i !== idx) return entry;
    if (entry.type !== "tool_call") return entry;
    const status = patch.status ? mapToolStatus(patch.status) : entry.toolCall.status;
    const mergedContent = patch.content
      ? [...(entry.toolCall.content ?? []), ...patch.content]
      : entry.toolCall.content;
    return {
      type: "tool_call",
      toolCall: {
        ...entry.toolCall,
        status,
        ...(patch.title ? { title: patch.title } : {}),
        ...(mergedContent ? { content: mergedContent } : {}),
        ...(patch.rawInput ? { rawInput: patch.rawInput } : {}),
        ...(patch.rawOutput ? { rawOutput: patch.rawOutput } : {}),
      },
    };
  });
}

function mergePlan(prev: ThreadEntry[], entries: PlanDisplayEntry["entries"]): ThreadEntry[] {
  if (entries.length === 0) {
    return prev.filter((e) => e.type !== "plan");
  }
  let lastPlanIdx = -1;
  for (let i = prev.length - 1; i >= 0; i -= 1) {
    if (prev[i].type === "plan") {
      lastPlanIdx = i;
      break;
    }
  }
  if (lastPlanIdx >= 0) {
    return prev.map((entry, i) => (i === lastPlanIdx && entry.type === "plan" ? { ...entry, entries } : entry));
  }
  const fresh: PlanDisplayEntry = { type: "plan", id: nextEntryId("p"), entries };
  return [...prev, fresh];
}

// =============================================================================
// Permission state helpers
// =============================================================================

export function attachPermissionToToolCall(
  prev: ThreadEntry[],
  toolCallId: string,
  permission: { requestId: string; options: ToolCallData["permissionRequest"] extends infer X ? (X extends { options: infer O } ? O : never) : never },
  fallbackTitle: string,
): ThreadEntry[] {
  const idx = findToolCallIndex(prev, toolCallId);
  if (idx >= 0) {
    return prev.map((entry, i) => {
      if (i !== idx) return entry;
      if (entry.type !== "tool_call") return entry;
      return {
        type: "tool_call",
        toolCall: {
          ...entry.toolCall,
          status: "waiting_for_confirmation",
          permissionRequest: { requestId: permission.requestId, options: permission.options },
        },
      };
    });
  }
  const standalone: ToolCallEntry = {
    type: "tool_call",
    toolCall: {
      id: toolCallId,
      title: fallbackTitle,
      status: "waiting_for_confirmation",
      permissionRequest: { requestId: permission.requestId, options: permission.options },
      isStandalonePermission: true,
    },
  };
  return [...prev, standalone];
}

export function resolvePermissionForToolCall(
  prev: ThreadEntry[],
  requestId: string,
  approved: boolean,
): ThreadEntry[] {
  return prev.map((entry) => {
    if (entry.type !== "tool_call") return entry;
    if (entry.toolCall.permissionRequest?.requestId !== requestId) return entry;
    let nextStatus: ToolCallStatus;
    if (!approved) {
      nextStatus = "rejected";
    } else if (entry.toolCall.isStandalonePermission) {
      nextStatus = "complete";
    } else {
      nextStatus = "running";
    }
    return {
      type: "tool_call",
      toolCall: {
        ...entry.toolCall,
        status: nextStatus,
        permissionRequest: undefined,
        isStandalonePermission: undefined,
      },
    };
  });
}
