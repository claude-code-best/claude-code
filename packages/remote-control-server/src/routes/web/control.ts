import { Hono } from "hono";
import { apiKeyAuth } from "../../auth/middleware";
import { getSession, updateSessionStatus } from "../../services/session";
import { publishSessionEvent } from "../../services/transport";
import { getEventBus } from "../../transport/event-bus";

const app = new Hono();

/**
 * Check if a session belongs to the given user.
 * Sessions with null username are considered unowned and accessible by anyone.
 */
function ownsSession(session: { username: string | null }, username: string | undefined): boolean {
  if (!session.username) return true;
  if (!username) return true;
  return session.username === username;
}

function checkOwnership(c: { get: (key: string) => string | undefined }, sessionId: string) {
  const username = c.get("username");
  const session = getSession(sessionId);
  if (!session || !ownsSession(session, username)) {
    return { error: true, session: null };
  }
  return { error: false, session };
}

/** POST /web/sessions/:id/events — Send user message to session */
app.post("/sessions/:id/events", apiKeyAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  const { error } = checkOwnership(c, sessionId);
  if (error) {
    return c.json({ error: { type: "forbidden", message: "Not your session" } }, 403);
  }

  const body = await c.req.json();
  const eventType = body.type || "user";
  console.log(`[RC-DEBUG] web -> server: POST /web/sessions/${sessionId}/events type=${eventType} content=${JSON.stringify(body).slice(0, 200)}`);
  const event = publishSessionEvent(sessionId, eventType, body, "outbound");
  console.log(`[RC-DEBUG] web -> server: published outbound event id=${event.id} type=${event.type} direction=${event.direction} subscribers=${getEventBus(sessionId).subscriberCount()}`);
  return c.json({ status: "ok", event }, 200);
});

/** POST /web/sessions/:id/control — Send control request (permission approval etc) */
app.post("/sessions/:id/control", apiKeyAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  const { error } = checkOwnership(c, sessionId);
  if (error) {
    return c.json({ error: { type: "forbidden", message: "Not your session" } }, 403);
  }

  const body = await c.req.json();
  const event = publishSessionEvent(sessionId, body.type || "control_request", body, "outbound");
  return c.json({ status: "ok", event }, 200);
});

/** POST /web/sessions/:id/interrupt — Interrupt session */
app.post("/sessions/:id/interrupt", apiKeyAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  const { error } = checkOwnership(c, sessionId);
  if (error) {
    return c.json({ error: { type: "forbidden", message: "Not your session" } }, 403);
  }

  publishSessionEvent(sessionId, "interrupt", { action: "interrupt" }, "outbound");
  updateSessionStatus(sessionId, "idle");
  return c.json({ status: "ok" }, 200);
});

export default app;
