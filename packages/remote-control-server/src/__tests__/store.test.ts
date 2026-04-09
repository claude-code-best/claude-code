import { describe, test, expect, beforeEach } from "bun:test";
import {
  storeReset,
  storeCreateUser,
  storeGetUser,
  storeCreateToken,
  storeGetUserByToken,
  storeDeleteToken,
  storeCreateEnvironment,
  storeGetEnvironment,
  storeUpdateEnvironment,
  storeListActiveEnvironments,
  storeListActiveEnvironmentsByUsername,
  storeCreateSession,
  storeGetSession,
  storeUpdateSession,
  storeListSessions,
  storeListSessionsByUsername,
  storeListSessionsByEnvironment,
  storeDeleteSession,
  storeBindSession,
  storeIsSessionOwner,
  storeListSessionsByOwnerUuid,
  storeCreateWorkItem,
  storeGetWorkItem,
  storeGetPendingWorkItem,
  storeUpdateWorkItem,
} from "../store";

describe("store", () => {
  beforeEach(() => {
    storeReset();
  });

  // ---------- User ----------

  describe("storeCreateUser", () => {
    test("creates a new user", () => {
      const user = storeCreateUser("alice");
      expect(user.username).toBe("alice");
      expect(user.createdAt).toBeInstanceOf(Date);
    });

    test("returns existing user on duplicate create", () => {
      const first = storeCreateUser("bob");
      const second = storeCreateUser("bob");
      expect(first).toBe(second);
    });
  });

  describe("storeGetUser", () => {
    test("returns undefined for non-existent user", () => {
      expect(storeGetUser("nobody")).toBeUndefined();
    });

    test("returns created user", () => {
      storeCreateUser("charlie");
      const user = storeGetUser("charlie");
      expect(user?.username).toBe("charlie");
    });
  });

  // ---------- Token ----------

  describe("storeCreateToken / storeGetUserByToken", () => {
    test("creates and resolves token", () => {
      storeCreateUser("dave");
      storeCreateToken("dave", "tk_123");
      const entry = storeGetUserByToken("tk_123");
      expect(entry?.username).toBe("dave");
      expect(entry?.createdAt).toBeInstanceOf(Date);
    });

    test("returns undefined for unknown token", () => {
      expect(storeGetUserByToken("nonexistent")).toBeUndefined();
    });
  });

  describe("storeDeleteToken", () => {
    test("deletes an existing token", () => {
      storeCreateUser("eve");
      storeCreateToken("eve", "tk_del");
      expect(storeDeleteToken("tk_del")).toBe(true);
      expect(storeGetUserByToken("tk_del")).toBeUndefined();
    });

    test("returns false for non-existent token", () => {
      expect(storeDeleteToken("nope")).toBe(false);
    });
  });

  // ---------- Environment ----------

  describe("storeCreateEnvironment", () => {
    test("creates environment with defaults", () => {
      const env = storeCreateEnvironment({ secret: "s1" });
      expect(env.id).toMatch(/^env_/);
      expect(env.secret).toBe("s1");
      expect(env.status).toBe("active");
      expect(env.machineName).toBeNull();
      expect(env.maxSessions).toBe(1);
      expect(env.workerType).toBe("claude_code");
      expect(env.lastPollAt).toBeInstanceOf(Date);
    });

    test("creates environment with all options", () => {
      const env = storeCreateEnvironment({
        secret: "s2",
        machineName: "mac1",
        directory: "/home/user",
        branch: "main",
        gitRepoUrl: "https://github.com/test/repo",
        maxSessions: 5,
        workerType: "custom",
        bridgeId: "bridge1",
        username: "alice",
      });
      expect(env.machineName).toBe("mac1");
      expect(env.directory).toBe("/home/user");
      expect(env.branch).toBe("main");
      expect(env.gitRepoUrl).toBe("https://github.com/test/repo");
      expect(env.maxSessions).toBe(5);
      expect(env.workerType).toBe("custom");
      expect(env.bridgeId).toBe("bridge1");
      expect(env.username).toBe("alice");
    });
  });

  describe("storeGetEnvironment", () => {
    test("returns undefined for non-existent env", () => {
      expect(storeGetEnvironment("env_no")).toBeUndefined();
    });

    test("returns created environment", () => {
      const env = storeCreateEnvironment({ secret: "s" });
      expect(storeGetEnvironment(env.id)).toBe(env);
    });
  });

  describe("storeUpdateEnvironment", () => {
    test("updates existing environment", () => {
      const env = storeCreateEnvironment({ secret: "s" });
      const result = storeUpdateEnvironment(env.id, { status: "disconnected" });
      expect(result).toBe(true);
      const updated = storeGetEnvironment(env.id);
      expect(updated?.status).toBe("disconnected");
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(env.updatedAt.getTime());
    });

    test("returns false for non-existent environment", () => {
      expect(storeUpdateEnvironment("env_no", { status: "active" })).toBe(false);
    });
  });

  describe("storeListActiveEnvironments", () => {
    test("returns only active environments", () => {
      const env1 = storeCreateEnvironment({ secret: "s1" });
      const env2 = storeCreateEnvironment({ secret: "s2" });
      storeUpdateEnvironment(env1.id, { status: "deregistered" });
      const active = storeListActiveEnvironments();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(env2.id);
    });
  });

  describe("storeListActiveEnvironmentsByUsername", () => {
    test("filters by username", () => {
      storeCreateEnvironment({ secret: "s1", username: "alice" });
      storeCreateEnvironment({ secret: "s2", username: "bob" });
      const aliceEnvs = storeListActiveEnvironmentsByUsername("alice");
      expect(aliceEnvs).toHaveLength(1);
      expect(aliceEnvs[0].username).toBe("alice");
    });
  });

  // ---------- Session ----------

  describe("storeCreateSession", () => {
    test("creates session with defaults", () => {
      const session = storeCreateSession({});
      expect(session.id).toMatch(/^session_/);
      expect(session.status).toBe("idle");
      expect(session.source).toBe("remote-control");
      expect(session.environmentId).toBeNull();
      expect(session.workerEpoch).toBe(0);
    });

    test("creates session with options", () => {
      const env = storeCreateEnvironment({ secret: "s" });
      const session = storeCreateSession({
        environmentId: env.id,
        title: "Test Session",
        source: "cli",
        permissionMode: "auto",
        username: "alice",
      });
      expect(session.environmentId).toBe(env.id);
      expect(session.title).toBe("Test Session");
      expect(session.source).toBe("cli");
      expect(session.permissionMode).toBe("auto");
      expect(session.username).toBe("alice");
    });

    test("creates session with custom idPrefix", () => {
      const session = storeCreateSession({ idPrefix: "cse_" });
      expect(session.id).toMatch(/^cse_/);
    });
  });

  describe("storeGetSession", () => {
    test("returns undefined for non-existent session", () => {
      expect(storeGetSession("nope")).toBeUndefined();
    });
  });

  describe("storeUpdateSession", () => {
    test("updates existing session", () => {
      const session = storeCreateSession({});
      const result = storeUpdateSession(session.id, { title: "Updated", status: "active" });
      expect(result).toBe(true);
      const updated = storeGetSession(session.id);
      expect(updated?.title).toBe("Updated");
      expect(updated?.status).toBe("active");
    });

    test("returns false for non-existent session", () => {
      expect(storeUpdateSession("nope", { title: "x" })).toBe(false);
    });

    test("increments workerEpoch", () => {
      const session = storeCreateSession({});
      storeUpdateSession(session.id, { workerEpoch: 1 });
      expect(storeGetSession(session.id)?.workerEpoch).toBe(1);
    });
  });

  describe("storeListSessions", () => {
    test("returns all sessions", () => {
      storeCreateSession({});
      storeCreateSession({});
      expect(storeListSessions()).toHaveLength(2);
    });
  });

  describe("storeListSessionsByUsername", () => {
    test("filters by username", () => {
      storeCreateSession({ username: "alice" });
      storeCreateSession({ username: "bob" });
      expect(storeListSessionsByUsername("alice")).toHaveLength(1);
    });
  });

  describe("storeListSessionsByEnvironment", () => {
    test("filters by environment", () => {
      const env = storeCreateEnvironment({ secret: "s" });
      storeCreateSession({ environmentId: env.id });
      storeCreateSession({});
      expect(storeListSessionsByEnvironment(env.id)).toHaveLength(1);
    });
  });

  describe("storeDeleteSession", () => {
    test("deletes existing session", () => {
      const session = storeCreateSession({});
      expect(storeDeleteSession(session.id)).toBe(true);
      expect(storeGetSession(session.id)).toBeUndefined();
    });

    test("returns false for non-existent session", () => {
      expect(storeDeleteSession("nope")).toBe(false);
    });
  });

  // ---------- Session Ownership ----------

  describe("storeBindSession / storeIsSessionOwner", () => {
    test("binds and checks ownership", () => {
      const session = storeCreateSession({});
      storeBindSession(session.id, "uuid-1");
      expect(storeIsSessionOwner(session.id, "uuid-1")).toBe(true);
      expect(storeIsSessionOwner(session.id, "uuid-2")).toBe(false);
    });

    test("unbound session has no owner", () => {
      const session = storeCreateSession({});
      expect(storeIsSessionOwner(session.id, "uuid-1")).toBe(false);
    });

    test("multiple owners per session", () => {
      const session = storeCreateSession({});
      storeBindSession(session.id, "uuid-1");
      storeBindSession(session.id, "uuid-2");
      expect(storeIsSessionOwner(session.id, "uuid-1")).toBe(true);
      expect(storeIsSessionOwner(session.id, "uuid-2")).toBe(true);
    });
  });

  describe("storeListSessionsByOwnerUuid", () => {
    test("returns sessions owned by uuid", () => {
      const s1 = storeCreateSession({});
      const s2 = storeCreateSession({});
      storeBindSession(s1.id, "uuid-1");
      storeBindSession(s2.id, "uuid-1");
      const owned = storeListSessionsByOwnerUuid("uuid-1");
      expect(owned).toHaveLength(2);
    });

    test("returns empty for unknown uuid", () => {
      expect(storeListSessionsByOwnerUuid("nope")).toHaveLength(0);
    });

    test("excludes deleted sessions", () => {
      const s1 = storeCreateSession({});
      storeBindSession(s1.id, "uuid-1");
      storeDeleteSession(s1.id);
      expect(storeListSessionsByOwnerUuid("uuid-1")).toHaveLength(0);
    });
  });

  // ---------- Work Items ----------

  describe("storeCreateWorkItem", () => {
    test("creates work item with defaults", () => {
      const item = storeCreateWorkItem({
        environmentId: "env1",
        sessionId: "ses1",
        secret: "sec1",
      });
      expect(item.id).toMatch(/^work_/);
      expect(item.environmentId).toBe("env1");
      expect(item.sessionId).toBe("ses1");
      expect(item.state).toBe("pending");
      expect(item.secret).toBe("sec1");
    });
  });

  describe("storeGetWorkItem", () => {
    test("returns undefined for non-existent", () => {
      expect(storeGetWorkItem("nope")).toBeUndefined();
    });

    test("returns created work item", () => {
      const item = storeCreateWorkItem({ environmentId: "env1", sessionId: "ses1", secret: "s" });
      expect(storeGetWorkItem(item.id)).toBe(item);
    });
  });

  describe("storeGetPendingWorkItem", () => {
    test("returns pending work for environment", () => {
      const item = storeCreateWorkItem({ environmentId: "env1", sessionId: "ses1", secret: "s" });
      const found = storeGetPendingWorkItem("env1");
      expect(found?.id).toBe(item.id);
    });

    test("returns undefined when no pending work", () => {
      storeCreateWorkItem({ environmentId: "env1", sessionId: "ses1", secret: "s" });
      expect(storeGetPendingWorkItem("env2")).toBeUndefined();
    });

    test("skips non-pending items", () => {
      const item = storeCreateWorkItem({ environmentId: "env1", sessionId: "ses1", secret: "s" });
      storeUpdateWorkItem(item.id, { state: "dispatched" });
      expect(storeGetPendingWorkItem("env1")).toBeUndefined();
    });
  });

  describe("storeUpdateWorkItem", () => {
    test("updates existing work item", () => {
      const item = storeCreateWorkItem({ environmentId: "env1", sessionId: "ses1", secret: "s" });
      expect(storeUpdateWorkItem(item.id, { state: "acked" })).toBe(true);
      expect(storeGetWorkItem(item.id)?.state).toBe("acked");
    });

    test("returns false for non-existent", () => {
      expect(storeUpdateWorkItem("nope", { state: "acked" })).toBe(false);
    });
  });

  // ---------- storeReset ----------

  describe("storeReset", () => {
    test("clears all data", () => {
      storeCreateUser("alice");
      storeCreateEnvironment({ secret: "s" });
      storeCreateSession({});
      storeCreateWorkItem({ environmentId: "env1", sessionId: "ses1", secret: "s" });

      storeReset();

      expect(storeGetUser("alice")).toBeUndefined();
      expect(storeListActiveEnvironments()).toHaveLength(0);
      expect(storeListSessions()).toHaveLength(0);
      expect(storeGetPendingWorkItem("env1")).toBeUndefined();
    });
  });
});
