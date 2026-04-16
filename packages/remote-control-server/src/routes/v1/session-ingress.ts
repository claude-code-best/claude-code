import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { validateApiKey } from "../../auth/api-key";
import { verifyWorkerJwt } from "../../auth/jwt";
import {
  handleWebSocketOpen,
  handleWebSocketMessage,
  handleWebSocketClose,
  ingestBridgeMessage,
} from "../../transport/ws-handler";
import { getSession, resolveExistingSessionId } from "../../services/session";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();

/** Authenticate via API key or worker JWT in Authorization header or ?token= query param */
function authenticateRequest(c: any, label: string, expectedSessionId?: string): boolean {
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");
  const token = authHeader?.replace("Bearer ", "") || queryToken;

  // Try API key first
  if (validateApiKey(token)) {
    return true;
  }

  // Try JWT verification — validate session_id matches if provided
  if (token) {
    const payload = verifyWorkerJwt(token);
    if (payload) {
      if (expectedSessionId && payload.session_id !== expectedSessionId) {
        console.log(`[Auth] ${label}: FAILED — JWT session_id mismatch`);
        return false;
      }
      return true;
    }
  }

  console.log(`[Auth] ${label}: FAILED — no valid API key or JWT`);
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
        onOpen(_evt, ws) {
          ws.close(4003, "unauthorized");
        },
      };
    }

    const session = getSession(sessionId);
    if (!session) {
      console.log(`[WS] Upgrade rejected: session ${sessionId} not found`);
      return {
        onOpen(_evt, ws) {
          ws.close(4001, "session not found");
        },
      };
    }

    console.log(`[WS] Upgrade accepted: session=${sessionId}`);
    return {
      onOpen(_evt, ws) {
        handleWebSocketOpen(ws as any, sessionId);
      },
      onMessage(evt, ws) {
        const data =
          typeof evt.data === "string"
            ? evt.data
            : new TextDecoder().decode(evt.data as ArrayBuffer);
        handleWebSocketMessage(ws as any, sessionId, data);
      },
      onClose(evt, ws) {
        const closeEvt = evt as unknown as CloseEvent;
        handleWebSocketClose(ws as any, sessionId, closeEvt?.code, closeEvt?.reason);
      },
      onError(evt, ws) {
        console.error(`[WS] Error on session=${sessionId}:`, evt);
        handleWebSocketClose(ws as any, sessionId, 1006, "websocket error");
      },
    };
  }),
);

export { websocket };
export default app;
