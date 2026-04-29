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
  webCorsOrigins: ["https://dashboard.example"],
  wsIdleTimeout: 30,
  wsKeepaliveInterval: 20,
};

mock.module("../config", () => ({
  config: mockConfig,
  getBaseUrl: () => "http://localhost:3000",
}));

import { Hono } from "hono";
import { cors } from "hono/cors";
import { storeReset, storeCreateUser } from "../store";
import {
  apiKeyAuth,
  encodeWebSocketAuthProtocol,
  extractWebSocketAuthToken,
  sessionIngressAuth,
  uuidAuth,
  getUuidFromRequest,
} from "../auth/middleware";
import { issueToken } from "../auth/token";
import { generateWorkerJwt } from "../auth/jwt";
import {
  getAllowedWebCorsOrigins,
  resolveWebCorsOrigin,
  webCorsOptions,
} from "../auth/cors";

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

  app.get("/ws-auth-token", (c) => {
    return c.json({ token: extractWebSocketAuthToken(c) ?? null });
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

    test("rejects session token from query param", async () => {
      storeCreateUser("dave");
      const { token } = issueToken("dave");
      const res = await app.request(`/api-key-test?token=${token}`);
      expect(res.status).toBe(401);
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

    test("accepts API key from WebSocket protocol header", async () => {
      const res = await app.request("/ingress/ses_123", {
        headers: {
          "Sec-WebSocket-Protocol": encodeWebSocketAuthProtocol("test-api-key"),
        },
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

  describe("extractWebSocketAuthToken", () => {
    test("does not read tokens from query params", async () => {
      const res = await app.request("/ws-auth-token?token=test-api-key");
      const body = await res.json();
      expect(body.token).toBeNull();
    });

    test("reads tokens from WebSocket protocol header", async () => {
      const res = await app.request("/ws-auth-token", {
        headers: {
          "Sec-WebSocket-Protocol": encodeWebSocketAuthProtocol("test-api-key"),
        },
      });
      const body = await res.json();
      expect(body.token).toBe("test-api-key");
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

describe("Web CORS", () => {
  function createCorsApp() {
    const corsApp = new Hono();
    corsApp.use("/web/*", cors(webCorsOptions));
    corsApp.get("/web/ping", (c) => c.text("ok"));
    return corsApp;
  }

  test("allows configured origins plus local server origins", () => {
    expect(getAllowedWebCorsOrigins()).toContain("https://dashboard.example");
    expect(getAllowedWebCorsOrigins()).toContain("http://localhost:3000");
    expect(getAllowedWebCorsOrigins()).toContain("http://127.0.0.1:3000");
    expect(resolveWebCorsOrigin("https://dashboard.example")).toBe(
      "https://dashboard.example",
    );
  });

  test("rejects unknown origins by default", () => {
    expect(resolveWebCorsOrigin("https://attacker.example")).toBeUndefined();
  });

  test("does not emit CORS allow-origin for unknown web origins", async () => {
    const res = await createCorsApp().request("/web/ping", {
      headers: { Origin: "https://attacker.example" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  test("emits CORS allow-origin for configured web origins", async () => {
    const res = await createCorsApp().request("/web/ping", {
      headers: { Origin: "https://dashboard.example" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://dashboard.example",
    );
  });
});
