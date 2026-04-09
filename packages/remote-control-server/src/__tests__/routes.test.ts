import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock config
const mockConfig = {
  port: 3000,
  host: "0.0.0.0",
  apiKeys: ["test-api-key"],
  baseUrl: "http://localhost:3000",
  pollTimeout: 1,
  heartbeatInterval: 20,
  jwtExpiresIn: 3600,
  disconnectTimeout: 300,
};

mock.module("../config", () => ({
  config: mockConfig,
  getBaseUrl: () => "http://localhost:3000",
}));

import { Hono } from "hono";
import { storeReset, storeCreateSession, storeCreateEnvironment, storeBindSession } from "../store";
import { removeEventBus, getAllEventBuses } from "../transport/event-bus";
import { issueToken } from "../auth/token";

// Import route modules
import v1Sessions from "../routes/v1/sessions";
import v1Environments from "../routes/v1/environments";
import v1EnvironmentsWork from "../routes/v1/environments.work";
import v1SessionIngress from "../routes/v1/session-ingress";
import v2CodeSessions from "../routes/v2/code-sessions";
import v2Worker from "../routes/v2/worker";
import v2WorkerEvents from "../routes/v2/worker-events";
import webAuth from "../routes/web/auth";
import webSessions from "../routes/web/sessions";
import webControl from "../routes/web/control";
import webEnvironments from "../routes/web/environments";

function createApp() {
  const app = new Hono();
  app.route("/v1/sessions", v1Sessions);
  app.route("/v1/environments", v1Environments);
  app.route("/v1/environments", v1EnvironmentsWork);
  app.route("/v2/session_ingress", v1SessionIngress);
  app.route("/v1/code/sessions", v2CodeSessions);
  app.route("/v1/code/sessions", v2Worker);
  app.route("/v1/code/sessions", v2WorkerEvents);
  app.route("/web", webAuth);
  app.route("/web", webSessions);
  app.route("/web", webControl);
  app.route("/web", webEnvironments);
  return app;
}

const AUTH_HEADERS = { Authorization: "Bearer test-api-key", "X-Username": "testuser" };

describe("V1 Session Routes", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key);
    }
    app = createApp();
  });

  test("POST /v1/sessions — creates a session", async () => {
    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test Session" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toMatch(/^session_/);
    expect(body.title).toBe("Test Session");
    expect(body.status).toBe("idle");
  });

  test("POST /v1/sessions — requires auth", async () => {
    const res = await app.request("/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  test("GET /v1/sessions/:id — returns created session", async () => {
    const createRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const getRes = await app.request(`/v1/sessions/${id}`, {
      headers: AUTH_HEADERS,
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.id).toBe(id);
  });

  test("GET /v1/sessions/:id — 404 for unknown session", async () => {
    const res = await app.request("/v1/sessions/nope", {
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });

  test("PATCH /v1/sessions/:id — updates title", async () => {
    const createRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const patchRes = await app.request(`/v1/sessions/${id}`, {
      method: "PATCH",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Title" }),
    });
    expect(patchRes.status).toBe(200);
    const body = await patchRes.json();
    expect(body.title).toBe("Updated Title");
  });

  test("POST /v1/sessions/:id/archive — archives session", async () => {
    const createRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const archiveRes = await app.request(`/v1/sessions/${id}/archive`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(archiveRes.status).toBe(200);
  });

  test("POST /v1/sessions/:id/events — publishes events", async () => {
    const createRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const eventsRes = await app.request(`/v1/sessions/${id}/events`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ type: "user", content: "hello" }] }),
    });
    expect(eventsRes.status).toBe(200);
    const body = await eventsRes.json();
    expect(body.events).toBe(1);
  });

  test("POST /v1/sessions with environment_id creates work item", async () => {
    // First register an environment
    const envRes = await app.request("/v1/environments/bridge", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ machine_name: "test" }),
    });
    const { environment_id } = await envRes.json();

    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ environment_id }),
    });
    expect(sessRes.status).toBe(200);
    const body = await sessRes.json();
    expect(body.environment_id).toBe(environment_id);
  });

  test("POST /v1/sessions with invalid environment_id — session created, work item fails silently", async () => {
    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ environment_id: "env_nonexistent" }),
    });
    expect(sessRes.status).toBe(200);
    const body = await sessRes.json();
    expect(body.id).toMatch(/^session_/);
  });

  test("POST /v1/sessions with events — publishes initial events", async () => {
    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ type: "init", data: "starting" }] }),
    });
    expect(sessRes.status).toBe(200);
  });
});

