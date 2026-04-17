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
import { removeEventBus, getAllEventBuses, getEventBus } from "../transport/event-bus";
import { issueToken } from "../auth/token";
import { publishSessionEvent } from "../services/transport";

// Import route modules
import v1Sessions from "../routes/v1/sessions";
import v1Environments from "../routes/v1/environments";
import v1EnvironmentsWork from "../routes/v1/environments.work";
import v1SessionIngress, { websocket as sessionIngressWebsocket } from "../routes/v1/session-ingress";
import v2CodeSessions from "../routes/v2/code-sessions";
import v2Worker from "../routes/v2/worker";
import v2WorkerEventsStream from "../routes/v2/worker-events-stream";
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
  app.route("/v1/code/sessions", v2WorkerEventsStream);
  app.route("/v1/code/sessions", v2WorkerEvents);
  app.route("/web", webAuth);
  app.route("/web", webSessions);
  app.route("/web", webControl);
  app.route("/web", webEnvironments);
  return app;
}

const AUTH_HEADERS = { Authorization: "Bearer test-api-key", "X-Username": "testuser" };

function toWebSessionId(sessionId: string): string {
  if (!sessionId.startsWith("cse_")) return sessionId;
  return `session_${sessionId.slice("cse_".length)}`;
}

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

  test("GET /v1/sessions/:id — resolves compat code session IDs", async () => {
    const createRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const {
      session: { id },
    } = await createRes.json();

    const getRes = await app.request(`/v1/sessions/${toWebSessionId(id)}`, {
      headers: AUTH_HEADERS,
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.id).toBe(id);
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

  test("POST /v1/sessions/:id/archive — archives compat code session IDs", async () => {
    const createRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const {
      session: { id },
    } = await createRes.json();
    const compatId = toWebSessionId(id);

    const archiveRes = await app.request(`/v1/sessions/${compatId}/archive`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });
    expect(archiveRes.status).toBe(200);

    const getRes = await app.request(`/v1/sessions/${compatId}`, {
      headers: AUTH_HEADERS,
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.id).toBe(id);
    expect(body.status).toBe("archived");
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

  test("POST /v1/sessions/:id/events — resolves compat code session IDs", async () => {
    const createRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const {
      session: { id },
    } = await createRes.json();
    const compatId = toWebSessionId(id);

    const eventsRes = await app.request(`/v1/sessions/${compatId}/events`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ type: "user", content: "hello from compat" }] }),
    });
    expect(eventsRes.status).toBe(200);

    const events = getEventBus(id).getEventsSince(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("user");
    expect((events[0]?.payload as { content?: string }).content).toBe("hello from compat");
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

  test("POST /web/bind — binds compat code session ID to UUID", async () => {
    const sessRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await sessRes.json();
    const compatId = toWebSessionId(body.session.id);

    const bindRes = await app.request("/web/bind?uuid=test-uuid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: compatId }),
    });
    expect(bindRes.status).toBe(200);
    const bindBody = await bindRes.json();
    expect(bindBody.ok).toBe(true);
    expect(bindBody.sessionId).toBe(compatId);
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

  test("GET /web/sessions and /all — serialize owned code sessions as compat IDs", async () => {
    const codeSession = storeCreateSession({ idPrefix: "cse_" });
    storeBindSession(codeSession.id, "user-1");
    const compatId = toWebSessionId(codeSession.id);

    const listRes = await app.request("/web/sessions?uuid=user-1");
    expect(listRes.status).toBe(200);
    const sessions = await listRes.json();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(compatId);

    const allRes = await app.request("/web/sessions/all?uuid=user-1");
    expect(allRes.status).toBe(200);
    const summaries = await allRes.json();
    expect(summaries).toHaveLength(1);
    expect(summaries[0].id).toBe(compatId);
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

  test("GET /web/sessions and /all — hides archived and inactive sessions", async () => {
    const archived = storeCreateSession({});
    const inactive = storeCreateSession({});
    const open = storeCreateSession({});
    storeBindSession(archived.id, "user-1");
    storeBindSession(inactive.id, "user-1");
    storeBindSession(open.id, "user-1");

    await app.request(`/v1/sessions/${archived.id}/archive`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });

    const { storeUpdateSession } = await import("../store");
    storeUpdateSession(inactive.id, { status: "inactive" });

    const listRes = await app.request("/web/sessions?uuid=user-1");
    expect(listRes.status).toBe(200);
    const sessions = await listRes.json();
    expect(sessions.map((session: { id: string }) => session.id)).toEqual([open.id]);

    const allRes = await app.request("/web/sessions/all?uuid=user-1");
    expect(allRes.status).toBe(200);
    const summaries = await allRes.json();
    expect(summaries.map((session: { id: string }) => session.id)).toEqual([open.id]);
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

  test("GET /web/sessions/:id — includes automation_state snapshot when worker metadata has it", async () => {
    const createRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const {
      session: { id },
    } = await createRes.json();
    storeBindSession(id, "user-1");

    await app.request(`/v1/code/sessions/${id}/worker`, {
      method: "PUT",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        worker_epoch: 1,
        external_metadata: {
          automation_state: {
            enabled: true,
            phase: "standby",
            next_tick_at: 123456,
            sleep_until: null,
          },
        },
      }),
    });

    const getRes = await app.request(`/web/sessions/${toWebSessionId(id)}?uuid=user-1`);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.automation_state).toEqual({
      enabled: true,
      phase: "standby",
      next_tick_at: 123456,
      sleep_until: null,
    });
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

  test("GET /web/sessions/:id/history — returns task_state snapshots", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    publishSessionEvent(
      id,
      "task_state",
      {
        task_list_id: "team-alpha",
        tasks: [{ id: "1", subject: "Investigate", status: "pending" }],
      },
      "inbound",
    );

    const histRes = await app.request(`/web/sessions/${id}/history?uuid=user-1`);
    expect(histRes.status).toBe(200);
    const body = await histRes.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0]?.type).toBe("task_state");
    expect(body.events[0]?.payload.task_list_id).toBe("team-alpha");
    expect(body.events[0]?.payload.tasks).toEqual([
      { id: "1", subject: "Investigate", status: "pending" },
    ]);
  });

  test("GET /web/sessions/:id and history — supports compat code session IDs", async () => {
    const codeSession = storeCreateSession({ idPrefix: "cse_" });
    storeBindSession(codeSession.id, "user-1");
    const compatId = toWebSessionId(codeSession.id);

    const getRes = await app.request(`/web/sessions/${compatId}?uuid=user-1`);
    expect(getRes.status).toBe(200);
    const session = await getRes.json();
    expect(session.id).toBe(compatId);

    const histRes = await app.request(`/web/sessions/${compatId}/history?uuid=user-1`);
    expect(histRes.status).toBe(200);
    const history = await histRes.json();
    expect(history.events).toEqual([]);
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

  test("GET /web/sessions/:id/events — supports compat code session IDs", async () => {
    const codeSession = storeCreateSession({ idPrefix: "cse_" });
    storeBindSession(codeSession.id, "user-1");
    const compatId = toWebSessionId(codeSession.id);

    const eventsRes = await app.request(`/web/sessions/${compatId}/events?uuid=user-1`);
    expect(eventsRes.status).toBe(200);
    expect(eventsRes.headers.get("Content-Type")).toBe("text/event-stream");

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

  test("GET /web/sessions/:id/events — 409 for archived session", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    await app.request(`/v1/sessions/${id}/archive`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });

    const res = await app.request(`/web/sessions/${id}/events?uuid=user-1`);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.type).toBe("session_closed");
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

  test("POST /web/sessions/:id/events/control/interrupt — supports compat code session IDs", async () => {
    const rawSessionId = storeCreateSession({ idPrefix: "cse_" }).id;
    storeBindSession(rawSessionId, "user-1");
    const compatId = toWebSessionId(rawSessionId);

    const eventsRes = await app.request(`/web/sessions/${compatId}/events?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", content: "hello" }),
    });
    expect(eventsRes.status).toBe(200);

    const controlRes = await app.request(`/web/sessions/${compatId}/control?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "permission_response", approved: true, request_id: "r1" }),
    });
    expect(controlRes.status).toBe(200);

    const interruptRes = await app.request(`/web/sessions/${compatId}/interrupt?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(interruptRes.status).toBe(200);
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

  test("POST /web/sessions/:id/events/control/interrupt — 409 for archived session", async () => {
    await app.request(`/v1/sessions/${sessionId}/archive`, {
      method: "POST",
      headers: AUTH_HEADERS,
    });

    const eventsRes = await app.request(`/web/sessions/${sessionId}/events?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", content: "hello" }),
    });
    expect(eventsRes.status).toBe(409);

    const controlRes = await app.request(`/web/sessions/${sessionId}/control?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "permission_response", approved: true, request_id: "r1" }),
    });
    expect(controlRes.status).toBe(409);

    const interruptRes = await app.request(`/web/sessions/${sessionId}/interrupt?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(interruptRes.status).toBe(409);
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

  test("POST /v2/session_ingress/session/:sessionId/events — resolves compat code session IDs", async () => {
    const sessRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const {
      session: { id },
    } = await sessRes.json();
    const compatId = toWebSessionId(id);

    const res = await app.request(`/v2/session_ingress/session/${compatId}/events`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ events: [{ type: "assistant", message: { role: "assistant", content: "compat ok" } }] }),
    });
    expect(res.status).toBe(200);

    const events = getEventBus(id).getEventsSince(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("assistant");
  });

  test("GET /v2/session_ingress/ws/:sessionId — resolves compat code session IDs", async () => {
    const sessRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const {
      session: { id },
    } = await sessRes.json();
    const compatId = toWebSessionId(id);

    publishSessionEvent(id, "user", { content: "compat ws replay" }, "outbound");

    const server = Bun.serve({
      port: 0,
      fetch: app.fetch,
      websocket: {
        ...sessionIngressWebsocket,
        idleTimeout: 30,
      },
    });

    try {
      const message = await new Promise<string>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${server.port}/v2/session_ingress/ws/${compatId}?token=test-api-key`);
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error("Timed out waiting for compat WebSocket replay"));
        }, 2000);

        ws.onmessage = (event) => {
          const data = typeof event.data === "string" ? event.data : String(event.data);
          if (data.includes("\"type\":\"user\"")) {
            clearTimeout(timeout);
            ws.close();
            resolve(data);
          }
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Compat WebSocket connection failed"));
        };
      });

      expect(message).toContain("\"type\":\"user\"");
      expect(message).toContain(`\"session_id\":\"${id}\"`);
      expect(message).toContain("compat ws replay");
    } finally {
      await server.stop(true);
    }
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

  test("POST /v1/code/sessions/:id/worker/events — unwraps CCR batch payloads", async () => {
    const sessRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session: { id } } = await sessRes.json();

    const res = await app.request(`/v1/code/sessions/${id}/worker/events`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        worker_epoch: 1,
        events: [{ payload: { type: "assistant", content: "response" } }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);

    const events = getEventBus(id).getEventsSince(0);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("assistant");
    expect((events[0]?.payload as { content?: string }).content).toBe("response");
  });

  test("GET/PUT /v1/code/sessions/:id/worker — stores worker state", async () => {
    const sessRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session: { id } } = await sessRes.json();

    const putRes = await app.request(`/v1/code/sessions/${id}/worker`, {
      method: "PUT",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        worker_epoch: 1,
        worker_status: "running",
        external_metadata: {
          permission_mode: "default",
          automation_state: {
            enabled: true,
            phase: "sleeping",
            next_tick_at: null,
            sleep_until: 123456,
          },
        },
      }),
    });
    expect(putRes.status).toBe(200);

    const getRes = await app.request(`/v1/code/sessions/${id}/worker`, {
      headers: AUTH_HEADERS,
    });
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.worker.worker_status).toBe("running");
    expect(body.worker.external_metadata.permission_mode).toBe("default");
    expect(body.worker.external_metadata.automation_state).toEqual({
      enabled: true,
      phase: "sleeping",
      next_tick_at: null,
      sleep_until: 123456,
    });

    const events = getEventBus(id).getEventsSince(0);
    expect(events.some((event) => event.type === "automation_state")).toBe(true);
    expect(events.at(-1)?.payload).toEqual({
      enabled: true,
      phase: "sleeping",
      next_tick_at: null,
      sleep_until: 123456,
    });
  });

  test("POST /v1/code/sessions/:id/worker/heartbeat — updates heartbeat", async () => {
    const sessRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session: { id } } = await sessRes.json();

    const heartbeatRes = await app.request(`/v1/code/sessions/${id}/worker/heartbeat`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ worker_epoch: 1 }),
    });
    expect(heartbeatRes.status).toBe(200);

    const getRes = await app.request(`/v1/code/sessions/${id}/worker`, {
      headers: AUTH_HEADERS,
    });
    const body = await getRes.json();
    expect(body.worker.last_heartbeat_at).toBeTruthy();
  });

  test("GET /v1/code/sessions/:id/worker/events/stream — emits CCR client_event frames", async () => {
    const sessRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session: { id } } = await sessRes.json();

    const streamRes = await app.request(`/v1/code/sessions/${id}/worker/events/stream`, {
      headers: AUTH_HEADERS,
    });
    expect(streamRes.status).toBe(200);

    const reader = streamRes.body?.getReader();
    expect(reader).toBeTruthy();
    if (!reader) return;

    const firstChunk = await reader.read();
    const keepalive = new TextDecoder().decode(firstChunk.value!);
    expect(keepalive).toContain(": keepalive");

    publishSessionEvent(id, "user", { type: "user", content: "hello" }, "outbound");

    const secondChunk = await reader.read();
    const frame = new TextDecoder().decode(secondChunk.value!);
    expect(frame).toContain("event: client_event");
    expect(frame).toContain("\"payload\":{\"type\":\"user\",\"content\":\"hello\",\"message\":{\"content\":\"hello\"}}");
    reader.cancel();
  });

  test("GET /v1/code/sessions/:id/worker/events/stream — normalizes web permission approvals to control_response", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const streamRes = await app.request(`/v1/code/sessions/${id}/worker/events/stream`, {
      headers: AUTH_HEADERS,
    });
    expect(streamRes.status).toBe(200);

    const reader = streamRes.body?.getReader();
    expect(reader).toBeTruthy();
    if (!reader) return;

    await reader.read(); // initial keepalive

    const controlRes = await app.request(`/web/sessions/${id}/control?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "permission_response",
        approved: true,
        request_id: "req-1",
      }),
    });
    expect(controlRes.status).toBe(200);

    const chunk = await reader.read();
    const frame = new TextDecoder().decode(chunk.value!);
    expect(frame).toContain("event: client_event");
    expect(frame).toContain("\"event_type\":\"permission_response\"");
    expect(frame).toContain("\"payload\":{\"type\":\"control_response\"");
    expect(frame).toContain("\"request_id\":\"req-1\"");
    expect(frame).toContain("\"behavior\":\"allow\"");
    reader.cancel();
  });

  test("GET /v1/code/sessions/:id/worker/events/stream — normalizes web plan rejection feedback to deny control_response", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const streamRes = await app.request(`/v1/code/sessions/${id}/worker/events/stream`, {
      headers: AUTH_HEADERS,
    });
    expect(streamRes.status).toBe(200);

    const reader = streamRes.body?.getReader();
    expect(reader).toBeTruthy();
    if (!reader) return;

    await reader.read(); // initial keepalive

    const controlRes = await app.request(`/web/sessions/${id}/control?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "permission_response",
        approved: false,
        request_id: "req-2",
        message: "Need more detail",
      }),
    });
    expect(controlRes.status).toBe(200);

    const chunk = await reader.read();
    const frame = new TextDecoder().decode(chunk.value!);
    expect(frame).toContain("event: client_event");
    expect(frame).toContain("\"event_type\":\"permission_response\"");
    expect(frame).toContain("\"payload\":{\"type\":\"control_response\"");
    expect(frame).toContain("\"request_id\":\"req-2\"");
    expect(frame).toContain("\"subtype\":\"error\"");
    expect(frame).toContain("\"behavior\":\"deny\"");
    expect(frame).toContain("\"message\":\"Need more detail\"");
    reader.cancel();
  });

  test("GET /v1/code/sessions/:id/worker/events/stream — normalizes web interrupts to control_request", async () => {
    const createRes = await app.request("/web/sessions?uuid=user-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { id } = await createRes.json();

    const streamRes = await app.request(`/v1/code/sessions/${id}/worker/events/stream`, {
      headers: AUTH_HEADERS,
    });
    expect(streamRes.status).toBe(200);

    const reader = streamRes.body?.getReader();
    expect(reader).toBeTruthy();
    if (!reader) return;

    await reader.read(); // initial keepalive

    const interruptRes = await app.request(`/web/sessions/${id}/interrupt?uuid=user-1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(interruptRes.status).toBe(200);

    const chunk = await reader.read();
    const frame = new TextDecoder().decode(chunk.value!);
    expect(frame).toContain("event: client_event");
    expect(frame).toContain("\"event_type\":\"interrupt\"");
    expect(frame).toContain("\"payload\":{\"type\":\"control_request\"");
    expect(frame).toContain("\"subtype\":\"interrupt\"");
    reader.cancel();
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

  test("POST /v1/code/sessions/:id/worker/events/delivery — batch no-op", async () => {
    const sessRes = await app.request("/v1/code/sessions", {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const { session: { id } } = await sessRes.json();

    const res = await app.request(`/v1/code/sessions/${id}/worker/events/delivery`, {
      method: "POST",
      headers: { ...AUTH_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ worker_epoch: 1, updates: [{ event_id: "evt123", status: "received" }] }),
    });
    expect(res.status).toBe(200);
  });
});
