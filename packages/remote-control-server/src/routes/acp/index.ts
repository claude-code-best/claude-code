import { Hono } from "hono";
import { upgradeWebSocket } from "../../transport/ws-shared";
import { apiKeyAuth } from "../../auth/middleware";
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

/** Maximum WebSocket message size: 10 MB */
const MAX_WS_MESSAGE_SIZE = 10 * 1024 * 1024;

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

/** GET /acp/agents — List all registered ACP agents (UUID or API key auth) */
app.get("/agents", async (c) => {
  // Require at least UUID auth
  const uuid = c.req.query("uuid");
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");
  const token = authHeader?.replace("Bearer ", "") || queryToken;
  if (!uuid && !(token && validateApiKey(token))) {
    return c.json({ error: { type: "unauthorized", message: "Missing auth" } }, 401);
  }
  const agents = storeListAcpAgents();
  return c.json(agents.map((a) => toAcpAgentResponse(a)).filter(Boolean));
});

/** GET /acp/channel-groups — List all channel groups with member agents (UUID or API key auth) */
app.get("/channel-groups", async (c) => {
  const uuid = c.req.query("uuid");
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");
  const token = authHeader?.replace("Bearer ", "") || queryToken;
  if (!uuid && !(token && validateApiKey(token))) {
    return c.json({ error: { type: "unauthorized", message: "Missing auth" } }, 401);
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

/** GET /acp/channel-groups/:id — Specific channel group detail (no auth for web UI) */
app.get("/channel-groups/:id", async (c) => {
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

/** SSE /acp/channel-groups/:id/events — Event stream for external consumers (no auth for web UI) */
app.get("/channel-groups/:id/events", async (c) => {
  const groupId = c.req.param("id")!;

  // Support Last-Event-ID / from_sequence_num for reconnection
  const lastEventId = c.req.header("Last-Event-ID");
  const fromSeq = c.req.query("from_sequence_num");
  const fromSeqNum = fromSeq ? parseInt(fromSeq) : lastEventId ? parseInt(lastEventId) : 0;

  return createAcpSSEStream(c, groupId, fromSeqNum);
});

/** WS /acp/ws — WebSocket endpoint for acp-link connections */
app.get(
  "/ws",
  upgradeWebSocket(async (c) => {
    // Authenticate via API key in query param or header
    const authHeader = c.req.header("Authorization");
    const queryToken = c.req.query("token");
    const token = authHeader?.replace("Bearer ", "") || queryToken;

    if (!token || !validateApiKey(token)) {
      log("[ACP-WS] Upgrade rejected: unauthorized");
      return {
        onOpen(_evt: any, ws: any) {
          ws.close(4003, "unauthorized");
        },
      };
    }

    // Generate unique wsId for this connection
    const { v4: uuid } = await import("uuid");
    const wsId = `acp_ws_${uuid().replace(/-/g, "")}`;

    log(`[ACP-WS] Upgrade accepted: wsId=${wsId}`);
    return {
      onOpen(_evt: any, ws: any) {
        handleAcpWsOpen(ws, wsId);
      },
      onMessage(evt: any, ws: any) {
        const data =
          typeof evt.data === "string"
            ? evt.data
            : new TextDecoder().decode(evt.data as ArrayBuffer);
        if (data.length > MAX_WS_MESSAGE_SIZE) {
          logError(`[ACP-WS] Message too large on wsId=${wsId}: ${data.length} bytes`);
          ws.close(1009, "message too large");
          return;
        }
        handleAcpWsMessage(ws, wsId, data);
      },
      onClose(evt: any, ws: any) {
        const closeEvt = evt as unknown as CloseEvent;
        handleAcpWsClose(ws, wsId, closeEvt?.code, closeEvt?.reason);
      },
      onError(evt: any, ws: any) {
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
    // Authenticate via UUID (web frontend) or API key (legacy)
    const clientUuid = c.req.query("uuid");
    const authHeader = c.req.header("Authorization");
    const queryToken = c.req.query("token");
    const token = authHeader?.replace("Bearer ", "") || queryToken;

    const hasUuid = !!clientUuid;
    const hasApiKey = !!token && validateApiKey(token);

    if (!hasUuid && !hasApiKey) {
      log("[ACP-Relay] Upgrade rejected: unauthorized");
      return {
        onOpen(_evt: any, ws: any) {
          ws.close(4003, "unauthorized");
        },
      };
    }

    const agentId = c.req.param("agentId")!;
    const { v4: uuid } = await import("uuid");
    const relayWsId = `relay_${uuid().replace(/-/g, "")}`;

    log(`[ACP-Relay] Upgrade accepted: relayWsId=${relayWsId} agentId=${agentId}`);
    return {
      onOpen(_evt: any, ws: any) {
        handleRelayOpen(ws, relayWsId, agentId);
      },
      onMessage(evt: any, ws: any) {
        const data =
          typeof evt.data === "string"
            ? evt.data
            : new TextDecoder().decode(evt.data as ArrayBuffer);
        if (data.length > MAX_WS_MESSAGE_SIZE) {
          logError(`[ACP-Relay] Message too large on relayWsId=${relayWsId}: ${data.length} bytes`);
          ws.close(1009, "message too large");
          return;
        }
        handleRelayMessage(ws, relayWsId, data);
      },
      onClose(evt: any, ws: any) {
        const closeEvt = evt as unknown as CloseEvent;
        handleRelayClose(ws, relayWsId, closeEvt?.code, closeEvt?.reason);
      },
      onError(evt: any, ws: any) {
        logError(`[ACP-Relay] Error on relayWsId=${relayWsId}:`, evt);
        handleRelayClose(ws, relayWsId, 1006, "websocket error");
      },
    };
  }),
);

export default app;
