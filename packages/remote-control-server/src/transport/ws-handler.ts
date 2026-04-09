import type { WSContext } from "hono/ws";
import { getEventBus } from "./event-bus";
import type { SessionEvent } from "./event-bus";
import { publishSessionEvent } from "../services/transport";

// Per-connection cleanup, keyed by sessionId (only one WS per session)
interface CleanupEntry {
  unsub: () => void;
  keepalive: ReturnType<typeof setInterval>;
  ws: WSContext;
  openTime: number;
}
const cleanupBySession = new Map<string, CleanupEntry>();

// Track all active WS connections for graceful shutdown
const activeConnections = new Set<WSContext>();

// Bridge sends keep_alive data frames every 120s. Send server-side keep_alive
// every 60s to ensure the connection stays alive even without user messages.
const SERVER_KEEPALIVE_INTERVAL_MS = 60_000;

/**
 * Convert internal EventBus event -> SDK message for bridge client.
 */
function toSDKMessage(event: SessionEvent): string {
  const payload = event.payload as Record<string, unknown> | null;

  let msg: Record<string, unknown>;

  if (event.type === "user" || event.type === "user_message") {
    msg = {
      type: "user",
      uuid: event.id,
      session_id: event.sessionId,
      message: {
        role: "user",
        content: payload?.content ?? payload?.message ?? "",
      },
    };
  } else if (event.type === "permission_response" || event.type === "control_response") {
    const approved = !!payload?.approved;
    const existingResponse = payload?.response as Record<string, unknown> | undefined;
    if (existingResponse) {
      msg = { type: "control_response", response: existingResponse };
    } else {
      const updatedInput = payload?.updated_input as Record<string, unknown> | undefined;
      const updatedPermissions = payload?.updated_permissions as Record<string, unknown>[] | undefined;
      const feedbackMessage = payload?.message as string | undefined;
      msg = {
        type: "control_response",
        response: {
          subtype: approved ? "success" : "error",
          request_id: payload?.request_id ?? "",
          ...(approved
            ? {
                response: {
                  behavior: "allow" as const,
                  ...(updatedInput ? { updatedInput } : {}),
                  ...(updatedPermissions ? { updatedPermissions } : {}),
                },
              }
            : {
                error: "Permission denied by user",
                response: { behavior: "deny" as const },
                ...(feedbackMessage ? { message: feedbackMessage } : {}),
              }),
        },
      };
    }
  } else if (event.type === "interrupt") {
    msg = {
      type: "control_request",
      request_id: event.id,
      request: { subtype: "interrupt" },
    };
  } else if (event.type === "control_request") {
    msg = {
      type: "control_request",
      request_id: payload?.request_id ?? event.id,
      request: payload?.request ?? payload,
    };
  } else {
    msg = {
      type: event.type,
      uuid: event.id,
      session_id: event.sessionId,
      message: payload,
    };
  }

  // NDJSON format: each message MUST end with \n so the child process's
  // line-based parser can split messages correctly.
  return JSON.stringify(msg) + "\n";
}

/** Called from onOpen — subscribes to event bus, forwards outbound events to bridge WS */
export function handleWebSocketOpen(ws: WSContext, sessionId: string) {
  const openTime = Date.now();
  console.log(`[RC-DEBUG] [WS] Open session=${sessionId}`);
  activeConnections.add(ws);

  // If there's an existing connection for this session, clean it up first
  const existing = cleanupBySession.get(sessionId);
  if (existing) {
    console.log(`[WS] Replacing existing connection for session=${sessionId}`);
    existing.unsub();
    clearInterval(existing.keepalive);
    activeConnections.delete(existing.ws);
  }

  const bus = getEventBus(sessionId);

  // Replay ALL events (inbound + outbound) so the bridge can reconstruct
  // the full conversation history — assistant replies are inbound events.
  const missed = bus.getEventsSince(0);
  if (missed.length > 0) {
    console.log(`[WS] Replaying ${missed.length} missed event(s)`);
    for (const event of missed) {
      if (ws.readyState !== 1) break;
      try {
        ws.send(toSDKMessage(event));
      } catch {
        // ignore send errors during replay
      }
    }
  }

  const unsub = bus.subscribe((event: SessionEvent) => {
    if (ws.readyState !== 1) return;
    if (event.direction !== "outbound") return;
    try {
      const sdkMsg = toSDKMessage(event);
      console.log(`[RC-DEBUG] [WS] -> bridge (outbound): type=${event.type} len=${sdkMsg.length} msg=${sdkMsg.slice(0, 300)}`);
      ws.send(sdkMsg);
    } catch (err) {
      console.error("[RC-DEBUG] [WS] send error:", err);
    }
  });

  const keepalive = setInterval(() => {
    if (ws.readyState !== 1) {
      clearInterval(keepalive);
      return;
    }
    try {
      ws.send('{"type":"keep_alive"}\n');
    } catch {
      clearInterval(keepalive);
    }
  }, SERVER_KEEPALIVE_INTERVAL_MS);

  cleanupBySession.set(sessionId, { unsub, keepalive, ws, openTime });
}

