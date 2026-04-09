import { Hono } from "hono";
import { storeGetSession, storeBindSession } from "../../store";

const app = new Hono();

/** POST /web/bind — Bind a session to a UUID (no-login auth) */
app.post("/bind", async (c) => {
  const body = await c.req.json();
  const sessionId = body.sessionId;
  // UUID can come from query param (api.js sends it in URL) or body
  const uuid = c.req.query("uuid") || body.uuid;

  if (!sessionId || !uuid) {
    return c.json({ error: "sessionId and uuid are required" }, 400);
  }

  const session = storeGetSession(sessionId);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  storeBindSession(sessionId, uuid);
  return c.json({ ok: true, sessionId });
});

export default app;