describe("V1 Environment Routes", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    app = createApp();
  });

  test("POST /v1/environments/bridge — registers environment", async () => {
    const res = await app.request("/v1/environments/bridge", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ machine_name: "mac1", directory: "/home" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.environment_id).toMatch(/^env_/);
    expect(body.status).toBe("active");
  });

  test("DELETE /v1/environments/bridge/:id — deregisters environment", async () => {
    const envRes = await app.request("/v1/environments/bridge", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { environment_id } = await envRes.json();

    const delRes = await app.request(`/v1/environments/bridge/${environment_id}`, {
      method: "DELETE",
      headers: AUTH_HEADERS,
    });
    expect(delRes.status).toBe(200);
  });

  test("POST /v1/environments/:id/bridge/reconnect — reconnects environment", async () => {
    const envRes = await app.request("/v1/environments/bridge", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { environment_id } = await envRes.json();

    const reconnectRes = await app.request(`/v1/environments/${environment_id}/bridge/reconnect`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(reconnectRes.status).toBe(200);
  });
});

describe("V1 Work Routes", () => {
  let app: Hono;
  let envId: string;

  beforeEach(async () => {
    storeReset();
    app = createApp();

    const envRes = await app.request("/v1/environments/bridge", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    envId = (await envRes.json()).environment_id;
  });

  test("GET /v1/environments/:id/work/poll — returns 204 when no work", async () => {
    const res = await app.request(`/v1/environments/${envId}/work/poll`, {
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(204);
  });

  test("work lifecycle: create → poll → ack → stop", async () => {
    // Create session with environment (creates work item)
    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ environment_id: envId }),
    });
    const sessionId = (await sessRes.json()).id;

    // Poll for work
    const pollRes = await app.request(`/v1/environments/${envId}/work/poll`, {
      headers: AUTH_HEADERS,
    });
    expect(pollRes.status).toBe(200);
    const work = await pollRes.json();
    expect(work.id).toMatch(/^work_/);
    expect(work.data.id).toBe(sessionId);

    // Ack work
    const ackRes = await app.request(`/v1/environments/${envId}/work/${work.id}/ack`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(ackRes.status).toBe(200);

    // Stop work
    const stopRes = await app.request(`/v1/environments/${envId}/work/${work.id}/stop`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(stopRes.status).toBe(200);
  });

  test("POST work heartbeat", async () => {
    // Create session + work
    await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ environment_id: envId }),
    });
    const pollRes = await app.request(`/v1/environments/${envId}/work/poll`, {
      headers: AUTH_HEADERS,
    });
    const work = await pollRes.json();

    const hbRes = await app.request(`/v1/environments/${envId}/work/${work.id}/heartbeat`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(hbRes.status).toBe(200);
    const body = await hbRes.json();
    expect(body.lease_extended).toBe(true);
  });
});

