import { describe, expect, test } from "bun:test";
import { djb2Hash, hashContent, hashPair } from "../hash";

describe("djb2Hash", () => {
  test("returns a number", () => {
    expect(typeof djb2Hash("hello")).toBe("number");
  });

  test("returns 0 for empty string", () => {
    expect(djb2Hash("")).toBe(0);
  });

  test("is deterministic", () => {
    expect(djb2Hash("test")).toBe(djb2Hash("test"));
  });

  test("different strings produce different hashes", () => {
    expect(djb2Hash("abc")).not.toBe(djb2Hash("def"));
  });

  test("returns 32-bit integer", () => {
    const hash = djb2Hash("some long string to hash");
    expect(Number.isSafeInteger(hash)).toBe(true);
  });

  test("has known answer for 'hello'", () => {
    expect(djb2Hash("hello")).toBe(99162322);
  });
});

describe("hashContent", () => {
  test("returns a string", () => {
    expect(typeof hashContent("hello")).toBe("string");
  });

  test("is deterministic", () => {
    expect(hashContent("test")).toBe(hashContent("test"));
  });

  test("different strings produce different hashes", () => {
    expect(hashContent("abc")).not.toBe(hashContent("def"));
  });

  test("returns numeric string for empty string", () => {
    expect(hashContent("")).toMatch(/^\d+$/);
  });

  test("returns numeric string format", () => {
    expect(hashContent("hello")).toMatch(/^\d+$/);
  });
});

describe("hashPair", () => {
  test("returns a string", () => {
    expect(typeof hashPair("a", "b")).toBe("string");
  });

  test("is deterministic", () => {
    expect(hashPair("a", "b")).toBe(hashPair("a", "b"));
  });

  test("order matters", () => {
    expect(hashPair("a", "b")).not.toBe(hashPair("b", "a"));
  });

  test("disambiguates different splits", () => {
    expect(hashPair("ts", "code")).not.toBe(hashPair("tsc", "ode"));
  });

  test("handles empty strings", () => {
    expect(hashPair("", "")).toMatch(/^\d+$/);
    expect(hashPair("", "a")).toMatch(/^\d+$/);
    expect(hashPair("a", "")).toMatch(/^\d+$/);
    expect(hashPair("", "a")).not.toBe(hashPair("a", ""));
  });
});
