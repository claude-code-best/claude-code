import { describe, expect, test } from "bun:test";
import {
  containsPathTraversal,
  expandPath,
  normalizePathForConfigKey,
} from "../path";

// ─── containsPathTraversal ──────────────────────────────────────────────

describe("containsPathTraversal", () => {
  test("detects ../ at start", () => {
    expect(containsPathTraversal("../foo")).toBe(true);
  });

  test("detects ../ in middle", () => {
    expect(containsPathTraversal("foo/../bar")).toBe(true);
  });

  test("detects .. at end", () => {
    expect(containsPathTraversal("foo/..")).toBe(true);
  });

  test("detects standalone ..", () => {
    expect(containsPathTraversal("..")).toBe(true);
  });

  test("detects backslash traversal", () => {
    expect(containsPathTraversal("foo\\..\\bar")).toBe(true);
  });

  test("returns false for normal path", () => {
    expect(containsPathTraversal("foo/bar/baz")).toBe(false);
  });

  test("returns false for single dot", () => {
    expect(containsPathTraversal("./foo")).toBe(false);
  });

  test("returns false for ... in filename", () => {
    expect(containsPathTraversal("foo/...bar")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(containsPathTraversal("")).toBe(false);
  });

  test("returns false for dotdot in filename without separator", () => {
    expect(containsPathTraversal("foo..bar")).toBe(false);
  });

  test("detects backslash traversal foo\\..\\bar", () => {
    expect(containsPathTraversal("foo\\..\\bar")).toBe(true);
  });

  test("detects .. at end of absolute path", () => {
    expect(containsPathTraversal("/path/to/..")).toBe(true);
  });
});

// ─── expandPath ─────────────────────────────────────────────────────────

describe("expandPath", () => {
  test("expands ~/ to home directory", () => {
    const result = expandPath("~/Documents");
    expect(result).not.toContain("~");
    expect(result).toContain("Documents");
  });

  test("expands bare ~ to home directory", () => {
    const result = expandPath("~");
    expect(result).not.toContain("~");
    // Should equal home directory
    const { homedir } = require("os");
    expect(result).toBe(homedir());
  });

  test("passes absolute paths through normalized", () => {
    expect(expandPath("/usr/local/bin")).toBe("/usr/local/bin");
  });

  test("resolves relative path against baseDir", () => {
    expect(expandPath("src", "/project")).toBe("/project/src");
  });

  test("returns baseDir for empty string", () => {
    expect(expandPath("", "/project")).toBe("/project");
  });

  test("returns cwd-based path for empty string without baseDir", () => {
    const result = expandPath("");
    // Should be a valid absolute path (cwd normalized)
    const { isAbsolute } = require("path");
    expect(isAbsolute(result)).toBe(true);
  });
});

// ─── normalizePathForConfigKey ──────────────────────────────────────────

describe("normalizePathForConfigKey", () => {
  test("normalizes forward slashes (no change on POSIX)", () => {
    expect(normalizePathForConfigKey("foo/bar/baz")).toBe("foo/bar/baz");
  });

  test("resolves dot segments", () => {
    expect(normalizePathForConfigKey("foo/./bar")).toBe("foo/bar");
  });

  test("resolves double-dot segments", () => {
    expect(normalizePathForConfigKey("foo/bar/../baz")).toBe("foo/baz");
  });

  test("handles absolute path", () => {
    const result = normalizePathForConfigKey("/Users/test/project");
    expect(result).toBe("/Users/test/project");
  });

  test("converts backslashes to forward slashes", () => {
    const result = normalizePathForConfigKey("foo\\bar\\baz");
    expect(result).toBe("foo/bar/baz");
  });

  test("normalizes mixed separators foo/bar\\baz", () => {
    const result = normalizePathForConfigKey("foo/bar\\baz");
    expect(result).toBe("foo/bar/baz");
  });

  test("normalizes redundant separators foo//bar", () => {
    const result = normalizePathForConfigKey("foo//bar");
    expect(result).toBe("foo/bar");
  });
});
