import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock config before imports
const mockConfig = {
  port: 3000,
  host: "0.0.0.0",
  apiKeys: ["test-api-key"],
  baseUrl: "http://localhost:3000",
  pollTimeout: 1, // Short timeout for tests
  heartbeatInterval: 20,
  jwtExpiresIn: 3600,
  disconnectTimeout: 300,
  webCorsOrigins: [],
  wsIdleTimeout: 30,
  wsKeepaliveInterval: 20,
};

mock.module("../config", () => ({
  config: mockConfig,
  getBaseUrl: () => "http://localhost:3000",
}));

import { storeReset, storeCreateEnvironment, storeCreateSession, storeGetWorkItem, storeGetPendingWorkItem } from "../store";
import {
  createWorkItem,
  pollWork,
  ackWork,
  stopWork,
  heartbeatWork,
  reconnectWorkForEnvironment,
} from "../services/work-dispatch";

describe("Work Dispatch", () => {
  let envId: string;
  let sessionId: string;

  beforeEach(() => {
    storeReset();
    const env = storeCreateEnvironment({ secret: "s" });
    envId = env.id;
    const session = storeCreateSession({ environmentId: envId });
    sessionId = session.id;
  });

  describe("createWorkItem", () => {
    test("creates work item for active environment", async () => {
      const workId = await createWorkItem(envId, sessionId);
      expect(workId).toMatch(/^work_/);
      const item = storeGetWorkItem(workId);
      expect(item?.state).toBe("pending");
      expect(item?.sessionId).toBe(sessionId);
    });

    test("throws for non-existent environment", async () => {
      await expect(createWorkItem("env_no", sessionId)).rejects.toThrow("not found");
    });

    test("throws for inactive environment", async () => {
      const inactiveEnv = storeCreateEnvironment({ secret: "s2" });
      // Manually set status to deregistered
      const { storeUpdateEnvironment } = await import("../store");
      storeUpdateEnvironment(inactiveEnv.id, { status: "deregistered" });
      await expect(createWorkItem(inactiveEnv.id, sessionId)).rejects.toThrow("not active");
    });

    test("encodes work secret as base64 JSON", async () => {
      const workId = await createWorkItem(envId, sessionId);
      const item = storeGetWorkItem(workId);
      const decoded = JSON.parse(Buffer.from(item!.secret, "base64url").toString());
      expect(decoded.version).toBe(1);
      expect(decoded.session_ingress_token).toBe("test-api-key");
      expect(decoded.api_base_url).toBe("http://localhost:3000");
    });
  });

  describe("pollWork", () => {
    test("returns null when no work available (timeout)", async () => {
      const result = await pollWork(envId, 0.1);
      expect(result).toBeNull();
    });

    test("returns pending work and marks as dispatched", async () => {
      const workId = await createWorkItem(envId, sessionId);
      const result = await pollWork(envId, 1);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(workId);
      expect(result!.state).toBe("dispatched");
      expect(result!.data.type).toBe("session");
      expect(result!.data.id).toBe(sessionId);
      // Work should no longer be pending
      expect(storeGetPendingWorkItem(envId)).toBeUndefined();
    });

    test("does not return work for different environment", async () => {
      const env2 = storeCreateEnvironment({ secret: "s2" });
      await createWorkItem(envId, sessionId);
      const result = await pollWork(env2.id, 0.1);
      expect(result).toBeNull();
    });
  });

  describe("ackWork", () => {
    test("marks work as acked", async () => {
      const workId = await createWorkItem(envId, sessionId);
      ackWork(workId);
      expect(storeGetWorkItem(workId)?.state).toBe("acked");
    });
  });

  describe("stopWork", () => {
    test("marks work as completed", async () => {
      const workId = await createWorkItem(envId, sessionId);
      stopWork(workId);
      expect(storeGetWorkItem(workId)?.state).toBe("completed");
    });
  });

  describe("heartbeatWork", () => {
    test("extends lease and returns heartbeat info", async () => {
      const workId = await createWorkItem(envId, sessionId);
      const result = heartbeatWork(workId);
      expect(result.lease_extended).toBe(true);
      expect(result.ttl_seconds).toBe(40); // heartbeatInterval * 2
      expect(result.last_heartbeat).toBeTruthy();
    });

    test("returns default state for non-existent work", async () => {
      const result = heartbeatWork("work_no");
      expect(result.state).toBe("acked");
    });
  });

  describe("reconnectWorkForEnvironment", () => {
    test("creates work items for idle sessions in environment", async () => {
      // Create another idle session
      storeCreateSession({ environmentId: envId });
      const workIds = await reconnectWorkForEnvironment(envId);
      expect(workIds).toHaveLength(2);
      for (const id of workIds) {
        expect(storeGetWorkItem(id)?.state).toBe("pending");
      }
    });

    test("skips non-idle sessions", async () => {
      const activeSession = storeCreateSession({ environmentId: envId });
      const { storeUpdateSession } = await import("../store");
      storeUpdateSession(activeSession.id, { status: "active" });
      const workIds = await reconnectWorkForEnvironment(envId);
      // Only the original idle session should get work
      expect(workIds).toHaveLength(1);
    });

    test("returns empty for environment with no sessions", async () => {
      const emptyEnv = storeCreateEnvironment({ secret: "s_empty" });
      const workIds = await reconnectWorkForEnvironment(emptyEnv.id);
      expect(workIds).toHaveLength(0);
    });
  });
});
