import { describe, expect, test } from "bun:test";
import { gt, gte, lt, lte, satisfies, order } from "../semver";

describe("gt", () => {
  test("returns true when a > b", () => {
    expect(gt("2.0.0", "1.0.0")).toBe(true);
  });

  test("returns false when a < b", () => {
    expect(gt("1.0.0", "2.0.0")).toBe(false);
  });

  test("returns false when equal", () => {
    expect(gt("1.0.0", "1.0.0")).toBe(false);
  });

  test("returns false for 0.0.0 vs 0.0.0", () => {
    expect(gt("0.0.0", "0.0.0")).toBe(false);
  });

  test("release is greater than pre-release", () => {
    expect(gt("1.0.0", "1.0.0-alpha")).toBe(true);
  });
});

describe("gte", () => {
  test("returns true when a > b", () => {
    expect(gte("2.0.0", "1.0.0")).toBe(true);
  });

  test("returns true when equal", () => {
    expect(gte("1.0.0", "1.0.0")).toBe(true);
  });

  test("returns false when a < b", () => {
    expect(gte("1.0.0", "2.0.0")).toBe(false);
  });
});

describe("lt", () => {
  test("returns true when a < b", () => {
    expect(lt("1.0.0", "2.0.0")).toBe(true);
  });

  test("returns false when a > b", () => {
    expect(lt("2.0.0", "1.0.0")).toBe(false);
  });

  test("returns false when equal", () => {
    expect(lt("1.0.0", "1.0.0")).toBe(false);
  });
});

describe("lte", () => {
  test("returns true when a < b", () => {
    expect(lte("1.0.0", "2.0.0")).toBe(true);
  });

  test("returns true when equal", () => {
    expect(lte("1.0.0", "1.0.0")).toBe(true);
  });

  test("returns false when a > b", () => {
    expect(lte("2.0.0", "1.0.0")).toBe(false);
  });
});

describe("satisfies", () => {
  test("matches exact version", () => {
    expect(satisfies("1.2.3", "1.2.3")).toBe(true);
  });

  test("matches range", () => {
    expect(satisfies("1.2.3", ">=1.0.0")).toBe(true);
  });

  test("does not match out-of-range version", () => {
    expect(satisfies("0.9.0", ">=1.0.0")).toBe(false);
  });

  test("matches caret range", () => {
    expect(satisfies("1.2.3", "^1.0.0")).toBe(true);
  });

  test("does not match major bump in caret", () => {
    expect(satisfies("2.0.0", "^1.0.0")).toBe(false);
  });

  test("matches tilde range", () => {
    expect(satisfies("1.2.5", "~1.2.3")).toBe(true);
  });

  test("matches wildcard range", () => {
    expect(satisfies("2.0.0", "*")).toBe(true);
  });
});

describe("order", () => {
  test("returns 1 when a > b", () => {
    expect(order("2.0.0", "1.0.0")).toBe(1);
  });

  test("returns -1 when a < b", () => {
    expect(order("1.0.0", "2.0.0")).toBe(-1);
  });

  test("returns 0 when equal", () => {
    expect(order("1.0.0", "1.0.0")).toBe(0);
  });

  test("compares patch versions", () => {
    expect(order("1.0.1", "1.0.0")).toBe(1);
  });
});
