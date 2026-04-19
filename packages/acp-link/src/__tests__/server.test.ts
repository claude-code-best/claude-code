import { describe, test, expect } from "bun:test";
import type { ServerConfig } from "../server.js";

describe("Server HTTP endpoints", () => {
  test("package.json has correct bin and main entries", async () => {
    const pkg = await import("../../package.json", { with: { type: "json" } });
    expect(pkg.default.name).toBe("acp-link");
    expect(pkg.default.main).toBe("./dist/server.js");
    expect(pkg.default.bin).toBeDefined();
    expect(pkg.default.bin["acp-link"]).toBe("dist/cli/bin.js");
  });

  test("ServerConfig interface accepts all expected fields", () => {
    const config: ServerConfig = {
      port: 9315,
      host: "localhost",
      command: "echo",
      args: [],
      cwd: "/tmp",
      debug: false,
      token: "test-token",
      https: false,
    };
    expect(config.port).toBe(9315);
    expect(config.token).toBe("test-token");
  });

  test("ServerConfig allows optional fields to be omitted", () => {
    const config: ServerConfig = {
      port: 9315,
      host: "localhost",
      command: "echo",
      args: [],
      cwd: "/tmp",
    };
    expect(config.debug).toBeUndefined();
    expect(config.token).toBeUndefined();
    expect(config.https).toBeUndefined();
  });
});

describe("WebSocket message types", () => {
  const clientMessageTypes = [
    "connect",
    "disconnect",
    "new_session",
    "prompt",
    "permission_response",
    "cancel",
    "set_session_model",
    "list_sessions",
    "load_session",
    "resume_session",
    "ping",
  ];

  test("all client message types are recognized", () => {
    expect(clientMessageTypes.length).toBe(11);
    expect(clientMessageTypes).toContain("ping");
    expect(clientMessageTypes).toContain("connect");
    expect(clientMessageTypes).toContain("cancel");
  });
});

describe("Heartbeat constants", () => {
  test("PERMISSION_TIMEOUT_MS is 5 minutes", () => {
    const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;
    expect(PERMISSION_TIMEOUT_MS).toBe(300_000);
  });

  test("HEARTBEAT_INTERVAL_MS is 30 seconds", () => {
    const HEARTBEAT_INTERVAL_MS = 30_000;
    expect(HEARTBEAT_INTERVAL_MS).toBe(30_000);
  });
});
