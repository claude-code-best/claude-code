import type { Context, Next } from "hono";
import { validateApiKey } from "./api-key";
import { verifyWorkerJwt } from "./jwt";
import { resolveToken } from "./token";

const WS_AUTH_PROTOCOL_PREFIX = "rcs.auth.";

/** Encode a bearer token for WebSocket clients that cannot send auth headers. */
export function encodeWebSocketAuthProtocol(token: string): string {
  return `${WS_AUTH_PROTOCOL_PREFIX}${Buffer.from(token, "utf8").toString("base64url")}`;
}

function decodeWebSocketAuthProtocol(protocolHeader: string | undefined): string | undefined {
  if (!protocolHeader) {
    return undefined;
  }

  for (const protocol of protocolHeader.split(",")) {
    const trimmed = protocol.trim();
    if (!trimmed.startsWith(WS_AUTH_PROTOCOL_PREFIX)) {
      continue;
    }

    const encoded = trimmed.slice(WS_AUTH_PROTOCOL_PREFIX.length);
    if (!encoded) {
      return undefined;
    }

    try {
      const token = Buffer.from(encoded, "base64url").toString("utf8");
      return token.length > 0 ? token : undefined;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/** Extract a Bearer token from the Authorization header only. */
export function extractBearerToken(c: Context): string | undefined {
  const authHeader = c.req.header("Authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : undefined;
}

/** Extract auth for WebSocket upgrades without putting secrets in query strings. */
export function extractWebSocketAuthToken(c: Context): string | undefined {
  return extractBearerToken(c) ?? decodeWebSocketAuthProtocol(c.req.header("Sec-WebSocket-Protocol"));
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
  const token = extractWebSocketAuthToken(c);

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
 * Accepts UUID in query param/header, OR a valid API key via Authorization header.
 */
export async function uuidAuth(c: Context, next: Next) {
  // Try API key auth via Authorization header
  const bearer = extractBearerToken(c);
  if (bearer && validateApiKey(bearer)) {
    // Valid API key — generate a stable UUID from the key for downstream use
    const uuid = getUuidFromRequest(c);
    c.set("uuid", uuid || bearer);
    await next();
    return;
  }

  // Fall back to UUID auth
  const uuid = getUuidFromRequest(c);
  if (!uuid) {
    return c.json({ error: { type: "unauthorized", message: "Missing UUID" } }, 401);
  }
  c.set("uuid", uuid);
  await next();
}
