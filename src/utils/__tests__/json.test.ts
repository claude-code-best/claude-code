import { mock, describe, expect, test } from "bun:test";
import { logMock } from "../../../tests/mocks/log";

// Mock log.ts to cut the heavy dependency chain (log.ts → bootstrap/state.ts → analytics)
mock.module("src/utils/log.ts", logMock);

const { safeParseJSON, safeParseJSONC, parseJSONL, addItemToJSONCArray } =
  await import("../json");

// ─── safeParseJSON ──────────────────────────────────────────────────────

describe("safeParseJSON", () => {
  test("parses valid object", () => {
    expect(safeParseJSON('{"a":1}')).toEqual({ a: 1 });
  });

  test("parses valid array", () => {
    expect(safeParseJSON("[1,2,3]")).toEqual([1, 2, 3]);
  });

  test("parses string value", () => {
    expect(safeParseJSON('"hello"')).toBe("hello");
  });

  test("parses number value", () => {
    expect(safeParseJSON("42")).toBe(42);
  });

  test("parses boolean value", () => {
    expect(safeParseJSON("true")).toBe(true);
  });

  test("parses null value", () => {
    expect(safeParseJSON("null")).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    expect(safeParseJSON("{bad}")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(safeParseJSON("")).toBeNull();
  });

  test("returns null for undefined input", () => {
    expect(safeParseJSON(undefined as any)).toBeNull();
  });

  test("returns null for null input", () => {
    expect(safeParseJSON(null as any)).toBeNull();
  });

  test("handles JSON with BOM", () => {
    expect(safeParseJSON('\uFEFF{"a":1}')).toEqual({ a: 1 });
  });

  test("parses nested objects", () => {
    const input = '{"a":{"b":{"c":1}}}';
    expect(safeParseJSON(input)).toEqual({ a: { b: { c: 1 } } });
  });
});

// ─── safeParseJSONC ─────────────────────────────────────────────────────

describe("safeParseJSONC", () => {
  test("parses standard JSON", () => {
    expect(safeParseJSONC('{"a":1}')).toEqual({ a: 1 });
  });

  test("parses JSON with single-line comments", () => {
    expect(safeParseJSONC('{\n// comment\n"a":1\n}')).toEqual({ a: 1 });
  });

  test("parses JSON with block comments", () => {
    expect(safeParseJSONC('{\n/* comment */\n"a":1\n}')).toEqual({ a: 1 });
  });

  test("parses JSON with trailing commas", () => {
    expect(safeParseJSONC('{"a":1,}')).toEqual({ a: 1 });
  });

  test("returns null for null input", () => {
    expect(safeParseJSONC(null as any)).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(safeParseJSONC("")).toBeNull();
  });
});

// ─── parseJSONL ─────────────────────────────────────────────────────────

describe("parseJSONL", () => {
  test("parses multiple lines", () => {
    const result = parseJSONL('{"a":1}\n{"b":2}');
    expect(result).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test("returns empty array for empty string", () => {
    expect(parseJSONL("")).toEqual([]);
  });

  test("parses single line", () => {
    expect(parseJSONL('{"a":1}')).toEqual([{ a: 1 }]);
  });

  test("accepts Buffer input", () => {
    const buf = Buffer.from('{"x":1}\n{"y":2}');
    const result = parseJSONL(buf as any);
    expect(result).toEqual([{ x: 1 }, { y: 2 }]);
  });

  // NOTE: Skipping malformed-line test — Bun.JSONL.parseChunk hangs
  // indefinitely in its error-recovery loop when encountering bad lines.
});

// ─── addItemToJSONCArray ────────────────────────────────────────────────

describe("addItemToJSONCArray", () => {
  test("appends to existing array", () => {
    const result = addItemToJSONCArray('["a","b"]', "c");
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(["a", "b", "c"]);
  });

  test("appends to empty array", () => {
    const result = addItemToJSONCArray("[]", "item");
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(["item"]);
  });

  test("creates array from empty content", () => {
    const result = addItemToJSONCArray("", "first");
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(["first"]);
  });

  test("handles object item", () => {
    const result = addItemToJSONCArray("[]", { key: "val" });
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([{ key: "val" }]);
  });

  test("wraps item in new array for non-array content", () => {
    const result = addItemToJSONCArray('{"a":1}', "item");
    const parsed = JSON.parse(result);
    expect(parsed).toEqual(["item"]);
  });
});
