import { Hono } from "hono";
import { sessionIngressAuth, acceptCliHeaders } from "../../auth/middleware";
import { publishSessionEvent } from "../../services/transport";
import { getSession, updateSessionStatus } from "../../services/session";

const app = new Hono();

/** POST /v1/code/sessions/:id/worker/events — Write events */
app.post("/:id/worker/events", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  const body = await c.req.json();

  const events = Array.isArray(body) ? body : [body];
  const published = [];
  for (const evt of events) {
    const result = publishSessionEvent(sessionId, evt.type || "message", evt, "inbound");
    published.push(result);
  }

  return c.json({ status: "ok", count: published.length }, 200);
});

/** PUT /v1/code/sessions/:id/worker/state — Report worker state */
app.put("/:id/worker/state", acceptCliHeaders, sessionIngressAuth, async (c) => {
  const sessionId = c.req.param("id")!;
  const body = await c.req.json();

  if (body.status) {
    updateSessionStatus(sessionId, body.status);
  }

  return c.json({ status: "ok" }, 200);
});

/** PUT /v1/code/sessions/:id/worker/external_metadata — Report worker metadata (no-op) */
app.put("/:id/worker/external_metadata", acceptCliHeaders, sessionIngressAuth, async (c) => {
  // TUI's CCRClient calls this for metadata reporting. Accept and discard.
  return c.json({ status: "ok" }, 200);
});

/** POST /v1/code/sessions/:id/worker/events/:eventId/delivery — Delivery tracking (no-op) */
app.post("/:id/worker/events/:eventId/delivery", acceptCliHeaders, sessionIngressAuth, async (c) => {
  // TUI's CCRClient reports event delivery status (received/processing/processed).
  // Accept and discard — event bus doesn't track per-event delivery.
  return c.json({ status: "ok" }, 200);
});

export default app;
