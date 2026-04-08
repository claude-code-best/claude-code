import { Hono } from "hono";
import { apiKeyAuth } from "../../auth/middleware";
import { listActiveEnvironmentsByUsername, listActiveEnvironmentsResponse } from "../../services/environment";

const app = new Hono();

/** GET /web/environments — List active environments for current user */
app.get("/environments", apiKeyAuth, async (c) => {
  const username = c.get("username");
  // If user has a username, filter by it; otherwise return all environments
  const envs = username
    ? listActiveEnvironmentsByUsername(username)
    : listActiveEnvironmentsResponse();
  return c.json(envs, 200);
});

export default app;
