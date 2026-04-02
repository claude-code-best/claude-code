import { describe, expect, test } from "bun:test";
import {
  partiallySanitizeUnicode,
  recursivelySanitizeUnicode,
} from "../sanitization";

// ─── partiallySanitizeUnicode ───────────────────────────────────────────

describe("partiallySanitizeUnicode", () => {
  test("preserves normal ASCII text", () => {
    expect(partiallySanitizeUnicode("hello world")).toBe("hello world");
  });

  test("preserves CJK characters", () => {
    expect(partiallySanitizeUnicode("你好世界")).toBe("你好世界");
  });

  test("removes zero-width spaces", () => {
    expect(partiallySanitizeUnicode("hello\u200Bworld")).toBe("helloworld");
  });

  test("removes BOM", () => {
    expect(partiallySanitizeUnicode("\uFEFFhello")).toBe("hello");
  });

  test("removes directional formatting", () => {
    expect(partiallySanitizeUnicode("hello\u202Aworld")).toBe("helloworld");
  });

  test("removes private use area characters", () => {
    expect(partiallySanitizeUnicode("hello\uE000world")).toBe("helloworld");
  });

  test("handles empty string", () => {
    expect(partiallySanitizeUnicode("")).toBe("");
  });

  test("handles string with only dangerous characters", () => {
    const result = partiallySanitizeUnicode("\u200B\u200C\u200D\uFEFF");
    expect(result.length).toBeLessThanOrEqual(1); // ZWJ may survive NFKC
  });
});

// ─── recursivelySanitizeUnicode ─────────────────────────────────────────

describe("recursivelySanitizeUnicode", () => {
  test("sanitizes string values", () => {
    expect(recursivelySanitizeUnicode("hello\u200Bworld")).toBe("helloworld");
  });

  test("sanitizes array elements", () => {
    const result = recursivelySanitizeUnicode(["a\u200Bb", "c\uFEFFd"]);
    expect(result).toEqual(["ab", "cd"]);
  });

  test("sanitizes object values recursively", () => {
    const result = recursivelySanitizeUnicode({
      key: "val\u200Bue",
      nested: { inner: "te\uFEFFst" },
    });
    expect(result).toEqual({ key: "value", nested: { inner: "test" } });
  });

  test("preserves numbers", () => {
    expect(recursivelySanitizeUnicode(42)).toBe(42);
  });

  test("preserves booleans", () => {
    expect(recursivelySanitizeUnicode(true)).toBe(true);
  });

  test("preserves null", () => {
    expect(recursivelySanitizeUnicode(null)).toBeNull();
  });
});
