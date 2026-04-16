import { Hono } from "hono";
import { sessionIngressAuth, acceptCliHeaders } from "../../auth/middleware";
import { publishSessionEvent } from "../../services/transport";
import { getSession, touchSession, updateSessionStatus } from "../../services/session";

const app = new Hono();

function extractWorkerEvents(body: unknown): Array<Record<string, unknown>> {
  if (!body || typeof body !== "object") {
    return [];
  }

  const payload = body as Record<string, unknown>;
  const rawEvents = Array.isArray(payload.events)
    ? payload.events
    : Array.isArray(body)
      ? body
      : [body];

  return rawEvents
    .filter((evt): evt is Record<string, unknown> => !!evt && typeof evt === "object")
    .map((evt) => {
      const wrappedPayload = evt.payload;
      if (wrappedPayload && typeof wrappedPayload === "object" && !Array.isArray(wrappedPayload)) {
        return wrappedPayload as Record<string, unknown>;
      }
      return evt;
    });
}

/** POST /v1/code/sessions/:id/worker/events — Write events */
app.post("/:id/worker/events", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  if (!getSession(sessionId)) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  const body = await c.req.json();

  const events = extractWorkerEvents(body);
  const published = [];
  for (const evt of events) {
    const eventType = typeof evt.type === "string" ? evt.type : "message";
    const result = publishSessionEvent(sessionId, eventType, evt, "inbound");
    published.push(result);
  }

  touchSession(sessionId);

  return c.json({ status: "ok", count: published.length }, 200);
});

/** PUT /v1/code/sessions/:id/worker/state — Report worker state */
app.put("/:id/worker/state", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  if (!getSession(sessionId)) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  const body = await c.req.json();

  if (body.status) {
    updateSessionStatus(sessionId, body.status);
  } else {
    touchSession(sessionId);
  }

  return c.json({ status: "ok" }, 200);
});

/** PUT /v1/code/sessions/:id/worker/external_metadata — Report worker metadata (no-op) */
app.put("/:id/worker/external_metadata", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  if (!getSession(sessionId)) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  // TUI's CCRClient calls this for metadata reporting. Accept and discard.
  return c.json({ status: "ok" }, 200);
});

/** POST /v1/code/sessions/:id/worker/events/delivery — Batch delivery tracking (no-op) */
app.post("/:id/worker/events/delivery", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  if (!getSession(sessionId)) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  return c.json({ status: "ok" }, 200);
});

/** POST /v1/code/sessions/:id/worker/events/:eventId/delivery — Delivery tracking (no-op) */
app.post("/:id/worker/events/:eventId/delivery", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  if (!getSession(sessionId)) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  // TUI's CCRClient reports event delivery status (received/processing/processed).
  // Accept and discard — event bus doesn't track per-event delivery.
  return c.json({ status: "ok" }, 200);
});

export default app;
