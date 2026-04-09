import { Hono } from "hono";
import { pollWork, ackWork, stopWork, heartbeatWork } from "../../services/work-dispatch";
import { apiKeyAuth, acceptCliHeaders } from "../../auth/middleware";
import { updatePollTime } from "../../services/environment";

const app = new Hono();

/** GET /v1/environments/:id/work/poll — Long-poll for work */
app.get("/:id/work/poll", acceptCliHeaders, apiKeyAuth, async (c) => {
  const envId = c.req.param("id");
  updatePollTime(envId);
  const result = await pollWork(envId);
  if (!result) {
    // Return 204 No Content so the client's axios parses it as null
    return c.body(null, 204);
  }
  return c.json(result, 200);
});

/** POST /v1/environments/:id/work/:workId/ack — Acknowledge work */
app.post("/:id/work/:workId/ack", acceptCliHeaders, apiKeyAuth, async (c) => {
  const workId = c.req.param("workId");
  ackWork(workId);
  return c.json({ status: "ok" }, 200);
});

/** POST /v1/environments/:id/work/:workId/stop — Stop work */
app.post("/:id/work/:workId/stop", acceptCliHeaders, apiKeyAuth, async (c) => {
  const workId = c.req.param("workId");
  stopWork(workId);
  return c.json({ status: "ok" }, 200);
});

/** POST /v1/environments/:id/work/:workId/heartbeat — Heartbeat */
app.post("/:id/work/:workId/heartbeat", acceptCliHeaders, apiKeyAuth, async (c) => {
  const workId = c.req.param("workId");
  const result = heartbeatWork(workId);
  return c.json(result, 200);
});

export default app;
