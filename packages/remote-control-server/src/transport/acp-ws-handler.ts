import type { WSContext } from "hono/ws";
import { v4 as uuid } from "uuid";
import { getAcpEventBus } from "./event-bus";
import type { SessionEvent } from "./event-bus";
import {
  storeCreateEnvironment,
  storeGetEnvironment,
  storeMarkAcpAgentOffline,
  storeMarkAcpAgentOnline,
  storeUpdateEnvironment,
} from "../store";
import { config } from "../config";
import { log, error as logError } from "../logger";

// Per-connection state
interface AcpConnectionEntry {
  agentId: string | null; // Set after register message
  channelGroupId: string;
  unsub: (() => void) | null;
  keepalive: ReturnType<typeof setInterval> | null;
  ws: WSContext;
  openTime: number;
  lastClientActivity: number;
  capabilities: Record<string, unknown> | null;
}

const connections = new Map<string, AcpConnectionEntry>(); // key: wsId

const SERVER_KEEPALIVE_INTERVAL_MS = config.wsKeepaliveInterval * 1000;
const CLIENT_ACTIVITY_TIMEOUT_MS = SERVER_KEEPALIVE_INTERVAL_MS * 3;

/** Send a JSON message to a WS connection (NDJSON format) */
function sendToWs(ws: WSContext, msg: object): void {
  if (ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(msg) + "\n");
  } catch (err) {
    logError("[ACP-WS] send error:", err);
  }
}

/** Called from onOpen — initializes connection tracking */
export function handleAcpWsOpen(ws: WSContext, wsId: string): void {
  log(`[ACP-WS] Connection opened: wsId=${wsId}`);

  const keepalive = setInterval(() => {
    const entry = connections.get(wsId);
    if (!entry || entry.ws.readyState !== 1) {
      clearInterval(keepalive);
      return;
    }
    const silenceMs = Date.now() - entry.lastClientActivity;
    if (silenceMs > CLIENT_ACTIVITY_TIMEOUT_MS) {
      log(`[ACP-WS] Client inactive for ${Math.round(silenceMs / 1000)}s, closing dead connection`);
      try {
        entry.ws.close(1000, "client inactive");
      } catch {
        clearInterval(keepalive);
      }
      return;
    }
    sendToWs(entry.ws, { type: "keep_alive" });
  }, SERVER_KEEPALIVE_INTERVAL_MS);

  connections.set(wsId, {
    agentId: null,
    channelGroupId: "",
    unsub: null,
    keepalive,
    ws,
    openTime: Date.now(),
    lastClientActivity: Date.now(),
    capabilities: null,
  });
}

/** Handle register message — legacy WS-only registration (still supported) */
function handleRegister(wsId: string, msg: Record<string, unknown>): void {
  const entry = connections.get(wsId);
  if (!entry) return;

  if (entry.agentId) {
    sendToWs(entry.ws, { type: "error", message: "Already registered" });
    return;
  }

  const agentName = (msg.agent_name as string) || "unknown";
  const capabilities = msg.capabilities as Record<string, unknown> | undefined;
  const channelGroupId = (msg.channel_group_id as string) || `group_${uuid().replace(/-/g, "").slice(0, 12)}`;
  const acpLinkVersion = (msg.acp_link_version as string) || null;
  const maxSessions = typeof msg.max_sessions === "number" ? msg.max_sessions : 1;

  // Create EnvironmentRecord with workerType="acp"
  const secret = config.apiKeys[0] || "";
  const record = storeCreateEnvironment({
    secret,
    machineName: agentName,
    workerType: "acp",
    bridgeId: channelGroupId,
    maxSessions,
    capabilities: capabilities || undefined,
  } as Parameters<typeof storeCreateEnvironment>[0]);

  // Store ACP-specific metadata via environment update
  storeUpdateEnvironment(record.id, {
    status: "active",
  } as Parameters<typeof storeUpdateEnvironment>[1]);

  entry.agentId = record.id;
  entry.channelGroupId = channelGroupId;
  entry.capabilities = capabilities || null;

  // Subscribe to channel group EventBus — broadcast events to this WS
  const bus = getAcpEventBus(channelGroupId);
  const unsub = bus.subscribe((event: SessionEvent) => {
    if (entry.ws.readyState !== 1) return;
    if (event.direction !== "outbound") return;
    // Forward outbound events as raw ACP messages
    sendToWs(entry.ws, event.payload as object);
  });
  entry.unsub = unsub;

  log(`[ACP-WS] Agent registered (legacy WS): agentId=${record.id} channelGroup=${channelGroupId} name=${agentName}`);
  sendToWs(entry.ws, {
    type: "registered",
    agent_id: record.id,
    channel_group_id: channelGroupId,
  });
}

