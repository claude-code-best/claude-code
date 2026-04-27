import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import type { WSContext, WSMessageReceive } from "hono/ws";
import { upgradeWebSocket } from "../../transport/ws-shared";
import {
  decodeWsPayload,
  handleSizedWsPayload,
} from "../../transport/ws-payload";
import {
  extractBearerToken,
  extractWebSocketAuthToken,
} from "../../auth/middleware";
import { validateApiKey } from "../../auth/api-key";
import {
  handleAcpWsOpen,
  handleAcpWsMessage,
  handleAcpWsClose,
} from "../../transport/acp-ws-handler";
import {
  handleRelayOpen,
  handleRelayMessage,
  handleRelayClose,
} from "../../transport/acp-relay-handler";
import {
  storeListAcpAgents,
  storeListAcpAgentsByChannelGroup,
  storeGetEnvironment,
} from "../../store";
import { createAcpSSEStream } from "../../transport/acp-sse-writer";
import { log, error as logError } from "../../logger";

const app = new Hono();

type WsMessageEvent = {
  data: WSMessageReceive;
};

type WsCloseEvent = {
  code?: number;
  reason?: string;
};

/** Response shape for an ACP agent */
function toAcpAgentResponse(env: ReturnType<typeof storeGetEnvironment> & {}) {
  if (!env) return null;
  return {
    id: env.id,
    agent_name: env.machineName,
    channel_group_id: env.bridgeId,
    status: env.status === "active" ? "online" : "offline",
    max_sessions: env.maxSessions,
    last_seen_at: env.lastPollAt ? env.lastPollAt.getTime() / 1000 : null,
    created_at: env.createdAt.getTime() / 1000,
  };
}

function hasAcpReadAuth(c: Context): boolean {
  const token = extractBearerToken(c);
  return !!token && validateApiKey(token);
}

export function hasAcpRelayAuth(c: Context): boolean {
  const token = extractWebSocketAuthToken(c);
  return !!token && validateApiKey(token);
}

function acpReadUnauthorized(c: Context) {
  return c.json({ error: { type: "unauthorized", message: "Missing auth" } }, 401);
}

/** GET /acp/agents — List all registered ACP agents (API key auth) */
app.get("/agents", async (c) => {
  if (!hasAcpReadAuth(c)) {
    return acpReadUnauthorized(c);
  }
  const agents = storeListAcpAgents();
  return c.json(agents.map((a) => toAcpAgentResponse(a)).filter(Boolean));
});

/** GET /acp/channel-groups — List all channel groups with member agents (API key auth) */
app.get("/channel-groups", async (c) => {
  if (!hasAcpReadAuth(c)) {
    return acpReadUnauthorized(c);
  }
  const agents = storeListAcpAgents();
  const groupMap = new Map<string, typeof agents>();
  for (const agent of agents) {
    const groupId = agent.bridgeId || "default";
    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, []);
    }
    groupMap.get(groupId)!.push(agent);
  }
  const groups = [...groupMap.entries()].map(([id, members]) => ({
    channel_group_id: id,
    member_count: members.length,
    members: members.map((m) => toAcpAgentResponse(m)).filter(Boolean),
  }));
  return c.json(groups);
});

/** GET /acp/channel-groups/:id — Specific channel group detail (API key auth) */
app.get("/channel-groups/:id", async (c) => {
  if (!hasAcpReadAuth(c)) {
    return acpReadUnauthorized(c);
  }

  const groupId = c.req.param("id")!;
  const members = storeListAcpAgentsByChannelGroup(groupId);
  if (members.length === 0) {
    return c.json({ error: { type: "not_found", message: "Channel group not found" } }, 404);
  }
  return c.json({
    channel_group_id: groupId,
    member_count: members.length,
    members: members.map((m) => toAcpAgentResponse(m)).filter(Boolean),
  });
});

