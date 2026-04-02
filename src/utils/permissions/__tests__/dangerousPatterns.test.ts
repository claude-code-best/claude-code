import { describe, expect, test } from "bun:test";
import {
  CROSS_PLATFORM_CODE_EXEC,
  DANGEROUS_BASH_PATTERNS,
} from "../dangerousPatterns";

describe("CROSS_PLATFORM_CODE_EXEC", () => {
  test("is a non-empty readonly array of strings", () => {
    expect(CROSS_PLATFORM_CODE_EXEC.length).toBeGreaterThan(0);
    for (const p of CROSS_PLATFORM_CODE_EXEC) {
      expect(typeof p).toBe("string");
    }
  });

  test("includes core interpreters", () => {
    expect(CROSS_PLATFORM_CODE_EXEC).toContain("python");
    expect(CROSS_PLATFORM_CODE_EXEC).toContain("node");
    expect(CROSS_PLATFORM_CODE_EXEC).toContain("ruby");
    expect(CROSS_PLATFORM_CODE_EXEC).toContain("perl");
  });

  test("includes package runners", () => {
    expect(CROSS_PLATFORM_CODE_EXEC).toContain("npx");
    expect(CROSS_PLATFORM_CODE_EXEC).toContain("bunx");
  });

  test("includes shells", () => {
    expect(CROSS_PLATFORM_CODE_EXEC).toContain("bash");
    expect(CROSS_PLATFORM_CODE_EXEC).toContain("sh");
  });

  test("has no duplicate entries", () => {
    expect(new Set(CROSS_PLATFORM_CODE_EXEC).size).toBe(
      CROSS_PLATFORM_CODE_EXEC.length
    );
  });

  test("contains expected interpreters", () => {
    const expected = [
      "node",
      "python",
      "python3",
      "ruby",
      "perl",
      "php",
      "lua",
      "deno",
      "npx",
      "bunx",
      "tsx",
    ];
    const set = new Set(CROSS_PLATFORM_CODE_EXEC);
    for (const entry of expected) {
      expect(set.has(entry)).toBe(true);
    }
  });
});

describe("DANGEROUS_BASH_PATTERNS", () => {
  test("includes all cross-platform patterns", () => {
    for (const p of CROSS_PLATFORM_CODE_EXEC) {
      expect(DANGEROUS_BASH_PATTERNS).toContain(p);
    }
  });

  test("includes unix-specific patterns", () => {
    expect(DANGEROUS_BASH_PATTERNS).toContain("zsh");
    expect(DANGEROUS_BASH_PATTERNS).toContain("fish");
    expect(DANGEROUS_BASH_PATTERNS).toContain("eval");
    expect(DANGEROUS_BASH_PATTERNS).toContain("exec");
    expect(DANGEROUS_BASH_PATTERNS).toContain("sudo");
    expect(DANGEROUS_BASH_PATTERNS).toContain("xargs");
    expect(DANGEROUS_BASH_PATTERNS).toContain("env");
  });

  test("all elements are strings", () => {
    for (const p of DANGEROUS_BASH_PATTERNS) {
      expect(typeof p).toBe("string");
    }
  });

  test("has no duplicate entries", () => {
    expect(new Set(DANGEROUS_BASH_PATTERNS).size).toBe(
      DANGEROUS_BASH_PATTERNS.length
    );
  });

  test("empty string does not match any pattern", () => {
    for (const pattern of DANGEROUS_BASH_PATTERNS) {
      expect("".startsWith(pattern)).toBe(false);
    }
  });
});
