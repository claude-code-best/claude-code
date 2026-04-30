import { log, error as logError } from "../../logger";
import { Hono } from "hono";
import type { Context } from "hono";
import type { WSContext, WSMessageReceive } from "hono/ws";
import { upgradeWebSocket, websocket } from "../../transport/ws-shared";
import {
  decodeWsPayload,
  handleSizedWsPayload,
} from "../../transport/ws-payload";
import { validateApiKey } from "../../auth/api-key";
import { verifyWorkerJwt } from "../../auth/jwt";
import { extractWebSocketAuthToken } from "../../auth/middleware";
import {
  handleWebSocketOpen,
  handleWebSocketMessage,
  handleWebSocketClose,
  ingestBridgeMessage,
} from "../../transport/ws-handler";
import { getSession, resolveExistingSessionId } from "../../services/session";

const app = new Hono();

type WsMessageEvent = {
  data: WSMessageReceive;
};

type WsCloseEvent = {
  code?: number;
  reason?: string;
};

/** Authenticate via API key or worker JWT without accepting URL query secrets. */
function authenticateRequest(c: Context, label: string, expectedSessionId?: string): boolean {
  const token = extractWebSocketAuthToken(c);

  // Try API key first
  if (validateApiKey(token)) {
    return true;
  }

  // Try JWT verification — validate session_id matches if provided
  if (token) {
    const payload = verifyWorkerJwt(token);
    if (payload) {
      if (expectedSessionId && payload.session_id !== expectedSessionId) {
        log(`[Auth] ${label}: FAILED — JWT session_id mismatch`);
        return false;
      }
      return true;
    }
  }

  log(`[Auth] ${label}: FAILED — no valid API key or JWT`);
  return false;
}

/** POST /v2/session_ingress/session/:sessionId/events — HTTP POST (HybridTransport writes) */
app.post("/session/:sessionId/events", async (c) => {
  const requestedSessionId = c.req.param("sessionId")!;
  const sessionId = resolveExistingSessionId(requestedSessionId) ?? requestedSessionId;

  if (!authenticateRequest(c, `POST session/${sessionId}`, sessionId)) {
    return c.json({ error: { type: "unauthorized", message: "Invalid auth" } }, 401);
  }

  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  const body = await c.req.json();
  const events = Array.isArray(body.events) ? body.events : [body];

  let count = 0;
  for (const msg of events) {
    if (!msg || typeof msg !== "object") continue;
    ingestBridgeMessage(sessionId, msg as Record<string, unknown>);
    count++;
  }

  return c.json({ status: "ok" }, 200);
});

/** WS /v2/session_ingress/ws/:sessionId — WebSocket transport */
app.get(
  "/ws/:sessionId",
  upgradeWebSocket(async (c) => {
    const requestedSessionId = c.req.param("sessionId")!;
    const sessionId = resolveExistingSessionId(requestedSessionId) ?? requestedSessionId;

    if (!authenticateRequest(c, `WS ${sessionId}`, sessionId)) {
      return {
        onOpen(_evt: Event, ws: WSContext) {
          ws.close(4003, "unauthorized");
        },
      };
    }

    const session = getSession(sessionId);
    if (!session) {
      log(`[WS] Upgrade rejected: session ${sessionId} not found`);
      return {
        onOpen(_evt: Event, ws: WSContext) {
          ws.close(4001, "session not found");
        },
      };
    }

    log(`[WS] Upgrade accepted: session=${sessionId}`);
    return {
      onOpen(_evt: Event, ws: WSContext) {
        handleWebSocketOpen(ws, sessionId);
      },
      onMessage(evt: WsMessageEvent, ws: WSContext) {
        handleSessionIngressWsPayload(ws, sessionId, evt.data);
      },
      onClose(evt: WsCloseEvent, ws: WSContext) {
        handleWebSocketClose(ws, sessionId, evt.code, evt.reason);
      },
      onError(evt: Event, ws: WSContext) {
        logError(`[WS] Error on session=${sessionId}:`, evt);
        handleWebSocketClose(ws, sessionId, 1006, "websocket error");
      },
    };
  }),
);

export const decodeSessionIngressWsMessage = decodeWsPayload;

export function handleSessionIngressWsPayload(
  ws: WSContext,
  sessionId: string,
  payload: unknown,
): boolean {
  return handleSizedWsPayload(
    ws,
    "[WS]",
    `session=${sessionId}`,
    payload,
    data => handleWebSocketMessage(ws, sessionId, data),
  );
}

export { websocket };
export default app;
