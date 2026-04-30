import { describe, test, expect } from "bun:test";
import { isRequest, isResponse, isNotification } from "../types.js";
import type { JsonRpcRequest, JsonRpcResponse, JsonRpcNotification } from "../types.js";

describe("isRequest", () => {
  test("returns true for a valid JSON-RPC request", () => {
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "test" };
    expect(isRequest(msg)).toBe(true);
  });

  test("returns true for request with params", () => {
    const msg = { jsonrpc: "2.0" as const, id: "abc", method: "test", params: { x: 1 } };
    expect(isRequest(msg)).toBe(true);
  });

  test("returns false for response (no method)", () => {
    const msg: JsonRpcResponse = { jsonrpc: "2.0", id: 1, result: {} };
    expect(isRequest(msg)).toBe(false);
  });

  test("returns false for notification (no id)", () => {
    const msg: JsonRpcNotification = { jsonrpc: "2.0", method: "notify" };
    expect(isRequest(msg)).toBe(false);
  });
});

describe("isResponse", () => {
  test("returns true for a valid JSON-RPC response with result", () => {
    const msg: JsonRpcResponse = { jsonrpc: "2.0", id: 1, result: "ok" };
    expect(isResponse(msg)).toBe(true);
  });

  test("returns true for a valid JSON-RPC error response", () => {
    const msg: JsonRpcResponse = { jsonrpc: "2.0", id: 2, error: { code: -32600, message: "bad" } };
    expect(isResponse(msg)).toBe(true);
  });

  test("returns false for request (has method)", () => {
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "test" };
    expect(isResponse(msg)).toBe(false);
  });

  test("returns false for notification", () => {
    const msg: JsonRpcNotification = { jsonrpc: "2.0", method: "notify" };
    expect(isResponse(msg)).toBe(false);
  });
});

describe("isNotification", () => {
  test("returns true for a valid JSON-RPC notification", () => {
    const msg: JsonRpcNotification = { jsonrpc: "2.0", method: "update" };
    expect(isNotification(msg)).toBe(true);
  });

  test("returns true for notification with params", () => {
    const msg = { jsonrpc: "2.0" as const, method: "progress", params: { pct: 50 } };
    expect(isNotification(msg)).toBe(true);
  });

  test("returns false for request (has id)", () => {
    const msg: JsonRpcRequest = { jsonrpc: "2.0", id: 1, method: "test" };
    expect(isNotification(msg)).toBe(false);
  });

  test("returns false for response (no method)", () => {
    const msg: JsonRpcResponse = { jsonrpc: "2.0", id: 1, result: null };
    expect(isNotification(msg)).toBe(false);
  });
});
