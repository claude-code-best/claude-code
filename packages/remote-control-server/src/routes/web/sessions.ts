import { Hono } from "hono";
import { apiKeyAuth } from "../../auth/middleware";
import { listSessionSummariesByUsername, listSessionSummaries, getSession, createSession } from "../../services/session";
import { createWorkItem } from "../../services/work-dispatch";
import { createSSEStream } from "../../transport/sse-writer";

const app = new Hono();

/**
 * Check if a session belongs to the given user.
 * Sessions with null username are considered unowned and accessible by anyone.
 */
function ownsSession(session: { username: string | null }, username: string | undefined): boolean {
  if (!session.username) return true; // unowned session — anyone can access
  if (!username) return true; // user authenticated via API key without username — allow all
  return session.username === username;
}

/** POST /web/sessions — Create a session from web UI */
app.post("/sessions", apiKeyAuth, async (c) => {
  const username = c.get("username");
  const body = await c.req.json();
  const session = createSession({
    environment_id: body.environment_id || null,
    title: body.title || "New Session",
    source: "web",
    permission_mode: body.permission_mode || "default",
    username,
  });

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

/** GET /web/sessions — List sessions for current user */
app.get("/sessions", apiKeyAuth, async (c) => {
  const username = c.get("username");
  // If user has a username, filter by it; otherwise return all sessions
  const sessions = username
    ? listSessionSummariesByUsername(username)
    : listSessionSummaries();
  return c.json(sessions, 200);
});

/** GET /web/sessions/:id — Session detail */
app.get("/sessions/:id", apiKeyAuth, async (c) => {
  const username = c.get("username");
  const sessionId = c.req.param("id")!;
  const session = getSession(sessionId);
  if (!session || !ownsSession(session, username)) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }
  return c.json(session, 200);
});

/** SSE /web/sessions/:id/events — Real-time event stream */
app.get("/sessions/:id/events", apiKeyAuth, async (c) => {
  const username = c.get("username");
  const sessionId = c.req.param("id")!;
  const session = getSession(sessionId);
  if (!session || !ownsSession(session, username)) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  const lastEventId = c.req.header("Last-Event-ID");
  const fromSeqNum = lastEventId ? parseInt(lastEventId) : 0;
  return createSSEStream(c, sessionId, fromSeqNum);
});

export default app;