/**
 * Called from onMessage — bridge sends newline-delimited JSON.
 */
export function handleWebSocketMessage(ws: WSContext, sessionId: string, data: string) {
  const lines = data.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    try {
      ingestBridgeMessage(sessionId, JSON.parse(line));
    } catch (err) {
      console.error("[WS] parse error:", err);
    }
  }
}

/** Called from onClose — unsubscribes from event bus */
export function handleWebSocketClose(ws: WSContext, sessionId: string, code?: number, reason?: string) {
  activeConnections.delete(ws);

  const entry = cleanupBySession.get(sessionId);
  const duration = entry ? Math.round((Date.now() - entry.openTime) / 1000) : -1;

  console.log(`[WS] Close session=${sessionId} code=${code ?? "none"} reason=${reason || "(none)"} duration=${duration}s`);

  if (entry) {
    entry.unsub();
    clearInterval(entry.keepalive);
    cleanupBySession.delete(sessionId);
  }
}

/**
 * Derive event type from a child process message that may lack an explicit
 * `type` field. The child's --print --output-format stream-json mode sends:
 *   {"message":{"role":"user",...},"uuid":"..."}       → type "user"
 *   {"message":{"role":"assistant",...},"uuid":"..."}  → type "assistant"
 *   {"subtype":"success","uuid":"...","result":"..."}  → type "result"
 */
function deriveEventType(msg: Record<string, unknown>): string {
  if (msg.type && typeof msg.type === "string") return msg.type;

  // Child process stream-json format: message.role determines type
  const message = msg.message as Record<string, unknown> | undefined;
  if (message && typeof message.role === "string") {
    return message.role; // "user", "assistant", "system"
  }

  // Result message
  if (msg.subtype || msg.result !== undefined) return "result";

  // System/init message
  if (msg.session_id) return "system";

  return "unknown";
}

/**
 * Parse a single SDK message from bridge -> publish to EventBus as inbound.
 */
export function ingestBridgeMessage(sessionId: string, msg: Record<string, unknown>) {
  if (msg.type === "keep_alive") return;

  const eventType = deriveEventType(msg);

  console.log(`[RC-DEBUG] [WS] <- bridge (inbound): sessionId=${sessionId} type=${eventType}${msg.uuid ? ` uuid=${msg.uuid}` : ""} msg=${JSON.stringify(msg).slice(0, 300)}`);

  let payload: unknown;

  if (eventType === "assistant" || eventType === "partial_assistant") {
    const message = msg.message as Record<string, unknown> | undefined;
    const content = message?.content;
    // Extract text from content blocks for simple display
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b: unknown) => b && typeof b === "object" && "type" in (b as Record<string, unknown>) && (b as Record<string, unknown>).type === "text")
        .map((b: Record<string, unknown>) => (b as Record<string, unknown>).text || "")
        .join("");
    }
    payload = { message: msg.message, uuid: msg.uuid, content: text };
  } else if (eventType === "user" || eventType === "system") {
    payload = { message: msg.message, uuid: msg.uuid };
  } else if (eventType === "control_request") {
    payload = { request_id: msg.request_id, request: msg.request };
  } else if (eventType === "control_response") {
    payload = { response: msg.response };
  } else if (eventType === "result" || eventType === "result_success") {
    payload = { subtype: msg.subtype, uuid: msg.uuid, result: msg.result };
  } else {
    payload = msg;
  }

  publishSessionEvent(sessionId, eventType, payload, "inbound");
}

/**
 * Gracefully close all active WebSocket connections.
 */
export function closeAllConnections(): void {
  const count = activeConnections.size;
  if (count === 0) return;

  console.log(`[WS] Gracefully closing ${count} active connection(s)...`);
  for (const [sessionId, entry] of cleanupBySession) {
    try {
      entry.unsub();
      clearInterval(entry.keepalive);
      if (entry.ws.readyState === 1) {
        entry.ws.close(1001, "server_shutdown");
      }
    } catch {
      // ignore errors during shutdown
    }
  }
  cleanupBySession.clear();
  activeConnections.clear();
  console.log("[WS] All connections closed");
}
