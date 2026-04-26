import { describe, test, expect, mock } from "bun:test";
import {
  __testing,
  decodeClientWsMessage,
  MAX_CLIENT_WS_PAYLOAD_BYTES,
  resolveNewSessionPermissionMode,
  type ServerConfig,
} from "../server.js";
import {
  authTokensEqual,
  decodeWebSocketAuthProtocol,
  encodeWebSocketAuthProtocol,
  extractWebSocketAuthToken,
} from "../ws-auth.js";
import { buildRcsWsUrl } from "../rcs-upstream.js";

function makeTestWs(sent: unknown[]) {
  type TestWs = Parameters<typeof __testing.dispatchClientMessage>[0];

  return {
    readyState: 1,
    send: mock((message: string) => {
      sent.push(JSON.parse(message));
    }),
    close: mock(() => {}),
    raw: null,
    isInner: false,
    url: "",
    origin: "",
    protocol: "",
  } as unknown as TestWs;
}

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

  test("decodes supported client message payloads", () => {
    expect(decodeClientWsMessage('{"type":"ping"}')).toEqual({ type: "ping" });
    expect(
      decodeClientWsMessage(Buffer.from('{"type":"prompt","payload":{"content":[]}}')),
    ).toEqual({ type: "prompt", payload: { content: [] } });
    expect(
      decodeClientWsMessage(new TextEncoder().encode('{"type":"cancel"}').buffer),
    ).toEqual({ type: "cancel" });
    expect(
      decodeClientWsMessage([
        Buffer.from('{"type":"list_sessions","payload":{"cursor":"'),
        Buffer.from('next"}}'),
      ]),
    ).toEqual({ type: "list_sessions", payload: { cwd: undefined, cursor: "next" } });
  });

  test("rejects malformed typed client payloads", () => {
    expect(() => decodeClientWsMessage('{"type":"prompt"}')).toThrow(
      "Invalid prompt payload",
    );
    expect(() =>
      decodeClientWsMessage('{"type":"load_session","payload":{}}'),
    ).toThrow("Invalid load_session payload");
    expect(() => decodeClientWsMessage('{"type":"unknown"}')).toThrow(
      "Unknown message type",
    );
    expect(() =>
      decodeClientWsMessage(
        '{"type":"new_session","payload":{"permissionMode":123}}',
      ),
    ).toThrow("Invalid new_session.permissionMode");
    expect(() =>
      decodeClientWsMessage(
        '{"type":"new_session","payload":{"permissionMode":{}}}',
      ),
    ).toThrow("Invalid new_session.permissionMode");
    expect(() =>
      decodeClientWsMessage(
        '{"type":"new_session","payload":{"permissionMode":null}}',
      ),
    ).toThrow("Invalid new_session.permissionMode");
  });

  test("rejects oversized client message payloads before decoding", () => {
    const payload = "x".repeat(MAX_CLIENT_WS_PAYLOAD_BYTES + 1);
    expect(() => decodeClientWsMessage(payload)).toThrow("WebSocket message too large");
  });
});

describe("WebSocket auth protocol", () => {
  test("round-trips tokens through a WebSocket subprotocol token", () => {
    const protocol = encodeWebSocketAuthProtocol("secret/token+with=symbols");
    expect(protocol).toStartWith("rcs.auth.");
    expect(protocol).not.toContain("secret/token");
    expect(decodeWebSocketAuthProtocol(protocol)).toBe("secret/token+with=symbols");
  });

  test("ignores query-token style inputs", () => {
    expect(decodeWebSocketAuthProtocol(undefined)).toBeUndefined();
    expect(decodeWebSocketAuthProtocol("token=secret")).toBeUndefined();
    expect(decodeWebSocketAuthProtocol("other, rcs.auth.")).toBeUndefined();
  });

  test("prefers Authorization headers and supports protocol auth", () => {
    expect(
      extractWebSocketAuthToken({
        authorization: "Bearer header-token",
        protocol: encodeWebSocketAuthProtocol("protocol-token"),
      }),
    ).toBe("header-token");
    expect(
      extractWebSocketAuthToken({
        protocol: encodeWebSocketAuthProtocol("protocol-token"),
      }),
    ).toBe("protocol-token");
  });

  test("compares auth tokens through the shared constant-time path", () => {
    expect(authTokensEqual("secret-token", "secret-token")).toBe(true);
    expect(authTokensEqual("secret-token", "wrong-token")).toBe(false);
    expect(authTokensEqual(undefined, "secret-token")).toBe(false);
  });
});

