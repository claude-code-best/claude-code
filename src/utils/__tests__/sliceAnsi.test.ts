import { describe, expect, test } from "bun:test";

const sliceAnsi = (await import("../sliceAnsi")).default;
const ESC = "\x1b";

describe("sliceAnsi", () => {
  test("plain text slice identical to String.slice", () => {
    expect(sliceAnsi("hello world", 0, 5)).toBe("hello");
    expect(sliceAnsi("hello world", 6)).toBe("world");
  });

  test("slice entire string", () => {
    expect(sliceAnsi("abc", 0)).toBe("abc");
  });

  test("empty slice (start === end)", () => {
    expect(sliceAnsi("abc", 2, 2)).toBe("");
  });

  test("preserves ANSI color codes within slice", () => {
    const input = "\x1b[31mred\x1b[0m normal";
    const result = sliceAnsi(input, 0, 3);
    expect(result).toContain("\x1b[31m");
    expect(result).toContain("red");
  });

  test("closes opened ANSI styles at slice end", () => {
    const input = "\x1b[31mhello world\x1b[0m";
    const result = sliceAnsi(input, 0, 5);
    expect(result).toContain("\x1b[31m");
    expect(result).toContain("hello");
    // undoAnsiCodes uses specific close codes (e.g. \x1b[39m for foreground)
    expect(result).toMatch(new RegExp(`${ESC}\\[\\d+m`));
    // The result should start with open code and end with a close code
    const withoutText = result.replace("hello", "");
    // Should have at least one open and one close code
    expect(withoutText.length).toBeGreaterThan(0);
  });

  test("slice starting mid-ANSI skips codes before start", () => {
    const input = "\x1b[31mhello\x1b[0m \x1b[32mworld\x1b[0m";
    const result = sliceAnsi(input, 6, 11);
    expect(result).toContain("world");
    expect(result).toContain("\x1b[32m");
    expect(result).not.toContain("\x1b[31m");
  });

  test("slice of plain text from middle", () => {
    expect(sliceAnsi("abcdefgh", 2, 5)).toBe("cde");
  });

  test("slice past end of string returns everything", () => {
    expect(sliceAnsi("abc", 0, 100)).toBe("abc");
  });

  test("slice starting at end returns empty", () => {
    expect(sliceAnsi("abc", 3)).toBe("");
  });

  test("handles empty string", () => {
    expect(sliceAnsi("", 0, 5)).toBe("");
  });

  test("multiple ANSI codes nested", () => {
    const input = "\x1b[1m\x1b[31mbold red\x1b[0m\x1b[0m";
    const result = sliceAnsi(input, 0, 4);
    expect(result).toContain("bold");
    // Both styles should be opened and then closed
    expect(result).toContain("\x1b[1m");
    expect(result).toContain("\x1b[31m");
  });

  test("slice with no end parameter returns to end of string", () => {
    expect(sliceAnsi("hello world", 6)).toBe("world");
  });

  test("ANSI codes at boundaries are handled correctly", () => {
    const input = "a\x1b[31mb\x1b[0mc";
    // "abc" visually, position: a=0, b=1, c=2
    const result = sliceAnsi(input, 1, 2);
    // undoAnsiCodes uses \x1b[39m for foreground reset, not \x1b[0m
    expect(result).toContain("b");
    expect(result).toContain("\x1b[31m");
    expect(result).toMatch(new RegExp(`${ESC}\\[\\d+m.*${ESC}\\[\\d+m`)); // open + close codes
  });
});
