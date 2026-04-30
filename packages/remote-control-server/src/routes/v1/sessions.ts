import { log, error as logError } from "../../logger";
import { Hono } from "hono";
import {
  createSession,
  getSession,
  updateSessionTitle,
  archiveSession,
  resolveExistingSessionId,
} from "../../services/session";
import { createWorkItem } from "../../services/work-dispatch";
import { apiKeyAuth, acceptCliHeaders } from "../../auth/middleware";
import { publishSessionEvent } from "../../services/transport";

const app = new Hono();

/** POST /v1/sessions — Create session */
app.post("/", acceptCliHeaders, apiKeyAuth, async (c) => {
  const body = await c.req.json();
  const username = c.get("username");
  const session = createSession({ ...body, username });

  // Create work item if environment is specified
  if (body.environment_id) {
    try {
      await createWorkItem(body.environment_id, session.id);
    } catch (err) {
      logError(`[RCS] Failed to create work item: ${(err as Error).message}`);
    }
  }

  // Publish initial events if provided
  if (body.events && Array.isArray(body.events)) {
    for (const evt of body.events) {
      publishSessionEvent(session.id, evt.type || "init", evt, "outbound");
    }
  }

  return c.json(session, 200);
});

/** GET /v1/sessions/:id — Get session */
app.get("/:id", acceptCliHeaders, apiKeyAuth, async (c) => {
  const sessionId = resolveExistingSessionId(c.req.param("id")!) ?? c.req.param("id")!;
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  return c.json(session, 200);
});

/** PATCH /v1/sessions/:id — Update session title */
app.patch("/:id", acceptCliHeaders, apiKeyAuth, async (c) => {
  const sessionId = resolveExistingSessionId(c.req.param("id")!) ?? c.req.param("id")!;
  const existing = getSession(sessionId);
  if (!existing) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  const body = await c.req.json();
  if (body.title) {
    updateSessionTitle(sessionId, body.title);
  }
  const session = getSession(sessionId);
  return c.json(session, 200);
});

/** POST /v1/sessions/:id/archive — Archive session */
app.post("/:id/archive", acceptCliHeaders, apiKeyAuth, async (c) => {
  const sessionId = resolveExistingSessionId(c.req.param("id")!) ?? c.req.param("id")!;
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  try {
    archiveSession(sessionId);
  } catch {
    return c.json({ status: "ok" }, 409);
  }

  return c.json({ status: "ok" }, 200);
});

/** POST /v1/sessions/:id/events — Send event to session */
app.post("/:id/events", acceptCliHeaders, apiKeyAuth, async (c) => {
  const sessionId = resolveExistingSessionId(c.req.param("id")!) ?? c.req.param("id")!;
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  const body = await c.req.json();

  const events = body.events
    ? Array.isArray(body.events) ? body.events : [body.events]
    : Array.isArray(body) ? body : [body];
  const published = [];
  for (const evt of events) {
    const result = publishSessionEvent(sessionId, evt.type || "message", evt, "inbound");
    published.push(result);
  }

  return c.json({ status: "ok", events: published.length }, 200);
});

export default app;