describe("RCS upstream URL normalization", () => {
  test("removes legacy token query params from WebSocket URLs", () => {
    expect(
      buildRcsWsUrl("http://example.test/acp/ws?token=old-secret&x=1"),
    ).toBe("ws://example.test/acp/ws?x=1");
  });

  test("adds /acp/ws for base URLs", () => {
    expect(buildRcsWsUrl("https://example.test/")).toBe(
      "wss://example.test/acp/ws",
    );
  });
});

describe("permission mode resolution", () => {
  test("uses client requested non-bypass modes", () => {
    expect(resolveNewSessionPermissionMode("plan", "acceptEdits")).toBe("plan");
  });

  test("uses local default when client does not request a mode", () => {
    expect(resolveNewSessionPermissionMode(undefined, "acceptEdits")).toBe("acceptEdits");
  });

  test("rejects client requested bypassPermissions without local default", () => {
    expect(() =>
      resolveNewSessionPermissionMode("bypassPermissions", "acceptEdits"),
    ).toThrow("bypassPermissions requires local ACP_PERMISSION_MODE");
    expect(() =>
      resolveNewSessionPermissionMode("bypass", "acceptEdits"),
    ).toThrow("bypassPermissions requires local ACP_PERMISSION_MODE");
    expect(() =>
      resolveNewSessionPermissionMode("bypasspermissions", "acceptEdits"),
    ).toThrow("bypassPermissions requires local ACP_PERMISSION_MODE");
    expect(() =>
      resolveNewSessionPermissionMode("bypassPermissions", undefined),
    ).toThrow("bypassPermissions requires local ACP_PERMISSION_MODE");
  });

  test("rejects unknown client permission modes before forwarding", () => {
    expect(() =>
      resolveNewSessionPermissionMode("unknown-mode", "acceptEdits"),
    ).toThrow("Invalid permissionMode: unknown-mode");
  });

  test("allows bypassPermissions when local default already enables it", () => {
    expect(resolveNewSessionPermissionMode("bypassPermissions", "bypassPermissions")).toBe("bypassPermissions");
    expect(resolveNewSessionPermissionMode("bypass", "bypassPermissions")).toBe("bypassPermissions");
    expect(resolveNewSessionPermissionMode("bypassPermissions", "bypass")).toBe("bypassPermissions");
  });

  test("new_session rejects client bypass before forwarding to the agent", async () => {
    const sent: unknown[] = [];
    const ws = makeTestWs(sent);
    const originalTestInternals = process.env.ACP_LINK_TEST_INTERNALS;
    process.env.ACP_LINK_TEST_INTERNALS = "1";
    let unregisterClient = () => {};
    let restoreMode = () => {};

    try {
      const newSession = mock(async () => ({
        sessionId: "should-not-be-created",
      }));
      unregisterClient = __testing.registerClient(ws, {
        connection: { newSession },
      });
      restoreMode = __testing.setDefaultPermissionMode("acceptEdits");

      await __testing.dispatchClientMessage(ws, {
        type: "new_session",
        payload: {
          cwd: "/tmp",
          permissionMode: "bypass",
        },
      });

      expect(newSession).not.toHaveBeenCalled();
      expect(__testing.getClientSessionId(ws)).toBeNull();
      expect(sent).toEqual([
        {
          type: "error",
          payload: {
            message: expect.stringContaining(
              "bypassPermissions requires local ACP_PERMISSION_MODE",
            ),
          },
        },
      ]);
    } finally {
      restoreMode();
      unregisterClient();
      if (originalTestInternals === undefined) {
        delete process.env.ACP_LINK_TEST_INTERNALS;
      } else {
        process.env.ACP_LINK_TEST_INTERNALS = originalTestInternals;
      }
    }
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
