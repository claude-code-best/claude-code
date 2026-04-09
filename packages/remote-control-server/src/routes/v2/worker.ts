import { Hono } from "hono";
import { getSession, incrementEpoch } from "../../services/session";
import { apiKeyAuth, acceptCliHeaders } from "../../auth/middleware";

const app = new Hono();

/** POST /v1/code/sessions/:id/worker/register — Register worker */
app.post("/:id/worker/register", acceptCliHeaders, apiKeyAuth, async (c) => {
  const sessionId = c.req.param("id");
  const session = getSession(sessionId);
  if (!session) {
    return c.json({ error: { type: "not_found", message: "Session not found" } }, 404);
  }

  const epoch = incrementEpoch(sessionId);
  return c.json({ worker_epoch: epoch }, 200);
});

export default app;
