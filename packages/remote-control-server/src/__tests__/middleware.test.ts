import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";

// Mock config before imports
const mockConfig = {
  port: 3000,
  host: "0.0.0.0",
  apiKeys: ["test-api-key"],
  baseUrl: "http://localhost:3000",
  pollTimeout: 8,
  heartbeatInterval: 20,
  jwtExpiresIn: 3600,
  disconnectTimeout: 300,
};

mock.module("../config", () => ({
  config: mockConfig,
  getBaseUrl: () => "http://localhost:3000",
}));

import { Hono } from "hono";
import { storeReset, storeCreateUser } from "../store";
import { apiKeyAuth, sessionIngressAuth, uuidAuth, getUuidFromRequest } from "../auth/middleware";
import { issueToken } from "../auth/token";
import { generateWorkerJwt } from "../auth/jwt";

// Helper: create a test app with middleware and a simple handler
function createTestApp() {
  const app = new Hono();

  // Test route for apiKeyAuth
  app.get("/api-key-test", apiKeyAuth, (c) => {
    return c.json({ username: c.get("username") || null });
  });

  // Test route for sessionIngressAuth
  app.get("/ingress/:id", sessionIngressAuth, (c) => {
    return c.json({ ok: true, jwtPayload: c.get("jwtPayload") || null });
  });

  // Test route for uuidAuth
  app.get("/uuid-test", uuidAuth, (c) => {
    return c.json({ uuid: c.get("uuid") });
  });

  // Test route for getUuidFromRequest
  app.get("/uuid-extract", (c) => {
    return c.json({ uuid: getUuidFromRequest(c) });
  });

  return app;
}

describe("Auth Middleware", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    app = createTestApp();
  });

  describe("apiKeyAuth", () => {
    test("accepts valid API key with username header", async () => {
      const res = await app.request("/api-key-test", {
        headers: {
          Authorization: "Bearer test-api-key",
          "X-Username": "alice",
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe("alice");
    });

    test("accepts valid API key with username query param", async () => {
      const res = await app.request("/api-key-test?username=bob", {
        headers: { Authorization: "Bearer test-api-key" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe("bob");
    });

    test("accepts valid session token", async () => {
      storeCreateUser("charlie");
      const { token } = issueToken("charlie");
      const res = await app.request("/api-key-test", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe("charlie");
    });

    test("rejects invalid token", async () => {
      const res = await app.request("/api-key-test", {
        headers: { Authorization: "Bearer wrong-key" },
      });
      expect(res.status).toBe(401);
    });

    test("rejects missing token", async () => {
      const res = await app.request("/api-key-test");
      expect(res.status).toBe(401);
    });

    test("accepts token from query param", async () => {
      storeCreateUser("dave");
      const { token } = issueToken("dave");
      const res = await app.request(`/api-key-test?token=${token}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe("dave");
    });
  });

  describe("sessionIngressAuth", () => {
    const originalKeys = process.env.RCS_API_KEYS;
    beforeEach(() => {
      process.env.RCS_API_KEYS = "test-api-key";
    });
    afterAll(() => {
      process.env.RCS_API_KEYS = originalKeys;
    });

    test("accepts valid API key", async () => {
      const res = await app.request("/ingress/ses_123", {
        headers: { Authorization: "Bearer test-api-key" },
      });
      expect(res.status).toBe(200);
    });

    test("accepts valid JWT with matching session_id", async () => {
      const jwt = generateWorkerJwt("ses_123", 3600);
      const res = await app.request("/ingress/ses_123", {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.jwtPayload).not.toBeNull();
      expect(body.jwtPayload.session_id).toBe("ses_123");
    });

    test("rejects JWT with mismatched session_id", async () => {
      const jwt = generateWorkerJwt("ses_456", 3600);
      const res = await app.request("/ingress/ses_123", {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      expect(res.status).toBe(403);
    });

    test("rejects missing token", async () => {
      const res = await app.request("/ingress/ses_123");
      expect(res.status).toBe(401);
    });

    test("rejects invalid token", async () => {
      const res = await app.request("/ingress/ses_123", {
        headers: { Authorization: "Bearer invalid" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("uuidAuth", () => {
    test("accepts UUID from query param", async () => {
      const res = await app.request("/uuid-test?uuid=test-uuid-1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uuid).toBe("test-uuid-1");
    });

    test("accepts UUID from header", async () => {
      const res = await app.request("/uuid-test", {
        headers: { "X-UUID": "test-uuid-2" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uuid).toBe("test-uuid-2");
    });

    test("rejects missing UUID", async () => {
      const res = await app.request("/uuid-test");
      expect(res.status).toBe(401);
    });
  });

  describe("getUuidFromRequest", () => {
    test("extracts from query param", async () => {
      const res = await app.request("/uuid-extract?uuid=from-query");
      const body = await res.json();
      expect(body.uuid).toBe("from-query");
    });

    test("extracts from header", async () => {
      const res = await app.request("/uuid-extract", {
        headers: { "X-UUID": "from-header" },
      });
      const body = await res.json();
      expect(body.uuid).toBe("from-header");
    });

    test("returns undefined when no UUID", async () => {
      const res = await app.request("/uuid-extract");
      const body = await res.json();
      expect(body.uuid).toBeUndefined();
    });
  });
});
