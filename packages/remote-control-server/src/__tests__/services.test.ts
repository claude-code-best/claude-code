import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock config before importing modules
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

import { storeReset, storeCreateEnvironment } from "../store";
import {
  createSession,
  createCodeSession,
  getSession,
  updateSessionTitle,
  updateSessionStatus,
  archiveSession,
  incrementEpoch,
  listSessions,
  listSessionSummaries,
  listSessionSummariesByUsername,
  listSessionsByEnvironment,
} from "../services/session";
import {
  registerEnvironment,
  deregisterEnvironment,
  getEnvironment,
  updatePollTime,
  listActiveEnvironments,
  listActiveEnvironmentsResponse,
  listActiveEnvironmentsByUsername,
  reconnectEnvironment,
} from "../services/environment";
import { normalizePayload, publishSessionEvent } from "../services/transport";
import { getEventBus, removeEventBus, getAllEventBuses } from "../transport/event-bus";

// ---------- Session Service ----------

describe("Session Service", () => {
  beforeEach(() => {
    storeReset();
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key);
    }
  });

  describe("createSession", () => {
    test("creates a session with defaults", () => {
      const resp = createSession({});
      expect(resp.id).toMatch(/^session_/);
      expect(resp.status).toBe("idle");
      expect(resp.source).toBe("remote-control");
      expect(resp.environment_id).toBeNull();
      expect(resp.worker_epoch).toBe(0);
      expect(resp.created_at).toBeGreaterThan(0);
    });

    test("creates a session with all options", () => {
      const env = storeCreateEnvironment({ secret: "s" });
      const resp = createSession({
        environment_id: env.id,
        title: "My Session",
        source: "cli",
        permission_mode: "auto",
      });
      expect(resp.environment_id).toBe(env.id);
      expect(resp.title).toBe("My Session");
      expect(resp.source).toBe("cli");
      expect(resp.permission_mode).toBe("auto");
    });

    test("creates session with username", () => {
      const resp = createSession({ username: "alice" });
      expect(resp.username).toBe("alice");
    });
  });

  describe("createCodeSession", () => {
    test("creates a code session with cse_ prefix", () => {
      const resp = createCodeSession({});
      expect(resp.id).toMatch(/^cse_/);
    });
  });

  describe("getSession", () => {
    test("returns null for non-existent session", () => {
      expect(getSession("nope")).toBeNull();
    });

    test("returns created session", () => {
      const created = createSession({});
      const fetched = getSession(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
    });
  });

  describe("updateSessionTitle", () => {
    test("updates title", () => {
      const s = createSession({});
      updateSessionTitle(s.id, "New Title");
      expect(getSession(s.id)?.title).toBe("New Title");
    });
  });

  describe("updateSessionStatus", () => {
    test("updates status", () => {
      const s = createSession({});
      updateSessionStatus(s.id, "active");
      expect(getSession(s.id)?.status).toBe("active");
    });
  });

  describe("archiveSession", () => {
    test("sets status to archived and removes event bus", () => {
      const s = createSession({});
      // Create event bus for this session
      getEventBus(s.id);
      archiveSession(s.id);
      expect(getSession(s.id)?.status).toBe("archived");
      expect(getAllEventBuses().has(s.id)).toBe(false);
    });
  });

  describe("incrementEpoch", () => {
    test("increments epoch by 1", () => {
      const s = createSession({});
      expect(incrementEpoch(s.id)).toBe(1);
      expect(incrementEpoch(s.id)).toBe(2);
      expect(getSession(s.id)?.worker_epoch).toBe(2);
    });

    test("throws for non-existent session", () => {
      expect(() => incrementEpoch("nope")).toThrow("Session not found");
    });
  });

  describe("listSessions", () => {
    test("returns all sessions", () => {
      createSession({});
      createSession({});
      expect(listSessions()).toHaveLength(2);
    });
  });

  describe("listSessionSummaries", () => {
    test("returns summaries with correct fields", () => {
      createSession({ title: "Test" });
      const summaries = listSessionSummaries();
      expect(summaries).toHaveLength(1);
      expect(summaries[0].title).toBe("Test");
      expect(summaries[0].updated_at).toBeGreaterThan(0);
      // Summary should not have environment_id
      expect("environment_id" in summaries[0]).toBe(false);
    });
  });

  describe("listSessionSummariesByUsername", () => {
    test("filters by username", () => {
      createSession({ username: "alice" });
      createSession({ username: "bob" });
      expect(listSessionSummariesByUsername("alice")).toHaveLength(1);
    });
  });

  describe("listSessionsByEnvironment", () => {
    test("filters by environment", () => {
      const env = storeCreateEnvironment({ secret: "s" });
      createSession({ environment_id: env.id });
      createSession({});
      expect(listSessionsByEnvironment(env.id)).toHaveLength(1);
    });
  });
});

// ---------- Environment Service ----------

