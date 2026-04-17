import { describe, test, expect, beforeEach, mock } from "bun:test";

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

import { storeReset } from "../store";
import { getEventBus, removeEventBus, getAllEventBuses } from "../transport/event-bus";
import {
  ingestBridgeMessage,
  handleWebSocketOpen,
  handleWebSocketMessage,
  handleWebSocketClose,
  closeAllConnections,
} from "../transport/ws-handler";

// Minimal WSContext mock
function createMockWs(readyState = 1) {
  const sent: string[] = [];
  return {
    readyState,
    send: (data: string) => sent.push(data),
    close: (_code?: number, _reason?: string) => {},
    getSentData: () => sent,
  } as any;
}

describe("ws-handler", () => {
  beforeEach(() => {
    storeReset();
    for (const [key] of getAllEventBuses()) {
      removeEventBus(key);
    }
    closeAllConnections();
  });

  describe("ingestBridgeMessage", () => {
    test("ignores keep_alive messages", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", { type: "keep_alive" });
      expect(events).toHaveLength(0);
    });

    test("derives type from message.role for user messages", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", {
        message: { role: "user", content: "hello" },
        uuid: "u1",
      });
      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("user");
      expect((events[0] as any).direction).toBe("inbound");
    });

    test("preserves synthetic flag on inbound user messages", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", {
        message: { role: "user", content: "scheduled job: refresh analytics cache" },
        uuid: "u_synth",
        isSynthetic: true,
      });
      expect(events).toHaveLength(1);
      expect((events[0] as any).payload.isSynthetic).toBe(true);
    });

    test("derives type from message.role for assistant messages", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", {
        message: { role: "assistant", content: [{ type: "text", text: "response" }] },
        uuid: "u2",
      });
      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("assistant");
      const payload = (events[0] as any).payload as Record<string, unknown>;
      expect(payload.content).toBe("response");
    });

    test("derives type from explicit type field", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", { type: "control_request", request_id: "r1", request: { subtype: "interrupt" } });
      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("control_request");
    });

    test("derives result type from subtype/result fields", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", { subtype: "success", uuid: "u3", result: "done" });
      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("result");
    });

    test("derives system type from session_id field", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", { session_id: "s1", init: true });
      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("system");
    });

    test("handles control_response type", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", {
        type: "control_response",
        response: { subtype: "success" },
      });
      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("control_response");
    });

    test("handles partial_assistant type", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", {
        type: "partial_assistant",
        message: { content: "partial..." },
        uuid: "u4",
      });
      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("partial_assistant");
    });

    test("falls back to unknown type", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));
      ingestBridgeMessage("s1", { data: "something" });
      expect(events).toHaveLength(1);
      expect((events[0] as any).type).toBe("unknown");
    });
  });

  describe("handleWebSocketOpen", () => {
    test("subscribes to event bus and replays missed events", () => {
      // Publish some events before WS connects
      const bus = getEventBus("s1");
      bus.publish({ id: "e1", sessionId: "s1", type: "user", payload: { content: "hello" }, direction: "outbound" });
      bus.publish({ id: "e2", sessionId: "s1", type: "assistant", payload: { content: "hi" }, direction: "inbound" });

      const ws = createMockWs();
      handleWebSocketOpen(ws, "s1");

      // Should have replayed the outbound event (only outbound events are forwarded to WS)
      const sent = ws.getSentData();
      expect(sent.length).toBeGreaterThanOrEqual(1);
      // First message should be the outbound user event
      const msg = JSON.parse(sent[0]);
      expect(msg.type).toBe("user");
    });

    test("replays synthetic user metadata back to the bridge", () => {
      const bus = getEventBus("s3");
      bus.publish({
        id: "e1",
        sessionId: "s3",
        type: "user",
        payload: { content: "scheduled job: refresh analytics cache", isSynthetic: true },
        direction: "outbound",
      });

      const ws = createMockWs();
      handleWebSocketOpen(ws, "s3");

      const msg = JSON.parse(ws.getSentData()[0]);
      expect(msg.type).toBe("user");
      expect(msg.isSynthetic).toBe(true);
    });

    test("replaces existing connection for same session", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      handleWebSocketOpen(ws1, "s2");
      handleWebSocketOpen(ws2, "s2");

      // ws2 should be the active connection
      const bus = getEventBus("s2");
      bus.publish({ id: "e1", sessionId: "s2", type: "user", payload: { content: "test" }, direction: "outbound" });
      expect(ws2.getSentData().length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("handleWebSocketMessage", () => {
    test("parses NDJSON and ingests each message", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));

      const ws = createMockWs();
      const data = JSON.stringify({ type: "user", message: { role: "user", content: "hello" } }) + "\n" +
        JSON.stringify({ type: "assistant", message: { role: "assistant", content: "hi" } }) + "\n";
      handleWebSocketMessage(ws, "s1", data);
      expect(events).toHaveLength(2);
    });

    test("ignores malformed JSON lines", () => {
      const bus = getEventBus("s1");
      const events: unknown[] = [];
      bus.subscribe((e) => events.push(e));

      const ws = createMockWs();
      handleWebSocketMessage(ws, "s1", "not json\n");
      expect(events).toHaveLength(0);
    });
  });

  describe("handleWebSocketClose", () => {
    test("cleans up on close", () => {
      const ws = createMockWs();
      handleWebSocketOpen(ws, "s3");
      handleWebSocketClose(ws, "s3", 1000, "done");

      // After close, publishing events should not cause errors
      const bus = getEventBus("s3");
      expect(() =>
        bus.publish({ id: "e1", sessionId: "s3", type: "user", payload: {}, direction: "outbound" })
      ).not.toThrow();
    });
  });

  describe("toSDKMessage (via handleWebSocketOpen outbound delivery)", () => {
    test("converts permission_response with approved=true", () => {
      const bus = getEventBus("pr1");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "pr1");

      bus.publish({
        id: "e1",
        sessionId: "pr1",
        type: "permission_response",
        payload: { approved: true, request_id: "req1" },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("control_response");
      expect(lastMsg.response.subtype).toBe("success");
      expect(lastMsg.response.request_id).toBe("req1");
      expect(lastMsg.response.response.behavior).toBe("allow");
    });

    test("converts permission_response with approved=false", () => {
      const bus = getEventBus("pr2");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "pr2");

      bus.publish({
        id: "e2",
        sessionId: "pr2",
        type: "permission_response",
        payload: { approved: false, request_id: "req2" },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("control_response");
      expect(lastMsg.response.subtype).toBe("error");
      expect(lastMsg.response.error).toBe("Permission denied by user");
      expect(lastMsg.response.response.behavior).toBe("deny");
    });

    test("converts permission_response with existing response object", () => {
      const bus = getEventBus("pr3");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "pr3");

      bus.publish({
        id: "e3",
        sessionId: "pr3",
        type: "control_response",
        payload: { response: { subtype: "success", data: "custom" } },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("control_response");
      expect(lastMsg.response.subtype).toBe("success");
      expect(lastMsg.response.data).toBe("custom");
    });

    test("converts interrupt event", () => {
      const bus = getEventBus("int1");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "int1");

      bus.publish({
        id: "e4",
        sessionId: "int1",
        type: "interrupt",
        payload: { action: "interrupt" },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("control_request");
      expect(lastMsg.request_id).toBe("e4");
      expect(lastMsg.request.subtype).toBe("interrupt");
    });

    test("converts control_request event", () => {
      const bus = getEventBus("cr1");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "cr1");

      bus.publish({
        id: "e5",
        sessionId: "cr1",
        type: "control_request",
        payload: { request_id: "req5", request: { subtype: "permission", tool_name: "Bash" } },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("control_request");
      expect(lastMsg.request_id).toBe("req5");
      expect(lastMsg.request.subtype).toBe("permission");
    });

    test("converts user_message event type", () => {
      const bus = getEventBus("um1");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "um1");

      bus.publish({
        id: "e6",
        sessionId: "um1",
        type: "user_message",
        payload: { content: "hello world" },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("user");
      expect(lastMsg.message.content).toBe("hello world");
    });

    test("preserves payload uuid for outbound user events", () => {
      const bus = getEventBus("um2");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "um2");

      bus.publish({
        id: "internal-event-id",
        sessionId: "um2",
        type: "user",
        payload: { uuid: "web-message-uuid", content: "hello from web" },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("user");
      expect(lastMsg.uuid).toBe("web-message-uuid");
      expect(lastMsg.message.content).toBe("hello from web");
    });

    test("converts generic event type", () => {
      const bus = getEventBus("gen1");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "gen1");

      bus.publish({
        id: "e7",
        sessionId: "gen1",
        type: "status",
        payload: { state: "running" },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("status");
      expect(lastMsg.message).toEqual({ state: "running" });
    });

    test("permission_response with updated_input", () => {
      const bus = getEventBus("ui1");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "ui1");

      bus.publish({
        id: "e8",
        sessionId: "ui1",
        type: "permission_response",
        payload: { approved: true, request_id: "req8", updated_input: { cmd: "ls -la" } },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.response.response.behavior).toBe("allow");
      expect(lastMsg.response.response.updatedInput).toEqual({ cmd: "ls -la" });
    });

    test("permission_response with updated_permissions", () => {
      const bus = getEventBus("up1");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "up1");

      const permissions = [{ type: "setMode", mode: "acceptEdits", destination: "session" }];
      bus.publish({
        id: "ep1",
        sessionId: "up1",
        type: "permission_response",
        payload: {
          approved: true,
          request_id: "req-ep1",
          updated_input: { plan: "my plan" },
          updated_permissions: permissions,
        },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("control_response");
      expect(lastMsg.response.subtype).toBe("success");
      expect(lastMsg.response.response.behavior).toBe("allow");
      expect(lastMsg.response.response.updatedInput).toEqual({ plan: "my plan" });
      expect(lastMsg.response.response.updatedPermissions).toEqual(permissions);
    });

    test("permission_response denied with feedback message", () => {
      const bus = getEventBus("dm1");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "dm1");

      bus.publish({
        id: "dm1",
        sessionId: "dm1",
        type: "permission_response",
        payload: {
          approved: false,
          request_id: "req-dm1",
          message: "Please add more tests",
        },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("control_response");
      expect(lastMsg.response.subtype).toBe("error");
      expect(lastMsg.response.response.behavior).toBe("deny");
      expect(lastMsg.response.message).toBe("Please add more tests");
    });

    test("does not forward inbound events to WS", () => {
      const bus = getEventBus("no_in");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "no_in");

      bus.publish({
        id: "e9",
        sessionId: "no_in",
        type: "assistant",
        payload: { content: "reply" },
        direction: "inbound",
      });

      // Only replayed events, no new inbound delivery
      const sent = ws.getSentData();
      // No outbound events were published, so only replay (if any)
      // Since the bus was fresh, no replay
      expect(sent).toHaveLength(0);
    });

    test("control_request falls back to payload when no request field", () => {
      const bus = getEventBus("cf1");
      const ws = createMockWs();
      handleWebSocketOpen(ws, "cf1");

      bus.publish({
        id: "e10",
        sessionId: "cf1",
        type: "control_request",
        payload: { request_id: "req10", subtype: "custom", data: "test" },
        direction: "outbound",
      });

      const sent = ws.getSentData();
      const lastMsg = JSON.parse(sent[sent.length - 1]);
      expect(lastMsg.type).toBe("control_request");
      expect(lastMsg.request_id).toBe("req10");
    });
  });

  describe("closeAllConnections", () => {
    test("closes all active connections", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      handleWebSocketOpen(ws1, "s1");
      handleWebSocketOpen(ws2, "s2");
      closeAllConnections();
      // No errors thrown
    });

    test("no-op when no connections", () => {
      expect(() => closeAllConnections()).not.toThrow();
    });
  });
});