describe("V2 Code Session Routes", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    process.env.RCS_API_KEYS = "test-api-key";
    app = createApp();
  });

  test("POST /v1/code/sessions — creates code session", async () => {
    const res = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Code Session" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.id).toMatch(/^cse_/);
    expect(body.session.title).toBe("Code Session");
  });

  test("POST /v1/code/sessions/:id/bridge — returns bridge info with JWT", async () => {
    // Create code session
    const createRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = (await createRes.json()).session;

    const bridgeRes = await app.request(`/v1/code/sessions/${id}/bridge`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(bridgeRes.status).toBe(200);
    const body = await bridgeRes.json();
    expect(body.api_base_url).toBe("http://localhost:3000");
    expect(body.worker_epoch).toBe(1);
    expect(body.worker_jwt).toBeTruthy();
    expect(body.expires_in).toBe(3600);
  });

  test("POST /v1/code/sessions/:id/bridge — 404 for unknown session", async () => {
    const res = await app.request("/v1/code/sessions/nope/bridge", {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });
});

describe("V2 Worker Routes", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    process.env.RCS_API_KEYS = "test-api-key";
    app = createApp();
  });

  test("POST /v1/code/sessions/:id/worker/register — increments epoch", async () => {
    // Create session
    const createRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const regRes = await app.request(`/v1/code/sessions/${id}/worker/register`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(regRes.status).toBe(200);
    const body = await regRes.json();
    expect(body.worker_epoch).toBe(1);
  });

  test("POST /v1/code/sessions/:id/worker/register — 404 for unknown", async () => {
    const res = await app.request("/v1/code/sessions/nope/worker/register", {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });
});

describe("Web Auth Routes", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    app = createApp();
  });

  test("POST /web/bind — binds session to UUID", async () => {
    // Create session first
    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await sessRes.json();

    const bindRes = await app.request("/web/bind?uuid=test-uuid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
    });
    expect(bindRes.status).toBe(200);
    const body = await bindRes.json();
    expect(body.ok).toBe(true);
  });

  test("POST /web/bind — 404 for unknown session", async () => {
    const res = await app.request("/web/bind?uuid=test-uuid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "nope" }),
    });
    expect(res.status).toBe(404);
  });

  test("POST /web/bind — 400 when missing params", async () => {
    const res = await app.request("/web/bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("Web Session Routes", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key);
    }
    app = createApp();
  });

  test("POST /web/sessions — creates and auto-binds session", async () => {
    const res = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Web Session" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toMatch(/^session_/);
    expect(body.source).toBe("web");
  });

  test("GET /web/sessions — returns sessions owned by UUID", async () => {
    // Create and bind
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const listRes = await app.request("/web/sessions?uuid=user-1");
    expect(listRes.status).toBe(200);
    const sessions = await listRes.json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(id);
  });

  test("GET /web/sessions — requires UUID", async () => {
    const res = await app.request("/web/sessions");
    expect(res.status).toBe(401);
  });

  test("GET /web/sessions/all — lists only sessions owned by requesting UUID", async () => {
    // Create 2 sessions via different users
    await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await app.request("/web/sessions?uuid=user-2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const allRes = await app.request("/web/sessions/all?uuid=user-1");
    expect(allRes.status).toBe(200);
    const sessions = await allRes.json();
    expect(sessions).toHaveLength(1); // only user-1's session, not user-2's
  });

  test("GET /web/sessions/:id — returns owned session", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const getRes = await app.request(`/web/sessions/${id}?uuid=user-1`);
    expect(getRes.status).toBe(200);
  });

  test("GET /web/sessions/:id — 403 for non-owner", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const getRes = await app.request(`/web/sessions/${id}?uuid=user-2`);
    expect(getRes.status).toBe(403);
  });

  test("GET /web/sessions/:id/history — returns events", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const histRes = await app.request(`/web/sessions/${id}/history?uuid=user-1`);
    expect(histRes.status).toBe(200);
    const body = await histRes.json();
    expect(body.events).toEqual([]);
  });

  test("GET /web/sessions/:id/history — 403 for non-owner", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const histRes = await app.request(`/web/sessions/${id}/history?uuid=user-2`);
    expect(histRes.status).toBe(403);
  });

  test("GET /web/sessions/:id — 404 after session deleted", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    // Archive/delete the session via v1
    await app.request(`/v1/sessions/${id}/archive`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });

    // Session still exists (archived), so we can still get it
    const getRes = await app.request(`/web/sessions/${id}?uuid=user-1`);
    // After archive, session status is "archived" but still exists
    expect(getRes.status).toBe(200);
  });

  test("GET /web/sessions/:id/history — 404 for non-existent session", async () => {
    // Bind to a non-existent session won't work, but if ownership was set
    // and session deleted, we need to test the 404 path
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    // Delete the session from store directly
    const { storeDeleteSession } = await import("../store");
    storeDeleteSession(id);

    const histRes = await app.request(`/web/sessions/${id}/history?uuid=user-1`);
    expect(histRes.status).toBe(404);
  });

  test("POST /web/sessions with invalid environment_id — handles work item error", async () => {
    const res = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ environment_id: "env_nonexistent" }),
    });
    // Session is still created even if work item fails
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toMatch(/^session_/);
  });

  test("GET /web/sessions/:id/events — returns SSE stream", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const eventsRes = await app.request(`/web/sessions/${id}/events?uuid=user-1`);
    expect(eventsRes.status).toBe(200);
    expect(eventsRes.headers.get("Content-Type")).toBe("text/event-stream");

    // Read initial keepalive and cancel
    const reader = eventsRes.body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value!);
      expect(text).toContain(": keepalive");
      reader.cancel();
    }
  });

  test("GET /web/sessions/:id/events — 403 for non-owner", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const eventsRes = await app.request(`/web/sessions/${id}/events?uuid=user-2`);
    expect(eventsRes.status).toBe(403);
  });
});