describe("Environment Service", () => {
  beforeEach(() => {
    storeReset();
  });

  describe("registerEnvironment", () => {
    test("registers environment with defaults", () => {
      const result = registerEnvironment({});
      expect(result.environment_id).toMatch(/^env_/);
      expect(result.environment_secret).toBe("test-api-key");
      expect(result.status).toBe("active");
    });

    test("registers with options", () => {
      const result = registerEnvironment({
        machine_name: "mac1",
        directory: "/home/user",
        branch: "main",
        git_repo_url: "https://github.com/test/repo",
        max_sessions: 5,
        worker_type: "custom",
      });
      const env = getEnvironment(result.environment_id);
      expect(env?.machineName).toBe("mac1");
      expect(env?.directory).toBe("/home/user");
      expect(env?.maxSessions).toBe(5);
    });

    test("registers with username", () => {
      const result = registerEnvironment({ username: "alice" });
      const env = getEnvironment(result.environment_id);
      expect(env?.username).toBe("alice");
    });
  });

  describe("deregisterEnvironment", () => {
    test("sets status to deregistered", () => {
      const result = registerEnvironment({});
      deregisterEnvironment(result.environment_id);
      const env = getEnvironment(result.environment_id);
      expect(env?.status).toBe("deregistered");
    });
  });

  describe("updatePollTime", () => {
    test("updates lastPollAt", () => {
      const result = registerEnvironment({});
      const before = getEnvironment(result.environment_id)?.lastPollAt;
      // Small delay to ensure time difference
      updatePollTime(result.environment_id);
      const after = getEnvironment(result.environment_id)?.lastPollAt;
      expect(after!.getTime()).toBeGreaterThanOrEqual(before!.getTime());
    });
  });

  describe("listActiveEnvironments", () => {
    test("returns active environments", () => {
      registerEnvironment({});
      registerEnvironment({});
      expect(listActiveEnvironments()).toHaveLength(2);
    });
  });

  describe("listActiveEnvironmentsResponse", () => {
    test("returns response format", () => {
      registerEnvironment({ machine_name: "mac1" });
      const envs = listActiveEnvironmentsResponse();
      expect(envs).toHaveLength(1);
      expect(envs[0].machine_name).toBe("mac1");
      expect(envs[0].last_poll_at).toBeGreaterThan(0);
    });
  });

  describe("listActiveEnvironmentsByUsername", () => {
    test("filters by username", () => {
      registerEnvironment({ username: "alice" });
      registerEnvironment({ username: "bob" });
      expect(listActiveEnvironmentsByUsername("alice")).toHaveLength(1);
    });
  });

  describe("reconnectEnvironment", () => {
    test("sets status back to active", () => {
      const result = registerEnvironment({});
      deregisterEnvironment(result.environment_id);
      expect(getEnvironment(result.environment_id)?.status).toBe("deregistered");
      reconnectEnvironment(result.environment_id);
      expect(getEnvironment(result.environment_id)?.status).toBe("active");
    });
  });
});

// ---------- Transport Service ----------

describe("Transport Service", () => {
  beforeEach(() => {
    storeReset();
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key);
    }
  });

  describe("normalizePayload", () => {
    test("handles string payload", () => {
      const result = normalizePayload("user", "hello world");
      expect(result.content).toBe("hello world");
      expect(result.raw).toBe("hello world");
    });

    test("handles null payload", () => {
      const result = normalizePayload("user", null);
      expect(result.content).toBe("");
      expect(result.raw).toBeNull();
    });

    test("handles object with direct content", () => {
      const result = normalizePayload("user", { content: "direct text" });
      expect(result.content).toBe("direct text");
    });

    test("handles object with message.content string", () => {
      const result = normalizePayload("assistant", { message: { role: "assistant", content: "reply" } });
      expect(result.content).toBe("reply");
    });

    test("handles object with message.content array", () => {
      const result = normalizePayload("assistant", {
        message: {
          content: [
            { type: "text", text: "hello " },
            { type: "text", text: "world" },
          ],
        },
      });
      expect(result.content).toBe("hello world");
    });

    test("preserves tool fields", () => {
      const result = normalizePayload("tool_use", { tool_name: "Bash", tool_input: { cmd: "ls" } });
      expect(result.tool_name).toBe("Bash");
      expect(result.tool_input).toEqual({ cmd: "ls" });
    });

    test("preserves permission fields", () => {
      const result = normalizePayload("permission", {
        request_id: "req_1",
        approved: true,
        updated_input: { cmd: "ls -la" },
      });
      expect(result.request_id).toBe("req_1");
      expect(result.approved).toBe(true);
      expect(result.updated_input).toEqual({ cmd: "ls -la" });
    });

    test("preserves message field", () => {
      const msg = { role: "user", content: "hi" };
      const result = normalizePayload("user", { message: msg });
      expect(result.message).toEqual(msg);
    });

    test("uses name as tool_name fallback", () => {
      const result = normalizePayload("tool", { name: "Read" });
      expect(result.tool_name).toBe("Read");
    });

    test("uses input as tool_input fallback", () => {
      const result = normalizePayload("tool", { input: { path: "/tmp" } });
      expect(result.tool_input).toEqual({ path: "/tmp" });
    });

    test("handles empty content array", () => {
      const result = normalizePayload("assistant", {
        message: { content: [] },
      });
      expect(result.content).toBe("");
    });

    test("handles undefined payload", () => {
      const result = normalizePayload("user", undefined);
      expect(result.content).toBe("");
    });
  });

  describe("publishSessionEvent", () => {
    test("publishes event to session bus", () => {
      const event = publishSessionEvent("s1", "user", { content: "hello" }, "outbound");
      expect(event.type).toBe("user");
      expect(event.direction).toBe("outbound");
      expect(event.sessionId).toBe("s1");
      expect(event.seqNum).toBe(1);
    });

    test("normalizes payload before publishing", () => {
      const event = publishSessionEvent("s1", "assistant", { message: { content: "reply" } }, "inbound");
      const payload = event.payload as Record<string, unknown>;
      expect(payload.content).toBe("reply");
    });
  });
});
