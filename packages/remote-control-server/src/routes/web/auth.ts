import { Hono } from "hono";
import { validateApiKey } from "../../auth/api-key";
import { issueToken } from "../../auth/token";
import { storeCreateUser } from "../../store";

const app = new Hono();

/** POST /web/auth/login — Verify API key + username, return random token */
app.post("/auth/login", async (c) => {
  const body = await c.req.json();
  const apiKey = body.apiKey;
  const username = body.username;

  if (!apiKey || !validateApiKey(apiKey)) {
    return c.json({ error: { type: "unauthorized", message: "Invalid API key" } }, 401);
  }

  if (!username || !username.trim()) {
    return c.json({ error: { type: "bad_request", message: "Username is required" } }, 400);
  }

  const name = username.trim().slice(0, 32);

  // Auto-register user if not exists
  storeCreateUser(name);

  // Issue a random token
  const result = issueToken(name);
  return c.json(result, 200);
});

export default app;
