import { describe, expect, test } from "bun:test";
import { normalizeControlMessageKeys } from "../controlMessageCompat";

describe("normalizeControlMessageKeys", () => {
  // --- basic camelCase to snake_case ---
  test("converts requestId to request_id", () => {
    const obj = { requestId: "123" };
    const result = normalizeControlMessageKeys(obj);
    expect(result).toEqual({ request_id: "123" });
    expect((result as any).requestId).toBeUndefined();
  });

  test("leaves request_id unchanged", () => {
    const obj = { request_id: "123" };
    normalizeControlMessageKeys(obj);
    expect(obj).toEqual({ request_id: "123" });
  });

  // --- both present: snake_case wins ---
  test("keeps snake_case when both requestId and request_id exist", () => {
    const obj = { requestId: "camel", request_id: "snake" };
    const result = normalizeControlMessageKeys(obj) as any;
    expect(result.request_id).toBe("snake");
    // requestId is NOT deleted when request_id already exists
    // because the condition `!('request_id' in record)` prevents the branch
    expect(result.requestId).toBe("camel");
  });

  // --- nested response ---
  test("normalizes nested response.requestId", () => {
    const obj = { response: { requestId: "456" } };
    normalizeControlMessageKeys(obj);
    expect((obj as any).response.request_id).toBe("456");
    expect((obj as any).response.requestId).toBeUndefined();
  });

  test("leaves nested response.request_id unchanged", () => {
    const obj = { response: { request_id: "789" } };
    normalizeControlMessageKeys(obj);
    expect((obj as any).response.request_id).toBe("789");
  });

  test("nested response: snake_case wins when both present", () => {
    const obj = {
      response: { requestId: "camel", request_id: "snake" },
    };
    normalizeControlMessageKeys(obj);
    expect((obj as any).response.request_id).toBe("snake");
    expect((obj as any).response.requestId).toBe("camel");
  });

  // --- non-object inputs ---
  test("returns null as-is", () => {
    expect(normalizeControlMessageKeys(null)).toBeNull();
  });

  test("returns undefined as-is", () => {
    expect(normalizeControlMessageKeys(undefined)).toBeUndefined();
  });

  test("returns string as-is", () => {
    expect(normalizeControlMessageKeys("hello")).toBe("hello");
  });

  test("returns number as-is", () => {
    expect(normalizeControlMessageKeys(42)).toBe(42);
  });

  // --- empty and edge cases ---
  test("empty object is unchanged", () => {
    const obj = {};
    normalizeControlMessageKeys(obj);
    expect(obj).toEqual({});
  });

  test("mutates the original object in place", () => {
    const obj = { requestId: "abc", other: "data" };
    const result = normalizeControlMessageKeys(obj);
    expect(result).toBe(obj); // same reference
    expect(obj).toEqual({ request_id: "abc", other: "data" });
  });

  test("does not affect other keys on the object", () => {
    const obj = { requestId: "123", type: "control_request", payload: {} };
    normalizeControlMessageKeys(obj);
    expect((obj as any).type).toBe("control_request");
    expect((obj as any).payload).toEqual({});
    expect((obj as any).request_id).toBe("123");
  });

  test("handles response being null", () => {
    const obj = { response: null, requestId: "x" };
    normalizeControlMessageKeys(obj);
    expect((obj as any).request_id).toBe("x");
    expect((obj as any).response).toBeNull();
  });

  test("handles response being a non-object (string)", () => {
    const obj = { response: "not-an-object" };
    normalizeControlMessageKeys(obj);
    expect((obj as any).response).toBe("not-an-object");
  });
});
