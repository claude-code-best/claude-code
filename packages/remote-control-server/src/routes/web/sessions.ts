import { Hono } from "hono";
import { uuidAuth } from "../../auth/middleware";
import { getSession, createSession } from "../../services/session";
import { storeListSessionsByOwnerUuid, storeIsSessionOwner, storeBindSession } from "../../store";
import { createWorkItem } from "../../services/work-dispatch";
import { listSessionSummariesByOwnerUuid } from "../../services/session";
import { createSSEStream } from "../../transport/sse-writer";
import { getEventBus } from "../../transport/event-bus";

const app = new Hono();

/** POST /web/sessions — Create a session from web UI */
app.post("/sessions", uuidAuth, async (c) => {
  const uuid = c.get("uuid")!;
  const body = await c.req.json();
  const session = createSession({
    environment_id: body.environment_id || null,
    title: body.title || "New Session",
    source: "web",
    permission_mode: body.permission_mode || "default",
  });

  // Auto-bind to creator's UUID
  storeBindSession(session.id, uuid);

  // Dispatch work to environment if specified
  if (body.environment_id) {
    try {
      await createWorkItem(body.environment_id, session.id);
    } catch (err) {
      console.error(`[RCS] Failed to create work item: ${(err as Error).message}`);
    }
  }

  return c.json(session, 200);
});

/** GET /web/sessions — List sessions owned by the requesting UUID */
app.get("/sessions", uuidAuth, async (c) => {
  const uuid = c.get("uuid")!;
  const sessions = storeListSessionsByOwnerUuid(uuid);
  return c.json(sessions, 200);
});

/** GET /web/sessions/all — List sessions owned by the requesting UUID (unowned sessions excluded) */
app.get("/sessions/all", uuidAuth, async (c) => {
  const uuid = c.get("uuid")!;
  const sessions = listSessionSummariesByOwnerUuid(uuid);
  return c.json(sessions, 200);
});

/** GET /web/sessions/:id — Session detail */
app.get("/sessions/:id", uuidAuth, async (c) => {
  const uuid = c.get("uuid")!;
  const sessionId = c.req.param("id")!;
  if (!storeIsSessionOwner(sessionId, uuid)) {
    return c.json({ error: { type: "forbidden", message: "Not your session" } }, 403);
  }
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  return c.json(session, 200);
});

/** GET /web/sessions/:id/history — Historical events for session */
app.get("/sessions/:id/history", uuidAuth, async (c) => {
  const uuid = c.get("uuid")!;
  const sessionId = c.req.param("id")!;
  if (!storeIsSessionOwner(sessionId, uuid)) {
    return c.json({ error: { type: "forbidden", message: "Not your session" } }, 403);
  }
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  const bus = getEventBus(sessionId);
  const events = bus.getEventsSince(0);
  return c.json({ events }, 200);
});

/** SSE /web/sessions/:id/events — Real-time event stream */
app.get("/sessions/:id/events", uuidAuth, async (c) => {
  const uuid = c.get("uuid")!;
  const sessionId = c.req.param("id")!;
  if (!storeIsSessionOwner(sessionId, uuid)) {
    return c.json({ error: { type: "forbidden", message: "Not your session" } }, 403);
  }
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  const lastEventId = c.req.header("Last-Event-ID");
  const fromSeqNum = lastEventId ? parseInt(lastEventId) : 0;
  return createSSEStream(c, sessionId, fromSeqNum);
});

export default app;
