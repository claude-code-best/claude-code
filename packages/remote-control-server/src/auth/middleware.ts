import type { Context, Next } from "hono";
import { validateApiKey } from "./api-key";
import { verifyWorkerJwt } from "./jwt";
import { resolveToken } from "./token";

/** Extract Bearer token from Authorization header or ?token= query param */
function extractBearerToken(c: Context): string | undefined {
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");
  return authHeader?.replace("Bearer ", "") || queryToken;
}

/**
 * Unified authentication middleware — supports two modes:
 *
 * 1. **Token mode** (Web UI): Bearer token resolved via server-side lookup → username injected
 * 2. **API Key mode** (CLI bridge): Valid API key + X-Username header → username injected
 */
export async function apiKeyAuth(c: Context, next: Next) {
  const token = extractBearerToken(c);

  // Try token authentication (Web UI)
  const tokenUsername = resolveToken(token);
  if (tokenUsername) {
    c.set("username", tokenUsername);
    await next();
    return;
  }

  // Try API Key authentication (CLI bridge)
  if (validateApiKey(token)) {
    // Extract username from X-Username header or ?username= query param
    const username = c.req.header("X-Username") || c.req.query("username");
    if (username) {
      c.set("username", username);
    }
    await next();
    return;
  }

  return c.json({ error: { type: "unauthorized", message: "Invalid or missing auth token" } }, 401);
}

/**
 * Session ingress authentication — accepts both API key and worker JWT.
 *
 * Used for SSE stream, CCR worker events, and WebSocket ingress endpoints.
 * On JWT validation, stores the decoded payload in c.set("jwtPayload") for
 * downstream handlers to inspect session_id if needed.
 */
export async function sessionIngressAuth(c: Context, next: Next) {
  const token = extractBearerToken(c);

  if (!token) {
    return c.json({ error: { type: "unauthorized", message: "Missing auth token" } }, 401);
  }

  // Try API key first (backward compatible)
  if (validateApiKey(token)) {
    await next();
    return;
  }

  // Try JWT verification — validate session_id matches route param
  const payload = verifyWorkerJwt(token);
  if (payload) {
    const routeSessionId = c.req.param("id") || c.req.param("sessionId");
    if (routeSessionId && payload.session_id !== routeSessionId) {
      return c.json({ error: { type: "forbidden", message: "JWT session_id does not match target session" } }, 403);
    }
    c.set("jwtPayload", payload);
    await next();
    return;
  }

  return c.json({ error: { type: "unauthorized", message: "Invalid API key or JWT" } }, 401);
}

/** Accept CLI headers but don't validate them */
export async function acceptCliHeaders(c: Context, next: Next) {
  await next();
}

/**
 * Extract UUID from request — query param ?uuid= or header X-UUID
 */
export function getUuidFromRequest(c: Context): string | undefined {
  return c.req.query("uuid") || c.req.header("X-UUID");
}

/**
 * UUID-based auth for Web UI routes (no-login mode).
 * Requires a UUID in query param or header, injects it into context as c.set("uuid").
 */
export async function uuidAuth(c: Context, next: Next) {
  const uuid = getUuidFromRequest(c);
  if (!uuid) {
    return c.json({ error: { type: "unauthorized", message: "Missing UUID" } }, 401);
  }
  c.set("uuid", uuid);
  await next();
}