/** Handle identify message — binds WS to an existing agent registered via REST */
function handleIdentify(wsId: string, msg: Record<string, unknown>): void {
  const entry = connections.get(wsId);
  if (!entry) return;

  if (entry.agentId) {
    sendToWs(entry.ws, { type: "error", message: "Already identified" });
    return;
  }

  const agentId = msg.agent_id as string;
  if (!agentId) {
    sendToWs(entry.ws, { type: "error", message: "Missing agent_id" });
    return;
  }

  // Look up the environment record (created via REST registration)
  const record = storeGetEnvironment(agentId);
  if (!record || record.workerType !== "acp") {
    sendToWs(entry.ws, { type: "error", message: "Agent not found" });
    return;
  }

  // Update status to active
  storeMarkAcpAgentOnline(agentId);

  const channelGroupId = record.bridgeId || `group_${uuid().replace(/-/g, "").slice(0, 12)}`;

  entry.agentId = record.id;
  entry.channelGroupId = channelGroupId;
  entry.capabilities = record.capabilities || null;

  // Subscribe to channel group EventBus — broadcast events to this WS
  const bus = getAcpEventBus(channelGroupId);
  const unsub = bus.subscribe((event: SessionEvent) => {
    if (entry.ws.readyState !== 1) return;
    if (event.direction !== "outbound") return;
    sendToWs(entry.ws, event.payload as object);
  });
  entry.unsub = unsub;

  log(`[ACP-WS] Agent identified (REST+WS): agentId=${record.id} channelGroup=${channelGroupId}`);
  sendToWs(entry.ws, {
    type: "identified",
    agent_id: record.id,
    channel_group_id: channelGroupId,
  });
}

/** Called from onMessage — processes NDJSON lines */
export function handleAcpWsMessage(ws: WSContext, wsId: string, data: string): void {
  const entry = connections.get(wsId);
  if (!entry) return;

  entry.lastClientActivity = Date.now();

  const lines = data.split("\n").filter((l) => l.trim());
  for (const line of lines) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      logError("[ACP-WS] parse error:", line);
      continue;
    }

    // Handle keepalive
    if (msg.type === "keep_alive") {
      // Update last activity timestamp (only if registered)
      if (entry.agentId) {
        storeUpdateEnvironment(entry.agentId, { lastPollAt: new Date() } as Parameters<typeof storeUpdateEnvironment>[1]);
      }
      continue;
    }

    // Handle registration (legacy WS-only)
    if (msg.type === "register") {
      handleRegister(wsId, msg);
      continue;
    }

    // Handle identify (REST registration + WS binding)
    if (msg.type === "identify") {
      handleIdentify(wsId, msg);
      continue;
    }

    // Not registered yet — reject
    if (!entry.agentId) {
      sendToWs(entry.ws, { type: "error", message: "Not registered. Send register message first." });
      continue;
    }

    // Update agent activity
    storeUpdateEnvironment(entry.agentId, { lastPollAt: new Date() } as Parameters<typeof storeUpdateEnvironment>[1]);

    // Pass-through: publish to channel group EventBus as inbound
    const bus = getAcpEventBus(entry.channelGroupId);
    bus.publish({
      id: uuid(),
      sessionId: entry.channelGroupId,
      type: (msg.type as string) || "acp_message",
      payload: msg,
      direction: "inbound",
    });
  }
}

/** Called from onClose — marks agent offline and cleans up */
export function handleAcpWsClose(ws: WSContext, wsId: string, code?: number, reason?: string): void {
  const entry = connections.get(wsId);
  if (!entry) return;

  const duration = Math.round((Date.now() - entry.openTime) / 1000);
  log(`[ACP-WS] Connection closed: wsId=${wsId} agentId=${entry.agentId} code=${code ?? "none"} reason=${reason || "(none)"} duration=${duration}s`);

  if (entry.unsub) {
    entry.unsub();
  }
  if (entry.keepalive) {
    clearInterval(entry.keepalive);
  }

  // Mark agent as offline (don't delete record — allow reconnect)
  if (entry.agentId) {
    storeMarkAcpAgentOffline(entry.agentId);

    // Notify all relay connections that this agent is gone
    if (entry.channelGroupId) {
      const bus = getAcpEventBus(entry.channelGroupId);
      bus.publish({
        id: uuid(),
        sessionId: entry.channelGroupId,
        type: "agent_disconnect",
        payload: { agentId: entry.agentId },
        direction: "inbound",
      });
    }
  }

  connections.delete(wsId);
}

/** Find an active ACP connection by agent ID */
export function findAcpConnectionByAgentId(agentId: string): AcpConnectionEntry | null {
  for (const entry of connections.values()) {
    if (entry.agentId === agentId && entry.ws.readyState === 1) {
      return entry;
    }
  }
  return null;
}

/** Send a JSON message directly to an agent's WebSocket connection */
export function sendToAgentWs(agentId: string, msg: object): boolean {
  const entry = findAcpConnectionByAgentId(agentId);
  if (!entry) return false;
  sendToWs(entry.ws, msg);
  return true;
}

/** Gracefully close all ACP WebSocket connections */
export function closeAllAcpConnections(): void {
  if (connections.size === 0) return;

  log(`[ACP-WS] Gracefully closing ${connections.size} ACP connection(s)...`);
  for (const [wsId, entry] of connections) {
    try {
      if (entry.unsub) entry.unsub();
      if (entry.keepalive) clearInterval(entry.keepalive);
      if (entry.ws.readyState === 1) {
        entry.ws.close(1001, "server_shutdown");
      }
      if (entry.agentId) {
        storeMarkAcpAgentOffline(entry.agentId);
      }
    } catch {
      // ignore errors during shutdown
    }
  }
  connections.clear();
  log("[ACP-WS] All connections closed");
}
