import { log, error as logError } from "../../logger";
import { Hono } from "hono";
import { uuidAuth } from "../../auth/middleware";
import { getSession, isSessionClosedStatus, resolveOwnedWebSessionId, updateSessionStatus } from "../../services/session";
import { publishSessionEvent } from "../../services/transport";
import { getEventBus } from "../../transport/event-bus";

const app = new Hono();

type OwnershipCheckResult =
  | { error: true }
  | { error: true; reason: string }
  | { error: false; session: NonNullable<ReturnType<typeof getSession>>; sessionId: string };

function checkOwnership(c: { get: (key: string) => string | undefined }, sessionId: string): OwnershipCheckResult {
  const uuid = c.get("uuid")!;
  const resolvedSessionId = resolveOwnedWebSessionId(sessionId, uuid);
  if (!resolvedSessionId) {
    return { error: true };
  }
  const session = getSession(resolvedSessionId);
  if (!session) {
    return { error: true };
  }
  if (isSessionClosedStatus(session.status)) {
    return { error: true, reason: `Session is ${session.status}` };
  }
  return { error: false, session, sessionId: resolvedSessionId };
}

function closedSessionResponse(message: string) {
  return { error: { type: "session_closed", message } };
}

/** POST /web/sessions/:id/events — Send user message to session */
app.post("/sessions/:id/events", uuidAuth, async (c) => {
  const requestedSessionId = c.req.param("id")!;
  const ownership = checkOwnership(c, requestedSessionId);
  if (ownership.error) {
    const message = "reason" in ownership ? ownership.reason : "Not your session";
    const status = "reason" in ownership ? 409 : 403;
    return c.json("reason" in ownership ? closedSessionResponse(message) : { error: { type: "forbidden", message } }, status);
  }
  const { sessionId } = ownership;

  const body = await c.req.json();
  const eventType = body.type || "user";
  log(`[RC-DEBUG] web -> server: POST /web/sessions/${sessionId}/events type=${eventType} content=${JSON.stringify(body).slice(0, 200)}`);
  const event = publishSessionEvent(sessionId, eventType, body, "outbound");
  log(`[RC-DEBUG] web -> server: published outbound event id=${event.id} type=${event.type} direction=${event.direction} subscribers=${getEventBus(sessionId).subscriberCount()}`);
  return c.json({ status: "ok", event }, 200);
});

/** POST /web/sessions/:id/control — Send control request (permission approval etc) */
app.post("/sessions/:id/control", uuidAuth, async (c) => {
  const requestedSessionId = c.req.param("id")!;
  const ownership = checkOwnership(c, requestedSessionId);
  if (ownership.error) {
    const message = "reason" in ownership ? ownership.reason : "Not your session";
    const status = "reason" in ownership ? 409 : 403;
    return c.json("reason" in ownership ? closedSessionResponse(message) : { error: { type: "forbidden", message } }, status);
  }
  const { sessionId } = ownership;

  const body = await c.req.json();
  const event = publishSessionEvent(sessionId, body.type || "control_request", body, "outbound");
  return c.json({ status: "ok", event }, 200);
});

/** POST /web/sessions/:id/interrupt — Interrupt session */
app.post("/sessions/:id/interrupt", uuidAuth, async (c) => {
  const requestedSessionId = c.req.param("id")!;
  const ownership = checkOwnership(c, requestedSessionId);
  if (ownership.error) {
    const message = "reason" in ownership ? ownership.reason : "Not your session";
    const status = "reason" in ownership ? 409 : 403;
    return c.json("reason" in ownership ? closedSessionResponse(message) : { error: { type: "forbidden", message } }, status);
  }
  const { sessionId } = ownership;

  publishSessionEvent(sessionId, "interrupt", { action: "interrupt" }, "outbound");
  updateSessionStatus(sessionId, "idle");
  return c.json({ status: "ok" }, 200);
});

export default app;