/** SSE /acp/channel-groups/:id/events — Event stream for external consumers (API key auth) */
app.get("/channel-groups/:id/events", async (c) => {
  if (!hasAcpReadAuth(c)) {
    return acpReadUnauthorized(c);
  }

  const groupId = c.req.param("id")!;

  // Support Last-Event-ID / from_sequence_num for reconnection
  const lastEventId = c.req.header("Last-Event-ID");
  const fromSeq = c.req.query("from_sequence_num");
  const fromSeqNum = fromSeq ? parseInt(fromSeq, 10) : lastEventId ? parseInt(lastEventId, 10) : 0;

  return createAcpSSEStream(c, groupId, fromSeqNum);
});

/** WS /acp/ws — WebSocket endpoint for acp-link connections */
app.get(
  "/ws",
  upgradeWebSocket(async (c) => {
    const token = extractWebSocketAuthToken(c);

    if (!token || !validateApiKey(token)) {
      log("[ACP-WS] Upgrade rejected: unauthorized");
      return {
        onOpen(_evt: Event, ws: WSContext) {
          ws.close(4003, "unauthorized");
        },
      };
    }

    // Generate unique wsId for this connection
    const wsId = `acp_ws_${randomUUID().replace(/-/g, "")}`;

    log(`[ACP-WS] Upgrade accepted: wsId=${wsId}`);
    return {
      onOpen(_evt: Event, ws: WSContext) {
        handleAcpWsOpen(ws, wsId);
      },
      onMessage(evt: WsMessageEvent, ws: WSContext) {
        handleAcpWsPayload(
          ws,
          "[ACP-WS]",
          `wsId=${wsId}`,
          evt.data,
          data => handleAcpWsMessage(ws, wsId, data),
        );
      },
      onClose(evt: WsCloseEvent, ws: WSContext) {
        handleAcpWsClose(ws, wsId, evt.code, evt.reason);
      },
      onError(evt: Event, ws: WSContext) {
        logError(`[ACP-WS] Error on wsId=${wsId}:`, evt);
        handleAcpWsClose(ws, wsId, 1006, "websocket error");
      },
    };
  }),
);

/** WS /acp/relay/:agentId — WebSocket relay for frontend to interact with an agent */
app.get(
  "/relay/:agentId",
  upgradeWebSocket(async (c) => {
    if (!hasAcpRelayAuth(c)) {
      log("[ACP-Relay] Upgrade rejected: unauthorized");
      return {
        onOpen(_evt: Event, ws: WSContext) {
          ws.close(4003, "unauthorized");
        },
      };
    }

    const agentId = c.req.param("agentId")!;
    const relayWsId = `relay_${randomUUID().replace(/-/g, "")}`;

    log(`[ACP-Relay] Upgrade accepted: relayWsId=${relayWsId} agentId=${agentId}`);
    return {
      onOpen(_evt: Event, ws: WSContext) {
        handleRelayOpen(ws, relayWsId, agentId);
      },
      onMessage(evt: WsMessageEvent, ws: WSContext) {
        handleAcpWsPayload(
          ws,
          "[ACP-Relay]",
          `relayWsId=${relayWsId}`,
          evt.data,
          data => handleRelayMessage(ws, relayWsId, data),
        );
      },
      onClose(evt: WsCloseEvent, ws: WSContext) {
        handleRelayClose(ws, relayWsId, evt.code, evt.reason);
      },
      onError(evt: Event, ws: WSContext) {
        logError(`[ACP-Relay] Error on relayWsId=${relayWsId}:`, evt);
        handleRelayClose(ws, relayWsId, 1006, "websocket error");
      },
    };
  }),
);

export const decodeAcpWsMessageData = decodeWsPayload;

export function handleAcpWsPayload(
  ws: WSContext,
  logPrefix: string,
  label: string,
  payload: unknown,
  handleMessage: (data: string) => void,
): boolean {
  return handleSizedWsPayload(ws, logPrefix, label, payload, handleMessage);
}

export default app;