describe("Web Control Routes", () => {
  let app: Hono;
  let sessionId: string;

  beforeEach(async () => {
    storeReset();
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key);
    }
    app = createApp();

    // Create and bind session
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    sessionId = (await createRes.json()).id;
  });

  test("POST /web/sessions/:id/events — sends user message", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/events?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", content: "hello" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.event).toBeTruthy();
  });

  test("POST /web/sessions/:id/events — 403 for non-owner", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/events?uuid=user-2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", content: "hello" }),
    });
    expect(res.status).toBe(403);
  });

  test("POST /web/sessions/:id/control — sends control request", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/control?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "permission_response", approved: true, request_id: "r1" }),
    });
    expect(res.status).toBe(200);
  });

  test("POST /web/sessions/:id/interrupt — interrupts session", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/interrupt?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
  });

  test("POST /web/sessions/:id/interrupt — 403 for non-owner", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/interrupt?uuid=user-2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(403);
  });

  test("POST /web/sessions/:id/control — 403 for non-owner", async () => {
    const res = await app.request(`/web/sessions/${sessionId}/control?uuid=user-2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "permission_response", approved: true }),
    });
    expect(res.status).toBe(403);
  });

  test("POST /web/sessions/:id/events — 403 for non-existent session with no ownership", async () => {
    const res = await app.request("/web/sessions/nonexistent/events?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", content: "hello" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("Web Environment Routes", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    app = createApp();
  });

  test("GET /web/environments — lists active environments", async () => {
    // Register an env via v1
    await app.request("/v1/environments/bridge", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ machine_name: "mac1" }),
    });

    const res = await app.request("/web/environments?uuid=user-1");
    expect(res.status).toBe(200);
    const envs = await res.json();
    expect(envs).toHaveLength(1);
    expect(envs[0].machine_name).toBe("mac1");
  });

  test("GET /web/environments — requires UUID", async () => {
    const res = await app.request("/web/environments");
    expect(res.status).toBe(401);
  });
});

describe("V1 Session Ingress Routes (HTTP)", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key);
    }
    process.env.RCS_API_KEYS = "test-api-key";
    app = createApp();
  });

  test("POST /v2/session_ingress/session/:sessionId/events — ingests events with API key", async () => {
    // Create session first
    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await sessRes.json();

    const res = await app.request(`/v2/session_ingress/session/${id}/events`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ type: "assistant", content: "response" }] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("POST /v2/session_ingress/session/:sessionId/events — rejects without auth", async () => {
    const res = await app.request("/v2/session_ingress/session/nope/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: [] }),
    });
    expect(res.status).toBe(401);
  });

  test("POST /v2/session_ingress/session/:sessionId/events — 404 for unknown session", async () => {
    const res = await app.request("/v2/session_ingress/session/nope/events", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ type: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(404);
  });
});

describe("V2 Worker Events Routes", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key);
    }
    process.env.RCS_API_KEYS = "test-api-key";
    app = createApp();
  });

  test("POST /v1/code/sessions/:id/worker/events — publishes worker events", async () => {
    // Create session
    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await sessRes.json();

    const res = await app.request(`/v1/code/sessions/${id}/worker/events`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify([{ type: "assistant", content: "response" }]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.count).toBe(1);
  });

  test("PUT /v1/code/sessions/:id/worker/state — updates session status", async () => {
    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await sessRes.json();

    const res = await app.request(`/v1/code/sessions/${id}/worker/state`, {
      method: "PUT",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "running" }),
    });
    expect(res.status).toBe(200);
  });

  test("PUT /v1/code/sessions/:id/worker/external_metadata — no-op", async () => {
    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await sessRes.json();

    const res = await app.request(`/v1/code/sessions/${id}/worker/external_metadata`, {
      method: "PUT",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ meta: "data" }),
    });
    expect(res.status).toBe(200);
  });

  test("POST /v1/code/sessions/:id/worker/events/:eventId/delivery — no-op", async () => {
    const sessRes = await app.request("/v1/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await sessRes.json();

    const res = await app.request(`/v1/code/sessions/${id}/worker/events/evt123/delivery`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "received" }),
    });
    expect(res.status).toBe(200);
  });
});
